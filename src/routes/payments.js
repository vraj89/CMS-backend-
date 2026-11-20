import { Router } from 'express';
import { randomUUID } from 'crypto';
import { readCSV, appendRow, updateRow, findById } from '../db/csvStore.js';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import { appendAuditLog } from '../utils/audit.js';
import { clientUsersForProject, notifyRole } from '../utils/notify.js';

const router = Router();
router.use(authMiddleware);

function decorate(payment) {
  const project = findById('projects', payment.project_id);
  return {
    ...payment,
    amount: Number(payment.amount) || 0,
    project_name: project?.project_name || 'Unknown project',
  };
}

router.get('/', roleMiddleware('admin', 'client'), (req, res) => {
  let rows = readCSV('payments');
  if (req.user.role === 'client') {
    const client = readCSV('clients').find((c) => c.email.toLowerCase() === req.user.email.toLowerCase());
    const mine = new Set(readCSV('projects').filter((p) => p.client_id === client?.id).map((p) => p.id));
    rows = rows.filter((p) => mine.has(p.project_id));
  }
  res.json(rows.map(decorate));
});

router.post('/', roleMiddleware('admin'), (req, res) => {
  const { project_id, milestone, amount, status = 'pending', due_date } = req.body || {};
  if (!project_id || !milestone || amount === undefined) {
    return res.status(400).json({ message: 'project_id, milestone and amount are required' });
  }
  const project = findById('projects', project_id);
  if (!project) return res.status(404).json({ message: 'Project not found' });

  const payment = {
    id: randomUUID(),
    project_id,
    milestone,
    amount: String(amount),
    status,
    due_date: due_date || '',
    paid_date: status === 'paid' ? new Date().toISOString().slice(0, 10) : '',
    created_at: new Date().toISOString(),
  };
  appendRow('payments', payment);
  appendAuditLog(req.user, 'PAYMENT_CREATED', 'payment', payment.id, `Added milestone "${milestone}" (₹${amount})`);
  clientUsersForProject(project_id, project).forEach(() => {});
  notifyRole('client', 'New payment milestone', `${project.project_name}: ${milestone} — ₹${Number(amount).toLocaleString('en-IN')}`, 'payment');
  res.status(201).json(decorate(payment));
});

router.patch('/:id/mark-paid', roleMiddleware('admin'), (req, res) => {
  const payment = findById('payments', req.params.id);
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  if (payment.status === 'paid') return res.status(400).json({ message: 'Payment is already marked as paid' });

  const updated = updateRow('payments', payment.id, {
    status: 'paid',
    paid_date: new Date().toISOString().slice(0, 10),
  });
  appendAuditLog(req.user, 'PAYMENT_MARKED_PAID', 'payment', payment.id, `Marked "${payment.milestone}" as paid`);
  notifyRole('client', 'Payment received', `Thank you — ${payment.milestone} has been marked as paid.`, 'payment');
  notifyRole('marketing', 'Payment received', `${payment.milestone} was marked as paid.`, 'payment');
  res.json(decorate(updated));
});

export default router;
