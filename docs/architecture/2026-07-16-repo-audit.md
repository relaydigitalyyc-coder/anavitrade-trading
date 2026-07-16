# Repository Audit — 2026-07-16

Full file catalog of ~250 source files. Excluded: node_modules, .git, dist, pycache, .pkl/.txt model files, training JSON >10MB, stale checkpoint dirs.

## CRITICAL FINDINGS (Codex Swarm + Audit)

| # | Severity | Issue | File | Fix |
|---|----------|-------|------|-----|
| 1 | 🔴 | Mainnet Aster LIVE ORDER SUBMISSION enabled by default | `wrangler.toml:17` | Set `ASTER_LIVE_ORDER_SUBMISSION_ENABLED=false` |
| 2 | 🔴 | CEX market orders use fake $1000 default price | `execution/dispatch.ts:160` | Require explicit limitPrice, fail if missing |
| 3 | 🟠 | Internal API kill-state always returns false | `worker.ts:536` | Read DB-backed `global_kill_switch` |
| 4 | 🟠 | Execution server never places orders (no-op stub) | `execution/server.ts` | Wire CEX adapter call into poll loop |
| 5 | 🟡 | Per-signer serialization is only in-memory | `execution/dispatch.ts:22` | Use Redis mutex on VPS |
| 6 | 🟡 | CEX keys can activate without verified withdrawal disable | `cex/store.ts:161` | Require `permissionsVerified` before status=active |
| 7 | 🟡 | Demo sync has N+1 per-account/per-signal queries | `db.ts:457` | Batch with single query |
| 8 | 🟡 | Scraper confluence calculation is O(n²) | `coinlegs-scraper.ts:206` | Use hash-based grouping |

## PRODUCTION-READY (~155 files)

### Worker Backend
- `src/server/worker.ts` — Hono router, REST API, cron, internal API
- `src/server/routers.ts` — tRPC appRouter
- `src/server/db.ts` — Monolithic DB layer (1100 lines)
- `src/server/context.ts`, `sdk.ts` — Auth, session
- `src/server/binance.ts` — Live Binance trading
- `src/server/coinlegs-scraper.ts` — CF proxy fallback, SMC validation

### Analysis Engine
- `src/server/analysis/engine.ts` — Unified pipeline orchestrator
- `src/server/analysis/indicators.ts` — SMA, EMA, ATR, RSI, BB, AO, volume
- `src/server/analysis/dispatcher.ts` — Dedup, batch insertion
- `src/server/analysis/icr/` — ICR signal generation (coil, signals, structure, config)
- `src/server/analysis/kline-fetcher.ts`, `kline-repository.ts`, `kline-warehouse.ts`

### Signal Generation
- `src/server/signals/generator.ts` — Primary (cron 60s, top 200 pairs)
- `src/server/signals/indicators.ts`, `bbawe.ts`, `market-cipher.ts`, `luxalgo-ict.ts`, `swing-sniper.ts`, `wolfpack.ts`
- `src/server/signals/mtf-matrix.ts`, `zoom-matrix.ts`
- `src/server/smc/validator.ts` — 11-gate IvanG Trading OS pipeline

### CEX + Aster + Execution
- `src/server/cex/adapter.ts`, `binance.ts`, `crypto.ts`, `factory.ts`, `store.ts`, `router.ts`
- `src/server/aster/adapter.ts`, `client.ts`, `config.ts`, `router.ts`, `store.ts`
- `src/server/execution/riskEngine.ts`, `dispatch.ts`, `router.ts`
- 6 CEX client stubs (bybit, okx, kraken, kucoin, gateio, coinbase, bitunix)

### Frontend (~100 files)
- 22 pages + 25 dashboard components + 15 marketing sections + 45 shadcn/ui components
- Hooks: `useDashboardData`, `useDemoData`, `useSignalFeed`, `useMobile`, `useAuth`
- Libs: `wagmi.ts`, `trpc.ts`, `asterWalletSignature.ts`

### ML Pipeline Core
- `scripts/ml/pipeline/config.py` — Immutable PipelineConfig dataclass
- `scripts/ml/pipeline/features.py` — 62 features per bar
- `scripts/ml/pipeline/labels.py` — Forward labeling (no lookahead)
- `scripts/ml/pipeline/model.py` — LightGBM + isotonic calibration
- `scripts/ml/pipeline/backtest.py` — Walk-forward + metrics
- `scripts/ml/pipeline/enrichment.py`, `smc.py` — Indicator + SMC enrichment
- `scripts/ml/metacognitive.py` — 6-layer ML engine (standalone)

