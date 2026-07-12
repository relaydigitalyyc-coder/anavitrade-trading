# ICR Strategy v7 Real Edge

This version is built for real Binance HTF coiling-pump research and explicit edge/no-edge decisions. It includes Binance public-data downloaders, Coinlegs snapshot/browser ingestion, HTF coil gating, combo ablations, yearly walk-forward, false-positive traps, threshold sweeps, and a 200-litmus audit scorecard.

See `docs/REAL_EDGE_RUNBOOK.md` for the real-data command path.

# Impulse Compression Reclaim OS v4

A deterministic Python research/backtesting repository rebuilt from the April Codex trading algo and expanded with the later trading-system memory: ICT/SMC-style confluence, multi-timeframe trend agreement, RSI/Bollinger/z-score divergence tags, Exness-style universe metadata, currency-strength research, portfolio-level risk controls, and a 200-litmus-test quant audit.

This is research software only. It does **not** place live trades, connect to brokers, store API keys, or perform recursive filesystem scans.

## Core Strategy Spine

The base engine remains the April model:

1. Detect trend stack: `MA7 > MA25 > MA99` for longs or inverse for shorts.
2. Detect a real impulse leg.
3. Wait for low-volume pullback and compression near MA25.
4. Enter only after reclaim/breakdown confirmation after candle close.
5. Execute fixed R-based risk with conservative stop-first candle logic.

The extra modules add score, tags, and research outputs. They do not override the deterministic entry gate.

## v4 Finished Repo Additions

- Chronological multi-symbol portfolio executor.
- Max open positions, max open per symbol, and coarse correlation-cluster caps.
- Realized daily loss breaker.
- Session, timeframe, asset-class, score-bucket, exit-reason, target-path, and regime reports.
- Skipped-signal report explaining portfolio/risk rejections.
- 200 executable litmus tests in `icr/audit.py`, `docs/QUANT_AUDIT_200.md`, and `docs/LITMUS_TESTS_200.md`.
- Ablation suite for base-only, no-ICT, no-divergence, no-MTF, stricter score thresholds, and higher RR.
- Fee/slippage stress suite.
- Walk-forward train/test split.
- Explicit April reference metrics embedded in the audit summary: 72 trades, 46 wins, 11 losses, 15 breakevens, 80.7% win rate, +94.33R, +1.66R expectancy, 1R = 2.3419 USDT, 2.5x isolated leverage.

## Integrated Modules

### Base ICR Engine

- MA7 / MA25 / MA99 trend stack
- impulse detection over 3 to 12 candles
- low-volume pullback validation
- compression detection using range contraction, ATR contraction, volume contraction, candle bodies, and MA25 proximity
- reclaim/breakdown trigger
- R-based position sizing
- partial exits: 40% at TP1, 30% at TP2, 30% runner
- breakeven after configurable R
- MA25 runner trail

### ICT Layer

Implemented in `icr/ict.py`:

- fair value gap detection
- order block proximity
- OTE 62% to 79% retracement check
- liquidity sweep check
- NY killzone bonus

### Divergence / Predictive Layer

Implemented in `icr/divergence.py`:

- RSI regular divergence
- RSI hidden divergence
- Bollinger reclaim/rejection predictive tags
- z-score exhaustion/reclaim tags

### Multi-Timeframe Layer

Implemented in `icr/mtf.py`:

- resamples local OHLCV into higher timeframes
- checks higher-timeframe MA stack agreement/conflict
- default research context: 15m, 1h, 4h

### Exness / Matrix Research Metadata

Implemented in `icr/universe.py` and `icr/matrix.py`:

- majors, minors, exotics, metals, crypto, indices
- symbol parser and inverse FX utility
- currency-strength derivation from pair returns
- matrix-style snapshot with bias, score, ICT detail, divergence tag, and MTF detail

### Meta-Labeling Output

Implemented in `icr/meta_labeling.py`:

