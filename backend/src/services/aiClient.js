// Talks to the separate AI Inference microservice (Python/FastAPI).
// If it is slow, down, or unsure, the report is still saved and flagged for manual review.
const config = require("../config");

const CATEGORIES = ["pothole", "damaged_streetlight", "waste_dump", "drainage"];
const SEVERITIES = ["low", "medium", "high"];

async function classify(imageBuffer, mimeType = "image/jpeg") {
  try {
    const form = new FormData();
    form.append("file", new Blob([imageBuffer], { type: mimeType }), "report.jpg");
    const res = await fetch(`${config.aiServiceUrl}/predict`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(config.aiTimeoutMs),
    });
    if (!res.ok) throw new Error(`AI service returned ${res.status}`);
    const data = await res.json();
    if (!CATEGORIES.includes(data.category) || !SEVERITIES.includes(data.severity)) {
      throw new Error("AI service returned an unexpected answer");
    }
    const confidence = Number(data.confidence);
    return {
      available: true,
      category: data.category,
      severity: data.severity,
      confidence,
      needsReview: !(confidence >= config.confidenceThreshold),
    };
  } catch (err) {
    console.warn("[ai] classification unavailable:", err.message);
    return { available: false, category: null, severity: null, confidence: null, needsReview: true };
  }
}

module.exports = { classify, CATEGORIES, SEVERITIES };
