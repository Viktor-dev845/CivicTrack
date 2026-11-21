// Duplicate detection (FR-08): same category + inside radius + inside time window.
const config = require("../config");

// Finds an existing open cluster for this problem, or creates a new one.
// Runs inside a transaction (client). Returns the cluster row.
async function assignCluster(client, { category, lat, lon, userId }) {
  const found = await client.query(
    `SELECT id FROM clusters
      WHERE primary_category = $1
        AND last_reported_at > now() - ($4 || ' hours')::interval
        AND ST_DWithin(centroid_location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $5)
        AND EXISTS (SELECT 1 FROM reports r WHERE r.duplicate_cluster_id = clusters.id AND r.status <> 'resolved')
      ORDER BY ST_Distance(centroid_location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography)
      LIMIT 1
      FOR UPDATE`,
    [category, lon, lat, String(config.duplicateWindowHours), config.duplicateRadiusM]
  );
  if (found.rows.length) {
    // report_count counts different PEOPLE, so one citizen cannot inflate a problem's priority
    // by sending the same report many times. Their extra reports still join the cluster.
    const again = await client.query(
      "SELECT 1 FROM reports WHERE duplicate_cluster_id = $1 AND user_id = $2 LIMIT 1", [found.rows[0].id, userId]);
    if (again.rows.length) {
      const same = await client.query("SELECT * FROM clusters WHERE id = $1", [found.rows[0].id]);
      return { cluster: same.rows[0], isDuplicate: true, counted: false };
    }
    const upd = await client.query(
      `UPDATE clusters SET report_count = report_count + 1, last_reported_at = now()
        WHERE id = $1 RETURNING *`,
      [found.rows[0].id]
    );
    return { cluster: upd.rows[0], isDuplicate: true, counted: true };
  }
  const created = await client.query(
    `INSERT INTO clusters (centroid_location, primary_category)
     VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3) RETURNING *`,
    [lon, lat, category]
  );
  return { cluster: created.rows[0], isDuplicate: false };
}

module.exports = { assignCluster };
