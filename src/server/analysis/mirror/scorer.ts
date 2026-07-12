/**
 * Mirror the Coinlegs scoring algorithm.
 *
 * Same component weights as coinlegs-scraper.ts's scoreSignal():
 *   A) Indicator × Timeframe quality (0-40 pts)
 *   B) Confluence across indicators (0-25 pts)
 *   C) Momentum direction (0-15 pts)
 *
 * Max 80 pts.  Tier A >= 55, Tier B >= 40.
 */

import type { CoinlegsDetection } from "./detector";

/* ─── Timeframe quality lookup ─────────────────────────────────────────────── */

const TIMEFRAME_WEIGHTS: Record<string, number> = {
  "1w": 20,
  "1d": 18,
  "4h": 20,
  "1h": 14,
  "30m": 6,
  "15m": 4,
  "5m": 2,
};

/* ─── Indicator quality lookup ─────────────────────────────────────────────── */

function indicatorWeight(indicatorName: string): number {
  const n = indicatorName.toLowerCase();
  if (n.includes("macd")) return 20;
  if (n.includes("stochastic") || n.includes("stoch")) return 18;
  if (n.includes("trend") || n.includes("reversal")) return 14;
  if (n.includes("cci")) return 12;
  if (n.includes("ichimoku")) return 10;
  return 6;
}

/* ─── Public interface ─────────────────────────────────────────────────────── */

export interface MirrorScoreResult {
  score: number;
  tier: "A" | "B" | "C";
  components: {
    indicator: number;
    timeframe: number;
    confluence: number;
    momentum: number;
  };
}

/**
 * Score a mirror detection using the same logic as the Coinlegs scraper.
 *
 * @param detection  The mirror detection to score
 * @param allDetections  All detections from the same run (for confluence counting)
 * @param pct24  Optional 24h price change percentage (from external data)
 */
export function scoreMirrorDetection(
  detection: CoinlegsDetection,
  allDetections: CoinlegsDetection[],
  pct24?: number | null,
): MirrorScoreResult {
  let s = 0;

  // ── A. Timeframe quality ──────────────────────────────────────────────
  const tf = detection.timeframe.toLowerCase();
  const tfWeight = TIMEFRAME_WEIGHTS[tf] ?? 4;
  s += tfWeight;

  // ── B. Indicator quality ──────────────────────────────────────────────
  const indWeight = indicatorWeight(detection.indicatorName);
  s += indWeight;

  // ── C. Confluence ─────────────────────────────────────────────────────
  // Count unique indicator types on the same symbol+timeframe
  const sameGroup = allDetections.filter(
    (d) => d.symbol === detection.symbol && d.timeframe === detection.timeframe,
  );
  const uniqueIndicators = new Set(sameGroup.map((d) => d.indicatorName));
  const confluenceCount = uniqueIndicators.size;

  let confluenceScore = 0;
  if (confluenceCount >= 5) confluenceScore = 25;
  else if (confluenceCount >= 4) confluenceScore = 22;
  else if (confluenceCount >= 3) confluenceScore = 18;
  else if (confluenceCount >= 2) confluenceScore = 12;
  // 1 indicator alone: 0 pts
  s += confluenceScore;

  // ── D. Momentum direction ──────────────────────────────────────────────
  const m = pct24 ?? 0;
  let momentumScore = 0;
  if (m > 10) momentumScore = 15;
  else if (m > 5) momentumScore = 12;
  else if (m > 1) momentumScore = 8;
  else if (m >= 0) momentumScore = 5;
  else if (m > -3) momentumScore = 3;
  s += momentumScore;

  // ── Tier threshold ────────────────────────────────────────────────────
  const tier = s >= 55 ? "A" : s >= 40 ? "B" : "C";

  return {
    score: s,
    tier,
    components: {
      indicator: indWeight,
      timeframe: tfWeight,
      confluence: confluenceScore,
      momentum: momentumScore,
    },
  };
}
