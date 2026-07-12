/**
 * Multi-Timeframe Matrix — increases accuracy by scoring every signal
 * through the lens of ALL higher timeframes simultaneously.
 *
 * Core principle (from IvanG OS + analysis_findings.md):
 *  4h overrules 1h overrules 15m/30m.
 *  A 15m buy signal when 4h is bullish = amplified (HTF alignment).
 *  A 15m buy signal when 4h is bearish = rejected (counter-trend noise).
 *
 * Fetch model: Binance public klines, 30 candles per TF per pair.
 * Latency: 3 parallel fetches (4h / 1h / signal TF), sub-2s total.
 */

export type MtfContext = {
  alignment: "aligned" | "neutral" | "opposing";  // HTF vs signal direction
  multiplier: number;   // 0.0 = reject, 0.5 = reduced, 1.0 = standard, 1.5 = amplified
  score: number;        // 0-100 MTF confidence score
  narrative: string;    // one-line explanation
  details: Record<string, number>;  // per-TF trend values
};

type TfSnapshot = {
  tf: string;
  close: number;
  ma7: number;
  ma25: number;
  ma99: number;
  momentum: number;   // % change over last 5 candles
  bullish: boolean;   // MA7 > MA25 > MA99
  compression: boolean; // range contraction in last 5 bars vs 20-bar avg
};

const BINANCE_KLINES = "https://api.binance.com/api/v3/klines";

/* ─── Kline → Snapshot ─────────────────────────────────────────────── */

async function fetchSnapshot(symbol: string, tf: string): Promise<TfSnapshot | null> {
  try {
    const res = await fetch(`${BINANCE_KLINES}?symbol=${symbol}&interval=${tf}&limit=99`);
    if (!res.ok) return null;
    const klines = await res.json() as any[];
    if (!Array.isArray(klines) || klines.length < 26) return null;

    const closes = klines.map((k: any[]) => parseFloat(k[4]));

    function sma(arr: number[], w: number): number {
      if (arr.length < w) return arr[arr.length-1];
      return arr.slice(-w).reduce((a,b)=>a+b,0)/w;
    }

    const ma7 = sma(closes, 7);
    const ma25 = sma(closes, 25);
    const ma99 = closes.length >= 99 ? sma(closes, 99) : ma25;
    const bullish = ma7 > ma25 && ma25 > ma99;

    // Momentum: last 5 candles % change
    const mom5 = closes.length >= 5 ? ((closes[closes.length-1] - closes[closes.length-6]) / closes[closes.length-6]) * 100 : 0;

    // Compression: last 5-bar range / 20-bar average range
    const ranges: number[] = [];
    for (let i = 0; i < klines.length; i++) {
      ranges.push(parseFloat(klines[i][2]) - parseFloat(klines[i][3]));
    }
    const recent = ranges.slice(-5).reduce((a,b)=>a+b,0)/5;
    const historical = ranges.slice(-25).reduce((a,b)=>a+b,0)/25 || 1;
    const compression = recent < historical * 0.7;

    return {
      tf, close: closes[closes.length-1], ma7, ma25, ma99,
      momentum: mom5, bullish, compression,
    };
  } catch {
    return null;
  }
}

/* ─── MTF Matrix ────────────────────────────────────────────────────── */

const TF_HIERARCHY = ["1w", "1d", "4h", "1h", "30m", "15m", "5m"];

/**
 * Evaluate a signal against all higher timeframes and return an MTF-adjusted
 * confidence score and position multiplier.
 *
 * @param symbol - e.g. "BTCUSDT"
 * @param signalTF - the timeframe the signal fired on (e.g. "15m")
 * @param direction - "buy" | "sell"
 * @param htfTFs - which higher TFs to check (default: ["4h", "1h"] for <=1h signals, ["1d","4h"] for 4h)
 */