### Scripts
- `scripts/tv-deploy-v6.mjs`, `tv-sweep-v4.mjs`, `tv-backtest-runner.mjs`
- `scripts/fetch-klines.mjs`, `fetch-klines-mtf.mjs`, `seed-klines.mjs`
- `scripts/unified-backtest.mjs`
- `scripts/icr-smc-engine.pine`, `icr-sniper-mtf-v6.pine`, `icr-sniper-mtf-v7.pine`

### Config + Infra
- `package.json`, `tsconfig.json` x2, `wrangler.toml`, `vite.config.ts`, `drizzle.config.ts`
- `Dockerfile`, `docker-compose.yml`, `prometheus.yml`, `grafana/datasources.yml`
- 8x D1 migration files (full schema evolution)

### ICR Strategy Python
- `icr_strategy/icr/` — 23 modules (indicators, structure, signals, coiling_pump, divergence, MTF, meta_labeling, backtester, risk, audit, real_edge, reporting...)
- `icr_strategy/tests/` — 10 pytest files (all green)

## NEEDS TESTING (~50 files)

- **Execution server** (`server.ts`) — Never tested with real orders
- **CEX stubs** (7 files) — bybit, okx, kraken, kucoin, gateio, coinbase, bitunix — all empty stubs
- **Exit logic** (5 files) — Exhaustion, fibonacci, trailing exits never backtested against outcomes
- **Mirror engine** (4 files) — Precision/recall never validated
- **Fee engine** (`fee/engine.ts`) — 2/20 model never tested with fee periods
- **E2E tests** (6 files) — Skeleton harness, no test cases
- **ML dev modules** (5 files) — Divergence, volume_profile, metacognitive, rewards, cortex

## BROKEN OR UNTESTED (~10 files)

| File | Issue |
|------|-------|
| `execution/server.ts` | No actual order submission — fetches intents + decrypts keys, never calls exchange |
| `cex/{bybit,okx,kraken,kucoin,gateio,coinbase,bitunix}.ts` | Empty API stubs — no exchange calls implemented |
| `scripts/ml/build-training-data.ts` | May reference stale klines format |
| `scripts/ml/build-training-data-mtf.ts` | Same — verify against current data pipeline |
| `tests/e2e-*.mjs` | Reference stale platform URLs |
| `src/server/analysis/__tests__/` | Only a README — no actual test code |

## DEAD CODE (~80 files)

| Path | Reason |
|------|--------|
| `_manus/**` | Original Manus export — duplicates of active code, never imported. Preserved per CLAUDE.md guardrail. |
| `scripts/tv-inject-v4.mjs`, `tv-inject-v5.mjs`, `tv-compile-v5.mjs` | Superseded by v6 |
| `scripts/backtest.mjs`, `full-backtest.mjs` | Superseded by `unified-backtest.mjs` |
| `icr_strategy/FINAL_*.txt`, `QUANT_AUDIT_REPORT.md` | Historical records |

## TOP 5 FOR 65% WR, PF ≥ 3

1. **`scripts/ml/metacognitive.py`** — 6-layer ML engine. Current: AUC 0.59, pass 1.1% at 89% WR. Tune LightGBM, improve regime detection.
2. **`scripts/ml/pipeline/model.py`** — Calibrated P(win) training. AUC < production grade. Add feature selection, try XGBoost.
3. **`execution/server.ts`** — Wire actual CEX order submission. Currently a no-op.
4. **`src/server/signals/generator.ts`** — Integrate model inference directly instead of post-hoc scoring.
5. **`src/server/db.ts`** — Demo sync engine uses correct realistic stop/target simulation. Calibrate ATR multipliers.

## ARCHITECTURAL OBSERVATIONS

1. **Two independent ML systems:** TypeScript Worker (60s cron) + Python pipeline (offline training). Not connected at runtime — Python outputs are hardcoded into TypeScript.
2. **CORTEX supervisor** gates training by verifying AUC improvement — good safety mechanism, untested.
3. **ICR strategy** is the most tested component (10 pytest files) but is standalone research, not integrated into production Worker.
4. **Signal quality loop works:** outcome validator fetches real Binance klines post-signal, computes actual maxProfit vs claimed.
5. **Execution is the gap:** well-designed Docker Compose architecture with Redis/Prometheus/Grafana, but core order path is unimplemented.
