import { Router } from 'express';
import { randomUUID } from 'crypto';
import { readCSV, appendRow, updateRow, findById } from '../db/csvStore.js';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import { appendAuditLog } from '../utils/audit.js';
import { createNotification } from '../utils/notify.js';

const router = Router();
router.use(authMiddleware);

const STATUSES = ['pending', 'in_progress', 'submitted', 'approved'];

function decorate(task) {
  const assignee = findById('users', task.assigned_to);
  const project = findById('projects', task.project_id);
  return {
    ...task,
    assignee_name: assignee?.name || 'Unassigned',
    assignee_email: assignee?.email || '',
    project_name: project?.project_name || '',
  };
}

router.get('/my', (req, res) => {
  res.json(readCSV('tasks').filter((t) => t.assigned_to === req.user.id).map(decorate));
});

// Assignable production users — needed by task managers to allocate work.
router.get('/assignees', roleMiddleware('task_manager', 'admin'), (req, res) => {
  res.json(
    readCSV('users')
      .filter((u) => ['content_writer', 'video_editor'].includes(u.role) && u.status === 'active')
      .map(({ id, name, email, role }) => ({ id, name, email, role })),
  );
});

router.get('/', (req, res) => {
  const tasks = readCSV('tasks');
  if (['admin', 'task_manager'].includes(req.user.role)) return res.json(tasks.map(decorate));
  if (req.user.role === 'client') {
    const client = readCSV('clients').find((c) => c.email.toLowerCase() === req.user.email.toLowerCase());
    const mine = new Set(readCSV('projects').filter((p) => p.client_id === client?.id).map((p) => p.id));
    return res.json(tasks.filter((t) => mine.has(t.project_id)).map(decorate));
  }
  res.json(tasks.filter((t) => t.assigned_to === req.user.id).map(decorate));
});

router.post('/', roleMiddleware('task_manager'), (req, res) => {
  const { project_id, title, description, assigned_to, status = 'pending', priority = 'medium', due_date } = req.body || {};
  if (!project_id || !title || !assigned_to) {
    return res.status(400).json({ message: 'project_id, title and assigned_to are required' });
  }
  const project = findById('projects', project_id);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  const assignee = findById('users', assigned_to);
  if (!assignee) return res.status(404).json({ message: 'Assignee not found' });
  if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });

  const task = {
    id: randomUUID(),
    project_id,
    title,
    description: description || '',
    assigned_to,
    assigned_role: assignee.role,
    status,
    priority,
    due_date: due_date || '',
    created_by: req.user.id,
    created_at: new Date().toISOString(),
  };
  appendRow('tasks', task);
  appendAuditLog(req.user, 'TASK_CREATED', 'task', task.id, `Assigned "${title}" to ${assignee.name}`);
  createNotification(assignee.id, 'New task assigned', `${req.user.name} assigned you "${title}" on ${project.project_name}.`, 'task');
  res.status(201).json(decorate(task));
});

router.patch('/:id/status', (req, res) => {
  const task = findById('tasks', req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });
  const isOwner = task.assigned_to === req.user.id;
  if (!isOwner && !['task_manager', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Only the assignee or a task manager can update this task' });
  }
  const updated = updateRow('tasks', task.id, { status });
  appendAuditLog(req.user, 'TASK_STATUS_UPDATED', 'task', task.id, `"${task.title}" → ${status}`);
  if (task.created_by && task.created_by !== req.user.id) {
    createNotification(task.created_by, 'Task status updated', `${req.user.name} moved "${task.title}" to ${status.replace('_', ' ')}.`, 'task');
  }
  res.json(decorate(updated));
});

export default router;
