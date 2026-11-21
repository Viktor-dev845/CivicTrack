import React, { useCallback, useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap } from "react-leaflet";
import { api, UMUAHIA, CATEGORY_LABELS, STATUS_LABELS, SEVERITY_COLORS } from "./api.js";
import { Card, Button, Field, inputCls, Err, SeverityBadge, StatusBadge, Badge, Stat, cat } from "./components.jsx";

const SEVS = ["low", "medium", "high"];

function Detail({ r, units, onChange, onClose }) {
  const [msg, setMsg] = useState("");
  const [category, setCategory] = useState(r.category || "pothole");
  const [severity, setSeverity] = useState(r.severity || "medium");
  const run = async (fn) => { setMsg(""); try { await fn(); onChange(); } catch (e) { setMsg(e.message); } };
  const conf = r.ai_confidence != null ? Math.round(r.ai_confidence * 100) : null;
  return (
    <Card className="space-y-4 p-0 lg:sticky lg:top-4">
      {r.image_url && <img src={r.image_url} alt="Citizen photo" className="max-h-60 w-full rounded-t-2xl object-cover" />}
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold">{cat(r.category)}</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5"><SeverityBadge s={r.severity} /><StatusBadge s={r.status} /></div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-edge px-3 py-1 text-sm font-semibold hover:border-asphalt">Close</button>
        </div>
        <div className="space-y-2 rounded-xl bg-concrete p-3.5 text-sm">
          <div className="flex justify-between gap-3"><span className="text-kerb">AI result</span>
            <b className="text-right">{CATEGORY_LABELS[r.ai_category] || "No result"}{r.ai_severity ? `, ${r.ai_severity}` : ""}</b></div>
          {conf != null && (
            <div>
              <div className="mb-1 flex justify-between"><span className="text-kerb">AI confidence</span><b>{conf}%</b></div>
              <div className="h-2 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full ${conf >= 60 ? "bg-low" : "bg-medium"}`} style={{ width: `${conf}%` }} /></div>
            </div>)}
          {r.reviewed_category && <div className="flex justify-between gap-3"><span className="text-kerb">Corrected to</span><b className="text-right">{CATEGORY_LABELS[r.reviewed_category]}, {r.reviewed_severity}</b></div>}
          <div className="flex justify-between"><span className="text-kerb">People who reported it</span><b>{r.duplicate_count}</b></div>
          <div className="flex justify-between"><span className="text-kerb">Priority score</span><b>{Number(r.priority_score).toFixed(0)} / 100</b></div>
          {r.needs_review && <div className="flex justify-between"><span className="text-kerb">Flag</span><Badge soft color="#e07b1a">Needs review</Badge></div>}
          {r.duplicate_cluster_id && <div className="flex justify-between"><span className="text-kerb">Cluster</span><b className="font-mono text-xs">#{String(r.duplicate_cluster_id).slice(0, 8)}</b></div>}
        </div>
        {(r.user_description || r.address_text) && (
          <div className="space-y-1 text-sm">
            {r.address_text && <div><span className="text-kerb">Place: </span>{r.address_text}</div>}
            {r.user_description && <div><span className="text-kerb">Note: </span>{r.user_description}</div>}
          </div>)}
        <div className="text-xs text-kerb">Location {r.latitude?.toFixed(5)}, {r.longitude?.toFixed(5)}</div>

        <div className="space-y-3 border-t border-edge pt-4">
          <h4 className="font-display font-bold">Check the AI</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category"><select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Severity"><select className={inputCls} value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {SEVS.map((s) => <option key={s}>{s}</option>)}</select></Field>
          </div>
          <Button variant="line" className="w-full" onClick={() => run(() => api(`/admin/reports/${r.id}/review`, { method: "PATCH", json: { category, severity } }))}>Save correction</Button>
        </div>

        <div className="space-y-3 border-t border-edge pt-4">
          <h4 className="font-display font-bold">Manage the repair</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status"><select className={inputCls} value={r.status}
              onChange={(e) => run(() => api(`/admin/reports/${r.id}/status`, { method: "PATCH", json: { status: e.target.value } }))}>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Assigned unit"><select className={inputCls} value={r.assigned_unit_id || ""}
              onChange={(e) => run(() => api(`/admin/reports/${r.id}/assign`, { method: "PATCH", json: { unit_id: e.target.value || null } }))}>
              <option value="">Not assigned</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          </div>
        </div>
        <Err msg={msg} />
      </div>
    </Card>
  );
}

const Score = ({ v }) => {
  const n = Math.round(Number(v)); const c = n >= 70 ? "#c7372f" : n >= 45 ? "#e07b1a" : "#2a8a68";
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-8 text-right font-display text-lg font-bold" style={{ color: c }}>{n}</span>
      <span className="h-2 w-16 overflow-hidden rounded-full bg-concrete"><span className="block h-full rounded-full" style={{ width: `${n}%`, background: c }} /></span>
    </div>
  );
};

