import { type Express, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { storage } from './storage';
import { pool } from './db';
import { getUncachableStripeClient } from './stripeClient';
import { encrypt, decrypt, validateRoutingNumber, validateAccountNumber, validateAccountType, maskAccountNumber } from './encryption';

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

  app.get('/api/team/jobs', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const filters: { startDate?: string; endDate?: string } = {};
      if (req.query.startDate) filters.startDate = req.query.startDate as string;
      if (req.query.endDate) filters.endDate = req.query.endDate as string;

      const jobs = await storage.getOpenJobs(filters);
      // Enrich with pickup counts
      const enriched = await Promise.all(jobs.map(async (job: any) => {
        try {
          const pickups = await storage.getJobPickups(job.id);
          return { ...job, pickup_count: pickups.length };
        } catch { return { ...job, pickup_count: 0 }; }
      }));
      res.json({ data: enriched });
    } catch (error: any) {
      console.error('Get jobs error:', error);
      res.status(500).json({ error: 'Failed to get jobs' });
    }
  });

  app.get('/api/team/my-jobs', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const jobs = await storage.getDriverJobs(res.locals.driverProfile.id);
      res.json({ data: jobs });
    } catch (error: any) {
      console.error('Get my jobs error:', error);
      res.status(500).json({ error: 'Failed to get jobs' });
    }
  });

  app.get('/api/team/jobs/:jobId', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const jobId = req.params.jobId;
      const job = await storage.getJobById(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const [bids, pickups] = await Promise.all([
        storage.getJobBids(jobId),
        storage.getJobPickups(jobId),
      ]);

      res.json({ data: { ...job, bids, pickups: pickups.map((p: any) => ({ address: p.address, customer_name: p.customer_name, pickup_type: p.pickup_type, sequence_number: p.sequence_number, status: p.status })) } });
    } catch (error: any) {
      console.error('Get job error:', error);
      res.status(500).json({ error: 'Failed to get job' });
    }
  });

  app.post('/api/team/jobs/:jobId/bid', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const jobId = req.params.jobId;
      const driverId = res.locals.driverProfile.id;
      const { bid_amount, message } = req.body;

      if (!bid_amount || bid_amount <= 0) {
        return res.status(400).json({ error: 'Valid bid amount is required' });
      }

      const job = await storage.getJobById(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      if (job.status !== 'open' && job.status !== 'bidding') {
        return res.status(400).json({ error: 'Job is not available for bidding' });
      }

      const existingBid = await storage.getBidByJobAndDriver(jobId, driverId);
      if (existingBid) {
        return res.status(409).json({ error: 'You have already bid on this job' });
      }

      const driver = await storage.getDriverById(driverId);

      const bid = await storage.createBid({
        jobId,
        driverId,
        bidAmount: bid_amount,
        message: message || undefined,
        driverRatingAtBid: parseFloat(driver.rating) || 5.00,
      });

      if (job.status === 'open') {
        await storage.updateJob(jobId, { status: 'bidding' });
      }

      res.status(201).json({ data: bid });
    } catch (error: any) {
      console.error('Place bid error:', error);
      res.status(500).json({ error: 'Failed to place bid' });
    }
  });

  app.delete('/api/team/jobs/:jobId/bid', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const jobId = req.params.jobId;
      const driverId = res.locals.driverProfile.id;

      const existingBid = await storage.getBidByJobAndDriver(jobId, driverId);
      if (!existingBid) {
        return res.status(404).json({ error: 'Bid not found' });
      }

      await storage.deleteBid(jobId, driverId);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Withdraw bid error:', error);
      res.status(500).json({ error: 'Failed to withdraw bid' });
    }
  });

  app.post('/api/team/jobs/:jobId/complete', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const jobId = req.params.jobId;
      const driverId = res.locals.driverProfile.id;

      const job = await storage.getJobById(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      if (job.assigned_driver_id !== driverId) {
        return res.status(403).json({ error: 'You are not assigned to this job' });
      }

      if (job.status !== 'assigned' && job.status !== 'in_progress') {
        return res.status(400).json({ error: 'Job cannot be completed in its current status' });
      }

      await storage.updateJob(jobId, { status: 'completed' });

      const driver = await storage.getDriverById(driverId);
      await storage.updateDriver(driverId, {
        total_jobs_completed: (driver.total_jobs_completed || 0) + 1,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('Complete job error:', error);
      res.status(500).json({ error: 'Failed to complete job' });
    }
  });

  app.get('/api/team/schedule', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const start = (req.query.start as string) || new Date().toISOString().split('T')[0];
      const end = (req.query.end as string) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const jobs = await storage.getDriverSchedule(driverId, start, end);
      res.json({ data: jobs });
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

  // ── Special Pickups for Driver ──

  app.get('/api/team/special-pickups', requireDriverAuth, async (_req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const pickups = await storage.getSpecialPickupsForDriver(driverId);
      res.json({
        data: pickups.map((p: any) => ({
          id: p.id,
          address: p.address,
          serviceName: p.service_name,
          servicePrice: Number(p.service_price),
          pickupDate: p.pickup_date,
          status: p.status,
          notes: p.notes,
          photos: p.photos || [],
        })),
      });
    } catch (error: any) {
      console.error('Failed to fetch driver special pickups:', error);
      res.status(500).json({ error: 'Failed to fetch special pickups' });
    }
  });

  app.put('/api/team/special-pickups/:id/complete', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = res.locals.driverProfile.id;
      const { id } = req.params;
      // Verify this pickup is assigned to the requesting driver
      const pickup = await storage.getSpecialPickupById(id);
      if (!pickup || pickup.assigned_driver_id !== driverId) {
        return res.status(403).json({ error: 'Pickup not found or not assigned to you' });
      }
      if (pickup.status === 'completed' || pickup.status === 'cancelled') {
        return res.status(400).json({ error: 'Pickup is already ' + pickup.status });
      }
      const updated = await storage.updateSpecialPickupRequest(id, { status: 'completed' });

      // Notify customer
      const { sendServiceUpdate } = await import('./notificationService');
      sendServiceUpdate(pickup.user_id, 'Pickup Completed', `Your ${pickup.service_name} pickup at ${pickup.address} has been completed. Thank you!`).catch(e => console.error('Completion notification failed:', e));

      res.json({ success: true, data: updated });
    } catch (error: any) {
      console.error('Failed to complete special pickup:', error);
      res.status(500).json({ error: 'Failed to mark pickup as completed' });
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
    created_at: driverProfile.created_at,
  };
}
