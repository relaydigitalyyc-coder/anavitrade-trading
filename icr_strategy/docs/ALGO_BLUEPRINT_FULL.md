# Full Algo Blueprint

## Name
Impulse Compression Reclaim with HTF Coiling Pump and Derivatives Fusion.

## Primary target
Binance altcoin USDT pairs, 4h and 1d, long-biased. The setup should find coins that are coiling after impulse and preparing for a high-timeframe expansion/pump.

## Base signal
A long setup requires:
- MA7 > MA25 > MA99.
- MA25 slope positive.
- Recent bullish impulse greater than ATR threshold.
- Pullback is low-volume and controlled.
- Compression near MA25 or reclaim level.
- Candle reclaims compression high or MA7 with decent close location.
- Available target gives sufficient R:R.

A short setup is implemented but lower priority for this research phase.

## HTF coil score
Score should reward:
- Range contraction.
- ATR percentile contraction.
- Bollinger squeeze.
- Volume dry-up.
- Higher lows.
- Pressure against overhead liquidity.
- MA compression without bearish loss of structure.
- Reclaim readiness.

## ICT confluence
Score should reward:
- OTE retracement into 62% to 79% zone after impulse.
- FVG proximity or reaction.
- Order block proximity.
- Liquidity sweep followed by reclaim.
- Avoid buying after liquidity has already been fully exhausted unless continuation structure remains.

## Divergence confluence
Score should reward:
- Hidden bullish divergence during pullback in uptrend.
- Bollinger reclaim after squeeze.
- Avoid obvious bearish regular divergence into high-side exhaustion unless reclaim confirms strongly.

## Coinlegs / derivative fusion
Coinlegs-style snapshot fields should be treated as contextual boosts or penalties, not standalone trade triggers.

Bullish derivative accumulation:
- OI expanding.
- Volume expanding.
- Funding sane, not overheated.
- Long/short crowd not extremely one-sided.
- Liquidation activity does not indicate late crowded long liquidation risk.

Bearish/caution conditions:
- Funding overheated.
- Long crowding extreme.
- OI spikes without price progress.
- Liquidations suggest forced unwinds.

## Execution model
- Entry after signal candle close or optional retest.
- Stop below compression low for longs.
- Target by R multiples plus external liquidity.
- Conservative same-candle logic: stop first.
- Track all outcomes in R.

## Edge proof requirements
The strategy has no edge until the real-data reports show:
- Positive out-of-sample expectancy.
- Positive walk-forward expectancy.
- Score buckets improve pump odds.
- HTF coil and/or Coinlegs layers improve over base ICR in ablation.
- False positives are explainable and filterable.
- Performance is not concentrated in one meme coin or one bull-market year.
