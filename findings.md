# Findings & Decisions — Project Audit 2026-07-12

## 1. PROJECT TOPOLOGY MAP

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ANAVITRADE TRADING PLATFORM                       │
│                        Topology & Data Flow                          │
└─────────────────────────────────────────────────────────────────────┘

CLOUD INFRASTRUCTURE
  ┌─ Cloudflare Worker (wrangler.toml)
  │  ├─ Hono HTTP Server (worker.ts)
  │  │   ├─ tRPC Router (routers.ts) → 24 endpoints (auth, live, demo, signals, exec, CEX, Aster)
  │  │   └─ REST API → 18 admin endpoints (analysis, backtest, mirror, paper, scraper, fee)
  │  ├─ Cron: * * * * *  → scraper → signals → dispatch  (every minute!)
  │  │           0 0 * * *  → fee crystallization
  │  └─ Database: D1 (SQLite via Drizzle) → 19 tables
  │
  └─ External APIs
      ├─ Coinlegs API          ─ signals/prices
      ├─ Binance REST API      ─ klines, balances, orders
      ├─ Bitunix REST API      ─ balances, orders (tested)
      └─ Aster DEX API         ─ scaffold only

─── TWO PARALLEL SIGNAL PIPELINES ────────────────────────────────────

PIPELINE A — "ICR Engine" (analysis/engine.ts → dispatcher.ts)
  Input:  Binance klines (30-symbol watchlist, 4h timeframe)
  Steps:  fetchKlines → enrich (MA/BB/RSI/ATR) → annotateCoilScores
          → findLatestSignals (ICR: trend→impulse→pullback→compression→trigger→volume→RR)
          → merge derivatives alpha → deduplicate → SMC validate → dispatch
  Output: analysis_signals table, execution_jobs → CEX orders
  Config: DEFAULT_ICR_CONFIG (scoreThreshold:65, minRr:1.5, coil:off)
  Used by: engine.ts (live), backtest.ts, paper-trade.ts, parameter-sweep.ts
  Status:  LIVE for 30 4h symbols

PIPELINE B — "Native Generator" (signals/generator.ts → tradeIntents → dispatch)
  Input:  Binance klines (top 150 pairs, 1h/2h/4h)
  Steps:  fetch top 200 by volume → filter to 150 → 3 timeframes × 150 pairs
          → run 5 indicators (MACD/Stoch/CCI/Ichi/Trend) + BBAWE + Market Cipher
          + Wolfpack + LuxAlgo ICT + Swing Sniper + Zoom Matrix
          → validate via SMC gate → score → create tradeIntents
  Output: trade_intents table → execution_jobs → CEX orders
  Config: Baked into generator.ts (different thresholds from Pipeline A)
  Used by: Its own cron trigger
  Status:  LIVE for 150 symbols, 3 timeframes

─── SIGNAL DETECTION MODULES (consumed by Pipeline B) ─────────────────

  src/server/signals/
  ├─ generator.ts           — Orchestrator (fetches klines, runs detectors, dispatches)
  ├─ indicators.ts           — 5 standard: MACD, Stoch, CCI, Ichimoku, Trend Reversal
  ├─ bbawe.ts                — Bollinger Bands + Awesome Oscillator (ported PineScript)
  ├─ market-cipher.ts        — WaveTrend + Money Flow + RSI + Stoch RSI + MACD divergence
  ├─ wolfpack.ts             — MACD(3,8) histogram zero-cross + divergence
  ├─ luxalgo-ict.ts          — MSS/BOS, Order Blocks, Liquidity Sweeps, FVG, Killzones
  ├─ swing-sniper.ts         — ICT order-block + swing sweep for 3%+ moves
  ├─ zoom-matrix.ts          — MDP Q-learning HTF→15m zoom entry
  └─ mtf-matrix.ts           — Multi-timeframe alignment scorer

