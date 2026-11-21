// Creates the tables: npm run migrate
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/db");

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "..", "database", "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Database schema is ready.");
  await pool.end();
})().catch((e) => { console.error("Migration failed:", e.message); process.exit(1); });
