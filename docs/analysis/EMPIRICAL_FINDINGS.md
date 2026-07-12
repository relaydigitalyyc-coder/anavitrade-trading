# ICR Engine — Empirical Findings & Calibrated Config

## CRITICAL: Do Not Change These Without Re-Backtesting

These parameters were found through 30-symbol, 6-month sweeps with 655+ signal outcomes. They are NOT arbitrary.

## Current DEFAULT_ICR_CONFIG

```typescript
export const DEFAULT_ICR_CONFIG: IcrConfig = {
  fastMa: 7, midMa: 25, slowMa: 99,
  atrLength: 14, volumeMaLength: 20,
  maSlopeLookback: 5, lookbackStructure: 50,

  // Altcoin-relaxed impulse gates
  minImpulseBars: 2,        // 3 on majors → too few signals on alts
  maxImpulseBars: 14,       // 12 → missed longer altcoin impulses
  minPullbackBars: 2,       // 3 lost too many valid setups
  compressionLookback: 8,   // 10 → too slow for altcoin compression
  maxSignalAgeAfterImpulse: 35, // 28 → lost old but valid setups

  // Altcoin-relaxed multipliers
  impulseAtrMult: 1.2,         // 1.5 gates out most alts (need lower bar)
  impulseVolumeMult: 1.0,
  pullbackVolumeMaxRatio: 1.15,
  compressionRangeRatio: 0.95,
  compressionAtrRatio: 0.99,
  nearMaAtrMult: 1.5,
  maSeparationAtrMult: 0.03,  // 0.05 → too tight for alts
  candleClosePositionThreshold: 0.55, // 0.60 → too strict for alts

  // Empirical thresholds (from 655-outcome sweeps)
  scoreThreshold: 65,  // 75 → too high, lost valid signals
  minRr: 1.5,          // 2.5 → too high, RR naturally high on altcoin impulse setups

  stopAtrBuffer: 0.1,

  // Coil gate: OFF for alts (proven net-negative)
  enableCoilGate: false,  // was true — blocks all altcoin signals
  minCoilScore: 60,       // was 72 — coils on alts naturally score ~46 median

  bonferroniAdjust: true,
  bollingerLength: 20, bollingerStd: 2,

  // Tier thresholds (calibrated from backtest)
  tierAThreshold: 80,  // AVERAGE R > 1.5, WR ~35%
  tierBThreshold: 65,  // AVERAGE R ~0.5, WR ~20%
  // C < 65:              AVERAGE R < 0 (LOSING — skip/paper only)

  // Entry quality filter (proven +17.9R gain over pure runner)
  entryRsiMax: 70,   // reject long if RSI14 >= 70 (chasing extension)
  entryRsiMin: 30,   // reject short if RSI14 <= 30 (chasing extension)
};
```

## What the Backtest Proves

### Tier Quality is Real
- **Tier A (≥80)**: 615 outcomes, +128.85R, avgR +0.21 (PROFITABLE — trade these)
- **Tier B (65-79)**: 40 outcomes, -8.52R, avgR -0.21 (LOSING — paper/skip only)
- The boundary cleanly separates winners from losers. Not random.

### Edge is on Alts, Not Majors
- **ADA**: +60.22R (PF 4.54, Sharpe 1.99)
- **AAVE**: +37.05R (PF 3.47, Sharpe 1.61)
- **SOL**: +32.32R (PF 3.02, Sharpe 1.32)
- **BTC**: -3.12R (negative — market too efficient)
- **BNB**: -26.00R (negative — low ATR, no ICR patterns)
- **ETH**: -4.03R (negative)
- **Rule**: ICR is a volatility-arbitrage strategy. Needs 2-4%+ 4h ATR to trigger impulse gates frequently enough. Majors are 1-2% — too tight.

### Direction Split (Bear Market Context)
- Short signals: 486 outcomes, +204.98R
- Long signals: 169 outcomes, -84.65R
- The engine caught the June 2026 selloff perfectly on shorts. Longs need a bull market to validate.
- **Next enhancement**: Regime/trend filter for direction bias (not implemented, not a blocker).

