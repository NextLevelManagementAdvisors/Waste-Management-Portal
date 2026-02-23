import { type Express, type Request, type Response } from 'express';
import crypto from 'crypto';
import { pool } from './db';
import { storage } from './storage';
import { requireAdmin } from './adminRoutes';
import { sendEmail } from './gmailClient';

const APP_NAME = 'Zip-A-Dee Services';

function invitationEmailTemplate(inviterName: string, roles: string[], token: string, baseUrl: string): string {
  const roleLabels = roles.map(r => r === 'admin' ? 'Administrator' : r.charAt(0).toUpperCase() + r.slice(1));
  const roleText = roleLabels.join(', ');
  const registerUrl = roles.includes('driver')
    ? `${baseUrl}/team/register?invite=${token}`
    : `${baseUrl}/register?invite=${token}`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:#0d9488;padding:24px 32px;border-radius:16px 16px 0 0;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:900;letter-spacing:-0.5px;">${APP_NAME}</h1>
    </div>
    <div style="background:#fff;padding:32px;border-radius:0 0 16px 16px;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
      <h2 style="color:#1f2937;font-size:18px;font-weight:800;margin:0 0 16px 0;">You've Been Invited!</h2>
      <p style="color:#4b5563;line-height:1.6;">${inviterName} has invited you to join ${APP_NAME} as: <strong>${roleText}</strong></p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${registerUrl}" style="background:#0d9488;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">Accept Invitation</a>
      </div>
      <p style="color:#9ca3af;font-size:13px;">This invitation expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>`;
}

export function registerInvitationRoutes(app: Express) {

  // Admin: Create invitation
  app.post('/api/admin/invitations', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { email, roles, adminRole } = req.body;
      const invitedBy = req.session.userId!;

      if (!email || !roles || !Array.isArray(roles) || roles.length === 0) {
        return res.status(400).json({ error: 'email and roles[] are required' });
      }

      const validRoles = ['customer', 'driver', 'admin'];
      for (const role of roles) {
        if (!validRoles.includes(role)) {
          return res.status(400).json({ error: `Invalid role: ${role}` });
        }
      }

      if (roles.includes('admin') && !adminRole) {
        return res.status(400).json({ error: 'adminRole is required when inviting an admin' });
      }

      // Check for existing pending invitation
      const existing = await pool.query(
        `SELECT id FROM invitations WHERE LOWER(email) = LOWER($1) AND status = 'pending' AND expires_at > NOW()`,
        [email]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'A pending invitation already exists for this email' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const result = await pool.query(
        `INSERT INTO invitations (email, roles, admin_role, invited_by, token, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [email.toLowerCase(), roles, adminRole || null, invitedBy, token, expiresAt]
      );

      // Send invitation email
      try {
        const inviter = await storage.getUserById(invitedBy);
        const inviterName = inviter ? `${inviter.first_name} ${inviter.last_name}` : 'An administrator';

        const appDomain = process.env.APP_DOMAIN || (() => {
          const domain = process.env.REPLIT_DOMAINS?.split(',')[0];
          return domain ? `https://${domain}` : 'http://localhost:5000';
        })();

        const html = invitationEmailTemplate(inviterName, roles, token, appDomain);
        await sendEmail(email, `You're invited to join ${APP_NAME}`, html);
      } catch (emailErr) {
        console.error('Failed to send invitation email (invitation still created):', emailErr);
      }

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Create invitation error:', error);
      res.status(500).json({ error: 'Failed to create invitation' });
    }
  });

  // Admin: List invitations
  app.get('/api/admin/invitations', requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string || undefined;
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (status) {
        conditions.push(`i.status = $${idx++}`);
        params.push(status);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await pool.query(
        `SELECT i.*, u.first_name as inviter_first_name, u.last_name as inviter_last_name
         FROM invitations i
         JOIN users u ON u.id = i.invited_by
         ${where}
         ORDER BY i.created_at DESC`,
        params
      );

      res.json(result.rows);
    } catch (error) {
      console.error('List invitations error:', error);
      res.status(500).json({ error: 'Failed to list invitations' });
    }
  });

  // Admin: Revoke invitation
  app.delete('/api/admin/invitations/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `UPDATE invitations SET status = 'revoked' WHERE id = $1 AND status = 'pending' RETURNING id`,
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Invitation not found or already processed' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Revoke invitation error:', error);
      res.status(500).json({ error: 'Failed to revoke invitation' });
    }
  });

  // Public: Get invitation details by token
  app.get('/api/invitations/:token', async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT email, roles, admin_role, status, expires_at FROM invitations WHERE token = $1`,
        [req.params.token]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Invitation not found' });
      }
      const invite = result.rows[0];
      if (invite.status !== 'pending') {
        return res.status(410).json({ error: 'Invitation has already been used or revoked' });
      }
      if (new Date(invite.expires_at) < new Date()) {
        return res.status(410).json({ error: 'Invitation has expired' });
      }
      res.json({ email: invite.email, roles: invite.roles, adminRole: invite.admin_role });
    } catch (error) {
      console.error('Get invitation error:', error);
      res.status(500).json({ error: 'Failed to get invitation' });
    }
  });

  // Accept invitation (for already-registered users)
  app.post('/api/invitations/:token/accept', async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: 'You must be logged in to accept an invitation' });
      }

      const inviteResult = await pool.query(
        `SELECT * FROM invitations WHERE token = $1 AND status = 'pending' AND expires_at > NOW()`,
        [req.params.token]
      );
      if (inviteResult.rows.length === 0) {
        return res.status(404).json({ error: 'Invitation not found, expired, or already used' });
      }

      const invite = inviteResult.rows[0];
      const userId = req.session.userId;

      // Apply roles
      for (const role of invite.roles) {
        await pool.query(
          `INSERT INTO user_roles (user_id, role, admin_role, granted_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, role) DO UPDATE SET admin_role = COALESCE($3, user_roles.admin_role)`,
          [userId, role, role === 'admin' ? invite.admin_role : null, invite.invited_by]
        );

        // Create driver profile if needed
        if (role === 'driver') {
          const existingProfile = await storage.getDriverProfileByUserId(userId);
          if (!existingProfile) {
            const user = await storage.getUserById(userId);
            await storage.createDriverProfile({
              userId,
              name: user ? `${user.first_name} ${user.last_name}`.trim() : 'Driver',
            });
          }
        }
      }

      // Mark invitation as accepted
      await pool.query(
        `UPDATE invitations SET status = 'accepted', accepted_by = $1, accepted_at = NOW() WHERE id = $2`,
        [userId, invite.id]
      );

      const updatedRoles = await pool.query(
        'SELECT role FROM user_roles WHERE user_id = $1',
        [userId]
      );

      res.json({
        success: true,
        roles: updatedRoles.rows.map((r: any) => r.role),
      });
    } catch (error) {
      console.error('Accept invitation error:', error);
      res.status(500).json({ error: 'Failed to accept invitation' });
    }
  });
}
