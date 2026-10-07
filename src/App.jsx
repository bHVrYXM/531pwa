import { useState, useEffect, useRef } from "react";
import {
  loadState, saveState, getLastBackup, requestPersistence,
  exportBackup, readBackupFile, REMIND_AFTER_DAYS,
} from "./storage.js";

const LIFTS = ["Squat", "Bench", "Deadlift", "OHP"];

const DEFAULT_INPUTS = {
  Squat:    { weight: "", reps: "1" },
  Bench:    { weight: "", reps: "1" },
  Deadlift: { weight: "", reps: "1" },
  OHP:      { weight: "", reps: "1" },
};

const DEFAULT_INCREMENTS = {
  kg: { Squat: 5, Bench: 2.5, Deadlift: 5, OHP: 2.5 },
  lb: { Squat: 10, Bench: 5, Deadlift: 10, OHP: 5 },
};

// Accept only known shapes from storage / backup files, fall back to defaults otherwise.
function sanitize(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const inputs = {};
  for (const lift of LIFTS) {
    const v = s.inputs && s.inputs[lift];
    inputs[lift] = {
      weight: v && typeof v.weight === "string" ? v.weight : "",
      reps: v && typeof v.reps === "string" ? v.reps : "1",
    };
  }
  const increments = { kg: {}, lb: {} };
  for (const u of ["kg", "lb"]) {
    for (const lift of LIFTS) {
      const v = s.increments && s.increments[u] && s.increments[u][lift];
      increments[u][lift] = typeof v === "number" && v > 0 && v <= 1000 ? v : DEFAULT_INCREMENTS[u][lift];
    }
  }
  const hidden = {};
  for (const lift of LIFTS) hidden[lift] = !!(s.hidden && s.hidden[lift]);
  if (LIFTS.every(l => hidden[l])) hidden.Squat = false; // always keep one lift visible
  const history = (Array.isArray(s.history) ? s.history : [])
    .filter(h => h && typeof h.ts === "number" && LIFTS.includes(h.lift) &&
      typeof h.tm === "number" && isFinite(h.tm) && ["kg", "lb"].includes(h.unit))
    .map(h => ({ ts: h.ts, lift: h.lift, tm: h.tm, unit: h.unit }))
    .slice(-2000);
  const firstVisible = LIFTS.find(l => !hidden[l]);
  const activeLift = LIFTS.includes(s.activeLift) && !hidden[s.activeLift] ? s.activeLift : firstVisible;
  return {
    inputs, increments, hidden, history,
    tmMode: ["1rm", "repmax", "tm"].includes(s.tmMode) ? s.tmMode : "1rm",
    unit: ["kg", "lb"].includes(s.unit) ? s.unit : "kg",
    activeWeek: [0, 1, 2, 3].includes(s.activeWeek) ? s.activeWeek : 0,
    activeLift,
  };
}

const DAY = 24 * 60 * 60 * 1000;

