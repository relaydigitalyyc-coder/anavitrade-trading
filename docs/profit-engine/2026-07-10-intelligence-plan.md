# Market Intelligence Integration Plan — July 10, 2026

## Sources Analyzed

1. **ICR Strategy** (`icr_strategy/`) — Python quant research scaffold, Impulse Compression Reclaim
   - 22 source files, 33 passing tests
   - 11-component HTF coil score (genuinely well-designed, score monotonicity holds)
   - Audit: 125 parameters, no statistical framework, Coinlegs temporal misalignment invalidated historical backtests
   - **Highest value extract**: coil score threshold findings — Coil ≥65 + Pump ≥8% = 36.4% pump rate, edge ratio 3.28

2. **IvanG Trading OS v1** — Complete SMC/ICT algorithmic trading specification
   - 13-step workflow: bias → DOL → sweep → displacement → MSS → fib → retrace → confluence → entry
   - 15-state state machine with 14 transitions, 20 feature definitions, 16 reason codes
   - 11 mandatory preconditions per trade, 20 no-trade filters
   - Scoring: positive factors (max ~135), negative factors, threshold 70

3. **Coinlegs** (live pipeline) — 40 signals in D1, scoring with 6-component data-derived algorithm

## Integration Architecture

```
Coinlegs Signal
    │
    ├──→ [Pass 1] Existing 6-component scoring (outcome/speed/confluence/tf/indicator/momentum)
    │              Filter: score ≥ 65 = Tier A
    │
    ├──→ [Pass 2] SMC Structural Validator (NEW — from IvanG OS)
    │              Check 5 of 11 preconditions computable from candle data alone:
    │              1. HTF trend gate (MA7 > MA25 > MA99 = bullish, or inverse)
    │              2. Displacement present (recent strong directional move)
    │              3. Market structure intact (no opposing MSS)
    │              4. Entry zone valid (not at equilibrium, not at premium for longs)
    │              5. Target available (DOL above for longs, below for shorts)
    │              Result: structural_score 0-100, gate PASS/FAIL
    │
    ├──→ [Pass 3] Coil/Pump Detection (ADAPTED from ICR — simplified to 5 components)
    │              Components: range contraction, ATR contraction, BB squeeze,
    │                          volume dry-up, higher lows pressure
    │              Result: coil_score 0-100
    │
    └──→ Composite Decision
           A-tier:  coinlegs score ≥ 65 AND structural PASS AND coil ≥ 65
           B-tier:  coinlegs score ≥ 40 AND structural PASS
           Reject:  structural FAIL or coinlegs score < 40
```

## Parallel Strategy — Not Replacement

This is NOT replacing the coinlegs pipeline. The existing 6-component scoring is our primary edge. The SMC structural validator and coil detector are **confluence layers** — they gate signals, they don't generate them. A coinlegs signal that fails structural checks is skipped. A coinlegs signal that passes all three gates gets the highest conviction entry, SL/TP from the existing per-signal computation, and is dispatched immediately.

## ICR Backtest Reality Check (76 midcaps, 2.5 years, 4h)

| Metric | Value | Verdict |
|--------|-------|---------|
| Total trades | 94 | Too few for statistical significance |
| Win rate | 27.66% | Poor |
| Net R | -17.30 | Loses money |
| Expectancy | -0.184R per trade | Negative edge |
| Profit factor | 0.74 | Grossly unprofitable |
| Coil score predictiveness | Inverse | Higher scores = WORSE outcomes |
| Score discrimination | None | All 94 trades scored exactly 100 |
| Meta-labeling accuracy | 72% "avoid_or_fade" | Correctly identifies losers |

**Decision:** Do NOT integrate the ICR strategy as-is. Extract validated components only.

## What We Build Instead

1. **SMC Structural Validator** — from IvanG OS (proven framework, no overfitting)
   - 5 checks computable from candle structure alone
   - Gates every coinlegs signal before dispatch
   - Rejects entries into chop, equilibrium, or opposing structure

2. **Our Own Coil Score** — inspired by ICR's 11-component design but:
   - Built on OUR coinlegs data corpus (no temporal bias)
   - 5 components (range, ATR, BB, volume, higher lows)
   - Proper statistical validation before deployment
   - NOT gating trades — only adjusting position size (50% for low coil, 100% for high coil)

3. **Outcome Validator** — cron that checks if historical signals actually succeeded
   - Queries Binance klines for the signal duration window
   - Validates maxProfit claims against real price data
   - Builds a verified track record

4. **Historical Backfill** — seed the D1 corpus for ongoing research

## Implementation Sequence

1. **SMC Validator** — `src/server/smc/` — structural gating before dispatch
2. **Coil Score** — `src/server/coil/` — position-size modifier
3. **Outcome Validator** — `outcomeVerified` cron
4. **Backfill** — Pull 7 days × 5 pages to seed corpus
5. **Statistics** — Wire live metrics (Sharpe, profit factor, expectancy) from D1
