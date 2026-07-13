# Findings & Decisions

## 2026-07-12 Production Pipeline Blockers

### 1. D1 Date Serialization (PARTIALLY FIXED)
**Root cause:** Drizzle ORM's `integer({ mode: "timestamp_ms" })` converts epoch-ms to Date objects → ISO strings → D1 `INTEGER` columns reject ISO strings with `D1_TYPE_ERROR: Type 'object' not supported`.

**Fix applied:** Changed `coinlegs_signals` columns (`signalDate`, `recordDate`, `scrapedAt`) to `integer({ mode: "number" })`. For SELECT queries use `gte(col, val as any)`. For INSERT use raw D1 binding: `getRawD1().prepare(sql).bind(...vals).run()`.

**Still broken:** The scraper's confluence SELECT still uses `new Date()` in a `sql` template (line 238). Need `Date.now()` instead. See `grep -n "new Date(" src/server/coinlegs-scraper.ts`.

### 2. D1 100-Variable Limit (FIXED)
`inArray(coinlegsSignals.signalId, [...120+ IDs])` hit D1's statement variable limit. Fixed by chunking to 80 IDs per query.

### 3. Cron Counter Durability (FIXED)
In-memory `_cronCount` reset on Worker restarts. Now persisted to `global_settings` table via `loadCronCount()`/`saveCronCount()`.

### 4. analysis_signals Bridge (PENDING)
Disabled in scraper — `analysis_signals` table still uses `timestamp_ms` columns. Fix: change to `number` mode.

### 5. Known Production Gaps
- **Error reporting:** No Sentry/DataDog integration. Errors silently caught.
- **Fee collection:** Engine tracks 2&20 but no payment provider integration.
- **Alerting:** No webhook/slack for cron failure notification.
- **Wrangler version:** v3.114 (v4 available: `npm i --save-dev wrangler@4`)
- **Secrets:** `ENCRYPTION_KEY` and `JWT_SECRET` both dev values locally. Must be different in prod.

## 2026-07-13 UI Upgrade Production Caveats Audit

Canonical note for agents: `docs/ops/2026-07-13-ui-prod-caveats-audit.md`.

Key findings:
- Production frontend API routing is hard-coded through `src/config.ts` to the Cloudflare Worker origin; use env-based routing before relying on previews, staging, or custom domains.
- Worker CORS currently allows localhost and the main Vercel app origin only; preview/custom origins need deliberate handling for credentialed tRPC calls.
- Authenticated dashboard QA remains a gap even though `npx tsc --noEmit`, `npx vite build`, `pnpm run check`, and public/login responsive smoke checks passed.
- `MarketTickerRail` still includes curated fallback market items and must not be described as exchange-authoritative real-time price data until wired to a live source.
- Root providers and third-party embeds remain production performance/resilience risks: Wagmi/wallet/chart/motion chunks need continued bundle audits, and TradingView iframes need graceful runtime fallbacks.
