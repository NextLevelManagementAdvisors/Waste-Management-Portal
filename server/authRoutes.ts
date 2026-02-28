import { type Express, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import session from 'express-session';
import { storage, type DbUser, type DbProperty } from './storage';
import { pool } from './db';
import { requireAuth } from './middleware';
import { getUncachableStripeClient } from './stripeClient';
import { sendEmail } from './gmailClient';
import * as optimoRoute from './optimoRouteClient';
import { sendMissedPickupConfirmation, sendServiceUpdate } from './notificationService';
import { findOptimalPickupDay } from './pickupDayOptimizer';
import { activatePendingSelections } from './activateSelections';
import { runFeasibilityAndApprove } from './feasibilityCheck';
import { geocodeAddress, findNearestZone } from './routeSuggestionService';
import { notifyNewAddressReview } from './slackNotifier';
import { specialPickupUpload } from './uploadMiddleware';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;

// In-memory failed login tracking for account lockout
const failedLogins = new Map<string, { count: number; lockedUntil: number }>();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const GOOGLE_DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    googleOAuthState?: string;
    googleOAuthReferralCode?: string;
    googleOAuthRedirect?: string;
    googleOAuthPopup?: boolean;
    impersonatingUserId?: string;
    originalAdminUserId?: string;
    cachedOrphanedSubscriptions?: Array<{ subscriptionId: string; propertyId: string }>;
  }
}

function formatUserForClient(user: DbUser, properties: DbProperty[]) {
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    phone: user.phone,
    email: user.email,
    memberSince: user.member_since,
    autopayEnabled: user.autopay_enabled,
    stripeCustomerId: user.stripe_customer_id,
    isAdmin: false, // Derived from roles in auth/me response
    authProvider: user.auth_provider || 'local',
    properties: properties.map(formatPropertyForClient),
  };
}

function formatPropertyForClient(p: DbProperty) {
  return {
    id: p.id,
    address: p.address,
    serviceType: p.service_type,
    serviceStatus: p.service_status || 'approved',
    inHOA: p.in_hoa,
    communityName: p.community_name || undefined,
    hasGateCode: p.has_gate_code,
    gateCode: p.gate_code || undefined,
    notes: p.notes || undefined,
    notificationPreferences: p.notification_preferences,
    transferStatus: p.transfer_status || undefined,
    pendingOwner: p.pending_owner || undefined,
  };
}

// requireAuth is imported from ./middleware (single source of truth)
export { requireAuth };

async function checkOrphanedSubscriptions(
  stripeCustomerId: string,
  propertyIds: Set<string>
): Promise<Array<{ subscriptionId: string; propertyId: string }>> {
  try {
    const stripe = await getUncachableStripeClient();
    const subs = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 100,
    });
    return subs.data
      .filter((sub: any) => {
        const propId = sub.metadata?.propertyId;
        return propId && !propertyIds.has(propId) &&
          sub.status !== 'canceled' && sub.status !== 'incomplete_expired' && sub.status !== 'incomplete';
      })
      .map((sub: any) => ({
        subscriptionId: sub.id,
        propertyId: sub.metadata.propertyId,
      }));
  } catch (err) {
    console.error('Orphaned subscription check failed (non-blocking):', err);
    return [];
  }
}

async function ensureStripeCustomer(user: DbUser): Promise<DbUser> {
  if (user.stripe_customer_id) return user;
  try {
    const stripe = await getUncachableStripeClient();
    const existing = await stripe.customers.list({ email: user.email, limit: 10 });
    if (existing.data.length > 0) {
      let bestCustomer = existing.data[0];
      if (existing.data.length > 1) {
        for (const cust of existing.data) {
          const subs = await stripe.subscriptions.list({ customer: cust.id, status: 'active', limit: 1 });
          if (subs.data.length > 0) {
            bestCustomer = cust;
            break;
          }
        }
      }
      const stripeCustomerId = bestCustomer.id;
      return await storage.updateUser(user.id, { stripe_customer_id: stripeCustomerId });
    }
  } catch (err) {
    console.error('Warning: Failed to lookup Stripe customer for existing user:', err);
  }
  return user;
}

