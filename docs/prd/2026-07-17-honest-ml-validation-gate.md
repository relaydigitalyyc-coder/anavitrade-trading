# PRD: Honest ML Validation Gate

**Status:** Draft — no code changes yet, diagnosis only
**Date:** 2026-07-17
**Priority:** Blocks any further "goals met" model claim
**Owner:** ML Pipeline
**Related:** `docs/analysis/EMPIRICAL_FINDINGS.md` (ICR engine — the discipline this PRD ports over)

## Executive Summary

Three consecutive commits claimed the trading model was production-ready:

```
dc722bb 🎯 GOALS MET: 80% WR, PF=10 on true chronological split (MTF context)
e97a144 🎯 GOALS MET: 67-77% WR, PF=5.1-8.2 on expanded data (meta-v21)
70d2736 🎯 meta-v22-definitive: 65% WR, PF 3.1, MaxDD 8% — goals met
```

Each was superseded within days. Today's session reproduced the pattern twice in one
sitting: retraining on a properly time-aligned 120-day/49-pair corpus (267,540 rows,
up from ~2,500) collapsed AUC to 0.531 (WR 44.4%, PF 2.00, n=54 test trades).
Splitting into the two regimes the false-negative study said were being conflated
(OVERSOLD_REVERSAL, MOMENTUM_CONTINUATION) did not recover edge — both came back at
~0.52 AUC independently, one of them *worse* than the pooled model.

This is not a data problem or an architecture problem. It is a **validation
methodology problem**, and it has a specific, locatable root cause below. The fix
already exists in this repo, fully built and tested, and has never been adopted as
the default path.

## Root Cause

`scripts/ml/pipeline/model.py::train_chronological` selects its reported operating
threshold like this:

```python
for t in np.arange(0.50, 0.88, 0.02):
    mask = probs_calibrated >= t
    ...
    s = p.mean() / p.std() * np.sqrt(len(p))   # Sharpe computed on the TEST set
    if s > best_sharpe: best_sharpe = s; best_t = t
```

The threshold is chosen by scanning the **test set itself** for whichever cutoff
maximizes Sharpe, then the WR/PF/Sharpe **at that same threshold on that same test
set** is reported as the model's performance. This is not out-of-sample evaluation —
it is picking the luckiest slice of the test data and reporting its luck as skill.
Combined with tiny test partitions (20-54 trades after filtering), a handful of
favorable trades is enough to produce a headline number like "80% WR, PF=10."

This function is called by:
- `scripts/ml/train.py` — the canonical CLI entry point documented in `CLAUDE.md`
- `scripts/ml/production-backtest.py` — imports `train_chronological` directly

Every meta-v20 through meta-v25 claim in this repo's history was produced this way,
including the two models trained in this session (`meta-v24-extended-window`,
`meta-v25-oversold-reversal`, `meta-v25-momentum-continuation`).

## The Fix Already Exists, Unused

A separate, correctly-built module was written specifically to close these leaks —
apparently as a corrective pass on meta-v22 — and never wired into the default
workflow:

| File | Purpose |
|---|---|
| `scripts/ml/pipeline/validation.py` | `purged_chronological_split()` — 70/15/15 train/validation/test split by unique timestamp, with an embargo window so the label horizon can't leak across boundaries |
| `scripts/ml/pipeline/locked_backtest.py` | `select_threshold_locked()` — chooses the threshold from **validation candidates only**, defaults `min_trades=200`, requires `totalR > 0`, `PF > 1.0`, `maxDrawdownPct <= 15%` before calling it a pass |
| `scripts/ml/locked-walkforward-backtest.py` | Full runner: purged split, threshold locked on validation, test partition evaluated **exactly once**, records `testEvaluations: 1` in its own report as a built-in p-hacking guard, models real fees/slippage/funding, fails closed on calibration collapse |
| `scripts/ml/tests/test_locked_backtest.py` | Unit tests for the above, including `test_threshold_is_selected_only_from_supplied_validation_candidates` |

This is the right methodology, already implemented, already tested. As far as this
session found, `locked-walkforward-backtest.py` has never actually been run to
completion — there is no cached report anywhere in the repo. Nobody has ever gotten
an honest answer out of the repo's own best tool.

