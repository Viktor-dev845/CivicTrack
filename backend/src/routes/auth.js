const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config");
const { query } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tokenFor(user) {
  return jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}
const publicUser = (u) => ({ id: u.id, full_name: u.full_name, email: u.email, role: u.role });

router.post("/register", async (req, res, next) => {
  try {
    const { full_name, email, password } = req.body || {};
    if (!full_name?.trim()) return res.status(400).json({ error: "Full name is required." });
    if (!EMAIL.test(email || "")) return res.status(400).json({ error: "A valid email is required." });
    if (!password || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
    const hash = await bcrypt.hash(password, 10);
    // New accounts are always citizens. Admins are created by the seed script only.
    const { rows } = await query(
      `INSERT INTO users (full_name, email, password_hash) VALUES ($1, lower($2), $3) RETURNING *`,
      [full_name.trim(), email, hash]
    );
    res.status(201).json({ token: tokenFor(rows[0]), user: publicUser(rows[0]) });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "That email is already registered." });
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const { rows } = await query("SELECT * FROM users WHERE email = lower($1)", [email || ""]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password || "", user.password_hash))) {
      return res.status(401).json({ error: "Wrong email or password." });
    }
    res.json({ token: tokenFor(user), user: publicUser(user) });
  } catch (err) { next(err); }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: "User not found." });
    res.json({ user: publicUser(rows[0]) });
  } catch (err) { next(err); }
});

module.exports = router;
