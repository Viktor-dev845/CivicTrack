const express = require("express");
const config = require("../config");
const { pool, query } = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { assignCluster } = require("../services/duplicates");
const { priorityScore } = require("../services/priority");
const { recalculateAll } = require("../services/scoring");
const { CATEGORIES, SEVERITIES } = require("../services/aiClient");
const { REPORT_COLUMNS, FROM } = require("./reports");

const router = express.Router();
router.use(requireAuth, requireAdmin);
const STATUSES = ["reported", "in_progress", "resolved"];
const isId = (s) => /^[0-9a-f-]{36}$/i.test(s || "");

// ---- Prioritised triage queue (FR-06, FR-09) ----
router.get("/reports", async (req, res, next) => {
  try {
    const { status, needs_review, category } = req.query;
    const where = [], params = [];
    if (status) {
      if (!STATUSES.includes(status)) return res.status(400).json({ error: "Unknown status." });
      params.push(status); where.push(`r.status = $${params.length}`);
    } else where.push("r.status <> 'resolved'");
    if (needs_review === "true") where.push("r.needs_review = true");
    if (category) { params.push(category); where.push(`COALESCE(r.reviewed_category, r.ai_category) = $${params.length}`); }
    const { rows } = await query(
      `SELECT ${REPORT_COLUMNS}, u.full_name AS reporter_name ${FROM} JOIN users u ON u.id = r.user_id
        WHERE ${where.join(" AND ")} ORDER BY r.priority_score DESC, r.created_at ASC LIMIT 500`, params);
    res.json({ reports: rows });
  } catch (err) { next(err); }
});

// ---- Review / override the AI result (FR-06) ----
router.patch("/reports/:id/review", async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!isId(req.params.id)) return res.status(404).json({ error: "Report not found." });
    const { category, severity } = req.body || {};
    if (category !== undefined && !CATEGORIES.includes(category)) return res.status(400).json({ error: "Unknown category." });
    if (severity !== undefined && !SEVERITIES.includes(severity)) return res.status(400).json({ error: "Unknown severity." });
    if (category === undefined && severity === undefined) return res.status(400).json({ error: "Send a category and/or severity." });

    await client.query("BEGIN");
    const cur = (await client.query(
      `SELECT r.*, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lon FROM reports r WHERE id = $1 FOR UPDATE`,
      [req.params.id])).rows[0];
    if (!cur) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Report not found." }); }

    const oldCategory = cur.reviewed_category || cur.ai_category;
    const newCategory = category ?? oldCategory;
    const newSeverity = severity ?? cur.reviewed_severity ?? cur.ai_severity;

    let clusterId = cur.duplicate_cluster_id;
    if (newCategory !== oldCategory || !clusterId) {
      const oldCluster = clusterId;
      if (oldCluster) {
        await client.query("UPDATE reports SET duplicate_cluster_id = NULL WHERE id = $1", [cur.id]);
        // the count is of different people: only drop it if this person has no other report left in the cluster
        const stillThere = (await client.query(
          "SELECT 1 FROM reports WHERE duplicate_cluster_id = $1 AND user_id = $2 LIMIT 1", [oldCluster, cur.user_id])).rows.length > 0;
        const left = (await client.query(
          "UPDATE clusters SET report_count = report_count - $2 WHERE id = $1 RETURNING report_count",
          [oldCluster, stillThere ? 0 : 1])).rows[0];
        const remaining = (await client.query("SELECT count(*)::int AS n FROM reports WHERE duplicate_cluster_id = $1", [oldCluster])).rows[0].n;
        if (remaining === 0 || left.report_count <= 0) {
          await client.query("UPDATE reports SET duplicate_cluster_id = NULL WHERE duplicate_cluster_id = $1", [oldCluster]);
          await client.query("DELETE FROM clusters WHERE id = $1", [oldCluster]);
        } else await recalculateAll(client, oldCluster);
      }
      clusterId = null;
      if (newCategory) clusterId = (await assignCluster(client, { category: newCategory, lat: cur.lat, lon: cur.lon, userId: cur.user_id })).cluster.id;
    }
    await client.query(
      `UPDATE reports SET reviewed_category = COALESCE($2, reviewed_category), reviewed_severity = COALESCE($3, reviewed_severity),
              needs_review = false, duplicate_cluster_id = $4, updated_at = now() WHERE id = $1`,
      [cur.id, category ?? null, severity ?? null, clusterId]);
    if (clusterId) await recalculateAll(client, clusterId);
    else await client.query("UPDATE reports SET priority_score = $2 WHERE id = $1",
      [cur.id, priorityScore({ severity: newSeverity, clusterCount: 1, createdAt: cur.created_at })]);
    await client.query("COMMIT");
    const { rows } = await query(`SELECT ${REPORT_COLUMNS} ${FROM} WHERE r.id = $1`, [cur.id]);
    res.json({ report: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    next(err);
  } finally { client.release(); }
});

