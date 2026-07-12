# Claude Master Prompt: Synthesize and Finish the ICR Quant Algo

You are inheriting a real Python research repo named `icr_strategy_v7_real_edge`. Do not rewrite it from scratch unless the code is structurally unsalvageable. Your job is to synthesize, harden, and extend it into a serious quant research system for HTF altcoin coiling-pump continuation setups.

## Hard truth
The repo is implemented and unit-tested, but the edge is not proven. The included sample data is synthetic. The sandbox where it was built could not download Binance/Coinlegs data due DNS resolution failure. You must not claim edge until real multi-year, multi-symbol data passes the gates.

## Strategy thesis
The core strategy is Impulse Compression Reclaim:

1. Market makes a clean impulse in the direction of the trend.
2. Pullback is controlled, low-volume, and compressive rather than distributive.
3. Price coils around MA25 or a key reclaim zone.
4. Trigger occurs on reclaim/breakdown of compression boundary, with volume confirmation.
5. Trade is only valid if R:R, score, liquidity target, and regime filters pass.

For the current research direction, prioritize LONG-only Binance altcoin HTF coiling pumps on 4h and 1d. Shorts are optional and lower priority.

## Repo layers already present
- Base ICR engine: trend stack, impulse, pullback, compression, reclaim/breakdown.
- Risk engine: position sizing, R multiples, partial exits, breakeven logic, stop-first same-candle handling.
- ICT layer: FVG, order block proximity, OTE, liquidity sweep, killzone-style scoring.
- Divergence layer: RSI regular/hidden divergence, Bollinger reclaim/rejection, z-score exhaustion.
- MTF layer: resampling and higher-timeframe confluence.
- Binance layer: public monthly archive downloader and timestamp normalization.
- Coinlegs layer: snapshot ingestion and optional browser renderer.
- Coiling-pump layer: HTF coil scoring and pump event study.
- Meta-labeling layer: follow/fade labels and feature export.
- Quant audit: 200 executable litmus tests, ablations, stress reports, walk-forward splits, false-positive traps, threshold sweeps, edge decision.

## Absolute rules
- No live trading.
- No broker keys.
- No private endpoint scraping.
- No login/paywall/captcha bypass.
- No lookahead bias.
- No recursive filesystem scanning.
- No edge claims without real data.
- If stop and target hit same candle, assume stop hit first unless a lower-timeframe intrabar model is explicitly used.
- Separate research logic from production execution.

## First commands
```bash
cd icr_strategy_v7_real_edge
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
pytest -q
python -m icr.main --generate-sample --output outputs_smoke --real-edge-report --no-audit
```

Expected current status:
- Tests pass: 33 tests.
- Synthetic smoke run executes.
- Edge decision remains UNPROVEN due insufficient real data.

## Main real-data command
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

## Required ablations
Run and compare:
1. Base ICR only
2. ICR + HTF coil gate
3. ICR + Coinlegs snapshot/fusion
4. ICR + HTF coil + Coinlegs fusion

The goal is not to maximize backtest vanity metrics. The goal is to falsify bad assumptions, find score buckets with real lift, and identify false-positive traps.

## Edge decision threshold
Keep `UNPROVEN` unless at minimum:
- 100+ trades in real out-of-sample testing.
- 100+ qualified coil events.
- Positive walk-forward test expectancy.
- Pump probability monotonically improves by score bucket.
- Stress tests survive higher fees/slippage.
- No single symbol/year/regime explains all edge.

## Highest-value next improvements
1. Make Binance downloader robust to delistings and missing monthly archives.
2. Add market-cap/liquidity filters to avoid dead or manipulated pairs.
3. Add symbol inception filtering so coins are not punished for missing pre-listing data.
4. Build a proper event-driven portfolio simulator across symbols/timeframes.
5. Add intrabar lower-timeframe validation for ambiguous stop/TP candles.
6. Add volume source validation: spot volume vs perp volume vs Coinlegs-derived derivative flow.
7. Make Coinlegs snapshots timestamped and aligned to candle close.
8. Export ML-ready feature table with forward returns at 1, 3, 6, 12, 24, 48 candles.
9. Add score monotonicity tests by regime/year.
10. Add threshold robustness heatmaps.
