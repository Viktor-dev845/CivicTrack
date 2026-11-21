// Run with:  npm test   (needs a PostgreSQL+PostGIS database, see TEST_DATABASE_URL)
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const bcrypt = require("bcryptjs");

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5432/civictrack_test";
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ct-uploads-"));
process.env.JWT_SECRET = "test-secret";

// A fake AI service we can control from the tests
let aiAnswer = { status: 200, body: { category: "pothole", severity: "high", confidence: 0.92 } };
const aiServer = http.createServer((req, res) => {
  req.resume();
  req.on("end", () => { res.writeHead(aiAnswer.status, { "content-type": "application/json" }); res.end(JSON.stringify(aiAnswer.body)); });
});

let app, server, base, pool, adminToken, citizenToken, citizen2Token;

async function image(withExif = false) {
  let s = sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 120, g: 90, b: 60 } } });
  if (withExif) s = s.withExif({ IFD0: { Copyright: "secret-camera-data" } });
  return s.jpeg().toBuffer();
}
async function api(method, url, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let body;
  if (json) { headers["content-type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(base + url, { method, headers, body });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function submit(token, { lat = 6.5244, lon = 3.3792, photo, description = "test", extra = {} } = {}) {
  const form = new FormData();
  form.append("photo", new Blob([photo || await image()], { type: "image/jpeg" }), "p.jpg");
  form.append("latitude", String(lat)); form.append("longitude", String(lon)); form.append("description", description);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return api("POST", "/api/reports", { token, form });
}

before(async () => {
  await new Promise((r) => aiServer.listen(0, r));
  process.env.AI_SERVICE_URL = `http://127.0.0.1:${aiServer.address().port}`;
  ({ pool } = require("../src/db"));
  await pool.query("DROP TABLE IF EXISTS reports, clusters, maintenance_units, users CASCADE");
  await pool.query("DROP TYPE IF EXISTS user_role, report_status, severity_level, issue_category CASCADE");
  await pool.query(fs.readFileSync(path.join(__dirname, "..", "..", "database", "schema.sql"), "utf8"));
  await pool.query("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Admin', 'admin@test.com', $1, 'admin')", [await bcrypt.hash("adminpass1", 4)]);
  app = require("../src/app");
  server = app.listen(0); await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); aiServer.close(); await pool.end(); });

test("priority formula matches the worked example in Section 3.4.5 (P = 72)", () => {
  const { priorityScore } = require("../src/services/priority");
  const now = new Date();
  const p = priorityScore({ severity: "high", clusterCount: 4, createdAt: new Date(now - 84 * 36e5) }, now);
  assert.equal(p, 72);
});

test("register, login and /me", async () => {
  let r = await api("POST", "/api/auth/register", { json: { full_name: "Ada", email: "Ada@Test.com", password: "password1" } });
  assert.equal(r.status, 201); citizenToken = r.body.token; assert.equal(r.body.user.role, "citizen");
  r = await api("POST", "/api/auth/register", { json: { full_name: "Bola", email: "bola@test.com", password: "password1" } });
  citizen2Token = r.body.token;
  assert.equal((await api("POST", "/api/auth/register", { json: { full_name: "Ada", email: "ada@test.com", password: "password1" } })).status, 409);
  assert.equal((await api("POST", "/api/auth/register", { json: { full_name: "X", email: "x@test.com", password: "short" } })).status, 400);
  assert.equal((await api("POST", "/api/auth/register", { json: { full_name: "X", email: "bad", password: "password1" } })).status, 400);
  assert.equal((await api("POST", "/api/auth/login", { json: { email: "ada@test.com", password: "wrong" } })).status, 401);
  r = await api("POST", "/api/auth/login", { json: { email: "admin@test.com", password: "adminpass1" } });
  assert.equal(r.status, 200); adminToken = r.body.token; assert.equal(r.body.user.role, "admin");
  assert.equal((await api("GET", "/api/auth/me", { token: citizenToken })).body.user.email, "ada@test.com");
});

test("a citizen cannot register themselves as admin", async () => {
  const r = await api("POST", "/api/auth/register", { json: { full_name: "Hack", email: "hack@test.com", password: "password1", role: "admin" } });
  assert.equal(r.body.user.role, "citizen");
});

test("submitting a report: saved, AI result stored, EXIF removed", async () => {
  const r = await submit(citizenToken, { photo: await image(true) });
  assert.equal(r.status, 201);
  const rep = r.body.report;
  assert.equal(rep.ai_category, "pothole"); assert.equal(rep.ai_severity, "high");
  assert.equal(rep.needs_review, false); assert.equal(rep.status, "reported");
  assert.ok(Math.abs(rep.latitude - 6.5244) < 1e-6);
  assert.ok(rep.priority_score > 0);
  const file = path.join(process.env.UPLOAD_DIR, path.basename(rep.image_url));
  const meta = await sharp(file).metadata();
  assert.equal(meta.exif, undefined, "EXIF data must be stripped");
});

test("input checks and access control", async () => {
  assert.equal((await submit(undefined)).status, 401);
  assert.equal((await submit(citizenToken, { lat: 123 })).status, 400);
  const noPhoto = new FormData(); noPhoto.append("latitude", "6.5"); noPhoto.append("longitude", "3.3");
  assert.equal((await api("POST", "/api/reports", { token: citizenToken, form: noPhoto })).status, 400);
  const notImage = new FormData();
  notImage.append("photo", new Blob(["hello"], { type: "image/jpeg" }), "x.jpg"); notImage.append("latitude", "6.5"); notImage.append("longitude", "3.3");
  assert.equal((await api("POST", "/api/reports", { token: citizenToken, form: notImage })).status, 400);
  const pdf = new FormData();
  pdf.append("photo", new Blob(["%PDF"], { type: "application/pdf" }), "x.pdf"); pdf.append("latitude", "6.5"); pdf.append("longitude", "3.3");
  assert.equal((await api("POST", "/api/reports", { token: citizenToken, form: pdf })).status, 400);
  assert.equal((await api("GET", "/api/admin/reports", { token: citizenToken })).status, 403);
  assert.equal((await api("GET", "/api/admin/reports")).status, 401);
});

test("duplicates join one cluster and raise the priority; far or different ones do not", async () => {
  await pool.query("TRUNCATE reports, clusters CASCADE");
  aiAnswer = { status: 200, body: { category: "pothole", severity: "medium", confidence: 0.9 } };
  const a = (await submit(citizenToken, { lat: 6.5000, lon: 3.3000 })).body.report;
  const b = (await submit(citizen2Token, { lat: 6.50005, lon: 3.30005 })).body.report; // about 7 m away
  assert.equal(b.duplicate_cluster_id, a.duplicate_cluster_id);
  assert.equal(b.duplicate_count, 2);
  const queue = (await api("GET", "/api/admin/reports", { token: adminToken })).body.reports;
  assert.ok(queue.every((x) => x.duplicate_count === 2));
  assert.ok(queue[0].priority_score > a.priority_score, "first report's score must rise when a duplicate joins");
  const far = (await submit(citizenToken, { lat: 6.5100, lon: 3.3000 })).body.report;   // about 1 km away
  assert.notEqual(far.duplicate_cluster_id, a.duplicate_cluster_id);
  aiAnswer = { status: 200, body: { category: "drainage", severity: "medium", confidence: 0.9 } };
  const other = (await submit(citizenToken, { lat: 6.5000, lon: 3.3000 })).body.report;  // same spot, other category
  assert.notEqual(other.duplicate_cluster_id, a.duplicate_cluster_id);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM clusters")).rows[0].n, 3);
});

test("the same person reporting again does not inflate the count, a different person does", async () => {
  await pool.query("TRUNCATE reports, clusters CASCADE");
  aiAnswer = { status: 200, body: { category: "pothole", severity: "medium", confidence: 0.9 } };
  const a = (await submit(citizenToken, { lat: 6.2, lon: 3.2 })).body.report;
  const again = (await submit(citizenToken, { lat: 6.2, lon: 3.2 })).body.report;   // same person, same spot
  assert.equal(again.duplicate_cluster_id, a.duplicate_cluster_id);
  assert.equal(again.duplicate_count, 1, "same person must not raise the count");
  const other = (await submit(citizen2Token, { lat: 6.2, lon: 3.2 })).body.report;  // different person
  assert.equal(other.duplicate_count, 2);
});

test("AI service down: report is still saved and flagged; admin review fixes it", async () => {
  aiAnswer = { status: 500, body: { detail: "boom" } };
  const r = await submit(citizenToken, { lat: 6.6, lon: 3.4 });
  assert.equal(r.status, 201); assert.equal(r.body.ai_available, false);
  const rep = r.body.report;
  assert.equal(rep.needs_review, true); assert.equal(rep.category, null); assert.equal(rep.duplicate_cluster_id, null);

  const flagged = (await api("GET", "/api/admin/reports?needs_review=true", { token: adminToken })).body.reports;
  assert.ok(flagged.some((x) => x.id === rep.id));

  const fixed = await api("PATCH", `/api/admin/reports/${rep.id}/review`, { token: adminToken, json: { category: "waste_dump", severity: "high" } });
  assert.equal(fixed.status, 200);
  assert.equal(fixed.body.report.category, "waste_dump"); assert.equal(fixed.body.report.severity, "high");
  assert.equal(fixed.body.report.needs_review, false); assert.ok(fixed.body.report.duplicate_cluster_id);
  assert.equal(fixed.body.report.ai_category, null, "original AI output must stay untouched");
  assert.equal((await api("PATCH", `/api/admin/reports/${rep.id}/review`, { token: adminToken, json: { category: "bridge" } })).status, 400);
});

test("low AI confidence is flagged for review", async () => {
  aiAnswer = { status: 200, body: { category: "pothole", severity: "low", confidence: 0.3 } };
  const r = await submit(citizenToken, { lat: 6.7, lon: 3.5 });
  assert.equal(r.body.report.needs_review, true); assert.equal(r.body.report.ai_category, "pothole");
});

test("an unexpected AI answer is treated as unavailable", async () => {
  aiAnswer = { status: 200, body: { category: "dragon", severity: "high", confidence: 0.99 } };
  const r = await submit(citizenToken, { lat: 6.8, lon: 3.6 });
  assert.equal(r.body.report.needs_review, true); assert.equal(r.body.report.ai_category, null);
});

test("triage queue is sorted by priority, highest first", async () => {
  const queue = (await api("GET", "/api/admin/reports", { token: adminToken })).body.reports;
  const scores = queue.map((x) => x.priority_score);
  assert.deepEqual(scores, [...scores].sort((x, y) => y - x));
});

test("aging raises the score after recalculation", async () => {
  aiAnswer = { status: 200, body: { category: "pothole", severity: "high", confidence: 0.9 } };
  const rep = (await submit(citizenToken, { lat: 7.0, lon: 4.0 })).body.report;
  await pool.query("UPDATE reports SET created_at = now() - interval '84 hours' WHERE id = $1", [rep.id]);
  await api("POST", "/api/admin/recalculate", { token: adminToken, json: {} });
  const after = (await api("GET", `/api/reports/${rep.id}`, { token: adminToken })).body.report;
  assert.equal(after.priority_score, 63); // (0.5*1.0 + 0.3*0.1 + 0.2*0.5) * 100
});

test("status updates and assignment to a maintenance unit", async () => {
  const rep = (await submit(citizenToken, { lat: 7.2, lon: 4.2 })).body.report;
  const unit = (await api("POST", "/api/admin/units", { token: adminToken, json: { name: "Roads Unit", focus_area: "Roads" } })).body.unit;
  assert.equal((await api("POST", "/api/admin/units", { token: adminToken, json: { name: "Roads Unit" } })).status, 409);
  const assigned = await api("PATCH", `/api/admin/reports/${rep.id}/assign`, { token: adminToken, json: { unit_id: unit.id } });
  assert.equal(assigned.body.report.assigned_unit_id, unit.id); assert.equal(assigned.body.report.status, "in_progress");
  assert.equal((await api("PATCH", `/api/admin/reports/${rep.id}/assign`, { token: adminToken, json: { unit_id: "00000000-0000-0000-0000-000000000000" } })).status, 404);
  const done = await api("PATCH", `/api/admin/reports/${rep.id}/status`, { token: adminToken, json: { status: "resolved" } });
  assert.equal(done.body.report.status, "resolved");
  assert.equal((await api("PATCH", `/api/admin/reports/${rep.id}/status`, { token: adminToken, json: { status: "done" } })).status, 400);
  const queue = (await api("GET", "/api/admin/reports", { token: adminToken })).body.reports;
  assert.ok(!queue.some((x) => x.id === rep.id), "resolved reports leave the triage queue");
  const mine = (await api("GET", "/api/reports/mine", { token: citizenToken })).body.reports;
  assert.equal(mine.find((x) => x.id === rep.id).status, "resolved");
});

test("citizens only see their own reports; public map hides personal data", async () => {
  const mine = (await submit(citizen2Token, { lat: 8.0, lon: 5.0 })).body.report;
  assert.equal((await api("GET", `/api/reports/${mine.id}`, { token: citizenToken })).status, 404);
  assert.equal((await api("GET", `/api/reports/${mine.id}`, { token: citizen2Token })).status, 200);
  assert.equal((await api("GET", `/api/reports/${mine.id}`, { token: adminToken })).status, 200);
  const pub = await api("GET", "/api/reports/public");
  assert.equal(pub.status, 200); assert.ok(pub.body.reports.length > 0);
  for (const r of pub.body.reports) { assert.equal(r.user_id, undefined); assert.equal(r.user_description, undefined); }
});

test("public map shows only verified reports: confident AI or admin-checked", async () => {
  await pool.query("TRUNCATE reports, clusters CASCADE");
  aiAnswer = { status: 200, body: { category: "pothole", severity: "low", confidence: 0.3 } };   // below the 0.6 threshold
  const unsure = (await submit(citizenToken, { lat: 10.0, lon: 6.0 })).body.report;
  assert.equal(unsure.needs_review, true);
  let pub = (await api("GET", "/api/reports/public")).body.reports;
  assert.ok(!pub.find((x) => x.id === unsure.id), "unverified report must not be public");
  const fix = await api("PATCH", `/api/admin/reports/${unsure.id}/review`, { token: adminToken, json: { category: "pothole", severity: "high" } });
  assert.equal(fix.status, 200);
  pub = (await api("GET", "/api/reports/public")).body.reports;
  assert.ok(pub.find((x) => x.id === unsure.id), "after admin review it becomes public");
});

test("hotspots (DBSCAN) group nearby open reports", async () => {
  await pool.query("TRUNCATE reports, clusters CASCADE");
  aiAnswer = { status: 200, body: { category: "pothole", severity: "medium", confidence: 0.9 } };
  for (const [la, lo] of [[9.0, 7.0], [9.0004, 7.0004], [9.0008, 7.0], [9.5, 8.0]]) await submit(citizenToken, { lat: la, lon: lo });
  const r = await api("GET", "/api/admin/hotspots", { token: adminToken });
  assert.equal(r.body.hotspots.length, 1);
  assert.equal(r.body.hotspots[0].report_count, 3);
  assert.ok(Math.abs(r.body.hotspots[0].latitude - 9.0004) < 0.001);
});
