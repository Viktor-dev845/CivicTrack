const app = require("./app");
const config = require("./config");
const { recalculateAll } = require("./services/scoring");

app.listen(config.port, () => console.log(`CivicTrack Core API running on http://localhost:${config.port}`));

// Keep the aging factor of open reports up to date
setInterval(() => recalculateAll().catch((e) => console.error("recalc failed:", e.message)),
  config.recalcIntervalMinutes * 60 * 1000);
