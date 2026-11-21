// Creates the first administrator and sample maintenance units: npm run seed
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("../src/db");

(async () => {
  const email = (process.env.ADMIN_EMAIL || "admin@civictrack.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role) VALUES ('System Administrator', $1, $2, 'admin')
     ON CONFLICT (email) DO NOTHING`, [email, await bcrypt.hash(password, 10)]);
  for (const [name, focus] of [["Roads Maintenance Unit", "Potholes and road damage"],
                               ["Street Lighting Unit", "Streetlights"],
                               ["Waste Management Unit", "Waste dumps"],
                               ["Drainage Unit", "Drains and flooding"]]) {
    await pool.query("INSERT INTO maintenance_units (name, focus_area) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING", [name, focus]);
  }
  console.log(`Admin ready: ${email} (password from ADMIN_PASSWORD, default "ChangeMe123!"). Change it after first login.`);
  await pool.end();
})().catch((e) => { console.error("Seed failed:", e.message); process.exit(1); });