─── ANALYSIS SUBSYSTEM (consumed by Pipeline A) ──────────────────────

  src/server/analysis/
  ├─ engine.ts               — Orchestrator (fetch→enrich→ICR→derivatives→dispatch)
  ├─ dispatcher.ts            — SMC gate + trade intent creation + CEX fan-out
  ├─ backtest.ts              — Historical ICR signal feed + outcome simulation
  ├─ paper-trade.ts           — Paper mode (no real orders)
  ├─ parameter-sweep.ts       — Grid search over ICR config space
  ├─ bridge.ts                — Coinlegs scraper → analysis_signals converter
  ├─ query.ts                 — Dashboard query API
  ├─ kline-fetcher.ts         — Binance OHLCV fetch + DB storage
  ├─ kline-repository.ts      — DB layer for klines
  ├─ indicators.ts            — SMA/EMA/RSI/BB/MACD for enrichment
  ├─ types.ts                 — Central types
  ├─ icr/
  │   ├─ signals.ts           — 10-gate ICR engine (trend→impulse→pullback→compression→trigger→volume→RR)
  │   ├─ structure.ts         — Trend detection, impulse finder, pullback validator, compression detector
  │   ├─ config.ts            — DEFAULT_ICR_CONFIG (30+ params)
  │   └─ coil.ts              — 11-component coil/coiling-pump scoring
  ├─ mirror/
  │   ├─ engine.ts            — Standalone mirror runner (NOT wired to either pipeline)
  │   ├─ detector.ts          — 5 candle-based indicator detectors
  │   ├─ scorer.ts            — Coinlegs-style scoring
  │   └─ indicators-extra.ts  — MACD/Stoch/CCI/Ichimoku computations
  ├─ exits/
  │   ├─ exit-engine.ts       — Smart exit simulation (trail + exhaustion)
  │   ├─ trailing.ts          — Ratcheting trailing stop
  │   ├─ fibonacci.ts         — Fib extension TP targets
  │   ├─ exhaustion.ts        — 5-signal exhaustion detector
  │   └─ heikin-ashi.ts       — HA candle computation + color-flip exits
  └─ derivatives/
      ├─ alpha.ts             — OI/funding/LS ratio alpha score
      └─ fetcher.ts           — Binance futures data fetcher (15 symbols)

─── EXECUTION & EXCHANGE LAYER ───────────────────────────────────────

  src/server/execution/
  ├─ dispatch.ts              — Fan-out engine (intent → all active CEX connections)
  ├─ riskEngine.ts            — 7-gate risk policy (global kill → connection → daily loss → exposure)
  ├─ router.ts                — tRPC endpoints for execution controls
  └─ types.ts                 — Connection row type

  src/server/cex/
  ├─ adapter.ts               — CexExecutionAdapter (implements ExecutionAdapter)
  ├─ binance.ts               — BinanceFuturesClient [LIVE, FUNCTIONAL]
  ├─ bitunix.ts               — BitunixFuturesClient [LIVE, FUNCTIONAL]
  ├─ factory.ts               — Client factory
  ├─ registry.ts              — Exchange metadata (binance, bitunix LIVE; bybit/okx/etc scaffold)
  ├─ router.ts                — tRPC endpoints for connection management
  ├─ signing.ts               — Web Crypto signing (HMAC-SHA256, Bitunix double-SHA256)
  └─ store.ts                 — CRUD + credential encryption

  src/server/aster/
  ├─ client.ts                — AsterApiClient [SCAFFOLD — submitOrder throws NOT_WIRED]
  ├─ config.ts                — Builder address, fee rate
  ├─ router.ts                — tRPC endpoints for agent onboarding
  ├─ signing.ts               — secp256k1 keypair (viem)
  ├─ store.ts                 — CRUD + signer key encryption
  └─ types.ts                 — Shared ExecutionAdapter interface

─── SUPPORTING SERVER MODULES ────────────────────────────────────────

  src/server/
  ├─ worker.ts                — Entry point: Hono server + cron wiring
  ├─ coinlegs-scraper.ts      — Fetches signals from Coinlegs, scores, SMC-validates, dispatches
  ├─ binance.ts               — Legacy Binance settings (separate from CEX module)
  ├─ sdk.ts                   — JWT signing/verification/auth
  ├─ context.ts               — tRPC request context
  ├─ db.ts                    — DB access + syncSignalsToDemoAccounts
  ├─ routers.ts               — tRPC router composition
  ├─ fee/engine.ts            — 2/20 fee crystallization
  ├─ outcome/validator.ts     — Coinlegs maxProfit vs actual kline validator
  ├─ smc/validator.ts         — 8-gate SMC structural validator (HEURISTIC — no kline data)
  └─ brain/config.ts          — 200-line centralized trading parameters (partially unused)

