import type { Request, Response, NextFunction } from 'express';
import { pool } from './db';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

export function requireRole(role: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const adminCheckId = req.session.originalAdminUserId || req.session.userId;
      const result = await pool.query(
        'SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2',
        [adminCheckId, role]
      );
      if (result.rows.length === 0) {
        return res.status(403).json({ error: `${role} access required` });
      }
      next();
    } catch {
      res.status(500).json({ error: 'Server error' });
    }
  };
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const adminCheckId = req.session.originalAdminUserId || req.session.userId;
    const roleResult = await pool.query(
      'SELECT admin_role FROM user_roles WHERE user_id = $1 AND role = $2',
      [adminCheckId, 'admin']
    );
    if (roleResult.rows.length === 0) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
