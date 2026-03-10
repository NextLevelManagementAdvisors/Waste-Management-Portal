import { type Express, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { storage, detectZoneConflicts } from './storage';
import { pool } from './db';
import { getUncachableStripeClient } from './stripeClient';
import { encrypt, decrypt, validateRoutingNumber, validateAccountNumber, validateAccountType, maskAccountNumber } from './encryption';
import { notifyWaitlistFlagged, notifyZoneConflict, notifyQualificationsUpdated, notifyNewZoneProposal, notifyContractRenewalRequest, notifyNewProviderApplication } from './slackNotifier';
import { providerUpload } from './uploadMiddleware';
import { formatRouteForClient } from './formatRoute';
import { sendDriverNotification } from './notificationService';
import { broadcastToDriver, broadcastToAdmins, broadcastToUser, broadcastToZoneDrivers } from './websocket';
import { sendEmail } from './gmailClient';
import { geocodeAddress } from './routeSuggestionService';
import convex from '@turf/convex';
import { featureCollection, point } from '@turf/helpers';

/** Run waitlist auto-flagging for a zone that just became active. Fire-and-forget. */
async function triggerWaitlistAutoFlag(zone: any) {
  if (process.env.WAITLIST_AUTO_FLAG_ENABLED === 'false') return;
  try {
    const matched = await storage.getWaitlistedLocationsInZone(zone);
    if (matched.length === 0) return;
    const ids = matched.map((m: any) => m.id);
    await storage.flagWaitlistedLocations(ids, zone.id);
    const driverName = zone.driver_name || 'Unknown';
    notifyWaitlistFlagged(matched.length, zone.name, driverName).catch(() => {});
  } catch (err) {
    console.error('[AutoFlag] Failed to flag waitlisted locations for zone', zone.id, err);
  }
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const GOOGLE_DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';

declare module 'express-session' {
  interface SessionData {
    teamGoogleOAuthState?: string;
  }
}

async function requireDriverAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const userId = req.session.userId;
    const roleCheck = await pool.query(
      `SELECT role FROM user_roles WHERE user_id = $1 AND role IN ('driver', 'provider_owner')`,
      [userId]
    );
    if (roleCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Team portal access required' });
    }
    const roles = roleCheck.rows.map((r: any) => r.role as string);
    res.locals.teamRoles = roles;

    // Load driver profile if the user has the driver role
    if (roles.includes('driver')) {
      const driverProfile = await storage.getDriverProfileByUserId(userId);
      if (!driverProfile) {
        return res.status(404).json({ error: 'Driver profile not found' });
      }
      res.locals.driverProfile = driverProfile;
    }

    // Load provider if the user is a provider owner
    if (roles.includes('provider_owner')) {
      const provider = await storage.getProviderByOwnerUserId(userId);
      res.locals.ownerProvider = provider || null;
    }

    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

/** Middleware: requires a provider membership with an optional permission check */
async function requireProviderAccess(permission?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
      // The provider is always the owner's provider (all provider management endpoints
      // operate on the authenticated user's own provider).
      const provider = await storage.getProviderByOwnerUserId(userId);
      if (!provider) {
        // Also check provider_members for non-owner members
        const memberships = await storage.getMemberProviders(userId);
        if (memberships.length === 0) return res.status(403).json({ error: 'No provider access' });
        // Use the first active approved membership (or a specific one in future)
        const membership = memberships.find((m: any) => m.approval_status === 'approved') || memberships[0];
        res.locals.activeProvider = { id: membership.provider_id, name: membership.provider_name };
        res.locals.memberPermissions = membership.permissions || {};
        res.locals.memberRole = { is_owner_role: membership.is_owner_role, name: membership.role_name };
        if (permission && !membership.permissions?.[permission]) {
          return res.status(403).json({ error: `Permission required: ${permission}` });
        }
        return next();
      }
      // User is the provider owner — full permissions
      res.locals.activeProvider = provider;
      res.locals.memberPermissions = {
        execute_routes: true, dispatch_routes: true, manage_members: true,
        manage_fleet: true, manage_billing: true, view_team_schedule: true,
        view_team_routes: true, view_earnings_report: true,
      };
      res.locals.memberRole = { is_owner_role: true, name: 'Owner' };
      next();
    } catch {
      res.status(500).json({ error: 'Server error' });
    }
  };
}

