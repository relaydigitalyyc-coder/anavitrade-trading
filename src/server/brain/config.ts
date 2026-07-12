/**
 * BRAIN CONFIG — the single source of truth for every tunable parameter.
 *
 * This file defines the entire trading system as a parametrized black box.
 * Modify these values to tune behaviour — never scatter parameters across
 * 20+ files.  The brain is calibrated from the 1,265-trade backtest corpus
 * and MDP training.  Change one value, the whole system adapts to it.
 *
 * Categories:
 *   SIGNAL   — which indicators fire, their weights, and confluence rules
 *   RISK     — position sizing, leverage, stops, volatility thresholds
 *   FILTER   — timeframe quality gates, momentum/drawdown limits
 *   ML       — MDP-trained weights (Q-table lookups for each market state)
 *   EXEC     — exchange-level settings, retry, latency
 *   MONITOR  — outcome validation, fee engine, reporting
 */

export const BRAIN = {

  /* ═══════════════════════════════════════════════════
     SIGNAL — indicator weights and detection rules
     ═══════════════════════════════════════════════════ */
  SIGNAL: {

    /** Coinlegs detection IDs: these are INPUT FEATURES, not the strategy.
     *  Coinlegs API filters by these IDs; the resulting signal has already
     *  been through its own detection pipeline.  Our scoring layer then
     *  treats the coinlegs detection as ONE feature alongside our own. */
    COINLEGS_DETECTION_IDS: [47, 9, 8, 46, 7],   // MACD, Stoch, CCI, Ichimoku, Trend Rev
    COINLEGS_PERIODS: ["4h", "1h", "30m", "15m"],

    /** Coinlegs signals carry maxProfit metadata.  We DO NOT use this for
     *  scoring (forward-only rule).  Instead, weight = 0 means coinlegs
     *  detections still contribute through their raw presence (they count
     *  toward confluence), but maxProfit never enters the scoring function. */
    COINLEGS_SCORE_WEIGHT: 0,   // maxProfit is not a scoring input
    COINLEGS_CONFLUENCE_BONUS: 1,  // each coinlegs detection counts as +1 toward MIN_CONFLUENCE

    /** Per-indicator weight on the composite score (0-100).  Higher = more
     *  influence on whether a signal reaches Tier A/B/C threshold. */
    INDICATOR_WEIGHT: {
      macd:               20,
      stochastic:         18,
      cci:                12,
      trend_reversal:     14,
      ichimoku:           10,
      bbawe:              8,   // Bollinger squeeze + Awesome Osc
      mcb_confluence:     14,  // Market Cipher multi-oscillator agreement
      wolfpack_div:       7,   // MACD(3,8) divergence
      mss_bos:            10,  // LuxAlgo Market Structure Shift / BOS
      order_block:        8,   // LuxAlgo order block retrace
      liquidity_sweep:    7,   // LuxAlgo clustered swing sweep
      fvg:                5,   // Fair Value Gap
      swing_sniper:       14,  // Structural OB entry at swing sweep
    },

    /** How many indicator layers must agree before a signal fires.  2 means
     *  at least 2 distinct indicators must detect the same (pair, TF, bar). */
    MIN_CONFLUENCE: 2,

    /** Score thresholds for tier classification.  A ≥ threshold fires
     *  automatically.  B signals fire only if confluence >= HIGH_CONF. */
    TIER_A_THRESHOLD: 55,
    TIER_B_THRESHOLD: 40,
    TIER_B_MIN_CONFLUENCE: 3,

    /** Timeframe quality weights (higher = more reliable).  Used in the
     *  MTF matrix to score signals before zoom dispatch. */
    TF_WEIGHT: {
      "1w": 1.0,  "1d": 0.95,  "4h": 1.0,  "2h": 0.8,
      "1h": 0.70, "30m": 0.35, "15m": 0.20, "5m": 0.08,
    },
  },

  /* ═══════════════════════════════════════════════════
     RISK — position sizing, leverage, and volatility
     ═══════════════════════════════════════════════════ */
  RISK: {
    /** Base capital risk per trade (% of equity).  Applied across all TFs,
     *  then weighted by TF_RISK_MULT. */
    BASE_RISK_PCT: 5.0,

    /** Leverage.  3× on 4h, 2× on 1h, 2× on lower TFs. */
    LEVERAGE_BY_TF: {
      "1w": 3,  "1d": 3,  "4h": 3,  "2h": 3,
      "1h": 2,  "30m": 2, "15m": 2,  "5m": 1,
    },

    /** Risk multiplier per timeframe (from 1,265-trade Monte Carlo).  4h = 2.0
     *  means a 4h signal gets DOUBLE the position size of a 15m signal. */
    TF_RISK_MULT: {
      "1w": 2.0,  "1d": 2.0,  "4h": 2.0,  "2h": 1.5,
      "1h": 1.5,  "30m": 1.0, "15m": 0.75, "5m": 0.5,
    },

    /** Stop-loss: ATR multiplier.  1.5× ATR = prevents random noise from
     *  stopping out the trade while keeping losses bounded. */
    STOP_ATR_MULT: 1.5,

    /** Take-profit: R-multiple of the stop distance.  3R = stop at 2%,
     *  TP at 6%.  Backtest shows 3R captures 70% of big moves while
     *  keeping win rate high. */
    TP_R_MULT: {
      "1w": 5,  "1d": 5,  "4h": 5,  "2h": 4,
      "1h": 3,  "30m": 2, "15m": 2,
    },

    /** Maximum portfolio exposure (% of total equity across ALL open trades).
     *  Default 25%.  A $10k account can have at most $2,500 in open notional. */
    MAX_TOTAL_EXPOSURE_PCT: 25.0,

    /** Maximum daily loss (% of starting equity).  Once breached, stops all
     *  new orders until next UTC day. */
    MAX_DAILY_LOSS_PCT: 5.0,
  },

  /* ═══════════════════════════════════════════════════
     FILTER — what gets rejected before scoring
     ═══════════════════════════════════════════════════ */
  FILTER: {
    /** Never trade 5m (noise-dominated, proven net-negative). */
    BLOCKED_TIMEFRAMES: ["5m"],

    /** Only these indicators can fire on low TFs (15m/30m).  MACD at 64.4%
     *  WR in backtest; the rest are noise on low TFs. */
    LTF_ALLOWED_INDICATORS: ["macd"],

    /** Minimum drawdown before a signal qualifies as "swing sweep."
     *  Price must have dipped at least X% within its lookback window for
     *  the setup to be structural.  1.5% = typical swing low distance on 4h. */
    MIN_SWEEP_DEPTH_PCT: 1.5,

    /** MDP zoom threshold floor.  The per-state threshold from the Q-table
     *  is used, but never below this absolute minimum. */
    ZOOM_THRESHOLD_MIN: 55,
  },

  /* ═══════════════════════════════════════════════════
     ML — MDP-trained Q-table (optimal zoom per state)
     ═══════════════════════════════════════════════════
     Key: `${timeframe}_${regime}_${wrState}`
     Value: { threshold, cciW, stochW, microW }
     Trained via Q-learning over 500 episodes on the 1,265-trade corpus. */

  ML_ZOOM_POLICY: {
    "4h_trend_hot":       { thr: 65, cciW: 11, stochW:  8, microW: 5 },
    "4h_trend_cold":      { thr: 55, cciW:  9, stochW:  4, microW: 7 },
    "4h_range_hot":       { thr: 65, cciW:  9, stochW: 10, microW: 3 },
    "4h_range_cold":      { thr: 65, cciW:  5, stochW:  4, microW: 5 },
    "4h_volatile_hot":    { thr: 75, cciW: 11, stochW: 10, microW: 7 },
    "4h_volatile_cold":   { thr: 75, cciW:  7, stochW:  4, microW: 5 },
    "1h_trend_hot":       { thr: 65, cciW: 11, stochW: 10, microW: 5 },
    "1h_trend_cold":      { thr: 75, cciW:  9, stochW:  6, microW: 5 },
    "1h_range_hot":       { thr: 55, cciW:  5, stochW:  8, microW: 5 },
    "1h_range_cold":      { thr: 55, cciW:  5, stochW:  6, microW: 7 },
    "1h_volatile_hot":    { thr: 75, cciW:  9, stochW: 10, microW: 7 },
    "1h_volatile_cold":   { thr: 65, cciW:  5, stochW:  4, microW: 7 },
    "other_trend_hot":    { thr: 75, cciW: 11, stochW: 10, microW: 5 },
    "other_trend_cold":   { thr: 65, cciW:  5, stochW:  6, microW: 5 },
    "other_range_hot":    { thr: 75, cciW: 11, stochW: 10, microW: 5 },
    "other_range_cold":   { thr: 75, cciW:  5, stochW: 10, microW: 5 },
    "other_volatile_hot": { thr: 75, cciW: 11, stochW: 10, microW: 7 },
    "other_volatile_cold":{ thr: 75, cciW:  7, stochW:  4, microW: 5 },
  },

  /* ═══════════════════════════════════════════════════
     EXEC — exchange connectivity and dispatch
     ═══════════════════════════════════════════════════ */
  EXEC: {
    /** Number of retry attempts before marking an order as failed. */
    MAX_RETRIES: 3,
    /** Backoff between retries (ms). */
    RETRY_BACKOFF: [1000, 2000, 4000],

    /** Pairs to scan in the native generator (top N by 24h volume). */
    NATIVE_PAIRS_COUNT: 150,
    NATIVE_TIMEFRAMES: ["4h", "2h", "1h"],

    /** Candles to fetch per scan.*/
    CANDLES_PER_SCAN: 60,
  },

  /* ═══════════════════════════════════════════════════
     MONITOR — validation, fees, and reporting
     ═══════════════════════════════════════════════════ */
  MONITOR: {
    /** Outcome validation runs every N minutes.  Fetches klines and checks
     *  whether SL or TP was hit. */
    OUTCOME_VALIDATION_INTERVAL: 15,

    /** Fee engine: 2&20 (2% annual management, 20% performance above HWM). */
    MANAGEMENT_FEE_ANNUAL_PCT: 2.0,
    PERFORMANCE_FEE_PCT: 20.0,
    FEE_CRYSTALLIZE_INTERVAL: 1440, // daily
  },
};

export type BrainConfig = typeof BRAIN;
