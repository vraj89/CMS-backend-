import { Router } from 'express';
import { randomUUID } from 'crypto';
import { readCSV, appendRow, updateRow, findById } from '../db/csvStore.js';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import { appendAuditLog } from '../utils/audit.js';
import { clientUsersForProject, notifyRole, createNotification } from '../utils/notify.js';

const router = Router();
router.use(authMiddleware);

const FILE_TYPES = ['image', 'video', 'document'];

function decorate(item) {
  const uploader = findById('users', item.uploaded_by);
  const project = findById('projects', item.project_id);
  return {
    ...item,
    version: Number(item.version) || 1,
    uploader_name: uploader?.name || 'Unknown',
    project_name: project?.project_name || '',
  };
}

router.get('/', (req, res) => {
  const items = readCSV('media');
  const role = req.user.role;
  if (role === 'video_editor') return res.json(items.filter((m) => m.uploaded_by === req.user.id).map(decorate));
  if (role === 'client') {
    const client = readCSV('clients').find((c) => c.email.toLowerCase() === req.user.email.toLowerCase());
    const mine = new Set(readCSV('projects').filter((p) => p.client_id === client?.id).map((p) => p.id));
    return res.json(items.filter((m) => mine.has(m.project_id)).map(decorate));
  }
  res.json(items.map(decorate));
});

router.post('/', roleMiddleware('video_editor'), (req, res) => {
  const { project_id, task_id, title, file_url, file_type = 'video' } = req.body || {};
  if (!project_id || !title || !file_url) {
    return res.status(400).json({ message: 'project_id, title and file_url are required' });
  }
  if (!FILE_TYPES.includes(file_type)) return res.status(400).json({ message: 'Invalid file_type' });
  if (!findById('projects', project_id)) return res.status(404).json({ message: 'Project not found' });
  const item = {
    id: randomUUID(),
    project_id,
    task_id: task_id || '',
    title,
    file_url,
    file_type,
    version: '1',
    status: 'draft',
    uploaded_by: req.user.id,
    created_at: new Date().toISOString(),
  };
  appendRow('media', item);
  appendAuditLog(req.user, 'MEDIA_ADDED', 'media', item.id, `Added "${title}" v1 (${file_type})`);
  res.status(201).json(decorate(item));
});

router.patch('/:id', roleMiddleware('video_editor'), (req, res) => {
  const item = findById('media', req.params.id);
  if (!item) return res.status(404).json({ message: 'Media not found' });
  if (item.uploaded_by !== req.user.id) return res.status(403).json({ message: 'You can only edit your own media' });
  const updates = {};
  if (req.body?.title !== undefined) updates.title = req.body.title;
  let bumped = false;
  if (req.body?.file_url !== undefined && req.body.file_url !== item.file_url) {
    updates.file_url = req.body.file_url;
    updates.version = String((Number(item.version) || 1) + 1);
    updates.status = 'draft';
    bumped = true;
  }
  const updated = updateRow('media', item.id, updates);
  appendAuditLog(req.user, bumped ? 'MEDIA_VERSIONED' : 'MEDIA_UPDATED', 'media', item.id, `Updated "${item.title}"`);
  res.json(decorate(updated));
});

router.post('/:id/submit', roleMiddleware('video_editor'), (req, res) => {
  const item = findById('media', req.params.id);
  if (!item) return res.status(404).json({ message: 'Media not found' });
  if (item.uploaded_by !== req.user.id) return res.status(403).json({ message: 'You can only submit your own media' });
  const updated = updateRow('media', item.id, { status: 'submitted_for_review' });
  const project = findById('projects', item.project_id);
  appendAuditLog(req.user, 'MEDIA_SUBMITTED', 'media', item.id, `Submitted "${item.title}" v${item.version} for review`);
  clientUsersForProject(item.project_id, project).forEach((u) =>
    createNotification(u.id, 'Media ready for review', `${req.user.name} submitted "${item.title}" v${item.version}.`, 'approval'),
  );
  notifyRole('admin', 'Media awaiting client review', `${item.title} v${item.version} is in the review queue.`, 'approval');
  res.json(decorate(updated));
});

export default router;
