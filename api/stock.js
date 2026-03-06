import yahooFinance from "yahoo-finance2";

export default async function handler(req, res) {
  const { symbol } = req.query;

  if (!symbol || typeof symbol !== "string") {
    return res.status(400).json({ error: "Missing symbol parameter" });
  }

  const ticker = symbol.trim().toUpperCase();

  try {
    // Fetch quote, historical price data (90 days for indicators), and news
    const [quote, historical, news] = await Promise.all([
      yahooFinance.quote(ticker),
      yahooFinance.historical(ticker, {
        period1: (() => {
          const d = new Date();
          d.setDate(d.getDate() - 200); // need 200 days for SMA200
          return d.toISOString().split("T")[0];
        })(),
        interval: "1d",
      }),
      yahooFinance.search(ticker, { newsCount: 6, quotesCount: 0 }),
    ]);

    if (!quote || !historical || historical.length < 10) {
      return res.status(404).json({ error: `No data found for symbol: ${ticker}` });
    }

    // Sort historical by date ascending
    const sorted = [...historical].sort((a, b) => new Date(a.date) - new Date(b.date));
    const closes = sorted.map((d) => d.close).filter(Boolean);
    const volumes = sorted.map((d) => d.volume).filter(Boolean);

    // --- Indicator calculations ---

    // EMA helper
    const calcEMA = (data, period) => {
      if (data.length < period) return null;
      const k = 2 / (period + 1);
      let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let i = period; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
      }
      return parseFloat(ema.toFixed(2));
    };

    // SMA helper
    const calcSMA = (data, period) => {
      if (data.length < period) return null;
      const slice = data.slice(-period);
      return parseFloat((slice.reduce((a, b) => a + b, 0) / period).toFixed(2));
    };

    // RSI (14)
    const calcRSI = (data, period = 14) => {
      if (data.length <= period) return null;
      const changes = data.slice(1).map((v, i) => v - data[i]);
      let gains = 0, losses = 0;
      for (let i = 0; i < period; i++) {
        if (changes[i] > 0) gains += changes[i];
        else losses -= changes[i];
      }
      let avgGain = gains / period;
      let avgLoss = losses / period;
      for (let i = period; i < changes.length; i++) {
        const g = changes[i] > 0 ? changes[i] : 0;
        const l = changes[i] < 0 ? -changes[i] : 0;
        avgGain = (avgGain * (period - 1) + g) / period;
        avgLoss = (avgLoss * (period - 1) + l) / period;
      }
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
    };

    // MACD (12, 26, 9)
    const calcMACD = (data) => {
      const ema12 = calcEMA(data, 12);
      const ema26 = calcEMA(data, 26);
      if (!ema12 || !ema26) return { macd: null, signal: null, histogram: null };
      // For signal line, compute MACD series then EMA(9) of it
      const macdSeries = [];
      const k12 = 2 / 13, k26 = 2 / 27;
      let e12 = data.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
      let e26 = data.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
      for (let i = 12; i < 26; i++) e12 = data[i] * k12 + e12 * (1 - k12);
      for (let i = 26; i < data.length; i++) {
        e12 = data[i] * k12 + e12 * (1 - k12);
        e26 = data[i] * k26 + e26 * (1 - k26);
        macdSeries.push(parseFloat((e12 - e26).toFixed(4)));
      }
      const macdVal = macdSeries[macdSeries.length - 1];
      const signalVal = macdSeries.length >= 9 ? calcEMA(macdSeries, 9) : macdVal;
      return {
        macd: parseFloat(macdVal.toFixed(3)),
        signal: parseFloat((signalVal || macdVal).toFixed(3)),
        histogram: parseFloat((macdVal - (signalVal || macdVal)).toFixed(3)),
      };
    };

    // Bollinger Bands (20, 2)
    const calcBB = (data, period = 20) => {
      if (data.length < period) return null;
      const slice = data.slice(-period);
      const sma = slice.reduce((a, b) => a + b, 0) / period;
      const stdDev = Math.sqrt(slice.map((v) => (v - sma) ** 2).reduce((a, b) => a + b, 0) / period);
      return {
        upper: parseFloat((sma + 2 * stdDev).toFixed(2)),
        lower: parseFloat((sma - 2 * stdDev).toFixed(2)),
        sma: parseFloat(sma.toFixed(2)),
      };
    };

    // ATR (14)
    const calcATR = (data, period = 14) => {
      if (data.length < period + 1) return null;
      const slice = data.slice(-(period + 1));
      const trs = slice.slice(1).map((d, i) => {
        const prev = slice[i];
        return Math.max(
          d.high - d.low,
          Math.abs(d.high - prev.close),
          Math.abs(d.low - prev.close)
        );
      });
      return parseFloat((trs.reduce((a, b) => a + b, 0) / period).toFixed(2));
    };

    // Volume average
    const avgVol = Math.round(volumes.slice(-20).reduce((a, b) => a + b, 0) / 20);
    const currentVol = quote.regularMarketVolume || volumes[volumes.length - 1] || 0;
    const volRatio = avgVol > 0 ? parseFloat((currentVol / avgVol).toFixed(2)) : 1;

    const price = parseFloat((quote.regularMarketPrice || closes[closes.length - 1]).toFixed(2));
    const ema20 = calcEMA(closes, 20);
    const ema50 = calcEMA(closes, 50);
    const sma200 = calcSMA(closes, 200);
    const rsi = calcRSI(closes);
    const macdData = calcMACD(closes);
    const bb = calcBB(closes);
    const atr = calcATR(sorted.slice(-(15)));

    // Sparkline data (last 30 closes)
    const sparkline = closes.slice(-30).map((v) => parseFloat(v.toFixed(2)));

    // Format news
    const formattedNews = (news?.news || []).slice(0, 6).map((n) => ({
      time: n.providerPublishTime
        ? new Date(n.providerPublishTime * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
        : "--:--",
      headline: n.title,
      url: n.link,
      publisher: n.publisher,
      sentiment: "neutral",
      impact: "MED",
    }));

    return res.status(200).json({
      ticker,
      companyName: quote.longName || quote.shortName || ticker,
      price,
      change: parseFloat((quote.regularMarketChange || 0).toFixed(2)),
      changePct: parseFloat((quote.regularMarketChangePercent || 0).toFixed(2)),
      dayHigh: quote.regularMarketDayHigh,
      dayLow: quote.regularMarketDayLow,
      week52High: quote.fiftyTwoWeekHigh,
      week52Low: quote.fiftyTwoWeekLow,
      marketCap: quote.marketCap,
      pe: quote.trailingPE ? parseFloat(quote.trailingPE.toFixed(1)) : null,
      sector: quote.sector || null,
      indicators: {
        rsi,
        macd: macdData.macd,
        macdSignal: macdData.signal,
        macdHistogram: macdData.histogram,
        ema20,
        ema50,
        sma200,
        bbUpper: bb?.upper || null,
        bbLower: bb?.lower || null,
        bbSMA: bb?.sma || null,
        atr,
        volume: currentVol,
        avgVolume: avgVol,
        volRatio,
      },
      sparkline,
      news: formattedNews,
    });
  } catch (err) {
    console.error(`[stock API error] ${ticker}:`, err.message);
    return res.status(500).json({ error: err.message || "Failed to fetch stock data" });
  }
}
