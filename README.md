# Prelytix CMS — Backend API

Express + JWT API for the Prelytix CMS platform. Client onboarding, project delivery, versioned content, client approvals and revisions, milestone payments, notifications and audit logging. The datastore is 11 CSV files in `data/` — no database server needed.

## Run locally

```bash
npm install
cp .env.example .env     # optional, defaults work
npm run dev              # http://localhost:5000
```

- Health check: `GET /api/health`
- Seed / reset demo data: `npm run seed`
- Start without watch mode: `npm start` (or `node server.js`)

On boot the server creates any missing CSV file in `data/` from the bundled demo dataset. Set `RESEED=true` to restore that dataset on every restart (used on Render's ephemeral filesystem).

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | `prelytix_super_secret_key_2026` | Token signing key |
| `PORT` | `5000` | HTTP port (Render injects `10000`) |
| `FRONTEND_URL` | — | Allowed CORS origin (Vercel URL) |
| `NODE_ENV` | `development` | Runtime mode |
| `RESEED` | `false` | Restore demo dataset on boot |

CORS always allows `http://localhost:5173` and `http://localhost:4173` in addition to `FRONTEND_URL`.

## Deploy to Render

1. Push this folder to the `CMS-backend-` repository.
2. Render → New Web Service → connect the repo, runtime **Node**.
3. Build `npm install`, start `node server.js`.
4. Set `JWT_SECRET`, `FRONTEND_URL` (your Vercel URL), `NODE_ENV=production`, `RESEED=true`.
5. Optional: `render.yaml` is a ready blueprint (`healthCheckPath: /api/health`).

> CSV persistence: Render's filesystem is ephemeral, so data is re-seeded from the bundled defaults on every restart. Live edits persist for the current session only — intentional for this demo.

## Data model

| File | Rows |
| --- | --- |
| `users.csv` | 6 demo accounts (`password123`), hashed with bcrypt |
| `clients.csv` | Client companies + verification status |
| `projects.csv` | Projects linked to a client |
| `tasks.csv` | Production tasks and assignments |
| `content.csv` | Versioned copy |
| `media.csv` | URL-based image/video/document assets |
| `approvals.csv` | Client approval decisions |
| `revisions.csv` | Client feedback threads |
| `payments.csv` | Milestone schedule |
| `notifications.csv` | Per-user in-app notifications |
| `audit_logs.csv` | Every mutation, with user and timestamp |

`src/db/csvStore.js` exposes `readCSV`, `writeCSV`, `appendRow`, `updateRow`, `findById` and `deleteRow`. Routes read, mutate and write back immediately, so the CSV is the single source of truth.

## API

Base URL `/api`. All routes except `POST /auth/login` require `Authorization: Bearer <token>`.

| Method | Endpoint | Access |
| --- | --- | --- |
| POST | `/auth/login` | Public |
| GET | `/auth/me` | Any |
| GET / POST / PATCH | `/users`, `/users/:id` | Admin |
| GET | `/clients` | All except client |
| POST | `/clients` | Marketing |
| PATCH | `/clients/:id/verify`, `/clients/:id/reject` | Admin |
| GET | `/clients/me` | Client |
| GET | `/projects` | Any (role-filtered) |
| POST | `/projects` | Admin |
| GET | `/projects/:id` | Any (access-checked) |
| PATCH | `/projects/:id` | Admin, Task Manager |
| GET | `/tasks`, `/tasks/my` | Any (role-filtered) |
| GET | `/tasks/assignees` | Task Manager, Admin |
| POST | `/tasks` | Task Manager |
| PATCH | `/tasks/:id/status` | Assignee, Task Manager, Admin |
| GET / POST / PATCH | `/content`, `/content/:id`, `/content/:id/submit` | Writer (own), Admin |
| GET / POST / PATCH | `/media`, `/media/:id`, `/media/:id/submit` | Editor (own), Admin |
| GET / POST | `/approvals` | Client (own projects), Admin |
| GET / POST | `/revisions` | Client, Admin, creators |
| PATCH | `/revisions/:id/resolve` | Writer, Editor |
| GET / POST | `/payments` | Admin, Client |
| PATCH | `/payments/:id/mark-paid` | Admin |
| GET | `/notifications` | Own |
| PATCH | `/notifications/:id/read`, `/notifications/read-all` | Own |
| GET | `/audit-logs` | Admin |
| GET | `/dashboard/stats` | Any (role-aware) |

Every mutating route appends to `audit_logs` and, where relevant, creates an in-app `notification`. Clients can only approve or request revisions on items belonging to their own company's projects.

## Demo credentials

| Email | Role |
| --- | --- |
| `marketing@prelytix.com` | Marketing |
| `admin@prelytix.com` | Admin |
| `manager@prelytix.com` | Task Manager |
| `writer@prelytix.com` | Content Writer |
| `video@prelytix.com` | Video Editor |
| `client@acme.com` | Client |

Password for all: `password123`.

## Demo flow

1. Marketing onboards **Beta Industries** → `pending_verification`.
2. Admin verifies it → `active`.
3. Admin creates a project for Beta and moves it to `in_progress`.
4. Task Manager assigns a content task on **Acme Website Redesign** to the writer.
5. Writer drafts the copy, submits it → client notification.
6. Client approves with a comment → project progress rises.
7. Client requests a revision on submitted media → editor resolves it → version bumps to v2.
8. Admin marks the pending milestone as paid.
9. Admin opens Audit Logs and sees every action above.
