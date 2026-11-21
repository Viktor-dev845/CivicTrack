import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import {
  LuCamera, LuCpu, LuWrench, LuMapPin,
  LuLightbulb, LuTrash2, LuWaves, LuConstruction, LuSatellite,
  LuCircleCheck, LuCircleAlert,
} from "react-icons/lu";
import { api, UMUAHIA, CATEGORY_LABELS, SEVERITY_COLORS } from "./api.js";
import { Badge, SeverityBadge, StatusBadge } from "./components.jsx";

const CATS = Object.entries(CATEGORY_LABELS);

const CAT_ICONS = {
  pothole:             <LuConstruction size={14} />,
  damaged_streetlight: <LuLightbulb size={14} />,
  waste_dump:          <LuTrash2 size={14} />,
  drainage:            <LuWaves size={14} />,
};

const HOW_STEPS = [
  {
    icon: <LuCamera size={28} style={{ color: "var(--line)" }} />,
    title: "Take a photo",
    desc: "Snap the problem — a pothole, broken light, blocked drain — right from your phone or PC.",
  },
  {
    icon: <LuCpu size={28} style={{ color: "var(--line)" }} />,
    title: "AI classifies it",
    desc: "Our MobileNetV2 model reads the photo instantly, scores severity and flags near-duplicates.",
  },
  {
    icon: <LuWrench size={28} style={{ color: "var(--line)" }} />,
    title: "City acts on it",
    desc: "Administrators see a ranked priority queue and dispatch the right maintenance unit.",
  },
];

