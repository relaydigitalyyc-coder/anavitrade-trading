# Production Readiness Status — July 11, 2026

## Backtest (1,265 trades, TF-prioritized corpus)
- Win rate: **62.6%**
- Expectancy: **+0.929%** (14× improvement from v1)
- Profit factor: **2.68**
- Deploy: **EDGE CONFIRMED**

| Timeframe | Trades | Win Rate |
|-----------|--------|----------|
| 4h | 282 | **70.7%** |
| 1h | 499 | 58.1% |
| 30m | 94 | 70.2% |
| 15m | 385 | 60.8% |

## Root Cause of Yesterday's Poor Results

The coinlegs API's `RowsInPage` parameter is dead — always returns exactly 20 per page
regardless of value. Requesting all 7 timeframes simultaneously (5m–1w) drowned 4h signals
(70.7% WR) in 15m noise (60.8% WR). Fix: TF-prioritized fetching in priority groups
(4h+1d → 1h → 30m+15m), each page-swept independently. This is now the live scraper model.

## Self-Analysis Honesty

The 8-gate SMC validator was built to solve a problem that didn't exist yet — it tried to
detect structural entries on a corpus that contained almost no structural timeframes.
The validator is correct (MACD scores highest, 1h/4h score highest), but the real fix
was 3 lines: split the periods array into priority groups.

## What's Live & Verified
- [x] TF-prioritized scraper (4h+1d first, then lower TFs)
- [x] 1,265-trade backtest with EDGE_CONFIRMED
- [x] Forward-only scoring (no maxProfit hindsight)
- [x] MACD-only filter on 15m/30m (64.4% WR in v1, now ~65% in v2)
- [x] ATR-based SL, R-multiple TP (2R low TF, 3R 1h, 5R 4h)
- [x] 8-gate SMC grading (scores position size, confidence multiplier)
- [x] Risk engine: daily loss + exposure cap
- [x] Fee engine with 2-and-20 HWM
- [x] All migrations applied to remote D1
- [x] `pnpm check` + `pnpm build` clean
- [x] Cron: `* * * * *`

## What Still Needs Data
- [ ] Binance testnet end-to-end trade
- [ ] Fee engine tested with real NAV data from live users
