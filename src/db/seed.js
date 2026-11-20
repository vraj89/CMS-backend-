import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { writeCSV, ensureDataDir } from './csvStore.js';

const PASSWORD = 'password123';
const hash = bcrypt.hashSync(PASSWORD, 10);
const T = '2026-05-12T10:00:00Z';

const users = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Riya Shah', email: 'marketing@prelytix.com', password: hash, role: 'marketing', status: 'active', created_at: T },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Piyush Suthar', email: 'admin@prelytix.com', password: hash, role: 'admin', status: 'active', created_at: T },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Kalpesh Jadav', email: 'manager@prelytix.com', password: hash, role: 'task_manager', status: 'active', created_at: T },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Vraj Vaghela', email: 'writer@prelytix.com', password: hash, role: 'content_writer', status: 'active', created_at: T },
  { id: '55555555-5555-4555-8555-555555555555', name: 'Aarav Patel', email: 'video@prelytix.com', password: hash, role: 'video_editor', status: 'active', created_at: T },
  { id: '66666666-6666-4666-8666-666666666666', name: 'John Doe', email: 'client@acme.com', password: hash, role: 'client', status: 'active', created_at: T },
];

const clients = [
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    company_name: 'Acme Corp',
    contact_person: 'John Doe',
    email: 'client@acme.com',
    phone: '+91 98250 11122',
    industry: 'E-commerce',
    status: 'active',
    created_by: '11111111-1111-4111-8111-111111111111',
    created_at: '2026-05-01T09:15:00Z',
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    company_name: 'Nova Retail',
    contact_person: 'Priya Mehta',
    email: 'priya@novaretail.com',
    phone: '+91 98790 55443',
    industry: 'Retail',
    status: 'pending_verification',
    created_by: '11111111-1111-4111-8111-111111111111',
    created_at: '2026-05-10T11:30:00Z',
  },
];

const projects = [
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000001',
    client_id: 'aaaaaaaa-0000-4000-8000-000000000001',
    project_name: 'Acme Website Redesign',
    description: 'Full redesign of the Acme storefront with new brand guidelines, landing page copy and a 60-second brand video.',
    status: 'in_progress',
    start_date: '2026-05-02',
    deadline: '2026-06-30',
    budget: '85000',
    created_by: '22222222-2222-4222-8222-222222222222',
    created_at: '2026-05-02T10:00:00Z',
  },
];

const tasks = [
  {
    id: 'cccccccc-0000-4000-8000-000000000001',
    project_id: 'bbbbbbbb-0000-4000-8000-000000000001',
    title: 'Write homepage hero copy',
    description: 'Headline, subheadline and two CTA variants for the new Acme homepage.',
    assigned_to: '44444444-4444-4444-8444-444444444444',
    assigned_role: 'content_writer',
    status: 'in_progress',
    priority: 'high',
    due_date: '2026-05-20',
    created_by: '33333333-3333-4333-8333-333333333333',
    created_at: '2026-05-03T09:00:00Z',
  },
  {
    id: 'cccccccc-0000-4000-8000-000000000002',
    project_id: 'bbbbbbbb-0000-4000-8000-000000000001',
    title: 'Cut 60s brand video',
    description: 'Edit the raw brand footage into a 60 second cut with captions and music bed.',
    assigned_to: '55555555-5555-4555-8555-555555555555',
    assigned_role: 'video_editor',
    status: 'pending',
    priority: 'medium',
    due_date: '2026-05-26',
    created_by: '33333333-3333-4333-8333-333333333333',
    created_at: '2026-05-03T09:10:00Z',
  },
];

const content = [
  {
    id: 'dddddddd-0000-4000-8000-000000000001',
    project_id: 'bbbbbbbb-0000-4000-8000-000000000001',
    task_id: 'cccccccc-0000-4000-8000-000000000001',
    title: 'Homepage hero copy — draft',
    body: 'Shop smarter with Acme. Curated essentials, delivered in 48 hours.\n\nDraft notes: keep the tone warm and confident, avoid discount language.',
    version: '1',
    status: 'draft',
    created_by: '44444444-4444-4444-8444-444444444444',
    created_at: '2026-05-06T12:00:00Z',
  },
  {
    id: 'dddddddd-0000-4000-8000-000000000002',
    project_id: 'bbbbbbbb-0000-4000-8000-000000000001',
    task_id: 'cccccccc-0000-4000-8000-000000000001',
    title: 'About page story',
    body: 'Acme started in a garage in 2016 with one simple promise: better everyday products without the markup.\n\nThis version is with the client for feedback after the first round of comments.',
    version: '2',
    status: 'revision_requested',
    created_by: '44444444-4444-4444-8444-444444444444',
    created_at: '2026-05-05T10:00:00Z',
  },
];

const media = [
  {
    id: 'eeeeeeee-0000-4000-8000-000000000001',
    project_id: 'bbbbbbbb-0000-4000-8000-000000000001',
    task_id: 'cccccccc-0000-4000-8000-000000000002',
    title: 'Brand video — 60s cut',
    file_url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    file_type: 'video',
    version: '1',
    status: 'submitted_for_review',
    uploaded_by: '55555555-5555-4555-8555-555555555555',
    created_at: '2026-05-08T15:30:00Z',
  },
];

