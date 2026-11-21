# CivicTrack

**An AI-Enabled GIS Framework for Automated Classification and Multi-Criteria Prioritisation of Citizen-Reported Urban Infrastructure Defects**

- **Researcher:** Kalu Victor (Matriculation No: `2025/B/MIT/1280`)
- **Programme:** Master of Information Technology (MIT) — Artificial Intelligence Specialisation, School of Computing, **MIVA Open University**
- **Supervisor:** Prof. Ageebee Silas Faki
- **Pilot City:** Umuahia, Abia State, Nigeria (`5.532°N, 7.486°E`)

---

## Overview

CivicTrack is a standalone, modular three-tier web GIS platform that pairs a transfer-learned dual-head **MobileNetV2** computer vision service with a **PostgreSQL + PostGIS** spatial backend and a **React + Leaflet** web interface:

1. **Citizen Portal (`frontend/`):** Public OpenStreetMap view of verified Umuahia reports colour-coded by severity, a 3-step report submission form (photo upload, GPS/map pin, optional details), and personal repair progress tracking (`Reported → In progress → Resolved`).
2. **Core API (`backend/`):** Node.js + Express REST service handling JWT authentication, bcrypt password hashing, `sharp` photo sanitisation (EXIF metadata removal), PostGIS duplicate clustering (`25 m`, `168 h`, counting distinct citizens to prevent score inflation), weighted priority ranking (`P = (0.50S + 0.30D + 0.20T) × 100`), DBSCAN hotspot queries (`100 m`, `≥ 3` open reports), and human-in-the-loop admin overrides.
3. **AI Inference Microservice (`ai-service/`):** Python + FastAPI + PyTorch service running a dual-head MobileNetV2 model (`v20261121-1511`) predicting category (`pothole`, `damaged_streetlight`, `waste_dump`, `drainage`), severity (`low`, `medium`, `high`), and minimum confidence (flagging `< 0.60` or service outages as `needs_review`).

---

## Repository Structure

```text
CivickTrack/
├── database/
│   └── schema.sql                # PostgreSQL + PostGIS schema (users, reports, clusters, maintenance_units)
├── backend/                      # Core API (Node.js + Express)
│   ├── src/                      # Routes, middleware, priority/duplicate/scoring/AI client services
│   ├── scripts/                  # migrate.js, seed.js
│   ├── tests/api.test.js         # 16 automated integration tests (node --test)
│   ├── .env.example              # Environment variable template (no real credentials)
│   └── package.json
├── frontend/                     # Citizen Portal & Admin Dashboard (React + Vite + Tailwind + Leaflet)
│   └── src/
├── ai-service/                   # AI Inference Service & Training Pipeline (Python + FastAPI + PyTorch)
│   ├── app/                      # main.py, model.py (dual-head MobileNetV2)
│   ├── training/train.py         # Two-stage transfer learning (equal 1:1 CrossEntropy loss)
│   ├── scripts/                  # download_dataset.py, label_tool.py, measure_latency.py
│   ├── data/real/                # labels.csv (184 hand-labelled rows), manual_review.json, provenance.json
│   ├── models/                   # civictrack_model.pt (v20261121-1511), metrics.json, splits.csv, plots
│   ├── LABELLING.md              # Written severity annotation rubric
│   └── requirements.txt
└── screenshots/                  # Application screenshots & model evaluation plots (Figures 4.1–5.3)
```

---

## Verified Evaluation Summary

Tested on an ordinary CPU-only laptop (Intel Core i7-5600U @ 2.60 GHz, 12 GB RAM, Windows 11 Pro, Python 3.14.3, Node.js v24.14.1, PostgreSQL 18.3 + PostGIS 3.7.0):

| Evaluation Check | Verified Result |
|---|---|
| **Dataset Curation** | `240` Wikimedia Commons candidate photos manually audited via `scripts/label_tool.py` against `LABELLING.md`; `56` off-topic excluded → **`184` hand-labelled photos** (`128` train / `28` val / `28` test) |
| **Category Classification (28 unseen test photos)** | **75.0% accuracy**, Macro Precision `0.83`, Macro Recall `0.74`, Macro F1 **`0.75`** |
| **Severity Assessment (28 unseen test photos)** | **64.3% accuracy**, Macro F1 **`0.62`**, **`80%` recall (`0.76` F1) on `high` severity** |
| **Core API Automated Integration Tests (`npm test`)** | **16 / 16 PASS** (`0` failures, `7.7 s`) |
| **AI Inference Latency (`measure_latency.py --n 100`)** | Avg **`2,142 ms`**, Median `2,127 ms`, 95th pct `2,244 ms`, Slowest **`2,460 ms`** (**PASS** vs ≤ `2,500 ms` NFR-01) |

---

## Quick Start (Local Development)

### 1. Database (PostgreSQL + PostGIS)
Create a PostgreSQL database named `civictrack`, then configure `backend/.env` from `backend/.env.example`:
```powershell
cd backend
npm install
copy .env.example .env   # set DATABASE_URL and JWT_SECRET
npm run migrate
npm run seed
```

### 2. AI Inference Service (Port 8000)
```powershell
cd ai-service
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 3. Core API Backend (Port 4000)
```powershell
cd backend
npm start
```

### 4. Frontend Web App (Port 5173)
```powershell
cd frontend
npm install --legacy-peer-deps
npm run dev -- --host
```
Open `http://localhost:5173` in your browser.

### 5. Running the 16 Automated Integration Tests
```powershell
cd backend
$env:TEST_DATABASE_URL = "postgres://postgres:<password>@localhost:5432/civictrack_test"
npm test
```
