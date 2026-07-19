export type SignalSource = "coinlegs" | "icr" | "coil" | "derivatives" | "anavitrade-native" | "mirror_fallback" | "binance-gainers";

export interface Kline {
  symbol: string;
  timeframe: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface EnrichedCandle extends Kline {
  ma7: number;
  ma25: number;
  ma99: number;
  atr14: number;
  volumeMa20: number;
  volumeZscore: number;
  range: number;
  body: number;
  bodyRatio: number;
  closePosition: number;
  ma25Slope: number;
  rsi14: number;
  bbMid: number;
  bbUpper: number;
  bbLower: number;
  bbWidth: number;
  displacement: number;
  coilScore?: number;
  coilGrade?: string;
  wt1: number;
  wt2: number;
  moneyFlow: number;
  stochRsiK: number;
  stochRsiD: number;
}

export interface UnifiedSignal {
  source: SignalSource;
  symbol: string;
  timeframe: string;
  direction: "long" | "short";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  score: number;
  tier: "A" | "B" | "C";
  thesis: string;
  components: Record<string, number>;
  structuralScore: number;
  confidence: number;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface DerivativesSnapshot {
  symbol: string;
  timestamp: number;
  openInterest: number;
  oiChange24h: number;
  fundingRate: number;
  longShortRatio: number;
  longPct: number;
  shortPct: number;
}

export interface DerivativesAlpha {
  score: number;
  bias: string;
  details: string;
}

export interface IcrConfig {
  fastMa: number;
  midMa: number;
  slowMa: number;
  atrLength: number;
  volumeMaLength: number;
  maSlopeLookback: number;
  lookbackStructure: number;
  minImpulseBars: number;
  maxImpulseBars: number;
  minPullbackBars: number;
  compressionLookback: number;
  maxSignalAgeAfterImpulse: number;
  impulseAtrMult: number;
  impulseVolumeMult: number;
  pullbackVolumeMaxRatio: number;
  compressionRangeRatio: number;
  compressionAtrRatio: number;
  nearMaAtrMult: number;
  maSeparationAtrMult: number;
  candleClosePositionThreshold: number;
  scoreThreshold: number;
  minRr: number;
  stopAtrBuffer: number;
  bollingerLength: number;
  bollingerStd: number;
  enableCoilGate: boolean;
  minCoilScore: number;
  bonferroniAdjust: boolean;
  tierAThreshold?: number;
  tierBThreshold?: number;
  // Momentum-exhaustion entry filter: reject longs entered with RSI >= entryRsiMax
  // and shorts with RSI <= entryRsiMin (don't chase already-extended moves).
  // Validated optimum 70/30 (+292.7R vs +274.8R, Sharpe 3.79 vs 3.47).
  entryRsiMax?: number;
  entryRsiMin?: number;
  // WaveTrend extreme entry filter: opt-in. When enabled, require that wt1 was at
  // or below -60 (longs) / above +60 (shorts) within the last 5 candles and has
  // since turned in the direction of the trade.
  enableWaveTrendExtremeFilter?: boolean;
  // WaveTrend simple threshold entry filter: opt-in, simpler variant mirroring
  // the RSI filter's single-bar check. Require current-candle wt1 <= -40
  // (longs) / wt1 >= +40 (shorts) — no lookback, no turn requirement.
  enableWaveTrendSimpleFilter?: boolean;
  // Money Flow direction-confirmation filter: opt-in. Require moneyFlow >= 0
  // for longs / <= 0 for shorts at the entry candle. Probed against 113
  // baseline ICR signals: 98.6% of shorts already have moneyFlow < 0, 76.7%
  // of longs already have moneyFlow >= 0 — this filter should reject a
  // minority of signals, unlike the WaveTrend variants which rejected all.
  enableMoneyFlowFilter?: boolean;
}

export interface CoilConfig {
  lookback: number;
  baselinePeriods: number;
  bbLength: number;
  bbStdMult: number;
  maSqueezeLookback: number;
  liquidityOverheadLookback: number;
  reclaimLookback: number;
}

export interface CoilResult {
  score: number;
  grade: string;
  components: Record<string, number>;
}