function HowItWorks() {
  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--edge)", borderRadius: "1rem", padding: "2rem" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 700, marginBottom: "1.75rem", textAlign: "center" }}>
        How CivicTrack works
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "2rem" }}>
        {HOW_STEPS.map((s, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "0.75rem" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--asphalt)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {s.icon}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, background: "var(--line)", color: "var(--asphalt)", borderRadius: "50%", fontSize: "0.7rem", fontWeight: 800 }}>{i + 1}</span>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{s.title}</span>
            </div>
            <div style={{ fontSize: "0.875rem", color: "var(--kerb)", lineHeight: 1.65 }}>{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PublicMap({ onReport }) {
  const [reports, setReports] = useState([]);
  const [catFilter, setCatFilter] = useState("all");
  const [err, setErr] = useState("");
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api("/reports/public")
      .then((d) => {
        setReports(d.reports);
        const c = {};
        d.reports.forEach((r) => { c[r.category] = (c[r.category] || 0) + 1; });
        setCounts(c);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const visible = catFilter === "all" ? reports : reports.filter((r) => r.category === catFilter);
  const high = reports.filter((r) => r.severity === "high").length;
  const resolved = reports.filter((r) => r.status === "resolved").length;
  const inProgress = reports.filter((r) => r.status === "in_progress").length;

  const statItems = [
    { value: loading ? "…" : reports.length, label: "total reports", color: "#fff" },
    { value: loading ? "…" : high, label: "high severity", color: "#f87171" },
    { value: loading ? "…" : resolved, label: "resolved", color: "#4ade80" },
    { value: loading ? "…" : inProgress, label: "in progress", color: "#60a5fa" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div style={{ position: "relative", overflow: "hidden", borderRadius: "1.5rem", background: "var(--asphalt)", color: "#fff", padding: "3rem 2.5rem" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "4px", background: "var(--line)" }} />
        <div className="centre-line" style={{ position: "absolute", bottom: 0, left: 0, right: 0 }} aria-hidden="true" />

        <div className="grid gap-8 items-center lg:grid-cols-[1fr_auto]">
          <div>
            {/* Platform badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(242,194,48,.15)", border: "1px solid rgba(242,194,48,.3)", borderRadius: "9999px", padding: "0.3rem 0.875rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--line)", marginBottom: "1.25rem" }}>
              <LuSatellite size={13} /> AI-Enhanced Platform · Umuahia, Abia State
            </div>

            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 800, lineHeight: 1.1, marginBottom: "1rem" }}>
              What is broken<br />in <span style={{ color: "var(--line)" }}>Umuahia</span>?
            </h1>
            <p style={{ color: "rgba(255,255,255,0.65)", maxWidth: "480px", lineHeight: 1.7, fontSize: "0.95rem", marginBottom: "2rem" }}>
              Every pin is a citizen report. Our AI reads the photo, scores severity and groups duplicates — so the city fixes what matters most, faster.
            </p>

            <button onClick={onReport} style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              background: "var(--line)", color: "var(--asphalt)", border: "none",
              borderRadius: "0.75rem", padding: "0.75rem 1.5rem",
              fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit",
              transition: "opacity .15s",
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = ".85"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              <LuCamera size={16} /> Report a problem
            </button>
          </div>

          {/* Stats card */}
          <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "1rem", padding: "1.5rem 2rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem 2.5rem", minWidth: "220px" }}>
            {statItems.map((s) => (
              <div key={s.label}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "2.25rem", fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.45)", marginTop: "0.1rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── How it works ─────────────────────────────────────── */}
      <HowItWorks />

      {/* ── Live map ─────────────────────────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 700 }}>
            Live infrastructure map
          </h2>
          <span style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.75rem", color: "var(--kerb)" }}>
            <LuCircleCheck size={13} style={{ color: "var(--low)" }} /> Real-time · updates on each report
          </span>
        </div>

        {/* Category filter chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
          {[{ k: "all", label: `All (${reports.length})`, icon: <LuMapPin size={13} /> },
            ...CATS.filter(([k]) => counts[k]).map(([k, v]) => ({ k, label: `${v} (${counts[k]})`, icon: CAT_ICONS[k] }))
          ].map(({ k, label, icon }) => (
            <button key={k} onClick={() => setCatFilter(k)} style={{
              display: "inline-flex", alignItems: "center", gap: "0.375rem",
              borderRadius: "9999px", border: `1.5px solid ${catFilter === k ? "var(--asphalt)" : "var(--edge)"}`,
              background: catFilter === k ? "var(--asphalt)" : "var(--paper)",
              color: catFilter === k ? "#fff" : "var(--asphalt)",
              padding: "0.375rem 0.875rem", fontSize: "0.8125rem", fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
            }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Severity legend */}
        <div style={{ display: "flex", gap: "1.25rem", marginBottom: "0.875rem", flexWrap: "wrap" }}>
          {[["Low", "#2a8a68"], ["Medium", "#e07b1a"], ["High", "#c7372f"]].map(([label, color]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", color: "var(--kerb)" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
              {label} severity
            </div>
          ))}
        </div>

        {err && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--high)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            <LuCircleAlert size={15} /> {err}
          </div>
        )}

        {/* Map */}
        <div style={{ height: "60vh", overflow: "hidden", borderRadius: "1.5rem", border: "1px solid var(--edge)" }}>
          <MapContainer key="public-map" center={UMUAHIA} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {visible.map((r) => (
              <CircleMarker key={r.id} center={[r.latitude, r.longitude]} radius={9}
                pathOptions={{ color: SEVERITY_COLORS[r.severity] ?? "#6b7280", fillColor: SEVERITY_COLORS[r.severity] ?? "#6b7280", fillOpacity: 0.8, weight: 2 }}>
                <Popup>
                  <div style={{ minWidth: 190, padding: "0.5rem" }}>
                    {r.image_url && <img src={r.image_url} alt="" style={{ height: 110, width: "100%", objectFit: "cover", borderRadius: "0.5rem", marginBottom: "0.5rem" }} />}
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      {CAT_ICONS[r.category]} {CATEGORY_LABELS[r.category] ?? r.category}
                    </div>
                    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginTop: "0.375rem" }}>
                      <SeverityBadge s={r.severity} />
                      <StatusBadge s={r.status} />
                    </div>
                    {r.user_description && <p style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#555" }}>{r.user_description}</p>}
                    <p style={{ marginTop: "0.375rem", fontSize: "0.7rem", color: "#999" }}>{new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--kerb)", marginTop: "0.5rem", textAlign: "center" }}>
          Map data © OpenStreetMap contributors · {visible.length} report{visible.length !== 1 ? "s" : ""} shown
        </p>
      </div>
    </div>
  );
}