─── FRONTEND ─────────────────────────────────────────────────────────

  src/
  ├─ App.tsx                  — wouter routing, AnimatePresence (18 routes)
  ├─ pages/                   — 17 page components
  │   ├─ Dashboard.tsx        — Main trading dashboard (live + demo modes)
  │   ├─ DemoDashboard.tsx    — Token-authenticated demo
  │   ├─ PublicDemo.tsx       — Unauthenticated investor preview (980 lines!)
  │   ├─ HistoricalPerformance.tsx — Signal analysis + algo rules
  │   ├─ Home.tsx             — Marketing landing (14 sections)
  │   └─ ... (auth, onboarding, settings, legal pages)
  ├─ components/
  │   ├─ dashboard/           — 9 dashboard components (TopNavBar, LiveSignalFeed, etc.)
  │   ├─ home/                — 14 home page sections + 5 primitives
  │   ├─ ui/                  — 40+ shadcn/ui components
  │   ├─ WalletConnectModal.tsx — Ledger/MetaMask/WalletConnect/Coinbase
  │   └─ TradeChartSnapshot.tsx — Mini chart in demo trade rows
  ├─ hooks/                   — 6 custom hooks
  ├─ lib/                     — trpc.ts, wagmi.ts, utils.ts
  └─ contexts/ThemeContext.tsx — Dead theme toggle (switchable never set true)

─── BACKTEST SCRIPTS ─────────────────────────────────────────────────

  scripts/
  ├─ unified-backtest.mjs     — 5-strategy comparison [VALID]
  ├─ mtf-matrix-backtest.mjs  — 19 detection layers [PARTIALLY VALID — uses ddPct]
  ├─ train-sniper-zoom.mjs    — ML-trained sniper + zoom MDP [VALID — forward-only]
  ├─ final-report.mjs         — Aggregates results from all backtests
  ├─ zoom-ml-backtest.mjs     — Parameter sweep [LOOKAHEAD BIAS — uses trade.win]
  ├─ mdp-zoom-train.mjs       — Q-learning [LOOKAHEAD BIAS — uses pnlPct]
  ├─ full-backtest.mjs        — Fetches from Coinlegs directly [OUTPUT MISSING]
  ├─ backtest.mjs             — Calls live tRPC API [OUTPUT MISSING]
  ├─ run-native-corpus.mjs    — Generates own Binance corpus
  └─ validate-native.mjs      — Binance validation against Coinlegs signals

