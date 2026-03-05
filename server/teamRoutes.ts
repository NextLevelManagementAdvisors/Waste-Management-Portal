import { type Express, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { storage } from './storage';
import { pool } from './db';
import { getUncachableStripeClient } from './stripeClient';
import { encrypt, decrypt, validateRoutingNumber, validateAccountNumber, validateAccountType, maskAccountNumber } from './encryption';
import { notifyWaitlistFlagged } from './slackNotifier';
import { formatRouteForClient } from './formatRoute';
import { sendDriverNotification } from './notificationService';

const toParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

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
      'SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2',
      [userId, 'driver']
    );
    if (roleCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Driver access required' });
    }
    const driverProfile = await storage.getDriverProfileByUserId(userId);
    if (!driverProfile) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }
    res.locals.driverProfile = driverProfile;
    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
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
      req.session.teamGoogleOAuthState = state;

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
        return res.redirect('/team?error=google_auth_failed');
      }

      const expectedState = req.session.teamGoogleOAuthState;
      delete req.session.teamGoogleOAuthState;

      if (!expectedState || state !== expectedState) {
        return res.redirect('/team?error=google_auth_failed');
      }

      const cbClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const cbClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      if (!cbClientId || !cbClientSecret) {
        return res.redirect('/team?error=google_not_configured');
      }

      const discoveryRes = await fetch(GOOGLE_DISCOVERY_URL);
      if (!discoveryRes.ok) {
        return res.redirect('/team?error=google_auth_failed');
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
        return res.redirect('/team?error=google_token_failed');
      }

      const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
      if (!tokenData.access_token) {
        console.error('Team Google token exchange failed:', tokenData.error || 'no access_token');
        return res.redirect('/team?error=google_token_failed');
      }

      const userInfoRes = await fetch(discovery.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userInfoRes.ok) {
        return res.redirect('/team?error=google_auth_failed');
      }

      const userInfo = await userInfoRes.json() as {
        email?: string;
        email_verified?: boolean;
        given_name?: string;
        family_name?: string;
        name?: string;
      };

      if (!userInfo.email || !userInfo.email_verified) {
        return res.redirect('/team?error=google_email_not_verified');
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
        // Ensure driver profile exists
        let driverProfile = await storage.getDriverProfileByUserId(userId);
        if (!driverProfile) {
          driverProfile = await storage.createDriverProfile({ userId, name: fullName });
        }
        // Ensure driver role exists
        await pool.query(
          `INSERT INTO user_roles (user_id, role) VALUES ($1, 'driver') ON CONFLICT DO NOTHING`,
          [userId]
        );
      } else {
        // Create new user
        const userResult = await pool.query(
          `INSERT INTO users (first_name, last_name, email, phone, password_hash)
           VALUES ($1, $2, $3, '', NULL) RETURNING id`,
          [firstName, lastName, email]
        );
        userId = userResult.rows[0].id;
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

      req.session.userId = userId;
      req.session.save((err) => {
        if (err) {
          console.error('Session save error during team Google OAuth callback:', err);
          return res.redirect('/team?error=google_auth_failed');
        }
        res.redirect('/team');
      });
    } catch (error: any) {
      console.error('Team Google OAuth callback error:', error);
      res.redirect('/team?error=google_auth_failed');
    }
  });

  app.post('/api/team/auth/register', async (req: Request, res: Response) => {
    try {
      const { name, full_name, email, phone, password } = req.body;
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

      const driverProfile = await storage.createDriverProfile({ userId, name: driverName });

      await pool.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'driver') ON CONFLICT DO NOTHING`,
        [userId]
      );
      await pool.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'customer') ON CONFLICT DO NOTHING`,
        [userId]
      );

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

      // Verify driver role
      const roleCheck = await pool.query(
        'SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2',
        [user.id, 'driver']
      );
      if (roleCheck.rows.length === 0) {
        return res.status(403).json({ error: 'No driver account found. Please register as a team member first.' });
      }

      const driverProfile = await storage.getDriverProfileByUserId(user.id);
      if (!driverProfile) {
        return res.status(404).json({ error: 'Driver profile not found' });
      }

      req.session.userId = user.id;

      req.session.save((err) => {
        if (err) {
          console.error('Session save error during driver login:', err);
          return res.status(500).json({ error: 'Login failed' });
        }
        res.json({ data: formatDriverForClient(driverProfile, user) });
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
      const user = await storage.getUserById(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      const roles = await pool.query(
        'SELECT role FROM user_roles WHERE user_id = $1',
        [user.id]
      );
      const clientData: any = {
        data: formatDriverForClient(driverProfile, user),
        roles: roles.rows.map((r: any) => r.role),
      };
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
    res.redirect('/team/');
  });

  app.get('/api/team/onboarding/stripe-connect/refresh', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const driver = await storage.getDriverById(driverId);

      if (!driver.stripe_connect_account_id) {
        return res.redirect('/team/');
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
      res.redirect('/team/');
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
      const zone = await storage.createDriverCustomZone(driverId, {
        name,
        zone_type: type,
        center_lat: center_lat != null ? Number(center_lat) : undefined,
        center_lng: center_lng != null ? Number(center_lng) : undefined,
        radius_miles: radius_miles != null ? Number(radius_miles) : undefined,
        polygon_coords,
        zip_codes,
        color,
        status: approvalRequired ? 'pending_approval' : 'active',
      });
      // If auto-approved, trigger waitlist flagging
      if (!approvalRequired) {
        const fullZone = await storage.getZoneById(zone.id);
        if (fullZone) triggerWaitlistAutoFlag(fullZone);
      }
      res.json({ data: zone });
    } catch (error) {
      console.error('Create custom zone error:', error);
      res.status(500).json({ error: 'Failed to create custom zone' });
    }
  });

  app.put('/api/team/my-custom-zones/:id', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const id = toParam(req.params.id);
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
      const deleted = await storage.deleteDriverCustomZone(toParam(req.params.id), driverId);
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
      const zip = toParam(req.params.zip);
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
          const stops = await storage.getRouteStops(route.id);
          return { ...route, stop_count: stops.length };
        } catch { return { ...route, stop_count: 0 }; }
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
      const routeId = toParam(req.params.routeId);
      const route = await storage.getRouteById(routeId);
      if (!route) {
        return res.status(404).json({ error: 'Route not found' });
      }

      const [bids, stops] = await Promise.all([
        storage.getRouteBids(routeId),
        storage.getRouteStops(routeId),
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
      const mappedStops = stops.map((p: any) => ({
        ...(canSeePII ? { address: p.address, customer_name: p.customer_name } : {}),
        pickup_type: p.pickup_type,
        sequence_number: p.sequence_number,
        status: p.status,
      }));

      res.json({ data: { ...formatRouteForClient(route), bids: camelBids, stops: mappedStops } });
    } catch (error: any) {
      console.error('Get route error:', error);
      res.status(500).json({ error: 'Failed to get route' });
    }
  });

  // Compensation breakdown for a route (driver visibility)
  app.get('/api/team/routes/:routeId/valuation', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const routeId = toParam(req.params.routeId);
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
      const routeId = toParam(req.params.routeId);
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

      res.status(201).json({ data: bid });
    } catch (error: any) {
      console.error('Place bid error:', error);
      res.status(500).json({ error: 'Failed to place bid' });
    }
  });

  app.delete('/api/team/routes/:routeId/bid', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const routeId = toParam(req.params.routeId);
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

  // Driver starts an assigned route, transitioning it to in_progress.
  app.post('/api/team/routes/:routeId/start', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const routeId = toParam(req.params.routeId);
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
      res.json({ success: true });
    } catch (error: any) {
      console.error('Start route error:', error);
      res.status(500).json({ error: 'Failed to start route' });
    }
  });

  // Driver declines an assigned route. Sets route back to open and logs the reason.
  app.post('/api/team/routes/:routeId/decline', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const routeId = toParam(req.params.routeId);
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
      const routeId = toParam(req.params.routeId);
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

      // Check for incomplete stops and include in response
      const stops = await storage.getRouteStops(routeId);
      const incompleteStops = stops.filter((s: any) => !['completed', 'failed', 'skipped', 'cancelled'].includes(s.status));

      res.json({ success: true, incompleteStops: incompleteStops.length > 0 ? incompleteStops.map((s: any) => ({ id: s.id, address: s.address, status: s.status })) : [] });
    } catch (error: any) {
      console.error('Complete route error:', error);
      res.status(500).json({ error: 'Failed to complete route' });
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
      res.json({ data: formatDriverForClient(driverProfile, user) });
    } catch (error: any) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
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
      const id = toParam(req.params.id);
      // Verify this on-demand request is assigned to the requesting driver
      const onDemandRequest = await storage.getOnDemandRequestById(id);
      if (!onDemandRequest || onDemandRequest.assigned_driver_id !== driverId) {
        return res.status(403).json({ error: 'On-demand pickup not found or not assigned to you' });
      }
      if (onDemandRequest.status === 'completed' || onDemandRequest.status === 'cancelled') {
        return res.status(400).json({ error: 'On-demand pickup is already ' + onDemandRequest.status });
      }
      const updated = await storage.updateOnDemandRequest(id, { status: 'completed' });

      // Notify customer
      const { sendServiceUpdate } = await import('./notificationService');
      sendServiceUpdate(onDemandRequest.user_id, 'On-Demand Pickup Completed', `Your ${onDemandRequest.service_name} pickup at ${onDemandRequest.address} has been completed. Thank you!`).catch(e => console.error('Completion notification failed:', e));

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
        `SELECT equipment_types, certifications, max_stops_per_day, min_rating_for_assignment
         FROM driver_profiles WHERE id = $1`,
        [driverId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Driver not found' });
      const d = rows[0];
      res.json({
        qualifications: {
          equipmentTypes: d.equipment_types || [],
          certifications: d.certifications || [],
          maxStopsPerDay: d.max_stops_per_day,
          minRatingForAssignment: Number(d.min_rating_for_assignment),
        },
      });
    } catch (err: any) {
      console.error('Error fetching qualifications:', err);
      res.status(500).json({ error: 'Failed to fetch qualifications' });
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
                (SELECT COALESCE(SUM(r.stop_count), 0) FROM routes r WHERE r.contract_id = rc.id) AS stop_count,
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
          stopCount: parseInt(c.stop_count) || 0,
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
      const oppResult = await pool.query(`SELECT * FROM contract_opportunities WHERE id = $1 AND status = 'open'`, [toParam(req.params.id)]);
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
        [toParam(req.params.id), driverId, proposedRate ?? null, message ?? null, driverRating]
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
        [toParam(req.params.id), driverId]
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

      // Notify eligible zone drivers about coverage opportunity (US-17)
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
        // Find other active drivers in the same zone
        pool.query(
          `SELECT DISTINCT dp.id FROM driver_profiles dp
           JOIN driver_custom_zones dcz ON dp.id = dcz.driver_id AND dcz.zone_id = $1 AND dcz.status = 'active'
           WHERE dp.status = 'active' AND dp.id != $2`,
          [cd.zone_id, driverId]
        ).then(({ rows: drivers }) => {
          for (const d of drivers) {
            sendDriverNotification(d.id, 'Coverage Opportunity',
              `<p><strong>${cd.driver_name || 'A driver'}</strong> needs coverage for <strong>${cd.zone_name || 'Zone'} - ${cd.day_of_week}</strong> on <strong>${coverageDate}</strong>.</p>
               <p>Reason: ${reason}. Contact your admin if you're available to cover.</p>`
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
        [toParam(req.params.id), driverId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Request not found or not withdrawable' });
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error withdrawing coverage request:', err);
      res.status(500).json({ error: 'Failed to withdraw coverage request' });
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
      const result = await storage.respondToZoneAssignmentRequest(toParam(req.params.id), driverId, decision, notes);
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
      const contractId = toParam(req.params.id);

      // Verify driver owns this contract
      const contract = await pool.query(
        `SELECT id FROM route_contracts WHERE id = $1 AND driver_id = $2`,
        [contractId, driverId]
      );
      if (contract.rows.length === 0) return res.status(404).json({ error: 'Contract not found' });

      const { rows } = await pool.query(
        `SELECT r.id, r.title, r.scheduled_date, r.status, r.stop_count,
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
          stopCount: r.stop_count || 0,
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
      const contractId = toParam(req.params.id);

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
}

function formatDriverForClient(driverProfile: any, user?: any) {
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
    max_stops_per_day: driverProfile.max_stops_per_day || 50,
    created_at: driverProfile.created_at,
  };
}


