import jwt from 'jsonwebtoken';
import { findById } from '../db/csvStore.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'prelytix_super_secret_key_2026';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = findById('users', payload.id);
    if (!user) return res.status(401).json({ message: 'User no longer exists' });
    if (user.status !== 'active') return res.status(403).json({ message: 'Account is inactive' });
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
