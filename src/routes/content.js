import { Router } from 'express';
import { randomUUID } from 'crypto';
import { readCSV, appendRow, updateRow, findById } from '../db/csvStore.js';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import { appendAuditLog } from '../utils/audit.js';
import { clientUsersForProject, notifyRole, createNotification } from '../utils/notify.js';

const router = Router();
router.use(authMiddleware);

function decorate(item) {
  const creator = findById('users', item.created_by);
  const project = findById('projects', item.project_id);
  return {
    ...item,
    version: Number(item.version) || 1,
    creator_name: creator?.name || 'Unknown',
    project_name: project?.project_name || '',
  };
}

router.get('/', (req, res) => {
  const items = readCSV('content');
  const role = req.user.role;
  if (role === 'content_writer') return res.json(items.filter((c) => c.created_by === req.user.id).map(decorate));
  if (role === 'client') {
    const client = readCSV('clients').find((c) => c.email.toLowerCase() === req.user.email.toLowerCase());
    const mine = new Set(readCSV('projects').filter((p) => p.client_id === client?.id).map((p) => p.id));
    return res.json(items.filter((c) => mine.has(c.project_id)).map(decorate));
  }
  res.json(items.map(decorate));
});

router.post('/', roleMiddleware('content_writer'), (req, res) => {
  const { project_id, task_id, title, body } = req.body || {};
  if (!project_id || !title) return res.status(400).json({ message: 'project_id and title are required' });
  if (!findById('projects', project_id)) return res.status(404).json({ message: 'Project not found' });
  const item = {
    id: randomUUID(),
    project_id,
    task_id: task_id || '',
    title,
    body: body || '',
    version: '1',
    status: 'draft',
    created_by: req.user.id,
    created_at: new Date().toISOString(),
  };
  appendRow('content', item);
  appendAuditLog(req.user, 'CONTENT_CREATED', 'content', item.id, `Created "${title}" v1`);
  res.status(201).json(decorate(item));
});

router.patch('/:id', roleMiddleware('content_writer', 'admin'), (req, res) => {
  const item = findById('content', req.params.id);
  if (!item) return res.status(404).json({ message: 'Content not found' });
  if (req.user.role === 'content_writer' && item.created_by !== req.user.id) {
    return res.status(403).json({ message: 'You can only edit your own content' });
  }
  const updates = {};
  if (req.body?.title !== undefined) updates.title = req.body.title;
  let bumped = false;
  if (req.body?.body !== undefined && req.body.body !== item.body) {
    updates.body = req.body.body;
    updates.version = String((Number(item.version) || 1) + 1);
    updates.status = 'draft';
    bumped = true;
  }
  const updated = updateRow('content', item.id, updates);
  appendAuditLog(
    req.user,
    bumped ? 'CONTENT_VERSIONED' : 'CONTENT_UPDATED',
    'content',
    item.id,
    bumped ? `"${item.title}" moved to v${updated.version}` : `Edited "${item.title}"`,
  );
  res.json(decorate(updated));
});

router.post('/:id/submit', roleMiddleware('content_writer'), (req, res) => {
  const item = findById('content', req.params.id);
  if (!item) return res.status(404).json({ message: 'Content not found' });
  if (item.created_by !== req.user.id) return res.status(403).json({ message: 'You can only submit your own content' });
  const updated = updateRow('content', item.id, { status: 'submitted_for_review' });
  const project = findById('projects', item.project_id);
  appendAuditLog(req.user, 'CONTENT_SUBMITTED', 'content', item.id, `Submitted "${item.title}" v${item.version} for review`);
  clientUsersForProject(item.project_id, project).forEach((u) =>
    createNotification(u.id, 'Content ready for review', `${req.user.name} submitted "${item.title}" v${item.version}.`, 'approval'),
  );
  notifyRole('admin', 'Content awaiting client review', `${item.title} v${item.version} is in the review queue.`, 'approval');
  res.json(decorate(updated));
});

export default router;
