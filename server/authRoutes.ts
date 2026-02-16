import { type Express, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcrypt';
import session from 'express-session';
import { storage, type DbUser, type DbProperty } from './storage';
import { getUncachableStripeClient } from './stripeClient';

declare module 'express-session' {
  interface SessionData {
    userId: string;
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
}
