/**
 * Shared signal scoring — used by the Coinlegs scraper, native generator,
 * and corpus builder.  Forward-only: no hindsight bias.
 *
 * Scoring is based entirely on inputs available AT SIGNAL TIME:
 *   - indicator quality (which indicator fired?)
 *   - timeframe reliability (4h > 1h > 15m, per empirical data)
 *   - confluence count (how many indicators agree?)
 *   - momentum at entry (Pct24)
 */

export function scoreSignal(
  confluenceCount: number,
  period: string,
  indicatorName: string,
  pct24: number | null | undefined,
): { score: number; tier: "A" | "B" | "C" } {
  let s = 0;

  // ── A. Indicator × Timeframe quality (40 pts) ──
  const tf = period.toLowerCase();
  const ind = indicatorName.toLowerCase();

  // Timeframe weight (0-20)
  if (tf === "1w")      s += 20;
  else if (tf === "1d") s += 18;
  else if (tf === "4h") s += 20;
  else if (tf === "1h") s += 14;
  else if (tf === "30m") s += 6;
  else if (tf === "15m") s += 4;

  // Indicator weight (0-20)
  if (ind.includes("macd"))                  s += 20;
  else if (ind.includes("stochastic") || ind.includes("stoch")) s += 18;
  else if (ind.includes("trend") || ind.includes("reversal"))  s += 14;
  else if (ind.includes("cci"))              s += 12;
  else if (ind.includes("ichimoku"))         s += 10;
  else s += 6;

  // ── B. Confluence (25 pts) ──
  if (confluenceCount >= 5)      s += 25;
  else if (confluenceCount >= 4) s += 22;
  else if (confluenceCount >= 3) s += 18;
  else if (confluenceCount >= 2) s += 12;

  // ── C. Momentum direction (15 pts) ──
  const m = pct24 ?? 0;
  if (m > 10)        s += 15;
  else if (m > 5)    s += 12;
  else if (m > 1)    s += 8;
  else if (m >= 0)   s += 5;
  else if (m > -3)   s += 3;

  // ── Thresholds ──
  // maxScore = 40 + 25 + 15 = 80
  const tier = s >= 55 ? "A" : s >= 40 ? "B" : "C";
  return { score: s, tier: tier as "A" | "B" | "C" };
}
