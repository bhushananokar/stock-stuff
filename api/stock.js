// Vercel serverless function — fetches real data from Yahoo Finance public APIs
// No third-party library needed; uses native fetch (Node 18+).

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

// ─── Indicator helpers ────────────────────────────────────────────────────────

function calcEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
  return parseFloat(ema.toFixed(2));
}

function calcSMA(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return parseFloat((slice.reduce((a, b) => a + b, 0) / period).toFixed(2));
}

function calcRSI(data, period = 14) {
  if (data.length <= period) return null;
  const changes = data.slice(1).map((v, i) => v - data[i]);
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss -= changes[i];
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period; i < changes.length; i++) {
    const g = changes[i] > 0 ? changes[i] : 0;
    const l = changes[i] < 0 ? -changes[i] : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  return parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(1));
}

function calcMACD(data) {
  if (data.length < 35) return { macd: null, signal: null, histogram: null };
  const k12 = 2 / 13, k26 = 2 / 27;
  let e12 = data.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  let e26 = data.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
  for (let i = 12; i < 26; i++) e12 = data[i] * k12 + e12 * (1 - k12);
  const macdSeries = [];
  for (let i = 26; i < data.length; i++) {
    e12 = data[i] * k12 + e12 * (1 - k12);
    e26 = data[i] * k26 + e26 * (1 - k26);
    macdSeries.push(e12 - e26);
  }
  const macdVal = macdSeries[macdSeries.length - 1];
  let signalVal = macdSeries.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  const ks = 2 / 10;
  for (let i = 9; i < macdSeries.length; i++)
    signalVal = macdSeries[i] * ks + signalVal * (1 - ks);
  return {
    macd: parseFloat(macdVal.toFixed(3)),
    signal: parseFloat(signalVal.toFixed(3)),
    histogram: parseFloat((macdVal - signalVal).toFixed(3)),
  };
}

function calcBB(data, period = 20) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(slice.map((v) => (v - sma) ** 2).reduce((a, b) => a + b, 0) / period);
  return {
    upper: parseFloat((sma + 2 * stdDev).toFixed(2)),
    lower: parseFloat((sma - 2 * stdDev).toFixed(2)),
    sma: parseFloat(sma.toFixed(2)),
  };
}

function calcATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  const recent = trs.slice(-period);
  return parseFloat((recent.reduce((a, b) => a + b, 0) / period).toFixed(2));
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS for local dev
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { symbol } = req.query;
  if (!symbol || typeof symbol !== "string") {
    return res.status(400).json({ error: "Missing symbol parameter" });
  }
  const ticker = symbol.trim().toUpperCase();

  try {
    // ── 1. Chart data: 1 year of daily OHLCV + live quote ──────────────────
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y&includePrePost=false`;
    const chartRes = await fetch(chartUrl, { headers: YF_HEADERS });
    if (!chartRes.ok) {
      throw new Error(`Yahoo Finance returned ${chartRes.status} for "${ticker}". Check the ticker symbol.`);
    }
    const chartJson = await chartRes.json();
    const result = chartJson?.chart?.result?.[0];
    if (!result) {
      const errMsg = chartJson?.chart?.error?.description || `No data found for "${ticker}"`;
      return res.status(404).json({ error: errMsg });
    }

    const timestamps = result.timestamp || [];
    const ohlcv = result.indicators?.quote?.[0] || {};
    const rawCloses = ohlcv.close || [];
    const rawHighs = ohlcv.high || [];
    const rawLows = ohlcv.low || [];
    const rawVolumes = ohlcv.volume || [];
    const meta = result.meta || {};

    // Filter out null values (market holidays / gaps)
    const valid = [];
    for (let i = 0; i < rawCloses.length; i++) {
      if (rawCloses[i] != null) {
        valid.push({ close: rawCloses[i], high: rawHighs[i] ?? rawCloses[i], low: rawLows[i] ?? rawCloses[i], volume: rawVolumes[i] ?? 0 });
      }
    }

    const closes = valid.map((d) => d.close);
    const highs = valid.map((d) => d.high);
    const lows = valid.map((d) => d.low);
    const volumes = valid.map((d) => d.volume);

    // ── 2. Summary / company info ──────────────────────────────────────────
    const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=price%2CsummaryProfile%2CdefaultKeyStatistics`;
    let companyName = meta.longName || meta.shortName || ticker;
    let sector = null;
    let pe = null;
    let marketCap = null;

    try {
      const summaryRes = await fetch(summaryUrl, { headers: YF_HEADERS });
      if (summaryRes.ok) {
        const summaryJson = await summaryRes.json();
        const priceModule = summaryJson?.quoteSummary?.result?.[0]?.price;
        const profileModule = summaryJson?.quoteSummary?.result?.[0]?.summaryProfile;
        const statsModule = summaryJson?.quoteSummary?.result?.[0]?.defaultKeyStatistics;
        if (priceModule) {
          companyName = priceModule.longName || priceModule.shortName || companyName;
          marketCap = priceModule.marketCap?.raw ?? null;
          pe = priceModule.trailingPE?.raw ? parseFloat(priceModule.trailingPE.raw.toFixed(1)) : null;
        }
        if (profileModule) sector = profileModule.sector || null;
        if (!pe && statsModule?.trailingEps?.raw && closes.length) {
          const trailingPE = closes[closes.length - 1] / statsModule.trailingEps.raw;
          if (trailingPE > 0 && trailingPE < 1000) pe = parseFloat(trailingPE.toFixed(1));
        }
      }
    } catch (_) {
      // Non-fatal — continue without summary data
    }

    // ── 3. News ─────────────────────────────────────────────────────────────
    let newsItems = [];
    try {
      const newsUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=6&quotesCount=0&enableFuzzyQuery=false`;
      const newsRes = await fetch(newsUrl, { headers: YF_HEADERS });
      if (newsRes.ok) {
        const newsJson = await newsRes.json();
        newsItems = (newsJson?.news || []).slice(0, 6).map((n) => ({
          time: n.providerPublishTime
            ? new Date(n.providerPublishTime * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
            : "--:--",
          headline: n.title || "",
          url: n.link || null,
          publisher: n.publisher || null,
        }));
      }
    } catch (_) {
      // Non-fatal
    }

    // ── 4. Compute indicators ────────────────────────────────────────────────
    const price = parseFloat((meta.regularMarketPrice ?? closes[closes.length - 1]).toFixed(2));
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? closes[closes.length - 2] ?? price;
    const change = parseFloat((price - prevClose).toFixed(2));
    const changePct = parseFloat(((change / prevClose) * 100).toFixed(2));

    const avgVol = Math.round(volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length));
    const currentVol = meta.regularMarketVolume ?? volumes[volumes.length - 1] ?? 0;
    const volRatio = avgVol > 0 ? parseFloat((currentVol / avgVol).toFixed(2)) : 1;

    const macdData = calcMACD(closes);
    const bb = calcBB(closes);

    const indicators = {
      rsi: calcRSI(closes),
      macd: macdData.macd,
      macdSignal: macdData.signal,
      macdHistogram: macdData.histogram,
      ema20: calcEMA(closes, 20),
      ema50: calcEMA(closes, 50),
      sma200: calcSMA(closes, 200),
      bbUpper: bb?.upper ?? null,
      bbLower: bb?.lower ?? null,
      bbSMA: bb?.sma ?? null,
      atr: calcATR(highs, lows, closes),
      volume: currentVol,
      avgVolume: avgVol,
      volRatio,
    };

    // Sparkline: last 30 clean closes
    const sparkline = closes.slice(-30).map((v) => parseFloat(v.toFixed(2)));

    return res.status(200).json({
      ticker,
      companyName,
      price,
      change,
      changePct,
      dayHigh: meta.regularMarketDayHigh ?? null,
      dayLow: meta.regularMarketDayLow ?? null,
      week52High: meta.fiftyTwoWeekHigh ?? null,
      week52Low: meta.fiftyTwoWeekLow ?? null,
      marketCap,
      pe,
      sector,
      indicators,
      sparkline,
      news: newsItems,
    });
  } catch (err) {
    console.error(`[stock API] ${ticker}:`, err.message);
    return res.status(500).json({ error: err.message || "Failed to fetch stock data" });
  }
}