// ---- Update status (FR-10) ----
router.patch("/reports/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(", ")}.` });
    if (!isId(req.params.id)) return res.status(404).json({ error: "Report not found." });
    const upd = await query("UPDATE reports SET status = $2, updated_at = now() WHERE id = $1 RETURNING id", [req.params.id, status]);
    if (!upd.rows[0]) return res.status(404).json({ error: "Report not found." });
    const { rows } = await query(`SELECT ${REPORT_COLUMNS} ${FROM} WHERE r.id = $1`, [req.params.id]);
    res.json({ report: rows[0] });
  } catch (err) { next(err); }
});

// ---- Assign to a field maintenance unit (FR-10). Assigning moves a new report to "in_progress". ----
router.patch("/reports/:id/assign", async (req, res, next) => {
  try {
    const { unit_id } = req.body || {};
    if (!isId(req.params.id)) return res.status(404).json({ error: "Report not found." });
    if (unit_id !== null && !isId(unit_id)) return res.status(400).json({ error: "A valid unit_id (or null to unassign) is required." });
    if (unit_id) {
      const unit = await query("SELECT 1 FROM maintenance_units WHERE id = $1", [unit_id]);
      if (!unit.rows[0]) return res.status(404).json({ error: "Maintenance unit not found." });
    }
    const upd = await query(
      `UPDATE reports SET assigned_unit_id = $2,
              status = CASE WHEN $2::uuid IS NOT NULL AND status = 'reported' THEN 'in_progress'::report_status ELSE status END,
              updated_at = now() WHERE id = $1 RETURNING id`, [req.params.id, unit_id]);
    if (!upd.rows[0]) return res.status(404).json({ error: "Report not found." });
    const { rows } = await query(`SELECT ${REPORT_COLUMNS} ${FROM} WHERE r.id = $1`, [req.params.id]);
    res.json({ report: rows[0] });
  } catch (err) { next(err); }
});

// ---- Hotspots (FR-12): DBSCAN over open reports ----
router.get("/hotspots", async (req, res, next) => {
  try {
    const eps = Number(req.query.eps) || config.hotspotEpsM;
    const minPoints = Number(req.query.min_points) || config.hotspotMinPoints;
    // Points are projected to Web Mercator so eps is in (approximate) metres.
    const { rows } = await query(
      `WITH pts AS (
         SELECT location::geometry AS g, ST_Transform(location::geometry, 3857) AS gm,
                COALESCE(reviewed_category, ai_category) AS cat
           FROM reports WHERE status <> 'resolved'),
       clustered AS (SELECT g, cat, ST_ClusterDBSCAN(gm, eps := $1, minpoints := $2) OVER () AS cid FROM pts)
       SELECT cid AS hotspot_id, count(*)::int AS report_count,
              ST_Y(ST_Centroid(ST_Collect(g))) AS latitude, ST_X(ST_Centroid(ST_Collect(g))) AS longitude,
              array_remove(array_agg(DISTINCT cat), NULL) AS categories
         FROM clustered WHERE cid IS NOT NULL GROUP BY cid ORDER BY count(*) DESC`, [eps, minPoints]);
    res.json({ eps_m: eps, min_points: minPoints, hotspots: rows });
  } catch (err) { next(err); }
});

// ---- Maintenance units ----
router.get("/units", async (req, res, next) => {
  try { res.json({ units: (await query("SELECT * FROM maintenance_units ORDER BY name")).rows }); }
  catch (err) { next(err); }
});
router.post("/units", async (req, res, next) => {
  try {
    const { name, focus_area, contact } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: "Unit name is required." });
    const { rows } = await query(
      "INSERT INTO maintenance_units (name, focus_area, contact) VALUES ($1, $2, $3) RETURNING *",
      [name.trim(), focus_area || null, contact || null]);
    res.status(201).json({ unit: rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "A unit with that name already exists." });
    next(err);
  }
});

// ---- Refresh all priority scores now (the server also does this on a timer) ----
router.post("/recalculate", async (req, res, next) => {
  try { res.json({ recalculated: await recalculateAll() }); } catch (err) { next(err); }
});

module.exports = router;
