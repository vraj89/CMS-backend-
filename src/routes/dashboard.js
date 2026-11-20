import { Router } from 'express';
import { readCSV } from '../db/csvStore.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const since = (days) => Date.now() - days * 24 * 60 * 60 * 1000;
const recent = (rows, days = 7) => rows.filter((r) => new Date(r.created_at).getTime() >= since(days));

function clientOf(user) {
  return readCSV('clients').find((c) => c.email.toLowerCase() === user.email.toLowerCase());
}

function myProjectIds(user) {
  if (user.role === 'client') {
    const client = clientOf(user);
    return readCSV('projects').filter((p) => p.client_id === client?.id).map((p) => p.id);
  }
  if (user.role === 'content_writer' || user.role === 'video_editor') {
    return [...new Set(readCSV('tasks').filter((t) => t.assigned_to === user.id).map((t) => t.project_id))];
  }
  return readCSV('projects').map((p) => p.id);
}

function card(key, label, value, trend) {
  return { key, label, value, trend: trend || null };
}

router.get('/stats', (req, res) => {
  const user = req.user;
  const clients = readCSV('clients');
  const projects = readCSV('projects');
  const tasks = readCSV('tasks');
  const content = readCSV('content');
  const media = readCSV('media');
  const payments = readCSV('payments');
  const revisions = readCSV('revisions');

  const myTasks = tasks.filter((t) => t.assigned_to === user.id);
  const myContent = content.filter((c) => c.created_by === user.id);
  const myMedia = media.filter((m) => m.uploaded_by === user.id);
  const projectIds = new Set(myProjectIds(user));
  const scope = (rows) => rows.filter((r) => projectIds.has(r.project_id));

  let cards = [];
  if (user.role === 'marketing') {
    cards = [
      card('clients', 'Clients Onboarded', clients.filter((c) => c.created_by === user.id).length, `${recent(clients, 30).length} this month`),
      card('pending', 'Pending Verification', clients.filter((c) => c.status === 'pending_verification').length),
      card('active', 'Active Accounts', clients.filter((c) => c.status === 'active').length),
      card('revenue', 'Revenue Collected', `₹${payments.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0).toLocaleString('en-IN')}`),
    ];
  } else if (user.role === 'admin') {
    cards = [
      card('clients', 'Total Clients', clients.length, `${clients.filter((c) => c.status === 'active').length} active`),
      card('projects', 'Active Projects', projects.filter((p) => p.status === 'in_progress' || p.status === 'in_review').length, `${projects.length} total`),
      card('reviews', 'Pending Reviews', content.filter((c) => c.status === 'submitted_for_review').length + media.filter((m) => m.status === 'submitted_for_review').length),
      card('revenue', 'Revenue Collected', `₹${payments.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0).toLocaleString('en-IN')}`),
    ];
  } else if (user.role === 'task_manager') {
    cards = [
      card('projects', 'My Projects', projects.filter((p) => p.status !== 'completed').length),
      card('open', 'Open Tasks', tasks.filter((t) => t.status === 'pending').length),
      card('progress', 'In Progress', tasks.filter((t) => t.status === 'in_progress').length),
      card('review', 'Awaiting Review', tasks.filter((t) => t.status === 'submitted').length),
    ];
  } else if (user.role === 'content_writer') {
    cards = [
      card('drafts', 'My Drafts', myContent.filter((c) => c.status === 'draft').length),
      card('review', 'Awaiting Review', myContent.filter((c) => c.status === 'submitted_for_review').length),
      card('approved', 'Approved', myContent.filter((c) => c.status === 'approved').length),
      card('revisions', 'Revisions', myContent.filter((c) => c.status === 'revision_requested').length),
    ];
  } else if (user.role === 'video_editor') {
    cards = [
      card('media', 'My Media', myMedia.length),
      card('review', 'Awaiting Review', myMedia.filter((m) => m.status === 'submitted_for_review').length),
      card('approved', 'Approved', myMedia.filter((m) => m.status === 'approved').length),
      card('revisions', 'Revisions', myMedia.filter((m) => m.status === 'revision_requested').length),
    ];
  } else {
    cards = [
      card('reviews', 'Pending Reviews', scope(content).filter((c) => c.status === 'submitted_for_review').length + scope(media).filter((m) => m.status === 'submitted_for_review').length),
      card('approved', 'Approved Items', scope(content).filter((c) => c.status === 'approved').length + scope(media).filter((m) => m.status === 'approved').length),
      card('projects', 'My Projects', projectIds.size),
      card('payments', 'Pending Payments', `₹${scope(payments).filter((p) => p.status !== 'paid').reduce((s, p) => s + Number(p.amount || 0), 0).toLocaleString('en-IN')}`),
    ];
  }

  const scopeTasks = user.role === 'admin' || user.role === 'task_manager' || user.role === 'marketing'
    ? tasks
    : user.role === 'client'
      ? scope(tasks)
      : myTasks;
  const statusOrder = ['pending', 'in_progress', 'submitted', 'approved'];
  const taskStatus = statusOrder.map((s) => ({ name: s.replace('_', ' '), value: scopeTasks.filter((t) => t.status === s).length }));

  const auditRows = readCSV('audit_logs');
  const recentActivity = (user.role === 'admin' ? auditRows : auditRows.filter((a) => projectIds.has(a.entity_id) || a.user_id === user.id))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6)
    .map((a) => ({ id: a.id, title: a.action.replaceAll('_', ' '), message: a.details, user_name: a.user_name, created_at: a.created_at }));

  const recentNotifications = readCSV('notifications')
    .filter((n) => n.user_id === user.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 4)
    .map((n) => ({ ...n, is_read: n.is_read === 'true' }));

  res.json({
    role: user.role,
    cards,
    taskStatus,
    recentActivity,
    notifications: recentNotifications,
    openRevisions: readCSV('revisions').filter((r) => r.status === 'open').length,
    unread: readCSV('notifications').filter((n) => n.user_id === user.id && n.is_read !== 'true').length,
  });
});

export default router;
