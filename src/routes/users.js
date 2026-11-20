import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { readCSV, appendRow, updateRow } from '../db/csvStore.js';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import { appendAuditLog } from '../utils/audit.js';

const router = Router();
router.use(authMiddleware, roleMiddleware('admin'));

const ROLES = ['marketing', 'admin', 'task_manager', 'content_writer', 'video_editor', 'client'];
const strip = ({ password, ...u }) => u;

router.get('/', (req, res) => {
  res.json(readCSV('users').map(strip));
});

router.post('/', (req, res) => {
  const { name, email, password = 'password123', role, status = 'active' } = req.body || {};
  if (!name || !email || !role) return res.status(400).json({ message: 'name, email and role are required' });
  if (!ROLES.includes(role)) return res.status(400).json({ message: 'Invalid role' });
  if (readCSV('users').some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ message: 'A user with that email already exists' });
  }
  const user = {
    id: randomUUID(),
    name,
    email,
    password: bcrypt.hashSync(password, 10),
    role,
    status,
    created_at: new Date().toISOString(),
  };
  appendRow('users', user);
  appendAuditLog(req.user, 'USER_CREATED', 'user', user.id, `Created ${role} account for ${name}`);
  res.status(201).json(strip(user));
});

router.patch('/:id', (req, res) => {
  const existing = readCSV('users').find((u) => u.id === req.params.id);
  if (!existing) return res.status(404).json({ message: 'User not found' });
  const updates = {};
  for (const key of ['name', 'email', 'role', 'status']) {
    if (req.body?.[key] !== undefined) updates[key] = req.body[key];
  }
  if (req.body?.password) updates.password = bcrypt.hashSync(req.body.password, 10);
  const updated = updateRow('users', req.params.id, updates);
  appendAuditLog(req.user, 'USER_UPDATED', 'user', updated.id, `Updated account ${updated.name}`);
  res.json(strip(updated));
});

export default router;
