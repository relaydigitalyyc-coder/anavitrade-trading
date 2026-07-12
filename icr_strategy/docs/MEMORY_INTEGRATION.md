# Memory Integration Map

This build integrates the larger trading-system memory into the April ICR strategy without converting it into unsafe live trading software.

## Remembered Components Integrated

| Memory / prior system | Implementation |
| --- | --- |
| April impulse-compression-reclaim algo | `structure.py`, `signals.py`, `backtester.py` |
| MA7 / MA25 / MA99 trend stack | `indicators.py`, `structure.py` |
| Low-volume pullback and compression | `valid_pullback`, `detect_compression` |
| Reclaim/breakdown trigger | `_trigger_score` in `signals.py` |
| R-based trade audit model | `risk.py`, `backtester.py`, `summary.json` |
| 2.5x isolated leverage awareness | modeled indirectly through R sizing, no forced leverage dependency |
| ICT/FVG/OB/OTE/sweep concepts | `ict.py` |
| SMT-compatible architecture | hooks in config, pair/currency infrastructure in `universe.py` |
| NY killzones | `ict.py`, 07:00-11:00 and 13:00-15:00 New York time |
| Divergence matrix idea | `divergence.py`, `matrix.py`, `matrix_snapshot.csv` |
| Predictive Bollinger reversal tags | `divergence.py` predictive tags |
| Z-score divergence / adaptive scanner direction | `divergence.py`, `matrix.py` |
| Exness universe with majors, exotics, XAU, BTC, indices | `universe.py` |
| Currency strength from all available pairs | `currency_strength_frame`, `currency_strength.csv` |
| MTF 5m/15m/1h/H4/D1 spirit | `mtf.py`, configurable resampled confluence |
| Volume-weighted signal confirmation | `volume_zscore`, `_volume_confirmation` |
| Spread filter | optional `--max-spread-bps` and CSV `bid/ask/spread_bps` support |
| RL/meta-labeling future layer | `meta_labeling.py`, `meta_labels.csv` |

## Deliberate Exclusions

- No live broker execution.
- No API keys.
- No MQL5 terminal automation.
- No recursive folder scanning.
- No future-candle leakage for entries.
- No LLM placing trades.

## Output Files Added in This Version

- `matrix_snapshot.csv`: latest scanner snapshot per symbol.
- `currency_strength.csv`: derived strength from loaded FX pairs.
- `meta_labels.csv`: follow/fade labels for later ML/RL experiments.
