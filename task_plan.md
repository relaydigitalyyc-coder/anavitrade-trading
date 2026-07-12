# Task Plan: Full Project Review & Audit

**Goal:** Map the entire Anavitrade trading platform — architecture, all algorithm signals, backtest scripts, data flow, subsystem relationships, and gaps.

**Status:** COMPLETE ✓ — All 4 phases done. See findings.md for the full project topology map, gap report, and recommendations.

## Current Phase
Phase 4 — Synthesis (complete)

## Phases

### Phase 1: Discover & Map Subsystems
- [x] Map src/ file tree with sizes and purposes
- [x] Map all scripts/*.mjs — what each does, corpus used, results
- [x] Map src/server/analysis/ — engine, ICR, mirror, exits, derivatives
- [x] Map src/server/signals/ — MTF matrix, swing sniper, zoom, BBAWE, Market Cipher, Wolfpack, LuxAlgo
- [x] Map src/server/ — execution, CEX, Aster, fee, outcome, SMC
- [x] Map frontend — pages, components, hooks, contexts
- [x] Map data layer — db schema, drizzle, trpc
- [x] **Status:** complete

### Phase 2: Cross-Reference & Tie Together
- [x] Signal flow discovered — TWO parallel pipelines (A: analysis/engine.ts, B: signals/generator.ts)
- [x] Backtest scripts mapped — 10 scripts covering 5+ strategy families
- [x] Config duplication identified — thresholds live in brain/config, ICR config, signals config, AND scraper
- [x] Doc-script disconnect — EMPIRICAL_FINDINGS.md describes production ICR engine never tested by scripts
- [x] **Status:** complete

### Phase 3: Gap & Inconsistency Report
- [x] Dead code — bonferroniAdjust, unused tier constants, dead alpha weights, dead HA exits
- [x] No test coverage for any backtest script
- [x] Duplicated logic — sma() in 5+ files, SL/TP computed in 3 places, LiveSignalFeed in 3 places
- [x] Security gaps — ErrorBoundary stack traces, ENCRYPTION_KEY==JWT_SECRET, Bitunix no withdrawal check
- [x] Backend-frontend mismatches — Web3 dispatchSignal is stub, live portfolio stub, Aster orders scaffold
- [x] **Status:** complete

### Phase 4: Synthesis — Visual Map & Recommendations
- [x] Dependency diagram — see findings.md "Project Topology"
- [x] All scripts tied together — see findings.md "Algorithm Script Reference Map"
- [x] Prioritized fix list — see findings.md "Prioritized Fix Recommendations"
- [x] **Status:** complete

## Key Questions — Answered

| Question | Answer |
|----------|--------|
| Are all signal generators wired into the engine? | **NO** — Two parallel pipelines exist (analysis/engine.ts and signals/generator.ts). They share only the SMC validator. |
| Is the ICR engine being used or just documented? | **Partially used** — Pipeline A uses ICR for 30 4h symbols. Pipeline B ignores it entirely. Docs/analysis/EMPIRICAL_FINDINGS.md describes a different ICR dataset. |
| Which backtest results are valid vs stale? | ICT Sniper (Rule) and Anavitrade Native are valid (forward-only, WF pass). zoom-ml and mdp-zoom have lookahead bias — **discard**. |
| Are config constants duplicated? | **Yes** — brain/config.ts, ICR config, signals/config, and scraper/scoreSignal all have their own thresholds. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Parallel agent fan-out | 6 subsystems explored simultaneously |
| Start from scripts + analysis core | The "algorithmic brain" — most complex part |
| Cross-ref with docs/analysis/ | Docs were stale; code is source of truth |
