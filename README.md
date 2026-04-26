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
- `GET /api/admin/stats`
- `GET /api/admin/stories`
- `POST /api/admin/stories`
- `DELETE /api/admin/stories/:id`

## Production notes

This repo is ready for local development. For production, replace the JSON file with a real database, use a standard session/JWT setup, keep `JWT_SECRET` in environment variables, restrict CORS to the deployed frontend origin, add stronger request validation, and connect real payment flows before exposing wallet actions.

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
