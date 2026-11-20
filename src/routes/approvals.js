import { Router } from 'express';
import { randomUUID } from 'crypto';
import { readCSV, appendRow, updateRow, findById } from '../db/csvStore.js';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import { appendAuditLog } from '../utils/audit.js';
import { createNotification, notifyRole } from '../utils/notify.js';

const router = Router();
router.use(authMiddleware);

const TABLES = { content: 'content', media: 'media' };

/** A client may only act on items that belong to their own company's projects. */
function clientOwnsProject(user, projectId) {
  const client = readCSV('clients').find((c) => c.email.toLowerCase() === user.email.toLowerCase());
  if (!client) return false;
  const project = findById('projects', projectId);
  return Boolean(project && project.client_id === client.id);
}

function decorate(row) {
  const approver = findById('users', row.approved_by);
  const entity = findById(TABLES[row.entity_type], row.entity_id);
  const project = findById('projects', row.project_id);
  return {
    ...row,
    approver_name: approver?.name || 'Client',
    entity_title: entity?.title || 'Removed item',
    entity_version: Number(entity?.version) || 1,
    project_name: project?.project_name || '',
  };
}

router.get('/', roleMiddleware('client', 'admin'), (req, res) => {
  let rows = readCSV('approvals');
  if (req.user.role === 'client') {
    const client = readCSV('clients').find((c) => c.email.toLowerCase() === req.user.email.toLowerCase());
    const mine = new Set(readCSV('projects').filter((p) => p.client_id === client?.id).map((p) => p.id));
    rows = rows.filter((r) => mine.has(r.project_id));
  }
  res.json(rows.map(decorate));
});

router.post('/', roleMiddleware('client'), (req, res) => {
  const { entity_type, entity_id, status, comments = '' } = req.body || {};
  if (!TABLES[entity_type] || !entity_id) return res.status(400).json({ message: 'entity_type and entity_id are required' });
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ message: 'status must be approved or rejected' });

  const entity = findById(TABLES[entity_type], entity_id);
  if (!entity) return res.status(404).json({ message: 'Item not found' });
  if (!clientOwnsProject(req.user, entity.project_id)) {
    return res.status(403).json({ message: 'This item does not belong to one of your projects' });
  }
  if (entity.status === 'draft') return res.status(400).json({ message: 'This item has not been submitted for review' });

  const existing = readCSV('approvals').find(
    (a) => a.entity_type === entity_type && a.entity_id === entity_id && a.status === 'pending',
  );

  const payload = {
    entity_type,
    entity_id,
    project_id: entity.project_id,
    approved_by: req.user.id,
    role: req.user.role,
    status,
    comments,
    created_at: new Date().toISOString(),
  };

  let row;
  if (existing) {
    row = updateRow('approvals', existing.id, payload);
  } else {
    row = appendRow('approvals', { id: randomUUID(), ...payload });
  }

  updateRow(TABLES[entity_type], entity_id, { status });

  const creatorField = entity_type === 'content' ? 'created_by' : 'uploaded_by';
  if (entity[creatorField]) {
    createNotification(
      entity[creatorField],
      status === 'approved' ? 'Item approved' : 'Approval declined',
      `Your ${entity_type} "${entity.title}" v${entity.version} was ${status} by the client.`,
      'approval',
    );
  }
  notifyRole('admin', `Client ${status} ${entity_type}`, `"${entity.title}" v${entity.version} was ${status}.`, 'approval');
  appendAuditLog(
    req.user,
    status === 'approved' ? 'CONTENT_APPROVED' : 'APPROVAL_REJECTED',
    entity_type,
    entity_id,
    `Client ${status} "${entity.title}" v${entity.version}${comments ? ` — ${comments}` : ''}`,
  );

  res.status(201).json(decorate(row));
});

export { clientOwnsProject };
export default router;
