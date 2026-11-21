"""
CivicTrack Manual Image Labelling Tool (follows LABELLING.md)

Run from civictrack-ai-service-v1/ai-service/:
    python scripts/label_tool.py

Opens a fast, keyboard-driven browser tool at http://localhost:8765.
Keyboard shortcuts:
    1 = low severity
    2 = medium severity
    3 = high severity
    X = reject / exclude non-street or unreadable image
    Left / Right arrows = previous / next image

Every click/keystroke auto-saves progress to:
    data/real/manual_review.json  (tracks reviewed/rejected state so you can pause & resume)
    data/real/labels.csv          (clean CSV of approved, manually labelled images for train.py)
"""

import argparse
import csv
import json
import os
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

CATEGORIES = ["pothole", "damaged_streetlight", "waste_dump", "drainage"]
SEVERITIES = ["low", "medium", "high"]

HTML_PAGE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>CivicTrack Manual Labelling Tool</title>
<style>
  :root {
    --asphalt: #181b20; --line: #f2c230; --road: #f5f5f4; --paper: #ffffff;
    --edge: #e2e0dc; --kerb: #6b6760; --low: #2a8a68; --medium: #e07b1a; --high: #c7372f;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: var(--road); color: var(--asphalt); min-height: 100vh; display: flex; flex-direction: column; }
  header { background: var(--asphalt); color: #fff; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 4px solid var(--line); }
  header h1 { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }
  header .sub { font-size: 12px; color: rgba(255,255,255,0.65); }
  .progress-wrap { background: #fff; border-bottom: 1px solid var(--edge); padding: 10px 24px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; font-size: 13px; }
  .bar { flex: 1; min-width: 180px; height: 10px; background: #e8e6e1; border-radius: 999px; overflow: hidden; }
  .bar > div { height: 100%; background: var(--low); transition: width 0.2s; }
  main { flex: 1; max-width: 1280px; width: 100%; margin: 20px auto; padding: 0 20px; display: grid; grid-template-columns: 1.35fr 1fr; gap: 20px; align-items: start; }
  @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
  .card { background: var(--paper); border: 1px solid var(--edge); border-radius: 16px; padding: 18px; }
  .photo-box { background: #111; border-radius: 12px; overflow: hidden; display: flex; align-items: center; justify-content: center; height: 520px; position: relative; }
  .photo-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .photo-meta { margin-top: 12px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--kerb); }
  .pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; background: #f0efed; color: var(--asphalt); }
  .pill.low { background: #2a8a6822; color: var(--low); }
  .pill.medium { background: #e07b1a22; color: var(--medium); }
  .pill.high { background: #c7372f22; color: var(--high); }
  .pill.rejected { background: #181b2022; color: #555; text-decoration: line-through; }
  .rubric { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
  .r-row { border: 1.5px solid var(--edge); border-radius: 12px; padding: 12px 14px; cursor: pointer; transition: all 0.12s; background: #fff; text-align: left; width: 100%; }
  .r-row:hover { border-color: var(--asphalt); transform: translateY(-1px); }
  .r-row.active-low { border-color: var(--low); background: #2a8a6814; }
  .r-row.active-medium { border-color: var(--medium); background: #e07b1a14; }
  .r-row.active-high { border-color: var(--high); background: #c7372f14; }
  .r-row.active-reject { border-color: #444; background: #00000010; }
  .r-head { display: flex; align-items: center; justify-content: space-between; font-weight: 800; font-size: 15px; margin-bottom: 4px; }
  .kbd { background: var(--asphalt); color: var(--line); font-family: monospace; font-size: 12px; padding: 2px 7px; border-radius: 6px; font-weight: 700; }
  .r-desc { font-size: 12.5px; color: var(--kerb); line-height: 1.45; }
  .controls { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .btn { border: 1.5px solid var(--edge); background: #fff; padding: 8px 14px; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer; }
  .btn:hover { border-color: var(--asphalt); }
  .btn.primary { background: var(--line); border-color: var(--line); color: var(--asphalt); }
  select { border: 1.5px solid var(--edge); border-radius: 10px; padding: 7px 10px; font-size: 13px; font-weight: 600; background: #fff; }
  .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 14px; font-size: 12px; }
  .stat-cell { background: var(--road); border-radius: 10px; padding: 8px 10px; }
  .stat-cell b { display: block; font-size: 12.5px; margin-bottom: 2px; }
  .saved-toast { font-size: 12px; color: #4ade80; font-weight: 600; }
</style>
</head>
<body>
<header>
  <div>
    <h1>CivicTrack Manual Labelling Tool</h1>
    <div class="sub">Follows LABELLING.md · Auto-saves directly to data/real/labels.csv</div>
  </div>
  <div class="saved-toast" id="toast">Ready</div>
</header>

<div class="progress-wrap">
  <strong id="counter">Loading...</strong>
  <div class="bar"><div id="barFill" style="width:0%"></div></div>
  <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
    <input type="checkbox" id="onlyUnreviewed" /> Unreviewed only
  </label>
  <select id="catFilter">
    <option value="all">All categories</option>
    <option value="pothole">pothole</option>
    <option value="damaged_streetlight">damaged_streetlight</option>
    <option value="waste_dump">waste_dump</option>
    <option value="drainage">drainage</option>
  </select>
  <button class="btn primary" id="exportBtn">Save & Verify CSV</button>
</div>

<main>
  <div class="card">
    <div class="photo-box"><img id="photo" alt="Dataset image" /></div>
    <div class="photo-meta">
      <div><b id="fname">-</b> · <span id="statusPill" class="pill">-</span></div>
      <div id="sourceTitle" style="max-width:460px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>
    </div>
    <div class="controls">
      <button class="btn" id="prevBtn">← Previous</button>
      <button class="btn" id="nextBtn">Next →</button>
      <label style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600">
        Category:
        <select id="catSelect">
          <option value="pothole">pothole</option>
          <option value="damaged_streetlight">damaged_streetlight</option>
          <option value="waste_dump">waste_dump</option>
          <option value="drainage">drainage</option>
        </select>
      </label>
    </div>
  </div>

  <div class="card">
    <h2 style="font-size:16px;font-weight:800;margin-bottom:10px">Assign Severity (LABELLING.md Rubric)</h2>
    <div class="rubric">
      <button class="r-row" id="btn-low" onclick="setLabel('low')">
        <div class="r-head"><span style="color:var(--low)">● LOW severity</span><span class="kbd">1</span></div>
        <div class="r-desc">Small or cosmetic, no immediate risk, can wait for routine repair. E.g. hairline cracks, a few pieces of litter, a flickering light.</div>
      </button>
      <button class="r-row" id="btn-medium" onclick="setLabel('medium')">
        <div class="r-head"><span style="color:var(--medium)">● MEDIUM severity</span><span class="kbd">2</span></div>
        <div class="r-desc">Affects normal use, needs scheduled repair. E.g. pothole a wheel drops into, streetlight out, drain partly blocked.</div>
      </button>
      <button class="r-row" id="btn-high" onclick="setLabel('high')">
        <div class="r-head"><span style="color:var(--high)">● HIGH severity</span><span class="kbd">3</span></div>
        <div class="r-desc">Immediate danger to people or blocks the way, handle first. E.g. deep pothole in traffic lane, fallen/leaning pole, overflowing drain, large dump blocking road.</div>
      </button>
      <button class="r-row" id="btn-reject" onclick="setLabel('rejected')">
        <div class="r-head"><span>✕ REJECT / EXCLUDE</span><span class="kbd">X</span></div>
        <div class="r-desc">Not a valid street problem photo (PDF page, diagram, unrelated scene, or impossible to judge severity). Excluded from training CSV.</div>
      </button>
    </div>

    <h3 style="font-size:13px;font-weight:800;color:var(--kerb);text-transform:uppercase;letter-spacing:.04em">Live Kept Distribution</h3>
    <div class="stats-grid" id="statsGrid"></div>
  </div>
</main>

<script>
let items = [];
let filtered = [];
let idx = 0;

async function loadAll() {
  const res = await fetch('/api/items');
  const data = await res.json();
  items = data.items;
  applyFilter(false);
}

function applyFilter(resetIdx = true) {
  const onlyUn = document.getElementById('onlyUnreviewed').checked;
  const catF = document.getElementById('catFilter').value;
  filtered = items.filter(it => {
    if (catF !== 'all' && it.category !== catF) return false;
    if (onlyUn && it.reviewed) return false;
    return true;
  });
  if (resetIdx) idx = 0;
  if (idx >= filtered.length) idx = Math.max(0, filtered.length - 1);
  render();
}

function render() {
  const reviewedCount = items.filter(i => i.reviewed).length;
  const keptCount = items.filter(i => i.reviewed && !i.rejected).length;
  const rejCount = items.filter(i => i.rejected).length;
  document.getElementById('counter').textContent =
    `Reviewed ${reviewedCount} / ${items.length} (Kept: ${keptCount} · Rejected: ${rejCount})`;
  document.getElementById('barFill').style.width = `${items.length ? (reviewedCount / items.length * 100) : 0}%`;

  // Stats per category
  const cats = ['pothole', 'damaged_streetlight', 'waste_dump', 'drainage'];
  const grid = document.getElementById('statsGrid');
  grid.innerHTML = cats.map(c => {
    const sub = items.filter(i => i.reviewed && !i.rejected && i.category === c);
    const lo = sub.filter(i => i.severity === 'low').length;
    const me = sub.filter(i => i.severity === 'medium').length;
    const hi = sub.filter(i => i.severity === 'high').length;
    return `<div class="stat-cell"><b>${c} (${sub.length})</b>L: ${lo} · M: ${me} · H: ${hi}</div>`;
  }).join('');

  if (filtered.length === 0) {
    document.getElementById('photo').src = '';
    document.getElementById('fname').textContent = 'All filtered items reviewed!';
    document.getElementById('statusPill').textContent = 'Done';
    document.getElementById('statusPill').className = 'pill low';
    document.getElementById('sourceTitle').textContent = '';
    return;
  }

  const it = filtered[idx];
  document.getElementById('photo').src = `/images/${encodeURIComponent(it.filename)}`;
  document.getElementById('fname').textContent = `[${idx + 1}/${filtered.length}] ${it.filename}`;
  document.getElementById('catSelect').value = it.category;
  document.getElementById('sourceTitle').textContent = it.source_title || '';

  const pill = document.getElementById('statusPill');
  if (!it.reviewed) { pill.textContent = 'Not yet reviewed'; pill.className = 'pill'; }
  else if (it.rejected) { pill.textContent = 'Rejected'; pill.className = 'pill rejected'; }
  else { pill.textContent = `Reviewed: ${it.severity}`; pill.className = `pill ${it.severity}`; }

  ['low','medium','high'].forEach(s => {
    document.getElementById('btn-' + s).className = 'r-row' + (it.reviewed && !it.rejected && it.severity === s ? ` active-${s}` : '');
  });
  document.getElementById('btn-reject').className = 'r-row' + (it.rejected ? ' active-reject' : '');
}

async function setLabel(choice) {
  if (!filtered.length) return;
  const it = filtered[idx];
  const category = document.getElementById('catSelect').value;
  const payload = {
    filename: it.filename,
    category,
    rejected: choice === 'rejected',
    severity: choice === 'rejected' ? it.severity : choice,
  };
  const res = await fetch('/api/label', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await res.json();
  Object.assign(it, data.item);
  document.getElementById('toast').textContent = `Saved ${it.filename} (${choice})`;

  const onlyUn = document.getElementById('onlyUnreviewed').checked;
  if (onlyUn) {
    applyFilter(false);
  } else {
    if (idx < filtered.length - 1) idx++;
    render();
  }
}

document.getElementById('prevBtn').onclick = () => { if (idx > 0) { idx--; render(); } };
document.getElementById('nextBtn').onclick = () => { if (idx < filtered.length - 1) { idx++; render(); } };
document.getElementById('onlyUnreviewed').onchange = () => applyFilter(true);
document.getElementById('catFilter').onchange = () => applyFilter(true);
document.getElementById('exportBtn').onclick = async () => {
  const res = await fetch('/api/export', { method: 'POST' });
  const d = await res.json();
  document.getElementById('toast').textContent = `Exported ${d.kept} kept rows to labels.csv`;
  alert(`Saved ${d.kept} manually verified images to data/real/labels.csv (${d.rejected} rejected, ${d.unreviewed} still unreviewed).`);
};

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  if (e.key === '1') setLabel('low');
  else if (e.key === '2') setLabel('medium');
  else if (e.key === '3') setLabel('high');
  else if (e.key.toLowerCase() === 'x') setLabel('rejected');
  else if (e.key === 'ArrowLeft') { if (idx > 0) { idx--; render(); } }
  else if (e.key === 'ArrowRight') { if (idx < filtered.length - 1) { idx++; render(); } }
});

loadAll();
</script>
</body>
</html>
"""


class LabelStore:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.images_dir = data_dir / "images"
        self.csv_path = data_dir / "labels.csv"
        self.prov_path = data_dir / "provenance.json"
        self.state_path = data_dir / "manual_review.json"
        self.items = []
        self.by_name = {}
        self._load()

    def _load(self):
        prov = {}
        if self.prov_path.exists():
            try:
                prov = json.loads(self.prov_path.read_text(encoding="utf-8"))
            except Exception:
                prov = {}

        saved = {}
        if self.state_path.exists():
            try:
                saved = json.loads(self.state_path.read_text(encoding="utf-8"))
            except Exception:
                saved = {}

        # Load existing CSV rows as initial categories
        csv_rows = {}
        if self.csv_path.exists():
            with open(self.csv_path, newline="", encoding="utf-8") as f:
                for r in csv.DictReader(f):
                    csv_rows[r["filename"].strip()] = r

        files = sorted(
            f.name for f in self.images_dir.iterdir()
            if f.is_file() and f.suffix.lower() in (".jpg", ".jpeg", ".png")
        )
        for fname in files:
            prev = saved.get(fname, {})
            csv_r = csv_rows.get(fname, {})
            p_r = prov.get(fname, {})
            inferred_cat = csv_r.get("category") or p_r.get("category") or "pothole"
            item = {
                "filename": fname,
                "category": prev.get("category", inferred_cat),
                "severity": prev.get("severity", csv_r.get("severity", "medium")),
                "reviewed": bool(prev.get("reviewed", False)),
                "rejected": bool(prev.get("rejected", False)),
                "source_title": p_r.get("source_title", ""),
            }
            self.items.append(item)
            self.by_name[fname] = item

    def update(self, filename, category, severity, rejected):
        it = self.by_name[filename]
        if category in CATEGORIES:
            it["category"] = category
        if severity in SEVERITIES:
            it["severity"] = severity
        it["rejected"] = bool(rejected)
        it["reviewed"] = True
        self._save()
        return it

    def _save(self):
        state = {
            it["filename"]: {
                "category": it["category"],
                "severity": it["severity"],
                "reviewed": it["reviewed"],
                "rejected": it["rejected"],
            }
            for it in self.items
        }
        self.state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
        self.export_csv()

    def export_csv(self):
        # Write all reviewed & non-rejected rows (if none reviewed yet, keep existing file safe)
        reviewed = [it for it in self.items if it["reviewed"]]
        kept = [it for it in reviewed if not it["rejected"]]
        if reviewed:
            with open(self.csv_path, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=["filename", "category", "severity"])
                w.writeheader()
                for it in kept:
                    w.writerow({
                        "filename": it["filename"],
                        "category": it["category"],
                        "severity": it["severity"],
                    })
        return {
            "kept": len(kept),
            "rejected": sum(1 for it in self.items if it["rejected"]),
            "unreviewed": sum(1 for it in self.items if not it["reviewed"]),
        }


def make_handler(store: LabelStore):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass  # keep terminal clean

        def _json(self, obj, code=200):
            body = json.dumps(obj).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path == "/":
                body = HTML_PAGE.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif parsed.path == "/api/items":
                self._json({"items": store.items})
            elif parsed.path.startswith("/images/"):
                fname = urllib.parse.unquote(parsed.path[len("/images/"):])
                fpath = store.images_dir / os.path.basename(fname)
                if not fpath.exists():
                    self.send_error(404)
                    return
                ctype = "image/png" if fpath.suffix.lower() == ".png" else "image/jpeg"
                data = fpath.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_error(404)

        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length else b"{}"
            if self.path == "/api/label":
                body = json.loads(raw.decode("utf-8"))
                it = store.update(
                    body["filename"], body["category"], body["severity"], body["rejected"]
                )
                self._json({"item": it})
            elif self.path == "/api/export":
                self._json(store.export_csv())
            else:
                self.send_error(404)

    return Handler


def main():
    ap = argparse.ArgumentParser(description="Local browser tool to manually label CivicTrack images.")
    ap.add_argument("--data-dir", default="data/real")
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()

    store = LabelStore(Path(a.data_dir))
    server = HTTPServer(("127.0.0.1", a.port), make_handler(store))
    print(f"CivicTrack Labelling Tool running at http://localhost:{a.port}")
    print(f"Loaded {len(store.items)} images from {a.data_dir}/images/")
    print("Keys: [1]=low  [2]=medium  [3]=high  [X]=reject  [Left/Right]=navigate")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped. Progress saved in manual_review.json and labels.csv.")


if __name__ == "__main__":
    main()
