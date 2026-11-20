import { Router } from 'express';
import { randomUUID } from 'crypto';
import { readCSV, appendRow, updateRow } from '../db/csvStore.js';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import { appendAuditLog } from '../utils/audit.js';
import { notifyRole } from '../utils/notify.js';

const router = Router();
router.use(authMiddleware);

router.get('/me', roleMiddleware('client'), (req, res) => {
  const client = readCSV('clients').find((c) => c.email.toLowerCase() === req.user.email.toLowerCase());
  if (!client) return res.status(404).json({ message: 'No client profile linked to this account' });
  res.json(client);
});

router.get('/', roleMiddleware('marketing', 'admin', 'task_manager', 'content_writer', 'video_editor'), (req, res) => {
  const clients = readCSV('clients');
  const projects = readCSV('projects');
  res.json(
    clients.map((c) => ({
      ...c,
      project_count: projects.filter((p) => p.client_id === c.id).length,
    })),
  );
});

router.post('/', roleMiddleware('marketing'), (req, res) => {
  const { company_name, contact_person, email, phone, industry } = req.body || {};
  if (!company_name || !contact_person || !email) {
    return res.status(400).json({ message: 'company_name, contact_person and email are required' });
  }
  if (readCSV('clients').some((c) => c.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ message: 'A client with that email already exists' });
  }
  const client = {
    id: randomUUID(),
    company_name,
    contact_person,
    email,
    phone: phone || '',
    industry: industry || '',
    status: 'pending_verification',
    created_by: req.user.id,
    created_at: new Date().toISOString(),
  };
  appendRow('clients', client);
  appendAuditLog(req.user, 'CLIENT_CREATED', 'client', client.id, `Onboarded ${company_name}`);
  notifyRole('admin', 'Client awaiting verification', `${company_name} was onboarded by ${req.user.name}.`, 'info');
  res.status(201).json(client);
});

router.patch('/:id/verify', roleMiddleware('admin'), (req, res) => {
  const client = readCSV('clients').find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ message: 'Client not found' });
  const updated = updateRow('clients', client.id, { status: 'active' });
  appendAuditLog(req.user, 'CLIENT_VERIFIED', 'client', client.id, `Verified ${client.company_name}`);
  notifyRole('marketing', 'Client verified', `${client.company_name} is now active and ready for projects.`, 'approval');
  res.json(updated);
});

router.patch('/:id/reject', roleMiddleware('admin'), (req, res) => {
  const client = readCSV('clients').find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ message: 'Client not found' });
  const updated = updateRow('clients', client.id, { status: 'rejected' });
  appendAuditLog(req.user, 'CLIENT_REJECTED', 'client', client.id, `Rejected ${client.company_name}`);
  notifyRole('marketing', 'Client rejected', `${client.company_name} did not pass verification.`, 'info');
  res.json(updated);
});

export default router;