export function registerAuthRoutes(app: Express) {

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, phone, email, password, referralCode } = req.body;

      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ error: 'First name, last name, email, and password are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const existing = await storage.getUserByEmail(email.toLowerCase());
      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      let stripeCustomerId: string;
      const stripe = await getUncachableStripeClient();
      const existingCustomers = await stripe.customers.list({ email: email.toLowerCase(), limit: 1 });
      if (existingCustomers.data.length > 0) {
        stripeCustomerId = existingCustomers.data[0].id;
        await stripe.customers.update(stripeCustomerId, {
          name: `${firstName} ${lastName}`,
          phone: phone || undefined,
        });
      } else {
        const customer = await stripe.customers.create({
          email: email.toLowerCase(),
          name: `${firstName} ${lastName}`,
          phone: phone || undefined,
        });
        stripeCustomerId = customer.id;
      }

      const user = await storage.createUser({
        firstName,
        lastName,
        phone: phone || '',
        email: email.toLowerCase(),
        passwordHash,
        stripeCustomerId,
      });

      // Assign customer role
      await pool.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'customer') ON CONFLICT DO NOTHING`,
        [user.id]
      );

      // Check for pending invitations and auto-apply additional roles
      const pendingInvites = await pool.query(
        `SELECT id, roles, admin_role FROM invitations
         WHERE LOWER(email) = LOWER($1) AND status = 'pending' AND expires_at > NOW()`,
        [email]
      );
      for (const invite of pendingInvites.rows) {
        for (const role of invite.roles) {
          await pool.query(
            `INSERT INTO user_roles (user_id, role, admin_role)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, role) DO UPDATE SET admin_role = COALESCE($3, user_roles.admin_role)`,
            [user.id, role, role === 'admin' ? invite.admin_role : null]
          );
        }
        await pool.query(
          `UPDATE invitations SET status = 'accepted', accepted_by = $1, accepted_at = NOW() WHERE id = $2`,
          [user.id, invite.id]
        );
      }

      if (referralCode) {
        try {
          const referrerId = await storage.findReferrerByCode(referralCode);
          if (referrerId) {
            await storage.createReferral(referrerId, email.toLowerCase(), `${firstName} ${lastName}`);
          }
        } catch (refErr: any) {
          console.error('Referral processing failed (non-blocking):', refErr.message);
        }
      }

      req.session.userId = user.id;

      req.session.save((err) => {
        if (err) {
          console.error('Session save error during registration:', err);
          return res.status(500).json({ error: 'Registration failed' });
        }
        res.status(201).json({ data: formatUserForClient(user, []) });
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      const message = error?.type?.startsWith('Stripe')
        ? 'Unable to set up billing. Please try again later.'
        : 'Registration failed';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const emailKey = email.toLowerCase();
      const loginAttempt = failedLogins.get(emailKey);
      if (loginAttempt && loginAttempt.lockedUntil > Date.now()) {
        const remainingMinutes = Math.ceil((loginAttempt.lockedUntil - Date.now()) / 60000);
        return res.status(429).json({ error: `Account temporarily locked due to too many failed attempts. Try again in ${remainingMinutes} minute(s).` });
      }

      let user = await storage.getUserByEmail(emailKey);
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        const current = failedLogins.get(emailKey) || { count: 0, lockedUntil: 0 };
        const newCount = current.count + 1;
        failedLogins.set(emailKey, {
          count: newCount,
          lockedUntil: newCount >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0,
        });
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Successful login — clear failed attempt record
      failedLogins.delete(emailKey);

      user = await ensureStripeCustomer(user);

      const properties = await storage.getPropertiesForUser(user.id);

      req.session.userId = user.id;

      req.session.save(async (err) => {
        if (err) {
          console.error('Session save error during login:', err);
          return res.status(500).json({ error: 'Login failed' });
        }
        const clientData: any = formatUserForClient(user, properties);
        const rolesResult = await pool.query(
          'SELECT role FROM user_roles WHERE user_id = $1',
          [user.id]
        );
        clientData.roles = rolesResult.rows.map((r: any) => r.role);
        clientData.isAdmin = clientData.roles.includes('admin');

        // Reconciliation: check for Stripe subscriptions referencing missing properties
        if (user.stripe_customer_id) {
          const propertyIds = new Set(properties.map((p: DbProperty) => p.id));
          const orphaned = await checkOrphanedSubscriptions(user.stripe_customer_id, propertyIds);
          req.session.cachedOrphanedSubscriptions = orphaned;
          if (orphaned.length > 0) {
            clientData.orphanedSubscriptions = orphaned;
            console.warn(`User ${user.email} has ${orphaned.length} orphaned subscription(s):`, orphaned);
          }
        }

        res.json({ data: clientData });
      });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });

  app.get('/api/auth/me', async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      let user = await storage.getUserById(req.session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      user = await ensureStripeCustomer(user);

      const properties = await storage.getPropertiesForUser(user.id);

      const clientData: any = formatUserForClient(user, properties);

      // Include roles
      const rolesResult = await pool.query(
        'SELECT role FROM user_roles WHERE user_id = $1',
        [user.id]
      );
      clientData.roles = rolesResult.rows.map((r: any) => r.role);
      clientData.isAdmin = clientData.roles.includes('admin');

      if (req.session.impersonatingUserId) {
        clientData.impersonating = true;
        const admin = await storage.getUserById(req.session.originalAdminUserId!);
        if (admin) {
          clientData.impersonatedBy = `${admin.first_name} ${admin.last_name}`;
        }
      }

      // Include cached orphaned subscriptions from login check
      const orphaned = req.session.cachedOrphanedSubscriptions;
      if (orphaned && orphaned.length > 0) {
        clientData.orphanedSubscriptions = orphaned;
      }

      res.json({ data: clientData });
    } catch (error: any) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  app.post('/api/properties', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { address, serviceType, inHOA, communityName, hasGateCode, gateCode, notes, notificationPreferences } = req.body;

      if (!address) {
        return res.status(400).json({ error: 'Address is required' });
      }

      // Prevent duplicate properties at the same address (same user)
      const existingProperties = await storage.getPropertiesForUser(userId);
      const normalizedAddress = address.trim().toLowerCase();
      const duplicate = existingProperties.find(
        (p: any) => p.address.trim().toLowerCase() === normalizedAddress
      );
      if (duplicate) {
        return res.status(200).json({ data: formatPropertyForClient(duplicate) });
      }

      // Check for cross-user duplicate (another user already has active service at this address)
      const crossUserDuplicate = await storage.findPropertyByAddress(address, userId);
      if (crossUserDuplicate && crossUserDuplicate.service_status === 'approved') {
        return res.status(409).json({
          error: 'This address already has active service. If you recently moved here, please contact support to transfer the account.',
        });
      }

      const property = await storage.createProperty({
        userId,
        address,
        serviceType: serviceType || 'personal',
        inHoa: inHOA || false,
        communityName,
        hasGateCode: hasGateCode || false,
        gateCode,
        notes,
        notificationPreferences,
      });

      // Auto-assign pickup day if enabled
      if (process.env.PICKUP_AUTO_ASSIGN === 'true') {
        try {
          const result = await findOptimalPickupDay(property.id);
          if (result) {
            const updates: Record<string, any> = {
              zone_id: result.zone_id,
              pickup_day: result.pickup_day,
              pickup_day_source: 'route_optimized',
              pickup_day_detected_at: new Date().toISOString(),
            };
            await storage.updateProperty(property.id, updates);
            Object.assign(property, updates);

            // Auto-approve if address is in a service zone, setting is on, and within thresholds
            if (process.env.PICKUP_AUTO_APPROVE === 'true') {
              const maxMiles = parseFloat(process.env.PICKUP_AUTO_APPROVE_MAX_MILES || '0');
              const maxMinutes = parseFloat(process.env.PICKUP_AUTO_APPROVE_MAX_MINUTES || '0');
              const insertionMinutes = (result.insertion_cost_miles / 25) * 60;

              const withinMiles = maxMiles <= 0 || result.insertion_cost_miles <= maxMiles;
              const withinMinutes = maxMinutes <= 0 || insertionMinutes <= maxMinutes;

              if (withinMiles && withinMinutes) {
                const useFeasibility = process.env.PICKUP_AUTO_APPROVE_USE_FEASIBILITY !== 'false'
                  && !!process.env.OPTIMOROUTE_API_KEY;

                if (useFeasibility) {
                  // Run full OptimoRoute feasibility check in background, targeting the optimal day
                  runFeasibilityAndApprove(property.id, userId, property.address, result.pickup_day).catch(err => {
                    console.error('Background feasibility check failed (non-blocking):', err);
                  });
                } else {
                  // Immediate zone-based approval (no feasibility check)
                  await storage.updateServiceStatus(property.id, 'approved');
                  Object.assign(property, { service_status: 'approved' });
                }
              }
            }
          }
        } catch (e) {
          console.error('Auto pickup day assignment failed (non-blocking):', e);
        }
      }

      // Notify admins via Slack if property is still pending review
      if (property.service_status === 'pending_review') {
        const user = await storage.getUserById(userId);
        notifyNewAddressReview(property.address, `${user?.first_name} ${user?.last_name}`).catch(() => {});
      }

      res.status(201).json({ data: formatPropertyForClient(property) });
    } catch (error: any) {
      console.error('Create property error:', error);
      res.status(500).json({ error: 'Failed to create property' });
    }
  });

  // Pre-creation service area check — lets user know before completing wizard
  app.post('/api/check-service-area', requireAuth, async (req: Request, res: Response) => {
    try {
      const { address } = req.body;
      if (!address) {
        return res.status(400).json({ error: 'Address is required' });
      }

      const coords = await geocodeAddress(address);
      if (!coords) {
        return res.json({ serviceable: true }); // Can't geocode — don't block, let admin review
      }

      const zone = await findNearestZone(coords.lat, coords.lng);
      if (!zone) {
        // No zones configured at all — skip the check
        return res.json({ serviceable: true });
      }

      // Consider serviceable if within 5 miles of any zone
      const serviceable = zone.distance_miles <= 5;
      return res.json({ serviceable, zoneName: zone.zone_name });
    } catch (error: any) {
      console.error('Service area check error:', error);
      // Don't block on errors — default to serviceable
      return res.json({ serviceable: true });
    }
  });

  app.put('/api/properties/:propertyId', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const propertyId = Array.isArray(req.params.propertyId) ? req.params.propertyId[0] : req.params.propertyId;
      const existing = await storage.getPropertyById(propertyId);

      if (!existing || existing.user_id !== userId) {
        return res.status(404).json({ error: 'Property not found' });
      }

      const updateData: any = {};
      const { address, serviceType, inHOA, communityName, hasGateCode, gateCode, notes, notificationPreferences, transferStatus, pendingOwner } = req.body;

      if (address !== undefined) updateData.address = address;
      if (serviceType !== undefined) updateData.service_type = serviceType;
      if (inHOA !== undefined) updateData.in_hoa = inHOA;
      if (communityName !== undefined) updateData.community_name = communityName;
      if (hasGateCode !== undefined) updateData.has_gate_code = hasGateCode;
      if (gateCode !== undefined) updateData.gate_code = gateCode;
      if (notes !== undefined) updateData.notes = notes;
      if (notificationPreferences !== undefined) updateData.notification_preferences = notificationPreferences;
      if (transferStatus !== undefined) updateData.transfer_status = transferStatus;
      if (pendingOwner !== undefined) updateData.pending_owner = pendingOwner;

      const updated = await storage.updateProperty(propertyId, updateData);
      res.json({ data: formatPropertyForClient(updated) });
    } catch (error: any) {
      console.error('Update property error:', error);
      res.status(500).json({ error: 'Failed to update property' });
    }
  });

  // Delete orphaned property (pending_review with no selections only)
  app.delete('/api/properties/:propertyId', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const propertyId = Array.isArray(req.params.propertyId) ? req.params.propertyId[0] : req.params.propertyId;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(404).json({ error: 'Property not found' });
      }
      if (property.service_status !== 'pending_review') {
        return res.status(400).json({ error: 'Only pending properties can be removed' });
      }
      const selections = await storage.getPendingSelections(propertyId);
      if (selections.length > 0) {
        return res.status(400).json({ error: 'Property has pending service selections. Complete setup or contact support.' });
      }
      await storage.deleteProperty(propertyId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete property error:', error);
      res.status(500).json({ error: 'Failed to delete property' });
    }
  });

  // ── Pending Service Selections (deferred billing) ─────────────────

  app.post('/api/properties/:propertyId/pending-selections', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const propertyId = Array.isArray(req.params.propertyId) ? req.params.propertyId[0] : req.params.propertyId;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(404).json({ error: 'Property not found' });
      }
      const { selections } = req.body;
      if (!Array.isArray(selections)) {
        return res.status(400).json({ error: 'selections must be an array' });
      }
      await storage.savePendingSelections(propertyId, userId, selections.map((s: any) => ({
        serviceId: s.serviceId,
        quantity: s.quantity || 1,
        useSticker: !!s.useSticker,
      })));

      // If the property was already auto-approved, activate selections into Stripe subscriptions now
      if (property.service_status === 'approved') {
        activatePendingSelections(propertyId, userId, {
          source: 'deferred_activation',
        }).catch(err => {
          console.error('Deferred activation of pending selections failed (non-blocking):', err);
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Save pending selections error:', error);
      res.status(500).json({ error: 'Failed to save pending selections' });
    }
  });

  app.get('/api/properties/:propertyId/pending-selections', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const propertyId = Array.isArray(req.params.propertyId) ? req.params.propertyId[0] : req.params.propertyId;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(404).json({ error: 'Property not found' });
      }
      const selections = await storage.getPendingSelections(propertyId);
      res.json({ data: selections });
    } catch (error: any) {
      console.error('Get pending selections error:', error);
      res.status(500).json({ error: 'Failed to get pending selections' });
    }
  });

  app.put('/api/auth/profile', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { firstName, lastName, phone, email } = req.body;
      const updateData: any = {};

      if (firstName !== undefined) updateData.first_name = firstName;
      if (lastName !== undefined) updateData.last_name = lastName;
      if (phone !== undefined) updateData.phone = phone;
      if (email !== undefined) {
        const normalizedEmail = email.toLowerCase();
        const existingUser = await storage.getUserByEmail(normalizedEmail);
        if (existingUser && existingUser.id !== userId) {
          return res.status(409).json({ error: 'Email is already in use by another account' });
        }
        updateData.email = normalizedEmail;
      }

      const updatedUser = await storage.updateUser(userId, updateData);
      const properties = await storage.getPropertiesForUser(userId);

      res.json({ data: formatUserForClient(updatedUser, properties) });
    } catch (error: any) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  app.put('/api/auth/password', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { currentPassword, newPassword } = req.body;

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const isOAuthUser = user.auth_provider === 'google';

      if (isOAuthUser) {
        // OAuth user setting password for the first time — no currentPassword required
        const newHash = await bcrypt.hash(newPassword, 12);
        await storage.updateUser(userId, { password_hash: newHash, auth_provider: 'local' });
      } else {
        // Local user changing password — must verify current password
        if (!currentPassword) {
          return res.status(400).json({ error: 'Current password is required' });
        }
        const valid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!valid) {
          return res.status(401).json({ error: 'Current password is incorrect' });
        }
        const newHash = await bcrypt.hash(newPassword, 12);
        await storage.updateUser(userId, { password_hash: newHash });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Update password error:', error);
      res.status(500).json({ error: 'Failed to update password' });
    }
  });

  app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const user = await storage.getUserByEmail(email.toLowerCase());

      res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent.' });

      if (!user) return;

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await storage.createPasswordResetToken(user.id, token, expiresAt);

      const domain = process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const resetUrl = `${protocol}://${domain}/reset-password?token=${token}`;

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2d3748;">Password Reset Request</h2>
          <p style="color: #4a5568;">Hi ${user.first_name},</p>
          <p style="color: #4a5568;">We received a request to reset your password for your Waste Management Portal account. Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #0d9488; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #718096; font-size: 14px;">This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #a0aec0; font-size: 12px;">Waste Management Portal</p>
        </div>
      `;

      try {
        await sendEmail(email.toLowerCase(), 'Reset Your Password - Waste Management Portal', htmlBody);
        console.log(`Password reset email sent to ${email}`);
      } catch (emailErr) {
        console.error('Failed to send password reset email:', emailErr);
      }
    } catch (error: any) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: 'Failed to process reset request' });
    }
  });

  app.get('/api/auth/verify-reset-token', async (req: Request, res: Response) => {
    try {
      const token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Token is required' });
      }

      const resetToken = await storage.getValidResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ error: 'Invalid or expired reset link' });
      }

      res.json({ valid: true });
    } catch (error: any) {
      console.error('Verify reset token error:', error);
      res.status(500).json({ error: 'Failed to verify token' });
    }
  });

  app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const resetToken = await storage.getValidResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ error: 'Invalid or expired reset link' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(resetToken.user_id, { password_hash: newHash });
      await storage.markResetTokenUsed(token);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // Public endpoint for frontends to check if Google SSO is available
  app.get('/api/auth/sso-config', (_req: Request, res: Response) => {
    const hasCredentials = !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    const ssoEnabled = process.env.GOOGLE_SSO_ENABLED;
    // Default enabled if credentials exist and no explicit 'false'
    const googleEnabled = hasCredentials && ssoEnabled !== 'false';
    res.json({ googleEnabled });
  });

  app.get('/api/auth/google', async (req: Request, res: Response) => {
    try {
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return res.status(500).json({ error: 'Google OAuth not configured' });
      }

      if (process.env.GOOGLE_SSO_ENABLED === 'false') {
        return res.status(403).json({ error: 'Google sign-in is currently disabled' });
      }

      const discoveryRes = await fetch(GOOGLE_DISCOVERY_URL);
      if (!discoveryRes.ok) {
        return res.status(500).json({ error: 'Failed to reach Google services' });
      }
      const discovery = await discoveryRes.json() as { authorization_endpoint: string };

      const state = crypto.randomBytes(32).toString('hex');
      req.session.googleOAuthState = state;

      const referralCode = req.query.ref as string | undefined;
      if (referralCode) {
        req.session.googleOAuthReferralCode = referralCode;
      }

      const redirectPath = req.query.redirect as string | undefined;
      if (redirectPath) {
        req.session.googleOAuthRedirect = redirectPath;
      }

      const popupMode = req.query.popup as string | undefined;
      if (popupMode === '1') {
        req.session.googleOAuthPopup = true;
      }

      const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
      const appDomain = process.env.APP_DOMAIN;
      let redirectUri: string;
      if (replitDomain) {
        redirectUri = `https://${replitDomain}/api/auth/google/callback`;
      } else if (appDomain) {
        redirectUri = `${appDomain}/api/auth/google/callback`;
      } else {
        const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:5000';
        const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
        redirectUri = `${protocol}://${host}/api/auth/google/callback`;
      }

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account',
        state,
      });

      const authUrl = `${discovery.authorization_endpoint}?${params.toString()}`;

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error before Google OAuth redirect:', saveErr);
          return res.status(500).json({ error: 'Failed to start Google login' });
        }
        res.redirect(authUrl);
      });
    } catch (error: any) {
      console.error('Google OAuth initiation error:', error);
      res.status(500).json({ error: 'Failed to start Google login' });
    }
  });

  app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;

      if (!code || !state) {
        return res.redirect('/?error=google_auth_failed');
      }

      const expectedState = req.session.googleOAuthState;
      delete req.session.googleOAuthState;

      if (!expectedState || state !== expectedState) {
        return res.redirect('/?error=google_auth_failed');
      }

      const cbClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const cbClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      if (!cbClientId || !cbClientSecret) {
        return res.redirect('/?error=google_not_configured');
      }

      const discoveryRes = await fetch(GOOGLE_DISCOVERY_URL);
      if (!discoveryRes.ok) {
        return res.redirect('/?error=google_auth_failed');
      }
      const discovery = await discoveryRes.json() as { token_endpoint: string; userinfo_endpoint: string };

      const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
      const appDomain = process.env.APP_DOMAIN;
      let redirectUri: string;
      if (replitDomain) {
        redirectUri = `https://${replitDomain}/api/auth/google/callback`;
      } else if (appDomain) {
        redirectUri = `${appDomain}/api/auth/google/callback`;
      } else {
        const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:5000';
        const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
        redirectUri = `${protocol}://${host}/api/auth/google/callback`;
      }

      const tokenRes = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: cbClientId,
          client_secret: cbClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        const errorBody = await tokenRes.text();
        console.error('Token exchange HTTP error:', tokenRes.status, 'body:', errorBody, 'redirect_uri:', redirectUri);
        return res.redirect('/?error=google_token_failed');
      }

      const tokenData = await tokenRes.json() as { access_token?: string; error?: string; error_description?: string };
      if (!tokenData.access_token) {
        console.error('Token exchange failed:', tokenData.error || 'no access_token', 'redirect_uri:', redirectUri);
        return res.redirect('/?error=google_token_failed');
      }

      const userInfoRes = await fetch(discovery.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userInfoRes.ok) {
        console.error('Userinfo fetch HTTP error:', userInfoRes.status);
        return res.redirect('/?error=google_auth_failed');
      }

      const userInfo = await userInfoRes.json() as {
        email?: string;
        email_verified?: boolean;
        given_name?: string;
        family_name?: string;
        name?: string;
      };

      if (!userInfo.email || !userInfo.email_verified) {
        return res.redirect('/?error=google_email_not_verified');
      }

      const email = userInfo.email.toLowerCase();
      let user = await storage.getUserByEmail(email);

      if (!user) {
        const firstName = userInfo.given_name || userInfo.name || 'User';
        const lastName = userInfo.family_name || '';
        const randomPassword = crypto.randomBytes(32).toString('hex');
        const passwordHash = await bcrypt.hash(randomPassword, 12);

        let stripeCustomerId: string | undefined;
        try {
          const stripe = await getUncachableStripeClient();
          const existing = await stripe.customers.list({ email, limit: 1 });
          if (existing.data.length > 0) {
            stripeCustomerId = existing.data[0].id;
            await stripe.customers.update(stripeCustomerId, {
              name: `${firstName} ${lastName}`.trim(),
            });
          } else {
            const customer = await stripe.customers.create({
              email,
              name: `${firstName} ${lastName}`.trim(),
            });
            stripeCustomerId = customer.id;
          }
        } catch (err) {
          console.error('Warning: Failed to find/create Stripe customer during Google signup:', err);
        }

        user = await storage.createUser({
          firstName,
          lastName,
          phone: '',
          email,
          passwordHash,
          stripeCustomerId,
          authProvider: 'google',
        });

        // Assign customer role
        await pool.query(
          `INSERT INTO user_roles (user_id, role) VALUES ($1, 'customer') ON CONFLICT DO NOTHING`,
          [user.id]
        );

        // Check for pending invitations and auto-apply roles
        const pendingInvites = await pool.query(
          `SELECT id, roles, admin_role FROM invitations
           WHERE LOWER(email) = LOWER($1) AND status = 'pending' AND expires_at > NOW()`,
          [email]
        );
        for (const invite of pendingInvites.rows) {
          for (const role of invite.roles) {
            await pool.query(
              `INSERT INTO user_roles (user_id, role, admin_role)
               VALUES ($1, $2, $3)
               ON CONFLICT (user_id, role) DO UPDATE SET admin_role = COALESCE($3, user_roles.admin_role)`,
              [user.id, role, role === 'admin' ? invite.admin_role : null]
            );
          }
          await pool.query(
            `UPDATE invitations SET status = 'accepted', accepted_by = $1, accepted_at = NOW() WHERE id = $2`,
            [user.id, invite.id]
          );
        }

        const savedReferralCode = req.session.googleOAuthReferralCode;
        if (savedReferralCode) {
          try {
            const referrerId = await storage.findReferrerByCode(savedReferralCode);
            if (referrerId) {
              await storage.createReferral(referrerId, email, `${firstName} ${lastName}`);
            }
          } catch (refErr: any) {
            console.error('Referral processing failed during Google signup (non-blocking):', refErr.message);
          }
        }
      }

      const oauthRefCode = req.session.googleOAuthReferralCode;
      delete req.session.googleOAuthReferralCode;

      req.session.userId = user.id;

      let redirectUrl = req.session.googleOAuthRedirect || '/';
      delete req.session.googleOAuthRedirect;

      if (oauthRefCode && redirectUrl.indexOf('ref=') === -1) {
        const separator = redirectUrl.includes('?') ? '&' : '?';
        redirectUrl = `${redirectUrl}${separator}ref=${encodeURIComponent(oauthRefCode)}`;
      }

      const popupMode = req.session.googleOAuthPopup;
      delete req.session.googleOAuthPopup;

      req.session.save((saveErr) => {
        if (saveErr) console.error('Session save error during Google OAuth callback:', saveErr);

        if (popupMode) {
          const appOrigin = process.env.APP_DOMAIN || (() => {
            const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:5000';
            const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
            return `${protocol}://${host}`;
          })();
          res.send(`<!DOCTYPE html><html><body><script>
            if (window.opener) {
              window.opener.postMessage({ type: 'google-oauth-success', redirect: ${JSON.stringify(redirectUrl)} }, ${JSON.stringify(appOrigin)});
            } else {
              try {
                localStorage.setItem('google-oauth-success', JSON.stringify({ redirect: ${JSON.stringify(redirectUrl)}, timestamp: Date.now() }));
              } catch (e) {}
            }
            window.close();
            // If window.close() was blocked, show a simple message
            setTimeout(function() {
              document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:system-ui,sans-serif"><h2 style="color:#333">Login successful!</h2><p style="color:#666">You can close this tab and return to the app.</p></div>';
            }, 300);
          </script></body></html>`);
        } else {
          res.redirect(redirectUrl);
        }
      });
    } catch (error: any) {
      console.error('Google OAuth callback error:', error);
      const popupMode = req.session?.googleOAuthPopup;
      if (popupMode) {
        const appOrigin = process.env.APP_DOMAIN || (() => {
          const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:5000';
          const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
          return `${protocol}://${host}`;
        })();
        res.send(`<!DOCTYPE html><html><body><script>
          if (window.opener) {
            window.opener.postMessage({ type: 'google-oauth-error' }, ${JSON.stringify(appOrigin)});
            window.close();
          } else {
            // Popup lost reference to parent - close and notify user
            window.close();
            alert('Google login failed. Please try again or use email/password login.');
          }
        </script></body></html>`);
      } else {
        res.redirect('/?error=google_auth_failed');
      }
    }
  });

  app.put('/api/auth/autopay', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean' });
      }
      await storage.updateUser(userId, { autopay_enabled: enabled });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update autopay setting' });
    }
  });

  app.get('/api/service-alerts', async (_req: Request, res: Response) => {
    try {
      const alerts = await storage.getActiveServiceAlerts();
      res.json({ data: alerts.map(a => ({ id: a.id, message: a.message, type: a.type })) });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch service alerts' });
    }
  });

  // Photo upload for special pickups
  app.post('/api/upload/special-pickup', requireAuth, (req: Request, res: Response, next: NextFunction) => {
    specialPickupUpload.array('photos', 5)(req, res, (err: any) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10MB)' :
          err.code === 'LIMIT_FILE_COUNT' ? 'Too many files (max 5)' : err.message;
        return res.status(400).json({ error: message });
      }
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }
      const urls = files.map(f => `/uploads/special-pickups/${f.filename}`);
      res.json({ urls });
    });
  });

  // AI cost estimation for special pickups
  app.post('/api/special-pickup/estimate', requireAuth, async (req: Request, res: Response) => {
    try {
      const { description, photoUrls } = req.body;
      if (!description && (!photoUrls || photoUrls.length === 0)) {
        return res.status(400).json({ error: 'Provide a description and/or photos' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: 'AI estimation is not configured' });
      }

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      // Load service catalog for pricing context
      const services = await storage.getSpecialPickupServices();
      const catalogContext = services.map(s => `${s.name}: $${parseFloat(s.price).toFixed(2)} - ${s.description || ''}`).join('\n');

      // Build content parts: text + optional images
      const parts: any[] = [];

      if (photoUrls && photoUrls.length > 0) {
        for (const url of photoUrls.slice(0, 5)) {
          try {
            const filePath = path.resolve(__dirname, '..', url.replace(/^\//, ''));
            const imageData = fs.readFileSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
            parts.push({ inlineData: { data: imageData.toString('base64'), mimeType: mimeMap[ext] || 'image/jpeg' } });
          } catch {
            // Skip unreadable photos
          }
        }
      }

      parts.push({ text: `You are a waste management pricing assistant for a rural waste collection company. Based on the photos and description of items for bulk pickup, estimate the total cost.

Consider: item type and count, approximate size and weight, disposal complexity (hazardous materials cost more), and number of trips needed.

Our service catalog for reference:
${catalogContext}

Customer description: ${description || '(no description provided — estimate from photos only)'}

Respond ONLY with valid JSON, no markdown: {"estimate": <number as dollars>, "reasoning": "<1-2 sentence explanation>"}` });

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts }],
      });

      const text = response.text?.trim() || '';
      // Parse JSON from response, handling possible markdown code fences
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(500).json({ error: 'AI returned an unparseable response' });
      }
      const parsed = JSON.parse(jsonMatch[0]);
      res.json({ estimate: Number(parsed.estimate), reasoning: String(parsed.reasoning || '') });
    } catch (error: any) {
      console.error('AI estimation failed:', error.message);
      res.status(500).json({ error: 'AI estimation failed. Please try again.' });
    }
  });

  app.get('/api/special-pickup-services', async (_req: Request, res: Response) => {
    try {
      const services = await storage.getSpecialPickupServices();
      res.json({ data: services.map(s => ({ id: s.id, name: s.name, description: s.description, price: parseFloat(s.price), iconName: s.icon_name })) });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch special pickup services' });
    }
  });

  app.post('/api/tip-dismissal', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { propertyId, pickupDate } = req.body;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }
      await storage.createTipDismissal(userId, propertyId, pickupDate);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to dismiss tip prompt' });
    }
  });

  app.get('/api/tip-dismissals/:propertyId', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const propertyId = req.params.propertyId as string;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }
      const dates = await storage.getTipDismissalsForProperty(propertyId);
      res.json({ data: dates });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch tip dismissals' });
    }
  });

  app.post('/api/missed-pickup', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { propertyId, date, notes } = req.body;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }
      const report = await storage.createMissedPickupReport({ userId, propertyId, pickupDate: date, notes: notes || '' });
      sendMissedPickupConfirmation(userId, property.address, date).catch(e => console.error('Missed pickup confirmation email failed:', e));
      res.json({ data: report, success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to submit report' });
    }
  });

  app.get('/api/missed-pickups', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const reports = await storage.getMissedPickupReports(userId);
      res.json({ data: reports });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch reports' });
    }
  });

  app.post('/api/special-pickup', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { propertyId, serviceName, servicePrice, date, notes, photos, aiEstimate, aiReasoning } = req.body;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }
      const request = await storage.createSpecialPickupRequest({
        userId, propertyId, serviceName, servicePrice: aiEstimate || servicePrice, pickupDate: date,
        notes, photos, aiEstimate, aiReasoning,
      });

      try {
        const orderNo = `SP-${request.id.substring(0, 8).toUpperCase()}`;
        await optimoRoute.createOrder({
          orderNo,
          type: 'D',
          date,
          address: property.address,
          locationName: `Special Pickup - ${serviceName}`,
          duration: 20,
          notes: `Special pickup: ${serviceName}${notes ? ` | Customer notes: ${notes}` : ''}`,
        });
      } catch (optimoErr: any) {
        console.error('OptimoRoute order creation failed (non-blocking):', optimoErr.message);
      }

      try {
        const user = await storage.getUserById(userId);
        if (user?.stripe_customer_id) {
          const finalPrice = aiEstimate || servicePrice;
          const stripe = await getUncachableStripeClient();
          const invoice = await stripe.invoices.create({
            customer: user.stripe_customer_id,
            auto_advance: true,
            metadata: { propertyId, specialPickupId: request.id },
          });
          await stripe.invoiceItems.create({
            customer: user.stripe_customer_id,
            invoice: invoice.id,
            amount: Math.round(finalPrice * 100),
            currency: 'usd',
            description: `Special Pickup: ${serviceName}`,
          });
          await stripe.invoices.finalizeInvoice(invoice.id);
        }
      } catch (stripeErr: any) {
        console.error('Stripe invoice creation failed (non-blocking):', stripeErr.message);
      }

      sendServiceUpdate(userId, 'Special Pickup Scheduled', `Your ${serviceName} pickup has been scheduled for ${date} at ${property.address}.`).catch(e => console.error('Service update email failed:', e));

      res.json({ data: request });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create special pickup request' });
    }
  });

  app.get('/api/special-pickups', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const requests = await storage.getSpecialPickupRequests(userId);
      res.json({ data: requests });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch special pickup requests' });
    }
  });

  // Customer cancel or reschedule a special pickup
  app.put('/api/special-pickup/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { id } = req.params;
      const { status, cancellationReason, date } = req.body;

      const existing = await storage.getSpecialPickupById(id);
      if (!existing || existing.user_id !== userId) {
        return res.status(403).json({ error: 'Request not found or access denied' });
      }
      if (existing.status !== 'pending' && existing.status !== 'scheduled') {
        return res.status(400).json({ error: 'Only pending or scheduled pickups can be modified' });
      }

      const updates: any = {};

      if (status === 'cancelled') {
        updates.status = 'cancelled';
        updates.cancellationReason = cancellationReason || 'Cancelled by customer';

        // Cancel OptimoRoute order (non-blocking)
        try {
          const orderNo = `SP-${id.substring(0, 8).toUpperCase()}`;
          await optimoRoute.deleteOrder(orderNo);
        } catch (e: any) {
          console.error('OptimoRoute cancel failed (non-blocking):', e.message);
        }

        sendServiceUpdate(userId, 'Pickup Cancelled', `Your ${existing.service_name} pickup at ${existing.address} has been cancelled.`).catch(e => console.error('Cancel notification failed:', e));
      } else if (date) {
        updates.pickupDate = date;

        // Update OptimoRoute order date (non-blocking)
        try {
          const orderNo = `SP-${id.substring(0, 8).toUpperCase()}`;
          await optimoRoute.updateOrder(orderNo, { date });
        } catch (e: any) {
          console.error('OptimoRoute reschedule failed (non-blocking):', e.message);
        }

        sendServiceUpdate(userId, 'Pickup Rescheduled', `Your ${existing.service_name} pickup at ${existing.address} has been rescheduled to ${date}.`).catch(e => console.error('Reschedule notification failed:', e));
      } else {
        return res.status(400).json({ error: 'Provide status=cancelled or a new date' });
      }

      const updated = await storage.updateSpecialPickupRequest(id, updates);
      res.json({ data: updated });
    } catch (error: any) {
      console.error('Special pickup update failed:', error.message);
      res.status(500).json({ error: 'Failed to update pickup request' });
    }
  });

  app.post('/api/collection-intent', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { propertyId, intent, date } = req.body;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }

      // If skipping, remove the OptimoRoute order for this date
      let deletedOrderNo: string | undefined;
      if (intent === 'skip' && property.address) {
        try {
          const orders = await optimoRoute.findOrdersForAddress(property.address, date, date);
          for (const order of orders) {
            await optimoRoute.deleteOrder(order.orderNo, true);
            deletedOrderNo = deletedOrderNo || order.orderNo;
            console.log(`[CollectionIntent] Deleted OptimoRoute order ${order.orderNo} for skip on ${date}`);
          }
        } catch (err) {
          console.error('[CollectionIntent] Failed to delete OptimoRoute order:', err);
        }
      }

      const result = await storage.upsertCollectionIntent({ userId, propertyId, intent, pickupDate: date, optimoOrderNo: deletedOrderNo });
      res.json({ data: result });
    } catch (error: any) {
      console.error('[CollectionIntent] Failed to save:', error.message || error);
      res.status(500).json({ error: 'Failed to save collection intent' });
    }
  });

  app.delete('/api/collection-intent', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { propertyId, date } = req.body;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }

      // Check if the intent was a skip — if so, re-create the OptimoRoute order
      const existing = await storage.getCollectionIntent(propertyId, date);
      if (existing?.intent === 'skip' && property.address) {
        try {
          const user = await storage.getUserById(userId);
          const customerName = user ? `${user.first_name} ${user.last_name}` : '';
          await optimoRoute.createOrder({
            orderNo: `SKIP-UNDO-${propertyId.substring(0, 8).toUpperCase()}-${Date.now()}`,
            type: 'P',
            date,
            address: property.address,
            locationName: customerName,
            duration: 10,
            notes: 'Re-created after customer cancelled skip',
          });
          console.log(`[CollectionIntent] Re-created OptimoRoute order for ${property.address} on ${date}`);
        } catch (err) {
          console.error('[CollectionIntent] Failed to re-create OptimoRoute order:', err);
        }
      }

      await storage.deleteCollectionIntent(propertyId, date);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to remove collection intent' });
    }
  });

  app.get('/api/collection-intent/:propertyId/:date', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const propertyId = req.params.propertyId as string;
      const date = req.params.date as string;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }
      const intent = await storage.getCollectionIntent(propertyId, date);
      res.json({ data: intent });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch collection intent' });
    }
  });

  app.post('/api/driver-feedback', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { propertyId, pickupDate, rating, tipAmount, note } = req.body;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }
      const feedback = await storage.upsertDriverFeedback({ userId, propertyId, pickupDate, rating, tipAmount, note });
      res.json({ data: feedback });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to save feedback' });
    }
  });

  app.get('/api/driver-feedback/:propertyId/list', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const propertyId = req.params.propertyId as string;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }
      const feedbackList = await storage.getDriverFeedbackForProperty(propertyId);
      res.json({ data: feedbackList });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch feedback list' });
    }
  });

  app.get('/api/driver-feedback/:propertyId/:pickupDate', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const propertyId = req.params.propertyId as string;
      const pickupDate = req.params.pickupDate as string;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }
      const feedback = await storage.getDriverFeedback(propertyId, pickupDate);
      res.json({ data: feedback });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch feedback' });
    }
  });

  app.get('/api/referrals', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const userName = `${user.first_name}${user.last_name}`.replace(/\s/g, '');
      const code = await storage.getOrCreateReferralCode(userId, userName);
      const referrals = await storage.getReferralsByUser(userId);
      const totalRewards = await storage.getReferralTotalRewards(userId);
      const host = req.headers.host || 'localhost:5000';
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const shareLink = `${protocol}://${host}/register?ref=${code}`;
      res.json({
        data: {
          referralCode: code,
          shareLink,
          totalRewards,
          referrals: referrals.map((r: any) => ({
            id: r.id,
            name: r.referred_name || r.referred_email,
            status: r.status,
            date: r.created_at,
          })),
        }
      });
    } catch (error: any) {
      console.error('Error fetching referrals:', error);
      res.status(500).json({ error: 'Failed to fetch referral info' });
    }
  });

  app.post('/api/account-transfer', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { propertyId, firstName, lastName, email } = req.body;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await storage.initiateTransfer(propertyId, { firstName, lastName, email }, token, expiresAt);

      const user = await storage.getUserById(userId);
      const senderName = user ? `${user.first_name} ${user.last_name}` : 'A customer';
      const host = req.headers.host || 'localhost:5000';
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const acceptUrl = `${protocol}://${host}/accept-transfer?token=${token}`;

      try {
        await sendEmail(email, `${senderName} wants to transfer waste service to you`, `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Service Transfer Invitation</h2>
            <p><strong>${senderName}</strong> is transferring their waste management service at <strong>${property.address}</strong> to you.</p>
            <p>Click the link below to accept the transfer and set up your account:</p>
            <a href="${acceptUrl}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">Accept Transfer</a>
            <p style="margin-top: 20px; color: #666;">This invitation expires in 7 days.</p>
          </div>
        `);
      } catch (emailErr: any) {
        console.error('Failed to send transfer email (non-blocking):', emailErr.message);
      }

      res.json({ data: { success: true, message: 'Transfer invitation sent.' } });
    } catch (error: any) {
      console.error('Error initiating transfer:', error);
      res.status(500).json({ error: 'Failed to initiate transfer' });
    }
  });

  app.post('/api/account-transfer/remind', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { propertyId } = req.body;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId || property.transfer_status !== 'pending') {
        return res.status(400).json({ error: 'No pending transfer found' });
      }
      const pendingOwner = typeof property.pending_owner === 'string' ? JSON.parse(property.pending_owner) : property.pending_owner;
      if (!pendingOwner?.email) return res.status(400).json({ error: 'No pending owner email' });

      const user = await storage.getUserById(userId);
      const senderName = user ? `${user.first_name} ${user.last_name}` : 'A customer';

      try {
        await sendEmail(pendingOwner.email, `Reminder: ${senderName} wants to transfer waste service to you`, `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Friendly Reminder</h2>
            <p><strong>${senderName}</strong> has invited you to take over the waste management service at <strong>${property.address}</strong>.</p>
            <p>Please log in or register to accept the transfer.</p>
          </div>
        `);
      } catch (emailErr: any) {
        console.error('Failed to send reminder email:', emailErr.message);
      }

      res.json({ data: { success: true } });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to send reminder' });
    }
  });

  app.post('/api/account-transfer/cancel', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { propertyId } = req.body;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId || property.transfer_status !== 'pending') {
        return res.status(400).json({ error: 'No pending transfer found for this property' });
      }
      await storage.cancelTransfer(propertyId);
      res.json({ data: { success: true, message: 'Transfer cancelled successfully' } });
    } catch (error: any) {
      console.error('Error cancelling transfer:', error);
      res.status(500).json({ error: 'Failed to cancel transfer' });
    }
  });

  app.get('/api/account-transfer/:token', async (req: Request, res: Response) => {
    try {
      const property = await storage.getPropertyByTransferToken(req.params.token as string);
      if (!property) return res.status(404).json({ error: 'Transfer invitation not found or expired' });
      const pendingOwner = typeof property.pending_owner === 'string' ? JSON.parse(property.pending_owner) : property.pending_owner;
      res.json({
        data: {
          propertyId: property.id,
          address: property.address,
          serviceType: property.service_type,
          newOwner: pendingOwner,
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch transfer details' });
    }
  });

  app.post('/api/account-transfer/:token/accept', requireAuth, async (req: Request, res: Response) => {
    try {
      const property = await storage.getPropertyByTransferToken(req.params.token as string);
      if (!property) return res.status(404).json({ error: 'Transfer invitation not found or expired' });
      
      const pendingOwner = typeof property.pending_owner === 'string' ? JSON.parse(property.pending_owner) : property.pending_owner;
      const user = await storage.getUserById(req.session.userId!);
      if (pendingOwner?.email && user && user.email.toLowerCase() !== pendingOwner.email.toLowerCase()) {
        return res.status(403).json({ error: `This transfer was sent to ${pendingOwner.email}. Please sign in with that email address to accept it.` });
      }

      const newUserId = req.session.userId!;
      await storage.completeTransfer(property.id, newUserId);
      res.json({ data: { success: true, message: 'Transfer completed successfully' } });
    } catch (error: any) {
      console.error('Error accepting transfer:', error);
      res.status(500).json({ error: 'Failed to accept transfer' });
    }
  });

  app.put('/api/properties/:id/notifications', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const propertyId = req.params.id as string;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }
      const updated = await storage.updateProperty(propertyId, { notification_preferences: req.body });
      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update notification preferences' });
    }
  });
}
