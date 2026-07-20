# Money Flow / WaveTrend Filter Replication — Disjoint 36-Symbol Test

**Status: Money Flow filter's drawdown benefit does NOT replicate. WaveTrend filters' rejection DOES replicate (confirmed robust).**

## What this tests

`docs/analysis/EMPIRICAL_FINDINGS.md`'s "Money Flow Direction Filter" section
reported a promising-looking result from `scripts/icr-wavetrend-experiment.ts`
on the project's standard 49-pair/120-day corpus (`klines-mtf-extended.json`):
drawdown nearly halved (44.8%→24.5%) with PF/Sharpe flat-to-better, walk-forward
PASS on both splits. That corpus is the same one used elsewhere this session
(the ML locked-gate run, etc.) — not yet checked against genuinely different
symbols.

Applied the same discipline used to reject the bottom-confluence hypothesis
elsewhere this session: verify the implementation for lookahead bugs first
(`moneyFlow()` in `src/server/analysis/indicators.ts` uses only backward-looking
SMA windows — confirmed clean, no bug), then re-run the **exact same script**,
unchanged, against a genuinely disjoint 36-symbol set (the same disjoint
universe used for the bottom-confluence out-of-sample test — legacy-generation
alts: BCH, TRX, ETC, XLM, DASH, ZEC, XTZ, ATOM, ONT, IOTA, BAT, VET, NEO, QTUM,
IOST, THETA, ALGO, ZIL, KNC, ZRX, COMP, KAVA, BAND, RLC, SNX, YFI, CRV, TRB,
SUSHI, EGLD, ICX, STORJ, UNI, ENJ, KSM, AAVE; 2024-01-present, 4h+1h,
freshly fetched from Binance).

`test-disjoint-36.ts` is `scripts/icr-wavetrend-experiment.ts` with only the
`DATA_PATH` changed (`/tmp/disjoint-38-mtf.json`, regenerate via the fetch
commands in this session's history if needed) — no other logic touched.

## Results

| Metric | Baseline (val) | WaveTrend strict/simple (val) | Money Flow (val) |
|---|---|---|---|
| Trades | 1849 | 0 (100% eliminated) | 1454 (21.4% dropped) |
| Win Rate | 32.4% | — | 32.9% |
| Profit Factor | 0.87 | 0.00 | 0.86 |
| Sharpe | -1.05 | 0.00 | -1.11 |
| Max Drawdown | 307.5% | — | **335.7%** (worse, not halved) |
| Walk-forward | PASS | FAIL (0 trades) | PASS (but see below) |

Compare to the original 49-pair corpus result: baseline PF 1.71→Money Flow
1.75, Sharpe 3.68→3.82, MaxDD 44.8%→**24.5%** (nearly halved).

## Honest conclusion

- **WaveTrend extreme/simple filters**: rejection **reproduces exactly** —
  100% of trades eliminated on this symbol set too, same as the original
  finding. This confirms (does not just repeat) that ICR's continuation-based
  entries and WaveTrend's reversal-timing concept are structurally
  incompatible, not a corpus-specific fluke.
- **Money Flow filter**: the headline benefit (drawdown nearly halved) **does
  NOT replicate**. On this disjoint set, drawdown gets slightly *worse*
  (307.5%→335.7%) and Sharpe gets slightly worse (-1.05→-1.11), not better.
  PF is flat (0.87→0.86).
- Important confound: the baseline itself is much worse on this symbol set
  (PF <1, deeply negative Sharpe) than on the original 49-pair corpus
  (PF 1.71, Sharpe 3.68) — these are older-generation, likely lower-volatility
  or less-trending alts, a genuine market-composition difference, not just
  noise. A filter's marginal effect on an already-broken baseline is a
  different question from its effect on a working one, so this isn't a
  perfectly clean apples-to-apples test — but it does mean the original
  "drawdown nearly halved" claim was specific to that one corpus and does
  not generalize as-is.

**Net effect on this session's overall findings**: the one result flagged as
"directionally interesting" across two independent sessions' worth of edge
search does not survive genuine out-of-sample replication, consistent with
every other lead tested this session. Do not enable `enableMoneyFlowFilter`
in `DEFAULT_ICR_CONFIG` on the strength of the original corpus alone.
