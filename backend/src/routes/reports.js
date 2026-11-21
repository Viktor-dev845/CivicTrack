const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");
const { pool, query } = require("../db");
const { requireAuth } = require("../middleware/auth");
const { classify } = require("../services/aiClient");
const { assignCluster } = require("../services/duplicates");
const { priorityScore } = require("../services/priority");
const { recalculateAll } = require("../services/scoring");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (req, file, cb) =>
    ["image/jpeg", "image/png"].includes(file.mimetype) ? cb(null, true) : cb(new Error("ONLY_JPEG_PNG")),
});

// Columns returned to clients. The user's id and email are never shown on public views.
const REPORT_COLUMNS = `
  r.id, r.image_url, r.user_description, r.address_text,
  ST_Y(r.location::geometry) AS latitude, ST_X(r.location::geometry) AS longitude,
  r.ai_category, r.ai_confidence, r.ai_severity, r.reviewed_category, r.reviewed_severity,
  COALESCE(r.reviewed_category, r.ai_category) AS category,
  COALESCE(r.reviewed_severity, r.ai_severity) AS severity,
  r.needs_review, r.priority_score, r.status, r.duplicate_cluster_id,
  COALESCE(c.report_count, 1) AS duplicate_count,
  r.assigned_unit_id, r.created_at, r.updated_at`;
const FROM = "FROM reports r LEFT JOIN clusters c ON c.id = r.duplicate_cluster_id";

// ---- Citizen: submit a report (FR-02, FR-03, FR-07, FR-08, FR-09) ----
router.post("/", requireAuth, (req, res, next) => {
  upload.single("photo")(req, res, (err) => {
    if (err?.message === "ONLY_JPEG_PNG") return res.status(400).json({ error: "Photo must be a JPEG or PNG image." });
    if (err?.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: `Photo must be smaller than ${config.maxUploadBytes / 1048576} MB.` });
    if (err) return next(err);
    handleCreate(req, res, next);
  });
});

async function handleCreate(req, res, next) {
  const client = await pool.connect();
  try {
    const lat = Number(req.body.latitude), lon = Number(req.body.longitude);
    if (!req.file) return res.status(400).json({ error: "A photo is required." });
    if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180) || req.body.latitude === "" || req.body.longitude === "") {
      return res.status(400).json({ error: "A valid map location (latitude and longitude) is required." });
    }
    const description = (req.body.description || "").toString().slice(0, 2000);
    const address = (req.body.address_text || "").toString().slice(0, 255);

    // Re-encode the photo: removes EXIF data (such as the phone's GPS tags) and shrinks it
    let clean;
    try {
      clean = await sharp(req.file.buffer).rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    } catch {
      return res.status(400).json({ error: "That file is not a valid image." });
    }

    const ai = await classify(clean);

    fs.mkdirSync(config.uploadDir, { recursive: true });
    const fileName = `${crypto.randomUUID()}.jpg`;
    await fs.promises.writeFile(path.join(config.uploadDir, fileName), clean);

    await client.query("BEGIN");
    let clusterId = null, clusterCount = 1;
    if (ai.category) {
      const { cluster } = await assignCluster(client, { category: ai.category, lat, lon, userId: req.user.id });
      clusterId = cluster.id; clusterCount = cluster.report_count;
    }
    const score = priorityScore({ severity: ai.severity, clusterCount, createdAt: new Date() });
    const ins = await client.query(
      `INSERT INTO reports (user_id, image_url, user_description, location, address_text,
                            ai_category, ai_confidence, ai_severity, needs_review, duplicate_cluster_id, priority_score)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [req.user.id, `/uploads/${fileName}`, description, lon, lat, address,
       ai.category, ai.confidence, ai.severity, ai.needsReview, clusterId, score]
    );
    if (clusterId && clusterCount > 1) await recalculateAll(client, clusterId); // a duplicate raises the whole cluster
    await client.query("COMMIT");

    const { rows } = await query(`SELECT ${REPORT_COLUMNS} ${FROM} WHERE r.id = $1`, [ins.rows[0].id]);
    res.status(201).json({ report: rows[0], ai_available: ai.available });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally { client.release(); }
}

// ---- Public map view (FR-04): no personal data ----
router.get("/public", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.id, r.image_url, ST_Y(r.location::geometry) AS latitude, ST_X(r.location::geometry) AS longitude,
              COALESCE(r.reviewed_category, r.ai_category) AS category,
              COALESCE(r.reviewed_severity, r.ai_severity) AS severity,
              r.status, r.created_at
         FROM reports r
        WHERE r.needs_review = false   -- only reports the AI was confident about, or an admin has checked
         ORDER BY r.created_at DESC LIMIT 1000`);
    res.json({ reports: rows });
  } catch (err) { next(err); }
});

// ---- Citizen: my own reports (FR-05) ----
router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${REPORT_COLUMNS} ${FROM} WHERE r.user_id = $1 ORDER BY r.created_at DESC`, [req.user.id]);
    res.json({ reports: rows });
  } catch (err) { next(err); }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: "Report not found." });
    const { rows } = await query(
      `SELECT ${REPORT_COLUMNS}, r.user_id ${FROM} WHERE r.id = $1`, [req.params.id]);
    const report = rows[0];
    if (!report || (req.user.role !== "admin" && report.user_id !== req.user.id)) {
      return res.status(404).json({ error: "Report not found." });
    }
    res.json({ report });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.REPORT_COLUMNS = REPORT_COLUMNS;
module.exports.FROM = FROM;
