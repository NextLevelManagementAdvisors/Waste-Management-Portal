import { type Express, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { storage } from './storage';
import { getUncachableStripeClient } from './stripeClient';

declare module 'express-session' {
  interface SessionData {
    driverId?: string;
  }
}

function requireDriverAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.driverId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

async function requireOnboarded(req: Request, res: Response, next: NextFunction) {
  try {
    const driver = await storage.getDriverById(req.session.driverId!);
    if (!driver || driver.onboarding_status !== 'completed') {
      return res.status(403).json({ error: 'Onboarding not completed' });
    }
    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

export function registerTeamRoutes(app: Express) {

  app.post('/api/team/auth/register', async (req: Request, res: Response) => {
    try {
      const { name, full_name, email, phone, password } = req.body;
      const driverName = name || full_name;

      if (!driverName || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
      }

      const existing = await storage.getDriverByEmail(email.toLowerCase());
      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const driver = await storage.createDriver({
        name: driverName,
        email: email.toLowerCase(),
        phone: phone || '',
      });

      await storage.updateDriver(driver.id, {
        password_hash: passwordHash,
        onboarding_status: 'w9_pending',
      });

      const updatedDriver = await storage.getDriverById(driver.id);

      req.session.driverId = driver.id;

      res.status(201).json({ data: formatDriverForClient(updatedDriver) });
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

      const driver = await storage.getDriverByEmail(email.toLowerCase());
      if (!driver || !driver.password_hash) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const valid = await bcrypt.compare(password, driver.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      req.session.driverId = driver.id;

      res.json({ data: formatDriverForClient(driver) });
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
      const driver = await storage.getDriverById(req.session.driverId!);
      if (!driver) {
        return res.status(401).json({ error: 'Driver not found' });
      }
      res.json({ data: formatDriverForClient(driver) });
    } catch (error: any) {
      console.error('Get driver error:', error);
      res.status(500).json({ error: 'Failed to get driver' });
    }
  });

  app.post('/api/team/onboarding/w9', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = req.session.driverId!;
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
      const w9 = await storage.getW9ByDriverId(req.session.driverId!);
      res.json({ data: w9 || null });
    } catch (error: any) {
      console.error('Get W9 error:', error);
      res.status(500).json({ error: 'Failed to get W9 data' });
    }
  });

  app.post('/api/team/onboarding/stripe-connect', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = req.session.driverId!;
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

      const account = await stripe.accounts.create({
        type: 'express',
        email: driver.email || undefined,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
        individual: {
          first_name: driver.name.split(' ')[0],
          last_name: driver.name.split(' ').slice(1).join(' ') || undefined,
          email: driver.email || undefined,
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
      const driverId = req.session.driverId!;
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
      const driverId = req.session.driverId!;
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

  app.get('/api/team/jobs', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const filters: { startDate?: string; endDate?: string } = {};
      if (req.query.startDate) filters.startDate = req.query.startDate as string;
      if (req.query.endDate) filters.endDate = req.query.endDate as string;

      const jobs = await storage.getOpenJobs(filters);
      res.json({ data: jobs });
    } catch (error: any) {
      console.error('Get jobs error:', error);
      res.status(500).json({ error: 'Failed to get jobs' });
    }
  });

  app.get('/api/team/my-jobs', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const jobs = await storage.getDriverJobs(req.session.driverId!);
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

      const bids = await storage.getJobBids(jobId);

      res.json({ data: { ...job, bids } });
    } catch (error: any) {
      console.error('Get job error:', error);
      res.status(500).json({ error: 'Failed to get job' });
    }
  });

  app.post('/api/team/jobs/:jobId/bid', requireDriverAuth, requireOnboarded, async (req: Request, res: Response) => {
    try {
      const jobId = req.params.jobId;
      const driverId = req.session.driverId!;
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
      const driverId = req.session.driverId!;

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
      const driverId = req.session.driverId!;

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
      const driverId = req.session.driverId!;
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
      const driver = await storage.getDriverById(req.session.driverId!);
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }
      res.json({ data: formatDriverForClient(driver) });
    } catch (error: any) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  });

  app.put('/api/team/profile', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driverId = req.session.driverId!;
      const { name, phone, availability } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (availability !== undefined) updateData.availability = availability;

      const updated = await storage.updateDriver(driverId, updateData);
      res.json({ data: formatDriverForClient(updated) });
    } catch (error: any) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  app.get('/api/team/onboarding/status', requireDriverAuth, async (req: Request, res: Response) => {
    try {
      const driver = await storage.getDriverById(req.session.driverId!);
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
}

function formatDriverForClient(driver: any) {
  return {
    id: driver.id,
    name: driver.name,
    email: driver.email,
    phone: driver.phone,
    status: driver.status,
    onboarding_status: driver.onboarding_status,
    rating: driver.rating,
    total_jobs_completed: driver.total_jobs_completed,
    w9_completed: driver.w9_completed || false,
    direct_deposit_completed: driver.direct_deposit_completed || false,
    stripe_connect_onboarded: driver.stripe_connect_onboarded || false,
    availability: driver.availability,
    created_at: driver.created_at,
  };
}
