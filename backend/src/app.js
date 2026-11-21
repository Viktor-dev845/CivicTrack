const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const config = require("./config");

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use("/uploads", express.static(config.uploadDir));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/admin", require("./routes/admin"));

app.use((req, res) => res.status(404).json({ error: "Not found." }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

module.exports = app;
