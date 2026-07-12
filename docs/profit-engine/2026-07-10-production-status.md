# Production Readiness Status — July 10, 2026

## Backtest (334 trades, 14-day coinlegs corpus)
- Win rate: **56.9%**
- Expectancy: **+0.067%** (positive)
- Profit factor: **1.18**
- Deploy: **EDGE_CANDIDATE** — marginal positive expectancy confirmed

## What's Live & Verified
- [x] Coinlegs scraper with forward-only scoring (no hindsight bias)
- [x] ATR-based stop-loss, R-multiple take-profit (2R on 15m/30m, 3R on 1h, 5R on 4h+)
- [x] SMC structural validator (5-gate) gating every dispatch
- [x] MACD-only filter on 15m/30m timeframes (64.4% WR)
- [x] Tier A threshold at score ≥ 55
- [x] Daily loss limit + portfolio exposure cap enforced
- [x] Fee engine with 2-and-20 HWM tracking
- [x] Outcome validator against Binance public klines
- [x] All 4 migrations applied to remote D1
- [x] `pnpm check` + `pnpm build` clean
- [x] Cron: `* * * * *` (every 60 seconds)

## What Still Needs Data
- [ ] 4h MACD/Stochastic signals with 3+ confluence (expected median +124% per analysis_findings.md) — not yet appearing in the 14-day corpus. The coinlegs API has them but needs active 4h candles on major pairs
- [ ] Binance testnet end-to-end trade (needs testnet API key connected)
- [ ] Fee engine tested with real NAV data (needs users with exchange connections generating NAV snapshots)
- [ ] 500+ trade backtest with outcome validation (D1 corpus is 650, outcome validation needs wider date range)

## Gatekeeping Rules (Production Dispatch)
A coinlegs signal fires for automated execution ONLY when:
1. Forward-only tier = A (score ≥ 55)
2. SMC structural validator passes all 5 gates
3. If 15m/30m: indicator must be MACD
4. Risk engine approves (kill switch off, daily loss within limit, exposure cap not exceeded)
