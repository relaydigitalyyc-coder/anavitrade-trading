# Subagent Execution PRD — Production Readiness

**Date**: 2026-07-10  
**Backtest**: 334 trades, 56.9% WR, +0.067% expectancy, PF 1.18  
**Status**: EDGE_CANDIDATE — marginal positive expectancy confirmed

## Task 1: Calibrate scoring thresholds from live backtest [FIX]

Owner: main agent (inline fix)
Files: `src/server/coinlegs-scraper.ts`

The backtest proved the existing Tier thresholds (A≥60, B≥40) don't match the live corpus
(15m/30m dominated).  Fix:
- A ≥ 55, B ≥ 40 (no change), C ≥ 25
- On 15m/30m: only dispatch MACD signals (64.4% WR, 87 trades in backtest)
- TP: 2R on 15m/30m, 3R on 1h, 5R on 4h+

## Task 2: Wire MACD-only filter on low timeframes [FIX]

Owner: main agent (inline fix)
Files: `src/server/coinlegs-scraper.ts` dispatch loop

Before `tierASignals.push()`, add: if period is 15m or 30m and indicator is NOT MACD → skip.
This is the single highest-impact filter from the backtest.

## Task 3: Deploy and verify production endpoint [VERIFY]

Owner: verification agent
- `pnpm check && pnpm build` — must pass
- `npx wrangler deploy` — must succeed
- `curl https://anavitrade-trading.erhazeariel.workers.dev/api/health` — must return ok
- `curl https://anavitrade-trading.erhazeariel.workers.dev/api/trpc/signals.stats?batch=1&input=...` — must return live signals

## Task 4: Production readiness declaration [DOCUMENT]

Owner: main agent (inline)
Write `docs/profit-engine/2026-07-10-production-status.md` with honest status:
- What's live and verified
- What needs more data (4h signals, testnet trade, fee engine with real users)
- The gatekeeping rule: Tier A + MACD on 15m/30m, or any Tier A on 1h+

All three tasks are small, independent, and immediately executable by a single subagent
with full file write access to `src/server/coinlegs-scraper.ts` and `docs/`.
