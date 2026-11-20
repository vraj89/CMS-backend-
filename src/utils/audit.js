import { randomUUID } from 'crypto';
import { appendRow } from '../db/csvStore.js';

export function appendAuditLog(user, action, entityType, entityId, details = '') {
  return appendRow('audit_logs', {
    id: randomUUID(),
    user_id: user?.id || '',
    user_name: user?.name || 'System',
    action,
    entity_type: entityType,
    entity_id: entityId || '',
    details,
    created_at: new Date().toISOString(),
  });
}
