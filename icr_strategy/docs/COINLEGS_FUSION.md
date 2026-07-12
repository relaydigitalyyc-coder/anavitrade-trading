# Coinlegs Fusion Layer

## Purpose

The Coinlegs layer turns derivatives context into a quantitative filter around the existing ICR/HTF coiling-pump model.

The intended setup remains:

1. Higher-timeframe coil forms.
2. Range/ATR/Bollinger width compress.
3. Volume dries up on the pullback.
4. Higher lows pressure the range high.
5. Price reclaims the compression high or MA7/MA25 zone.
6. Coinlegs confirms that derivatives participation is constructive instead of euphoric.

## Why not trade Coinlegs alone?

Derivative metrics are context, not structure. Open interest, funding, long/short ratio, and liquidations can identify participation and crowding, but they do not by themselves define entry, invalidation, or asymmetric R.

The repo therefore uses Coinlegs as a score delta:

- positive for constructive accumulation
- neutral for incomplete information
- negative for trap/crowding risk

## Composite Score

`coinlegs_alpha_score` uses:

- 32% demand velocity
- 22% leverage expansion
- 18% funding sanity
- 16% crowding sanity
- 12% liquidation activity

## Bias Labels

- `bullish_derivative_accumulation`: demand + OI + sane funding + non-crowded positioning
- `constructive_watch`: useful but incomplete confirmation
- `crowded_trap_risk`: too much crowding, often dangerous before reclaim
- `dead_or_distribution`: weak demand and weak leverage participation
- `neutral`: insufficient or mixed inputs

## Safety Constraints

The scraper does not bypass login, private APIs, paywalls, bot defenses, or CAPTCHAs. Coinlegs public pages are JavaScript-rendered in many environments, so the robust path is to use a saved/exported CSV snapshot.