function Ranked({ units, onChanged }) {
  const [rows, setRows] = useState([]); const [sel, setSel] = useState(null); const [err, setErr] = useState("");
  const [onlyReview, setOnlyReview] = useState(false); const [status, setStatus] = useState("");
  const load = useCallback(() => {
    const q = new URLSearchParams(); if (onlyReview) q.set("needs_review", "true"); if (status) q.set("status", status);
    api(`/admin/reports?${q}`).then((d) => { onChanged?.(); setRows(d.reports); setSel((s) => (s ? d.reports.find((x) => x.id === s.id) || null : null)); }).catch((e) => setErr(e.message));
  }, [onlyReview, status]);
  useEffect(load, [load]);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 font-medium"><input type="checkbox" className="h-4 w-4 accent-asphalt" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} /> Needs review only</label>
          <select className="field !w-auto !py-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All open</option>{Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <Button variant="plain" className="ml-auto py-1.5" onClick={() => api("/admin/recalculate", { method: "POST" }).then(load)}>Recalculate scores</Button>
        </div>
        <Err msg={err} />
        <div className="overflow-x-auto rounded-2xl border border-edge bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-edge bg-concrete/70 text-kerb"><tr>
              <th className="px-4 py-3 font-semibold">Priority</th><th className="font-semibold">Problem</th><th className="font-semibold">Severity</th><th className="font-semibold">People</th><th className="pr-4 font-semibold">Status</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} onClick={() => setSel(r)} className={`cursor-pointer border-t border-edge transition hover:bg-concrete/60 ${sel?.id === r.id ? "bg-line/20" : ""}`}>
                <td className="px-4 py-3"><Score v={r.priority_score} /></td>
                <td className="py-3"><div className="font-semibold">{cat(r.category)}</div>{r.needs_review && <div className="mt-0.5"><Badge soft color="#e07b1a">Needs review</Badge></div>}</td>
                <td><SeverityBadge s={r.severity} /></td><td className="font-semibold">{r.duplicate_count}</td><td className="pr-4"><StatusBadge s={r.status} /></td>
              </tr>))}
              {rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-kerb">No reports match these filters.</td></tr>}</tbody>
          </table>
        </div>
      </div>
      <div>{sel ? <Detail key={sel.id + sel.updated_at} r={sel} units={units} onChange={load} onClose={() => setSel(null)} /> : <Card className="p-7 text-center text-sm text-kerb">Select a report to see its photo, check the AI result and manage the repair.</Card>}</div>
    </div>
  );
}

const parseCats = (cats) =>
  Array.isArray(cats)
    ? cats
    : typeof cats === "string"
      ? cats.replace(/^\{|\}$/g, "").split(",").filter(Boolean)
      : [];

function FocusHotspot({ hotspots }) {
  const map = useMap();
  useEffect(() => {
    if (hotspots?.length) map.setView([hotspots[0].latitude, hotspots[0].longitude], 15);
  }, [hotspots, map]);
  return null;
}

