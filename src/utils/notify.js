import { randomUUID } from 'crypto';
import { appendRow, readCSV } from '../db/csvStore.js';

export function createNotification(userId, title, message, type = 'info') {
  if (!userId) return null;
  return appendRow('notifications', {
    id: randomUUID(),
    user_id: userId,
    title,
    message,
    type,
    is_read: 'false',
    created_at: new Date().toISOString(),
  });
}

export function notifyRole(role, title, message, type = 'info') {
  readCSV('users')
    .filter((u) => u.role === role && u.status === 'active')
    .forEach((u) => createNotification(u.id, title, message, type));
}

/** Client user account linked to a client company (matched by email). */
export function clientUsersForProject(projectId, project) {
  const client = readCSV('clients').find((c) => c.id === project?.client_id);
  if (!client) return [];
  return readCSV('users').filter((u) => u.role === 'client' && u.email === client.email);
}

export function assertNotSelf(userId) {
  return Boolean(userId);
}
