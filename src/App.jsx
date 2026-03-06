import { useState, useEffect, useCallback } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#0a0e1a",
  panel: "#0f1629",
  border: "#1e2d4a",
  accent: "#00d4ff",
  green: "#00e676",
  red: "#ff4757",
  yellow: "#ffd32a",
  text: "#c8d6f0",
  muted: "#4a6080",
  highlight: "#162340",
};

// ─── Static market context data ───────────────────────────────────────────────
const SECTOR_DATA = [
  { name: "Technology", change: +2.4, strength: 92 },
  { name: "Financials", change: +1.1, strength: 74 },
  { name: "Healthcare", change: -0.8, strength: 38 },
  { name: "Energy", change: -1.9, strength: 22 },
  { name: "Consumer Disc.", change: +0.6, strength: 61 },
  { name: "Industrials", change: +0.3, strength: 55 },
];

// ─── Utility helpers ──────────────────────────────────────────────────────────
function fmtNum(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  const w = 120, h = 36;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function RSIGauge({ value }) {
  if (value == null) return <div style={{ color: C.muted, fontSize: 12 }}>—</div>;
  const clamp = Math.max(0, Math.min(100, value));
  const angle = (clamp / 100) * 180 - 90;
  const zone = clamp > 70 ? C.red : clamp < 30 ? C.green : C.accent;
  const nx = 60 + 38 * Math.cos((angle * Math.PI) / 180);
  const ny = 60 + 38 * Math.sin((angle * Math.PI) / 180);
  return (
    <div style={{ textAlign: "center" }}>
      <svg width="120" height="70" viewBox="0 0 120 70">
        <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke="#1e2d4a" strokeWidth="10" strokeLinecap="round" />
        <path
          d="M10,60 A50,50 0 0,1 110,60"
          fill="none" stroke={zone} strokeWidth="10"
          strokeLinecap="round" strokeDasharray="157"
          strokeDashoffset={157 - (clamp / 100) * 157}
          opacity="0.9"
        />
        <line x1="60" y1="60" x2={nx.toFixed(1)} y2={ny.toFixed(1)} stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="60" cy="60" r="4" fill={zone} />
        <text x="60" y="52" textAnchor="middle" fill={zone} fontSize="14" fontWeight="700">{value}</text>
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: -6, fontSize: 9, color: C.muted, padding: "0 6px" }}>
        <span>OS</span><span>Neutral</span><span>OB</span>
      </div>
    </div>
  );
}

function MACDViz({ macd, signal }) {
  const m = macd ?? 0, s = signal ?? 0;
  const barData = [m * 0.3, m * 0.5, m * 0.6, m * 0.75, m * 0.85, s, m];
  const maxAbs = Math.max(...barData.map(Math.abs), 0.01);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 50, padding: "0 4px" }}>
      {barData.map((b, i) => {
        const h = (Math.abs(b) / maxAbs) * 42;
        const isPos = b >= 0;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: isPos ? "flex-end" : "flex-start", height: "100%" }}>
            <div style={{ width: "100%", height: h, background: isPos ? C.green : C.red, opacity: i === barData.length - 1 ? 1 : 0.4, borderRadius: 2 }} />
          </div>
        );
      })}
    </div>
  );
}

function BollingerViz({ price, upper, lower, sma }) {
  if (!price || !upper || !lower || !sma) return <div style={{ color: C.muted, fontSize: 12 }}>Insufficient data</div>;
  const min = lower - 2, max = upper + 2;
  const range = max - min || 1;
  const toY = (v) => 80 - ((v - min) / range) * 70;
  return (
    <svg width="100%" height="90" viewBox="0 0 200 90" preserveAspectRatio="none">
      <rect x="0" y={toY(upper)} width="200" height={toY(lower) - toY(upper)} fill={C.accent} opacity="0.05" />
      <line x1="0" y1={toY(upper)} x2="200" y2={toY(upper)} stroke={C.accent} strokeWidth="1" strokeDasharray="4,2" opacity="0.5" />
      <line x1="0" y1={toY(lower)} x2="200" y2={toY(lower)} stroke={C.accent} strokeWidth="1" strokeDasharray="4,2" opacity="0.5" />
      <line x1="0" y1={toY(sma)} x2="200" y2={toY(sma)} stroke={C.yellow} strokeWidth="1" opacity="0.6" />
      <circle cx="100" cy={toY(price)} r="5" fill={C.accent} />
      <text x="164" y={toY(upper) - 3} fill={C.accent} fontSize="9" opacity="0.7">↑ {upper}</text>
      <text x="164" y={toY(lower) + 10} fill={C.accent} fontSize="9" opacity="0.7">↓ {lower}</text>
      <text x="4" y={toY(price) - 6} fill={C.accent} fontSize="10" fontWeight="bold">▶ {price}</text>
    </svg>
  );
}