- generates `meta_labels.csv`
- labels each completed signal as follow/fade
- preserves base scores, ICT score, divergence score, MTF score, and R outcome
- intended for later reinforcement-learning or meta-labeling research only

## Install

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run sample backtest and full audit

```bash
python -m icr.main --generate-sample --output outputs
```

## Run your own CSV

CSV must contain:

```text
timestamp,open,high,low,close,volume
```

Optional execution-filter columns:

```text
bid,ask,spread_bps,spread,commission_bps
```

Then run:

```bash
python -m icr.main --input path/to/BTCUSDT_1h.csv --output outputs --timeframe 1H
```

For a folder of CSVs, the loader reads only direct `.csv` children and intentionally refuses recursive scanning.

## Useful CLI flags

```bash
python -m icr.main \
  --input data \
  --output outputs \
  --timeframe 1H \
  --score-threshold 75 \
  --min-rr 2.5 \
  --risk-pct 0.01 \
  --fee-rate 0.0004 \
  --slippage-bps 2 \
  --max-spread-bps 30
```

Disable confluence modules:

```bash
python -m icr.main --input data --disable-ict --disable-divergence --disable-mtf
```

Skip audit for a fast smoke test:

```bash
python -m icr.main --generate-sample --output outputs --no-audit
```

## Outputs

- `trades.csv`
- `signals.csv`
- `skipped_signals.csv`
- `summary.json`
- `equity_curve.csv`
- `per_symbol_stats.csv`
- `timeframe_stats.csv`
- `asset_class_stats.csv`
- `session_performance.csv`
- `score_bucket_stats.csv`
- `exit_reason_stats.csv`
- `target_path_stats.csv`
- `regime_report.csv`
- `meta_labels.csv`
- `matrix_snapshot.csv`
- `currency_strength.csv`
- `config_snapshot.json`
- `equity_curve.png`
- `audit_scorecard.csv`
- `audit_summary.json`
- `ablation_report.csv`
- `stress_report.csv`
- `walk_forward_report.csv`
- `audit_recommendations.csv`

## 200 Quant Litmus Tests

The audit is not a questionnaire. It is a 200-row executable acceptance suite. Every row maps to a computable metric where possible and produces PASS/WARN/FAIL/N/A.

Categories:

- data integrity
- feature causality
- signal logic
- execution fills
- risk portfolio
- statistics edge
- robustness
- regime market
- confluence/meta
- production operations

The bundled deterministic sample is intentionally small. It proves the engine and audit execute. It does not prove live market edge. Real validation requires exported M5/M15/H1 OHLCV across the Exness-style universe and enough observations for statistical confidence.

## Test

```bash
pytest -q
```

## Backtest Safety Rules

- Entry occurs only after the trigger candle closes.
- Exit simulation starts on the next candle.
- If stop and target are both touched in the same candle, stop is assumed first.
- Fees and slippage are included.
- No future swing confirmation is used for signal generation.
- Folder loading is non-recursive by design.
- There is no live trading, broker login, or API-key handling.

## v5: Binance HTF Coiling Pump Backtest

This version adds a Binance public-data pipeline and a higher-timeframe coiling-pump research harness.

### Run the full Binance HTF research

```bash
python -m icr.main \
  --binance-htf \
  --binance-intervals 4h,1d \
  --binance-start 2023-01 \
  --binance-end 2026-06 \
  --output outputs_binance_htf \
  --score-threshold 70 \
  --coil-threshold 72 \
  --pump-threshold 0.12 \
  --no-shorts
```

### Run coil research on local CSV exports

```bash
python -m icr.main \
  --input path/to/direct_csv_folder \
  --timeframe 4h \
  --output outputs_4h \
  --htf-coil-scan \
  --score-threshold 70 \
  --coil-threshold 72 \
  --no-shorts
```

### New HTF reports

```text
htf_coil_candidates.csv
latest_coil_scoreboard.csv
pump_lift_by_score_bucket.csv
symbol_coil_performance.csv
qualified_coil_events.csv
coil_summary.json
```

