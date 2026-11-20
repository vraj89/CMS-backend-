import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readCSV } from '../db/csvStore.js';
import { authMiddleware, JWT_SECRET } from '../middleware/auth.js';
import { appendAuditLog } from '../utils/audit.js';

const router = Router();

function publicUser(u) {
  const { password, ...rest } = u;
  return rest;
}

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });

  const user = readCSV('users').find((u) => u.email.toLowerCase() === String(email).toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  if (user.status !== 'active') return res.status(403).json({ message: 'This account has been deactivated' });

  const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, {
    expiresIn: '7d',
  });
  appendAuditLog(user, 'LOGIN', 'user', user.id, `${user.name} signed in`);
  res.json({ token, user: publicUser(user) });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = readCSV('users').find((u) => u.id === req.user.id);
  res.json(publicUser(user));
});

export default router;