function describeAge(ts) {
  if (!ts) return "never";
  const days = Math.floor((Date.now() - ts) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

const WEEKS = [
  {
    label: "Week 1", tag: "5s Week",
    sets: [{ pct: 0.65, reps: "5" }, { pct: 0.75, reps: "5" }, { pct: 0.85, reps: "5+" }],
  },
  {
    label: "Week 2", tag: "3s Week",
    sets: [{ pct: 0.70, reps: "3" }, { pct: 0.80, reps: "3" }, { pct: 0.90, reps: "3+" }],
  },
  {
    label: "Week 3", tag: "5/3/1 Week",
    sets: [{ pct: 0.75, reps: "5" }, { pct: 0.85, reps: "3" }, { pct: 0.95, reps: "1+" }],
  },
  {
    label: "Week 4", tag: "Deload",
    sets: [{ pct: 0.40, reps: "5" }, { pct: 0.50, reps: "5" }, { pct: 0.60, reps: "5" }],
  },
];

function round(weight, unit) {
  const factor = unit === "kg" ? 2.5 : 5;
  return Math.round(weight / factor) * factor;
}

// Epley formula: estimated 1RM from weight × reps
function epley(weight, reps) {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

const S = {
  label: { fontSize: 10, letterSpacing: "0.2em", color: "#888", textTransform: "uppercase", marginBottom: 10 },
  sectionWrap: { width: "100%", maxWidth: 480, padding: "0 20px", boxSizing: "border-box", marginBottom: 20 },
};

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// Simple line chart of Training Max over time (points spaced evenly, not by date,
// so a few updates months apart still read clearly).
function TmChart({ points, unit, color }) {
  if (points.length === 0) {
    return <div style={{ fontSize: 11, color: "#555", lineHeight: 1.6, padding: "0 6px 6px" }}>No history yet. It starts when you increase a TM or tap “Log current TMs”.</div>;
  }
  const W = 320, H = 150, L = 36, R = 12, T = 12, B = 24;
  const vals = points.map(p => p.tm);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) { lo -= 5; hi += 5; }
  const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
  const x = i => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = points.map((p, i) => `${x(i)},${y(p.tm)}`).join(" ");
  const fmt = v => String(Math.round(v * 10) / 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[lo + pad, hi - pad].map((v, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#222" strokeWidth="1" />
          <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#666">{fmt(v)}</text>
        </g>
      ))}
      {points.length > 1 && <polyline points={line} fill="none" stroke={color} strokeWidth="2" />}
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.tm)} r="3.5" fill={color} />)}
      <text x={x(0)} y={H - 6} textAnchor={points.length === 1 ? "middle" : "start"} fontSize="9" fill="#666">{fmtDate(points[0].ts)}</text>
      {points.length > 1 && (
        <text x={x(points.length - 1)} y={H - 6} textAnchor="end" fontSize="9" fill="#666">{fmtDate(points[points.length - 1].ts)}</text>
      )}
      <text x={W - R} y={T - 2} textAnchor="end" fontSize="9" fill="#666">{unit}</text>
    </svg>
  );
}

