// Priority score, Section 3.4.5:  P = (w1*S + w2*D + w3*T) * 100
const config = require("../config");

const SEVERITY_VALUE = { low: 0.33, medium: 0.67, high: 1.0 };

function severityFactor(severity) {
  // Unknown severity (AI unavailable and not yet reviewed) is treated as medium
  return SEVERITY_VALUE[severity] ?? SEVERITY_VALUE.medium;
}

function densityFactor(clusterCount) {
  return Math.min(1, (clusterCount || 1) / config.densityThreshold);
}

function agingFactor(createdAt, now = new Date()) {
  const hours = (now - new Date(createdAt)) / 36e5;
  return Math.min(1, Math.max(0, hours) / config.agingMaxHours);
}

function priorityScore({ severity, clusterCount, createdAt }, now = new Date()) {
  const { severity: w1, density: w2, aging: w3 } = config.weights;
  const p = w1 * severityFactor(severity) + w2 * densityFactor(clusterCount) + w3 * agingFactor(createdAt, now);
  return Math.round(p * 1000) / 10; // 0 to 100, one decimal
}

module.exports = { priorityScore, severityFactor, densityFactor, agingFactor };
