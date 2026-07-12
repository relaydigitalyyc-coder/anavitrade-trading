"""
First-principles confluence analysis of coinlegs signal data.

Goal: understand what the data actually shows so scoring reflects reality,
not arbitrary weights.

Key insight from the screenshot:
- The coinlegs data shows 4h Buy signals with MaxProfit 2–36%
- Duration ranges from 3 hours to 4 days
- Same coin (e.g. TAO, VANA) can fire on multiple indicators simultaneously
  — that IS confluence: independent indicators agreeing on the same coin

First principles for a Buy signal to be high quality:
1. OUTCOME CONFIRMATION: MaxProfit > 0 means price actually moved up after signal.
   MaxProfit is the ONLY objective ground truth. Everything else is a predictor.
2. MOMENTUM ALIGNMENT: Pct24 > 0 means the coin is already moving in the signal
   direction. Counter-trend signals (Pct24 < 0) have lower hit rates.
3. TIMEFRAME MATURITY: Higher timeframes close fewer candles per day, so each
   signal represents more accumulated price action. 4h > 1h > 15m in signal quality.
4. INDICATOR CONFLUENCE: If the SAME coin fires Buy on 2+ different indicators
   in the same time window, that is genuine confluence — independent methods agree.
5. PROFIT EFFICIENCY: MaxProfit / Duration tells us how fast the move happened.
   A 10% move in 3 hours is better than 10% in 4 days.

What we do NOT use:
- Arbitrary indicator "reliability" rankings (Ichimoku=15, MACD=11 etc.) — that's
  just bias. All 5 indicators are valid technical methods. Their confluence matters,
  not their individual "score".
- Arbitrary timeframe weights without justification.
"""

import json, subprocess

result = subprocess.run([
    "curl", "-s", "-X", "POST", "https://api.coinlegs.com/api/Exchange/SelectDetections",
    "-H", "Content-Type: application/json",
    "-d", json.dumps({
        "Exchg": "Binance", "Market": "USDT",
        "IncludeBuySignal": True, "IncludeNeutralSignal": False, "IncludeSellSignal": False,
        "DetectionIds": [47, 9, 8, 46, 7],
        "Periods": ["5m", "15m", "30m", "1h", "4h", "1d", "1w"],
        "StartDate": "2026-06-29T00:00:00.000Z", "EndDate": "2026-07-05T23:59:59.000Z",
        "__Key": "scraper", "Sorting": {}, "Page": 0, "RowsInPage": 100
    })
], capture_output=True, text=True)

d = json.loads(result.stdout)
sigs = d["Data"]["Signals"]
print(f"Sample size: {len(sigs)} Buy signals")

# ── 1. MaxProfit distribution ──────────────────────────────────────────────────
profits = [(s["MaxProfit"] or 0) for s in sigs]
print(f"\n── MaxProfit distribution ──")
print(f"  0%:        {sum(1 for p in profits if p == 0)} signals ({100*sum(1 for p in profits if p==0)/len(profits):.0f}%)")
print(f"  0-2%:      {sum(1 for p in profits if 0 < p < 2)} signals")
print(f"  2-5%:      {sum(1 for p in profits if 2 <= p < 5)} signals")
print(f"  5-10%:     {sum(1 for p in profits if 5 <= p < 10)} signals")
print(f"  10-20%:    {sum(1 for p in profits if 10 <= p < 20)} signals")
print(f"  20%+:      {sum(1 for p in profits if p >= 20)} signals")

# ── 2. Pct24 vs MaxProfit correlation ─────────────────────────────────────────
print(f"\n── Pct24 alignment with MaxProfit ──")
pos_pct = [s for s in sigs if (s.get("Percentage24") or 0) > 0]
neg_pct = [s for s in sigs if (s.get("Percentage24") or 0) <= 0]
pos_avg = sum(s["MaxProfit"] or 0 for s in pos_pct) / max(len(pos_pct), 1)
neg_avg = sum(s["MaxProfit"] or 0 for s in neg_pct) / max(len(neg_pct), 1)
print(f"  Pct24 > 0: {len(pos_pct)} signals, avg MaxProfit = {pos_avg:.2f}%")
print(f"  Pct24 ≤ 0: {len(neg_pct)} signals, avg MaxProfit = {neg_avg:.2f}%")

# ── 3. Timeframe vs MaxProfit ──────────────────────────────────────────────────
print(f"\n── Timeframe vs avg MaxProfit ──")
by_period = {}
for s in sigs:
    p = s["Period"]
    if p not in by_period:
        by_period[p] = []
    by_period[p].append(s["MaxProfit"] or 0)
for p in ["5m","15m","30m","1h","4h","1d","1w"]:
    if p in by_period:
        vals = by_period[p]
        avg = sum(vals)/len(vals)
        above5 = sum(1 for v in vals if v >= 5)
        print(f"  {p:5}: n={len(vals):3}  avg={avg:.2f}%  ≥5%: {above5} ({100*above5/len(vals):.0f}%)")

# ── 4. Confluence: same coin, multiple indicators ─────────────────────────────
print(f"\n── Indicator confluence (same coin, same period, multiple indicators) ──")
from collections import defaultdict
coin_period_indicators = defaultdict(list)
for s in sigs:
    key = (s["MarketName"], s["Period"])
    coin_period_indicators[key].append(s["Name"])

multi = {k: v for k, v in coin_period_indicators.items() if len(v) >= 2}
print(f"  Coins with 2+ indicators firing: {len(multi)}")
for (coin, period), inds in sorted(multi.items(), key=lambda x: -len(x[1]))[:10]:
    # Get MaxProfit for these signals
    profits_for = [s["MaxProfit"] or 0 for s in sigs if s["MarketName"] == coin and s["Period"] == period]
    avg_p = sum(profits_for)/len(profits_for)
    print(f"    {coin:15} {period:5}: {', '.join(inds):50} avg MaxProfit={avg_p:.2f}%")

# ── 5. Profit efficiency (MaxProfit / duration in hours) ──────────────────────
print(f"\n── Profit efficiency (MaxProfit / duration) ──")
def parse_duration_hours(dur):
    if not dur: return None
    dur = dur.lower().strip()
    if "day" in dur:
        n = float(dur.split()[0])
        return n * 24
    elif "hour" in dur:
        n = float(dur.split()[0])
        return n
    elif "min" in dur:
        n = float(dur.split()[0])
        return n / 60
    return None

efficient = []
for s in sigs:
    mp = s.get("MaxProfit") or 0
    dur_h = parse_duration_hours(s.get("MaxProfitDuration"))
    if mp > 0 and dur_h and dur_h > 0:
        eff = mp / dur_h
        efficient.append((s["MarketName"], s["Period"], s["Name"], mp, dur_h, eff))

efficient.sort(key=lambda x: -x[5])
print(f"  Top 10 by profit/hour:")
for coin, period, ind, mp, dur, eff in efficient[:10]:
    print(f"    {coin:15} {period:5} {ind:20} MaxProfit={mp:.2f}% in {dur:.1f}h = {eff:.3f}%/h")

# ── 6. What does "no MaxProfit" mean? ─────────────────────────────────────────
no_profit = [s for s in sigs if not s.get("MaxProfit")]
print(f"\n── Signals with MaxProfit=0 or None: {len(no_profit)} ──")
print(f"  These are signals where price did NOT move up after the Buy signal.")
print(f"  By timeframe: { {p: sum(1 for s in no_profit if s['Period']==p) for p in ['5m','15m','30m','1h','4h','1d','1w'] if any(s['Period']==p for s in no_profit)} }")
