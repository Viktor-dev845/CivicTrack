import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import { apiUpload, UMUAHIA, CATEGORY_LABELS } from "./api.js";
import { Card, Button, Field, inputCls, Err, SeverityBadge } from "./components.jsx";

const pin = new L.DivIcon({
  className: "",
  html: '<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#f2c230;border:3px solid #181b20;box-shadow:0 4px 10px rgba(0,0,0,.35)"></div>',
  iconSize: [26, 26], iconAnchor: [13, 26],
});

function Picker({ onPick }) { useMapEvents({ click: (e) => onPick([e.latlng.lat, e.latlng.lng]) }); return null; }
function Fly({ to }) { const m = useMap(); useEffect(() => { if (to) m.setView(to, 17); }, [to, m]); return null; }

const Step = ({ n, title, children, done }) => (
  <Card className="space-y-4">
    <div className="flex items-center gap-3">
      <span className={`grid h-8 w-8 place-items-center rounded-full font-display text-sm font-bold ${done ? "bg-asphalt text-line" : "bg-line text-asphalt"}`}>{done ? "✓" : n}</span>
      <h3 className="font-display text-lg font-bold">{title}</h3>
    </div>
    {children}
  </Card>
);

export default function ReportForm({ onSubmitted, onSeeMine }) {
  const [file, setFile] = useState(null); const [pos, setPos] = useState(null); const [fly, setFly] = useState(null);
  const [note, setNote] = useState(""); const [place, setPlace] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function useGps() {
    if (!navigator.geolocation) return setErr("This browser cannot give your location. Tap the map instead.");
    navigator.geolocation.getCurrentPosition(
      (p) => { const c = [p.coords.latitude, p.coords.longitude]; setPos(c); setFly(c); setErr(""); },
      () => setErr("Could not get your location. Tap the map to place the pin instead."));
  }

  async function submit(e) {
    e.preventDefault(); setErr("");
    if (!file) return setErr("Add a photo of the problem first.");
    if (!pos) return setErr("Place the pin on the map first.");
    const form = new FormData();
    form.append("photo", file);
    form.append("latitude", pos[0]);
    form.append("longitude", pos[1]);
    form.append("description", note);
    form.append("address_text", place);
    setBusy(true);
    try {
      const d = await apiUpload("/reports", form);
      setDone(d.report); onSubmitted?.();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  if (done) return (
    <div className="mx-auto max-w-lg">
      <Card className="space-y-4 p-7">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-line font-display text-2xl font-bold">✓</div>
        <h2 className="font-display text-3xl font-bold leading-tight">Report sent. Thank you.</h2>
        {done.needs_review
          ? <div className="space-y-1.5 rounded-xl border border-medium/30 bg-medium/10 p-4 text-sm">
              <div className="font-semibold text-ink">Flagged for administrator review</div>
              <p className="text-kerb">
                {done.ai_category && done.ai_confidence != null
                  ? `The AI guessed ${CATEGORY_LABELS[done.ai_category] || done.ai_category} (${Math.round(done.ai_confidence * 100)}% confidence — below the 60% auto-publish threshold), so an administrator will verify it before it appears on the public map.`
                  : "The AI service could not classify this photo automatically, so an administrator will check it. It will appear on the public map after review."}
              </p>
            </div>
          : <div className="space-y-2 rounded-xl bg-concrete p-4 text-sm">
              <div className="text-kerb">The AI model classified your photo as</div>
              <div className="font-display text-xl font-bold">{CATEGORY_LABELS[done.category] || done.category}</div>
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge s={done.severity} />
                {done.ai_confidence != null && (
                  <span className="text-xs font-semibold text-kerb">AI confidence: {Math.round(done.ai_confidence * 100)}%</span>
                )}
                {done.priority_score != null && (
                  <span className="text-xs font-semibold text-kerb">· Priority: {Math.round(Number(done.priority_score))} / 100</span>
                )}
              </div>
            </div>}
        {done.duplicate_count > 1 && <p className="text-sm text-kerb">Other people have reported this problem nearby — your report was grouped with theirs and moves up the queue.</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="line" onClick={() => { setDone(null); setFile(null); setPos(null); setNote(""); setPlace(""); }}>Report another problem</Button>
          <Button variant="plain" onClick={onSeeMine}>See my reports</Button>
        </div>
      </Card>
    </div>
  );

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Report a problem</h1>
        <p className="mt-1 text-kerb">Three quick steps. The photo and the pin are all we need.</p>
      </div>

      <Step n={1} title="Take or choose a photo" done={!!file}>
        <label className="group block cursor-pointer">
          <input type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" onChange={(e) => setFile(e.target.files[0] || null)} />
          {preview
            ? <div className="relative overflow-hidden rounded-xl"><img src={preview} alt="Your photo" className="max-h-64 w-full object-cover" />
                <span className="absolute bottom-3 right-3 rounded-lg bg-asphalt/85 px-3 py-1.5 text-xs font-semibold text-white">Change photo</span></div>
            : <div className="grid place-items-center gap-1 rounded-xl border-2 border-dashed border-edge bg-concrete/60 px-4 py-10 text-center transition group-hover:border-asphalt">
                <span className="font-display text-lg font-bold">Tap to add a photo</span>
                <span className="text-sm text-kerb">JPEG or PNG. Show the whole problem clearly.</span>
              </div>}
        </label>
      </Step>

      <Step n={2} title="Pin the location" done={!!pos}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-kerb">Tap the map where the problem is, or use your phone's location.</p>
          <Button type="button" variant="plain" onClick={useGps} className="py-2">Use my location</Button>
        </div>
        <div className="h-72 overflow-hidden rounded-xl border border-edge">
          <MapContainer key="report-map" center={UMUAHIA} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Picker onPick={setPos} /><Fly to={fly} />{pos && <Marker position={pos} icon={pin} />}
          </MapContainer>
        </div>
        <p className="text-xs text-kerb">{pos ? `Pinned at ${pos[0].toFixed(5)}, ${pos[1].toFixed(5)}` : "No pin placed yet."}</p>
      </Step>

      <Step n={3} title="Add details (optional)">
        <Field label="Street or landmark"><input className={inputCls} value={place} onChange={(e) => setPlace(e.target.value)} maxLength={255} placeholder="e.g. Near Isi Gate roundabout" /></Field>
        <Field label="Short note"><textarea className={inputCls} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Anything that helps the repair team" /></Field>
      </Step>

      <Err msg={err} />
      <Button variant="line" disabled={busy} className="w-full py-3.5 text-base">{busy ? "Sending and reading your photo..." : "Send report"}</Button>
    </form>
  );
}