function Hotspots() {
  const [data, setData] = useState(null); const [err, setErr] = useState("");
  useEffect(() => { api("/admin/hotspots").then(setData).catch((e) => setErr(e.message)); }, []);
  return (
    <div className="space-y-3">
      <p className="text-sm text-kerb">
        Hotspot markers show places where at least {data?.min_points ?? 3} open reports are within {data?.eps_m ?? 100} metres of each other (DBSCAN). Only administrators see this view.
      </p>
      <Err msg={err} />
      <div className="h-[60vh] overflow-hidden rounded-3xl border border-edge">
        <MapContainer key="hotspot-map" center={UMUAHIA} zoom={14} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FocusHotspot hotspots={data?.hotspots} />
          {data?.hotspots.map((h) => (
            <Circle key={h.hotspot_id} center={[h.latitude, h.longitude]} radius={data.eps_m} pathOptions={{ color: "#c7372f", weight: 3, fillOpacity: 0.22 }}>
              <Popup><div className="p-3.5"><div className="font-display text-base font-bold">{h.report_count} open reports</div><div className="text-sm text-kerb">{parseCats(h.categories).map((c) => CATEGORY_LABELS[c] ?? c).join(", ")}</div></div></Popup>
            </Circle>))}
        </MapContainer>
      </div>
      {data && data.hotspots.length === 0 && <p className="text-sm text-kerb">No hotspots right now.</p>}
    </div>
  );
}

function Units({ units, reload }) {
  const [f, setF] = useState({ name: "", focus_area: "", contact: "" }); const [err, setErr] = useState("");
  async function add(e) { e.preventDefault(); setErr(""); try { await api("/admin/units", { method: "POST", json: f }); setF({ name: "", focus_area: "", contact: "" }); reload(); } catch (e2) { setErr(e2.message); } }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-2"><h3 className="font-display text-lg font-bold">Maintenance units</h3>
        {units.length === 0 && <p className="text-sm text-kerb">No units yet. Add one so you can assign repairs.</p>}
        {units.map((u) => <div key={u.id} className="rounded-xl bg-concrete px-3 py-2 text-sm"><b>{u.name}</b>{u.focus_area && <span className="text-kerb"> ({u.focus_area})</span>}{u.contact && <div className="text-kerb">{u.contact}</div>}</div>)}</Card>
      <Card><form onSubmit={add} className="space-y-2"><h3 className="font-display text-lg font-bold">Add a unit</h3>
        <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Focus area (optional)"><input className={inputCls} value={f.focus_area} onChange={(e) => setF({ ...f, focus_area: e.target.value })} /></Field>
        <Field label="Contact (optional)"><input className={inputCls} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
        <Err msg={err} /><Button>Add unit</Button></form></Card>
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState("ranked"); const [units, setUnits] = useState([]); const [all, setAll] = useState([]);
  const loadUnits = useCallback(() => { api("/admin/units").then((d) => setUnits(d.units)).catch(() => {}); }, []);
  const loadAll = useCallback(() => { api("/admin/reports").then((d) => setAll(d.reports)).catch(() => {}); }, []);
  useEffect(loadUnits, [loadUnits]); useEffect(loadAll, [loadAll]);
  const T = ({ id, children }) => <button onClick={() => setTab(id)} aria-pressed={tab === id}
    className={`rounded-full border-[1.5px] px-4 py-1.5 text-sm font-semibold transition ${tab === id ? "border-asphalt bg-asphalt text-white" : "border-edge bg-white hover:border-asphalt"}`}>{children}</button>;
  const open = all.filter((r) => r.status !== "resolved");
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-extrabold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-x-10 gap-y-5 rounded-2xl border border-edge bg-paper p-5 sm:grid-cols-4">
        <Stat value={open.length} label="open reports" />
        <Stat value={all.filter((r) => r.needs_review).length} label="need your review" tone="#e07b1a" />
        <Stat value={open.filter((r) => (r.reviewed_severity || r.severity) === "high").length} label="high severity" tone="#c7372f" />
        <Stat value={all.filter((r) => r.status === "in_progress").length} label="being repaired" tone="#2f6fdb" />
      </div>
      <div className="flex flex-wrap gap-2"><T id="ranked">Ranked reports</T><T id="hot">Hotspots</T><T id="units">Maintenance units</T></div>
      {tab === "ranked" && <Ranked units={units} onChanged={loadAll} />}{tab === "hot" && <Hotspots />}{tab === "units" && <Units units={units} reload={loadUnits} />}
    </div>
  );
}
