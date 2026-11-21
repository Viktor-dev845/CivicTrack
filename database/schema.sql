-- AI-Enhanced CivicTrack: database schema (PostgreSQL 15+ with PostGIS 3.3+)
-- Matches Section 3.4.3 and Figure 3.5 of the report.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

DO $$ BEGIN
  CREATE TYPE user_role     AS ENUM ('citizen', 'admin');
  CREATE TYPE report_status AS ENUM ('reported', 'in_progress', 'resolved');
  CREATE TYPE severity_level AS ENUM ('low', 'medium', 'high');
  CREATE TYPE issue_category AS ENUM ('pothole', 'damaged_streetlight', 'waste_dump', 'drainage');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     VARCHAR(120) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          user_role NOT NULL DEFAULT 'citizen',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maintenance_units (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(120) NOT NULL UNIQUE,
  focus_area VARCHAR(120),
  contact    VARCHAR(255)
);

-- One cluster groups duplicate reports of the same problem
CREATE TABLE IF NOT EXISTS clusters (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  centroid_location GEOGRAPHY(Point, 4326) NOT NULL,
  primary_category  issue_category NOT NULL,
  report_count      INTEGER NOT NULL DEFAULT 1,
  first_reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reported_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clusters_centroid_gix ON clusters USING GIST (centroid_location);

CREATE TABLE IF NOT EXISTS reports (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id),
  assigned_unit_id     UUID REFERENCES maintenance_units(id),
  duplicate_cluster_id UUID REFERENCES clusters(id),
  image_url            VARCHAR(255) NOT NULL,
  user_description     TEXT,
  location             GEOGRAPHY(Point, 4326) NOT NULL,
  address_text         VARCHAR(255),
  ai_category          issue_category,
  ai_confidence        REAL CHECK (ai_confidence BETWEEN 0 AND 1),
  ai_severity          severity_level,
  reviewed_category    issue_category,      -- set only when an admin overrides the AI
  reviewed_severity    severity_level,
  needs_review         BOOLEAN NOT NULL DEFAULT false,
  priority_score       REAL NOT NULL DEFAULT 0,
  status               report_status NOT NULL DEFAULT 'reported',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_location_gix ON reports USING GIST (location);
CREATE INDEX IF NOT EXISTS reports_status_idx   ON reports (status);
CREATE INDEX IF NOT EXISTS reports_priority_idx ON reports (priority_score DESC);
CREATE INDEX IF NOT EXISTS reports_user_idx     ON reports (user_id);
