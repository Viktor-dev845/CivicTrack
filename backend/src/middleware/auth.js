const jwt = require("jsonwebtoken");
const config = require("../config");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please log in first." });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: "Your session is invalid or has expired." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Administrators only." });
  next();
}

module.exports = { requireAuth, requireAdmin };