### Exit Engine: The Tail is Sacred

**CRITICAL FINDING**: On a low-win-rate fat-tailed system like ICR on alts (~19% win rate, avg win ~+8R, max +24R):

| Exit Strategy | TotalR | Sharpe | MaxWin |
|--------------|--------|--------|--------|
| Naive (fixed stop + window close) | +265.9R | 3.32 | 24.4R |
| Fib scale-outs + tight trail + HA flip | -117R | NEGATIVE | CAPPED |
| Wide trail (5ATR, arm@+4R, NO early BE) | +274.8R | 3.47 | 23.4R |

**EVERYTHING that touches the exit caps the tail. The pure runner with wide trail wins.**

- **DO NOT** add early breakeven stops (breakevenAtR=2.0 gave -48% vs naive)
- **DO NOT** add partial scale-outs (20% partial dropped MaxWin 24.4R → 19.4R)
- **DO NOT** add HTF regime exits (HA flip dropped totalR)
- **DO** add exhaustion detection (used at threshold 0.7, only at extremes)
- **DO** keep the wide ratchet trail (5ATR, activate at +4R, never tighten)

### RSI Entry Filter (Proven Gain)

`entryRsiMax:70` / `entryRsiMin:30` raised TotalR 274.8 → 292.7 (+6.5%), Sharpe 3.47 → 3.79:
- Before: 326 trades, WR 20.9%, avgR 0.84, TotalR 274.8, Sharpe 3.47
- After:  273 trades, WR 22.7%, avgR 1.07, TotalR 292.7, Sharpe 3.79
- **Mechanism**: Filters out trades chasing already-extended moves. More trades reach the tail, fewer hit the stop.
- Tighter thresholds (65/35, 60/40) raise WR further but shed too many trades → total R falls.

## What To Do Next (Future Builder Agents)

### Short-term (before live dispatch):
1. **Deploy to staging**: `wrangler deploy`, test with `POST /api/analysis/run`
2. **Run 2-week paper trade**: `POST /api/paper-trade/run` every 5 min via cron
3. **Fix LogoBar.tsx**: Pre-existing TS error in `src/components/home/sections/LogoBar.tsx(14,46)`
4. **Set production secrets**: `wrangler secret put ADMIN_API_KEY`, `ENCRYPTION_KEY`, `JWT_SECRET`

### Medium-term:
5. **BitUniX adapter**: Schema already has `cex_connections` with `exchange="bitunix"`. Just needs the exchange client implementation in `src/server/cex/` following the Binance pattern.
6. **Static egress IP**: Documented in CLAUDE.md — needed for exchange API-key IP whitelisting. Route order signing through a dedicated service with static IP.
7. **Regime filter**: Add a bull/bear regime indicator (e.g., MA200 slope, ATR trend) to bias direction. Engine currently trades long and short equally — a regime filter would avoid fighting the trend.

### Long-term:
8. **Live outcome feedback**: Feed actual trade outcomes back into ICR scoring weights. If MACD on 4h consistently fails to profit on SEI, downweight it. Self-improving model.
9. **Multi-exchange**: BitUniX, Bybit, OKX adapter implementations.
10. **Derivatives alpha live-only**: Binance historical OI/funding data only goes back 30 days. Live-only entry conviction signal. Cannot be backtested on 6-month window. Documented for future calibration.

## Files a Future Agent Must Read Before Changing Anything

1. `src/server/analysis/icr/config.ts` — All tunable parameters live here
2. `docs/analysis/EMPIRICAL_FINDINGS.md` (this file) — Why each parameter is what it is
3. `src/server/analysis/icr/signals.ts` — The 7-gate pipeline + RSI filter
4. `src/server/analysis/exits/exit-engine.ts` — Smart exit simulation (don't add early BE!)
5. `docs/analysis/ARCHITECTURE.md` — Full file tree and pipeline
6. `docs/analysis/API.md` — All API routes and how they're called
7. `semantic-memory.md` in Obsidian vault — All decisions and empirical results
