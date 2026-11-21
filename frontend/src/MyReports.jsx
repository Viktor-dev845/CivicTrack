import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { Card, Button, SeverityBadge, StepTrack, cat } from "./components.jsx";

export default function MyReports({ refreshKey, onReport }) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState("");
  useEffect(() => {
    api("/reports/mine").then((d) => setRows(d.reports)).catch((e) => setErr(e.message));
  }, [refreshKey]);

  if (err) return <p className="text-high">{err}</p>;
  if (!rows) return <p className="text-kerb">Loading your reports...</p>;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-3xl font-extrabold">My reports</h1>
      {rows.length === 0 && (
        <Card className="space-y-3 p-7 text-center">
          <p className="font-display text-xl font-bold">You have not reported anything yet</p>
          <p className="text-sm text-kerb">When you report a problem, you can follow its repair here.</p>
          <div><Button variant="line" onClick={onReport}>Report a problem</Button></div>
        </Card>
      )}
      {rows.map((r) => (
        <Card key={r.id} className="flex gap-4 p-4">
          {r.image_url
            ? <img src={r.image_url} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
            : <div className="h-24 w-24 shrink-0 rounded-xl bg-concrete" />}
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg font-bold">{cat(r.category)}</span>
              <SeverityBadge s={r.severity} />
            </div>
            <StepTrack status={r.status} />
            <div className="text-xs text-kerb">Submitted {new Date(r.created_at).toLocaleString()}</div>
            {r.needs_review && <div className="text-xs font-semibold text-medium">Waiting for an administrator to verify this report</div>}
            {r.duplicate_cluster_id && r.duplicate_count > 1 && (
              <div className="text-xs text-kerb">Grouped with {r.duplicate_count} nearby reports (cluster #{String(r.duplicate_cluster_id).slice(0, 8)})</div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
