# Analysis Engine Architecture

## File Tree

```
src/server/analysis/
├── types.ts                     ← All interfaces (Kline, EnrichedCandle, UnifiedSignal, etc.)
├── indicators.ts                ← Pure-function indicators: sma, ema, atr, rsi, bollinger, enrichCandles
│
├── kline-fetcher.ts             ← Binance REST → D1 (30 symbols, 5+ timeframes, backfill + live update)
├── kline-repository.ts          ← D1 CRUD: getKlines, upsertKlines, getLatestTimestamp, purgeOldKlines
│
├── engine.ts                    ← Orchestrator: fetch → enrich → detect ICR → fetch derivatives → merge → dispatch
├── dispatcher.ts                ← UnifiedSignal → SMC gates → TradeIntent → ExecutionJob + idempotency + dedup
│
├── backtest.ts                  ← Direction-aware historical backtest (simulateOutcome with long/short stops)
├── paper-trade.ts               ← Paper mode: same pipeline but NO real dispatch, logs to analysis_signals
├── parameter-sweep.ts           ← Grid search over scoreThreshold, minCoilScore, minRr, enableCoilGate
│
├── bridge.ts                    ← Coinlegs scraper → UnifiedSignal table (backfill + incremental bridge)
├── query.ts                     ← Dashboard API: querySignals, getSignalStats, compareSources
│
├── icr/
│   ├── config.ts                ← DEFAULT_ICR_CONFIG (empirically calibrated), DEFAULT_COIL_CONFIG
│   ├── structure.ts             ← Trend gate, impulse detection, pullback, compression
│   ├── signals.ts               ← buildIcrSignal (7 sequential gates + RSI entry filter), findSignals
│   └── coil.ts                  ← 11-component HTF coil scorer (OFF for alts)
│
├── derivatives/
│   ├── fetcher.ts               ← Binance Futures: OI, funding rate, L/S ratio
│   └── alpha.ts                 ← 5-component alpha score (fixed: neutral=50, not 96)
│
├── mirror/
│   ├── indicators-extra.ts      ← MACD, Stochastic, CCI, Ichimoku (Coinlegs-compatible)
│   ├── detector.ts              ← 5 Coinlegs indicator types: MACD(47), Stoch(9), CCI(8), Ichi(46), Trend(7)
│   ├── engine.ts                ← runMirror (7 timeframes, stores with idempotency), compareWithCoinlegs
│   └── scorer.ts                ← Mirrors coinlegs-scraper.ts scoring algorithm
│
└── exits/
    ├── heikin-ashi.ts           ← HA candle calculation + HTF regime detection
    ├── fibonacci.ts             ← Fib extension targets from impulse swing points
    ├── exhaustion.ts            ← 5-signal exhaustion detector (RSI div, volume climax, MA overext, BB walk, body collapse)
    ├── trailing.ts              ← Ratchet trail (wide default: 5ATR, arm @ +4R, NO early breakeven)
    └── exit-engine.ts           ← simulateSmartExit orchestrator (fib scale-outs, trails, HA flip, exhaustion)
```

## Signal Pipeline

```
                  ╔══════════════════════════╗
                  ║   30 symbols watchlist   ║
                  ╚══════════════════════════╝
                           │
                           ▼
                  ╔══════════════════════════╗
                  ║  KlineFetcher.updateAll() ║ ← Binance REST API
                  ╚══════════════════════════╝
                           │
                           ▼
                  ╔══════════════════════════╗
                  ║  enrichCandles()         ║ ← SMA(7,25,99), ATR(14), RSI(14), BB(20,2)
                  ╚══════════════════════════╝
                           │
               ┌───────────┴───────────┐
               ▼                       ▼
    ╔══════════════════════╗  ╔══════════════════════════╗
    ║  ICR: buildIcrSignal ║  ║  Mirror: detectCoinlegs  ║
    ║  7 sequential gates  ║  ║  5 indicator types       ║
    ║  + RSI entry filter  ║  ║  7 timeframes            ║
    ╚══════════════════════╝  ╚══════════════════════════╝
               │                       │
               ▼                       ▼
    ╔══════════════════════╗  ╔══════════════════════════╗
    ║  DerivativesFetcher  ║  ║  Stored in analysis_     ║
    ║  computeAlpha()      ║  ║  signals (dispatched=0)  ║
    ╚══════════════════════╝  ╚══════════════════════════╝
               │
               ▼
    ╔══════════════════════╗
    ║  Merge: alpha score  ║
    ║  → boost/penalty     ║
    ╚══════════════════════╝
               │
               ▼
    ╔══════════════════════════╗
    ║  Per-cycle dedup         ║ ← 1 signal per (symbol, tf, dir)
    ║  24hr gap filter         ║ ← no repeat in 24h
    ╚══════════════════════════╝
               │
               ▼
    ╔══════════════════════════╗
    ║  SMC structural gates   ║ ← validateStructure()
    ║  score < 40 → reject    ║
    ╚══════════════════════════╝
               │
               ▼
    ╔══════════════════════════╗
    ║  dispatchSingalBatch()  ║
    ║  → TradeIntent          ║
    ║  → ExecutionJob         ║
    ║  → CEX adapter          ║
    ╚══════════════════════════╝
```
