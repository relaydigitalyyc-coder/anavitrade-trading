# Implementation Gaps for Claude to Attack

These are the highest-value gaps remaining.

## Data layer
- Improve Binance archive downloader retry/cache logic.
- Add delisting/missing-file tolerance.
- Add all eligible USDT spot pairs dynamically from exchangeInfo or archive listings.
- Track listing date per symbol.
- Filter symbols by minimum daily dollar volume.

## Coinlegs layer
- Convert Coinlegs scrape to robust public-page renderer only.
- Support manual CSV snapshots as canonical mode.
- Timestamp every snapshot and align to nearest candle close.
- Never bypass login, paywall, captcha, or private APIs.

## Backtester
- Upgrade multi-symbol simulation to fully event-driven portfolio chronology across all symbols/timeframes.
- Enforce correlation/capital caps at the exact event timestamp.
- Add realistic order model: close entry, retest entry, next-open entry.
- Add optional lower-timeframe intrabar resolution.

## Quant research
- Add forward-return labels: 1, 3, 6, 12, 24, 48 candles.
- Add score monotonicity tests.
- Add threshold heatmaps.
- Add bootstrap confidence intervals.
- Add symbol/year/regime contribution decomposition.
- Add permutation tests to confirm score is not random.

## Software engineering
- Add CI config.
- Add richer typing.
- Add benchmark tests for large symbol universes.
- Add structured logging.
- Add deterministic config files.
- Add CLI examples for every major mode.
