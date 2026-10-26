# CampusPulse

CampusPulse is a student workspace for subjects, attendance, assignments, and important academic dates. It uses the required stack: HTML, CSS, JavaScript, React, Node.js/Express, and MongoDB. Firebase Authentication provides Google sign-in; Express verifies Firebase ID tokens and stores app sessions in MongoDB.

## Run locally on Windows

Install a supported Node.js release and start a local MongoDB server, or create a MongoDB Atlas database and copy its connection URI. In PowerShell, from this folder:

```powershell
Copy-Item .env.example .env
notepad .env
npm install
npm run dev
```

In `.env`, set `MONGODB_URI` to your MongoDB connection URI. You can use the `SECRET_KEY` environment variable you already created for `SESSION_SECRET`, or set a new long random value there. Save the file, then open http://localhost:5173.

The React/Vite development server proxies `/api` requests to Express on port 5000. For production, run `npm run build` and then `npm start`; Express serves the built React app. Set `NODE_ENV=production`, `MONGODB_URI`, and a durable `SESSION_SECRET` on the hosting service.

## Firebase Google sign-in

The Firebase web configuration is public client configuration in `src/firebase.js`. In Firebase Authentication, enable Google as a sign-in provider and add the development hostname (`localhost`) and production hostname to Authorized domains. The Node backend verifies Firebase ID tokens against the configured project ID before creating a MongoDB-backed app session. No service-account key is stored in the browser.

## Features

- Email/password accounts and Firebase Google sign-in
- Role checks for administrator-only endpoints (`ADMIN_EMAILS`, comma-separated)
- Private per-account subjects, attendance sessions, assignments, and calendar events
- Attendance percentage and classes-needed estimates
- Dashboard summary and upcoming dates

The API exposes `/api/auth/register`, `/api/auth/login`, `/api/auth/firebase`, `/api/auth/logout`, and `/api/auth/me`. Authenticated data is scoped to the signed-in MongoDB user.

## Preserved prior project

The previous source tree, Git history, and cleaned SQLite database snapshot are archived outside this folder at `C:\Users\himan\.codex\visualizations\2026\10\24\01a16c24-7ed2-7652-b29e-c59157f1f4f1\CampusPluse-preserved-2026-10-24`. The legacy academic records were erased from both SQLite copies at your request. The MongoDB app starts with an empty workspace; after Google sign-in it creates the account in MongoDB. The archived account record remains in the preserved snapshot and is not automatically imported.
