import { type Express, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import session from 'express-session';
import { storage, type DbUser, type DbProperty } from './storage';
import { getUncachableStripeClient } from './stripeClient';
import { sendEmail } from './gmailClient';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const GOOGLE_DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    googleOAuthState?: string;
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

export function registerAuthRoutes(app: Express) {

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, phone, email, password } = req.body;

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
        const customer = await stripe.customers.create({
          email: email.toLowerCase(),
          name: `${firstName} ${lastName}`,
          phone: phone || undefined,
        });
        stripeCustomerId = customer.id;
      } catch (err) {
        console.error('Warning: Failed to create Stripe customer during registration:', err);
      }

      const user = await storage.createUser({
        firstName,
        lastName,
        phone: phone || '',
        email: email.toLowerCase(),
        passwordHash,
        stripeCustomerId,
      });

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

      const user = await storage.getUserByEmail(email.toLowerCase());
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

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

      const user = await storage.getUserById(req.session.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

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

      const domain = process.env.REPLIT_DOMAINS?.split(',')[0] || process.env.REPLIT_DEV_DOMAIN || 'localhost:5000';
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const redirectUri = `${protocol}://${domain}/api/auth/google/callback`;

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

      const domain = process.env.REPLIT_DOMAINS?.split(',')[0] || process.env.REPLIT_DEV_DOMAIN || 'localhost:5000';
      const protocol = domain.includes('localhost') ? 'http' : 'https';
      const redirectUri = `${protocol}://${domain}/api/auth/google/callback`;

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
          const customer = await stripe.customers.create({
            email,
            name: `${firstName} ${lastName}`.trim(),
          });
          stripeCustomerId = customer.id;
        } catch (err) {
          console.error('Warning: Failed to create Stripe customer during Google signup:', err);
        }

        user = await storage.createUser({
          firstName,
          lastName,
          phone: '',
          email,
          passwordHash,
          stripeCustomerId,
        });
      }

      req.session.userId = user.id;
      res.redirect('/');
    } catch (error: any) {
      console.error('Google OAuth callback error:', error);
      res.redirect('/?error=google_auth_failed');
    }
  });
}
