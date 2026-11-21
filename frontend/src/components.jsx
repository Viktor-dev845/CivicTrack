import React from "react";
import { CATEGORY_LABELS, STATUS_LABELS, SEVERITY_COLORS } from "./api.js";

export const Logo = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 2C9.4 2 4.5 7 4.5 13.3c0 8 11.5 16.7 11.5 16.7s11.5-8.7 11.5-16.7C27.5 7 22.6 2 16 2z" fill="#f2c230" />
    <path d="M10.3 13.5l4 4 7.4-8" fill="none" stroke="#181b20" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Badge = ({ children, color = "#667080", soft = false }) => (
  <span
    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
    style={soft ? { background: color + "1f", color } : { background: color, color: "#fff" }}
  >
    {soft && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
    {children}
  </span>
);

const sevText = { low: "Low", medium: "Medium", high: "High" };
export const SeverityBadge = ({ s }) => (
  s ? <Badge soft color={SEVERITY_COLORS[s]}>{sevText[s] || s} severity</Badge> : <Badge soft>Not rated</Badge>
);

const statusColor = { resolved: "#2a8a68", in_progress: "#2f6fdb", reported: "#667080" };
export const StatusBadge = ({ s }) => (
  <Badge soft color={statusColor[s] || "#667080"}>{STATUS_LABELS[s] || s}</Badge>
);

export const cat = (c) => CATEGORY_LABELS[c] || "Needs review";

export const Card = ({ children, className = "" }) => (
  <div className={`rounded-2xl border border-edge bg-paper p-5 ${className}`}>{children}</div>
);

export const Button = ({ children, className = "", variant = "dark", ...p }) => {
  const look = {
    dark: "bg-asphalt text-white hover:bg-asphalt-2",
    solid: "bg-asphalt text-white hover:bg-asphalt-2",
    line: "bg-line text-asphalt hover:bg-[#ffd04a]",
    plain: "border-[1.5px] border-edge bg-white text-ink hover:border-asphalt",
  }[variant] || "bg-asphalt text-white hover:bg-asphalt-2";
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${look} ${className}`}
      {...p}
    >
      {children}
    </button>
  );
};

export const Field = ({ label, hint, children }) => (
  <label className="block text-sm">
    <span className="mb-1.5 block font-semibold">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-kerb">{hint}</span>}
  </label>
);

export const inputCls = "field";

export const Err = ({ msg }) => (
  msg ? <p role="alert" className="rounded-xl border border-high/30 bg-high/10 px-3 py-2 text-sm font-medium text-high">{msg}</p> : null
);

export const Stat = ({ value, label, tone }) => (
  <div>
    <div className="font-display text-3xl font-bold leading-none sm:text-4xl" style={tone ? { color: tone } : undefined}>{value}</div>
    <div className="mt-1 text-sm text-kerb">{label}</div>
  </div>
);

export const StepTrack = ({ status }) => {
  const steps = ["reported", "in_progress", "resolved"];
  const at = steps.indexOf(status);
  return (
    <ol className="flex items-center gap-1.5 text-xs" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${i <= at ? "bg-asphalt" : "bg-edge"}`} />
          <span className={i <= at ? "font-semibold text-ink" : "text-kerb"}>{STATUS_LABELS[s]}</span>
          {i < steps.length - 1 && <span className={`mx-1 h-0.5 w-5 rounded ${i < at ? "bg-asphalt" : "bg-edge"}`} />}
        </li>
      ))}
    </ol>
  );
};
