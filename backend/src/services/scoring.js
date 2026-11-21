// Recalculates priority scores in the database.
const { pool } = require("../db");
const { priorityScore } = require("./priority");

// Recalculate every open report (called when a duplicate joins a cluster, and on a timer
// so that the aging factor stays up to date). Optional clusterId limits the work.
async function recalculateAll(client = pool, clusterId = null) {
  const params = [];
  let where = "r.status <> 'resolved'";
  if (clusterId) { params.push(clusterId); where += " AND r.duplicate_cluster_id = $1"; }
  const { rows } = await client.query(
    `SELECT r.id, r.created_at, COALESCE(r.reviewed_severity, r.ai_severity) AS severity,
            COALESCE(c.report_count, 1) AS cluster_count
       FROM reports r LEFT JOIN clusters c ON c.id = r.duplicate_cluster_id
      WHERE ${where}`, params);
  for (const r of rows) {
    const score = priorityScore({ severity: r.severity, clusterCount: r.cluster_count, createdAt: r.created_at });
    await client.query("UPDATE reports SET priority_score = $1 WHERE id = $2", [score, r.id]);
  }
  return rows.length;
}

module.exports = { recalculateAll };
