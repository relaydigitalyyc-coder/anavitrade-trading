# Analysis Engine API Reference

## Architecture Decision: Routes Live in worker.ts

All analysis engine API endpoints are defined directly in `src/server/worker.ts` as Hono routes (NOT in the tRPC router). This simplifies deployment — the analysis engine runs as standalone REST endpoints, not mediated through tRPC. Routes use `setDbEnv(c.env)` for database access.

## Admin-Authenticated Routes

These require `x-admin-api-key` header matching `ADMIN_API_KEY` env var. If ADMIN_API_KEY is unset, they fail with 500 ("ADMIN_API_KEY not configured on server").

### POST /api/backtest/run
Run a historical backtest on Binance klines.
Body: `{ symbol: string, timeframe: string, lookbackBars: number, minScore: number }`
Returns: `BacktestResult` with signal outcomes and summary stats (win rate, avg R, total R, PF, max drawdown, Sharpe)

### POST /api/backtest/sweep
Grid search over ICR parameters against historical data.
Body: `{ symbol: string, timeframe: string, lookbackBars: number, scoreThresholds: number[], minCoilScores: number[], minRrs: number[], enableCoilGates: boolean[] }`
Returns: Array of `SweepResult` sorted by total R descending. Each has combo config + signal count + win rate + avg R + total R + PF + Sharpe.

### GET /api/backtest/compare
Compare ICR engine against simple MA crossover baseline.
Query: `?symbol=BTCUSDT&timeframe=4h&lookbackBars=500`
Returns: `{ icr: BacktestResult, baseline: BacktestResult }`

### POST /api/paper-trade/run
Run analysis engine in paper mode (generates signals, logs to analysis_signals with dispatched=0, does NOT create TradeIntents).
Returns: `{ signalsFound: number, qualified: UnifiedSignal[], skipped: number }`

### GET /api/paper-trade/outcomes
Validate outcomes of aged paper trades against Binance klines.
Returns: `{ validated: number, avgOutcome: number, winners: number, losers: number, summary: Record<string, stats> }`

### GET /api/engine/stats
Engine health and aggregate statistics from analysis_signals.
Returns: total signals by source, avg score, recent run status

### POST /api/analysis/run
Manually trigger one full engine cycle (kline fetch → enrich → ICR → derivatives → dispatch). Runs the same pipeline as the cron handler.

### POST /api/mirror/run
Run Coinlegs mirror detection across all 7 timeframes. Stores detections in analysis_signals with source="coinlegs_mirror", dispatched=0.
Query: `?symbols=BTCUSDT,ETHUSDT&timeframes=4h,1d&compare=true&since=1234567890`

### GET /api/mirror/compare
Read stored mirror detections and Coinlegs signals, return precision/recall/f1/lead-time metrics.
Query: `?since=1234567890` (default: 2 hours ago)

## Public Routes

### GET /api/signals
Paginated unified signal query across all sources.
Query: `?source=icr&tier=A&timeframe=4h&symbol=BTCUSDT&direction=long&minScore=70&dispatchStatus=all&page=0&limit=20`
Returns: `{ signals: UnifiedSignal[], total: number, stats: { totalBySource, avgScoreBySource } }`

### GET /api/signals/stats
Aggregate statistics across all signal sources.
Query: `?since=1234567890`
Returns: counts by source, avg score, tier distribution

### GET /api/signals/compare
Side-by-side comparison of Coinlegs vs ICR signals.
Returns: counts, avg scores, tier distributions for each source

### POST /api/signals/backfill
One-shot backfill: bridges historical Coinlegs signals into analysis_signals table. Admin only.

## Coinlegs Scraper Routes (also in worker.ts)

### POST /api/scraper/run
Trigger Coinlegs scraper manually. Admin required.
### POST /api/scraper/backfill
Paginate Coinlegs API across date range. maxPages=5 cap. Admin required.
### POST /api/outcome/validate
Validate signal outcomes against Binance klines. Admin required.
### GET /api/outcome/stats
Aggregate outcome validation metrics. Public.
### POST /api/fee/crystallize
Trigger fee crystallization. Admin key required.

## How Routes Are Called

Cron handler in `worker.ts` runs every 5 minutes:
1. Coinlegs scraper (always)
2. Fee crystallization (daily check)
3. Outcome validation (every 15 min)
4. Analysis engine (every cycle)