const approvals = [
  {
    id: 'ffffffff-0000-4000-8000-000000000001',
    entity_type: 'media',
    entity_id: 'eeeeeeee-0000-4000-8000-000000000001',
    project_id: 'bbbbbbbb-0000-4000-8000-000000000001',
    approved_by: '66666666-6666-4666-8666-666666666666',
    role: 'client',
    status: 'pending',
    comments: 'Awaiting client review.',
    created_at: '2026-05-08T15:30:00Z',
  },
];

const revisions = [
  {
    id: '99999999-0000-4000-8000-000000000001',
    entity_type: 'content',
    entity_id: 'dddddddd-0000-4000-8000-000000000002',
    project_id: 'bbbbbbbb-0000-4000-8000-000000000001',
    requested_by: '66666666-6666-4666-8666-666666666666',
    reason: 'Please add the founding story timeline and mention our 2025 sustainability pledge.',
    status: 'open',
    created_at: '2026-05-09T09:45:00Z',
  },
];

const payments = [
  {
    id: '12222222-0000-4000-8000-000000000001',
    project_id: 'bbbbbbbb-0000-4000-8000-000000000001',
    milestone: 'Advance — 40% on kickoff',
    amount: '34000',
    status: 'paid',
    due_date: '2026-05-05',
    paid_date: '2026-05-04',
    created_at: '2026-05-02T10:30:00Z',
  },
  {
    id: '12222222-0000-4000-8000-000000000002',
    project_id: 'bbbbbbbb-0000-4000-8000-000000000001',
    milestone: 'Design sign-off — 35%',
    amount: '29750',
    status: 'pending',
    due_date: '2026-05-28',
    paid_date: '',
    created_at: '2026-05-02T10:31:00Z',
  },
];

const notifications = [
  {
    id: '13333333-0000-4000-8000-000000000001',
    user_id: '44444444-4444-4444-8444-444444444444',
    title: 'New task assigned',
    message: 'Kalpesh Jadav assigned you "Write homepage hero copy" on Acme Website Redesign.',
    type: 'task',
    is_read: 'false',
    created_at: '2026-05-03T09:00:00Z',
  },
  {
    id: '13333333-0000-4000-8000-000000000002',
    user_id: '66666666-6666-4666-8666-666666666666',
    title: 'Item ready for review',
    message: 'Aarav Patel submitted "Brand video — 60s cut" for your review.',
    type: 'approval',
    is_read: 'false',
    created_at: '2026-05-08T15:30:00Z',
  },
];

const audit_logs = [
  {
    id: '14444444-0000-4000-8000-000000000001',
    user_id: '22222222-2222-4222-8222-222222222222',
    user_name: 'Piyush Suthar',
    action: 'CLIENT_VERIFIED',
    entity_type: 'client',
    entity_id: 'aaaaaaaa-0000-4000-8000-000000000001',
    details: 'Approved Acme Corp after KYC verification.',
    created_at: '2026-05-01T09:30:00Z',
  },
  {
    id: '14444444-0000-4000-8000-000000000002',
    user_id: '33333333-3333-4333-8333-333333333333',
    user_name: 'Kalpesh Jadav',
    action: 'TASK_CREATED',
    entity_type: 'task',
    entity_id: 'cccccccc-0000-4000-8000-000000000001',
    details: 'Assigned homepage hero copy to Vraj Vaghela.',
    created_at: '2026-05-03T09:00:00Z',
  },
  {
    id: '14444444-0000-4000-8000-000000000003',
    user_id: '55555555-5555-4555-8555-555555555555',
    user_name: 'Aarav Patel',
    action: 'MEDIA_SUBMITTED',
    entity_type: 'media',
    entity_id: 'eeeeeeee-0000-4000-8000-000000000001',
    details: 'Submitted brand video v1 for client review.',
    created_at: '2026-05-08T15:30:00Z',
  },
];

const tables = {
  users,
  clients,
  projects,
  tasks,
  content,
  media,
  approvals,
  revisions,
  payments,
  notifications,
  audit_logs,
};

/**
 * Writes the bundled demo dataset into /data.
 * By default only missing CSV files are created. Set RESEED=true to restore
 * the demo dataset on every boot (used on ephemeral hosts such as Render).
 */
export function ensureSeeded(force = false) {
  ensureDataDir();
  const dataDir = path.join(process.cwd(), 'data');
  for (const [name, rows] of Object.entries(tables)) {
    const file = path.join(dataDir, `${name}.csv`);
    if (!force && fs.existsSync(file) && fs.statSync(file).size > 0) continue;
    writeCSV(name, rows);
  }
}

ensureSeeded(process.env.RESEED === 'true');

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  ensureSeeded(true);
  console.log('Seeded 11 CSV files into ./data');
}

export { tables };
