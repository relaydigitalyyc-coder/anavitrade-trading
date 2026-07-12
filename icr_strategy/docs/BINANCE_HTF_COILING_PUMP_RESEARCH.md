# Binance HTF Coiling Pump Research

This repo extension is designed to backtest the remembered April ICR engine on Binance altcoin USDT pairs and to prioritize higher-timeframe coil-to-pump structures.

## Research Objective

Find liquid altcoins that form higher-timeframe compression before a directional pump.

The scanner ranks symbols by a dedicated `coil_score`, separate from the normal ICR entry score. The ICR engine still controls trade entries. The coil layer is for discovery, event studies, and prioritization.

## Default Research Basket

The default liquid-alt basket is:

```text
SOLUSDT, BNBUSDT, XRPUSDT, DOGEUSDT, ADAUSDT, AVAXUSDT, LINKUSDT, NEARUSDT, SUIUSDT, SEIUSDT, FETUSDT, INJUSDT, RUNEUSDT, ARBUSDT, OPUSDT, APTUSDT, WIFUSDT, PEPEUSDT, LTCUSDT, DOTUSDT
```

Symbols are validated by Binance availability at download time. Missing months, delisted months, and unsupported symbols are logged and skipped.

## Data Source

The downloader uses Binance public market data archives from `data.binance.vision` first. It does not need an account, broker login, or API key.

Monthly archive path pattern:

```text
/data/spot/monthly/klines/<SYMBOL>/<INTERVAL>/<SYMBOL>-<INTERVAL>-YYYY-MM.zip
```

The parser handles Binance spot archive timestamp changes by detecting whether timestamps are seconds, milliseconds, or microseconds.

## Main Command

```bash
python -m icr.main \
  --binance-htf \
  --binance-symbols SOLUSDT,BNBUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,AVAXUSDT,LINKUSDT,NEARUSDT,SUIUSDT,SEIUSDT,FETUSDT,INJUSDT,RUNEUSDT,ARBUSDT,OPUSDT,APTUSDT,WIFUSDT,PEPEUSDT,LTCUSDT,DOTUSDT \
  --binance-intervals 4h,1d \
  --binance-start 2023-01 \
  --binance-end 2026-06 \
  --output outputs_binance_htf \
  --score-threshold 70 \
  --coil-threshold 72 \
  --pump-threshold 0.12 \
  --no-shorts
```

## Why `--no-shorts`

For this specific research run, the objective is not market-neutral crypto trading. It is to find HTF coiling pumps. Long-only makes the event study cleaner and avoids polluting the results with short breakdown setups.

## Coiling Pump Score

The `coil_score` is built from:

- range contraction
- ATR percentile contraction
- Bollinger width squeeze
- volume dry-up
- higher lows
- high-side compression pressure
- moving-average context
- MA squeeze near MA25
- overhead liquidity distance
- reclaim readiness

Grades:

```text
85+ = A+
78-84.99 = A
70-77.99 = B
60-69.99 = watch
below 60 = ignore
```

## Pump Label

A pump is labeled when forward MFE exceeds the configured threshold.

Default:

```text
pump_threshold = 0.12
```

Meaning: after a coil event, if price reaches at least +12% MFE inside the forward horizon, the event receives `pump_label = true`.

Default horizons:

```text
4h horizon = 18 bars
1d horizon = 14 bars
```

## New Reports

Each HTF interval output folder includes:

```text
htf_coil_candidates.csv
latest_coil_scoreboard.csv
pump_lift_by_score_bucket.csv
symbol_coil_performance.csv
qualified_coil_events.csv
coil_summary.json
```

The normal strategy outputs are still produced:

```text
trades.csv
signals.csv
summary.json
equity_curve.csv
matrix_snapshot.csv
audit_scorecard.csv
stress_report.csv
walk_forward_report.csv
```

## Interpretation Protocol

The score is useful only if higher score buckets show better forward pump rate or better forward MFE than lower score buckets.

The first acceptance tests to check are:

1. `pump_lift_by_score_bucket.csv`: higher buckets should have higher pump rate and/or MFE.
2. `symbol_coil_performance.csv`: qualified events should concentrate in symbols with repeatable pump behavior.
3. `latest_coil_scoreboard.csv`: current rankings should be used as a watchlist, not an automatic entry list.
4. `trades.csv`: actual ICR entries must still be validated by entry/stop/target execution.

## Sandbox Note

The included `binance_attempt_outputs` folder records the sandbox execution attempt. The code ran, but the sandbox could not resolve Binance public-data DNS. On a normal machine with internet access, the same command downloads the monthly archives and runs the full backtest.
