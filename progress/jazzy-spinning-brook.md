## Session: jazzy-spinning-brook (started 2026-07-18T19:46:45Z)

### Rules↔ML cross-pollination
- Track A: ran `locked-walkforward-backtest.py` on the 120-day/49-pair corpus for real.
  Gate FAILS cleanly: 0 qualified test trades, calibrated probs cap at 0.243 vs 0.52
  threshold. Commit `f21473b`.
- Track B: wired `divergence.py` (RSI/MACD/AO divergence, previously dead code) +
  WaveTrend (Market Cipher B) + Money Flow + Stochastic RSI into `features.py`/
  `enrichment.py`/`train.py` as candidate features, isolated from the frozen meta-v22
  locked-gate contract. Smoke-verified non-degenerate. Commit `844f30e`.
- Track C: live calibrated ML probability now refines entry *timing* (confirmation band
  in `dispatch-gate.ts`, not sizing per user correction) — marginal-score signals dispatch
  as a LIMIT order pulled back toward the stop instead of chasing at market. Commit `33451da`.
- Deferred: LuxAlgo SMC's EQH/EQL + Premium/Discount zones (genuinely new, belongs in
  `smc.py`), internal-vs-swing two-scale structure, drawdown circuit-breaker/cooldown
  (blocked on trade-outcome attribution not existing anywhere yet).

### Incident: stale-read clobber of progress.md
- A Read-then-Edit race against a concurrent session's commit caused ~117 lines of that
  session's history to be discarded when I committed. Caught, restored in full from git
  history (`c414956~1`), corrected inline rather than deleting the other session's note.
  Fixed in `ca56319`. This incident is the direct motivation for Part 2 below.

### Part 1 — VPS testing consolidation (in progress)
- Found: VPS cron (`0 */6 * * * vps-train.sh`) runs the leaky `train.py` path and
  blind-`cp`'s every historical `meta-v*/` dir (20+) into production models with zero
  gating; includes a broken DL step and a 0-trade RL step. The honest tool
  (`locked-walkforward-backtest.py`) has never been on a schedule. A third, older,
  disconnected AUC-floor gate (`scripts/cortex/modules/metacognitive-train.js`) also
  exists, unwired.
- Plan: new `scripts/ml/vps-locked-gate.sh` — daily cron, runs the locked gate, deploys
  only on pass to a single `champion/` dir, ledger-logs every run (pass or fail).

### Part 2 — Multi-session coordination (in progress)
- Session registry: `.claude/sessions/<slug>.json` (this file: `jazzy-spinning-brook.json`).
- Per-session append-only progress logs (this file) replacing direct edits to the shared
  `progress.md`, which becomes a generated roll-up via `scripts/merge-session-logs.sh`.
- Advisory lock convention (`.claude/locks/<file>.lock`) for genuinely singular shared
  files that can't be append-only.
- Convention documented in `docs/ops/multi-session-coordination.md`.

### Part 1 — VPS testing consolidation (done)
- Wrote `scripts/ml/vps-locked-gate.sh`: daily cron, fetches a fresh checksum-verified
  49-pair/120-day corpus (`binance_archive.py`, window ends at the last completed month —
  Binance Vision has no current-month monthly archive, discovered during testing),
  runs `locked-walkforward-backtest.py`, deploys to `/opt/anavitrade/models/champion/`
  only on `test.acceptance.passed`, ledger-logs every run to `locked-gate.jsonl`.
- Tested end-to-end on the live VPS (user-authorized SSH) with a 2-symbol smoke corpus:
  fetch -> gate -> ledger all verified working; confirmed fail-closed behavior (gate
  failed on the tiny sample, champion/ correctly left untouched).
- Found and fixed a real gap along the way: `meta-v22-definitive/model_card.json` (the
  frozen contract) was never on the VPS — `deploy-vps.sh`'s rsync excludes all `*.json`.
  Copied the contract (`model_card.json` + `classifier.txt`) to the VPS as a one-time
  prerequisite; not yet added to the automated deploy script (follow-up).
- Backed up the existing crontab (`/tmp/crontab.bak.20260718230454` on the VPS) and
  swapped `0 */6 * * * vps-train.sh` (leaky path, blind-deployed 20+ historical model
  dirs, broken DL/RL steps) for `0 3 * * * vps-locked-gate.sh`.
- Documented in `docs/ops/SYSTEM_OPERATIONS.md`: CORTEX's AUC-floor gate marked
  deprecated for the meta-v22 lineage (kept for reference/other lineages), new
  VPS-locked-gate section added.

### Part 1 follow-up — continuous altcoin coverage, not repeated re-fetching
- User correction: the gate shouldn't just refresh candles for the same 49
  pairs forever -- it should expand to test altcoins not yet covered.
- New `scripts/ml/select-untested-pairs.py`: pulls the live Binance USD-M
  perpetual universe (~480 symbols after majors + illiquid-floor exclusion),
  ranks by 24h quoteVolume **ascending** (deliberately -- edge shows up on
  smaller alts per EMPIRICAL_FINDINGS.md, a volume-descending queue would
  starve exactly those), picks the next untested batch of 20, persists state
  in `scripts/cortex/memory/tested-pairs.json`, cycles once the universe is
  exhausted. Filtered out a non-ASCII anomaly symbol found during testing.
- Wired into `vps-locked-gate.sh` as a new [1/4] step, replacing the static
  49-pair file (deleted).
- Hit the VPS's known fapi.binance.com geo-block (HTTP 451) on the
  exchangeInfo/ticker endpoints this selector needs (data.binance.vision, used
  for the actual kline archives, is unaffected). Added the same X-MBX-APIKEY
  bypass-header pattern already used by kline-cron.ts/fetch-klines-mtf.mjs,
  plus a `.env`-sourcing step in the cron script so cron's minimal environment
  picks up `BINANCE_API_KEY` once set. **Blocked on a credential**: no
  Binance API key is configured on the VPS yet (read-only market-data key is
  sufficient -- no trading permission needed). Asked the user to provide one.
- Verified fail-closed behavior end-to-end on the VPS without the key: logs
  a `select_pairs` stage failure to the ledger, doesn't crash, doesn't touch
  champion/. Feature is inert (falls back to failing safely) until the key
  is added, at which point the daily cron will start expanding coverage
  automatically with no further changes needed.
