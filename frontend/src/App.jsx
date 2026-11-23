import React, { useEffect, useState } from "react";
import { api, setToken, getToken } from "./api.js";
import Auth from "./Auth.jsx";
import PublicMap from "./PublicMap.jsx";
import ReportForm from "./ReportForm.jsx";
import MyReports from "./MyReports.jsx";
import Admin from "./Admin.jsx";
import { Logo } from "./components.jsx";

export default function App() {
  const [user, setUser] = useState(null); const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("map"); const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!getToken()) return setReady(true);
    api("/auth/me")
      .then((d) => { setUser(d.user); setTab(d.user.role === "admin" ? "admin" : "map"); })
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  if (!ready) return <p className="p-8 text-kerb">Loading CivicTrack...</p>;

  const logout = () => { setToken(null); setUser(null); setTab("map"); };

  const T = ({ id, children }) => (
    <button onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}
      className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${tab === id ? "bg-line text-asphalt" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
      {children}
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-road">
      <header className="bg-asphalt text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3.5">
          <button onClick={() => setTab("map")} className="mr-4 flex items-center gap-2.5" aria-label="CivicTrack home">
            <Logo />
            <span className="font-display text-xl font-bold tracking-tight">CivicTrack</span>
          </button>
          <nav className="flex flex-wrap items-center gap-1">
            <T id="map">Public map</T>
            {user?.role === "citizen" && <><T id="report">Report a problem</T><T id="mine">My reports</T></>}
            {user?.role === "admin" && <T id="admin">Dashboard</T>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="hidden text-white/70 sm:inline">{user.full_name}</span>
                <button className="rounded-lg border border-white/25 px-3 py-1.5 font-semibold hover:bg-white/10" onClick={logout}>Log out</button>
              </>
            ) : (
              <button className="rounded-lg bg-line px-4 py-2 font-semibold text-asphalt hover:bg-[#ffd04a]" onClick={() => setTab("login")}>Log in or register</button>
            )}
          </div>
        </div>
        <div className="centre-line" aria-hidden="true" />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {tab === "login" && !user && <Auth onDone={(u) => { setUser(u); setTab(u.role === "admin" ? "admin" : "report"); }} />}
        {tab === "map" && <PublicMap isAdmin={user?.role === "admin"} onReport={() => setTab(user?.role === "admin" ? "admin" : user ? "report" : "login")} />}
        {tab === "report" && (user ? <ReportForm onSubmitted={() => setRefresh((n) => n + 1)} onSeeMine={() => setTab("mine")} /> : <Auth onDone={(u) => { setUser(u); setTab("report"); }} />)}
        {tab === "mine" && user && <MyReports refreshKey={refresh} onReport={() => setTab("report")} />}
        {tab === "admin" && user?.role === "admin" && <Admin />}
      </main>

      <footer className="border-t border-edge px-4 py-6 text-center text-xs text-kerb">
        <p>CivicTrack — An AI-Enabled GIS Framework for Automated Classification and Multi-Criteria Prioritisation of Citizen-Reported Urban Infrastructure Defects</p>
        <p className="mt-1">MIVA Open University &nbsp;•&nbsp; Kalu Victor (Matriculation No: 2025/B/MIT/1280) &nbsp;•&nbsp; Supervisor: Prof. Ageebee Silas Faki</p>
        <p className="mt-1">Map data © OpenStreetMap contributors</p>
      </footer>
    </div>
  );
}
