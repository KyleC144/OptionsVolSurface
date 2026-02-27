import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface OptionRow {
  strike: number;
  bid: number | null;
  ask: number | null;
  lastPrice: number | null;
  impliedVolatility: number | null;
  volume: number | null;
  openInterest: number | null;
  inTheMoney: boolean | null;
  BSprice: number | null;
  delta: number | null;
  gamma: number | null;
  vega: number | null;
  theta: number | null;
}

interface VolPoint {
  strike: number;
  moneyness: number;
  dte: number;
  iv: number;
  expiry: string;
  type: "call" | "put";
  bid: number | null;
  ask: number | null;
  lastPrice: number | null;
  volume: number | null;
  openInterest: number | null;
  BSprice: number | null;
  delta: number | null;
  gamma: number | null;
  vega: number | null;
  theta: number | null;
}

interface SurfaceState {
  status: "idle" | "loading" | "ready" | "error";
  points: VolPoint[];
  spot: number | null;
  errorMsg: string;
  lastUpdate: Date | null;
}

interface Settings {
  tickers: string[];
  surfaceOpacity: number;
  showSurface: boolean;
  showScatter: boolean;
  showATMLine: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  tickers: ["SPY", "QQQ", "AAPL", "TSLA", "NVDA", "AMZN", "IWM", "GLD", "MSFT", "META"],
  surfaceOpacity: 0.72,
  showSurface: true,
  showScatter: true,
  showATMLine: true,
};

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function fetchAllOptions(ticker: string): Promise<{ spot: number; points: VolPoint[]; surface: any }> {
  const res = await fetch(`/api/options/${ticker}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  const spot: number = json.spot;
  const data: Record<string, { calls: OptionRow[]; puts: OptionRow[] }> = json.data;
  const now = Date.now();
  const points: VolPoint[] = [];
  for (const [date, chain] of Object.entries(data)) {
    const dteRaw = (new Date(date).getTime() - now) / (1000 * 60 * 60 * 24);
    const dte = Math.max(Math.round(dteRaw), 0);
    if (dteRaw < -1) continue;
    for (const c of chain.calls) {
      const iv = c.impliedVolatility;
      if (!iv || iv <= 0 || !c.strike) continue;
      points.push({ strike: c.strike, moneyness: c.strike/spot, dte, iv: iv*100, expiry: date, type:"call",
        bid:c.bid, ask:c.ask, lastPrice:c.lastPrice, volume:c.volume, openInterest:c.openInterest,
        BSprice:c.BSprice, delta:c.delta, gamma:c.gamma, vega:c.vega, theta:c.theta });
    }
    for (const p of chain.puts) {
      const iv = p.impliedVolatility;
      if (!iv || iv <= 0 || !p.strike) continue;
      points.push({ strike: p.strike, moneyness: p.strike/spot, dte, iv: iv*100, expiry: date, type:"put",
        bid:p.bid, ask:p.ask, lastPrice:p.lastPrice, volume:p.volume, openInterest:p.openInterest,
        BSprice:p.BSprice, delta:p.delta, gamma:p.gamma, vega:p.vega, theta:p.theta });
    }
  }
  const seen = new Set<string>();
  const deduped = points.filter(p => {
    if (!p.iv || p.iv <= 0.1) return false;
    const k = `${p.strike}-${p.dte}-${p.type}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  return { spot, points: deduped, surface: json.surface };
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function makeTooltip(p: VolPoint): string {
  const fmt = (v: number | null, dec = 4) => v != null ? v.toFixed(dec) : "—";
  const fmtD = (v: number | null) => v != null ? `$${v.toFixed(2)}` : "—";
  return [
    `<b style="color:#7dd8ff">${p.type.toUpperCase()}  K=${fmtD(p.strike)}  ${p.expiry}</b>`,
    `<span style="color:#aaa">DTE</span> ${p.dte}d   <span style="color:#aaa">IV</span> ${p.iv.toFixed(1)}%`,
    ``,
    `<span style="color:#fbbf24">── Market ──────────────</span>`,
    `Bid ${fmtD(p.bid)}   Ask ${fmtD(p.ask)}   Last ${fmtD(p.lastPrice)}`,
    `Vol ${p.volume ?? "—"}   OI ${p.openInterest ?? "—"}`,
    ``,
    `<span style="color:#4ade80">── Black-Scholes ───────</span>`,
    `BS Price  ${fmtD(p.BSprice)}`,
    `Δ Delta   ${fmt(p.delta, 4)}`,
    `Γ Gamma   ${fmt(p.gamma, 6)}`,
    `ν Vega    ${fmt(p.vega, 4)}`,
    `Θ Theta   ${fmt(p.theta, 4)}`,
  ].join("<br>");
}

// ─── Plotly traces ────────────────────────────────────────────────────────────
function buildPlotlyTraces(points: VolPoint[], surfaceData: any, settings: Settings) {
  const xs = points.map(p => p.moneyness);
  const ys = points.map(p => p.dte);
  const zs = points.map(p => p.iv);
  const texts = points.map(p => makeTooltip(p));
  const traces: any[] = [];

  if (settings.showSurface && surfaceData) {
    traces.push({
      type: "surface",
      x: surfaceData.x, y: surfaceData.y, z: surfaceData.z,
      colorscale: [
        [0,"#0d1f3c"],[0.2,"#0a3d6b"],[0.4,"#0066cc"],
        [0.6,"#00b4d8"],[0.75,"#90e0ef"],[0.88,"#ffd60a"],[1,"#ff4d4d"],
      ],
      opacity: settings.surfaceOpacity,
      showscale: true,
      colorbar: {
        title: { text:"IV %", font:{ color:"#8899bb", family:"IBM Plex Mono", size:11 } },
        tickfont: { color:"#8899bb", family:"IBM Plex Mono", size:10 },
        len:0.6, x:0.92, thickness:14, outlinecolor:"#1a2540", bordercolor:"#1a2540",
      },
      contours: { z:{ show:true, usecolormap:true, highlightcolor:"rgba(255,255,255,0.5)", width:1 } },
      hoverinfo: "skip",
      lighting: { ambient:0.7, diffuse:0.8, specular:0.3, roughness:0.5 },
      lightposition: { x:200, y:200, z:1000 },
    });
  }

  if (settings.showScatter) {
    traces.push({
      type: "scatter3d", mode:"markers",
      x: xs, y: ys, z: zs, text: texts,
      hovertemplate: "%{text}<extra></extra>",
      marker: {
        size:3.5, color:zs,
        colorscale:[[0,"#0a3d6b"],[0.5,"#00b4d8"],[1,"#ff4d4d"]],
        opacity:0.9, showscale:false, line:{ width:0 },
      },
    });
  }

  if (settings.showATMLine) {
    const atmDtes = [...new Set(ys)].sort((a,b) => a-b);
    const atmIVs  = atmDtes.map(t => {
      const near = points.filter(p => p.dte === t).sort((a,b) => Math.abs(a.moneyness-1)-Math.abs(b.moneyness-1));
      return near[0]?.iv ?? null;
    });
    const atm = atmDtes.map((t,i) => ({ t, iv:atmIVs[i] })).filter(x => x.iv != null);
    traces.push({
      type:"scatter3d", mode:"lines",
      x: atm.map(() => 1.0), y: atm.map(x => x.t), z: atm.map(x => x.iv),
      line:{ color:"#ffd60a", width:5 }, hoverinfo:"skip", name:"ATM",
    });
  }

  return traces;
}

const LAYOUT = {
  paper_bgcolor:"#060d1a", plot_bgcolor:"#060d1a",
  font:{ color:"#8899bb", family:"'IBM Plex Mono', monospace" },
  scene:{
    xaxis:{ title:{ text:"Moneyness  K/S", font:{ color:"#4a9eff", size:11 } }, tickfont:{ color:"#4a9eff", size:8 }, gridcolor:"#0e1e35", backgroundcolor:"#060d1a", showbackground:true, zeroline:false },
    yaxis:{ title:{ text:"Days to Expiry", font:{ color:"#4ade80", size:11 } }, tickfont:{ color:"#4ade80", size:8 }, gridcolor:"#0e1e35", backgroundcolor:"#060d1a", showbackground:true, zeroline:false },
    zaxis:{ title:{ text:"Implied Vol  %", font:{ color:"#fbbf24", size:11 } }, tickfont:{ color:"#fbbf24", size:8 }, gridcolor:"#0e1e35", backgroundcolor:"#060d1a", showbackground:true, zeroline:false },
    bgcolor:"#060d1a", camera:{ eye:{ x:1.5, y:-1.7, z:0.85 } },
    aspectmode:"manual", aspectratio:{ x:1.4, y:1.8, z:0.9 },
  },
  margin:{ l:0, r:0, t:20, b:0 }, showlegend:false,
  hoverlabel:{ bgcolor:"#0a1628", bordercolor:"#1e3a5f", font:{ family:"IBM Plex Mono", size:11, color:"#e2e8f0" }, align:"left" },
};

// ─── Settings Panel ───────────────────────────────────────────────────────────
function SettingsPanel({ settings, onChange, onClose }: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  const [tickerInput, setTickerInput] = useState("");
  const [tickerError, setTickerError] = useState("");

  const update = (patch: Partial<Settings>) => {
    onChange({ ...settings, ...patch });
  };

  const addTicker = () => {
    const t = tickerInput.trim().toUpperCase().replace(/[^A-Z.^-]/g, "");
    if (!t) return;
    if (settings.tickers.includes(t)) { setTickerError("Already in list"); return; }
    if (settings.tickers.length >= 20) { setTickerError("Max 20 tickers"); return; }
    update({ tickers: [...settings.tickers, t] });
    setTickerInput("");
    setTickerError("");
  };

  const removeTicker = (t: string) => {
    if (settings.tickers.length <= 1) return;
    update({ tickers: settings.tickers.filter(x => x !== t) });
  };

  const toggle = (key: "showSurface" | "showScatter" | "showATMLine") => {
    update({ [key]: !settings[key] });
  };

  return (
    <>
      {/* Panel */}
      <div style={{
        position:"fixed", top:0, right:0, bottom:0, width:360,
        background:"#070d1c", borderLeft:"1px solid #0e1e35",
        zIndex:101, display:"flex", flexDirection:"column",
        fontFamily:"'IBM Plex Mono',monospace",
        animation:"slideIn 0.22s cubic-bezier(0.16,1,0.3,1)",
        boxShadow:"-20px 0 60px rgba(0,0,0,0.6)",
      }}>
        {/* Panel header */}
        <div style={{ padding:"18px 24px 16px", borderBottom:"1px solid #0e1e35", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color:"#fff", letterSpacing:1 }}>
              SETTINGS
            </div>
            <div style={{ fontSize:8, color:"#1e3a5f", letterSpacing:3, marginTop:2 }}>DISPLAY CONFIGURATION</div>
          </div>
          <button onClick={onClose} style={{ background:"transparent", border:"1px solid #0e1e35", color:"#334155", width:28, height:28, borderRadius:2, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"inherit", transition:"all 0.15s" }}
            onMouseEnter={e => { (e.target as HTMLElement).style.borderColor="#4a9eff"; (e.target as HTMLElement).style.color="#4a9eff"; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.borderColor="#0e1e35"; (e.target as HTMLElement).style.color="#334155"; }}>
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:28 }}>

          {/* ── Visibility ── */}
          <section>
            <div style={{ fontSize:9, color:"#1e3a5f", letterSpacing:4, marginBottom:12 }}>LAYERS</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {([
                ["showSurface",  "Surface",       "Interpolated IV mesh"],
                ["showScatter",  "Scatter points","Raw option data dots"],
                ["showATMLine",  "ATM line",      "Term structure at K/S = 1.0"],
              ] as [keyof Settings, string, string][]).map(([key, label, desc]) => (
                <div key={key} onClick={() => toggle(key as any)}
                  style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", border:`1px solid ${settings[key] ? "#1a3050" : "#0a1220"}`, borderRadius:3, cursor:"pointer", transition:"all 0.15s", background: settings[key] ? "#0a1628" : "transparent" }}>
                  <div>
                    <div style={{ fontSize:11, color: settings[key] ? "#e2e8f0" : "#334155", letterSpacing:1 }}>{label}</div>
                    <div style={{ fontSize:9, color:"#1e3a5f", marginTop:2 }}>{desc}</div>
                  </div>
                  {/* Toggle pill */}
                  <div style={{ width:36, height:18, borderRadius:9, background: settings[key] ? "#0066cc" : "#0a1220", border:`1px solid ${settings[key] ? "#0099ff" : "#0e1e35"}`, position:"relative", transition:"all 0.2s", flexShrink:0 }}>
                    <div style={{ position:"absolute", top:2, left: settings[key] ? 18 : 2, width:12, height:12, borderRadius:"50%", background: settings[key] ? "#fff" : "#1e3a5f", transition:"left 0.2s" }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Surface opacity ── */}
          <section>
            <div style={{ fontSize:9, color:"#1e3a5f", letterSpacing:4, marginBottom:12 }}>
              SURFACE OPACITY
              <span style={{ color:"#4a9eff", marginLeft:8 }}>{Math.round(settings.surfaceOpacity * 100)}%</span>
            </div>
            <div style={{ position:"relative" }}>
              <input type="range" min={10} max={100} value={Math.round(settings.surfaceOpacity * 100)}
                onChange={e => update({ surfaceOpacity: parseInt(e.target.value) / 100 })}
                style={{ width:"100%", accentColor:"#0066cc", cursor:"pointer" }}
              />
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:8, color:"#1e3a5f", marginTop:4 }}>
                <span>10%</span><span>50%</span><span>100%</span>
              </div>
            </div>
          </section>

          {/* ── Tickers ── */}
          <section>
            <div style={{ fontSize:9, color:"#1e3a5f", letterSpacing:4, marginBottom:12 }}>
              QUICK-PICK TICKERS
              <span style={{ color:"#334155", marginLeft:8 }}>{settings.tickers.length}/20</span>
            </div>

            {/* Add ticker */}
            <div style={{ display:"flex", gap:6, marginBottom:10 }}>
              <input
                value={tickerInput}
                onChange={e => { setTickerInput(e.target.value.toUpperCase()); setTickerError(""); }}
                onKeyDown={e => e.key === "Enter" && addTicker()}
                placeholder="ADD TICKER"
                maxLength={6}
                style={{ flex:1, background:"#0a1628", border:`1px solid ${tickerError ? "#f87171" : "#1a3050"}`, color:"#e2e8f0", padding:"6px 10px", borderRadius:3, fontFamily:"inherit", fontSize:11, letterSpacing:2, outline:"none" }}
                onFocus={e => (e.target.style.borderColor = tickerError ? "#f87171" : "#4a9eff")}
                onBlur={e  => (e.target.style.borderColor = tickerError ? "#f87171" : "#1a3050")}
              />
              <button onClick={addTicker}
                style={{ background:"#0a3060", border:"1px solid #1a3050", color:"#4a9eff", padding:"6px 14px", borderRadius:3, cursor:"pointer", fontFamily:"inherit", fontSize:10, letterSpacing:2, transition:"all 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.background="#0d4080")}
                onMouseLeave={e => (e.currentTarget.style.background="#0a3060")}>
                + ADD
              </button>
            </div>
            {tickerError && <div style={{ fontSize:9, color:"#f87171", marginBottom:8, letterSpacing:1 }}>{tickerError}</div>}

            {/* Ticker list */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {settings.tickers.map(t => (
                <div key={t} style={{ display:"flex", alignItems:"center", gap:5, background:"#0a1628", border:"1px solid #1a3050", borderRadius:2, padding:"3px 8px 3px 10px" }}>
                  <span style={{ fontSize:10, color:"#8899bb", letterSpacing:1 }}>{t}</span>
                  <button onClick={() => removeTicker(t)}
                    style={{ background:"transparent", border:"none", color:"#1e3a5f", cursor: settings.tickers.length <= 1 ? "not-allowed" : "pointer", fontSize:11, padding:0, lineHeight:1, fontFamily:"inherit", transition:"color 0.15s" }}
                    onMouseEnter={e => { if (settings.tickers.length > 1) (e.target as HTMLElement).style.color="#f87171"; }}
                    onMouseLeave={e => (e.target as HTMLElement).style.color="#1e3a5f"}>
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button onClick={() => update({ tickers: DEFAULT_SETTINGS.tickers })}
              style={{ marginTop:12, background:"transparent", border:"1px solid #0e1e35", color:"#1e3a5f", padding:"5px 12px", borderRadius:2, cursor:"pointer", fontFamily:"inherit", fontSize:9, letterSpacing:2, transition:"all 0.15s", width:"100%" }}
              onMouseEnter={e => { (e.currentTarget.style.borderColor="#334155"); (e.currentTarget.style.color="#334155"); }}
              onMouseLeave={e => { (e.currentTarget.style.borderColor="#0e1e35"); (e.currentTarget.style.color="#1e3a5f"); }}>
              RESET TO DEFAULTS
            </button>
          </section>
        </div>


      </div>
    </>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState<SurfaceState>({
    status:"idle", points:[], spot:null, errorMsg:"", lastUpdate:null,
  });
  const [activeTicker, setActiveTicker] = useState("SPY");
  const [inputVal, setInputVal]         = useState("SPY");
  const [plotlyReady, setPlotlyReady]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings]         = useState<Settings>(DEFAULT_SETTINGS);
  const plotRef     = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const plotInitRef = useRef(false);
  const lastDataRef = useRef<{ points: VolPoint[]; surface: any } | null>(null);

  useEffect(() => {
    if ((window as any).Plotly) { setPlotlyReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.26.0/plotly.min.js";
    s.onload = () => setPlotlyReady(true);
    s.onerror = () => console.error("Failed to load Plotly");
    document.head.appendChild(s);
  }, []);

  const renderPlot = useCallback(async (points: VolPoint[], surface: any, currentSettings: Settings) => {
    if (!plotRef.current) return;
    const Plotly = (window as any).Plotly;
    const traces = buildPlotlyTraces(points, surface, currentSettings);
    if (!plotInitRef.current) {
      await Plotly.newPlot(plotRef.current, traces, LAYOUT, {
        responsive:true, displayModeBar:true, displaylogo:false,
        modeBarButtonsToRemove:["toImage","sendDataToCloud"],
      });
      plotInitRef.current = true;
    } else {
      await Plotly.react(plotRef.current, traces, LAYOUT);
    }
  }, []);

  const refresh = useCallback(async (ticker: string, currentSettings: Settings) => {
    if (!plotlyReady || !plotRef.current) return;
    setState(s => ({ ...s, status:"loading", errorMsg:"" }));
    try {
      const { spot, points, surface } = await fetchAllOptions(ticker);
      if (!surface) throw new Error("Surface data missing from server response.");
      if (points.length < 5) throw new Error("Not enough options data — market may be closed.");
      lastDataRef.current = { points, surface };
      await renderPlot(points, surface, currentSettings);
      setState({ status:"ready", points, spot, errorMsg:"", lastUpdate: new Date() });
    } catch (e: any) {
      setState(s => ({ ...s, status:"error", errorMsg: e.message || "Unknown error" }));
    }
  }, [plotlyReady, renderPlot]);

  // Re-render with new settings without re-fetching
  const applySettings = useCallback((newSettings: Settings) => {
    setSettings(newSettings);
    if (lastDataRef.current && plotlyReady) {
      renderPlot(lastDataRef.current.points, lastDataRef.current.surface, newSettings);
    }
  }, [plotlyReady, renderPlot]);

  useEffect(() => {
    if (!plotlyReady) return;
    plotInitRef.current = false;
    refresh(activeTicker, settings);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => refresh(activeTicker, settings), 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [activeTicker, plotlyReady]);

  const handleLoad = () => {
    const t = inputVal.trim().toUpperCase();
    if (t) setActiveTicker(t);
  };

  const statusColor = { idle:"#334155", loading:"#fbbf24", ready:"#4ade80", error:"#f87171" }[state.status];
  const statusLabel = { idle:"○  IDLE", loading:"◌  LOADING", ready:"●  LIVE", error:"✕  ERROR" }[state.status];

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:#060d1a; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-thumb { background:#1e3a5f; border-radius:2px; }
        @keyframes spin   { to { transform:rotate(360deg); } }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideIn { from{transform:translateX(100%)} to{transform:translateX(0)} }
        .chip:hover       { background:#0f2040!important; color:#7dd8ff!important; border-color:#2a4a6f!important; }
        .load-btn:hover   { filter:brightness(1.15); transform:translateY(-1px); }
        .load-btn:active  { transform:translateY(0); }
        input[type=range] { -webkit-appearance:none; height:3px; border-radius:2px; background:#0e1e35; outline:none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:#0066cc; cursor:pointer; border:2px solid #0099ff; }
      `}</style>

      <div style={{ minHeight:"100vh", background:"#060d1a", display:"flex", flexDirection:"column", fontFamily:"'IBM Plex Mono',monospace" }}>

        {/* Header */}
        <header style={{ padding:"14px 28px", borderBottom:"1px solid #0e1e35", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(90deg,#060d1a 50%,#080f1e)", position:"relative" }}>
          <div style={{ position:"absolute", inset:0, pointerEvents:"none", opacity:0.03, backgroundImage:"repeating-linear-gradient(0deg,#fff 0px,#fff 1px,transparent 1px,transparent 4px)" }} />

          <div style={{ animation:"fadeIn 0.5s ease" }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:"#fff", letterSpacing:1 }}>
              VOL<span style={{ color:"#4a9eff" }}>SURFACE</span>
            </div>
            <div style={{ fontSize:9, color:"#1e3a5f", letterSpacing:4, marginTop:2 }}>IMPLIED VOLATILITY  ·  REAL-TIME  ·  BLACK-SCHOLES GREEKS</div>
          </div>

          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <input value={inputVal} onChange={e => setInputVal(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleLoad()} placeholder="TICKER" maxLength={6}
              style={{ background:"#0a1628", border:"1px solid #1a3050", color:"#e2e8f0", padding:"7px 14px", borderRadius:3, fontFamily:"inherit", fontSize:13, letterSpacing:3, width:110, outline:"none", transition:"border-color 0.2s" }}
              onFocus={e => (e.target.style.borderColor="#4a9eff")}
              onBlur={e  => (e.target.style.borderColor="#1a3050")} />
            <button className="load-btn" onClick={handleLoad}
              style={{ background:"linear-gradient(135deg,#0050cc,#0099ff)", border:"none", color:"#fff", padding:"7px 22px", borderRadius:3, cursor:"pointer", fontFamily:"inherit", fontSize:11, letterSpacing:3, fontWeight:600, transition:"all 0.15s", boxShadow:"0 0 20px rgba(0,120,255,0.3)" }}>
              LOAD
            </button>
            {/* Settings button */}
            <button onClick={() => setShowSettings(true)}
              style={{ background: showSettings ? "#0a2040" : "transparent", border:`1px solid ${showSettings ? "#4a9eff" : "#0e1e35"}`, color: showSettings ? "#4a9eff" : "#334155", padding:"7px 14px", borderRadius:3, cursor:"pointer", fontFamily:"inherit", fontSize:11, letterSpacing:2, transition:"all 0.15s", display:"flex", alignItems:"center", gap:6 }}
              onMouseEnter={e => { if (!showSettings) { (e.currentTarget.style.borderColor="#2a4a6f"); (e.currentTarget.style.color="#7dd8ff"); }}}
              onMouseLeave={e => { if (!showSettings) { (e.currentTarget.style.borderColor="#0e1e35"); (e.currentTarget.style.color="#334155"); }}}>
              <span style={{ fontSize:13 }}>⚙</span> SETTINGS
            </button>
          </div>

          <div style={{ textAlign:"right", fontSize:11 }}>
            <div style={{ color:statusColor, letterSpacing:2 }}>
              {state.status === "loading"
                ? <span style={{ animation:"pulse 1s ease infinite" }}>{statusLabel}</span>
                : statusLabel}
            </div>
            {state.lastUpdate && <div style={{ color:"#1e3a5f", marginTop:5, fontSize:10 }}>{state.lastUpdate.toLocaleTimeString()}  ·  60s refresh</div>}
            {state.spot && state.status === "ready" && <div style={{ color:"#4ade80", marginTop:3, fontSize:11 }}>${state.spot.toFixed(2)}</div>}
          </div>
        </header>

        {/* Ticker chips */}
        <div style={{ padding:"9px 28px", display:"flex", gap:6, borderBottom:"1px solid #080f1e", flexWrap:"wrap", background:"#070e1c" }}>
          {settings.tickers.map(t => (
            <button key={t} className="chip" onClick={() => { setInputVal(t); setActiveTicker(t); }}
              style={{ background:activeTicker===t?"#0d2040":"transparent", border:`1px solid ${activeTicker===t?"#4a9eff":"#0e1e35"}`, color:activeTicker===t?"#4a9eff":"#334155", padding:"3px 11px", borderRadius:2, cursor:"pointer", fontFamily:"inherit", fontSize:10, letterSpacing:1, transition:"all 0.15s" }}>
              {t}
            </button>
          ))}
          <div style={{ marginLeft:"auto", fontSize:10, color:"#0e2040", alignSelf:"center" }}>
            {state.points.length > 0 && `${state.points.length} contracts`}
          </div>
        </div>

        {/* Plot area */}
        <div style={{ flex:1, position:"relative", minHeight:600 }}>
          {state.status === "loading" && (
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:18, background:"rgba(6,13,26,0.92)", zIndex:10 }}>
              <div style={{ width:36, height:36, border:"2px solid #0e1e35", borderTop:"2px solid #4a9eff", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />
              <div style={{ color:"#1e3a5f", fontSize:11, letterSpacing:4 }}>FETCHING OPTIONS + GREEKS</div>
            </div>
          )}
          {state.status === "error" && (
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:14, background:"#060d1a", zIndex:10, animation:"fadeIn 0.3s ease" }}>
              <div style={{ color:"#f87171", fontSize:13, letterSpacing:3, fontFamily:"'Syne',sans-serif", fontWeight:700 }}>ERROR</div>
              <div style={{ color:"#334155", fontSize:11, maxWidth:480, textAlign:"center", lineHeight:1.7, padding:"0 20px" }}>{state.errorMsg}</div>
              <button className="load-btn" onClick={() => refresh(activeTicker, settings)}
                style={{ background:"transparent", border:"1px solid #f87171", color:"#f87171", padding:"6px 20px", borderRadius:2, cursor:"pointer", fontFamily:"inherit", fontSize:10, letterSpacing:3 }}>
                RETRY
              </button>
            </div>
          )}
          <div ref={plotRef} style={{ width:"100%", height:"100%", minHeight:600 }} />
        </div>

        {/* Stats bar */}
        {state.status === "ready" && state.points.length > 0 && (() => {
          const ivs    = state.points.map(p => p.iv);
          const atm    = [...state.points].sort((a,b) => Math.abs(a.moneyness-1)-Math.abs(b.moneyness-1))[0];
          const deltas = state.points.map(p => p.delta).filter(d => d != null) as number[];
          const avgDelta = deltas.length ? (deltas.reduce((a,b)=>a+b,0)/deltas.length).toFixed(3) : "—";
          return (
            <div style={{ padding:"8px 28px", borderTop:"1px solid #080f1e", display:"flex", gap:28, background:"#070e1c", fontSize:10, letterSpacing:1, animation:"fadeIn 0.5s ease", flexWrap:"wrap" }}>
              {[
                ["ATM IV",    atm ? `${atm.iv.toFixed(1)}%` : "—"],
                ["ATM Δ",     atm?.delta != null ? atm.delta.toFixed(4) : "—"],
                ["ATM BS",    atm?.BSprice != null ? `$${atm.BSprice.toFixed(2)}` : "—"],
                ["MIN IV",    `${Math.min(...ivs).toFixed(1)}%`],
                ["MAX IV",    `${Math.max(...ivs).toFixed(1)}%`],
                ["AVG Δ",     avgDelta],
                ["CONTRACTS", `${state.points.length}`],
              ].map(([label, val]) => (
                <div key={label} style={{ display:"flex", gap:7, alignItems:"baseline" }}>
                  <span style={{ color:"#1e3a5f" }}>{label}</span>
                  <span style={{ color:"#8899bb", fontSize:12 }}>{val}</span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Footer */}
        <footer style={{ padding:"8px 28px", borderTop:"1px solid #080f1e", display:"flex", justifyContent:"space-between", fontSize:9, color:"#0e2040", letterSpacing:1 }}>
          <span>
            {[
              settings.showSurface && "surface",
              settings.showScatter && "scatter",
              settings.showATMLine && "ATM line",
            ].filter(Boolean).join(" · ") || "no layers"}
            {"  ·  "}opacity {Math.round(settings.surfaceOpacity * 100)}%
            {"  ·  "}r=5%
          </span>
          <span>Data: Yahoo Finance  ·  Not financial advice</span>
        </footer>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={applySettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}