Separately: `docs/analysis/EMPIRICAL_FINDINGS.md` shows the ICR (rule-based) engine
never fell into this trap — its claims are backed by 615+ outcomes per tier, with
documented negative results ("DO NOT add early breakeven," "DO NOT add partial
scale-outs") from interventions that were tried and reverted. That file is the
existing proof that this repo can do rigorous validation when the discipline is
applied. The ML track needs the same discipline, not a new one invented from
scratch.

## Why This Keeps Recurring (the incentive problem)

Every session — mine included — is implicitly pulled toward reporting forward
progress. "No significant edge found" is a worse-feeling update to deliver than
"🎯 GOALS MET." Given a leaky methodology and a small sample, *some* threshold will
always look good — that's what p-hacking is. The recurring drift isn't a
competence failure, it's what happens by default when the reporting path allows a
success framing without a gate that's structurally hard to satisfy by chance.

The fix has to be a gate, not a reminder. A comment saying "don't do this" gets
overwritten by the next session under the same pressure. A gate that mechanically
refuses to emit a headline number below the bar does not.

## Testing Gate — Requirements

1. **One canonical evaluation path.** All model performance claims MUST go through
   `locked-walkforward-backtest.py` (or a direct successor). Output from
   `train.py`'s or `production-backtest.py`'s self-reported `test_wr`/`test_pf` is
   informal signal for iteration only — never cited as a result, never put in a
   commit message, never used to gate a go/no-go decision.

2. **Hard minimum sample size: 200 trades in the TEST partition**, at whatever
   threshold validation selected. This number is not new — it is already the
   default in `select_threshold_locked(min_trades=200)`. Below 200, the only
   permitted conclusion is "insufficient data," full stop. No WR/PF/Sharpe headline,
   no emoji commit, no "definitive."

3. **Threshold is selected on the validation partition only, never on test.**
   Already implemented in `select_threshold_locked`; the requirement is to use it
   everywhere, including `train.py`.

4. **One test evaluation per model artifact.** Hash the model + input data
   (`sha256`, already present in the locked runner's report schema) and refuse to
   re-score the test partition against a changed threshold for the same model hash.
   `testEvaluations` must be tracked (a ledger file, same pattern as
   `scripts/cortex/memory/*.jsonl`) and the run must fail loudly rather than
   silently produce a second number.

5. **Every report carries a confidence interval, not just a point estimate.**
   Wilson score interval on WR at the test partition's actual n. "65% WR" alone is
   not a reportable claim — "65% WR (n=54, 95% CI 31–78%)" is, and it makes a thin
   sample visibly inconclusive instead of implicitly confident.

6. **Baseline comparison is mandatory.** Every report states the no-skill baseline
   win rate for that partition (already computed as `baseline_wr` in some model
   cards) and a pass requires the CI lower bound to exceed it — not just the point
   estimate.

7. **Commit hygiene.** No `🎯`, "GOALS MET," or "-definitive" in a commit message
   unless the locked gate passed on that exact run. Otherwise: plain description of
   what was tried and what the honest number was (e.g., "meta-v26: locked
   walk-forward, gate not met, AUC=0.53, n=118, insufficient edge").

## Immediate Next Action

Run `locked-walkforward-backtest.py` for real, against the current 120-day/49-pair
corpus (and the 100-pair/365-day corpus once that fetch finishes), and treat
whatever comes out — pass or fail — as the first trustworthy number this pipeline
has ever produced. That result, not another round of feature or architecture
tuning, decides what happens next:

- **Gate passes (≥200 test trades, WR CI lower bound > baseline, PF > 1, drawdown
  within bound):** this is the first model worth deploying to paper trading.
- **Gate fails:** stop tuning architecture (dual-regime, more features, more pairs)
  and treat it as a label/feature-definition problem — the ICR engine's empirical
  process (large sample, one variable changed at a time, negative results kept) is
  the template to follow, not another LightGBM variant.

## Non-Goals

- This PRD does not propose new features, new regimes, or new model architectures.
  Every prior session already tried that path repeatedly; this PRD is explicitly
  about stopping that cycle until validation is trustworthy.
- This PRD does not touch the ICR/rule-based engine's methodology — it is already
  disciplined and is the reference standard, not the problem.