export async function evaluateMtfMatrix(
  symbol: string, signalTF: string, direction: "buy" | "sell",
  htfTFs?: string[],
): Promise<MtfContext> {
  // Determine which HTFs to check: everything ABOVE signal TF in the hierarchy
  const signalIdx = TF_HIERARCHY.indexOf(signalTF);
  const tfsToCheck = htfTFs ?? (signalIdx >= 0
    ? TF_HIERARCHY.slice(0, signalIdx).filter(tf => ["4h","1h","1d"].includes(tf))
    : ["4h", "1h"]);

  if (tfsToCheck.length === 0) {
    return { alignment: "neutral", multiplier: 1.0, score: 50, narrative: "no higher TF to check", details: {} };
  }

  // Parallel fetch all HTFs
  const snapshots = (await Promise.all(tfsToCheck.map(tf => fetchSnapshot(symbol, tf)))).filter(Boolean) as TfSnapshot[];

  if (snapshots.length === 0) {
    return { alignment: "neutral", multiplier: 1.0, score: 50, narrative: "HTF data unavailable", details: {} };
  }

  // Score each HTF: +2 for bullish, -2 for bearish, weighted by TF rank
  let weightedScore = 0;
  let maxScore = 0;
  let opposing = 0;
  let aligned = 0;
  const details: Record<string, number> = {};

  for (const snap of snapshots) {
    const weight = snap.tf === "1d" || snap.tf === "1w" ? 3 : snap.tf === "4h" ? 2 : 1;
    maxScore += weight * 2; // max possible score if all HTFs aligned

    const htfsBullish = snap.bullish && snap.momentum > 0;
    const htfsBearish = !snap.bullish && snap.momentum < 0;

    if (direction === "buy") {
      if (htfsBullish)         { weightedScore += weight * 2; aligned++; details[snap.tf] = 2; }
      else if (!snap.bullish && snap.momentum < 0) { weightedScore -= weight * 2; opposing++; details[snap.tf] = -2; }
      else if (snap.bullish)   { weightedScore += weight; details[snap.tf] = 1; }
      else                     { weightedScore -= weight; details[snap.tf] = -1; }
    } else {
      if (htfsBearish)         { weightedScore += weight * 2; aligned++; details[snap.tf] = 2; }
      else if (snap.bullish)   { weightedScore -= weight * 2; opposing++; details[snap.tf] = -2; }
      else if (!snap.bullish)  { weightedScore += weight; details[snap.tf] = 1; }
    }

    // Compression bonus: HTF in compression → price coiling for expansion
    if (snap.compression) {
      weightedScore += weight;
      details[snap.tf + "_compression"] = 1;
    }
  }

  // Normalize to 0-100
  const score = Math.max(0, Math.min(100, Math.round(((weightedScore + maxScore) / (2 * maxScore)) * 100)));

  // Alignment decision
  let alignment: "aligned" | "neutral" | "opposing";
  let multiplier: number;
  let narrative: string;

  if (opposing > 0 && aligned === 0) {
    alignment = "opposing";
    multiplier = 0; // REJECT — HTF going against the trade
    narrative = `HTF opposing: ${snapshots.filter(s => details[s.tf] < 0).map(s => s.tf).join(", ")} bearish`;
  } else if (aligned >= opposing + 1 && aligned >= snapshots.length / 2) {
    alignment = "aligned";
    multiplier = score >= 80 ? 1.5 : 1.25; // AMPLIFIED — HTF confirms
    narrative = `HTF aligned: ${snapshots.filter(s => details[s.tf] > 0).map(s => s.tf).join(", ")} bullish`;
  } else {
    alignment = "neutral";
    multiplier = score >= 60 ? 1.0 : 0.75; // standard or reduced
    narrative = `HTF mixed: ${score}/100 MTF score`;
  }

  return { alignment, multiplier, score, narrative, details };
}

/* ─── Quick check (non-async, for sync dispatch paths) ──────────────── */

/**
 * Synchronous fallback: when we can't wait for Binance, use the signal's
 * own timeframe and indicator quality as a rough MTF proxy.
 *   - 4h signals: already HTF, no adjustment needed
 *   - 1h signals: moderate MTF confidence
 *   - <1h signals: reduced confidence unless indicator is MACD/Stoch
 */
export function quickMtfAdjust(signalTF: string, indicator: string): number {
  if (signalTF === "4h" || signalTF === "1d" || signalTF === "1w") return 1.0;
  if (signalTF === "1h") {
    const ind = indicator.toLowerCase();
    return (ind.includes("macd") || ind.includes("stoch")) ? 1.0 : 0.75;
  }
  // 30m, 15m, 5m — only MACD gets full confidence
  return indicator.toLowerCase().includes("macd") ? 0.75 : 0.5;
}
