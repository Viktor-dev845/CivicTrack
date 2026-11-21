import React, { useState } from "react";
import { api, setToken } from "./api.js";
import { Button, Field, inputCls, Err, Logo } from "./components.jsx";

export default function Auth({ onDone }) {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ full_name: "", email: "", password: "" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const data = await api(mode === "login" ? "/auth/login" : "/auth/register", { method: "POST", json: f });
      setToken(data.token); onDone(data.user);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  function demoLogin() {
    setMode("login");
    setF({ full_name: "", email: "admin@civictrack.local", password: "ChangeMe123!" });
  }

  return (
    <div className="mx-auto mt-6 grid max-w-3xl overflow-hidden rounded-3xl border border-edge bg-paper md:grid-cols-[1fr_1.1fr]">
      <div className="hidden flex-col justify-between bg-asphalt p-8 text-white md:flex">
        <Logo size={36} />
        <div>
          <p className="font-display text-3xl font-bold leading-tight">Spot a problem on your street? Tell the people who can fix it.</p>
          <p className="mt-3 text-sm text-white/70">Add a photo and a pin. CivicTrack reads the photo, groups it with nearby reports and puts it in the repair queue.</p>
        </div>
        <div className="centre-line" aria-hidden="true" />
      </div>
      <div className="p-7 sm:p-9">
        <h2 className="font-display text-2xl font-bold">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
        <p className="mt-1 text-sm text-kerb">{mode === "login" ? "Log in to report a problem or track your reports." : "It takes less than a minute."}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "register" && <Field label="Full name"><input className={inputCls} value={f.full_name} onChange={set("full_name")} required autoComplete="name" /></Field>}
          <Field label="Email"><input type="email" className={inputCls} value={f.email} onChange={set("email")} required autoComplete="email" /></Field>
          <Field label="Password" hint={mode === "register" ? "At least 8 characters." : undefined}>
            <input type="password" className={inputCls} value={f.password} onChange={set("password")} required autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </Field>
          <Err msg={err} />
          <Button variant="line" disabled={busy} className="w-full py-3">{busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</Button>
        </form>
        {mode === "login" && (
          <button
            type="button"
            className="mt-3 w-full rounded-xl border border-dashed border-edge bg-concrete/50 py-2 text-xs font-semibold text-kerb hover:bg-concrete"
            onClick={demoLogin}
          >
            Demo: fill admin credentials
          </button>
        )}
        <button className="mt-5 text-sm font-semibold underline decoration-line-deep decoration-2 underline-offset-4" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "New here? Create an account" : "I already have an account"}
        </button>
      </div>
    </div>
  );
}
