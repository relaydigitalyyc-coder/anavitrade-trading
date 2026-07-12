# Subagent Execution PRD — Production Launch

**Date**: 2026-07-11
**Backtest**: 1,265 trades, 62.6% WR, +0.929% expectancy, PF 2.68
**Deploy status**: EDGE_CONFIRMED

---

## Architecture Overview

```
Coinlegs API (TF-prioritized: 4h+1d → 1h → 30m+15m)
    │
    ▼
Scraper cron (* * * * *) — fetch + score + structural gate + dispatch
    │
    ├──→ Tier A (score ≥ 55): auto-dispatch to all connected CEX accounts
    │       ├── SMC 8-gate grading (position size modifier)
    │       ├── MACD-only filter on 15m/30m
    │       ├── Risk engine (daily loss + exposure cap + kill switches)
    │       ├── 3-retry dispatch with serialized per-connection queue
    │       └── TradeIntent → ExecutionJob → OrderEvent → NavSnapshot
    │
    └──→ Tier B (40-54): stored in D1, not auto-dispatched
            (research corpus, can be promoted later)
```

## Phase 1 Subagents — Production Hardening (parallel)

### Agent 1: Risk Threshold Calibration
**File**: `src/server/execution/riskEngine.ts`
**Task**: Implement Path A+B from Monte Carlo analysis — 4h+1h get 10% risk, 30m+15m get 5%. Add `riskMultiplierByTF` config.
**Target**: 20% monthly @ 5-8 trades/day on 4h+1h
**Verify**: Re-run Monte Carlo with calibrated risk, confirm median ≥ 20% at 5 trades/day

### Agent 2: Dashboard Honesty
**File**: `src/pages/HistoricalPerformance.tsx`, `src/server/routers.ts`
**Task**: Add `/signals.performance` endpoint exposing live backtest metrics: win rate by timeframe, expectancy by tier, profit factor, monthly return projection. Wire to HistoricalPerformance page.
**Verify**: `curl /api/trpc/signals.performance` returns live numbers. Dashboard shows 62.6% WR, PF 2.68.

### Agent 3: Production Deploy Checklist
**Files**: `wrangler.toml`, `CLAUDE.md`, `docs/`
**Task**: 1) Verify all secrets set (JWT_SECRET, ENCRYPTION_KEY). 2) Confirm remote D1 has all migrations. 3) Run `pnpm check && pnpm build` → deploy. 4) Smoke test: `/api/health`, `/api/trpc/signals.stats`, `/api/outcome/stats` all return 200. 5) Verify cron is `* * * * *`.
**Verify**: All 5 items pass.

## Phase 2 Subagents — Edge Amplification (parallel)

### Agent 4: 4h+1h Signal Quality Filter
**File**: `src/server/coinlegs-scraper.ts`
**Task**: Before tierASignals.push(), enforce: if period is 4h or 1h, only dispatch if indicator is MACD, Stochastic, or Trend Reversal AND confluenceCount ≥ 2 if available. Single-indicator 1h signals get scored but not dispatched.
**Backtest impact**: Filter narrowed from 1,265 to ~400 highest-quality trades. Expected: 68% WR, PF 3.0+.
**Verify**: Typecheck. Deploy. Confirm scraper still returns tierA > 0 when real signals fire.

### Agent 5: Outcome Validation Cron
**File**: `src/server/outcome/validator.ts`
**Task**: After every dispatch, queue a follow-up validation at T+maxProfitDuration. Check Binance klines for whether SL or TP was actually hit. Store result on the execution_job row. This closes the feedback loop.
**Verify**: After dispatch, manual run of outcome validator shows `outcomeValidated = true` on newly-filled execution_jobs.

### Agent 6: Weekly Performance Report Email/Endpoint
**File**: `src/server/analysis/weekly.ts`
**Task**: New cron (Monday 09:00 UTC). Query D1 for: week's signals, dispatched trades, PnL, win rate, fees accrued, new users, active connections. Write to `weekly_reports` table and expose at `GET /api/reports/weekly`.
**Verify**: Manual trigger returns structured JSON with all fields populated.

## Phase 3 — Testnet End-to-End (sequential, requires manual setup)

### Agent 7: Binance Testnet Integration
**Files**: `src/server/cex/binance.ts`, `src/server/cex/store.ts`
**Task**: Add `testnet: true` option to Binance client (base URL `https://testnet.binancefuture.com`). Create a testnet API key in Binance testnet UI, connect through the onboarding wizard, verify balance reads correctly, verify order placement returns testnet fill.
**Verify**: Screenshot of testnet dashboard showing connected exchange + balance + execution log.

---

## Success Criteria (Production-Ready)

- [ ] All 7 agents complete
- [ ] Monte Carlo: median monthly return ≥ 20% at 5 trades/day on 4h+1h (with 10% risk)
- [ ] Dashboard shows live backtest metrics (62.6% WR, PF 2.68, monthly projection)
- [ ] Remote D1 has all migrations, secrets set, cron confirmed `* * * * *`
- [ ] At least one testnet Binance trade from signal → intent → dispatch → fill → snapshot
- [ ] Outcome validator closes the feedback loop (signals → outcomes verified against klines)
- [ ] `pnpm check` + `pnpm build` clean
- [ ] Deployed to `https://anavitrade-trading.erhazeariel.workers.dev`

## File Map

| File | Agent | Change |
|------|-------|--------|
| `src/server/execution/riskEngine.ts` | 1 | Risk multiplier by timeframe |
| `src/server/routers.ts` | 2 | `signals.performance` endpoint |
| `src/pages/HistoricalPerformance.tsx` | 2 | Live dashboard metrics |
| `wrangler.toml` | 3 | Secret verification |
| `src/server/coinlegs-scraper.ts` | 4 | 4h+1h quality filter |
| `src/server/outcome/validator.ts` | 5 | Post-dispatch validation |
| `src/server/analysis/weekly.ts` | 6 | Weekly report engine |
| `src/server/worker.ts` | 6 | Weekly cron endpoint |
| `src/server/cex/binance.ts` | 7 | Testnet base URL toggle |
| `docs/profit-engine/` | 3 | Deploy checklist doc |
