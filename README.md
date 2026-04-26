# Dau Do Truyen - Full-stack reading platform

This project is a reconstructed full-stack reading app based on the exported `webcuatui.zip` UI.

## Stack

- Frontend: React + Vite + React Router + plain CSS
- Backend: Node.js HTTP server with JSON persistence
- Auth: local HMAC token for development
- Features: story browsing, story detail, paid chapters via xu, bookmarks, follows, reading history, wallet, AI tools, admin dashboard

## Structure

```text
daudo-truyen/
├── backend/
│   ├── src/server.js
│   ├── src/reset-db.js
│   └── data/db.json
├── frontend/
│   ├── public/images/
│   └── src/main.jsx
└── README.md
```

## Run backend

```bash
cd backend
npm install
npm run dev
```

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

## Main API

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/stories`
- `GET /api/stories/:slug`
- `GET /api/stories/:slug/chapters/:number`
- `POST /api/stories/:id/bookmark`
- `POST /api/stories/:id/follow`
- `GET /api/me/library`
- `GET /api/wallet/transactions`
- `POST /api/wallet/topup`
- `POST /api/chapters/:id/unlock`

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

## Production notes

This repo is ready for local development and demo flows. The JSON database in `backend/data/db.json` is only for demo/prototyping; for production with real users, replace it with a real database, use a standard session/JWT setup, keep `JWT_SECRET` in environment variables, restrict CORS to the deployed frontend origin, add stronger request validation, and connect real payment flows before exposing wallet actions.

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
FRONTEND_ORIGIN=https://daudo-truyen.vercel.app
```

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

The current backend stores data in `backend/data/db.json`. For a public launch, use hosting with persistent disk if you keep JSON storage. For production with real users, move the data to PostgreSQL, Supabase, Neon, or another real database.
