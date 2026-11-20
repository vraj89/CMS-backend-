import { Router } from 'express';
import { readCSV } from '../db/csvStore.js';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';

const router = Router();
router.use(authMiddleware, roleMiddleware('admin'));

router.get('/', (req, res) => {
  const rows = readCSV('audit_logs').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(rows);
});

export default router;
