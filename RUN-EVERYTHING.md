# How to run the whole CivicTrack prototype on your laptop

You need: Node.js 20+, PostgreSQL 15+ with PostGIS, and Python 3.10+. No Docker needed.

1. **Database.** In pgAdmin or `psql`, create a database called `civictrack`, then enable PostGIS (`CREATE EXTENSION postgis;`).
2. **Backend.**
   ```
   cd backend
   copy .env.example .env      # edit DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD
   npm install
   npm run migrate
   npm run seed
   npm start                   # runs on http://localhost:4000
   ```
3. **AI service.** The trained MobileNetV2 checkpoint (`models/civictrack_model.pt`, version `v20261121-1511`) is included. If the AI service is not running, reports are still saved and flagged `needs_review`, so the rest of the system continues to work.
   ```
   cd ai-service
   pip install -r requirements.txt
   python -m uvicorn app.main:app --port 8000
   ```
   Check `http://localhost:8000/health` (should return `"model_loaded": true`).
4. **Portal.**
   ```
   cd frontend
   npm install --legacy-peer-deps
   npm run dev                 # open http://localhost:5173
   ```
5. **Try it:** register a citizen, report a problem with a photo and a map pin, then log in as the administrator (`ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`) to inspect the ranked triage queue, review panel, and DBSCAN hotspot view.

Only verified reports appear on the public map: those the AI was confident about (`0.60` or higher), or that an administrator has checked.
