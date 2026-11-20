import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import './db/seed.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import clientRoutes from './routes/clients.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import contentRoutes from './routes/content.js';
import mediaRoutes from './routes/media.js';
import approvalRoutes from './routes/approvals.js';
import revisionRoutes from './routes/revisions.js';
import paymentRoutes from './routes/payments.js';
import notificationRoutes from './routes/notifications.js';
import auditLogRoutes from './routes/auditLogs.js';
import dashboardRoutes from './routes/dashboard.js';

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  ...(process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
];

// Vercel-hosted frontends (production alias + preview deployments) are always allowed.
function isAllowedOrigin(origin) {
  if (allowedOrigins.includes(origin)) return true;
  try {
    return /(^|\.)vercel\.app$/.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'prelytix-cms-api', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/revisions', revisionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use('/api', (req, res) => res.status(404).json({ message: `No API route for ${req.method} ${req.originalUrl}` }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Prelytix CMS API listening on port ${PORT}`);
});
