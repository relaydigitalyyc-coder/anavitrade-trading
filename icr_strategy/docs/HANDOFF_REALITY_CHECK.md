# Handoff Reality Check

This package contains a working research repo and a serious scaffold. It is not a proven money printer.

## Verified in this environment
- Source code is present.
- `pytest -q` passes: 33 tests.
- Synthetic smoke run executes.
- Reports are generated.
- Edge decision correctly says `UNPROVEN` on synthetic/insufficient data.

## Not verified here
- Real Binance multi-year download did not run in this sandbox due DNS/network failure.
- Coinlegs live scrape did not run here due DNS/network failure.
- No real-data edge has been proven.
- No live trading execution exists or should exist yet.

## Intended next step
Run the real-data command locally where internet resolution works. Then inspect:
- `real_edge/edge_decision.json`
- `real_edge/pump_lift_by_score_bucket.csv`
- `real_edge/combo_ablation_report.csv`
- `real_edge/false_positive_traps.csv`
- `real_edge/best_thresholds.csv`
- `real_edge/walk_forward_by_year.csv`

If these do not support edge, the correct action is parameter research or thesis revision, not deployment.
