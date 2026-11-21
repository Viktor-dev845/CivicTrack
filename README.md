# CivicTrack

**An AI-Enabled GIS Framework for Automated Classification and Multi-Criteria Prioritisation of Citizen-Reported Urban Infrastructure Defects**

Master's project (MIT, AI specialisation), MIVA Open University.
Author: Kalu Victor (2025/B/MIT/1280). Supervisor: Prof. Ageebee Silas Faki.

Citizens report a problem with a photo and a map pin. An AI model names the defect type and severity,
duplicate reports are grouped, and city staff work from a ranked list and a hotspot map.

## Project layout

| Folder | What it is |
|---|---|
| `database/` | PostgreSQL + PostGIS schema |
| `backend/` | Core API (Node.js + Express), 16 automated tests |
| `ai-service/` | AI service (Python + FastAPI + PyTorch, MobileNetV2), training, evaluation and labelling tools |
| `frontend/` | Citizen portal and admin dashboard (React + Leaflet) |

## Results (honest summary)

- Model trained on 128 hand-labelled public images (Wikimedia Commons); 28 validation, 28 test.
- Defect type accuracy 75.0% (21/28). Severity accuracy 64.3% (18/28).
- Average classification time about 2.1 s over 100 requests (measured on an earlier model version).
- Limits: public non-Umuahia images, one labeller, small test set, no user survey. See the report, Chapter 5.

Quick start for the whole system: see `RUN-EVERYTHING.md`.

## Run the backend (first time)

You need Node.js 20+ and PostgreSQL 15+ with the PostGIS extension.

1. Create an empty database:  `createdb civictrack`  (or use pgAdmin)
2. In `backend/`, copy `.env.example` to `.env` and fill in your database password and a long random `JWT_SECRET`.
3. Install and set up:
   ```
   cd backend
   npm install
   npm run migrate     # creates the tables
   npm run seed        # creates the first admin and 4 maintenance units
   npm start           # http://localhost:4000
   ```
4. Check it works: open http://localhost:4000/api/health  (should show `{"status":"ok"}`).

Until the AI service exists, new reports are saved and flagged **needs_review**; an administrator
sets the category and severity by hand. This is the same fallback the report describes (Section 3.4.2).

## Run the tests

Create a second empty database called `civictrack_test`, then:
```
cd backend
set TEST_DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/civictrack_test   (Windows)
export TEST_DATABASE_URL=...                                                             (Mac/Linux)
npm test
```
The tests delete and recreate the tables in the test database, so never point them at `civictrack`.

## API summary

| Method and path | Who | What |
|---|---|---|
| POST `/api/auth/register`, `/api/auth/login`, GET `/api/auth/me` | anyone / logged in | accounts (new accounts are always citizens) |
| POST `/api/reports` | citizen | multipart form: `photo`, `latitude`, `longitude`, `description`, `address_text` |
| GET `/api/reports/public` | anyone | map data, no personal details |
| GET `/api/reports/mine`, `/api/reports/:id` | owner or admin | own reports and status |
| GET `/api/admin/reports` | admin | prioritised triage queue (`?status=`, `?needs_review=true`, `?category=`) |
| PATCH `/api/admin/reports/:id/review` | admin | override AI category and/or severity |
| PATCH `/api/admin/reports/:id/status` | admin | `reported`, `in_progress`, `resolved` |
| PATCH `/api/admin/reports/:id/assign` | admin | assign to a maintenance unit |
| GET `/api/admin/hotspots` | admin | DBSCAN hotspot clusters |
| GET/POST `/api/admin/units` | admin | maintenance units |
| POST `/api/admin/recalculate` | admin | refresh all priority scores |

## How the main rules work (match the report)

- **Duplicate detection:** same category, within 25 m, within 7 days, and the original still open. The cluster count (report_count) counts different people, so one person reporting the same problem again does not raise the priority. The public map shows only verified reports: those the AI was confident about, or that an administrator has checked.
- **Priority score:** `P = (0.50 x severity + 0.30 x density + 0.20 x aging) x 100`
  (severity low/medium/high = 0.33/0.67/1.0; density = reports in cluster / 10, max 1; aging = hours / 168, max 1).
- **Low AI confidence** (below 0.6) or **AI service down:** report is saved and flagged for manual review.
- **Photos:** re-encoded on upload, which removes EXIF data such as the phone's GPS tags.
