# Changelog

## 2026-10-24 — Required stack migration

- Replaced the Flask/SQLite runtime with a React frontend and Node.js/Express API backed by MongoDB.
- Kept Firebase Google sign-in, added server verification of Firebase ID tokens, and moved application sessions into MongoDB.
- Used only Firebase's app and authentication SDK packages in the browser instead of the all-services bundle.
- Recreated private per-user subjects, attendance, assignment, calendar, dashboard, and administrator-role endpoints.
- The MongoDB workspace starts empty; users are created on their next sign-in. No legacy academic records were imported.
- Updated the setup guide for Node.js and MongoDB. The archived account and prior source snapshot remain outside the project folder.

## 2026-10-24 — Clean application rebuild

- Recreated CampusPulse with a new responsive interface and a clear sign-in flow.
- Kept email/password and Firebase Google authentication, with server-side Firebase token verification.
- Rebuilt subject, attendance, assignment, calendar, and dashboard features.
- Restricted each signed-in account's records to that account; administrator endpoints require the admin role.
- Retained the existing account in the new database at `instance/campuspulse.db`.
- Erased the unowned legacy academic records (2 subjects, 2 attendance sessions, 1 assignment, and 1 calendar event) from both the new and archived SQLite database copies, as requested. No legacy academic records remain in either live database.
- Added the Requests HTTP transport dependency required by server-side Firebase token verification, and made Google sign-in verify that the CampusPulse session was saved before reloading.
- Archived the previous files, Git history, and working copy at `C:\Users\himan\.codex\visualizations\2026\10\24\01a16c24-7ed2-7652-b29e-c59157f1f4f1\CampusPluse-preserved-2026-10-24`.
- Current database contents after cleanup: 1 account and no subjects, attendance sessions, assignments, or calendar events.

### Earlier project history

The prior Git history contained the initial project commit `6cac836` (`Flexi-Submission`). Its source snapshot and Git metadata are retained in the archive above.