The scanner is intentionally long-biased for the coiling-pump use case. The normal ICR backtester still supports both long and short research.

## v6: Coinlegs Genius Derivatives Fusion

This version adds a Coinlegs public-snapshot layer to the Binance HTF coiling-pump engine.

Coinlegs data is treated as **contextual derivatives intelligence**, not as a standalone trigger. The base April ICR gate still requires trend, impulse, compression, reclaim/breakdown, risk/reward, and candle-close confirmation. Coinlegs can only raise, lower, or annotate a setup.

### What the Coinlegs layer ingests

`icr/coinlegs.py` supports:

- user-provided Coinlegs-style CSV snapshots
- manually filled snapshot templates
- public static page fetch attempts for `/marketdetails/{exchange}/{symbol}`
- tolerant parsing of rendered page text/snippets
- clean failure when Coinlegs returns a JavaScript shell instead of rendered public data

It does not include login automation, private endpoint discovery, CAPTCHA bypassing, paywall bypassing, or hidden API abuse.

### Coinlegs fields supported

```text
timestamp,exchange,symbol,price,price_change_pct,volume_24h_usd,
volume_change_1h_pct,volume_change_4h_pct,volume_change_6h_pct,volume_change_24h_pct,
oi_usd,oi_change_1h_pct,oi_change_4h_pct,
funding_rate_pct,predicted_funding_rate_pct,long_short_ratio,
liquidation_1h_usd,liquidation_4h_usd,liquidation_24h_usd,source_url
```

### Derived Coinlegs intelligence

Implemented in `icr/coinlegs_fusion.py`:

- `demand_velocity_score`: volume acceleration while price is still not overextended
- `leverage_expansion_score`: open-interest expansion without reckless leverage blowoff
- `funding_sanity_score`: neutral/healthy funding preferred over overheated crowding
- `crowding_sanity_score`: long/short ratio sanity check
- `liquidation_activity_score`: liquidation activity scaled by volume/OI
- `coinlegs_alpha_score`: composite derivative-context score
- `coinlegs_bias`: `bullish_derivative_accumulation`, `constructive_watch`, `crowded_trap_risk`, `dead_or_distribution`, or `neutral`

### How Coinlegs changes the algo

For long HTF coiling-pump setups, Coinlegs can boost the score when:

- volume is expanding before the reclaim
- OI is expanding moderately
- funding is neutral or not euphoric
- long/short ratio is not overcrowded
- liquidation activity suggests real leverage participation

It penalizes setups when:

- funding is overheated
- long/short ratio is badly crowded
- OI expansion is extreme before confirmation
- demand is dead during the coil

### Commands

Write a snapshot template:

```bash
python -m icr.main --coinlegs-template --output outputs_coinlegs
```

Run a local Coinlegs snapshot with Binance HTF coil research:

```bash
python -m icr.main \
  --input examples \
  --timeframe 4h \
  --coinlegs-snapshot docs/coinlegs_snapshot_coil_example.csv \
  --htf-coil-scan \
  --score-threshold 70 \
  --coil-threshold 60 \
  --pump-threshold 0.08 \
  --no-shorts \
  --no-audit \
  --output outputs_coinlegs
```

Attempt public Coinlegs marketdetails fetches locally:

```bash
python -m icr.main \
  --generate-sample \
  --coinlegs-scrape-symbols SOLUSDT,AVAXUSDT,SUIUSDT \
  --coinlegs-exchange Binance \
  --coinlegs-sleep 1.0 \
  --output outputs_coinlegs_scrape
```

If the site returns only the JavaScript app shell, use the CSV snapshot path instead.

### New v6 outputs

```text
coinlegs_snapshot_template.csv
coinlegs_raw_snapshot.csv
coinlegs_scrape_errors.csv
coinlegs_enriched_snapshot.csv
coinlegs_market_snapshot.csv
```

`signals.csv`, `matrix_snapshot.csv`, and `latest_coil_scoreboard.csv` now include Coinlegs score/bias fields when a snapshot is attached.
