import type { EnrichedCandle, IcrConfig } from "../types";

export type Direction = "long" | "short";

/* ─── Public interfaces ─────────────────────────────────────────────────── */

export interface Impulse {
  direction: Direction;
  start: number;
  end: number;
  origin: number;
  extreme: number;
  rangeValue: number;
  avgVolume: number;
  score: number;
}

export interface PullbackResult {
  valid: boolean;
  score: number;
}

export interface Compression {
  direction: Direction;
  start: number;
  end: number;
  high: number;
  low: number;
  score: number;
  avgVolume: number;
  avgRange: number;
}

export interface TriggerResult {
  triggered: boolean;
  score: number;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/**
 * Check that all named fields on a candle are finite numbers.
 */
function candleValid(c: EnrichedCandle, fields: (keyof EnrichedCandle)[]): boolean {
  for (const f of fields) {
    const v = c[f];
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
  }
  return true;
}

function maxHigh(candles: EnrichedCandle[], start: number, end: number): number {
  let m = -Infinity;
  for (let j = start; j < end; j++) {
    if (candles[j].high > m) m = candles[j].high;
  }
  return m;
}

function minLow(candles: EnrichedCandle[], start: number, end: number): number {
  let m = Infinity;
  for (let j = start; j < end; j++) {
    if (candles[j].low < m) m = candles[j].low;
  }
  return m;
}

/* ─── Trend helpers ──────────────────────────────────────────────────────── */

export function isBullishTrend(
  candles: EnrichedCandle[],
  i: number,
  _cfg: IcrConfig,
): boolean {
  if (i < 0 || i >= candles.length) return false;
  const r = candles[i];
  if (!candleValid(r, ["ma7", "ma25", "ma99", "ma25Slope", "atr14"])) return false;
  return r.ma7 > r.ma25 && r.ma25 > r.ma99 && r.close > r.ma25 && r.ma25Slope > 0;
}

export function isBearishTrend(
  candles: EnrichedCandle[],
  i: number,
  _cfg: IcrConfig,
): boolean {
  if (i < 0 || i >= candles.length) return false;
  const r = candles[i];
  if (!candleValid(r, ["ma7", "ma25", "ma99", "ma25Slope", "atr14"])) return false;
  return r.ma7 < r.ma25 && r.ma25 < r.ma99 && r.close < r.ma25 && r.ma25Slope < 0;
}

/* ─── Impulse detection ──────────────────────────────────────────────────── */

export function findRecentImpulse(
  candles: EnrichedCandle[],
  i: number,
  direction: Direction,
  cfg: IcrConfig,
): Impulse | null {
  const latestAllowedEnd = i - cfg.minPullbackBars;
  const earliestAllowedEnd = Math.max(0, i - cfg.maxSignalAgeAfterImpulse);
  let best: Impulse | null = null;

  for (let end = latestAllowedEnd; end >= earliestAllowedEnd; end--) {
    for (let len = cfg.minImpulseBars; len <= cfg.maxImpulseBars; len++) {
      const start = end - len + 1;
      if (start <= cfg.lookbackStructure) continue;
      if (start < 0 || end >= candles.length) continue;

      const endRow = candles[end];
      if (!candleValid(endRow, ["atr14", "volumeMa20", "ma7", "ma25"])) continue;

      const seg = candles.slice(start, end + 1);
      const segHigh = maxHigh(candles, start, end + 1);
      const segLow = minLow(candles, start, end + 1);
      const rng = segHigh - segLow;
      if (rng <= cfg.impulseAtrMult * endRow.atr14) continue;

      const avgVolume = seg.reduce((s, c) => s + c.volume, 0) / seg.length;
      if (avgVolume <= cfg.impulseVolumeMult * endRow.volumeMa20) continue;

      let closeBreak: boolean;
      let maSep: boolean;
      let directional: boolean;
      let origin: number;
      let extreme: number;

      if (direction === "long") {
        const ph = maxHigh(candles, Math.max(0, start - cfg.lookbackStructure), start);
        if (!Number.isFinite(ph)) continue;
        closeBreak = candles[end].close > ph;
        maSep = endRow.ma7 - endRow.ma25 >= cfg.maSeparationAtrMult * endRow.atr14;
        directional = candles[end].close > candles[start].open;
        if (!(closeBreak && maSep && directional)) continue;
        origin = segLow;
        extreme = segHigh;
      } else {
        const pl = minLow(candles, Math.max(0, start - cfg.lookbackStructure), start);
        if (!Number.isFinite(pl)) continue;
        closeBreak = candles[end].close < pl;
        maSep = endRow.ma25 - endRow.ma7 >= cfg.maSeparationAtrMult * endRow.atr14;
        directional = candles[end].close < candles[start].open;
        if (!(closeBreak && maSep && directional)) continue;
        origin = segHigh;
        extreme = segLow;
      }

      let score = 0;
      score += rng >= 2.0 * endRow.atr14 ? 6 : 4;
      score += avgVolume >= 1.25 * endRow.volumeMa20 ? 5 : 3;
      score += closeBreak ? 5 : 0;
      score += maSep ? 4 : 0;

      const candidate: Impulse = {
        direction,
        start,
        end,
        origin,
        extreme,
        rangeValue: rng,
        avgVolume,
        score: Math.min(20, score),
      };

      if (
        best === null ||
        candidate.end > best.end ||
        (candidate.end === best.end && candidate.score > best.score)
      ) {
        best = candidate;
      }
    }
  }

  return best;
}

/* ─── Pullback validation ────────────────────────────────────────────────── */

export function validPullback(
  candles: EnrichedCandle[],
  i: number,
  impulse: Impulse,
  cfg: IcrConfig,
): PullbackResult {
  const start = impulse.end + 1;
  const end = i - 1;
  if (end - start + 1 < cfg.minPullbackBars) {
    return { valid: false, score: 0 };
  }

  const pullback = candles.slice(start, end + 1);
  const triggerPrev = candles[end];
  if (!candleValid(triggerPrev, ["ma25", "atr14"])) {
    return { valid: false, score: 0 };
  }

  const avgVol = pullback.reduce((s, c) => s + c.volume, 0) / pullback.length;
  const avgRange = pullback.reduce((s, c) => s + c.range, 0) / pullback.length;
  const impulseAvgRange =
    impulse.rangeValue / Math.max(1, impulse.end - impulse.start + 1);

  const nearMa = pullback.some(
    (c) => Math.abs(c.close - c.ma25) <= cfg.nearMaAtrMult * triggerPrev.atr14,
  );
  const volOk = avgVol <= impulse.avgVolume * cfg.pullbackVolumeMaxRatio;
  const rangeOk = avgRange <= impulseAvgRange * 1.1;

  let holdsOrigin: boolean;
  let strongClosesAgainst: number;

  if (impulse.direction === "long") {
    holdsOrigin = minLow(candles, start, end + 1) > impulse.origin;
    strongClosesAgainst = pullback.filter(
      (c) => c.atr14 > 0 && c.close < c.ma25 - 0.25 * c.atr14,
    ).length;
  } else {
    holdsOrigin = maxHigh(candles, start, end + 1) < impulse.origin;
    strongClosesAgainst = pullback.filter(
      (c) => c.atr14 > 0 && c.close > c.ma25 + 0.25 * c.atr14,
    ).length;
  }

  const structureOk = holdsOrigin && strongClosesAgainst <= 2;

  let score = 0;
  score += volOk ? 5 : 0;
  score += rangeOk ? 4 : 0;
  score += nearMa ? 3 : 0;
  score += structureOk ? 3 : 0;

  const valid = score >= 10;
  return { valid, score: Math.min(15, score) };
}

/* ─── Compression detection ──────────────────────────────────────────────── */

export function detectCompression(
  candles: EnrichedCandle[],
  i: number,
  direction: Direction,
  cfg: IcrConfig,
): Compression | null {
  const end = i - 1;
  const start = end - cfg.compressionLookback + 1;
  const prevStart = start - cfg.compressionLookback;
  if (prevStart < 0 || start < 0) return null;

  const comp = candles.slice(start, end + 1);
  const prev = candles.slice(prevStart, start);
  const row = candles[end];
  if (!candleValid(row, ["ma25", "atr14", "volumeMa20"])) return null;

  const compRange = comp.reduce((s, c) => s + c.range, 0) / comp.length;
  const prevRange = prev.reduce((s, c) => s + c.range, 0) / prev.length;
  const compAtr = comp.reduce((s, c) => s + c.atr14, 0) / comp.length;
  const prevAtr = prev.reduce((s, c) => s + c.atr14, 0) / prev.length;
  const compVolume = comp.reduce((s, c) => s + c.volume, 0) / comp.length;
  const prevVolume = prev.reduce((s, c) => s + c.volume, 0) / prev.length;
  const compHigh = maxHigh(candles, start, end + 1);
  const compLow = minLow(candles, start, end + 1);
  const width = compHigh - compLow;

  const rangeContract = compRange <= prevRange * cfg.compressionRangeRatio;
  const atrContract = compAtr <= prevAtr * cfg.compressionAtrRatio;
  const volumeContract =
    compVolume <= Math.min(prevVolume, row.volumeMa20) * 1.05;
  const nearMa = comp.some(
    (c) => Math.abs(c.close - c.ma25) <= cfg.nearMaAtrMult * row.atr14,
  );
  const narrow = width <= 4.0 * row.atr14;
  const smallBodies =
    comp.reduce((s, c) => s + c.bodyRatio, 0) / comp.length <= 0.65;

  let score = 0;
  score += rangeContract ? 3 : 0;
  score += atrContract ? 3 : 0;
  score += volumeContract ? 3 : 0;
  score += nearMa ? 2 : 0;
  score += narrow ? 2 : 0;
  score += smallBodies ? 2 : 0;

  if (score < 8) return null;

  return {
    direction,
    start,
    end,
    high: compHigh,
    low: compLow,
    score: Math.min(15, score),
    avgVolume: compVolume,
    avgRange: compRange,
  };
}
