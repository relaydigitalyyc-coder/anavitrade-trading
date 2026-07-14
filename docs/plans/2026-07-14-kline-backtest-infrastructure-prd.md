# PRD: Kline Backtest Infrastructure & Signal Spotting Engine

**Status:** Draft — for next infrastructure upgrade; not implemented
**Target:** Robust servers with static egress IP (Cloudflare Workers subrequest-limited)

## Problem

The current Cloudflare Workers environment has a 50-subrequest-per-invocation cap. This prevents seeding the `klines` table with the 500+ candles needed per symbol for ICR detection. The analysis engine runs but finds 0 symbols because `klines` is empty.

## Requirements

### R1: Kline Warehouse
- Store 500+ candles per (symbol, timeframe) pair in D1
- Support 200+ USDT perpetual pairs across 7 timeframes
- Upsert with (symbol, timeframe, openTime) dedup

### R2: Offline Backtest Engine
- Run ICR signal detection on entire kline history (not just latest candle)
- Sweep parameters across 500+ candles for optimal config detection
- Store results in `analysis_signals` table

### R3: Signal Spotting API
- Query API for "what signals would ICR have fired at this point in history?"
- Time-travel: "give me the signal state as of 2026-06-01T00:00:00Z"
- Compare against Coinlegs signals for precision/recall

### R4: Market Research Data
- Track which (symbol, timeframe) pairs produce the most signals
- Track win rate per indicator type across history
- Build a "pair scoring" table for dynamic watchlist generation

## Architecture Options

### Option A: Dedicated Node.js Backtest Server
- Runs off Cloudflare Workers (no 50-subrequest cap)
- Has static egress IP for Binance futures API
- Feeds processed signals to Workers via D1 or API
- **Cost:** ~$10-20/mo for a small VPS

### Option B: R2-backed Batch Processing
- Seed klines via scheduled Worker with extended limits
- Process backtests in daily cron cycles (50 pairs per cycle)
- Store results in D1 for live querying
- **Cost:** Free (stays in Workers ecosystem)

### Option C: Hybrid (Recommended)
- Seed klines via one-shot VPS script (runs once)
- Store in D1 (Workers-readable)
- Run daily backtest sweeps on Workers (limit to 50 pairs per cycle)
- Live signal spotting via Workers API (D1 queries only, no Binance fetch)

## Implementation Plan

### Phase 1: Seed Klines (1-2 hours VPS time)
```
for each symbol in TOP_200:
  for each timeframe in [4h, 1h, 2h]:
    fetch 500 klines via Binance API
    batch-insert into D1 (via Workers API at 50/cycle)
```
- Upgrade `upsertKlines()` to a raw D1 `batch()` path or an equivalent chunked writer before large seed runs.
- Progress: store in `scraper_runs` table

### Phase 2: Backtest Parameter Sweep (4-8 hours CPU)
```
for each (symbol, timeframe) with ≥200 klines:
  run ICR detection on rolling window
  sweep: threshold 40-80, coil weights, impulse gates
  record: config → totalR, Sharpe, WR, avgR
  store in `analysis_backtests` table
```

### Phase 3: Signal Spotting API (2-4 hours dev)
```
GET /api/signals/spot?symbol=BTCUSDT&timeframe=4h&since=2026-06-01&until=2026-07-14
→ {
    signals: [{ timestamp, direction, score, tier, thesis }],
    metadata: { pairScore, winRate, avgR }
  }
```

### Phase 4: Dynamic Watchlist (2 hours)
- Query: "which 50 pairs had the most Tier A signals in the last 7 days?"
- Feed to analysis engine for live running
- Replace current hardcoded 14-pair list

## Success Metrics
- klines table: ≥100,000 rows (200 pairs × 500 candles × 1 timeframe)
- Backtest results for ≥100 pairs
- Signal spotting API returns results in <500ms
- Dynamic watchlist updates daily from signal activity

## Dependencies
- `npx wrangler@4` upgrade (removes old version warnings)
- Static egress IP or regional proxy for Binance futures API
- D1 database size: ~50MB for 100k klines (within free tier)
