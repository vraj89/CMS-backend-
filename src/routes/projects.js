import { Router } from 'express';
import { randomUUID } from 'crypto';
import { readCSV, appendRow, updateRow, findById } from '../db/csvStore.js';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import { appendAuditLog } from '../utils/audit.js';
import { notifyRole } from '../utils/notify.js';

const router = Router();
router.use(authMiddleware);

export function projectProgress(projectId) {
  const tasks = readCSV('tasks').filter((t) => t.project_id === projectId);
  const content = readCSV('content').filter((c) => c.project_id === projectId);
  const media = readCSV('media').filter((m) => m.project_id === projectId);
  const total = tasks.length + content.length + media.length;
  if (!total) return 0;
  const done =
    tasks.filter((t) => t.status === 'approved').length +
    content.filter((c) => c.status === 'approved').length +
    media.filter((m) => m.status === 'approved').length;
  return Math.round((done / total) * 100);
}

function visibleProjects(user) {
  const projects = readCSV('projects');
  if (['admin', 'task_manager', 'marketing'].includes(user.role)) return projects;
  if (user.role === 'client') {
    const client = readCSV('clients').find((c) => c.email.toLowerCase() === user.email.toLowerCase());
    return client ? projects.filter((p) => p.client_id === client.id) : [];
  }
  const myProjectIds = new Set(
    readCSV('tasks')
      .filter((t) => t.assigned_to === user.id)
      .map((t) => t.project_id),
  );
  return projects.filter((p) => myProjectIds.has(p.id));
}

function decorate(project) {
  const client = findById('clients', project.client_id);
  return {
    ...project,
    budget: Number(project.budget) || 0,
    progress: projectProgress(project.id),
    client_name: client?.company_name || 'Unknown client',
    contact_person: client?.contact_person || '',
  };
}

router.get('/', (req, res) => {
  res.json(visibleProjects(req.user).map(decorate));
});

router.post('/', roleMiddleware('admin'), (req, res) => {
  const { client_id, project_name, description, start_date, deadline, budget } = req.body || {};
  if (!client_id || !project_name) return res.status(400).json({ message: 'client_id and project_name are required' });
  const client = findById('clients', client_id);
  if (!client) return res.status(404).json({ message: 'Client not found' });
  if (client.status !== 'active') {
    return res.status(400).json({ message: 'Client must be verified and active before creating a project' });
  }
  const project = {
    id: randomUUID(),
    client_id,
    project_name,
    description: description || '',
    status: 'onboarding',
    start_date: start_date || new Date().toISOString().slice(0, 10),
    deadline: deadline || '',
    budget: String(budget || 0),
    created_by: req.user.id,
    created_at: new Date().toISOString(),
  };
  appendRow('projects', project);
  appendAuditLog(req.user, 'PROJECT_CREATED', 'project', project.id, `Created project ${project_name}`);
  notifyRole('task_manager', 'New project created', `${project_name} for ${client.company_name} is ready for task allocation.`, 'info');
  res.status(201).json(decorate(project));
});

router.get('/:id', (req, res) => {
  const project = findById('projects', req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  if (!visibleProjects(req.user).some((p) => p.id === project.id)) {
    return res.status(403).json({ message: 'You do not have access to this project' });
  }
  res.json({
    ...decorate(project),
    tasks: readCSV('tasks').filter((t) => t.project_id === project.id),
    content: readCSV('content').filter((c) => c.project_id === project.id),
    media: readCSV('media').filter((m) => m.project_id === project.id),
    payments: readCSV('payments')
      .filter((p) => p.project_id === project.id)
      .map((p) => ({ ...p, amount: Number(p.amount) || 0 })),
  });
});

router.patch('/:id', roleMiddleware('admin', 'task_manager'), (req, res) => {
  const project = findById('projects', req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  const updates = {};
  for (const key of ['project_name', 'description', 'status', 'start_date', 'deadline', 'budget']) {
    if (req.body?.[key] !== undefined) updates[key] = String(req.body[key]);
  }
  const updated = updateRow('projects', project.id, updates);
  appendAuditLog(req.user, 'PROJECT_UPDATED', 'project', project.id, `Updated project ${updated.project_name}${updates.status ? ` → ${updates.status}` : ''}`);
  if (updates.status) {
    notifyRole('admin', 'Project status changed', `${updated.project_name} is now ${updates.status.replace('_', ' ')}.`, 'info');
  }
  res.json(decorate(updated));
});

export default router;
