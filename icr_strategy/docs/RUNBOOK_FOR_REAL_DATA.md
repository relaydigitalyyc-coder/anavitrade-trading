# Real-Data Runbook

## Install
```bash
cd icr_strategy_v7_real_edge
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```

## Smoke test
```bash
python -m icr.main --generate-sample --output outputs_smoke --real-edge-report --no-audit
```

## Real Binance HTF run
```bash
python -m icr.main \
  --binance-htf \
  --binance-intervals 4h,1d \
  --binance-start 2021-01 \
  --binance-end 2026-06 \
  --real-edge-report \
  --exhaustive-audit \
  --score-threshold 70 \
  --coil-threshold 72 \
  --pump-threshold 0.12 \
  --no-shorts \
  --output outputs_binance_real_edge
```

## With Coinlegs snapshot
First generate template:
```bash
python -m icr.main --coinlegs-template --output outputs_coinlegs_template
```

Fill `coinlegs_snapshot_template.csv`, then run:
```bash
python -m icr.main \
  --binance-htf \
  --binance-intervals 4h,1d \
  --binance-start 2021-01 \
  --binance-end 2026-06 \
  --coinlegs-snapshot outputs_coinlegs_template/coinlegs_snapshot_template.csv \
  --real-edge-report \
  --exhaustive-audit \
  --score-threshold 70 \
  --coil-threshold 72 \
  --pump-threshold 0.12 \
  --no-shorts \
  --output outputs_binance_coinlegs_real_edge
```

## Core files to inspect
- `summary.json`
- `trades.csv`
- `signals.csv`
- `real_edge/edge_decision.json`
- `real_edge/pump_lift_by_score_bucket.csv`
- `real_edge/combo_ablation_report.csv`
- `real_edge/walk_forward_by_year.csv`
- `real_edge/year_regime_report.csv`
- `real_edge/false_positive_traps.csv`
- `real_edge/best_thresholds.csv`
- `real_edge/audit_scorecard.csv`

## Interpretation
If `edge_decision.json` says `UNPROVEN`, do not optimize around that by weakening gates until it passes. Inspect which requirement failed.
