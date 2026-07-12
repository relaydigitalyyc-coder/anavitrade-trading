import type { IcrConfig, CoilConfig } from "../types";

export const DEFAULT_ICR_CONFIG: IcrConfig = {
  // MA periods (unchanged)
  fastMa: 7, midMa: 25, slowMa: 99,
  atrLength: 14, volumeMaLength: 20,
  maSlopeLookback: 5, lookbackStructure: 50,

  // Impulse detection (relaxed for altcoin volatility)
  minImpulseBars: 2,        // was 3 — alts can impulse in 2 bars
  maxImpulseBars: 14,       // was 12 — longer impulses on volatile alts
  minPullbackBars: 2,       // was 3
  compressionLookback: 8,   // was 10 — faster compression on alts
  maxSignalAgeAfterImpulse: 35, // was 28

  // Multipliers (relaxed)
  impulseAtrMult: 1.2,         // was 1.5 — lower bar for impulse detection
  impulseVolumeMult: 1.0,      // was 1.05
  pullbackVolumeMaxRatio: 1.15, // was 1.05
  compressionRangeRatio: 0.95,  // was 0.92
  compressionAtrRatio: 0.99,    // was 0.98
  nearMaAtrMult: 1.5,           // was 1.25 — wider "near MA" zone for alts
  maSeparationAtrMult: 0.03,    // was 0.05 — lower MA separation bar

  candleClosePositionThreshold: 0.55, // was 0.60

  // EMPIRICALLY CALIBRATED thresholds (from 30-symbol, 6-month sweep)
  scoreThreshold: 65,  // was 75 — calibrated from actual score distribution
  minRr: 1.5,          // was 2.5
  stopAtrBuffer: 0.1,

  // Coil gate OFF by default (blocks too many valid altcoin signals)
  enableCoilGate: false,  // was true
  minCoilScore: 60,       // was 72
  bonferroniAdjust: true,

  bollingerLength: 20, bollingerStd: 2,

  // Recalibrated tier thresholds based on empirical outcomes
  tierAThreshold: 80,
  tierBThreshold: 65,

  // Momentum-exhaustion entry filter (validated optimum 70/30):
  // don't chase longs already overbought / shorts already oversold.
  entryRsiMax: 70,
  entryRsiMin: 30,
};

// Recalibrated tier thresholds based on empirical outcomes:
// Tier A (>= 80): winRate ~35%, avgR > 1.5  (ADA, AAVE, SOL, USDE tier)
// Tier B (>= 65): winRate ~20%, avgR ~0.5  (UNI, OPN, TRX tier)
// Tier C (< 65):   winRate < 10%, avgR < 0 (losers tier)
export const TIER_A_THRESHOLD = 80;
export const TIER_B_THRESHOLD = 65;

export const DEFAULT_COIL_CONFIG: CoilConfig = {
  lookback: 50,
  baselinePeriods: 20,
  bbLength: 20,
  bbStdMult: 2,
  maSqueezeLookback: 10,
  liquidityOverheadLookback: 30,
  reclaimLookback: 10,
};