async function requireOnboarded(req: Request, res: Response, next: NextFunction) {
  try {
    const driverProfile = res.locals.driverProfile;
    if (!driverProfile || driverProfile.onboarding_status !== 'completed') {
      return res.status(403).json({ error: 'Onboarding not completed' });
    }
    // Block suspended or rejected drivers from all team operations
    if (driverProfile.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
    }
    if (driverProfile.status === 'rejected') {
      return res.status(403).json({ error: 'Your application has been rejected.' });
    }
    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export function registerTeamRoutes(app: Express) {

  // ==================== Public (no auth) ====================

  // Public provider info by slug — used by /join/:slug join page
  app.get('/api/public/provider/:slug', async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const result = await pool.query(
        `SELECT id, name, slug, logo_url, description, approval_status
         FROM providers WHERE slug = $1 AND approval_status = 'approved'`,
        [slug]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Provider not found' });
      res.json({ provider: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load provider' });
    }
  });

  app.get('/api/team/auth/google', async (req: Request, res: Response) => {
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
      const intent = req.query.intent === 'provider' ? 'provider' : 'driver';
      req.session.teamGoogleOAuthState = state;
      (req.session as any).teamGoogleOAuthIntent = intent;

      const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
      const appDomain = process.env.APP_DOMAIN;
      let redirectUri: string;
      if (replitDomain) {
        redirectUri = `https://${replitDomain}/api/team/auth/google/callback`;
      } else if (appDomain) {
        redirectUri = `${appDomain}/api/team/auth/google/callback`;
      } else {
        const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:5000';
        const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
        redirectUri = `${protocol}://${host}/api/team/auth/google/callback`;
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

      req.session.save((err) => {
        if (err) {
          console.error('Session save error during Google OAuth initiation:', err);
          return res.status(500).json({ error: 'Session error' });
        }
        res.redirect(`${discovery.authorization_endpoint}?${params.toString()}`);
      });
    } catch (error: any) {
      console.error('Team Google OAuth initiation error:', error);
      res.status(500).json({ error: 'Failed to start Google login' });
    }
  });

  app.get('/api/team/auth/google/callback', async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;

      if (!code || !state) {
        return res.redirect('/driver?error=google_auth_failed');
      }

      const expectedState = req.session.teamGoogleOAuthState;
      const intent: 'provider' | 'driver' = (req.session as any).teamGoogleOAuthIntent === 'provider' ? 'provider' : 'driver';
      delete req.session.teamGoogleOAuthState;
      delete (req.session as any).teamGoogleOAuthIntent;

      if (!expectedState || state !== expectedState) {
        return res.redirect('/driver?error=google_auth_failed');
      }

      const cbClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const cbClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      if (!cbClientId || !cbClientSecret) {
        return res.redirect('/driver?error=google_not_configured');
      }

      const discoveryRes = await fetch(GOOGLE_DISCOVERY_URL);
      if (!discoveryRes.ok) {
        return res.redirect('/driver?error=google_auth_failed');
      }
      const discovery = await discoveryRes.json() as { token_endpoint: string; userinfo_endpoint: string };

      const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
      const appDomain = process.env.APP_DOMAIN;
      let redirectUri: string;
      if (replitDomain) {
        redirectUri = `https://${replitDomain}/api/team/auth/google/callback`;
      } else if (appDomain) {
        redirectUri = `${appDomain}/api/team/auth/google/callback`;
      } else {
        const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:5000';
        const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
        redirectUri = `${protocol}://${host}/api/team/auth/google/callback`;
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
        console.error('Team Google token exchange HTTP error:', tokenRes.status);
        return res.redirect('/driver?error=google_token_failed');
      }

      const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
      if (!tokenData.access_token) {
        console.error('Team Google token exchange failed:', tokenData.error || 'no access_token');
        return res.redirect('/driver?error=google_token_failed');
      }

      const userInfoRes = await fetch(discovery.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userInfoRes.ok) {
        return res.redirect('/driver?error=google_auth_failed');
      }

      const userInfo = await userInfoRes.json() as {
        email?: string;
        email_verified?: boolean;
        given_name?: string;
        family_name?: string;
        name?: string;
      };

      if (!userInfo.email || !userInfo.email_verified) {
        return res.redirect('/driver?error=google_email_not_verified');
      }

      const email = userInfo.email.toLowerCase();
      const firstName = userInfo.given_name || userInfo.name?.split(' ')[0] || 'Driver';
      const lastName = userInfo.family_name || userInfo.name?.split(' ').slice(1).join(' ') || '';
      const fullName = userInfo.name || `${firstName} ${lastName}`.trim();

      // Check if user already exists
      const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
      let userId: string;

      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
        if (intent === 'provider') {
          // Ensure provider record exists for existing users signing up as provider
          const existingProvider = await pool.query(
            `SELECT id FROM providers WHERE owner_user_id = $1 LIMIT 1`,
            [userId]
          );
          if (existingProvider.rows.length === 0) {
            const provider = await storage.createProvider({ name: '', ownerUserId: userId });
            await storage.seedProviderDefaultRoles(provider.id);
            const roles = await storage.getProviderRoles(provider.id);
            const ownerRole = roles.find((r: any) => r.is_owner_role);
            await storage.addProviderMember({
              providerId: provider.id,
              userId,
              roleId: ownerRole?.id,
              employmentType: 'contractor',
            });
            await pool.query(
              `INSERT INTO user_roles (user_id, role) VALUES ($1, 'provider_owner') ON CONFLICT DO NOTHING`,
              [userId]
            );
          }
        } else if (intent === 'driver') {
          // Ensure driver profile and role exist for returning drivers
          const driverProfile = await storage.getDriverProfileByUserId(userId);
          if (!driverProfile) {
            await storage.createDriverProfile({ userId, name: fullName });
          }
          await pool.query(
            `INSERT INTO user_roles (user_id, role) VALUES ($1, 'driver') ON CONFLICT DO NOTHING`,
            [userId]
          );
        }
      } else {
        // Create new user
        const userResult = await pool.query(
          `INSERT INTO users (first_name, last_name, email, phone, password_hash)
           VALUES ($1, $2, $3, '', NULL) RETURNING id`,
          [firstName, lastName, email]
        );
        userId = userResult.rows[0].id;

        if (intent === 'provider') {
          // Create provider with draft status; company name captured in onboarding step 1
          const provider = await storage.createProvider({ name: '', ownerUserId: userId });
          await storage.seedProviderDefaultRoles(provider.id);
          const roles = await storage.getProviderRoles(provider.id);
          const ownerRole = roles.find((r: any) => r.is_owner_role);
          await storage.addProviderMember({
            providerId: provider.id,
            userId,
            roleId: ownerRole?.id,
            employmentType: 'contractor',
          });
          await pool.query(
            `INSERT INTO user_roles (user_id, role) VALUES ($1, 'provider_owner') ON CONFLICT DO NOTHING`,
            [userId]
          );
        } else {
          await storage.createDriverProfile({ userId, name: fullName });
          await pool.query(
            `INSERT INTO user_roles (user_id, role) VALUES ($1, 'driver') ON CONFLICT DO NOTHING`,
            [userId]
          );
          await pool.query(
            `INSERT INTO user_roles (user_id, role) VALUES ($1, 'customer') ON CONFLICT DO NOTHING`,
            [userId]
          );
        }
      }

      req.session.userId = userId;
      // Determine landing portal based on actual provider ownership
      const providerCheck = await pool.query(
        `SELECT id FROM providers WHERE owner_user_id = $1 LIMIT 1`,
        [userId]
      );
      const landingPath = providerCheck.rows.length > 0 ? '/provider' : '/driver';
      req.session.save((err) => {
        if (err) {
          console.error('Session save error during team Google OAuth callback:', err);
          return res.redirect('/driver?error=google_auth_failed');
        }
        res.redirect(landingPath);
      });
    } catch (error: any) {
      console.error('Team Google OAuth callback error:', error);
      res.redirect('/driver?error=google_auth_failed');
    }
  });

  app.post('/api/team/auth/register', async (req: Request, res: Response) => {
    try {
      const { name, full_name, email, phone, password, registrationType, companyName, inviteToken, providerInviteToken } = req.body;
      const driverName = name || full_name;

      if (!driverName || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const existingUser = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]
      );
      if (existingUser.rows.length > 0) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const nameParts = driverName.trim().split(/\s+/);
      const firstName = nameParts[0] || driverName;
      const lastName = nameParts.slice(1).join(' ') || '';

      const userResult = await pool.query(
        `INSERT INTO users (first_name, last_name, email, phone, password_hash)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [firstName, lastName, email.toLowerCase(), phone || '', passwordHash]
      );
      const userId = userResult.rows[0].id;

      // --- Provider registration path ---
      if (registrationType === 'provider') {
        if (!companyName) {
          return res.status(400).json({ error: 'Company name is required for provider registration' });
        }
        const provider = await storage.createProvider({ name: companyName, ownerUserId: userId });

        // Generate unique slug from company name
        const baseSlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        let slug = baseSlug;
        let slugSuffix = 2;
        while (true) {
          const existing = await pool.query(`SELECT id FROM providers WHERE slug = $1`, [slug]);
          if (existing.rowCount === 0) break;
          slug = `${baseSlug}-${slugSuffix++}`;
        }
        await pool.query(`UPDATE providers SET slug = $1 WHERE id = $2`, [slug, provider.id]);
        (provider as any).slug = slug;

        await storage.seedProviderDefaultRoles(provider.id);
        // Get the seeded owner role
        const roles = await storage.getProviderRoles(provider.id);
        const ownerRole = roles.find((r: any) => r.is_owner_role);
        await storage.addProviderMember({
          providerId: provider.id,
          userId,
          roleId: ownerRole?.id,
          employmentType: 'contractor',
        });
        await pool.query(
          `INSERT INTO user_roles (user_id, role) VALUES ($1, 'provider_owner') ON CONFLICT DO NOTHING`,
          [userId]
        );

        // Mark admin-generated provider invite as used (if token was provided)
        if (providerInviteToken) {
          pool.query(
            `UPDATE provider_invites SET used_at = NOW(), used_by = $1
             WHERE token = $2 AND used_at IS NULL AND expires_at > NOW()`,
            [userId, providerInviteToken]
          ).catch((err: any) => console.error('[ProviderInvite] Failed to mark invite used:', err));
        }

        req.session.userId = userId;
        req.session.save((err) => {
          if (err) {
            console.error('Session save error during provider registration:', err);
            return res.status(500).json({ error: 'Registration failed' });
          }
          res.status(201).json({
            isProviderOwner: true,
            provider: { id: provider.id, name: provider.name, slug: (provider as any).slug, approval_status: 'draft', onboarding_step: 1 },
            user: { id: userId, first_name: firstName, last_name: lastName, email: email.toLowerCase() },
          });
        });
        return;
      }

      // --- Driver registration path (existing logic + invite token support) ---
      let invitation: any = null;
      if (inviteToken) {
        invitation = await storage.getValidInvitationByToken(inviteToken);
        // Invalid/expired tokens are non-fatal — register as independent driver
      }

      const driverProfile = await storage.createDriverProfile({ userId, name: driverName });

      await pool.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'driver') ON CONFLICT DO NOTHING`,
        [userId]
      );
      await pool.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'customer') ON CONFLICT DO NOTHING`,
        [userId]
      );

      // If invited to a provider, join it and skip the W9/bank onboarding gate
      if (invitation?.provider_id) {
        await storage.addProviderMember({
          providerId: invitation.provider_id,
          userId,
          roleId: invitation.role_id || undefined,
          employmentType: invitation.employment_type || 'contractor',
        });
        // Mark driver profile as onboarding completed (company handles payment)
        await storage.updateDriver(driverProfile.id, { onboarding_status: 'completed' });
        await storage.acceptInvitation(invitation.id, userId);
      }

      req.session.userId = userId;

      req.session.save((err) => {
        if (err) {
          console.error('Session save error during driver registration:', err);
          return res.status(500).json({ error: 'Registration failed' });
        }
        res.status(201).json({
          data: formatDriverForClient(driverProfile, { first_name: firstName, last_name: lastName, email: email.toLowerCase(), phone: phone || '' }),
        });
      });
    } catch (error: any) {
      console.error('Driver registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post('/api/team/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      // Look up user by email
      const userResult = await pool.query(
        'SELECT id, first_name, last_name, email, phone, password_hash FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
      );
      const user = userResult.rows[0];
      if (!user || !user.password_hash) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Verify driver or provider_owner role
      const roleCheck = await pool.query(
        `SELECT role FROM user_roles WHERE user_id = $1 AND role IN ('driver', 'provider_owner')`,
        [user.id]
      );
      if (roleCheck.rows.length === 0) {
        return res.status(403).json({ error: 'No team account found. Please register first.' });
      }
      const userRoles = roleCheck.rows.map((r: any) => r.role as string);

      const driverProfile = userRoles.includes('driver')
        ? await storage.getDriverProfileByUserId(user.id)
        : null;

      const isProviderOwner = userRoles.includes('provider_owner');
      const provider = isProviderOwner ? await storage.getProviderByOwnerUserId(user.id) : null;
      const memberships = await storage.getMemberProviders(user.id);

      req.session.userId = user.id;

      req.session.save((err) => {
        if (err) {
          console.error('Session save error during driver login:', err);
          return res.status(500).json({ error: 'Login failed' });
        }
        const response: any = { memberships, isProviderOwner };
        if (driverProfile) response.data = formatDriverForClient(driverProfile, user);
        if (provider) response.provider = provider;
        res.json(response);
      });
    } catch (error: any) {
      console.error('Driver login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/team/auth/logout', (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Driver logout error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });

  app.get('/api/team/auth/me', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverProfile = res.locals.driverProfile;
      const ownerProvider = res.locals.ownerProvider;
      const user = await storage.getUserById(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      const rolesResult = await pool.query(
        'SELECT role FROM user_roles WHERE user_id = $1',
        [user.id]
      );
      const userRoles = rolesResult.rows.map((r: any) => r.role as string);
      const isProviderOwner = userRoles.includes('provider_owner');

      const memberships = await storage.getMemberProviders(user.id);

      const clientData: any = {
        roles: userRoles,
        isProviderOwner,
        memberships,
      };
      clientData.data = driverProfile
        ? formatDriverForClient(driverProfile, user)
        : { id: user.id, name: user.full_name, email: user.email, phone: user.phone, isProviderOwner };
      if (isProviderOwner && ownerProvider) {
        clientData.provider = ownerProvider;
      }
      if (req.session.impersonatingUserId) {
        clientData.impersonating = true;
        const admin = await storage.getUserById(req.session.originalAdminUserId!);
        if (admin) {
          clientData.impersonatedBy = `${admin.first_name} ${admin.last_name}`;
        }
      }
      res.json(clientData);
    } catch (error: any) {
      console.error('Get driver error:', error);
      res.status(500).json({ error: 'Failed to get driver' });
    }
  });

  app.post('/api/team/onboarding/w9', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const w9Data = req.body;

      if (!w9Data.legal_name || !w9Data.federal_tax_classification || !w9Data.address || !w9Data.city || !w9Data.state || !w9Data.zip || !w9Data.tin_type || !w9Data.signature_date) {
        return res.status(400).json({ error: 'Required W9 fields are missing' });
      }

      const existingW9 = await storage.getW9ByDriverId(driverId);
      if (existingW9) {
        return res.status(409).json({ error: 'W9 already submitted' });
      }

      const w9 = await storage.createW9(driverId, w9Data);

      const driver = await storage.getDriverById(driverId);
      const newStatus = driver.direct_deposit_completed ? 'completed' : 'deposit_pending';

      await storage.updateDriver(driverId, {
        w9_completed: true,
        onboarding_status: newStatus,
      });

      res.status(201).json({ data: w9 });
    } catch (error: any) {
      console.error('W9 submission error:', error);
      res.status(500).json({ error: 'Failed to submit W9' });
    }
  });

  app.get('/api/team/onboarding/w9', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const w9 = await storage.getW9ByDriverId(res.locals.driverProfile.id);
      if (!w9) return res.json({ data: null });
      // Return safe fields only (no encrypted bank data)
      const { account_number_encrypted, routing_number_encrypted, ...safeW9 } = w9;
      res.json({ data: safeW9 });
    } catch (error: any) {
      console.error('Get W9 error:', error);
      res.status(500).json({ error: 'Failed to get W9 data' });
    }
  });

  app.put('/api/team/onboarding/w9', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const d = req.body;

      if (!d.legal_name || !d.federal_tax_classification || !d.address || !d.city || !d.state || !d.zip || !d.tin_type || !d.signature_date) {
        return res.status(400).json({ error: 'Required W9 fields are missing' });
      }
      if (!d.certification) {
        return res.status(400).json({ error: 'You must certify the information is correct' });
      }
      if (!d.signature_data) {
        return res.status(400).json({ error: 'Signature is required' });
      }

      const existing = await storage.getW9ByDriverId(driverId);
      if (existing) {
        await storage.query(
          `UPDATE driver_w9 SET
            legal_name = $1, business_name = $2, federal_tax_classification = $3,
            exempt_payee_code = $4, fatca_exemption_code = $5,
            address = $6, city = $7, state = $8, zip = $9,
            tin_type = $10, signature_data = $11, signature_date = $12, certified = $13
          WHERE driver_id = $14`,
          [
            d.legal_name, d.business_name || null, d.federal_tax_classification,
            d.exempt_payee_code || null, d.fatca_exemption_code || null,
            d.address, d.city, d.state, d.zip,
            d.tin_type, d.signature_data, d.signature_date, d.certification,
            driverId,
          ]
        );
      } else {
        await storage.createW9(driverId, d);
      }

      await storage.updateDriver(driverId, { w9_completed: true });
      res.json({ success: true });
    } catch (error: any) {
      console.error('W9 update error:', error);
      res.status(500).json({ error: 'Failed to update W9' });
    }
  });

  app.post('/api/team/onboarding/stripe-connect', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const driver = await storage.getDriverById(driverId);

      if (driver.stripe_connect_account_id) {
        const stripe = await getUncachableStripeClient();
        const domain = process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
        const protocol = domain.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${domain}`;

        const accountLink = await stripe.accountLinks.create({
          account: driver.stripe_connect_account_id,
          refresh_url: `${baseUrl}/api/team/onboarding/stripe-connect/refresh`,
          return_url: `${baseUrl}/api/team/onboarding/stripe-connect/return`,
          type: 'account_onboarding',
        });

        return res.json({ data: { url: accountLink.url, accountId: driver.stripe_connect_account_id } });
      }

      const stripe = await getUncachableStripeClient();
      const user = await storage.getUserById(req.session.userId!);

      const account = await stripe.accounts.create({
        type: 'express',
        email: user?.email || undefined,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
        individual: {
          first_name: user?.first_name || driver.name.split(' ')[0],
          last_name: user?.last_name || driver.name.split(' ').slice(1).join(' ') || undefined,
          email: user?.email || undefined,
        },
      });

      await storage.updateDriver(driverId, {
        stripe_connect_account_id: account.id,
      });

      const domain = process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const baseUrl = `${protocol}://${domain}`;

      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${baseUrl}/api/team/onboarding/stripe-connect/refresh`,
        return_url: `${baseUrl}/api/team/onboarding/stripe-connect/return`,
        type: 'account_onboarding',
      });

      res.json({ data: { url: accountLink.url, accountId: account.id } });
    } catch (error: any) {
      console.error('Stripe Connect error:', error);
      res.status(500).json({ error: 'Failed to create Stripe Connect account' });
    }
  });

  app.get('/api/team/onboarding/stripe-connect/status', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const driver = await storage.getDriverById(driverId);

      if (!driver.stripe_connect_account_id) {
        return res.json({ data: { onboarded: false, accountId: null } });
      }

      const stripe = await getUncachableStripeClient();
      const account = await stripe.accounts.retrieve(driver.stripe_connect_account_id);

      const isOnboarded = !!(account.charges_enabled && account.payouts_enabled);

      const updateData: any = {
        stripe_connect_onboarded: isOnboarded,
        direct_deposit_completed: isOnboarded,
      };

      if (isOnboarded && driver.w9_completed) {
        updateData.onboarding_status = 'completed';
      }

      await storage.updateDriver(driverId, updateData);

      res.json({
        data: {
          onboarded: isOnboarded,
          accountId: driver.stripe_connect_account_id,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
        },
      });
    } catch (error: any) {
      console.error('Stripe Connect status error:', error);
      res.status(500).json({ error: 'Failed to check Stripe Connect status' });
    }
  });

  app.get('/api/team/onboarding/stripe-connect/return', async (req: Request, res: Response) => {
    res.redirect('/driver/');
  });

  app.get('/api/team/onboarding/stripe-connect/refresh', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const driver = await storage.getDriverById(driverId);

      if (!driver.stripe_connect_account_id) {
        return res.redirect('/driver/');
      }

      const stripe = await getUncachableStripeClient();
      const domain = process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const baseUrl = `${protocol}://${domain}`;

      const accountLink = await stripe.accountLinks.create({
        account: driver.stripe_connect_account_id,
        refresh_url: `${baseUrl}/api/team/onboarding/stripe-connect/refresh`,
        return_url: `${baseUrl}/api/team/onboarding/stripe-connect/return`,
        type: 'account_onboarding',
      });

      res.redirect(accountLink.url);
    } catch (error: any) {
      console.error('Stripe Connect refresh error:', error);
      res.redirect('/driver/');
    }
  });

  // Manual bank account entry for direct deposit
  app.post('/api/team/onboarding/bank-account', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const { account_holder_name, routing_number, account_number, account_type } = req.body;
      const driverId = res.locals.driverProfile.id;

      // Validation
      if (!account_holder_name || !account_holder_name.trim()) {
        return res.status(400).json({ error: 'Account holder name is required' });
      }

      if (!routing_number || !routing_number.trim()) {
        return res.status(400).json({ error: 'Routing number is required' });
      }

      if (!validateRoutingNumber(routing_number)) {
        return res.status(400).json({ error: 'Invalid routing number. Must be a valid 9-digit ABA routing number.' });
      }

      if (!account_number || !account_number.trim()) {
        return res.status(400).json({ error: 'Account number is required' });
      }

      if (!validateAccountNumber(account_number)) {
        return res.status(400).json({ error: 'Invalid account number. Must be 1-17 digits.' });
      }

      if (!validateAccountType(account_type)) {
        return res.status(400).json({ error: 'Account type must be either "checking" or "savings"' });
      }

      // Get driver and their W9 record
      const driver = await storage.getDriverById(driverId);
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      // Encrypt sensitive data
      const routingEncrypted = encrypt(routing_number.trim());
      const accountEncrypted = encrypt(account_number.trim());

      // Update driver_w9 with bank account info
      const query = `
        UPDATE driver_w9
        SET
          account_holder_name = $1,
          routing_number_encrypted = $2,
          account_number_encrypted = $3,
          account_type = $4
        WHERE driver_id = $5
      `;

      await storage.query(query, [
        account_holder_name.trim(),
        routingEncrypted,
        accountEncrypted,
        account_type,
        driverId,
      ]);

      // Update driver to mark direct deposit as completed
      const updateDriverQuery = `
        UPDATE driver_profiles
        SET
          direct_deposit_completed = true,
          updated_at = NOW()
        WHERE id = $1
      `;

      await storage.query(updateDriverQuery, [driverId]);

      // Check if onboarding is complete (both W9 and direct deposit done)
      const updatedDriver = await storage.getDriverById(driverId);
      if (updatedDriver.w9_completed && updatedDriver.direct_deposit_completed) {
        const completeQuery = `
          UPDATE driver_profiles
          SET onboarding_status = 'completed', updated_at = NOW()
          WHERE id = $1
        `;
        await storage.query(completeQuery, [driverId]);
      }

      // Return masked account number for confirmation
      const maskedAccount = maskAccountNumber(account_number);

      res.json({
        success: true,
        data: {
          message: 'Bank account information submitted successfully',
          masked_account: maskedAccount,
          account_type: account_type,
        },
      });
    } catch (error: any) {
      console.error('Bank account submission error:', error);
      res.status(500).json({ error: 'Failed to submit bank account information' });
    }
  });

  app.get('/api/team/profile/bank-account', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const result = await storage.query(
        `SELECT account_holder_name, account_number_encrypted, account_type FROM driver_w9 WHERE driver_id = $1`,
        [res.locals.driverProfile.id]
      );
      const row = result.rows[0];
      if (!row || !row.account_number_encrypted) {
        return res.json({ has_bank_account: false });
      }
      let maskedAccount: string;
      try {
        maskedAccount = maskAccountNumber(decrypt(row.account_number_encrypted));
      } catch {
        return res.json({ has_bank_account: true, account_holder_name: row.account_holder_name, masked_account: '****', account_type: row.account_type });
      }
      res.json({
        has_bank_account: true,
        account_holder_name: row.account_holder_name,
        masked_account: maskedAccount,
        account_type: row.account_type,
      });
    } catch (error: any) {
      console.error('Get bank account info error:', error);
      res.status(500).json({ error: 'Failed to get bank account info' });
    }
  });

  // Skip direct deposit setup for now - team member can complete later
  app.post('/api/team/onboarding/bank-account/skip', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;

      // Update driver to mark direct deposit as completed (deferred)
      const updateDriverQuery = `
        UPDATE driver_profiles
        SET
          direct_deposit_completed = true,
          onboarding_status = 'completed',
          updated_at = NOW()
        WHERE id = $1
      `;

      await storage.query(updateDriverQuery, [driverId]);

      res.json({
        success: true,
        data: {
          message: 'Onboarding complete! You can set up direct deposit anytime from your profile.',
        },
      });
    } catch (error: any) {
      console.error('Skip direct deposit error:', error);
      res.status(500).json({ error: 'Failed to complete onboarding' });
    }
  });

  // ── Assigned Locations ──

  app.get('/api/team/my-assigned-locations', requireDriverAuth, async (_req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      // Fetch all locations whose zone_id matches one of this driver's active custom zones
      const { rows } = await pool.query(
        `SELECT
           l.id,
           l.address,
           l.collection_day,
           l.collection_frequency,
           l.service_type,
           l.service_status,
           l.latitude,
           l.longitude,
           l.in_hoa,
           l.gate_code,
           l.driver_notes,
           dcz.id   AS zone_id,
           dcz.name AS zone_name,
           u.first_name || ' ' || u.last_name AS customer_name,
           u.email                              AS customer_email,
           u.phone                              AS customer_phone,
           (SELECT json_agg(lr.name)
            FROM location_requirements lr
            WHERE lr.location_id = l.id)        AS requirements
         FROM locations l
         JOIN driver_custom_zones dcz ON dcz.id = l.coverage_zone_id
         JOIN driver_profiles dp ON dp.id = dcz.driver_id
         LEFT JOIN users u ON u.id = l.owner_id
         WHERE dp.id = $1
           AND dcz.status = 'active'
           AND l.service_status = 'approved'
         ORDER BY l.collection_day, l.address`,
        [driverId]
      );
      res.json({
        locations: rows.map((r: any) => ({
          id: r.id,
          address: r.address,
          collectionDay: r.collection_day,
          collectionFrequency: r.collection_frequency,
          serviceType: r.service_type,
          serviceStatus: r.service_status,
          latitude: r.latitude ? Number(r.latitude) : null,
          longitude: r.longitude ? Number(r.longitude) : null,
          inHoa: r.in_hoa,
          gateCode: r.gate_code,
          driverNotes: r.driver_notes,
          zoneId: r.zone_id,
          zoneName: r.zone_name,
          customerName: r.customer_name,
          customerEmail: r.customer_email,
          customerPhone: r.customer_phone,
          requirements: r.requirements || [],
        })),
      });
    } catch (error) {
      console.error('Get assigned locations error:', error);
      res.status(500).json({ error: 'Failed to get assigned locations' });
    }
  });

  // ── Driver Custom Zones ──

  app.get('/api/team/my-custom-zones', requireDriverAuth, async (_req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const zones = await storage.getDriverCustomZones(driverId);
      res.json({ data: zones });
    } catch (error) {
      console.error('Get custom zones error:', error);
      res.status(500).json({ error: 'Failed to get custom zones' });
    }
  });

  app.post('/api/team/my-custom-zones', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { name, zone_type, center_lat, center_lng, radius_miles, polygon_coords, zip_codes, color } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }
      const type = zone_type || 'circle';
      if (type === 'circle') {
        if (center_lat == null || center_lng == null) {
          return res.status(400).json({ error: 'center_lat and center_lng are required for circle zones' });
        }
      } else if (type === 'polygon') {
        if (!polygon_coords || !Array.isArray(polygon_coords) || polygon_coords.length < 3) {
          return res.status(400).json({ error: 'polygon_coords with at least 3 vertices required for polygon zones' });
        }
      } else if (type === 'zip') {
        if (!zip_codes || !Array.isArray(zip_codes) || zip_codes.length === 0) {
          return res.status(400).json({ error: 'zip_codes required for zip zones' });
        }
        if (!polygon_coords || !Array.isArray(polygon_coords) || polygon_coords.length < 3) {
          return res.status(400).json({ error: 'polygon_coords required for zip zones' });
        }
      } else {
        return res.status(400).json({ error: 'zone_type must be circle, polygon, or zip' });
      }
      const approvalRequired = process.env.ZONE_APPROVAL_REQUIRED !== 'false';

      // Conflict check: even when approval is required, auto-approve if no zone overlaps
      let zoneStatus: string;
      let conflicts: string[] = [];
      if (!approvalRequired) {
        zoneStatus = 'active'; // explicitly disabled
      } else {
        conflicts = await detectZoneConflicts(
          { zone_type: type, center_lat: center_lat != null ? Number(center_lat) : null,
            center_lng: center_lng != null ? Number(center_lng) : null,
            radius_miles: radius_miles != null ? Number(radius_miles) : null,
            polygon_coords },
          driverId
        );
        zoneStatus = conflicts.length === 0 ? 'active' : 'pending_approval';
      }

      const zone = await storage.createDriverCustomZone(driverId, {
        name,
        zone_type: type,
        center_lat: center_lat != null ? Number(center_lat) : undefined,
        center_lng: center_lng != null ? Number(center_lng) : undefined,
        radius_miles: radius_miles != null ? Number(radius_miles) : undefined,
        polygon_coords,
        zip_codes,
        color,
        status: zoneStatus,
      });

      if (zoneStatus === 'active') {
        // Auto-approved — trigger waitlist flagging
        const fullZone = await storage.getZoneById(zone.id);
        if (fullZone) triggerWaitlistAutoFlag(fullZone);
      } else if (conflicts.length > 0) {
        // Conflicts found — alert admin
        const dp = res.locals.driverProfile;
        notifyZoneConflict(name, dp.name || dp.email || 'Unknown driver', conflicts.length).catch(() => {});
      }

      res.json({ data: zone, autoApproved: zoneStatus === 'active', conflicts: conflicts.length });
    } catch (error) {
      console.error('Create custom zone error:', error);
      res.status(500).json({ error: 'Failed to create custom zone' });
    }
  });

  app.put('/api/team/my-custom-zones/:id', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { id } = req.params;
      const approvalRequired = process.env.ZONE_APPROVAL_REQUIRED !== 'false';
      const geometryFields = ['center_lat', 'center_lng', 'radius_miles', 'polygon_coords', 'zip_codes'];
      const hasGeometryChange = geometryFields.some(f => req.body[f] !== undefined);

      // If geometry changed and approval is required, reset to pending_approval
      const updates = { ...req.body };
      if (approvalRequired && hasGeometryChange) {
        updates.status = 'pending_approval';
      }

      const zone = await storage.updateDriverCustomZone(id, driverId, updates);
      if (!zone) return res.status(404).json({ error: 'Zone not found' });

      // If auto-approved geometry change, trigger waitlist flagging
      if (!approvalRequired && hasGeometryChange) {
        const fullZone = await storage.getZoneById(zone.id);
        if (fullZone) triggerWaitlistAutoFlag(fullZone);
      }
      res.json({ data: zone });
    } catch (error) {
      console.error('Update custom zone error:', error);
      res.status(500).json({ error: 'Failed to update custom zone' });
    }
  });

  app.delete('/api/team/my-custom-zones/:id', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const deleted = await storage.deleteDriverCustomZone(req.params.id, driverId);
      if (!deleted) return res.status(404).json({ error: 'Zone not found' });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete custom zone error:', error);
      res.status(500).json({ error: 'Failed to delete custom zone' });
    }
  });

  // ── ZIP Boundary Lookup ──

  app.get('/api/team/zip-boundary/:zip', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const { zip } = req.params;
      if (!/^\d{5}(-\d{4})?$/.test(zip)) {
        return res.status(400).json({ error: 'Invalid ZIP code format. Use 5-digit or ZIP+4 (e.g. 22630 or 22630-1234)' });
      }
      const coords = await storage.getZipBoundary(zip);
      if (!coords) return res.status(404).json({ error: 'ZIP boundary not found' });
      const isZipPlus4 = zip.includes('-');
      res.json({
        data: coords,
        zip5: zip.substring(0, 5),
        notice: isZipPlus4 ? 'ZIP+4 boundaries are not available. Showing the 5-digit ZIP boundary. You can edit the polygon to refine.' : null,
      });
    } catch (error) {
      console.error('ZIP boundary lookup error:', error);
      res.status(500).json({ error: 'Failed to look up ZIP boundary' });
    }
  });

  // ── Routes (filtered by driver coverage zones) ──

  app.get('/api/team/routes', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const filters: { startDate?: string; endDate?: string } = {};
      if (req.query.startDate) filters.startDate = req.query.startDate as string;
      if (req.query.endDate) filters.endDate = req.query.endDate as string;

      const customZones = await storage.getDriverCustomZones(driverId);
      const hasZoneSelections = customZones.some((z: any) => z.status === 'active');

      let routes: any[];
      if (hasZoneSelections) {
        routes = await storage.getRoutesInDriverCoverage(driverId, filters);
      } else {
        // No zones set up — show all open/bidding routes + routes assigned to this driver
        routes = await storage.getOpenRoutes(filters);
        const assignedRoutes = await storage.getAllRoutes({ ...filters, status: 'assigned' } as any);
        const myAssigned = assignedRoutes.filter((r: any) => r.assigned_driver_id === driverId);
        const routeIds = new Set(routes.map((r: any) => r.id));
        for (const r of myAssigned) { if (!routeIds.has(r.id)) routes.push(r); }
      }

      const enriched = await Promise.all(routes.map(async (route: any) => {
        try {
          const orders = await storage.getRouteOrders(route.id);
          return { ...route, order_count: orders.length };
        } catch { return { ...route, order_count: 0 }; }
      }));

      res.json({ data: enriched.map(formatRouteForClient), hasZoneSelections });
    } catch (error: any) {
      console.error('Get routes error:', error);
      res.status(500).json({ error: 'Failed to get routes' });
    }
  });

  app.get('/api/team/my-routes', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const myRoutes = await storage.getDriverRoutes(res.locals.driverProfile.id);
      res.json({ data: myRoutes.map(formatRouteForClient) });
    } catch (error: any) {
      console.error('Get my routes error:', error);
      res.status(500).json({ error: 'Failed to get routes' });
    }
  });

  app.get('/api/team/routes/:routeId', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.routeId;
      const route = await storage.getRouteById(routeId);
      if (!route) {
        return res.status(404).json({ error: 'Route not found' });
      }

      const [bids, orders] = await Promise.all([
        storage.getRouteBids(routeId),
        storage.getRouteOrders(routeId),
      ]);

      const camelBids = bids.map((b: any) => ({
        id: b.id,
        routeId: b.route_id,
        driverId: b.driver_id,
        bidAmount: parseFloat(b.bid_amount) || 0,
        message: b.message,
        driverRatingAtBid: b.driver_rating_at_bid != null ? parseFloat(b.driver_rating_at_bid) : null,
        driverName: b.driver_name,
        driverRating: b.driver_rating != null ? parseFloat(b.driver_rating) : null,
        createdAt: b.created_at,
      }));

      // Only expose customer PII (address, name) to the assigned driver or for open/bidding routes
      const driverId = res.locals.driverProfile.id;
      const canSeePII = route.assigned_driver_id === driverId || ['open', 'bidding'].includes(route.status);
      const mappedOrders = orders.map((p: any) => ({
        ...(canSeePII ? { address: p.address, customer_name: p.customer_name } : {}),
        pickup_type: p.pickup_type ?? p.order_type,
        sequence_number: p.sequence_number ?? p.order_number,
        status: p.status,
      }));

      res.json({ data: { ...formatRouteForClient(route), bids: camelBids, orders: mappedOrders } });
    } catch (error: any) {
      console.error('Get route error:', error);
      res.status(500).json({ error: 'Failed to get route' });
    }
  });

  // Compensation breakdown for a route (driver visibility)
  app.get('/api/team/routes/:routeId/valuation', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.routeId;
      const driverId = res.locals.driverProfile.id;

      const route = await storage.getRouteById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });

      // Only allow driver to see valuation for their own routes
      if (route.assigned_driver_id !== driverId) {
        return res.status(403).json({ error: 'Not your route' });
      }

      const { calculateRouteValuation } = await import('./compensationEngine');
      const valuation = await calculateRouteValuation(routeId);
      res.json({ data: valuation });
    } catch (error: any) {
      console.error('Route valuation error:', error);
      res.status(500).json({ error: 'Failed to get route valuation' });
    }
  });

  app.post('/api/team/routes/:routeId/bid', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.routeId;
      const driverId = res.locals.driverProfile.id;
      const { bid_amount, message } = req.body;

      if (!bid_amount || bid_amount <= 0) {
        return res.status(400).json({ error: 'Valid bid amount is required' });
      }

      const route = await storage.getRouteById(routeId);
      if (!route) {
        return res.status(404).json({ error: 'Route not found' });
      }

      if (route.status !== 'open' && route.status !== 'bidding') {
        return res.status(400).json({ error: 'Route is not available for bidding' });
      }

      const existingBid = await storage.getBidByRouteAndDriver(routeId, driverId);
      if (existingBid) {
        return res.status(409).json({ error: 'You have already bid on this route' });
      }

      const driver = await storage.getDriverById(driverId);

      const bid = await storage.createRouteBid({
        routeId,
        driverId,
        bidAmount: bid_amount,
        message: message || undefined,
        driverRatingAtBid: parseFloat(driver.rating) || 5.00,
      });

      if (route.status === 'open') {
        await storage.updateRoute(routeId, { status: 'bidding' });
      }

      broadcastToAdmins('bid:placed', { routeId, driverId, bidAmount: bid_amount, title: route.title });

      res.status(201).json({ data: bid });
    } catch (error: any) {
      console.error('Place bid error:', error);
      res.status(500).json({ error: 'Failed to place bid' });
    }
  });

  app.delete('/api/team/routes/:routeId/bid', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.routeId;
      const driverId = res.locals.driverProfile.id;

      const existingBid = await storage.getBidByRouteAndDriver(routeId, driverId);
      if (!existingBid) {
        return res.status(404).json({ error: 'Bid not found' });
      }

      await storage.deleteRouteBid(routeId, driverId);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Withdraw bid error:', error);
      res.status(500).json({ error: 'Failed to withdraw bid' });
    }
  });

  // Driver claims an open route (same-day/next-day instant claim — no bidding).
  // Uses SELECT ... FOR UPDATE for atomic locking to prevent double-claim.
  app.post('/api/team/routes/:routeId/claim', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const routeId = req.params.routeId;
      const driverId = res.locals.driverProfile.id;
      const driver = res.locals.driverProfile;

      await client.query('BEGIN');

      // Lock the route row atomically
      const routeResult = await client.query(
        `SELECT * FROM routes WHERE id = $1 FOR UPDATE`,
        [routeId]
      );
      const route = routeResult.rows[0];
      if (!route) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Route not found' });
      }
      if (!['open', 'bidding'].includes(route.status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Route is no longer available' });
      }

      // Verify route is within claim window (scheduled within next 48 hours)
      const scheduledDate = new Date(route.scheduled_date);
      const hoursUntil = (scheduledDate.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil > 48) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Route is too far out for instant claim. Use bidding instead.' });
      }

      // Check driver qualification: zone membership
      if (route.zone_id) {
        const zoneCheck = await client.query(
          `SELECT 1 FROM driver_zone_selections WHERE driver_id = $1 AND zone_id = $2
           UNION
           SELECT 1 FROM route_contracts WHERE driver_id = $1 AND zone_id = $2 AND status = 'active'`,
          [driverId, route.zone_id]
        );
        if (zoneCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'You are not qualified for this route\'s zone' });
        }
      }

      // Assign the route
      await client.query(
        `UPDATE routes SET status = 'assigned', assigned_driver_id = $1, updated_at = NOW() WHERE id = $2`,
        [driverId, routeId]
      );

      // Reject any pending bids from other drivers
      await client.query(
        `UPDATE route_bids SET status = 'rejected' WHERE route_id = $1 AND driver_id != $2 AND status = 'pending'`,
        [routeId, driverId]
      );

      // Accept this driver's bid if they had one
      await client.query(
        `UPDATE route_bids SET status = 'accepted' WHERE route_id = $1 AND driver_id = $2 AND status = 'pending'`,
        [routeId, driverId]
      );

      await client.query('COMMIT');

      // Broadcasts (non-blocking, outside transaction)
      broadcastToAdmins('route:claimed', { routeId, driverId, driverName: driver.name, title: route.title });
      if (route.zone_id) {
        broadcastToZoneDrivers(route.zone_id, 'route:claimed', { routeId }, driverId);
      }

      res.json({ success: true, route: formatRouteForClient({ ...route, status: 'assigned', assigned_driver_id: driverId }) });
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Claim route error:', error);
      res.status(500).json({ error: 'Failed to claim route' });
    } finally {
      client.release();
    }
  });

  // Driver starts an assigned route, transitioning it to in_progress.
  app.post('/api/team/routes/:routeId/start', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.routeId;
      const driverId = res.locals.driverProfile.id;

      const route = await storage.getRouteById(routeId);
      if (!route) {
        return res.status(404).json({ error: 'Route not found' });
      }

      if (route.assigned_driver_id !== driverId) {
        return res.status(403).json({ error: 'You are not assigned to this route' });
      }

      if (route.status !== 'assigned') {
        return res.status(400).json({ error: 'Only assigned routes can be started' });
      }

      await storage.updateRoute(routeId, { status: 'in_progress' });

      broadcastToAdmins('route:started', { routeId, driverId, title: route.title });

      res.json({ success: true });
    } catch (error: any) {
      console.error('Start route error:', error);
      res.status(500).json({ error: 'Failed to start route' });
    }
  });

  // Driver declines an assigned route. Sets route back to open and logs the reason.
  app.post('/api/team/routes/:routeId/decline', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.routeId;
      const driverId = res.locals.driverProfile.id;
      const { reason } = req.body || {};

      const route = await storage.getRouteById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });
      if (route.assigned_driver_id !== driverId) return res.status(403).json({ error: 'You are not assigned to this route' });
      if (route.status !== 'assigned') return res.status(400).json({ error: 'Only assigned routes can be declined' });

      const driverName = res.locals.driverProfile.name || 'Driver';
      const declineNote = `Declined by ${driverName}${reason ? `: ${reason}` : ''}`;
      await storage.updateRoute(routeId, {
        status: 'open',
        assigned_driver_id: null,
        accepted_bid_id: null,
        notes: route.notes ? `${route.notes}\n\n${declineNote}` : declineNote,
      });

      broadcastToAdmins('route:declined', { routeId, driverId, driverName, reason, title: route.title });
      if (route.zone_id) {
        broadcastToZoneDrivers(route.zone_id, 'route:available', { routeId, title: route.title, scheduledDate: route.scheduled_date }, driverId);
      }

      // Update reliability score (non-blocking)
      import('./driverMatchingService').then(({ updateReliabilityScore }) => {
        updateReliabilityScore(driverId).catch(() => {});
      }).catch(() => {});

      res.json({ success: true });
    } catch (error: any) {
      console.error('Decline route error:', error);
      res.status(500).json({ error: 'Failed to decline route' });
    }
  });

  // Driver marks an assigned route as completed. Accepts optional notes and
  // auto-creates a driver_pay expense record so payroll stays in sync.
  app.post('/api/team/routes/:routeId/complete', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const routeId = req.params.routeId;
      const driverId = res.locals.driverProfile.id;
      const { notes } = req.body || {};

      const route = await storage.getRouteById(routeId);
      if (!route) {
        return res.status(404).json({ error: 'Route not found' });
      }

      if (route.assigned_driver_id !== driverId) {
        return res.status(403).json({ error: 'You are not assigned to this route' });
      }

      if (route.status !== 'assigned' && route.status !== 'in_progress') {
        return res.status(400).json({ error: 'Route cannot be completed in its current status' });
      }

      await storage.updateRoute(routeId, {
        status: 'completed',
        ...(notes ? { notes: route.notes ? `${route.notes}\n\nDriver notes: ${notes}` : `Driver notes: ${notes}` } : {}),
      });

      const driver = await storage.getDriverById(driverId);
      await storage.updateDriver(driverId, {
        total_jobs_completed: (driver.total_jobs_completed || 0) + 1,
      });

      // Auto-sync driver pay expense
      const pay = route.base_pay ? parseFloat(route.base_pay) : 0;
      if (pay > 0) {
        try {
          const { expenseRepo } = await import('./repositories/ExpenseRepository');
          await expenseRepo.create({
            category: 'driver_pay',
            description: `Driver pay for: ${route.title}`,
            amount: pay,
            expenseDate: route.scheduled_date || new Date().toISOString().split('T')[0],
            referenceId: routeId,
            referenceType: 'route_job',
            createdBy: null as any,
          });
        } catch (e) {
          console.error('Failed to auto-sync driver pay expense on team completion:', e);
        }
      }

      // Check for incomplete orders and include in response
      const orders = await storage.getRouteOrders(routeId);
      const incompleteOrders = orders.filter((s: any) => !['completed', 'failed', 'skipped', 'cancelled'].includes(s.status));

      broadcastToAdmins('route:completed', { routeId, driverId, title: route.title });

      res.json({ success: true, incompleteOrders: incompleteOrders.length > 0 ? incompleteOrders.map((s: any) => ({ id: s.id, address: s.address, status: s.status })) : [] });
    } catch (error: any) {
      console.error('Complete route error:', error);
      res.status(500).json({ error: 'Failed to complete route' });
    }
  });

  // Driver updates an order status with proof of collection data.
  // Accepts status, notes, failure reason, and optional photo upload.
  app.put('/api/team/routes/:routeId/orders/:orderId', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const { routeId, orderId } = req.params;
      const driverId = res.locals.driverProfile.id;
      const { status, notes, failureReason, photoUrl } = req.body;

      const route = await storage.getRouteById(routeId);
      if (!route) return res.status(404).json({ error: 'Route not found' });
      if (route.assigned_driver_id !== driverId) return res.status(403).json({ error: 'Not your route' });
      if (!['assigned', 'in_progress'].includes(route.status)) return res.status(400).json({ error: 'Route is not active' });

      const validStatuses = ['completed', 'failed', 'skipped'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
      }

      // Build pod_data
      const podData: any = { updatedBy: driverId, updatedAt: new Date().toISOString() };
      if (notes) podData.notes = notes;
      if (failureReason) podData.failureReason = failureReason;
      if (photoUrl) podData.photoUrl = photoUrl;

      await pool.query(
        `UPDATE route_orders SET status = $1, pod_data = $2, updated_at = NOW()
         WHERE id = $3 AND route_id = $4`,
        [status, JSON.stringify(podData), orderId, routeId]
      );

      // Broadcast order update to admins
      broadcastToAdmins('order:updated', { routeId, orderId, status, driverId });

      // Report metered usage for per-collection billing (non-blocking)
      if (status === 'completed') {
        (async () => {
          try {
            const locResult = await pool.query(
              `SELECT l.billing_model, l.stripe_metered_subscription_id, l.per_collection_price
               FROM route_orders rs JOIN locations l ON l.id = rs.location_id
               WHERE rs.id = $1`,
              [orderId]
            );
            const loc = locResult.rows[0];
            if (loc?.billing_model === 'per_collection' && loc.stripe_metered_subscription_id) {
              const { getUncachableStripeClient } = await import('./stripeClient');
              const stripe = getUncachableStripeClient();
              await stripe.subscriptionItems.createUsageRecord(
                loc.stripe_metered_subscription_id,
                { quantity: 1, timestamp: Math.floor(Date.now() / 1000), action: 'increment' }
              );
            }
          } catch (e: any) {
            console.error('[MeteredBilling] Usage report failed:', e.message);
          }
        })();
      }

      // If order failed, notify the customer
      if (status === 'failed') {
        const orderResult = await pool.query(
          `SELECT rs.*, l.user_id FROM route_orders rs LEFT JOIN locations l ON l.id = rs.location_id WHERE rs.id = $1`,
          [orderId]
        );
        const order = orderResult.rows[0];
        if (order?.user_id) {
          const { sendServiceUpdate } = await import('./notificationService');
          sendServiceUpdate(
            order.user_id,
            'Collection Issue',
            `Your collection at ${order.address || 'your location'} could not be completed. Reason: ${failureReason || 'Not specified'}. We'll work to reschedule.`
          ).catch(() => {});
          broadcastToUser(order.user_id, 'order:failed', { orderId, address: order.address, reason: failureReason });
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Update order error:', error);
      res.status(500).json({ error: 'Failed to update order' });
    }
  });

  // Upload proof-of-collection photo for an order
  app.post('/api/team/routes/:routeId/orders/:orderId/photo', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const { podUpload } = await import('./uploadMiddleware');
      podUpload.single('photo')(req, res, async (err: any) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

        const { routeId, orderId } = req.params;
        const driverId = res.locals.driverProfile.id;

        const route = await storage.getRouteById(routeId);
        if (!route || route.assigned_driver_id !== driverId) {
          return res.status(403).json({ error: 'Not your route' });
        }

        const photoUrl = `/uploads/pod/${req.file.filename}`;

        // Merge photo into existing pod_data
        await pool.query(
          `UPDATE route_orders SET pod_data = COALESCE(pod_data, '{}'::jsonb) || $1::jsonb, updated_at = NOW()
           WHERE id = $2 AND route_id = $3`,
          [JSON.stringify({ photoUrl, photoUploadedAt: new Date().toISOString() }), orderId, routeId]
        );

        res.json({ success: true, photoUrl });
      });
    } catch (error: any) {
      console.error('Upload POD photo error:', error);
      res.status(500).json({ error: 'Failed to upload photo' });
    }
  });

  // Driver submits GPS location while route is in progress.
  // Accepts batch of points for efficiency (mobile sends every 30s).
  app.post('/api/team/location', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { routeId, points } = req.body;

      // Accept single point or batch
      const locations: Array<{ latitude: number; longitude: number; heading?: number; speed?: number; accuracy?: number; timestamp?: string }> =
        Array.isArray(points) ? points : [{ latitude: req.body.latitude, longitude: req.body.longitude, heading: req.body.heading, speed: req.body.speed, accuracy: req.body.accuracy }];

      if (locations.length === 0 || !locations[0].latitude) {
        return res.status(400).json({ error: 'latitude and longitude required' });
      }

      // Cap batch size to prevent abuse
      const batch = locations.slice(0, 20);

      const values: any[] = [];
      const placeholders: string[] = [];
      let idx = 1;
      for (const pt of batch) {
        placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        values.push(driverId, routeId || null, pt.latitude, pt.longitude, pt.heading || null, pt.speed || null, pt.accuracy || null, pt.timestamp || new Date().toISOString());
      }

      await pool.query(
        `INSERT INTO driver_locations (driver_id, route_id, latitude, longitude, heading, speed, accuracy, recorded_at)
         VALUES ${placeholders.join(', ')}`,
        values
      );

      res.json({ success: true, count: batch.length });
    } catch (error: any) {
      console.error('Location submit error:', error);
      res.status(500).json({ error: 'Failed to save location' });
    }
  });

  // Driver gets their own latest location (for debugging/display)
  app.get('/api/team/location/latest', requireDriverAuth, async (_req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const result = await pool.query(
        `SELECT latitude, longitude, heading, speed, accuracy, recorded_at, route_id
         FROM driver_locations WHERE driver_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
        [driverId]
      );
      res.json({ data: result.rows[0] || null });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to get location' });
    }
  });

  app.get('/api/team/schedule', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const start = (req.query.start as string) || new Date().toISOString().split('T')[0];
      const end = (req.query.end as string) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const routes = await storage.getDriverSchedule(driverId, start, end);
      res.json({ data: routes.map(formatRouteForClient) });
    } catch (error: any) {
      console.error('Get schedule error:', error);
      res.status(500).json({ error: 'Failed to get schedule' });
    }
  });

  app.get('/api/team/profile', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverProfile = res.locals.driverProfile;
      const user = await storage.getUserById(req.session.userId!);

      // Fetch provider context if driver belongs to one
      let providerInfo: { id: string; name: string; isOwner: boolean } | null = null;
      if (driverProfile.provider_id) {
        const { rows } = await pool.query(
          `SELECT id, name, owner_user_id FROM providers WHERE id = $1`,
          [driverProfile.provider_id]
        );
        if (rows[0]) {
          providerInfo = {
            id: rows[0].id,
            name: rows[0].name,
            isOwner: rows[0].owner_user_id === req.session.userId,
          };
        }
      }

      res.json({ data: formatDriverForClient(driverProfile, user, providerInfo) });
    } catch (error: any) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  });

  // Get current driver's provider details
  app.get('/api/team/my-provider', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverProfile = res.locals.driverProfile;
      if (!driverProfile.provider_id) return res.status(404).json({ error: 'Not part of a provider' });

      const { rows } = await pool.query(
        `SELECT p.id, p.name, p.status, p.created_at,
                (SELECT COUNT(*) FROM driver_profiles dp WHERE dp.provider_id = p.id)::int AS driver_count,
                (SELECT COUNT(*) FROM provider_territories pt WHERE pt.provider_id = p.id)::int AS territory_count
         FROM providers p WHERE p.id = $1`,
        [driverProfile.provider_id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Provider not found' });
      res.json({ provider: { ...rows[0], isOwner: rows[0].id && true } });
    } catch (error: any) {
      console.error('Get provider error:', error);
      res.status(500).json({ error: 'Failed to get provider' });
    }
  });

  app.put('/api/team/profile', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { name, phone, availability } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) {
        // Update phone on the users table (canonical source)
        await pool.query('UPDATE users SET phone = $1 WHERE id = $2', [phone, req.session.userId!]);
      }
      if (availability !== undefined) updateData.availability = availability;

      const updated = Object.keys(updateData).length > 0
        ? await storage.updateDriver(driverId, updateData)
        : res.locals.driverProfile;
      const user = await storage.getUserById(req.session.userId!);
      res.json({ data: formatDriverForClient(updated || res.locals.driverProfile, user) });
    } catch (error: any) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  app.get('/api/team/onboarding/status', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driver = await storage.getDriverById(res.locals.driverProfile.id);
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }
      res.json({
        data: {
          w9_completed: driver.w9_completed || false,
          direct_deposit_completed: driver.direct_deposit_completed || false,
          onboarding_status: driver.onboarding_status || 'pending',
        },
      });
    } catch (error: any) {
      console.error('Get onboarding status error:', error);
      res.status(500).json({ error: 'Failed to get onboarding status' });
    }
  });

  // Message email opt-in toggle for drivers
  app.put('/api/team/profile/message-notifications', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
      await storage.query(`UPDATE driver_profiles SET message_email_notifications = $1, updated_at = NOW() WHERE id = $2`, [enabled, driverId]);
      res.json({ success: true, message_email_notifications: enabled });
    } catch (e: any) {
      if (e?.message?.includes('column') || e?.code === '42703') {
        return res.json({ success: false, message_email_notifications: false, error: 'Feature not yet available' });
      }
      console.error('Update message notification preference error:', e);
      res.status(500).json({ error: 'Failed to update preference' });
    }
  });

  // Get message notification preference for drivers
  app.get('/api/team/profile/message-notifications', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const result = await storage.query(`SELECT message_email_notifications FROM driver_profiles WHERE id = $1`, [driverId]);
      const enabled = result.rows[0]?.message_email_notifications ?? false;
      res.json({ message_email_notifications: enabled });
    } catch (e: any) {
      // Column may not exist if migration hasn't run yet — return default
      if (e?.message?.includes('column') || e?.code === '42703') {
        return res.json({ message_email_notifications: false });
      }
      console.error('Get message notification preference error:', e);
      res.status(500).json({ error: 'Failed to get preference' });
    }
  });

  // ── On-Demand Requests for Driver ──

  app.get('/api/team/on-demand', requireDriverAuth, async (_req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const requests = await storage.getOnDemandRequestsForDriver(driverId);
      res.json({
        data: requests.map((p: any) => ({
          id: p.id,
          address: p.address,
          serviceName: p.service_name,
          servicePrice: Number(p.service_price),
          requestedDate: p.requested_date,
          pickupDate: p.requested_date,
          status: p.status,
          notes: p.notes,
          photos: p.photos || [],
        })),
      });
    } catch (error: any) {
      console.error('Failed to fetch driver on-demand requests:', error);
      res.status(500).json({ error: 'Failed to fetch on-demand requests' });
    }
  });

  app.put('/api/team/on-demand/:id/complete', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { id } = req.params;
      // Verify this on-demand request is assigned to the requesting driver
      const onDemandRequest = await storage.getOnDemandRequestById(id);
      if (!onDemandRequest || onDemandRequest.assigned_driver_id !== driverId) {
        return res.status(403).json({ error: 'On-demand pickup not found or not assigned to you' });
      }
      if (onDemandRequest.status === 'completed' || onDemandRequest.status === 'cancelled') {
        return res.status(400).json({ error: 'On-demand pickup is already ' + onDemandRequest.status });
      }
      const updated = await storage.updateOnDemandRequest(id, { status: 'completed' });

      // Sync linked route order(s) so planner/live status views stay consistent.
      await pool.query(
        `UPDATE route_orders rs
         SET status = 'completed'
         FROM routes r
         WHERE rs.on_demand_request_id = $1
           AND rs.route_id = r.id
           AND COALESCE(r.status, '') != 'cancelled'
           AND rs.status NOT IN ('completed', 'failed', 'skipped', 'cancelled')`,
        [id]
      );

      // Notify customer
      const { sendServiceUpdate } = await import('./notificationService');
      sendServiceUpdate(onDemandRequest.user_id, 'On-Demand Pickup Completed', `Your ${onDemandRequest.service_name} pickup at ${onDemandRequest.address} has been completed. Thank you!`).catch(e => console.error('Completion notification failed:', e));

      broadcastToUser(onDemandRequest.user_id, 'ondemand:completed', { requestId: id });
      broadcastToAdmins('ondemand:completed', { requestId: id, driverId });

      res.json({ success: true, data: updated });
    } catch (error: any) {
      console.error('Failed to complete on-demand request:', error);
      res.status(500).json({ error: 'Failed to mark on-demand pickup as completed' });
    }
  });

  // ============================================================
  // Driver Qualifications (team self-view)
  // ============================================================

  app.get('/api/team/my-qualifications', requireDriverAuth, requireOnboarded, async (_req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { rows } = await pool.query(
        `SELECT equipment_types, certifications, max_orders_per_day, min_rating_for_assignment,
                qualifications_verified, qualifications_updated_at
         FROM driver_profiles WHERE id = $1`,
        [driverId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Driver not found' });
      const d = rows[0];
      res.json({
        qualifications: {
          equipmentTypes: d.equipment_types || [],
          certifications: d.certifications || [],
          maxOrdersPerDay: d.max_orders_per_day,
          minRatingForAssignment: Number(d.min_rating_for_assignment),
          verified: d.qualifications_verified ?? false,
          updatedAt: d.qualifications_updated_at,
        },
      });
    } catch (err: any) {
      console.error('Error fetching qualifications:', err);
      res.status(500).json({ error: 'Failed to fetch qualifications' });
    }
  });

  // Driver self-declaration of qualifications (marks as unverified until admin confirms)
  app.put('/api/team/profile/qualifications', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { equipmentTypes, certifications, maxOrdersPerDay } = req.body;

      if (equipmentTypes !== undefined && !Array.isArray(equipmentTypes)) {
        return res.status(400).json({ error: 'equipmentTypes must be an array' });
      }
      if (certifications !== undefined && !Array.isArray(certifications)) {
        return res.status(400).json({ error: 'certifications must be an array' });
      }
      if (maxOrdersPerDay !== undefined && (typeof maxOrdersPerDay !== 'number' || maxOrdersPerDay < 1 || maxOrdersPerDay > 500)) {
        return res.status(400).json({ error: 'maxOrdersPerDay must be a number between 1 and 500' });
      }

      const updates: string[] = ['qualifications_verified = FALSE', 'qualifications_updated_at = NOW()'];
      const params: any[] = [];
      let idx = 1;
      if (equipmentTypes !== undefined) { updates.push(`equipment_types = $${idx++}`); params.push(equipmentTypes); }
      if (certifications !== undefined) { updates.push(`certifications = $${idx++}`); params.push(certifications); }
      if (maxOrdersPerDay !== undefined) { updates.push(`max_orders_per_day = $${idx++}`); params.push(maxOrdersPerDay); }
      params.push(driverId);

      const { rows } = await pool.query(
        `UPDATE driver_profiles SET ${updates.join(', ')} WHERE id = $${idx}
         RETURNING equipment_types, certifications, max_orders_per_day, qualifications_verified, qualifications_updated_at`,
        params
      );

      // Notify admin via Slack
      const dp = res.locals.driverProfile;
      notifyQualificationsUpdated(dp.name || dp.email || 'Unknown driver').catch(() => {});

      const d = rows[0];
      res.json({
        qualifications: {
          equipmentTypes: d.equipment_types || [],
          certifications: d.certifications || [],
          maxOrdersPerDay: d.max_orders_per_day,
          verified: d.qualifications_verified,
          updatedAt: d.qualifications_updated_at,
        },
      });
    } catch (err: any) {
      console.error('Error updating qualifications:', err);
      res.status(500).json({ error: 'Failed to update qualifications' });
    }
  });

  // ============================================================
  // Driver Contracts (team view — read-only)
  // ============================================================

  app.get('/api/team/my-contracts', requireDriverAuth, requireOnboarded, async (_req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { rows } = await pool.query(
        `SELECT rc.*,
                sz.name AS zone_name,
                (SELECT COUNT(*) FROM routes r WHERE r.contract_id = rc.id) AS route_count,
                (SELECT COALESCE(SUM(r.order_count), 0) FROM routes r WHERE r.contract_id = rc.id) AS order_count,
                (SELECT COALESCE(SUM(r.computed_value), 0) FROM routes r WHERE r.contract_id = rc.id AND r.status = 'completed') AS total_earned
         FROM route_contracts rc
         JOIN service_zones sz ON rc.zone_id = sz.id
         WHERE rc.driver_id = $1
         ORDER BY rc.status ASC, rc.end_date ASC`,
        [driverId]
      );
      res.json({
        contracts: rows.map((c: any) => ({
          id: c.id,
          zoneId: c.zone_id,
          zoneName: c.zone_name,
          dayOfWeek: c.day_of_week,
          startDate: c.start_date,
          endDate: c.end_date,
          status: c.status,
          perStopRate: c.per_stop_rate != null ? Number(c.per_stop_rate) : null,
          termsNotes: c.terms_notes,
          createdAt: c.created_at,
          routeCount: parseInt(c.route_count) || 0,
          orderCount: parseInt(c.order_count) || 0,
          totalEarnings: Number(c.total_earned),
        })),
      });
    } catch (err: any) {
      console.error('Error fetching driver contracts:', err);
      res.status(500).json({ error: 'Failed to fetch contracts' });
    }
  });

  // ============================================================
  // Contract Opportunities — driver views open opportunities and applies
  // ============================================================

  app.get('/api/team/contract-opportunities', requireDriverAuth, requireOnboarded, async (_req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { rows } = await pool.query(
        `SELECT co.*,
                sz.name AS zone_name,
                (SELECT COUNT(*) FROM contract_applications ca WHERE ca.opportunity_id = co.id) AS application_count,
                (SELECT ca.id FROM contract_applications ca WHERE ca.opportunity_id = co.id AND ca.driver_id = $1) AS my_application_id,
                (SELECT ca.status FROM contract_applications ca WHERE ca.opportunity_id = co.id AND ca.driver_id = $1) AS my_application_status
         FROM contract_opportunities co
         JOIN service_zones sz ON co.zone_id = sz.id
         WHERE co.status = 'open'
         ORDER BY co.created_at DESC`,
        [driverId]
      );
      res.json({
        opportunities: rows.map((o: any) => ({
          id: o.id,
          zoneId: o.zone_id,
          zoneName: o.zone_name,
          dayOfWeek: o.day_of_week,
          startDate: o.start_date,
          durationMonths: o.duration_months,
          proposedPerStopRate: o.proposed_per_stop_rate != null ? Number(o.proposed_per_stop_rate) : null,
          requirements: o.requirements || {},
          applicationCount: parseInt(o.application_count) || 0,
          myApplicationId: o.my_application_id || null,
          myApplicationStatus: o.my_application_status || null,
          createdAt: o.created_at,
        })),
      });
    } catch (err: any) {
      console.error('Error fetching opportunities:', err);
      res.status(500).json({ error: 'Failed to fetch opportunities' });
    }
  });

  // Apply for an opportunity
  app.post('/api/team/contract-opportunities/:id/apply', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { proposedRate, message } = req.body;

      // Verify opportunity is open
      const oppResult = await pool.query(`SELECT * FROM contract_opportunities WHERE id = $1 AND status = 'open'`, [req.params.id]);
      if (oppResult.rows.length === 0) return res.status(404).json({ error: 'Opportunity not found or not open' });

      // Get driver rating at time of application
      const driverResult = await pool.query(`SELECT rating FROM driver_profiles WHERE id = $1`, [driverId]);
      const driverRating = driverResult.rows[0]?.rating != null ? Number(driverResult.rows[0].rating) : null;

      const { rows } = await pool.query(
        `INSERT INTO contract_applications (opportunity_id, driver_id, proposed_rate, message, driver_rating_at_application)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (opportunity_id, driver_id) DO UPDATE SET
           proposed_rate = EXCLUDED.proposed_rate,
           message = EXCLUDED.message,
           driver_rating_at_application = EXCLUDED.driver_rating_at_application,
           status = 'pending'
         RETURNING *`,
        [req.params.id, driverId, proposedRate ?? null, message ?? null, driverRating]
      );
      const a = rows[0];
      res.status(201).json({
        application: {
          id: a.id,
          opportunityId: a.opportunity_id,
          proposedRate: a.proposed_rate != null ? Number(a.proposed_rate) : null,
          message: a.message,
          status: a.status,
          createdAt: a.created_at,
        },
      });
    } catch (err: any) {
      console.error('Error applying for opportunity:', err);
      res.status(500).json({ error: 'Failed to submit application' });
    }
  });

  // Withdraw application
  app.delete('/api/team/contract-opportunities/:id/apply', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { rowCount } = await pool.query(
        `DELETE FROM contract_applications WHERE opportunity_id = $1 AND driver_id = $2 AND status = 'pending'`,
        [req.params.id, driverId]
      );
      if (rowCount === 0) return res.status(404).json({ error: 'No pending application found' });
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error withdrawing application:', err);
      res.status(500).json({ error: 'Failed to withdraw application' });
    }
  });

  // ============================================================
  // Coverage Requests (driver submits, views, withdraws)
  // ============================================================

  app.post('/api/team/coverage-requests', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { contractId, coverageDate, reason, reasonNotes } = req.body;

      if (!contractId || !coverageDate || !reason) {
        return res.status(400).json({ error: 'contractId, coverageDate, and reason are required' });
      }
      if (!['sick', 'vacation', 'emergency', 'other'].includes(reason)) {
        return res.status(400).json({ error: 'reason must be sick, vacation, emergency, or other' });
      }

      // Verify driver owns this contract
      const contract = await pool.query(
        'SELECT id, driver_id FROM route_contracts WHERE id = $1', [contractId]
      );
      if (contract.rows.length === 0) return res.status(404).json({ error: 'Contract not found' });
      if (contract.rows[0].driver_id !== driverId) return res.status(403).json({ error: 'Not your contract' });

      // Check for duplicate
      const existing = await pool.query(
        'SELECT id FROM coverage_requests WHERE contract_id = $1 AND coverage_date = $2 AND status != $3',
        [contractId, coverageDate, 'denied']
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'A coverage request already exists for this date' });
      }

      const { rows } = await pool.query(
        `INSERT INTO coverage_requests (contract_id, requesting_driver_id, coverage_date, reason, reason_notes)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [contractId, driverId, coverageDate, reason, reasonNotes || null]
      );

      // Broadcast coverage opportunity to other active drivers in the same service zone
      const contractDetail = await pool.query(
        `SELECT rc.zone_id, rc.day_of_week, sz.name AS zone_name, dp.name AS driver_name
         FROM route_contracts rc
         LEFT JOIN service_zones sz ON rc.zone_id = sz.id
         LEFT JOIN driver_profiles dp ON rc.driver_id = dp.id
         WHERE rc.id = $1`,
        [contractId]
      );
      if (contractDetail.rows.length > 0) {
        const cd = contractDetail.rows[0];
        pool.query(
          `SELECT DISTINCT dzs.driver_id AS id FROM driver_zone_selections dzs
           WHERE dzs.zone_id = $1 AND dzs.status = 'active' AND dzs.driver_id != $2`,
          [cd.zone_id, driverId]
        ).then(({ rows: drivers }) => {
          for (const d of drivers) {
            sendDriverNotification(d.id, 'Coverage Opportunity',
              `<p><strong>${cd.driver_name || 'A driver'}</strong> needs coverage for <strong>${cd.zone_name || 'Zone'} — ${cd.day_of_week}</strong> on <strong>${coverageDate}</strong>.</p>
               <p>Log in to the team portal to claim this shift.</p>`
            ).catch(() => {});
          }
        }).catch(() => {});
      }

      res.status(201).json({ data: rows[0] });
    } catch (err: any) {
      console.error('Error creating coverage request:', err);
      res.status(500).json({ error: 'Failed to create coverage request' });
    }
  });

  app.get('/api/team/coverage-requests', requireDriverAuth, requireOnboarded, async (_req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { rows } = await pool.query(
        `SELECT cr.*, rc.day_of_week, sz.name AS zone_name,
                sub.name AS substitute_driver_name
         FROM coverage_requests cr
         JOIN route_contracts rc ON cr.contract_id = rc.id
         LEFT JOIN service_zones sz ON rc.zone_id = sz.id
         LEFT JOIN driver_profiles sub ON cr.substitute_driver_id = sub.id
         WHERE cr.requesting_driver_id = $1
         ORDER BY cr.coverage_date DESC`,
        [driverId]
      );
      res.json({
        data: rows.map((r: any) => ({
          id: r.id,
          contractId: r.contract_id,
          coverageDate: r.coverage_date,
          reason: r.reason,
          reasonNotes: r.reason_notes,
          status: r.status,
          dayOfWeek: r.day_of_week,
          zoneName: r.zone_name,
          substituteDriverName: r.substitute_driver_name,
          substitutePay: r.substitute_pay != null ? Number(r.substitute_pay) : null,
          createdAt: r.created_at,
        })),
      });
    } catch (err: any) {
      console.error('Error fetching coverage requests:', err);
      res.status(500).json({ error: 'Failed to fetch coverage requests' });
    }
  });

  app.delete('/api/team/coverage-requests/:id', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { rows } = await pool.query(
        `DELETE FROM coverage_requests WHERE id = $1 AND requesting_driver_id = $2 AND status = 'pending' RETURNING id`,
        [req.params.id, driverId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Request not found or not withdrawable' });
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error withdrawing coverage request:', err);
      res.status(500).json({ error: 'Failed to withdraw coverage request' });
    }
  });

  // Self-claim an open coverage request (substitute driver volunteers)
  app.post('/api/team/coverage-requests/:id/claim', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;

      // Fetch the request to validate it's open and in a zone this driver covers
      const { rows: crRows } = await pool.query(
        `SELECT cr.id, cr.requesting_driver_id, cr.coverage_date, cr.status,
                rc.zone_id, rc.day_of_week, sz.name AS zone_name,
                dp.name AS requestor_name
         FROM coverage_requests cr
         JOIN route_contracts rc ON cr.contract_id = rc.id
         LEFT JOIN service_zones sz ON rc.zone_id = sz.id
         LEFT JOIN driver_profiles dp ON cr.requesting_driver_id = dp.id
         WHERE cr.id = $1`,
        [req.params.id]
      );
      if (crRows.length === 0) return res.status(404).json({ error: 'Coverage request not found' });
      const cr = crRows[0];
      if (cr.status !== 'pending') return res.status(409).json({ error: `Request is already ${cr.status}` });
      if (cr.requesting_driver_id === driverId) return res.status(400).json({ error: 'Cannot claim your own coverage request' });

      // Verify the claiming driver has an active zone selection for this service zone
      const { rows: selRows } = await pool.query(
        `SELECT id FROM driver_zone_selections WHERE driver_id = $1 AND zone_id = $2 AND status = 'active'`,
        [driverId, cr.zone_id]
      );
      if (selRows.length === 0) return res.status(403).json({ error: 'You do not cover this zone' });

      // Assign the substitute
      await pool.query(
        `UPDATE coverage_requests SET substitute_driver_id = $1, status = 'approved' WHERE id = $2`,
        [driverId, req.params.id]
      );

      // Notify the requestor
      sendDriverNotification(cr.requesting_driver_id,
        'Coverage Confirmed',
        `<p>Your coverage request for <strong>${cr.zone_name} — ${cr.day_of_week}</strong> on <strong>${cr.coverage_date}</strong> has been claimed by another driver.</p>
         <p>You're all set — no further action needed.</p>`
      ).catch(() => {});

      res.json({ success: true });
    } catch (err: any) {
      console.error('Error claiming coverage request:', err);
      res.status(500).json({ error: 'Failed to claim coverage request' });
    }
  });

  // ============================================================
  // Outcome Visibility — drivers can see why things were approved/rejected
  // ============================================================

  // Single custom zone with rejection reason from audit log
  app.get('/api/team/my-custom-zones/:id', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { rows } = await pool.query(
        `SELECT dcz.*,
                (SELECT al.details->>'notes'
                 FROM audit_log al
                 WHERE al.entity_type = 'driver_custom_zones'
                   AND al.entity_id = dcz.id::text
                   AND al.action = 'zone_rejected'
                 ORDER BY al.created_at DESC LIMIT 1) AS rejection_reason
         FROM driver_custom_zones dcz
         WHERE dcz.id = $1 AND dcz.driver_id = $2`,
        [req.params.id, driverId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Zone not found' });
      res.json({ data: rows[0] });
    } catch (err: any) {
      console.error('Error fetching custom zone:', err);
      res.status(500).json({ error: 'Failed to fetch zone' });
    }
  });

  // Driver's own application for a contract opportunity (with outcome)
  app.get('/api/team/contract-opportunities/:id/my-application', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { rows } = await pool.query(
        `SELECT ca.id, ca.status, ca.proposed_rate, ca.message, ca.driver_rating_at_application, ca.created_at,
                co.zone_id, co.day_of_week, co.start_date, co.status AS opportunity_status,
                sz.name AS zone_name
         FROM contract_applications ca
         JOIN contract_opportunities co ON ca.opportunity_id = co.id
         LEFT JOIN service_zones sz ON co.zone_id = sz.id
         WHERE ca.opportunity_id = $1 AND ca.driver_id = $2`,
        [req.params.id, driverId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'No application found' });
      const a = rows[0];
      res.json({
        application: {
          id: a.id,
          status: a.status,
          proposedRate: a.proposed_rate != null ? Number(a.proposed_rate) : null,
          message: a.message,
          driverRatingAtApplication: a.driver_rating_at_application != null ? Number(a.driver_rating_at_application) : null,
          createdAt: a.created_at,
          opportunity: {
            zoneId: a.zone_id,
            zoneName: a.zone_name,
            dayOfWeek: a.day_of_week,
            startDate: a.start_date,
            status: a.opportunity_status,
          },
        },
      });
    } catch (err: any) {
      console.error('Error fetching application:', err);
      res.status(500).json({ error: 'Failed to fetch application' });
    }
  });

  // ============================================================
  // Zone Expansion Proposals (Sprint 3, Task 9)
  // ============================================================

  app.post('/api/team/zone-expansion-proposals', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { proposedZoneName, zoneType, centerLat, centerLng, radiusMiles, polygonCoords, zipCodes, daysOfWeek, proposedRate, notes } = req.body;

      if (!proposedZoneName || !proposedZoneName.trim()) return res.status(400).json({ error: 'proposedZoneName is required' });
      const type = zoneType || 'circle';
      if (!['circle', 'polygon', 'zip'].includes(type)) return res.status(400).json({ error: 'zoneType must be circle, polygon, or zip' });

      const { rows } = await pool.query(
        `INSERT INTO zone_expansion_proposals
           (driver_id, proposed_zone_name, zone_type, center_lat, center_lng, radius_miles, polygon_coords, zip_codes, days_of_week, proposed_rate, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [driverId, proposedZoneName.trim(), type,
          centerLat != null ? Number(centerLat) : null,
          centerLng != null ? Number(centerLng) : null,
          radiusMiles != null ? Number(radiusMiles) : null,
          polygonCoords ? JSON.stringify(polygonCoords) : null,
          zipCodes || null,
          daysOfWeek || [],
          proposedRate != null ? Number(proposedRate) : null,
          notes || null]
      );

      const dp = res.locals.driverProfile;
      notifyNewZoneProposal(dp.name || dp.email || 'Unknown driver', proposedZoneName.trim(), daysOfWeek || []).catch(() => {});

      res.status(201).json({ proposal: mapProposal(rows[0]) });
    } catch (err: any) {
      console.error('Error creating zone expansion proposal:', err);
      res.status(500).json({ error: 'Failed to create proposal' });
    }
  });

  app.get('/api/team/zone-expansion-proposals', requireDriverAuth, requireOnboarded, async (_req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { rows } = await pool.query(
        `SELECT zep.*, dp.name AS driver_name
         FROM zone_expansion_proposals zep
         JOIN driver_profiles dp ON dp.id = zep.driver_id
         WHERE zep.driver_id = $1 ORDER BY zep.created_at DESC`,
        [driverId]
      );
      res.json({ proposals: rows.map(mapProposal) });
    } catch (err: any) {
      console.error('Error fetching zone proposals:', err);
      res.status(500).json({ error: 'Failed to fetch proposals' });
    }
  });

  app.delete('/api/team/zone-expansion-proposals/:id', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { rows } = await pool.query(
        `DELETE FROM zone_expansion_proposals WHERE id = $1 AND driver_id = $2 AND status = 'pending' RETURNING id`,
        [req.params.id, driverId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Proposal not found or not withdrawable' });
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error withdrawing zone proposal:', err);
      res.status(500).json({ error: 'Failed to withdraw proposal' });
    }
  });

  // ============================================================
  // Zone Assignment Requests — driver approves/denies location assignments
  // ============================================================

  app.get('/api/team/zone-assignment-requests', requireDriverAuth, requireOnboarded, async (_req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const requests = await storage.getPendingAssignmentRequestsForDriver(driverId);
      res.json({ requests });
    } catch (err: any) {
      console.error('Error fetching zone assignment requests:', err);
      res.status(500).json({ error: 'Failed to fetch zone assignment requests' });
    }
  });

  app.put('/api/team/zone-assignment-requests/:id/respond', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { decision, notes } = req.body;
      if (!decision || !['approved', 'denied'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be "approved" or "denied"' });
      }
      const result = await storage.respondToZoneAssignmentRequest(req.params.id, driverId, decision, notes);
      if (!result) return res.status(404).json({ error: 'Request not found, not yours, or not pending' });

      // Notify the requesting admin
      if (result.requested_by) {
        await storage.createNotification(
          result.requested_by,
          'zone_assignment_response',
          `Zone Assignment ${decision === 'approved' ? 'Approved' : 'Denied'}`,
          `Driver ${decision === 'approved' ? 'approved' : 'denied'} the assignment request for zone "${result.zone_name || 'unknown'}".${notes ? ` Notes: ${notes}` : ''}`
        );
      }

      res.json({ success: true, request: result });
    } catch (err: any) {
      console.error('Error responding to zone assignment request:', err);
      res.status(500).json({ error: 'Failed to respond to zone assignment request' });
    }
  });

  // ============================================================
  // Contract Routes — driver views routes under a specific contract
  // ============================================================

  app.get('/api/team/contracts/:id/routes', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const contractId = req.params.id;

      // Verify driver owns this contract
      const contract = await pool.query(
        `SELECT id FROM route_contracts WHERE id = $1 AND driver_id = $2`,
        [contractId, driverId]
      );
      if (contract.rows.length === 0) return res.status(404).json({ error: 'Contract not found' });

      const { rows } = await pool.query(
        `SELECT r.id, r.title, r.scheduled_date, r.status, r.order_count,
                r.computed_value, r.pay_mode, r.pay_premium, r.actual_pay
         FROM routes r
         WHERE r.contract_id = $1 AND r.assigned_driver_id = $2
         ORDER BY r.scheduled_date DESC
         LIMIT 50`,
        [contractId, driverId]
      );

      const totalEarned = rows
        .filter((r: any) => r.status === 'completed' && r.computed_value != null)
        .reduce((sum: number, r: any) => sum + Number(r.computed_value), 0);

      res.json({
        routes: rows.map((r: any) => ({
          id: r.id,
          title: r.title,
          scheduledDate: r.scheduled_date,
          status: r.status,
          orderCount: r.order_count || 0,
          computedValue: r.computed_value != null ? Number(r.computed_value) : null,
          payMode: r.pay_mode,
          payPremium: r.pay_premium != null ? Number(r.pay_premium) : null,
          actualPay: r.actual_pay != null ? Number(r.actual_pay) : null,
        })),
        total: rows.length,
        totalEarned,
      });
    } catch (err: any) {
      console.error('Error fetching contract routes:', err);
      res.status(500).json({ error: 'Failed to fetch contract routes' });
    }
  });

  // ============================================================
  // Contract Earnings Forecast
  // ============================================================

  app.get('/api/team/contracts/:id/forecast', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const contractId = req.params.id;

      // Load contract
      const { rows: contractRows } = await pool.query(
        `SELECT rc.id, rc.start_date, rc.end_date, rc.day_of_week, rc.per_stop_rate, rc.status
         FROM route_contracts rc
         WHERE rc.id = $1 AND rc.driver_id = $2`,
        [contractId, driverId]
      );
      if (contractRows.length === 0) return res.status(404).json({ error: 'Contract not found' });
      const contract = contractRows[0];

      // Get completed route stats
      const { rows: statsRows } = await pool.query(
        `SELECT COUNT(*)::int AS completed_routes,
                COALESCE(SUM(r.computed_value), 0) AS earned_so_far,
                COALESCE(AVG(r.computed_value), 0) AS avg_route_value
         FROM routes r
         WHERE r.contract_id = $1 AND r.assigned_driver_id = $2 AND r.status = 'completed'`,
        [contractId, driverId]
      );
      const stats = statsRows[0];
      const completedRoutes = stats.completed_routes;
      const earnedSoFar = Number(stats.earned_so_far);
      const avgRouteValue = Number(stats.avg_route_value);

      // Calculate remaining weeks from now to contract end
      const now = new Date();
      const endDate = new Date(contract.end_date);
      let remainingRoutes = 0;
      if (endDate > now) {
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        remainingRoutes = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / msPerWeek));
      }

      const projectedTotal = avgRouteValue > 0
        ? earnedSoFar + (remainingRoutes * avgRouteValue)
        : earnedSoFar;

      res.json({
        earnedSoFar: Math.round(earnedSoFar * 100) / 100,
        completedRoutes,
        remainingRoutes,
        avgRouteValue: Math.round(avgRouteValue * 100) / 100,
        projectedTotal: Math.round(projectedTotal * 100) / 100,
        contractEndDate: contract.end_date,
      });
    } catch (err: any) {
      console.error('Error fetching contract forecast:', err);
      res.status(500).json({ error: 'Failed to fetch forecast' });
    }
  });

  // ============================================================
  // Provider (My Company) — Dashboard, Sub-drivers, Territory Management
  // ============================================================

  // Middleware: driver must be the owner_user_id of a provider
  const requireProviderOwner: import('express').RequestHandler = async (req, res, next) => {
    try {
      const { rows } = await pool.query(
        `SELECT p.* FROM providers p WHERE p.owner_user_id = $1 AND p.status = 'active'`,
        [req.session.userId]
      );
      if (rows.length === 0) return res.status(403).json({ error: 'Not a provider owner' });
      res.locals.provider = rows[0];
      next();
    } catch (err: any) {
      console.error('requireProviderOwner error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  };

  // Summary stats for provider dashboard
  app.get('/api/team/my-provider/dashboard', requireDriverAuth, requireProviderOwner, async (_req: Request, res: Response) => {
    try {
      const providerId = res.locals.provider.id;
      const { rows } = await pool.query(
        `SELECT
           COUNT(DISTINCT dp.id) FILTER (WHERE dp.status = 'active') AS active_driver_count,
           COUNT(DISTINCT dp.id) AS total_driver_count,
           COUNT(DISTINCT pt.id) AS territory_count,
           COUNT(DISTINCT l.id) FILTER (WHERE l.service_status = 'approved') AS covered_locations,
           COALESCE(SUM(r.computed_value) FILTER (WHERE r.status = 'completed'), 0) AS total_earnings_30d
         FROM providers p
         LEFT JOIN driver_profiles dp ON dp.provider_id = p.id
         LEFT JOIN provider_territories pt ON pt.provider_id = p.id
         LEFT JOIN locations l ON l.provider_id = p.id
         LEFT JOIN routes r ON r.assigned_driver_id = dp.id
           AND r.scheduled_date >= NOW() - INTERVAL '30 days'
         WHERE p.id = $1`,
        [providerId]
      );
      res.json({ stats: rows[0], providerName: res.locals.provider.name, providerSlug: res.locals.provider.slug || '' });
    } catch (err: any) {
      console.error('Error fetching provider dashboard:', err);
      res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
  });

  // List sub-drivers under this provider
  app.get('/api/team/my-provider/drivers', requireDriverAuth, requireProviderOwner, async (_req: Request, res: Response) => {
    try {
      const providerId = res.locals.provider.id;
      const { rows } = await pool.query(
        `SELECT dp.id, dp.name, dp.status, dp.rating,
                u.email,
                (SELECT COUNT(*) FROM route_contracts rc WHERE rc.driver_id = dp.id AND rc.status = 'active')::int AS active_contracts,
                (SELECT COUNT(*) FROM routes r WHERE r.assigned_driver_id = dp.id AND r.status = 'completed'
                  AND r.scheduled_date >= NOW() - INTERVAL '30 days')::int AS routes_30d,
                (SELECT COALESCE(SUM(r2.computed_value), 0) FROM routes r2
                  WHERE r2.assigned_driver_id = dp.id AND r2.status = 'completed'
                  AND r2.scheduled_date >= NOW() - INTERVAL '30 days') AS earnings_30d,
                (SELECT COUNT(*) FROM driver_custom_zones dcz WHERE dcz.driver_id = dp.id AND dcz.status = 'active')::int AS active_zones
         FROM driver_profiles dp
         JOIN users u ON u.id = dp.user_id
         WHERE dp.provider_id = $1
         ORDER BY dp.name`,
        [providerId]
      );
      res.json({ drivers: rows });
    } catch (err: any) {
      console.error('Error fetching provider drivers:', err);
      res.status(500).json({ error: 'Failed to fetch drivers' });
    }
  });

  // Territory CRUD (provider owner only)
  app.get('/api/team/my-provider/territories', requireDriverAuth, requireProviderOwner, async (_req: Request, res: Response) => {
    try {
      const territories = await storage.getTerritoriesForProvider(res.locals.provider.id);
      res.json({ territories });
    } catch (err: any) {
      console.error('Error fetching territories:', err);
      res.status(500).json({ error: 'Failed to fetch territories' });
    }
  });

  app.post('/api/team/my-provider/territories', requireDriverAuth, requireProviderOwner, async (req: Request, res: Response) => {
    try {
      const { name, zoneType, defaultPickupDay, color, polygonCoords, zipCodes } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const territory = await storage.createProviderTerritory({
        providerId: res.locals.provider.id,
        name,
        zone_type: zoneType || 'polygon',
        default_pickup_day: defaultPickupDay,
        color,
        polygon_coords: polygonCoords,
        zip_codes: zipCodes,
      });
      res.status(201).json({ territory });
    } catch (err: any) {
      console.error('Error creating territory:', err);
      res.status(500).json({ error: 'Failed to create territory' });
    }
  });

  app.put('/api/team/my-provider/territories/:id', requireDriverAuth, requireProviderOwner, async (req: Request, res: Response) => {
    try {
      // Verify ownership
      const { rows } = await pool.query(
        `SELECT id FROM provider_territories WHERE id = $1 AND provider_id = $2`,
        [req.params.id, res.locals.provider.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Territory not found' });
      const updated = await storage.updateProviderTerritory(req.params.id, req.body);
      res.json({ territory: updated });
    } catch (err: any) {
      console.error('Error updating territory:', err);
      res.status(500).json({ error: 'Failed to update territory' });
    }
  });

  app.delete('/api/team/my-provider/territories/:id', requireDriverAuth, requireProviderOwner, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT id FROM provider_territories WHERE id = $1 AND provider_id = $2`,
        [req.params.id, res.locals.provider.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Territory not found' });
      await storage.deleteProviderTerritory(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error deleting territory:', err);
      res.status(500).json({ error: 'Failed to delete territory' });
    }
  });

  // ============================================================
  // Client Invitations (provider sends to their existing customers)
  // ============================================================

  async function sendClientInvitationEmail(inv: any, providerName: string) {
    const baseUrl = process.env.APP_URL || 'https://app.ruralwm.com';
    const newAccountUrl = `${baseUrl}/?client-invite=${inv.token}`;
    const existingAccountUrl = `${baseUrl}/?client-invite=${inv.token}&action=redeem`;
    const subject = `${providerName} invited you to manage your waste pickup online`;
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#0f766e;">${providerName}</h2>
        <p>Hi ${inv.name || 'there'},</p>
        <p>${providerName} has invited you to manage your waste pickup service online through Rural Waste Management.</p>
        ${inv.address ? `<p><strong>Service address:</strong> ${inv.address}</p>` : ''}
        ${inv.can_size ? `<p><strong>Container size:</strong> ${inv.can_size}</p>` : ''}
        ${inv.collection_frequency ? `<p><strong>Pickup frequency:</strong> ${inv.collection_frequency}</p>` : ''}
        <div style="margin:32px 0;">
          <p><strong>New to Rural Waste Management?</strong></p>
          <a href="${newAccountUrl}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Create Your Account</a>
        </div>
        <div style="margin:32px 0;">
          <p><strong>Already have an account?</strong></p>
          <a href="${existingAccountUrl}" style="display:inline-block;background:#1e40af;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Sign In & Activate Service</a>
        </div>
        <p style="color:#6b7280;font-size:0.875rem;">This invitation expires in 90 days.</p>
      </div>
    `;
    await sendEmail(inv.email, subject, html);
  }

  async function recomputeProviderPolygon(providerId: string, providerName: string) {
    try {
      // Gather geocoded points from client invitations and registered locations
      const { rows: invRows } = await pool.query(
        `SELECT latitude, longitude FROM provider_client_invitations
         WHERE provider_id = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL`,
        [providerId]
      );
      const { rows: locRows } = await pool.query(
        `SELECT latitude, longitude
         FROM locations
         WHERE provider_id = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL`,
        [providerId]
      );
      const pts: [number, number][] = [
        ...invRows.map((r: any) => [Number(r.longitude), Number(r.latitude)] as [number, number]),
        ...locRows.map((r: any) => [Number(r.longitude), Number(r.latitude)] as [number, number]),
      ];
      if (pts.length < 3) return;

      const hull = convex(featureCollection(pts.map(([lng, lat]) => point([lng, lat]))));
      if (!hull) return;

      // polygon_coords format: array of [lat, lng] pairs (matching territoryAnalysisService convention)
      const coords = (hull.geometry.coordinates[0] as [number, number][]).map(([lng, lat]) => [lat, lng]);

      const existing = await storage.getTerritoriesForProvider(providerId);
      const polygonZone = existing.find((t: any) => t.zone_type === 'polygon');
      if (polygonZone) {
        await pool.query(
          `UPDATE provider_territories SET polygon_coords = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(coords), polygonZone.id]
        );
      } else {
        // Deactivate zip zones and create a polygon zone
        await pool.query(
          `UPDATE provider_territories SET status = 'inactive' WHERE provider_id = $1 AND zone_type = 'zipcode'`,
          [providerId]
        );
        await storage.createProviderTerritory({
          providerId,
          name: `${providerName} Service Area`,
          zone_type: 'polygon',
          polygon_coords: coords,
        });
      }
    } catch (err) {
      console.error('[PolygonRecompute] Failed for provider', providerId, err);
    }
  }

  app.get('/api/team/my-provider/client-invitations', requireDriverAuth, requireProviderOwner, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM provider_client_invitations WHERE provider_id = $1 ORDER BY created_at DESC`,
        [res.locals.provider.id]
      );
      res.json({ invitations: rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load client invitations' });
    }
  });

  app.get('/api/team/my-provider/clients', requireDriverAuth, requireProviderOwner, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT l.id, l.address, l.service_status, l.can_size, l.collection_day, l.notes,
                u.first_name || ' ' || u.last_name as name, u.email, u.phone
         FROM locations l
         JOIN users u ON u.id = l.user_id
         WHERE l.provider_id = $1
         ORDER BY l.created_at DESC`,
        [res.locals.provider.id]
      );
      res.json({ clients: rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load clients' });
    }
  });

  async function createAndSendClientInvitation(providerId: string, providerName: string, invitedBy: string, data: {
    name?: string; email: string; phone?: string; address?: string;
    can_size?: string; collection_frequency?: string; service_notes?: string;
  }) {
    const token = crypto.randomBytes(32).toString('hex');
    const { rows } = await pool.query(
      `INSERT INTO provider_client_invitations
         (provider_id, invited_by, name, email, phone, address, can_size, collection_frequency, service_notes, token, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
       RETURNING *`,
      [providerId, invitedBy, data.name || null, data.email, data.phone || null,
       data.address || null, data.can_size || null, data.collection_frequency || null, data.service_notes || null, token]
    );
    const inv = rows[0];

    // Geocode address if provided
    if (data.address) {
      geocodeAddress(data.address).then(async (geo) => {
        if (geo) {
          await pool.query(
            `UPDATE provider_client_invitations SET latitude = $1, longitude = $2 WHERE id = $3`,
            [geo.lat, geo.lng, inv.id]
          );
          // Recompute polygon after geocoding
          recomputeProviderPolygon(providerId, providerName).catch(() => {});
        }
      }).catch(() => {});
    }

    await sendClientInvitationEmail(inv, providerName);
    await pool.query(
      `UPDATE provider_client_invitations SET status = 'sent' WHERE id = $1`,
      [inv.id]
    );
    return { ...inv, status: 'sent' };
  }

  app.post('/api/team/my-provider/client-invitations', requireDriverAuth, requireProviderOwner, async (req: Request, res: Response) => {
    try {
      const { name, email, phone, address, can_size, collection_frequency, service_notes } = req.body;
      if (!email) return res.status(400).json({ error: 'email is required' });
      const provider = res.locals.provider;
      const inv = await createAndSendClientInvitation(provider.id, provider.name, req.session.userId!, {
        name, email, phone, address, can_size, collection_frequency, service_notes,
      });
      res.status(201).json({ invitation: inv });
    } catch (err: any) {
      console.error('Client invitation error:', err);
      res.status(500).json({ error: 'Failed to send client invitation' });
    }
  });

  app.post('/api/team/my-provider/client-invitations/bulk', requireDriverAuth, requireProviderOwner, async (req: Request, res: Response) => {
    try {
      const { clients } = req.body;
      if (!Array.isArray(clients) || clients.length === 0) {
        return res.status(400).json({ error: 'clients array is required' });
      }
      if (clients.length > 100) {
        return res.status(400).json({ error: 'Maximum 100 clients per bulk import' });
      }
      const provider = res.locals.provider;
      const results: { email: string; success: boolean; error?: string }[] = [];
      for (const client of clients) {
        if (!client.email) { results.push({ email: '', success: false, error: 'Missing email' }); continue; }
        try {
          await createAndSendClientInvitation(provider.id, provider.name, req.session.userId!, client);
          results.push({ email: client.email, success: true });
        } catch (err: any) {
          results.push({ email: client.email, success: false, error: err.message || 'Failed' });
        }
      }
      res.json({ results });
    } catch (err: any) {
      console.error('Bulk client invitation error:', err);
      res.status(500).json({ error: 'Failed to process bulk invitations' });
    }
  });

  app.delete('/api/team/my-provider/client-invitations/:id', requireDriverAuth, requireProviderOwner, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, status FROM provider_client_invitations WHERE id = $1 AND provider_id = $2`,
        [req.params.id, res.locals.provider.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Invitation not found' });
      if (rows[0].status === 'registered') {
        return res.status(400).json({ error: 'Cannot revoke a completed invitation' });
      }
      await pool.query(`DELETE FROM provider_client_invitations WHERE id = $1`, [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to revoke invitation' });
    }
  });

  app.post('/api/team/my-provider/client-invitations/:id/resend', requireDriverAuth, requireProviderOwner, async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM provider_client_invitations WHERE id = $1 AND provider_id = $2`,
        [req.params.id, res.locals.provider.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Invitation not found' });
      const inv = rows[0];
      if (inv.status === 'registered') {
        return res.status(400).json({ error: 'Client already registered' });
      }
      await sendClientInvitationEmail(inv, res.locals.provider.name);
      await pool.query(
        `UPDATE provider_client_invitations SET status = 'sent', updated_at = NOW() WHERE id = $1`,
        [req.params.id]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to resend invitation' });
    }
  });

  app.post('/api/team/my-provider/territories/recompute', requireDriverAuth, requireProviderOwner, async (_req: Request, res: Response) => {
    try {
      const provider = res.locals.provider;
      await recomputeProviderPolygon(provider.id, provider.name);
      const territories = await storage.getTerritoriesForProvider(provider.id);
      res.json({ success: true, territories });
    } catch (err) {
      res.status(500).json({ error: 'Failed to recompute territory' });
    }
  });

  // Driver joins a provider by slug (authenticated driver, no existing membership required)
  app.post('/api/team/provider/:slug/join', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const userId = req.session.userId!;
      const providerResult = await pool.query(
        `SELECT id, name FROM providers WHERE slug = $1 AND approval_status = 'approved'`,
        [slug]
      );
      if (providerResult.rowCount === 0) return res.status(404).json({ error: 'Provider not found' });
      const provider = providerResult.rows[0];

      // Check if already a member
      const existing = await pool.query(
        `SELECT pm.id
         FROM provider_members pm
         WHERE pm.user_id = $1
           AND pm.provider_id = $2
           AND pm.status = 'active'`,
        [userId, provider.id]
      );
      if (existing.rowCount! > 0) return res.status(409).json({ error: 'Already a member of this provider' });

      // Get driver profile (create if needed)
      let driverProfile = await storage.getDriverProfileByUserId(userId);
      if (!driverProfile) {
        const user = await storage.getUserById(userId);
        driverProfile = await storage.createDriverProfile({
          userId,
          name: `${user?.first_name || ''} ${user?.last_name || ''}`.trim(),
        });
      }

      // Get default role for this provider
      const roles = await storage.getProviderRoles(provider.id);
      const defaultRole = roles.find((r: any) => r.is_default_role) || roles[0];

      await storage.addProviderMember({
        providerId: provider.id,
        userId,
        roleId: defaultRole?.id || null,
        employmentType: 'contractor',
      });

      res.json({ success: true, provider: { id: provider.id, name: provider.name } });
    } catch (err: any) {
      console.error('Provider join error:', err);
      res.status(500).json({ error: 'Failed to join provider' });
    }
  });

  // ============================================================
  // Contract Renewal Requests
  // ============================================================

  // Submit a renewal request
  app.post('/api/team/contracts/:id/renewal-request', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const contractId = req.params.id;

      // Verify contract belongs to driver
      const { rows: contractRows } = await pool.query(
        `SELECT rc.id, rc.status, dp.name as driver_name
         FROM route_contracts rc
         JOIN driver_profiles dp ON dp.id = $2
         WHERE rc.id = $1 AND rc.driver_id = $2`,
        [contractId, driverId]
      );
      if (contractRows.length === 0) return res.status(404).json({ error: 'Contract not found' });
      const contract = contractRows[0];
      if (!['active', 'expired'].includes(contract.status)) {
        return res.status(400).json({ error: 'Can only request renewal for active or expired contracts' });
      }

      // Check for existing pending request
      const { rows: existing } = await pool.query(
        `SELECT id FROM contract_renewal_requests WHERE contract_id = $1 AND driver_id = $2 AND status = 'pending'`,
        [contractId, driverId]
      );
      if (existing.length > 0) return res.status(409).json({ error: 'A pending renewal request already exists for this contract' });

      const { proposedRate, proposedEndDate, message } = req.body;

      const { rows } = await pool.query(
        `INSERT INTO contract_renewal_requests (contract_id, driver_id, proposed_rate, proposed_end_date, message)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, contract_id, proposed_rate, proposed_end_date, message, status, created_at`,
        [contractId, driverId, proposedRate ?? null, proposedEndDate ?? null, message ?? null]
      );

      notifyContractRenewalRequest(contract.driver_name, contractId, proposedRate ?? null, proposedEndDate ?? null).catch(() => {});
      res.status(201).json({ renewalRequest: rows[0] });
    } catch (err: any) {
      console.error('Error submitting renewal request:', err);
      res.status(500).json({ error: 'Failed to submit renewal request' });
    }
  });

  // Get latest renewal request for a contract
  app.get('/api/team/contracts/:id/renewal-request', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const contractId = req.params.id;

      const { rows } = await pool.query(
        `SELECT crr.id, crr.contract_id, crr.proposed_rate, crr.proposed_end_date, crr.message,
                crr.status, crr.admin_notes, crr.counter_rate, crr.counter_end_date, crr.created_at, crr.updated_at
         FROM contract_renewal_requests crr
         JOIN route_contracts rc ON rc.id = crr.contract_id
         WHERE crr.contract_id = $1 AND crr.driver_id = $2
         ORDER BY crr.created_at DESC
         LIMIT 1`,
        [contractId, driverId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'No renewal request found' });
      res.json({ renewalRequest: rows[0] });
    } catch (err: any) {
      console.error('Error fetching renewal request:', err);
      res.status(500).json({ error: 'Failed to fetch renewal request' });
    }
  });

  // Driver accepts admin counter offer
  app.post('/api/team/contracts/:id/renewal-request/accept-counter', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const contractId = req.params.id;

      // Get the countered request
      const { rows: rqRows } = await pool.query(
        `SELECT crr.id, crr.counter_rate, crr.counter_end_date
         FROM contract_renewal_requests crr
         WHERE crr.contract_id = $1 AND crr.driver_id = $2 AND crr.status = 'countered'
         ORDER BY crr.created_at DESC LIMIT 1`,
        [contractId, driverId]
      );
      if (rqRows.length === 0) return res.status(404).json({ error: 'No counter offer found' });
      const rq = rqRows[0];

      // Get contract details for renewal
      const { rows: contractRows } = await pool.query(
        `SELECT rc.*, dp.user_id as driver_user_id
         FROM route_contracts rc
         JOIN driver_profiles dp ON dp.id = rc.driver_id
         WHERE rc.id = $1 AND rc.driver_id = $2`,
        [contractId, driverId]
      );
      if (contractRows.length === 0) return res.status(404).json({ error: 'Contract not found' });
      const contract = contractRows[0];

      // Compute new end date
      const currentEnd = new Date(contract.end_date);
      const currentStart = new Date(contract.start_date);
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      const newStartDate = rq.counter_end_date ? new Date(contract.end_date) : currentEnd;
      const newEndDate = rq.counter_end_date
        ? new Date(rq.counter_end_date)
        : new Date(currentEnd.getTime() + durationMs);
      const newRate = rq.counter_rate ?? contract.per_stop_rate;

      // Create renewed contract
      const { rows: newContractRows } = await pool.query(
        `INSERT INTO route_contracts (driver_id, zone_id, custom_zone_id, day_of_week, per_stop_rate,
           start_date, end_date, status, renewed_from_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
         RETURNING id`,
        [contract.driver_id, contract.zone_id, contract.custom_zone_id, contract.day_of_week,
         newRate, newStartDate.toISOString().split('T')[0], newEndDate.toISOString().split('T')[0], contractId]
      );

      // Mark old contract renewed, update renewal request
      await pool.query(`UPDATE route_contracts SET status = 'renewed' WHERE id = $1`, [contractId]);
      await pool.query(
        `UPDATE contract_renewal_requests SET status = 'approved', updated_at = NOW() WHERE id = $1`,
        [rq.id]
      );

      res.json({ success: true, newContractId: newContractRows[0].id });
    } catch (err: any) {
      console.error('Error accepting counter offer:', err);
      res.status(500).json({ error: 'Failed to accept counter offer' });
    }
  });

  // ============================================================
  // Team Messaging
  // ============================================================

  app.get('/api/team/conversations', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { rows } = await pool.query(
        `SELECT
            c.id, c.subject, c.status, c.updated_at as last_message_at,
            (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
            (SELECT COUNT(*) FROM messages m JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
             WHERE cp.conversation_id = c.id AND cp.participant_id = $1 AND cp.participant_type = 'driver'
               AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count
         FROM conversations c
         JOIN conversation_participants cp ON c.id = cp.conversation_id
         WHERE cp.participant_id = $1 AND cp.participant_type = 'driver'
         ORDER BY c.updated_at DESC`,
        [driverId]
      );
      res.json(rows);
    } catch (err: any) {
      console.error('Error fetching driver conversations:', err);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.get('/api/team/conversations/unread-count', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { rows } = await pool.query(
        `SELECT COUNT(DISTINCT c.id)
         FROM conversations c
         JOIN conversation_participants cp ON c.id = cp.conversation_id
         JOIN messages m ON c.id = m.conversation_id
         WHERE cp.participant_id = $1 AND cp.participant_type = 'driver'
           AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')
           AND m.sender_id != $1`,
        [driverId]
      );
      res.json({ count: parseInt(rows[0].count, 10) || 0 });
    } catch (err: any) {
      console.error('Error fetching driver unread count:', err);
      res.status(500).json({ error: 'Failed to fetch unread count' });
    }
  });

  app.get('/api/team/conversations/:id/messages', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const conversationId = req.params.id;
      // Verify driver is a participant
      const participation = await pool.query(
        'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND participant_id = $2 AND participant_type = $3',
        [conversationId, driverId, 'driver']
      );
      if (participation.rows.length === 0) {
        return res.status(403).json({ error: 'Not a participant' });
      }
      const { rows } = await pool.query(
        `SELECT
            m.id, m.conversation_id, m.sender_id, m.sender_type, m.body, m.created_at,
            CASE
              WHEN m.sender_type = 'driver' THEN dp.name
              WHEN m.sender_type = 'admin' THEN u.first_name || ' ' || u.last_name
              ELSE 'System'
            END as sender_name
         FROM messages m
         LEFT JOIN driver_profiles dp ON m.sender_id = dp.id AND m.sender_type = 'driver'
         LEFT JOIN users u ON m.sender_id = u.id AND m.sender_type = 'admin'
         WHERE m.conversation_id = $1
         ORDER BY m.created_at ASC`,
        [conversationId]
      );
      res.json(rows);
    } catch (err: any) {
      console.error('Error fetching messages:', err);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.post('/api/team/conversations/:id/messages', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const conversationId = req.params.id;
      const { body } = req.body;
      if (!body || !body.trim()) {
        return res.status(400).json({ error: 'Message body is required' });
      }

      // Verify driver is a participant
      const participation = await pool.query(
        'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND participant_id = $2 AND participant_type = $3',
        [conversationId, driverId, 'driver']
      );
      if (participation.rows.length === 0) {
        return res.status(403).json({ error: 'Not a participant' });
      }

      const { rows } = await pool.query(
        'INSERT INTO messages (conversation_id, sender_id, sender_type, body) VALUES ($1, $2, $3, $4) RETURNING *',
        [conversationId, driverId, 'driver', body.trim()]
      );
      const newMessage = rows[0];

      await pool.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
      
      const { webSocketManager } = await import('./websocket');
      webSocketManager.broadcastToConversation(conversationId, { event: 'message:new', data: { conversationId, message: newMessage } });

      res.status(201).json(newMessage);
    } catch (err: any) {
      console.error('Error sending message:', err);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  app.put('/api/team/conversations/:id/read', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const conversationId = req.params.id;
      await pool.query(
        'UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND participant_id = $2 AND participant_type = $3',
        [conversationId, driverId, 'driver']
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error marking conversation as read:', err);
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  });

  app.post('/api/team/conversations/new', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { subject, body } = req.body;
      if (!body || !body.trim()) {
        return res.status(400).json({ error: 'Message body is required' });
      }

      // Find an admin to assign the conversation to
      const adminResult = await pool.query(
        `SELECT u.id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         WHERE ur.role = 'admin'
         LIMIT 1`
      );
      if (adminResult.rows.length === 0) {
        return res.status(500).json({ error: 'No support staff available' });
      }
      const adminId = adminResult.rows[0].id;
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const convResult = await client.query(
          'INSERT INTO conversations (subject, created_by_id, created_by_type) VALUES ($1, $2, $3) RETURNING *',
          [subject || 'Support Request', driverId, 'driver']
        );
        const conversation = convResult.rows[0];

        // Add driver as participant
        await client.query(
          'INSERT INTO conversation_participants (conversation_id, participant_id, participant_type) VALUES ($1, $2, $3)',
          [conversation.id, driverId, 'driver']
        );

        // Add admin as participant
        await client.query(
          'INSERT INTO conversation_participants (conversation_id, participant_id, participant_type, role) VALUES ($1, $2, $3, $4)',
          [conversation.id, adminId, 'admin', 'owner']
        );

        // Add initial message
        await client.query(
          'INSERT INTO messages (conversation_id, sender_id, sender_type, body) VALUES ($1, $2, $3, $4)',
          [conversation.id, driverId, 'driver', body.trim()]
        );
        
        await client.query('COMMIT');

        const { webSocketManager } = await import('./websocket');
        webSocketManager.broadcastToAdmins({ event: 'conversation:new', data: { conversation } });

        res.status(201).json({ conversation });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('Error creating conversation:', err);
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  });

  // Driver leaderboard — weekly/monthly rankings
  app.get('/api/team/leaderboard', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const period = (req.query.period as string) || 'weekly';
      const interval = period === 'monthly' ? '30 days' : '7 days';

      const result = await pool.query(
        `SELECT
           dp.id AS driver_id,
           dp.name,
           dp.rating,
           dp.reliability_score,
           COUNT(r.id) FILTER (WHERE r.status = 'completed')::int AS completed_routes,
           COUNT(rs.id) FILTER (WHERE rs.status = 'completed')::int AS completed_orders,
           COALESCE(SUM(r.computed_value) FILTER (WHERE r.status = 'completed'), 0)::numeric(10,2) AS total_earnings,
           COALESCE(AVG(df.rating), dp.rating)::numeric(3,2) AS period_rating
         FROM driver_profiles dp
         LEFT JOIN routes r ON r.assigned_driver_id = dp.id
           AND r.scheduled_date >= CURRENT_DATE - $1::interval
         LEFT JOIN route_orders rs ON rs.route_id = r.id
         LEFT JOIN driver_feedback df ON df.driver_id = dp.id
           AND df.created_at >= CURRENT_DATE - $1::interval
         WHERE dp.onboarding_status = 'completed'
         GROUP BY dp.id
         HAVING COUNT(r.id) FILTER (WHERE r.status = 'completed') > 0
         ORDER BY completed_orders DESC, period_rating DESC
         LIMIT 25`,
        [interval]
      );

      const driverId = res.locals.driverProfile.id;
      const leaderboard = result.rows.map((r: any, i: number) => ({
        rank: i + 1,
        driverId: r.driver_id,
        name: r.driver_id === driverId ? r.name : r.name.split(' ')[0] + ' ' + (r.name.split(' ')[1]?.[0] || '') + '.',
        rating: parseFloat(r.period_rating) || 0,
        reliabilityScore: parseFloat(r.reliability_score) || 0,
        completedRoutes: r.completed_routes,
        completedOrders: r.completed_orders,
        totalEarnings: r.driver_id === driverId ? parseFloat(r.total_earnings) : undefined, // Only show own earnings
        isYou: r.driver_id === driverId,
      }));

      res.json({ data: leaderboard, period });
    } catch (error: any) {
      console.error('Leaderboard error:', error);
      res.status(500).json({ error: 'Failed to get leaderboard' });
    }
  });

  // Surge pricing: current surges visible to drivers
  app.get('/api/team/surge-zones', requireDriverAuth, async (_req: Request, res: Response) => {
    try {
      const { getCurrentSurges } = await import('./surgePricingEngine');
      const surges = await getCurrentSurges();
      res.json({ data: surges.map(s => ({ zoneId: s.zoneId, zoneName: s.zoneName, multiplier: s.multiplier })) });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get surge zones' });
    }
  });

  // Push notifications: subscribe (driver)
  app.post('/api/team/push/subscribe', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const userId = res.locals.driverProfile.user_id;
      const { subscription } = req.body;
      if (!subscription?.endpoint || !subscription?.keys) {
        return res.status(400).json({ error: 'Invalid subscription' });
      }
      const { saveSubscription } = await import('./pushService');
      await saveSubscription(userId, subscription, req.headers['user-agent']);
      res.json({ success: true });
    } catch (error) {
      console.error('Push subscribe error:', error);
      res.status(500).json({ error: 'Failed to subscribe' });
    }
  });

  // Push notifications: unsubscribe (driver)
  app.post('/api/team/push/unsubscribe', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const { endpoint } = req.body;
      if (endpoint) {
        const { removeSubscription } = await import('./pushService');
        await removeSubscription(endpoint);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to unsubscribe' });
    }
  });

  // Driver views their rating history
  app.get('/api/team/ratings', requireDriverAuth, async (_req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const result = await pool.query(
        `SELECT df.rating, df.comment, df.created_at,
                r.title AS route_title, r.scheduled_date
         FROM driver_feedback df
         LEFT JOIN routes r ON r.id = df.route_id
         WHERE df.driver_id = $1
         ORDER BY df.created_at DESC
         LIMIT 50`,
        [driverId]
      );
      const avgResult = await pool.query(
        `SELECT AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*)::int AS total
         FROM driver_feedback WHERE driver_id = $1`,
        [driverId]
      );
      res.json({
        data: result.rows,
        summary: {
          averageRating: parseFloat(avgResult.rows[0]?.avg_rating) || 0,
          totalRatings: avgResult.rows[0]?.total || 0,
        },
      });
    } catch (error: any) {
      console.error('Get ratings error:', error);
      res.status(500).json({ error: 'Failed to get ratings' });
    }
  });


  // ============================================================
  // PROVIDER ONBOARDING ENDPOINTS
  // ============================================================

  app.get('/api/team/provider/onboarding', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'Provider not found' });
      const territories = await storage.getTerritoriesForProvider(provider.id);
      res.json({ data: { ...provider, territories } });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load onboarding state' });
    }
  });

  app.put('/api/team/provider/onboarding/business-info', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'Provider not found' });
      const { companyName, businessType, contactPhone, contactEmail, website, serviceDescription, isSoloOperator } = req.body;

      // Generate slug when company name is first provided (e.g., Google OAuth providers start with no name/slug)
      if (companyName && !provider.slug) {
        const baseSlug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || provider.id.slice(0, 8);
        let slug = baseSlug;
        let suffix = 2;
        while (true) {
          const existing = await pool.query(`SELECT id FROM providers WHERE slug = $1 AND id != $2`, [slug, provider.id]);
          if (existing.rowCount === 0) break;
          slug = `${baseSlug}-${suffix++}`;
        }
        await pool.query(`UPDATE providers SET slug = $1 WHERE id = $2`, [slug, provider.id]);
      }

      const updated = await storage.updateProvider(provider.id, {
        name: companyName || provider.name,
        business_type: businessType,
        contact_phone: contactPhone,
        contact_email: contactEmail,
        website,
        service_description: serviceDescription,
        is_solo_operator: isSoloOperator === true,
        onboarding_step: Math.max(provider.onboarding_step || 1, 2),
      });
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save business info' });
    }
  });

  app.post('/api/team/provider/onboarding/insurance', requireDriverAuth, providerUpload.single('insurance_cert'), async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'Provider not found' });
      const { licenseNumber, insuranceExpiresAt } = req.body;
      const updateData: any = {
        license_number: licenseNumber,
        onboarding_step: Math.max(provider.onboarding_step || 1, 3),
      };
      if (req.file) {
        updateData.insurance_cert_url = `/uploads/providers/${req.file.filename}`;
      }
      if (insuranceExpiresAt) {
        updateData.insurance_expires_at = insuranceExpiresAt;
      }
      const updated = await storage.updateProvider(provider.id, updateData);
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save insurance info' });
    }
  });

  app.put('/api/team/provider/onboarding/service-area', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'Provider not found' });
      const { zipCodes } = req.body;
      if (zipCodes && Array.isArray(zipCodes) && zipCodes.length > 0) {
        // Replace existing territories with the new set
        const existing = await storage.getTerritoriesForProvider(provider.id);
        for (const t of existing) {
          await storage.deleteProviderTerritory(t.id);
        }
        await storage.createProviderTerritory({
          providerId: provider.id,
          name: 'Primary Service Area',
          zone_type: 'zipcode',
          zip_codes: zipCodes,
        });
      }
      const updated = await storage.updateProvider(provider.id, {
        onboarding_step: Math.max(provider.onboarding_step || 1, 4),
      });
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save service area' });
    }
  });

  // ── Provider Stripe Connect (V2 API) ──────────────────────────────────
  // Creates a V2 Connected Account where the platform collects fees/losses.
  // Uses Account Links V2 for onboarding and V2 account retrieval for status.
  app.post('/api/team/provider/onboarding/stripe', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'Provider not found' });

      // Create a Stripe Client (SDK auto-uses latest API version)
      const stripeClient = await getUncachableStripeClient();

      // Resolve base URL for redirect URLs
      const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
      const appDomain = process.env.APP_DOMAIN;
      let baseUrl: string;
      if (replitDomain) {
        baseUrl = `https://${replitDomain}`;
      } else if (appDomain) {
        baseUrl = appDomain;
      } else {
        baseUrl = 'http://localhost:5000';
      }

      let accountId = provider.stripe_account_id;

      // If the provider has an old V1 account (acct_ prefix), clear it and create a fresh V2 account.
      // V1 accounts don't have the 'recipient' configuration required by V2 account links.
      if (accountId && accountId.startsWith('acct_')) {
        console.log(`[Stripe Connect] Replacing V1 account ${accountId} with V2 account for provider ${provider.id}`);
        accountId = null as any;
        await storage.updateProvider(provider.id, { stripe_account_id: null as any });
      }

      if (!accountId) {
        // Create a V2 Connected Account.
        // - dashboard: 'express' gives them a Stripe-hosted dashboard
        // - responsibilities: platform collects fees and covers losses
        // - capabilities: enable stripe_transfers so the account can receive payouts
        const user = await storage.getUserById(req.session.userId!);
        const account = await stripeClient.v2.core.accounts.create({
          display_name: provider.name || user?.firstName || 'Provider',
          contact_email: provider.contact_email || user?.email || undefined,
          identity: {
            country: 'us',
          },
          dashboard: 'express',
          defaults: {
            responsibilities: {
              fees_collector: 'application',
              losses_collector: 'application',
            },
          },
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: {
                  stripe_transfers: {
                    requested: true,
                  },
                },
              },
            },
          },
        });
        accountId = account.id;
        await storage.updateProvider(provider.id, { stripe_account_id: accountId });
      }

      // Create a V2 Account Link to redirect the provider to Stripe onboarding.
      // - configurations: ['recipient'] matches the capability we requested on the V2 account
      // - refresh_url: if the link expires, send them back to retry
      // - return_url: after completing onboarding, redirect back to our app
      const accountLink = await stripeClient.v2.core.accountLinks.create({
        account: accountId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            configurations: ['recipient'],
            refresh_url: `${baseUrl}/provider?stripe_refresh=1`,
            return_url: `${baseUrl}/provider?stripe_return=1`,
          },
        },
      });

      res.json({ data: { url: accountLink.url, accountId } });
    } catch (err: any) {
      console.error('Provider Stripe Connect error:', err);
      res.status(500).json({ error: err.message || 'Failed to create Stripe account' });
    }
  });

  // Check onboarding & payment readiness using the V2 accounts API.
  // Always fetches fresh status from Stripe (not cached).
  app.get('/api/team/provider/onboarding/stripe/status', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider?.stripe_account_id) return res.json({ data: { onboarded: false } });

      const stripeClient = await getUncachableStripeClient();

      // Retrieve the V2 account with expanded configuration and requirements.
      // The `include` parameter fetches nested objects not returned by default.
      const account = await stripeClient.v2.core.accounts.retrieve(provider.stripe_account_id, {
        include: ['configuration.recipient', 'requirements'],
      });

      // Check if the account can receive payments:
      // stripe_transfers.status === 'active' means fully set up
      const readyToReceivePayments =
        account?.configuration?.recipient?.capabilities?.stripe_balance
          ?.stripe_transfers?.status === 'active';

      // Check if onboarding requirements are satisfied:
      // 'currently_due' or 'past_due' means more info is needed
      const requirementsStatus =
        account.requirements?.summary?.minimum_deadline?.status;
      const onboardingComplete =
        requirementsStatus !== 'currently_due' && requirementsStatus !== 'past_due';

      // Consider "onboarded" if either transfers are active OR requirements are done
      const onboarded = readyToReceivePayments || onboardingComplete;

      if (onboarded && (provider.onboarding_step || 1) < 5) {
        await storage.updateProvider(provider.id, { onboarding_step: 5 });
      }

      res.json({
        data: {
          onboarded,
          readyToReceivePayments,
          onboardingComplete,
          requirementsStatus: requirementsStatus || 'none',
          accountId: provider.stripe_account_id,
        },
      });
    } catch (err: any) {
      console.error('Provider Stripe status error:', err);
      res.status(500).json({ error: 'Failed to check Stripe status' });
    }
  });

  app.post('/api/team/provider/onboarding/submit', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const provider = await storage.getProviderByOwnerUserId(userId);
      if (!provider) return res.status(404).json({ error: 'Provider not found' });
      if (provider.approval_status === 'approved') {
        return res.status(400).json({ error: 'Provider is already approved' });
      }
      const updated = await storage.updateProvider(provider.id, {
        approval_status: 'pending_review',
        onboarding_step: 5,
      });
      const user = await storage.getUserById(userId);
      notifyNewProviderApplication(
        provider.name,
        `${user?.first_name} ${user?.last_name}`
      ).catch(() => {});
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to submit application' });
    }
  });

  // ============================================================
  // PROVIDER PROFILE
  // ============================================================

  app.put('/api/team/my-provider/profile', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'Provider not found' });
      const { companyName, contactPhone, contactEmail, website, serviceDescription, logoUrl } = req.body;
      const updated = await storage.updateProvider(provider.id, {
        name: companyName,
        contact_phone: contactPhone,
        contact_email: contactEmail,
        website,
        service_description: serviceDescription,
        logo_url: logoUrl,
      });
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update company profile' });
    }
  });

  // ============================================================
  // FLEET MANAGEMENT
  // ============================================================

  app.get('/api/team/my-provider/vehicles', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const vehicles = await storage.getProviderVehicles(provider.id);
      res.json({ data: vehicles });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load fleet' });
    }
  });

  app.post('/api/team/my-provider/vehicles', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const vehicle = await storage.createProviderVehicle({ providerId: provider.id, ...req.body });
      res.status(201).json({ data: vehicle });
    } catch (err) {
      res.status(500).json({ error: 'Failed to add vehicle' });
    }
  });

  app.put('/api/team/my-provider/vehicles/:id', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const vehicles = await storage.getProviderVehicles(provider.id);
      if (!vehicles.find((v: any) => v.id === req.params.id)) {
        return res.status(404).json({ error: 'Vehicle not found' });
      }
      const updated = await storage.updateProviderVehicle(req.params.id, req.body);
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update vehicle' });
    }
  });

  app.delete('/api/team/my-provider/vehicles/:id', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      await storage.deleteProviderVehicle(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to delete vehicle' });
    }
  });

  // ============================================================
  // TEAM MANAGEMENT
  // ============================================================

  app.get('/api/team/my-provider/members', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const members = await storage.getProviderMembers(provider.id);
      res.json({ data: members });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load team members' });
    }
  });

  app.post('/api/team/my-provider/invite', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const provider = await storage.getProviderByOwnerUserId(userId);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      if (provider.approval_status !== 'approved') {
        return res.status(403).json({ error: 'Provider must be approved before inviting team members' });
      }
      const { email, phone, name, roleId, employmentType } = req.body;
      if (!email && !phone) return res.status(400).json({ error: 'Email or phone required' });
      const token = crypto.randomBytes(32).toString('hex');
      const invitation = await storage.createProviderInvitation({
        email, phone, name, providerId: provider.id,
        roleId, employmentType, invitedBy: userId, token,
      });
      // TODO: Send email/SMS invite via Gmail + Twilio (use invitation routes pattern)
      res.status(201).json({ data: invitation });
    } catch (err) {
      res.status(500).json({ error: 'Failed to send invitation' });
    }
  });

  app.get('/api/team/my-provider/invitations', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const invitations = await storage.getInvitationsForProvider(provider.id);
      res.json({ data: invitations });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load invitations' });
    }
  });

  app.delete('/api/team/my-provider/invitations/:id', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      await storage.revokeInvitation(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to revoke invitation' });
    }
  });

  app.patch('/api/team/my-provider/members/:id/role', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const { roleId } = req.body;
      const updated = await storage.updateProviderMember(req.params.id, { role_id: roleId });
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update member role' });
    }
  });

  app.patch('/api/team/my-provider/members/:id/optimo-id', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const members = await storage.getProviderMembers(provider.id);
      const member = members.find((m: any) => m.id === req.params.id);
      if (!member) return res.status(404).json({ error: 'Member not found' });
      if (!member.driver_profile_id) return res.status(400).json({ error: 'Member does not have a driver profile' });
      const { optimorouteDriverId } = req.body;
      await storage.updateDriver(member.driver_profile_id, { optimoroute_driver_id: optimorouteDriverId });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update OptimoRoute ID' });
    }
  });

  app.delete('/api/team/my-provider/members/:id', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const provider = await storage.getProviderByOwnerUserId(userId);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const members = await storage.getProviderMembers(provider.id);
      const member = members.find((m: any) => m.id === req.params.id);
      if (!member) return res.status(404).json({ error: 'Member not found' });
      if (member.is_owner_role) return res.status(400).json({ error: 'Cannot remove the company owner' });
      // Guard: check for active dispatched routes
      const activeRoutes = await pool.query(
        `SELECT COUNT(*) AS cnt FROM routes
         WHERE assigned_driver_id = $1 AND status NOT IN ('completed','cancelled')`,
        [member.driver_profile_id]
      );
      if (parseInt(activeRoutes.rows[0].cnt) > 0) {
        return res.status(400).json({ error: 'Cannot remove member with active dispatched routes' });
      }
      await storage.removeProviderMember(provider.id, member.user_id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to remove member' });
    }
  });

  // ============================================================
  // ROLE MANAGEMENT
  // ============================================================

  app.get('/api/team/my-provider/roles', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const roles = await storage.getProviderRoles(provider.id);
      res.json({ data: roles });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load roles' });
    }
  });

  app.post('/api/team/my-provider/roles', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const { name, permissions } = req.body;
      if (!name) return res.status(400).json({ error: 'Role name required' });
      const role = await storage.createProviderRole({ providerId: provider.id, name, permissions: permissions || {} });
      res.status(201).json({ data: role });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create role' });
    }
  });

  app.put('/api/team/my-provider/roles/:id', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const role = await storage.getProviderRoleById(req.params.id);
      if (!role) return res.status(404).json({ error: 'Role not found' });
      if (role.is_owner_role) return res.status(400).json({ error: 'Cannot modify the Owner role' });
      const updated = await storage.updateProviderRole(req.params.id, req.body);
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update role' });
    }
  });

  app.delete('/api/team/my-provider/roles/:id', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteProviderRole(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to delete role' });
    }
  });

  // ============================================================
  // ROUTE DISPATCH
  // ============================================================

  app.get('/api/team/my-provider/routes', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const routes = await storage.getProviderRoutes(provider.id);
      res.json({ data: routes });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load routes' });
    }
  });

  app.post('/api/team/my-provider/routes/:routeId/dispatch', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const { driverId, vehicleId } = req.body;
      if (!driverId) return res.status(400).json({ error: 'driverId required' });

      // Validate driver belongs to provider and has execute_routes
      const members = await storage.getProviderMembers(provider.id);
      const member = members.find((m: any) => m.driver_profile_id === driverId);
      if (!member) return res.status(400).json({ error: 'Driver is not a member of this company' });
      if (!member.permissions?.execute_routes) {
        return res.status(400).json({ error: 'Driver does not have route execution permission' });
      }
      if (!member.optimoroute_driver_id) {
        return res.status(400).json({
          error: 'This driver does not have an OptimoRoute ID set. Please add it in Team Management before dispatching.',
        });
      }

      // Check vehicle belongs to this provider and is active
      if (vehicleId) {
        const vehicles = await storage.getProviderVehicles(provider.id);
        const vehicle = vehicles.find((v: any) => v.id === vehicleId);
        if (!vehicle) return res.status(400).json({ error: 'Vehicle not found in fleet' });
        if (vehicle.status !== 'active') return res.status(400).json({ error: 'Vehicle is not active' });
        // Check registration expiry
        if (vehicle.registration_expires_at && new Date(vehicle.registration_expires_at) < new Date()) {
          return res.status(400).json({ error: 'Vehicle registration has expired and cannot be dispatched' });
        }
      }

      const updated = await storage.dispatchRouteToDriver(req.params.routeId, provider.id, driverId, vehicleId || null);
      if (!updated) return res.status(404).json({ error: 'Route not found or not assigned to this company' });

      // Notify driver
      sendDriverNotification(driverId, 'route_dispatched', { routeId: req.params.routeId }).catch(() => {});
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to dispatch route' });
    }
  });

  app.post('/api/team/my-provider/routes/:routeId/recall', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const updated = await storage.recallRouteDispatch(req.params.routeId, provider.id);
      if (!updated) return res.status(404).json({ error: 'Route not found or not assigned to this company' });
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to recall dispatch' });
    }
  });

  app.post('/api/team/my-provider/routes/:routeId/decline', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      if (!reason?.trim()) return res.status(400).json({ error: 'Decline reason required' });
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const updated = await storage.declineRouteAsProvider(req.params.routeId, provider.id, reason);
      if (!updated) return res.status(404).json({ error: 'Route not found or not assigned to this company' });
      // Notify admins
      broadcastToAdmins({ type: 'route_declined_by_provider', routeId: req.params.routeId, providerName: provider.name, reason });
      res.json({ data: updated });
    } catch (err) {
      res.status(500).json({ error: 'Failed to decline route' });
    }
  });

  // ============================================================
  // PROVIDER ACCOUNTING
  // ============================================================

  app.get('/api/team/my-provider/accounting/summary', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const { from, to } = req.query as { from: string; to: string };
      if (!from || !to) return res.status(400).json({ error: 'from and to query params required' });
      const summary = await storage.getProviderRevenueSummary(provider.id, from, to);
      res.json({ data: summary });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load accounting summary' });
    }
  });

  app.get('/api/team/my-provider/accounting/payments', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const { from, to, limit, offset } = req.query as any;
      const payments = await storage.getProviderPaymentHistory(
        provider.id, from, to,
        parseInt(limit) || 50, parseInt(offset) || 0
      );
      res.json({ data: payments });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load payment history' });
    }
  });

  app.get('/api/team/my-provider/accounting/breakdown/drivers', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const { from, to } = req.query as { from: string; to: string };
      const breakdown = await storage.getProviderEarningsBreakdownByDriver(provider.id, from, to);
      res.json({ data: breakdown });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load driver breakdown' });
    }
  });

  app.get('/api/team/my-provider/accounting/breakdown/vehicles', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderByOwnerUserId(req.session.userId!);
      if (!provider) return res.status(404).json({ error: 'No provider found' });
      const { from, to } = req.query as { from: string; to: string };
      const breakdown = await storage.getProviderEarningsBreakdownByVehicle(provider.id, from, to);
      res.json({ data: breakdown });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load vehicle breakdown' });
    }
  });

}

