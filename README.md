# Dau Do Truyen - Full-stack reading platform

This project is a reconstructed full-stack reading app based on the exported `webcuatui.zip` UI.

## Stack

- Frontend: React + Vite + React Router + plain CSS
- Backend: Node.js HTTP server with Supabase persistence
- Storage: Supabase Storage through `backend/src/services/storage.js`
- Auth: local HMAC token for development
- Features: story browsing, story detail, paid chapters via xu, bookmarks, follows, reading history, wallet, AI tools, admin dashboard

## Structure

```text
daudo-truyen/
|-- backend/
|   |-- src/server.js
|   |-- src/supabase.js
|   |-- src/repositories/
|   |-- src/migrate-json-to-supabase.js
|   |-- src/reset-db.js
|   `-- data/db.json   # local seed/migration source only
|-- frontend/
|   |-- public/images/
|   `-- src/main.jsx
|-- supabase/schema.sql
`-- README.md
```

## Run backend

```bash
cd backend
npm install
npm run dev
```

Create `backend/.env` from `backend/.env.example` before running against Supabase:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
JWT_SECRET=<long-random-secret>
FRONTEND_ORIGIN=http://localhost:5173,https://daudotruyen.vercel.app,https://daudo-truyen.vercel.app
DATA_STORE=supabase
STORAGE_PROVIDER=supabase
SUPABASE_COVER_BUCKET=story-covers
PUBLIC_STORAGE_BASE_URL=
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never expose it through Vite or frontend env files.

Default backend URL:

```text
http://localhost:4000
```

Health check:

```text
http://localhost:4000/api/health
```

## Run frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Default frontend URL:

```text
http://localhost:5173
```

## Seed accounts

```text
Admin: admin@example.com / 123456
User:  user@example.com / 123456
```

## Reset local data

```bash
cd backend
npm run reset-db
```

`reset-db` only rewrites `backend/data/db.json` for local seed/migration work. Runtime APIs do not read from `db.json`.

## Supabase setup and migration

1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase/schema.sql`.
3. Confirm the public storage bucket `story-covers` exists. The schema inserts it automatically when the Supabase `storage` schema is available.
4. Set backend env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `FRONTEND_ORIGIN`, `DATA_STORE=supabase`, `STORAGE_PROVIDER=supabase`, and `SUPABASE_COVER_BUCKET=story-covers`.
5. Import existing JSON data:

```bash
cd backend
npm run migrate:supabase
```

The migration reads `backend/data/db.json` when present, upserts rows idempotently, and seeds the bundled admin/user data when the JSON file is absent.

