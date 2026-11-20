import { Router } from 'express';
import { readCSV, updateRow, writeCSV } from '../db/csvStore.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const rows = readCSV('notifications')
    .filter((n) => n.user_id === req.user.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((n) => ({ ...n, is_read: n.is_read === 'true' }));
  res.json(rows);
});

router.patch('/read-all', (req, res) => {
  const rows = readCSV('notifications').map((n) => (n.user_id === req.user.id ? { ...n, is_read: 'true' } : n));
  writeCSV('notifications', rows);
  res.json({ message: 'All notifications marked as read' });
});

router.patch('/:id/read', (req, res) => {
  const row = readCSV('notifications').find((n) => n.id === req.params.id);
  if (!row) return res.status(404).json({ message: 'Notification not found' });
  if (row.user_id !== req.user.id) return res.status(403).json({ message: 'Not your notification' });
  const updated = updateRow('notifications', row.id, { is_read: 'true' });
  res.json({ ...updated, is_read: true });
});

export default router;