function mapProposal(r: any) {
  return {
    id: r.id,
    proposedZoneName: r.proposed_zone_name,
    zoneType: r.zone_type,
    centerLat: r.center_lat != null ? Number(r.center_lat) : null,
    centerLng: r.center_lng != null ? Number(r.center_lng) : null,
    radiusMiles: r.radius_miles != null ? Number(r.radius_miles) : null,
    polygonCoords: r.polygon_coords,
    zipCodes: r.zip_codes,
    daysOfWeek: r.days_of_week,
    proposedRate: r.proposed_rate != null ? Number(r.proposed_rate) : null,
    notes: r.notes,
    status: r.status,
    adminNotes: r.admin_notes,
    convertedOpportunityId: r.converted_opportunity_id,
    createdAt: r.created_at,
  };
}

function formatDriverForClient(driverProfile: any, user?: any, provider?: { id: string; name: string; isOwner: boolean } | null) {
  return {
    id: driverProfile.id,
    userId: driverProfile.user_id,
    name: driverProfile.name,
    email: user?.email || driverProfile.email || driverProfile.user_email,
    phone: user?.phone || driverProfile.phone || driverProfile.user_phone,
    status: driverProfile.status,
    onboarding_status: driverProfile.onboarding_status,
    rating: driverProfile.rating,
    total_jobs_completed: driverProfile.total_jobs_completed,
    w9_completed: driverProfile.w9_completed || false,
    direct_deposit_completed: driverProfile.direct_deposit_completed || false,
    stripe_connect_onboarded: driverProfile.stripe_connect_onboarded || false,
    availability: driverProfile.availability,
    equipment_types: driverProfile.equipment_types || [],
    certifications: driverProfile.certifications || [],
    max_orders_per_day: driverProfile.max_orders_per_day || 50,
    created_at: driverProfile.created_at,
    providerId: provider?.id ?? null,
    providerName: provider?.name ?? null,
    isProviderOwner: provider?.isOwner ?? false,
  };
}
