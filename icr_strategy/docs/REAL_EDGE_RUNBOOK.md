# ICR Strategy v7 Real Edge Runbook

This repo does not claim edge from synthetic data. It now forces the research path the user asked for:

1. Download real Binance 4H/1D OHLCV from the public monthly archive.
2. Ingest Coinlegs-style derivatives snapshots through CSV, static public pages, or optional Playwright browser rendering.
3. Run the base ICR backtest.
4. Run HTF coil-to-pump event study.
5. Run four strategy combination ablations:
   - base ICR only
   - ICR + HTF coil gate
   - ICR + Coinlegs derivatives confluence
   - ICR + HTF coil gate + Coinlegs
6. Write pump probability by score bucket.
7. Write false-positive trap explanations.
8. Write best-threshold sweep.
9. Write yearly walk-forward reports.
10. Write an explicit edge decision.

## Real Binance command

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

## Coinlegs snapshot workflow

Generate a template:

```bash
python -m icr.main --coinlegs-template --output outputs_coinlegs
```

Fill it from Coinlegs current market details, then run:

```bash
python -m icr.main \
  --binance-htf \
  --binance-intervals 4h,1d \
  --binance-start 2021-01 \
  --binance-end 2026-06 \
  --coinlegs-snapshot outputs_coinlegs/coinlegs_snapshot_template.csv \
  --real-edge-report \
  --exhaustive-audit \
  --score-threshold 70 \
  --coil-threshold 72 \
  --pump-threshold 0.12 \
  --no-shorts \
  --output outputs_binance_coinlegs_real_edge
```

## Optional Coinlegs browser renderer

Install the optional browser dependency:

```bash
pip install -r requirements-browser.txt
python -m playwright install chromium
```

Then run:

```bash
python -m icr.main \
  --generate-sample \
  --coinlegs-scrape-symbols SOLUSDT,AVAXUSDT,SUIUSDT \
  --coinlegs-browser \
  --real-edge-report \
  --output outputs_browser_coinlegs
```

The browser path only renders public pages. It does not log in, bypass captcha, or access paywalled/private APIs.

## Edge decision rule

The report `real_edge/edge_decision.json` remains `UNPROVEN` unless all core gates pass:

- 100+ baseline trades
- 100+ qualified coil events
- positive baseline expectancy
- positive walk-forward test expectancy when available
- no hard audit failures
- qualified coil pump rate above the configured decision threshold

Synthetic bundled data is only a regression test, not market proof.