─── DOCUMENTATION ────────────────────────────────────────────────────

  docs/analysis/
  ├─ ARCHITECTURE.md          — Pipeline A architecture (stale — doesn't describe Pipeline B)
  ├─ API.md                   — API endpoint reference
  └─ EMPIRICAL_FINDINGS.md    — ICR engine findings (655 outcomes, 30 symbols, 6 months)
                                **DISCONNECTED from all backtest scripts — no script reproduces these**
```

## 2. ALGORITHM SCRIPT REFERENCE MAP

Each script and what it tests / produces:

| Script | Corpus | Strategies | Forward-Only? | WF Pass? | Output File |
|--------|--------|------------|--------------|----------|-------------|
| `unified-backtest.mjs` | `backtest-prioritized.json` (1265 trades) | ICR, Native, Hybrid, Consensus, ICT Sniper | ✅ Yes | ✅ (Native, Hybrid, Sniper) | `unified-backtest-results.json` |
| `train-sniper-zoom.mjs` | Same | Rule Sniper, ML Sniper, Zoom+Sniper | ✅ Yes | ✅ | `sniper-zoom-results.json` |
| `mtf-matrix-backtest.mjs` | Same | 19 detection layers, 5 combos | ⚠️ Mixed (uses ddPct) | — | `mtf-matrix-results.json` |
| `full-backtest.mjs` | Coinlegs API (live) | ATR stop, R-multiple TP | ✅ Yes | — | ❌ MISSING |
| `backtest.mjs` | Live tRPC API | ATR stop, R-multiple TP | ✅ Yes | — | ❌ MISSING |
| `zoom-ml-backtest.mjs` | `backtest-prioritized.json` | Parameter sweep | ❌ NO (uses trade.win) | — | `zoom-ml-results.json` |
| `mdp-zoom-train.mjs` | Same | Q-learning MDP | ❌ NO (uses pnlPct) | — | `mdp-zoom-results.json` |
| `run-native-corpus.mjs` | Live Binance | 5 indicators, 4h/1h | ✅ Yes | — | `native-corpus.json` |
| `validate-native.mjs` | `/tmp/coinlegs_prioritized.json` | ATR stop, 3R TP | ✅ Yes | — | `binance-validated.json` |
| `final-report.mjs` | N/A — reads result files | Aggregation | — | — | (stdout only) |

**Valid results to trust:**
1. ICT Sniper (Rule) — 694 trades, 68% WR, Sharpe 7.00, WF PASS
2. Anavitrade Native — 897 trades, 64.3% WR, Sharpe 5.85, WF PASS
3. Zoom ML + Sniper — 704 trades, 63.2% WR, Sharpe 5.85, WF PASS

**Results to discard (lookahead bias):**
- `zoom-ml-results.json` — trained on future data
- `mdp-zoom-results.json` — reward uses pnlPct

## 3. BACKTEST SCRIPTS — Critical Methodological Issues

| Script | Issue | Severity |
|--------|-------|----------|
| `zoom-ml-backtest.mjs` | Uses `trade.win` directly in `computeLTFConf()` — CCI/Stoch weight as `isWinner ? 1.2 : 0.7` | **CRITICAL** |
| `mdp-zoom-train.mjs` | Reward uses `trade.pnlPct`; `classifyState()` uses `ddPct` + `pnlPct` | **HIGH** |
| `mtf-matrix-backtest.mjs` | Uses `ddPct` as sweep-depth proxy in 12 of 22 layers | **MEDIUM** |
| Unified backtest returns 75B%+ | Full reinvestment, no slippage/fees/caps | **MEDIUM** — relative ranking only |
| Doc-script disconnect | `EMPIRICAL_FINDINGS.md` describes ICR engine never tested by scripts | **HIGH** |

## 4. EXECUTION PIPELINE — Key Findings

### Functional Status
| Exchange | Orders | Cancel | Balance | Permission Check |
|----------|--------|--------|---------|-----------------|
| **Binance** | ✅ LIVE | ❌ Not wired | ✅ | ✅ Best-effort |
| **Bitunix** | ✅ LIVE | ❌ Not wired | ✅ | ❌ User-attested only |
| **Aster DEX** | ❌ Scaffold (throws NOT_WIRED) | ❌ | ❌ | ❌ |
| Bybit, OKX, Coinbase, etc. | ❌ Scaffold | ❌ | ❌ | ❌ |

### Security Gaps
1. **HIGH**: `ENCRYPTION_KEY` falls back to `JWT_SECRET` — same key for signing + encryption
2. **HIGH**: Scraper auto-dispatches Tier A signals to ALL connections — no human confirmation
3. **MED**: Admin API shared-secret (`x-admin-api-key`), no per-admin audit trail
4. **MED**: Bitunix withdrawal permissions purely user-attested
5. **LOW**: Decrypted credentials in memory, no explicit zeroing
6. **LOW**: Public signal endpoints expose internal trading data

## 5. FRONTEND — Issues Found

| Severity | Issue | File |
|----------|-------|------|
| **HIGH** | ErrorBoundary renders stack traces in production | `ErrorBoundary.tsx:37-39` |
| **MED** | LedgerOnboarding `onConnected` type mismatch — address never set | `LedgerOnboarding.tsx:498` |
| **MED** | Theme toggle dead — `switchable` never set true | `ThemeContext.tsx` |
| **MED** | Duplicate `topBangers` tRPC calls on home page | Home sections |
| **LOW** | `PublicDemo.tsx` — 980 lines, 5 inline sub-components | `PublicDemo.tsx` |
| **LOW** | `LiveSignalFeed` duplicated across 3 files | 3 locations |
| **LOW** | ForgotPassword mutation no `onError` handler | `ForgotPassword.tsx` |
| **LOW** | No route-level code splitting | `App.tsx` |

## 6. DATA & ROUTING — What's Real vs Stub

| Component | Status |
|-----------|--------|
| Authentication (PBKDF2, JWT, email verification) | **REAL** |
| Coinlegs scraping + signal pipeline | **REAL** (cron every minute) |
| Demo accounts + signal sync | **REAL** (complete simulation engine) |
| Binance/Bitunix execution | **REAL** (functional market orders) |
| Fee crystallization (2/20 model) | **REAL** (cron daily) |
| Outcome validation (maxProfit vs klines) | **REAL** (binance public api) |
| SMC structural validator | **HEURISTIC** — no kline data, purely metadata proxies |
| Derivatives alpha | **HALF-DEAD** — OI change always 0 (no prev data passed) |
| Web3 dispatchSignal | **STUB** — writes audit log, no onchain tx |
| Aster DEX orders | **SCAFFOLD** — submitOrder throws NOT_WIRED |
| Live portfolio tracking | **STUB** — Dashboard shows empty data |
| Theme toggle | **DEAD** — switchable never set true |
| Web3 copytrade | **STUB** — "will activate once algo signal feed is wired in" |

## 7. ARCHITECTURAL CONCERNS

### A. Two Parallel Signal Pipelines
Pipeline A (ICR, 30 symbols, 4h) and Pipeline B (Native, 150 symbols, 1h/2h/4h) run independently. They:
- Have different symbol universes
- Use different timeframes
- Have different scoring thresholds
- Compute SL/TP differently (3 conflicting formulas!)
- Share only the SMC validator
- Could produce conflicting trades on the same symbol

### B. Triple SL/TP Computation
1. `analysis/engine.ts` `buildSignal()` computes one SL/TP
2. `analysis/dispatcher.ts` `dispatchSignal()` recomputes from scratch with 2% ATR buffer — IGNORES signal's values
3. `signals/generator.ts` uses a third formula (ATR estimate × 5x/4x/3x RR multipliers)

### C. SMC Validator is Purely Heuristic
Despite gate names that imply structural analysis ("sweep", "displacement", "MSS"), the `smc/validator.ts` implementation uses only `SignalContext` metadata: timeframe quality + indicator type + confluence count + 24h% change. **No actual kline data is examined.**

### D. Duplicated Indicator Code
`sma()` is implemented in at least 5 files with different signatures. Three separate indicator modules exist.

### E. Mirror Subsystem Entirely Standalone
`analysis/mirror/engine.ts` is well-constructed but not wired into either pipeline. Only used for offline comparison.

## 8. PRIORITIZED FIX RECOMMENDATIONS

### Critical (fix immediately)
1. **Unify SL/TP computation** — Pick one formula (recommend: ICR engine's structural SL + 5R TP with wide trail), use it consistently across dispatcher, generator, and engine
2. **Fix ENCRYPTION_KEY fallback** — Set `ENCRYPTION_KEY` as separate `wrangler secret`, never fall back to `JWT_SECRET`
3. **Fix ErrorBoundary** — Hide stack traces in production

### High (fix this sprint)
4. **Harmonize the two signal pipelines** — Either merge them or document why they coexist. At minimum, deduplicate across symbols/timeframes.
5. **Add human confirmation to auto-dispatch** — Require manual approval before Tier A signals fire real orders, or add a circuit-breaker that pauses after N auto-trades
6. **Fix derivatives alpha** — Pass previous snapshot data so OI change velocity actually works
7. **Remove lookahead bias from ML scripts** — Fix `zoom-ml-backtest.mjs` and `mdp-zoom-train.mjs` or delete them
8. **Fix LedgerOnboarding type mismatch** — `onConnected` callback parameter is swallowed

### Medium (this week)
9. **Migrate to single sma()** — Pick one implementation, delete the other 4+
10. **Fix `bonferroniAdjust`** — Either implement it or remove the field from config
11. **Install admin audit trail** — Replace shared-secret admin auth with per-admin JWT
12. **Add Bitunix withdrawal check** — At minimum document the risk prominently

### Low (technical debt backlog)
13. **Extract `PublicDemo.tsx`** — Split 980-line file into components
14. **Deduplicate `LiveSignalFeed`** — Unify the 3 implementations
15. **Connect mirror engine** — Wire it into one of the two pipelines
16. **Add route-level code splitting** — `React.lazy` for auth, demo, settings pages
17. **Fix scripts that don't write output** — `backtest.mjs`, `full-backtest.mjs`
18. **Enable route-level code splitting** — Reduce initial bundle size

## 9. DEAD CODE & UNUSED EXPORTS

| Item | File | Status |
|------|------|--------|
| `bonferroniAdjust` field | `types.ts` IcrConfig | Declared, never read |
| `TIER_A_THRESHOLD` / `TIER_B_THRESHOLD` constants | `icr/config.ts` | Exported, never imported |
| `AlphaConfig` weight fields | `derivatives/alpha.ts` | Defined, never used in calculation |
| `haExhaustion()` | `exits/heikin-ashi.ts` | Exported, never called |
| `_direction` param | `exits/trailing.ts` | Underscored, never used |
| `maxProfit` field | `smc/validator.ts` SignalContext | Declared "NOT used by validator" |
| `SignalSource` union | `types.ts` | Missing "coinlegs_mirror" |
| `TriggerResult` type | `icr/structure.ts` | Exported, never used |
| React import in Dashboard/DemoDashboard | | Unnecessary with JSX transform |