function StatRow({ label, val, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 11 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: color || C.text, fontWeight: 700 }}>{val ?? "—"}</span>
    </div>
  );
}

function Panel({ children, style }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 18, ...style }}>
      {children}
    </div>
  );
}

function PanelTitle({ children }) {
  return <div style={{ fontSize: 9, letterSpacing: 3, color: C.muted, marginBottom: 14, textTransform: "uppercase" }}>{children}</div>;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [inputTicker, setInputTicker] = useState("AAPL");
  const [stockData, setStockData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("indicators");
  const [time, setTime] = useState(new Date());

  // R/R calculator state
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [shares, setShares] = useState("");
  const [rrResult, setRrResult] = useState(null);

  const marketData = { spx: { val: 5842.3, chg: +1.2 }, qqq: { val: 498.7, chg: +1.8 }, vix: 17.4 };

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchStock = useCallback(async (sym) => {
    const ticker = sym.trim().toUpperCase();
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setStockData(null);
    setRrResult(null);
    try {
      const res = await fetch(`/api/stock?symbol=${encodeURIComponent(ticker)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch data");
      setStockData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStock("AAPL"); }, [fetchStock]);

  const calcRR = () => {
    const e = parseFloat(entry), s = parseFloat(stop), tg = parseFloat(target), sh = parseFloat(shares) || 100;
    if (!e || !s || !tg) return;
    const risk = Math.abs(e - s);
    const reward = Math.abs(tg - e);
    const rr = reward / risk;
    setRrResult({ risk, reward, rr, pnlLoss: -risk * sh, pnlWin: reward * sh });
  };

  const ind = stockData?.indicators || {};
  const price = stockData?.price;

  const signal =
    ind.rsi > 50 && ind.macd > ind.macdSignal && price > ind.ema20
      ? "BULLISH"
      : ind.rsi < 45
      ? "BEARISH"
      : "NEUTRAL";
  const signalColor = signal === "BULLISH" ? C.green : signal === "BEARISH" ? C.red : C.yellow;

  const tabs = ["indicators", "risk/reward", "market context"];

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; }
        body {
          background: ${C.bg};
          color: ${C.text};
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 13px;
          -webkit-font-smoothing: antialiased;
        }
        input, button { font-family: inherit; }
        input:focus { outline: none; border-color: ${C.accent} !important; }
        button:hover { filter: brightness(1.15); }
        a { color: inherit; }
        @keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:.3} }
        @keyframes spin { to { transform: rotate(360deg); } }

        .hero-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }
        .indicators-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        .ma-col { grid-column: 1 / 3; }
        .rr-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .context-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .ma-inner {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        @media (max-width: 1024px) {
          .hero-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 900px) {
          .indicators-grid { grid-template-columns: 1fr 1fr; }
          .ma-col { grid-column: 1 / 3; }
          .ma-inner { grid-template-columns: 1fr 1fr; }
          .rr-grid { grid-template-columns: 1fr; }
          .context-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 600px) {
          .hero-grid { grid-template-columns: 1fr 1fr; }
          .indicators-grid { grid-template-columns: 1fr; }
          .ma-col { grid-column: 1 / 2; }
          .ma-inner { grid-template-columns: 1fr; }
          .hide-sm { display: none !important; }
        }
        @media (max-width: 400px) {
          .hero-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ── Top Bar ── */}
      <div style={{
        background: C.panel, borderBottom: `1px solid ${C.border}`,
        padding: "10px clamp(12px, 3vw, 24px)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100, gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ color: C.accent, fontWeight: 900, fontSize: "clamp(14px, 2.5vw, 18px)", letterSpacing: 3 }}>
            ◈ SWING<span style={{ color: C.text }}>DESK</span>
          </div>
          <div style={{ width: 1, height: 24, background: C.border }} />
          <form onSubmit={(e) => { e.preventDefault(); fetchStock(inputTicker); }} style={{ display: "flex", gap: 8 }}>
            <input
              value={inputTicker}
              onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
              placeholder="TICKER"
              style={{
                background: C.highlight, border: `1px solid ${C.border}`,
                color: C.accent, padding: "6px 12px", borderRadius: 4,
                width: 100, fontSize: 13, fontWeight: 700, letterSpacing: 2,
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                background: C.accent, border: "none", color: C.bg,
                padding: "6px 16px", borderRadius: 4, cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 700, fontSize: 12, letterSpacing: 1, opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "..." : "LOAD"}
            </button>
          </form>
          {stockData && (
            <div style={{ fontSize: 11, color: C.muted, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ color: C.accent, fontWeight: 900 }}>{stockData.ticker}</span>
              {stockData.companyName ? ` · ${stockData.companyName}` : ""}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          {[
            { label: "SPX", val: marketData.spx.val, chg: marketData.spx.chg },
            { label: "QQQ", val: marketData.qqq.val, chg: marketData.qqq.chg },
          ].map((m) => (
            <div key={m.label} className="hide-sm" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 2 }}>{m.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: m.chg > 0 ? C.green : C.red }}>
                {m.val} <span style={{ fontSize: 10 }}>{m.chg > 0 ? "▲" : "▼"}{Math.abs(m.chg)}%</span>
              </div>
            </div>
          ))}
          <div className="hide-sm" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: 2 }}>VIX</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: marketData.vix < 20 ? C.green : marketData.vix < 30 ? C.yellow : C.red }}>{marketData.vix}</div>
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>{time.toLocaleTimeString()}</div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ padding: "20px clamp(12px, 3vw, 24px)", maxWidth: 1400, margin: "0 auto" }}>

        {error && (
          <div style={{ background: "rgba(255,71,87,0.1)", border: `1px solid ${C.red}`, borderRadius: 6, padding: "12px 16px", marginBottom: 16, color: C.red, fontSize: 12 }}>
            ✗ {error} — check the ticker symbol and try again.
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: 80, color: C.muted }}>
            <div style={{ width: 32, height: 32, border: `2px solid ${C.border}`, borderTop: `2px solid ${C.accent}`, borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 12, letterSpacing: 2 }}>LOADING {inputTicker}...</div>
          </div>
        )}

        {!loading && stockData && (
          <>
            {/* Hero Row */}
            <div className="hero-grid">
              {[
                {
                  label: "PRICE",
                  value: `$${price}`,
                  sub: `${stockData.change >= 0 ? "+" : ""}${stockData.change} (${stockData.changePct >= 0 ? "+" : ""}${stockData.changePct}%)`,
                  color: stockData.change >= 0 ? C.green : C.red,
                },
                { label: "SIGNAL", value: signal, sub: "Composite score", color: signalColor },
                {
                  label: "VOLUME",
                  value: fmtNum(ind.volume),
                  sub: `Avg: ${fmtNum(ind.avgVolume)} · ${ind.volRatio}×`,
                  color: ind.volRatio > 1.2 ? C.green : C.muted,
                },
                {
                  label: "TREND",
                  value: price > ind.ema20 ? "ABOVE EMA20" : "BELOW EMA20",
                  sub: `ATR: ${ind.atr ?? "—"} · PE: ${stockData.pe ?? "—"}`,
                  color: price > ind.ema20 ? C.green : C.red,
                },
              ].map((card) => (
                <div
                  key={card.label}
                  style={{
                    background: C.panel, border: `1px solid ${C.border}`,
                    borderTop: `2px solid ${card.color}`, borderRadius: 6,
                    padding: "clamp(10px,2vw,16px) clamp(12px,2vw,20px)",
                  }}
                >
                  <div style={{ fontSize: 9, letterSpacing: 3, color: C.muted, marginBottom: 6 }}>{card.label}</div>
                  <div style={{ fontSize: "clamp(15px,2vw,22px)", fontWeight: 900, color: card.color, letterSpacing: 1 }}>{card.value}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Sparkline strip */}
            {stockData.sparkline?.length > 2 && (
              <Panel style={{ marginBottom: 16, padding: "14px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: 3, color: C.muted, marginBottom: 4 }}>30-DAY PRICE TREND</div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      L: ${Math.min(...stockData.sparkline).toFixed(2)} · H: ${Math.max(...stockData.sparkline).toFixed(2)}
                      {stockData.week52Low ? ` · 52W: $${stockData.week52Low}–$${stockData.week52High}` : ""}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <Sparkline data={stockData.sparkline} color={stockData.change >= 0 ? C.green : C.red} />
                  </div>
                  {stockData.marketCap && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 9, color: C.muted, letterSpacing: 2 }}>MARKET CAP</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{fmtNum(stockData.marketCap)}</div>
                    </div>
                  )}
                </div>
              </Panel>
            )}

            {/* Tab Bar */}
            <div style={{
              display: "flex", gap: 4, marginBottom: 16,
              background: C.panel, padding: 6, borderRadius: 6,
              border: `1px solid ${C.border}`, width: "fit-content", flexWrap: "wrap",
            }}>
              {tabs.map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding: "7px clamp(10px,2vw,20px)",
                  cursor: "pointer", fontSize: "clamp(10px,1.5vw,12px)", letterSpacing: 1, fontWeight: 600,
                  border: "none",
                  background: activeTab === tab ? C.accent : "transparent",
                  color: activeTab === tab ? C.bg : C.muted,
                  borderRadius: 4, transition: "all 0.2s",
                }}>
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>

            {/* INDICATORS TAB */}
            {activeTab === "indicators" && (
              <div className="indicators-grid">
                <Panel>
                  <PanelTitle>RSI (14)</PanelTitle>
                  <RSIGauge value={ind.rsi} />
                  <div style={{ marginTop: 12 }}>
                    <StatRow label="Status" val={ind.rsi > 70 ? "OVERBOUGHT" : ind.rsi < 30 ? "OVERSOLD" : "NEUTRAL ZONE"} color={ind.rsi > 70 ? C.red : ind.rsi < 30 ? C.green : C.yellow} />
                    <StatRow label="Momentum" val={ind.rsi > 55 ? "BULLISH ↑" : ind.rsi < 45 ? "BEARISH ↓" : "SIDEWAYS →"} color={ind.rsi > 55 ? C.green : ind.rsi < 45 ? C.red : C.yellow} />
                  </div>
                </Panel>

                <Panel>
                  <PanelTitle>MACD (12, 26, 9)</PanelTitle>
                  <MACDViz macd={ind.macd} signal={ind.macdSignal} />
                  <div style={{ marginTop: 10 }}>
                    <StatRow label="MACD Line" val={ind.macd} color={C.accent} />
                    <StatRow label="Signal Line" val={ind.macdSignal} color={C.yellow} />
                    <StatRow label="Histogram" val={ind.macdHistogram} color={(ind.macdHistogram ?? 0) >= 0 ? C.green : C.red} />
                    <StatRow label="Crossover" val={(ind.macd ?? 0) > (ind.macdSignal ?? 0) ? "BULLISH ↑" : "BEARISH ↓"} color={(ind.macd ?? 0) > (ind.macdSignal ?? 0) ? C.green : C.red} />
                  </div>
                </Panel>

                <Panel>
                  <PanelTitle>Bollinger Bands (20, 2σ)</PanelTitle>
                  <BollingerViz price={price} upper={ind.bbUpper} lower={ind.bbLower} sma={ind.bbSMA} />
                  <div style={{ marginTop: 8 }}>
                    <StatRow label="Upper Band" val={ind.bbUpper ? `$${ind.bbUpper}` : "—"} color={C.accent} />
                    <StatRow label="Middle (SMA20)" val={ind.bbSMA ? `$${ind.bbSMA}` : "—"} color={C.yellow} />
                    <StatRow label="Lower Band" val={ind.bbLower ? `$${ind.bbLower}` : "—"} color={C.accent} />
                    <StatRow label="Band Width" val={ind.bbUpper && ind.bbLower ? `${(ind.bbUpper - ind.bbLower).toFixed(2)} pts` : "—"} />
                  </div>
                </Panel>

                {/* Moving Averages — spans 2 cols */}
                <div className="ma-col" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 18 }}>
                  <PanelTitle>Moving Averages</PanelTitle>
                  <div className="ma-inner">
                    {[
                      { label: "20 EMA", val: ind.ema20, above: price > ind.ema20 },
                      { label: "50 SMA", val: ind.ema50, above: price > ind.ema50 },
                      { label: "200 SMA", val: ind.sma200, above: price > ind.sma200 },
                    ].map((ma) => (
                      <div key={ma.label} style={{ background: C.highlight, borderRadius: 6, padding: "12px 14px", borderLeft: `3px solid ${ma.above ? C.green : C.red}` }}>
                        <div style={{ fontSize: 9, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>{ma.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{ma.val ? `$${ma.val}` : "—"}</div>
                        <div style={{ fontSize: 10, marginTop: 4, color: ma.above ? C.green : C.red }}>
                          {ma.above ? "▲ PRICE ABOVE" : "▼ PRICE BELOW"}
                        </div>
                        {stockData.sparkline?.length > 2 && (
                          <div style={{ marginTop: 8 }}>
                            <Sparkline data={stockData.sparkline} color={ma.above ? C.green : C.red} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <Panel>
                  <PanelTitle>Setup Checklist</PanelTitle>
                  {[
                    { label: "Price > 20 EMA", pass: price > ind.ema20 },
                    { label: "Price > 50 SMA", pass: price > ind.ema50 },
                    { label: "RSI 40–70", pass: ind.rsi >= 40 && ind.rsi <= 70 },
                    { label: "MACD > Signal", pass: (ind.macd ?? 0) > (ind.macdSignal ?? 0) },
                    { label: "Vol > Avg", pass: ind.volRatio > 1 },
                    { label: "VIX < 25", pass: marketData.vix < 25 },
                  ].map((item) => (
                    <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 11 }}>
                      <span style={{ color: C.text }}>{item.label}</span>
                      <span style={{ color: item.pass ? C.green : C.red, fontWeight: 700 }}>{item.pass ? "✓ PASS" : "✗ FAIL"}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 12, padding: "10px 14px", background: C.highlight, borderRadius: 4, borderLeft: `3px solid ${signalColor}` }}>
                    <span style={{ fontSize: 9, color: C.muted, letterSpacing: 2 }}>OVERALL: </span>
                    <span style={{ color: signalColor, fontWeight: 900, fontSize: 14 }}>{signal}</span>
                  </div>
                </Panel>
              </div>
            )}

            {/* RISK/REWARD TAB */}
            {activeTab === "risk/reward" && (
              <div className="rr-grid">
                <Panel>
                  <PanelTitle>Trade Parameters</PanelTitle>
                  {[
                    { label: "Entry Price ($)", val: entry, set: setEntry },
                    { label: "Stop Loss ($)", val: stop, set: setStop },
                    { label: "Target Price ($)", val: target, set: setTarget },
                    { label: "Number of Shares", val: shares, set: setShares },
                  ].map((f) => (
                    <div key={f.label} style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 10, letterSpacing: 2, color: C.muted, display: "block", marginBottom: 5 }}>{f.label}</label>
                      <input
                        type="number"
                        value={f.val}
                        onChange={(e) => f.set(e.target.value)}
                        placeholder="0.00"
                        style={{
                          width: "100%", background: C.highlight, border: `1px solid ${C.border}`,
                          color: C.accent, padding: "8px 12px", borderRadius: 4, fontSize: 14, fontWeight: 700,
                        }}
                      />
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 12 }}>
                    Current price: <span style={{ color: C.accent }}>${price}</span>
                  </div>
                  <button
                    onClick={calcRR}
                    style={{
                      width: "100%", background: C.accent, border: "none", color: C.bg,
                      padding: 11, borderRadius: 4, cursor: "pointer", fontWeight: 900,
                      fontSize: 13, letterSpacing: 2,
                    }}
                  >
                    CALCULATE R/R
                  </button>
                </Panel>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {rrResult ? (
                    <>
                      <Panel>
                        <PanelTitle>Results</PanelTitle>
                        {[
                          { label: "Risk / Share", val: `$${rrResult.risk.toFixed(2)}`, color: C.red },
                          { label: "Reward / Share", val: `$${rrResult.reward.toFixed(2)}`, color: C.green },
                          { label: "R/R Ratio", val: `1 : ${rrResult.rr.toFixed(2)}`, color: rrResult.rr >= 2 ? C.green : rrResult.rr >= 1 ? C.yellow : C.red },
                          { label: "Max Loss", val: `$${Math.abs(rrResult.pnlLoss).toFixed(2)}`, color: C.red },
                          { label: "Max Gain", val: `$${rrResult.pnlWin.toFixed(2)}`, color: C.green },
                        ].map((r) => (
                          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 12, color: C.muted }}>{r.label}</span>
                            <span style={{ fontSize: 15, fontWeight: 900, color: r.color }}>{r.val}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: 8, padding: "12px 16px", borderRadius: 6, background: rrResult.rr >= 2 ? "rgba(0,230,118,0.08)" : "rgba(255,71,87,0.08)", border: `1px solid ${rrResult.rr >= 2 ? C.green : C.red}` }}>
                          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>VERDICT</div>
                          <div style={{ fontSize: 14, fontWeight: 900, color: rrResult.rr >= 2 ? C.green : C.red }}>
                            {rrResult.rr >= 2 ? "✓ FAVORABLE SETUP" : rrResult.rr >= 1 ? "⚠ MARGINAL — RECONSIDER" : "✗ POOR R/R — AVOID"}
                          </div>
                          <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                            {rrResult.rr >= 2 ? "Meets the 1:2 minimum R/R threshold." : "Aim for at least 1:2 before entering."}
                          </div>
                        </div>
                      </Panel>
                      <Panel>
                        <PanelTitle>Visual R/R Scale</PanelTitle>
                        <div style={{ display: "flex", gap: 4, height: 28, borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ flex: 1, background: C.red, opacity: 0.8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>RISK 1</div>
                          <div style={{ flex: rrResult.rr, background: C.green, opacity: 0.8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>REWARD {rrResult.rr.toFixed(1)}</div>
                        </div>
                      </Panel>
                    </>
                  ) : (
                    <Panel style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, minHeight: 200 }}>
                      <div style={{ fontSize: 32, opacity: 0.3 }}>◈</div>
                      <div style={{ fontSize: 12, color: C.muted, textAlign: "center", letterSpacing: 1 }}>
                        Enter trade parameters<br />and calculate R/R
                      </div>
                    </Panel>
                  )}
                </div>
              </div>
            )}

            {/* MARKET CONTEXT TAB */}
            {activeTab === "market context" && (
              <div className="context-grid">
                <Panel>
                  <PanelTitle>Stock News · {stockData.ticker}</PanelTitle>
                  {stockData.news?.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {stockData.news.map((n, i) => (
                        <a
                          key={i}
                          href={n.url || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: "12px 14px", background: C.highlight, borderRadius: 5,
                            borderLeft: `3px solid ${C.accent}`,
                            display: "flex", gap: 12, alignItems: "flex-start",
                            textDecoration: "none",
                          }}
                        >
                          <div style={{ minWidth: 42, fontSize: 9, color: C.muted, marginTop: 2 }}>{n.time}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: C.text, lineHeight: 1.5 }}>{n.headline}</div>
                            {n.publisher && <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>{n.publisher}</div>}
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: C.muted, fontSize: 12, padding: "20px 0" }}>No recent news found for {stockData.ticker}.</div>
                  )}
                </Panel>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <Panel>
                    <PanelTitle>Sector Rotation</PanelTitle>
                    {SECTOR_DATA.map((s) => (
                      <div key={s.name} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
                          <span style={{ color: C.text }}>{s.name}</span>
                          <span style={{ color: s.change > 0 ? C.green : C.red, fontWeight: 700 }}>
                            {s.change > 0 ? "+" : ""}{s.change}%
                          </span>
                        </div>
                        <div style={{ height: 6, background: C.highlight, borderRadius: 3 }}>
                          <div style={{ height: "100%", width: `${s.strength}%`, background: s.strength > 60 ? C.green : s.strength > 40 ? C.yellow : C.red, borderRadius: 3, transition: "width 0.8s ease" }} />
                        </div>
                      </div>
                    ))}
                  </Panel>

                  <Panel>
                    <PanelTitle>Market Regime</PanelTitle>
                    {[
                      { label: "Trend", val: "UPTREND", color: C.green },
                      { label: "Volatility (VIX)", val: marketData.vix < 20 ? "LOW" : marketData.vix < 30 ? "MEDIUM" : "HIGH", color: marketData.vix < 20 ? C.green : marketData.vix < 30 ? C.yellow : C.red },
                      { label: "Breadth", val: "BROAD PARTICIPATION", color: C.green },
                      { label: "Risk Appetite", val: "RISK-ON", color: C.green },
                      { label: "Swing Conditions", val: signal === "BULLISH" ? "FAVORABLE" : signal === "BEARISH" ? "UNFAVORABLE" : "MIXED", color: signalColor },
                    ].map((r) => (
                      <StatRow key={r.label} label={r.label} val={r.val} color={r.color} />
                    ))}
                  </Panel>
                </div>
              </div>
            )}
          </>
        )}

        {!loading && !stockData && !error && (
          <div style={{ textAlign: "center", padding: 80, color: C.muted }}>
            <div style={{ fontSize: 48, opacity: 0.2, marginBottom: 16 }}>◈</div>
            <div style={{ fontSize: 14, letterSpacing: 2 }}>Enter a ticker symbol and press LOAD</div>
          </div>
        )}

        <div style={{ marginTop: 40, paddingTop: 16, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.muted, textAlign: "center", letterSpacing: 1 }}>
          SWINGDESK · Data via Yahoo Finance · For informational purposes only · Not financial advice
        </div>
      </div>
    </>
  );
}