export default function App() {
  // Restore whatever was saved on this device last time (once, on first render)
  const [initial] = useState(() => sanitize(loadState()));
  const [inputs, setInputs] = useState(initial.inputs);
  const [tmMode, setTmMode] = useState(initial.tmMode); // "1rm" | "repmax" | "tm"
  const [unit, setUnit] = useState(initial.unit);
  const [activeWeek, setActiveWeek] = useState(initial.activeWeek);
  const [activeLift, setActiveLift] = useState(initial.activeLift);
  const [increments, setIncrements] = useState(initial.increments);
  const [hidden, setHidden] = useState(initial.hidden);
  const [history, setHistory] = useState(initial.history);
  const [undo, setUndo] = useState(null); // last "increase TM", so a mis-tap can be reverted

  const [lastBackup, setLastBackupState] = useState(() => getLastBackup());
  const [backupMsg, setBackupMsg] = useState(null);
  const fileInputRef = useRef(null);

  const persisted = { inputs, tmMode, unit, activeWeek, activeLift, increments, hidden, history };
  const visibleLifts = LIFTS.filter(l => !hidden[l]);

  // Save on every change — device only
  useEffect(() => {
    saveState(persisted);
  }, [inputs, tmMode, unit, activeWeek, activeLift, increments, hidden, history]);

  useEffect(() => { requestPersistence(); }, []);

  const hasData = LIFTS.some(l => inputs[l].weight !== "");
  const backupDue = hasData && (!lastBackup || Date.now() - lastBackup > REMIND_AFTER_DAYS * DAY);

  const handleExport = async () => {
    const result = await exportBackup(persisted);
    if (result !== "cancelled") {
      setLastBackupState(getLastBackup());
      setBackupMsg({ ok: true, text: "Backup created." });
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    try {
      const data = sanitize(await readBackupFile(file));
      if (hasData && !window.confirm("Replace the current numbers with the backup?")) return;
      setInputs(data.inputs);
      setTmMode(data.tmMode);
      setUnit(data.unit);
      setActiveWeek(data.activeWeek);
      setActiveLift(data.activeLift);
      setIncrements(data.increments);
      setHidden(data.hidden);
      setHistory(data.history);
      setUndo(null);
      setLastBackupState(getLastBackup());
      setBackupMsg({ ok: true, text: "Backup restored." });
    } catch (err) {
      setBackupMsg({ ok: false, text: err.message || "Couldn't read that file." });
    }
  };

  // "tm" mode: user enters TM directly — used as-is, no 90% applied
  // "1rm" mode: user enters 1RM — TM = 90% of that
  // "repmax" mode: user enters weight+reps — 1RM estimated via Epley, TM = 90% of that
  const get1RM = (lift) => {
    const w = parseFloat(inputs[lift].weight);
    if (!w || isNaN(w)) return null;
    if (tmMode === "tm") return null; // no 1RM concept in tm mode
    if (tmMode === "1rm") return w;
    const r = parseInt(inputs[lift].reps) || 1;
    return epley(w, r);
  };

  const getTM = (lift) => {
    const w = parseFloat(inputs[lift].weight);
    if (!w || isNaN(w)) return null;
    if (tmMode === "tm") return w; // entered directly
    const orm = get1RM(lift);
    if (!orm) return null;
    return orm * 0.9;
  };

  const toggleHidden = (lift) => {
    const next = { ...hidden, [lift]: !hidden[lift] };
    if (LIFTS.every(l => next[l])) return; // keep at least one
    setHidden(next);
    if (next[activeLift]) setActiveLift(LIFTS.find(l => !next[l]));
  };

  const setIncrement = (lift, value) => {
    const v = parseFloat(value);
    setIncrements(p => ({ ...p, [unit]: { ...p[unit], [lift]: v > 0 ? v : 0 } }));
  };

  const round2 = (n) => Math.round(n * 100) / 100;

  // Raise the TM by the lift's chosen increment, whatever input method is active.
  const increaseTM = (lift) => {
    const tm = getTM(lift);
    const inc = increments[unit][lift];
    if (!tm || !(inc > 0)) return;
    const newTM = round2(tm + inc);
    const newWeight = tmMode === "tm" ? newTM : round2(newTM / 0.9);
    const now = Date.now();
    const entries = [];
    if (!history.some(h => h.lift === lift && h.unit === unit)) {
      entries.push({ ts: now - 1, lift, tm: round2(tm), unit }); // baseline so the chart has a start point
    }
    entries.push({ ts: now, lift, tm: newTM, unit });
    setUndo({ lift, prevInput: inputs[lift], histLen: history.length, newTM, inc });
    setInputs(p => ({
      ...p,
      [lift]: { weight: String(newWeight), reps: tmMode === "repmax" ? "1" : p[lift].reps },
    }));
    setHistory(h => [...h, ...entries]);
  };

  const undoIncrease = () => {
    if (!undo) return;
    setInputs(p => ({ ...p, [undo.lift]: undo.prevInput }));
    setHistory(h => h.slice(0, undo.histLen));
    setUndo(null);
  };

  const logCurrentTMs = () => {
    const now = Date.now();
    const fresh = [];
    for (const lift of visibleLifts) {
      const tm = getTM(lift);
      if (!tm) continue;
      const last = [...history].reverse().find(h => h.lift === lift && h.unit === unit);
      if (last && Math.abs(last.tm - tm) < 0.005) continue; // unchanged
      fresh.push({ ts: now, lift, tm: round2(tm), unit });
    }
    if (fresh.length) { setHistory(h => [...h, ...fresh]); setUndo(null); }
  };

  const chartPoints = history.filter(h => h.lift === activeLift && h.unit === unit);

  const currentTM = getTM(activeLift);
  const current1RM = get1RM(activeLift);
  const currentWeek = WEEKS[activeWeek];

  const gold = "#c8a96e";

  const Toggle = ({ options, value, onChange }) => (
    <div style={{ display: "flex", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, overflow: "hidden" }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          padding: "8px 14px", background: value === o.value ? gold : "transparent",
          color: value === o.value ? "#0a0a0a" : "#888", border: "none",
          fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer",
          letterSpacing: "0.04em", whiteSpace: "nowrap",
        }}>{o.label}</button>
      ))}
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a", color: "#f0ece4",
      fontFamily: "'Georgia','Times New Roman',serif",
      display: "flex", flexDirection: "column", alignItems: "center",
    }}>

      {/* Header */}
      <div style={{ width: "100%", maxWidth: 480, padding: "32px 20px 0", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.25em", color: "#888", textTransform: "uppercase", marginBottom: 4 }}>Jim Wendler</div>
            <h1 style={{ margin: 0, fontSize: 36, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>5/3/1</h1>
          </div>
          <Toggle options={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]} value={unit} onChange={setUnit} />
        </div>
        <div style={{ height: 1, background: gold, margin: "20px 0 24px", opacity: 0.4 }} />

        {/* Backup reminder */}
        {backupDue && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            padding: "10px 14px", marginBottom: 22, borderRadius: 8,
            background: "#141410", border: `1px solid ${gold}44`,
          }}>
            <div style={{ fontSize: 11, color: "#aaa", lineHeight: 1.5 }}>
              Last backup: <span style={{ color: gold }}>{describeAge(lastBackup)}</span>
            </div>
            <button onClick={handleExport} style={{
              padding: "7px 12px", background: gold, color: "#0a0a0a", border: "none",
              borderRadius: 6, fontFamily: "inherit", fontSize: 11, fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap",
            }}>Back up now</button>
          </div>
        )}

        {/* TM mode toggle */}
        <div style={{ marginBottom: 22 }}>
          <div style={S.label}>Training Max Method</div>
          <Toggle
            options={[
              { value: "1rm",    label: "1RM" },
              { value: "repmax", label: "Wt + Reps" },
              { value: "tm",     label: "Enter TM" },
            ]}
            value={tmMode}
            onChange={setTmMode}
          />
          <div style={{ fontSize: 10, color: "#555", marginTop: 8, lineHeight: 1.6 }}>
            {tmMode === "1rm"
              ? "Enter your 1RM. TM = 90% of that. Wendler's standard."
              : tmMode === "repmax"
              ? "Enter weight + reps. 1RM estimated via Epley, then TM = 90%."
              : "Enter your Training Max directly. Used as-is — no buffer applied."}
          </div>
        </div>

        {/* Which lifts to show */}
        <div style={{ marginBottom: 22 }}>
          <div style={S.label}>Lifts Shown</div>
          <div style={{ display: "flex", gap: 8 }}>
            {LIFTS.map(lift => (
              <button key={lift} onClick={() => toggleHidden(lift)} style={{
                flex: 1, padding: "8px 4px", borderRadius: 8, fontFamily: "inherit",
                fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase",
                background: hidden[lift] ? "transparent" : "#141414",
                color: hidden[lift] ? "#444" : gold,
                border: `1px ${hidden[lift] ? "dashed" : "solid"} ${hidden[lift] ? "#2a2a2a" : gold + "66"}`,
                textDecoration: hidden[lift] ? "line-through" : "none",
              }}>{lift}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Maxes input */}
      <div style={{ ...S.sectionWrap, marginBottom: 24 }}>
        <div style={S.label}>{tmMode === "tm" ? "Enter Training Max" : tmMode === "1rm" ? "Enter 1-Rep Max" : "Enter Weight & Reps"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {visibleLifts.map(lift => {
            const orm = get1RM(lift);
            const tm = getTM(lift);
            const isActive = activeLift === lift;
            return (
              <div key={lift} style={{
                background: isActive ? "#141414" : "#0f0f0f",
                border: `1px solid ${isActive ? gold + "66" : "#1e1e1e"}`,
                borderRadius: 10, padding: "12px",
                cursor: "pointer", transition: "border-color 0.2s",
              }} onClick={() => setActiveLift(lift)}>
                <div style={{ fontSize: 10, letterSpacing: "0.15em", color: isActive ? gold : "#555", textTransform: "uppercase", marginBottom: 8, fontWeight: 700 }}>
                  {lift}
                </div>
                {/* Weight input */}
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <div style={{ flex: tmMode === "repmax" ? 2 : 1, position: "relative" }}>
                    <input
                      type="number" inputMode="decimal" placeholder={tmMode === "tm" ? "TM" : tmMode === "1rm" ? "1RM" : "Weight"}
                      value={inputs[lift].weight}
                      onChange={e => setInputs(p => ({ ...p, [lift]: { ...p[lift], weight: e.target.value } }))}
                      onFocus={() => setActiveLift(lift)}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        background: "#0a0a0a", border: `1px solid ${isActive ? gold + "44" : "#222"}`,
                        borderRadius: 6, padding: "8px 28px 8px 8px",
                        color: "#f0ece4", fontFamily: "inherit", fontSize: 15, fontWeight: 600, outline: "none",
                      }}
                    />
                    <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "#444" }}>{unit}</span>
                  </div>
                  {/* Reps input — only shown in repmax mode */}
                  {tmMode === "repmax" && (
                    <div style={{ flex: 1, position: "relative" }}>
                      <input
                        type="number" inputMode="numeric" placeholder="Reps" min="1"
                        value={inputs[lift].reps}
                        onChange={e => setInputs(p => ({ ...p, [lift]: { ...p[lift], reps: e.target.value } }))}
                        onFocus={() => setActiveLift(lift)}
                        style={{
                          width: "100%", boxSizing: "border-box",
                          background: "#0a0a0a", border: `1px solid ${isActive ? gold + "44" : "#222"}`,
                          borderRadius: 6, padding: "8px 22px 8px 8px",
                          color: "#f0ece4", fontFamily: "inherit", fontSize: 15, fontWeight: 600, outline: "none",
                        }}
                      />
                      <span style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "#444" }}>rp</span>
                    </div>
                  )}
                </div>
                {/* Derived values */}
                {tm && (
                  <div style={{ fontSize: 9, color: "#555", lineHeight: 1.8 }}>
                    {tmMode === "repmax" && orm && (
                      <div>≈1RM <span style={{ color: "#888" }}>{round(orm, unit)} {unit}</span></div>
                    )}
                    {tmMode === "1rm" && (
                      <div>TM (90%) <span style={{ color: gold }}>{round(tm, unit)} {unit}</span></div>
                    )}
                    {tmMode === "repmax" && (
                      <div>TM (90%) <span style={{ color: gold }}>{round(tm, unit)} {unit}</span></div>
                    )}
                    {tmMode === "tm" && (
                      <div>TM <span style={{ color: gold }}>{round(tm, unit)} {unit}</span></div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lift selector */}
      <div style={S.sectionWrap}>
        <div style={S.label}>Lift</div>
        <div style={{ display: "flex", gap: 8 }}>
          {visibleLifts.map(lift => (
            <button key={lift} onClick={() => setActiveLift(lift)} style={{
              flex: 1, padding: "10px 4px",
              background: activeLift === lift ? gold : "#141414",
              color: activeLift === lift ? "#0a0a0a" : "#666",
              border: `1px solid ${activeLift === lift ? gold : "#2a2a2a"}`,
              borderRadius: 8, fontFamily: "inherit", fontSize: 11, fontWeight: 700,
              cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase", transition: "all 0.15s",
            }}>{lift}</button>
          ))}
        </div>
      </div>

      {/* Week selector */}
      <div style={S.sectionWrap}>
        <div style={S.label}>Week</div>
        <div style={{ display: "flex", gap: 8 }}>
          {WEEKS.map((w, i) => (
            <button key={i} onClick={() => setActiveWeek(i)} style={{
              flex: 1, padding: "10px 4px",
              background: activeWeek === i ? "#1e1e1e" : "#141414",
              color: activeWeek === i ? "#f0ece4" : "#555",
              border: `1px solid ${activeWeek === i ? gold : "#2a2a2a"}`,
              borderRadius: 8, fontFamily: "inherit", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>W{i + 1}</div>
              <div style={{ fontSize: 9, color: activeWeek === i ? gold : "#444", marginTop: 2 }}>
                {i === 3 ? "DELOAD" : i === 0 ? "5s" : i === 1 ? "3s" : "5/3/1"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Sets */}
      <div style={{ width: "100%", maxWidth: 480, padding: "0 20px 48px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <span style={{ fontSize: 10, letterSpacing: "0.2em", color: "#888", textTransform: "uppercase" }}>
              {activeLift} — {currentWeek.label}
            </span>
            <div style={{ fontSize: 11, color: gold, marginTop: 2 }}>{currentWeek.tag}</div>
          </div>
          {currentTM && (
            <div style={{ textAlign: "right" }}>
              {current1RM && tmMode === "repmax" && (
                <div style={{ fontSize: 10, color: "#555" }}>≈1RM {round(current1RM, unit)} {unit}</div>
              )}
              <div style={{ fontSize: 10, color: "#666" }}>Training Max</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: gold }}>{round(currentTM, unit)} {unit}</div>
            </div>
          )}
        </div>

        {/* Warm-up Sets */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#555", textTransform: "uppercase", marginBottom: 10 }}>
            Warm-up
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[{ pct: 0.40, reps: 5 }, { pct: 0.50, reps: 5 }, { pct: 0.60, reps: 5 }].map((wu, i) => {
              const w = currentTM ? round(currentTM * wu.pct, unit) : null;
              return (
                <div key={i} style={{
                  background: "#0d0d0d",
                  border: "1px solid #181818",
                  borderRadius: 10, padding: "11px 18px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: "#161616", border: "1px solid #222",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700, color: "#444",
                    }}>{i + 1}</div>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1, color: "#777" }}>
                        {wu.reps} <span style={{ fontSize: 11, fontWeight: 400, color: "#444" }}>REPS</span>
                      </div>
                      <div style={{ fontSize: 10, color: "#3a3a3a", marginTop: 3 }}>{Math.round(wu.pct * 100)}% of TM</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {w !== null ? (
                      <>
                        <div style={{ fontSize: 22, fontWeight: 600, color: "#666", lineHeight: 1 }}>{w}</div>
                        <div style={{ fontSize: 10, color: "#444" }}>{unit}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: "#2a2a2a" }}>— {unit}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Divider between warm-up and work sets */}
        <div style={{ height: 1, background: "#1e1e1e", marginBottom: 16 }} />

        {/* Work Sets */}
        <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#555", textTransform: "uppercase", marginBottom: 10 }}>
          Work Sets
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {currentWeek.sets.map((set, i) => {
            const isAmrap = set.reps.includes("+");
            const weight = currentTM ? round(currentTM * set.pct, unit) : null;
            return (
              <div key={i} style={{
                background: isAmrap ? "#141410" : "#111",
                border: `1px solid ${isAmrap ? gold + "44" : "#1e1e1e"}`,
                borderRadius: 10, padding: "16px 18px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: isAmrap ? gold + "22" : "#1a1a1a",
                    border: `1px solid ${isAmrap ? gold : "#2a2a2a"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: isAmrap ? gold : "#555",
                  }}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: isAmrap ? "#f0ece4" : "#ccc" }}>
                      {set.reps} <span style={{ fontSize: 12, fontWeight: 400, color: "#666" }}>REPS</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>{Math.round(set.pct * 100)}% of TM</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {weight !== null ? (
                    <>
                      <div style={{ fontSize: 28, fontWeight: 700, color: isAmrap ? gold : "#f0ece4", lineHeight: 1 }}>{weight}</div>
                      <div style={{ fontSize: 11, color: "#666" }}>{unit}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: "#333" }}>— {unit}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {activeWeek !== 3 && (
          <div style={{ marginTop: 16, padding: "12px 16px", background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 8, fontSize: 11, color: "#555", lineHeight: 1.6 }}>
            <span style={{ color: gold }}>+</span> denotes AMRAP — push your last set for max reps.
          </div>
        )}

        {/* BBB Section */}
        <div style={{ marginTop: 28 }}>
          <div style={{ height: 1, background: "#1e1e1e", marginBottom: 20 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#888", textTransform: "uppercase" }}>
                Boring But Big
              </div>
              <div style={{ fontSize: 11, color: "#c46b3a", marginTop: 2, letterSpacing: "0.05em" }}>
                5 × 10 @ 50% TM
              </div>
            </div>
            {currentTM && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "#666" }}>BBB Weight</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#c46b3a" }}>
                  {round(currentTM * 0.5, unit)} {unit}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1,2,3,4,5].map(i => {
              const bbbWeight = currentTM ? round(currentTM * 0.5, unit) : null;
              return (
                <div key={i} style={{
                  background: "#0f0f0f",
                  border: "1px solid #1a1a1a",
                  borderRadius: 10, padding: "14px 18px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: "#1a1208",
                      border: "1px solid #c46b3a44",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, color: "#c46b3a88",
                    }}>{i}</div>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: "#aaa" }}>
                        10 <span style={{ fontSize: 12, fontWeight: 400, color: "#555" }}>REPS</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#444", marginTop: 3 }}>50% of TM</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {bbbWeight !== null ? (
                      <>
                        <div style={{ fontSize: 28, fontWeight: 700, color: "#c46b3a", lineHeight: 1 }}>{bbbWeight}</div>
                        <div style={{ fontSize: 11, color: "#555" }}>{unit}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 13, color: "#333" }}>— {unit}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14, padding: "12px 16px", background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 8, fontSize: 11, color: "#555", lineHeight: 1.6 }}>
            Keep rest short (60–90s). These are meant to be uncomfortable, not maximal.
          </div>
        </div>

        {/* Increase TM */}
        <div style={{ marginTop: 36 }}>
          <div style={{ height: 1, background: "#1e1e1e", marginBottom: 20 }} />
          <div style={S.label}>Increase Training Max</div>
          <div style={{ fontSize: 11, color: "#555", lineHeight: 1.6, marginBottom: 12 }}>
            After a cycle, raise each lift by its own increment. Wendler suggests +{unit === "kg" ? "2.5" : "5"} {unit} upper body, +{unit === "kg" ? "5" : "10"} {unit} lower body.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visibleLifts.map(lift => {
              const tm = getTM(lift);
              const inc = increments[unit][lift];
              const ok = tm && inc > 0;
              return (
                <div key={lift} style={{
                  background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 10,
                  padding: "10px 12px", display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#888", textTransform: "uppercase", fontWeight: 700 }}>{lift}</div>
                    <div style={{ fontSize: 13, color: gold, marginTop: 2 }}>{tm ? `${round(tm, unit)} ${unit}` : "—"}</div>
                  </div>
                  <div style={{ position: "relative", width: 76 }}>
                    <input
                      type="number" inputMode="decimal" min="0" step="any" aria-label={`${lift} increment`}
                      value={inc || ""}
                      onChange={e => setIncrement(lift, e.target.value)}
                      style={{
                        width: "100%", boxSizing: "border-box", background: "#0a0a0a", border: "1px solid #222",
                        borderRadius: 6, padding: "8px 24px 8px 8px", color: "#f0ece4",
                        fontFamily: "inherit", fontSize: 14, fontWeight: 600, outline: "none",
                      }}
                    />
                    <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "#444" }}>{unit}</span>
                  </div>
                  <button onClick={() => increaseTM(lift)} disabled={!ok} style={{
                    padding: "9px 12px", borderRadius: 6, border: "none", fontFamily: "inherit",
                    fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                    background: ok ? gold : "#1a1a1a", color: ok ? "#0a0a0a" : "#444",
                    cursor: ok ? "pointer" : "default",
                  }}>+ Increase</button>
                </div>
              );
            })}
          </div>
          {undo && (
            <div style={{
              marginTop: 10, padding: "10px 14px", borderRadius: 8, background: "#141410",
              border: `1px solid ${gold}44`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            }}>
              <div style={{ fontSize: 11, color: "#aaa" }}>
                {undo.lift} TM → <span style={{ color: gold }}>{undo.newTM} {unit}</span> (+{undo.inc})
              </div>
              <button onClick={undoIncrease} style={{
                padding: "6px 12px", background: "transparent", color: gold, border: `1px solid ${gold}66`,
                borderRadius: 6, fontFamily: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}>Undo</button>
            </div>
          )}
        </div>

        {/* TM history */}
        <div style={{ marginTop: 36 }}>
          <div style={{ height: 1, background: "#1e1e1e", marginBottom: 20 }} />
          <div style={S.label}>Training Max History — {activeLift}</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {visibleLifts.map(lift => (
              <button key={lift} onClick={() => setActiveLift(lift)} style={{
                flex: 1, padding: "7px 4px", borderRadius: 8, fontFamily: "inherit", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer",
                background: activeLift === lift ? gold : "#141414",
                color: activeLift === lift ? "#0a0a0a" : "#666",
                border: `1px solid ${activeLift === lift ? gold : "#2a2a2a"}`,
              }}>{lift}</button>
            ))}
          </div>
          <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 10, padding: "14px 10px 8px" }}>
            <TmChart points={chartPoints} unit={unit} color={gold} />
          </div>
          {chartPoints.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              {chartPoints.slice(-6).map((p, i, arr) => {
                const idx = chartPoints.length - arr.length + i;
                const diff = idx > 0 ? round2(p.tm - chartPoints[idx - 1].tm) : null;
                return { p, diff };
              }).reverse().map(({ p, diff }, i) => (
                <div key={p.ts + "-" + i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666" }}>
                  <span>{new Date(p.ts).toLocaleDateString()}</span>
                  <span>
                    <span style={{ color: "#ccc" }}>{round2(p.tm)} {unit}</span>
                    {diff ? <span style={{ color: diff > 0 ? gold : "#c46b3a", marginLeft: 8 }}>{diff > 0 ? "+" : ""}{diff}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button onClick={logCurrentTMs} style={{
            marginTop: 12, width: "100%", padding: "11px 8px", background: "#141414", color: "#888",
            border: "1px solid #2a2a2a", borderRadius: 8, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>Log current TMs</button>
        </div>

        {/* Backup section */}
        <div style={{ marginTop: 36 }}>
          <div style={{ height: 1, background: "#1e1e1e", marginBottom: 20 }} />
          <div style={S.label}>Your Data</div>
          <div style={{ fontSize: 11, color: "#555", lineHeight: 1.6, marginBottom: 12 }}>
            Stored only on this device. Last backup:{" "}
            <span style={{ color: "#888" }}>{describeAge(lastBackup)}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleExport} style={{
              flex: 1, padding: "12px 8px", background: "#141414", color: "#f0ece4",
              border: `1px solid ${gold}66`, borderRadius: 8, fontFamily: "inherit",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>Export backup</button>
            <button onClick={() => fileInputRef.current && fileInputRef.current.click()} style={{
              flex: 1, padding: "12px 8px", background: "#141414", color: "#888",
              border: "1px solid #2a2a2a", borderRadius: 8, fontFamily: "inherit",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>Restore backup</button>
            <input
              ref={fileInputRef} type="file" accept="application/json,.json"
              onChange={handleImportFile} style={{ display: "none" }}
            />
          </div>
          {backupMsg && (
            <div style={{ fontSize: 11, marginTop: 10, color: backupMsg.ok ? gold : "#c46b3a" }}>
              {backupMsg.text}
            </div>
          )}
        </div>

        <div style={{ marginTop: 28, fontSize: 10, color: "#333", textAlign: "center" }}>
          v{__APP_VERSION__}
        </div>
      </div>
    </div>
  );
}
