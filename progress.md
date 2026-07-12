# Progress Log

## Session: 2026-07-12

### Phase 1: Discover & Map Subsystems
- **Status:** in_progress
- **Started:** 2026-07-12
- Actions taken:
  - Created task plan for full project audit
  - Launched 5 parallel agents for subsystem exploration
- Files created/modified:
  - task_plan.md (created)
  - progress.md (created)
  - findings.md (created)

### Phase 1 Progress
- **Agent 1 (data/routing):** COMPLETE
  - 19 DB tables mapped, 24 tRPC routes listed
  - Key finding: Web3 `dispatchSignal` is a stub — writes audit log, no actual onchain tx
  - Key finding: 24 tables, 7 indexes, real schema
  - Key finding: Brain config (200 lines) is centralized but not referenced by all modules
- **Agent 2 (analysis/signals):** COMPLETE
  - 28 files read across ICR, mirror, exits, derivatives, signals modules
  - CRITICAL: Two parallel trading pipelines (Pipeline A vs Pipeline B) — different symbols, TFs, dispatch
  - CRITICAL: Triple SL/TP computation — signal SL/TP discarded by dispatcher
  - HIGH: Derivatives alpha half-dead — OI change always 0 (no prev data passed)
  - HIGH: SMC validator is purely heuristic (no actual kline examination)
  - MED: Mirror subsystem entirely standalone, not wired to either pipeline
  - MED: sma() duplicated across 5+ files with different signatures
- **Agent 3 (execution/CEX/Aster):** COMPLETE
  - Dispatch engine: live, functional, with db-level idempotency
  - Binance + Bitunix clients: fully functional for market orders
  - Aster DEX: scaffold only — submitOrder() throws NOT_WIRED
  - Risk engine: 7 gates (global kill → per-connection → daily loss → exposure cap)
  - Scraper auto-dispatches Tier-A signals to all CEX connections (no human confirmation!)
  - HIGH: ENCRYPTION_KEY falls back to JWT_SECRET in dev (same key for signing + encryption)
- **Agent 4 (frontend):** COMPLETE
  - 18 routes mapped, all components used
  - HIGH: ErrorBoundary exposes stack traces in production
  - MED: LedgerOnboarding onConnected type mismatch (address never set)
  - MED: Dead theme toggle (switchable never set to true)
  - MED: Duplicate tRPC queries on home page (topBangers called twice)
  - PublicDemo.tsx is 980 lines — extract sub-components
  - LiveSignalFeed duplicated across 3 files
- **Agent 5 (scripts/docs):** COMPLETE
  - 10 scripts audited, 5 result files exist, 2 missing
  - Critical: "zoom-ml-backtest.mjs" uses trade.win in scoring (lookahead bias)
  - Critical: "mdp-zoom-train.mjs" uses pnlPct in reward function (lookahead bias)
  - Doc-script gap: EMPIRICAL_FINDINGS.md describes production ICR engine never tested by scripts
  - Most trustworthy result: ICT Sniper (Rule-Based): 694t, 68% WR, Sharpe 7.00, WF PASS

### Phases 2-4: Synthesis Complete
- Findings compiled into comprehensive project map in findings.md
- 18 prioritized fix recommendations (3 critical, 5 high, 4 medium, 6 low)
- All 5 agents finished — full topology map covers 50+ modules across 7 subsystems
- Key deliverables: topology diagram, algorithm script reference map, security gap report, dead code inventory
