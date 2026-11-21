require("dotenv").config();

const num = (v, d) => (v === undefined || v === "" ? d : Number(v));

module.exports = {
  port: num(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/civictrack",
  jwtSecret: process.env.JWT_SECRET || "change-me-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  aiServiceUrl: process.env.AI_SERVICE_URL || "http://localhost:8000",
  aiTimeoutMs: num(process.env.AI_TIMEOUT_MS, 8000),
  // Below this confidence the report is flagged for manual review (FR-07)
  confidenceThreshold: num(process.env.CONFIDENCE_THRESHOLD, 0.6),
  // Duplicate detection (FR-08): same category, within radius and time window
  duplicateRadiusM: num(process.env.DUPLICATE_RADIUS_M, 25),
  duplicateWindowHours: num(process.env.DUPLICATE_WINDOW_HOURS, 168),
  // Priority score (Section 3.4.5): weights must add up to 1
  weights: {
    severity: num(process.env.W_SEVERITY, 0.5),
    density: num(process.env.W_DENSITY, 0.3),
    aging: num(process.env.W_AGING, 0.2),
  },
  densityThreshold: num(process.env.DENSITY_THRESHOLD, 10),
  agingMaxHours: num(process.env.AGING_MAX_HOURS, 168),
  // Hotspots (FR-12): DBSCAN settings
  hotspotEpsM: num(process.env.HOTSPOT_EPS_M, 100),
  hotspotMinPoints: num(process.env.HOTSPOT_MIN_POINTS, 3),
  uploadDir: process.env.UPLOAD_DIR || require("path").join(__dirname, "..", "uploads"),
  maxUploadBytes: num(process.env.MAX_UPLOAD_MB, 5) * 1024 * 1024,
  recalcIntervalMinutes: num(process.env.RECALC_INTERVAL_MINUTES, 60),
};
