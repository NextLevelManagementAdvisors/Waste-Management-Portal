import { type Express, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import session from 'express-session';
import { storage, type DbUser, type DbProperty } from './storage';
import { getUncachableStripeClient } from './stripeClient';
import { sendEmail } from './gmailClient';
import * as optimoRoute from './optimoRouteClient';
import { sendMissedPickupConfirmation, sendServiceUpdate } from './notificationService';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const GOOGLE_DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    googleOAuthState?: string;
    googleOAuthReferralCode?: string;
    googleOAuthRedirect?: string;
    googleOAuthPopup?: boolean;
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
    isAdmin: user.is_admin || false,
    properties: properties.map(formatPropertyForClient),
  };
}

function formatPropertyForClient(p: DbProperty) {
  return {
    id: p.id,
    address: p.address,
    serviceType: p.service_type,
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

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
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

      const existing = await storage.getUserByEmail(email.toLowerCase());
      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      let stripeCustomerId: string | undefined;
      try {
        const stripe = await getUncachableStripeClient();
        const existing = await stripe.customers.list({ email: email.toLowerCase(), limit: 1 });
        if (existing.data.length > 0) {
          stripeCustomerId = existing.data[0].id;
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
      } catch (err) {
        console.error('Warning: Failed to find/create Stripe customer during registration:', err);
      }

      const user = await storage.createUser({
        firstName,
        lastName,
        phone: phone || '',
        email: email.toLowerCase(),
        passwordHash,
        stripeCustomerId,
      });

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

      res.status(201).json({ data: formatUserForClient(user, []) });
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      let user = await storage.getUserByEmail(email.toLowerCase());
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      user = await ensureStripeCustomer(user);

      const properties = await storage.getPropertiesForUser(user.id);

      req.session.userId = user.id;

      res.json({ data: formatUserForClient(user, properties) });
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

      res.json({ data: formatUserForClient(user, properties) });
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

      res.status(201).json({ data: formatPropertyForClient(property) });
    } catch (error: any) {
      console.error('Create property error:', error);
      res.status(500).json({ error: 'Failed to create property' });
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

      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(userId, { password_hash: newHash });

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
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
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

  app.get('/api/auth/google', async (req: Request, res: Response) => {
    try {
      if (!GOOGLE_CLIENT_ID) {
        return res.status(500).json({ error: 'Google OAuth not configured' });
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

      const host = req.get('host') || 'localhost:5000';
      const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'select_account',
        state,
      });

      res.redirect(`${discovery.authorization_endpoint}?${params.toString()}`);
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

      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return res.redirect('/?error=google_not_configured');
      }

      const discoveryRes = await fetch(GOOGLE_DISCOVERY_URL);
      if (!discoveryRes.ok) {
        return res.redirect('/?error=google_auth_failed');
      }
      const discovery = await discoveryRes.json() as { token_endpoint: string; userinfo_endpoint: string };

      const host = req.get('host') || 'localhost:5000';
      const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

      const tokenRes = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenRes.ok) {
        console.error('Token exchange HTTP error:', tokenRes.status);
        return res.redirect('/?error=google_token_failed');
      }

      const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
      if (!tokenData.access_token) {
        console.error('Token exchange failed:', tokenData);
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
        });

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

      if (popupMode) {
        res.send(`<!DOCTYPE html><html><body><script>
          if (window.opener) {
            window.opener.postMessage({ type: 'google-oauth-success', redirect: ${JSON.stringify(redirectUrl)} }, '*');
            window.close();
          } else {
            window.location.href = ${JSON.stringify(redirectUrl)};
          }
        </script></body></html>`);
      } else {
        res.redirect(redirectUrl);
      }
    } catch (error: any) {
      console.error('Google OAuth callback error:', error);
      const popupMode = req.session?.googleOAuthPopup;
      if (popupMode) {
        res.send(`<!DOCTYPE html><html><body><script>
          if (window.opener) {
            window.opener.postMessage({ type: 'google-oauth-error' }, '*');
            window.close();
          } else {
            window.location.href = '/?error=google_auth_failed';
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
      sendMissedPickupConfirmation(userId, property.address, date).catch(() => {});
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
      const { propertyId, serviceName, servicePrice, date } = req.body;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }
      const request = await storage.createSpecialPickupRequest({ userId, propertyId, serviceName, servicePrice, pickupDate: date });

      try {
        const orderNo = `SP-${request.id.substring(0, 8).toUpperCase()}`;
        await optimoRoute.createOrder({
          orderNo,
          type: 'D',
          date,
          address: property.address,
          locationName: `Special Pickup - ${serviceName}`,
          duration: 20,
          notes: `Special pickup: ${serviceName}`,
        });
      } catch (optimoErr: any) {
        console.error('OptimoRoute order creation failed (non-blocking):', optimoErr.message);
      }

      try {
        const user = await storage.getUserById(userId);
        if (user?.stripe_customer_id) {
          const stripe = await getUncachableStripeClient();
          const invoice = await stripe.invoices.create({
            customer: user.stripe_customer_id,
            auto_advance: true,
            metadata: { propertyId, specialPickupId: request.id },
          });
          await stripe.invoiceItems.create({
            customer: user.stripe_customer_id,
            invoice: invoice.id,
            amount: Math.round(servicePrice * 100),
            currency: 'usd',
            description: `Special Pickup: ${serviceName}`,
          });
          await stripe.invoices.finalizeInvoice(invoice.id);
        }
      } catch (stripeErr: any) {
        console.error('Stripe invoice creation failed (non-blocking):', stripeErr.message);
      }

      sendServiceUpdate(userId, 'Special Pickup Scheduled', `Your ${serviceName} pickup has been scheduled for ${date} at ${property.address}.`).catch(() => {});

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

  app.post('/api/collection-intent', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { propertyId, intent, date } = req.body;
      const property = await storage.getPropertyById(propertyId);
      if (!property || property.user_id !== userId) {
        return res.status(403).json({ error: 'Property not found or access denied' });
      }
      const result = await storage.upsertCollectionIntent({ userId, propertyId, intent, pickupDate: date });
      res.json({ data: result });
    } catch (error: any) {
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
