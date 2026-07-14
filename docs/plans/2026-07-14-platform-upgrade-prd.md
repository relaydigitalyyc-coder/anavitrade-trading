# PRD: Platform Infrastructure Upgrade

**Status:** Draft — for next infrastructure upgrade

## Current State (Beta - Live at `anavitrade-trading.erhazeariel.workers.dev`)

### Working ✅
- Coinlegs scraper: 1,400+ signals, cron running every 60s
- 8 CEX exchange clients (Binance, Bitunix, Bybit, OKX, Kraken, KuCoin, Gate.io, Coinbase)
- CEX connection management with encrypted key storage
- Aster DEX activation flow (EIP-712 signing via viem)
- Dashboard: refactored to 9 components + 3 hooks, 1285→220 lines
- Unified balance aggregation (DEX + CEX)
- tRPC API: 24 endpoints (auth, live, demo, signals, exec, CEX, Aster)
- REST API: 18 admin endpoints
- Outcome validator: ~1,400 signals tracked, 52% validated
- Fee engine: 2&20 model, quarterly periods
- Pinoneered: new UI kit, shadcn-style glassmorphism, `MarketTickerRail`, `DashboardLayout`

### Blocked by Cloudflare 50-Subrequest Cap 🟡
- Analysis engine completes but finds 0 symbols (klines table empty)
- Backtest parameter sweep can't run
- Signal spotting API not available
- Native signal generator exceeds subrequest limit

### Not Yet Wired 🔴
- Live order execution (needs static egress IP for exchange API whitelisting)
- Fee collection (payment provider integration)
- Error reporting (Sentry/DataDog)
- Alerting (Slack/webhook for cron failures)

## Phase 1: Compute Upgrade

### Server Requirements
| Resource | Current (Workers) | Target (VPS) |
|---|---|---|
| Subrequest limit | 50 | Unlimited |
| Execution timeout | 30s (Workers) | Unlimited |
| Memory | 128MB | 1GB+ |
| Static egress IP | ❌ | ✅ |
| Cost | Free | ~$10-20/mo |

### Migration Path
1. Deploy Node.js backend on VPS (Hono or Express)
2. Point Workers to VPS for heavy endpoints (analysis, backtest)
3. Keep Workers as edge cache + auth gateway
4. Set static egress IP via VPS provider

## Phase 2: Data Layer Upgrade

### D1 → PostgreSQL
- D1: 5GB DB limit, 50k rows/s write limit
- PG: unlimited, proper migrations, better indexing
- Migration: Drizzle ORM already abstracts the dialect

### R2 Kline Warehouse
- Store raw klines in R2 (parquet or compressed JSON)
- D1 stores only latest 200 candles per pair
- R2 stores full history for backtesting

## Phase 3: Monitoring & Operations

### Required
- Sentry for error tracking
- Grafana dashboard for cron health
- Slack webhook for: cron failure, fee crystallization, new user signup
- Daily backup of D1 to R2

## Estimated Costs Post-Upgrade
- VPS: $10-20/mo
- R2 storage: ~$0.01/GB/mo (negligible)
- PostgreSQL (Neon/Turso): $0-10/mo
- Total: ~$20-30/mo

## Beta Until Upgrade
The current Workers deployment is a fully functional beta. All user-facing features work: auth, dashboard, signal feed, demo trading, exchange connection management, and account settings. The analysis engine, backtest infrastructure, and kline warehouse require the compute upgrade described above.
