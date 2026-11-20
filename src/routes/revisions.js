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

/** A client may only request changes on items from their own projects. */
function clientOwnsProject(user, projectId) {
  const client = readCSV('clients').find((c) => c.email.toLowerCase() === user.email.toLowerCase());
  if (!client) return false;
  const project = findById('projects', projectId);
  return Boolean(project && project.client_id === client.id);
}

function decorate(row) {
  const requester = findById('users', row.requested_by);
  const entity = findById(TABLES[row.entity_type], row.entity_id);
  const project = findById('projects', row.project_id);
  return {
    ...row,
    requested_by_name: requester?.name || 'Client',
    entity_title: entity?.title || 'Removed item',
    entity_version: Number(entity?.version) || 1,
    entity_status: entity?.status || '',
    project_name: project?.project_name || '',
  };
}

router.get('/', (req, res) => {
  let rows = readCSV('revisions');
  if (req.user.role === 'content_writer' || req.user.role === 'video_editor') {
    const table = req.user.role === 'content_writer' ? 'content' : 'media';
    const mine = new Set(readCSV(table).filter((r) => r.id).map((r) => r.id));
    rows = rows.filter((r) => TABLES[r.entity_type] === table && mine.has(r.entity_id));
  } else if (req.user.role === 'client') {
    rows = rows.filter((r) => r.requested_by === req.user.id);
  }
  res.json(rows.map(decorate));
});

router.post('/', roleMiddleware('client'), (req, res) => {
  const { entity_type, entity_id, reason } = req.body || {};
  if (!TABLES[entity_type] || !entity_id || !reason) {
    return res.status(400).json({ message: 'entity_type, entity_id and reason are required' });
  }
  const entity = findById(TABLES[entity_type], entity_id);
  if (!entity) return res.status(404).json({ message: 'Item not found' });
  if (!clientOwnsProject(req.user, entity.project_id)) {
    return res.status(403).json({ message: 'This item does not belong to one of your projects' });
  }

  const revision = {
    id: randomUUID(),
    entity_type,
    entity_id,
    project_id: entity.project_id,
    requested_by: req.user.id,
    reason,
    status: 'open',
    created_at: new Date().toISOString(),
  };
  appendRow('revisions', revision);
  updateRow(TABLES[entity_type], entity_id, { status: 'revision_requested' });

  // A revision request supersedes any pending approval.
  const pending = readCSV('approvals').find(
    (a) => a.entity_type === entity_type && a.entity_id === entity_id && a.status === 'pending',
  );
  if (pending) updateRow('approvals', pending.id, { status: 'rejected', comments: reason, approved_by: req.user.id });

  const creatorField = entity_type === 'content' ? 'created_by' : 'uploaded_by';
  createNotification(
    entity[creatorField],
    'Revision requested',
    `The client requested changes on "${entity.title}" v${entity.version}: ${reason}`,
    'revision',
  );
  notifyRole('task_manager', 'Revision requested by client', `"${entity.title}" needs changes.`, 'revision');
  appendAuditLog(req.user, 'REVISION_REQUESTED', entity_type, entity_id, `Revision on "${entity.title}" v${entity.version}: ${reason}`);
  res.status(201).json(decorate(revision));
});

router.patch('/:id/resolve', roleMiddleware('content_writer', 'video_editor'), (req, res) => {
  const revision = findById('revisions', req.params.id);
  if (!revision) return res.status(404).json({ message: 'Revision not found' });
  if (revision.status === 'resolved') return res.status(400).json({ message: 'Revision already resolved' });

  const table = TABLES[revision.entity_type];
  const entity = findById(table, revision.entity_id);
  if (!entity) return res.status(404).json({ message: 'Linked item not found' });
  const creatorField = revision.entity_type === 'content' ? 'created_by' : 'uploaded_by';
  if (entity[creatorField] !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'You can only resolve revisions on your own work' });
  }

  const updatedRevision = updateRow('revisions', revision.id, { status: 'resolved' });
  const newVersion = (Number(entity.version) || 1) + 1;
  const updatedEntity = updateRow(table, entity.id, { version: String(newVersion), status: 'draft' });

  appendAuditLog(
    req.user,
    'REVISION_RESOLVED',
    revision.entity_type,
    entity.id,
    `Resolved revision on "${entity.title}" — bumped to v${newVersion}`,
  );
  createNotification(
    revision.requested_by,
    'Revision resolved',
    `${req.user.name} resolved your feedback on "${entity.title}" and published v${newVersion}.`,
    'revision',
  );
  notifyRole('task_manager', 'Revision resolved', `${entity.title} is now v${newVersion}.`, 'revision');

  res.json({
    ...decorate(updatedRevision),
    entity_version: newVersion,
    entity_status: updatedEntity.status,
  });
});

export default router;