## Main API

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/uploads/cover` (multipart image upload; JPG/PNG/WEBP, original max 10MB, compressed max 500KB)
- `GET /api/stories`
- `GET /api/stories/:slug`
- `GET /api/stories/:slug/chapters/:number`
- `POST /api/stories/:id/bookmark`
- `POST /api/stories/:id/follow`
- `GET /api/me/library`
- `POST /api/reading-progress` (upserts one row per user/story)
- `GET /api/wallet/transactions`
- `POST /api/wallet/topup`
- `POST /api/payments/webhook`
- `POST /api/chapters/:id/unlock`

## Production data model

`backend/data/db.json` is no longer a production source of truth. Production runs against PostgreSQL/Supabase with:

- `stories.cover_url` / `stories.cover_path` and `users.avatar_url`; base64 images are rejected by backend validation.
- `reading_progress` with `unique(user_id, story_id)` so reading only updates the last state for a story.
- `user_wallets`, `payment_orders`, `coin_transactions`, and `chapter_purchases`; chapter unlock uses a transaction/RPC path and `unique(user_id, chapter_id)` to avoid double charging.
- `admin_audit_logs` for production audit trails. The legacy in-app admin log response is still kept compatible for the current UI.

The frontend author cover uploader compresses selected covers client-side to WebP around 1100px wide and uploads the compressed file before saving the story. The database only receives the returned URL/path.

## Admin CMS API

All `/api/admin/*` routes require an authenticated admin token. The Admin CMS at `/admin` uses real API data only; failed endpoints are shown as errors instead of falling back to fake production data.

- `GET /api/admin/dashboard`
- `GET /api/admin/stats` (compat alias for dashboard stats)
- `GET /api/admin/users?query=&role=&status=&page=&limit=`
- `PATCH /api/admin/users/:id`
- `POST /api/admin/users/:id/adjust-balance`
- `GET /api/admin/stories?query=&approvalStatus=&hidden=&status=&page=&limit=`
- `POST /api/admin/stories`
- `PUT /api/admin/stories/:id`
- `PATCH /api/admin/stories/:id/status`
- `PATCH /api/admin/stories/:id/flags`
- `DELETE /api/admin/stories/:id`
- `GET /api/admin/chapters?storyId=&query=&status=&vip=&page=&limit=`
- `POST /api/admin/stories/:id/chapters`
- `PUT /api/admin/chapters/:id`
- `PATCH /api/admin/chapters/:id/status`
- `DELETE /api/admin/chapters/:id`
- `GET /api/admin/reports?status=&type=&severity=&page=&limit=`
- `PATCH /api/admin/reports/:id`
- `POST /api/admin/reports/:id/actions`
- `GET /api/admin/comments?query=&status=&storyId=&page=&limit=`
- `PATCH /api/admin/comments/:id`
- `DELETE /api/admin/comments/:id`
- `GET /api/admin/transactions?query=&type=&status=&method=&from=&to=&page=&limit=`
- `GET /api/admin/taxonomy`
- `POST /api/admin/taxonomy/categories`
- `PATCH /api/admin/taxonomy/categories/:id`
- `DELETE /api/admin/taxonomy/categories/:id`
- `POST /api/admin/taxonomy/tags`
- `PATCH /api/admin/taxonomy/tags/:id`
- `DELETE /api/admin/taxonomy/tags/:id`
- `GET /api/admin/notifications`
- `POST /api/admin/notifications`
- `PATCH /api/admin/notifications/:id`
- `GET /api/admin/logs?entityType=&entityId=&adminId=&page=&limit=`

## Tests

```bash
cd backend
npm test
```

Backend tests use the in-memory repository (`DATA_STORE=memory`) and do not read or write the production Supabase database or `backend/data/db.json`.

## Production notes

Production runtime requires Supabase env vars and does not fall back to `backend/data/db.json`. The backend keeps local HMAC JWT/password handling, so rotate `JWT_SECRET` carefully, restrict `FRONTEND_ORIGIN` to deployed domains, and keep the service role key only on the backend host.

## Deploy online

Deploy the backend and frontend as two separate services.

Backend service:

```text
Root directory: backend
Build command: npm install
Start command: npm start
```

Set these environment variables on the backend host:

```text
JWT_SECRET=<long-random-secret>
FRONTEND_ORIGIN=https://daudotruyen.vercel.app,https://daudo-truyen.vercel.app
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
DATA_STORE=supabase
STORAGE_PROVIDER=supabase
SUPABASE_COVER_BUCKET=story-covers
```

`backend/src/server.js` already accepts a comma-separated `FRONTEND_ORIGIN`, so you can allow both the current public Vercel domain and the legacy hyphenated domain during cutover.

The backend reads `process.env.PORT`, so leave `PORT` to the hosting platform when it provides one.

Frontend service:

```text
Root directory: frontend
Build command: npm install && npm run build
Publish/output directory: dist
```

For local frontend development, `frontend/.env` points to `http://localhost:4000/api`. For production builds, `frontend/.env.production` points to:

```text
VITE_API_URL=https://api-daudo-truyen.onrender.com/api
```

Change that value to the real backend domain before building if the backend is deployed somewhere else. Do not reuse an old `frontend/dist` after changing `VITE_API_URL`; rebuild the frontend so the public bundle calls the correct API.

The frontend uses React Router with `BrowserRouter`. `frontend/vercel.json` rewrites all routes to `index.html` so direct refreshes on routes such as `/admin`, `/ho-so`, and `/truyen/...` do not return 404 on Vercel.

The current backend stores runtime data in Supabase. Keep `backend/data/db.json` only as a local export/seed source for `npm run migrate:supabase` or `npm run reset-db`.
