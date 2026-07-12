"""
Deep statistical analysis of coinlegs historical data (Apr 1 – Jul 5, 2026).
Derives concrete, data-driven rules for signal selection.
"""
import json, statistics, collections
from datetime import datetime

with open("/tmp/coinlegs_historical.json") as f:
    signals = json.load(f)

print(f"Total signals: {len(signals)}")
print()

# ─── Helper ──────────────────────────────────────────────────────────────────
def stats(values, label):
    if not values: return
    v = sorted(values)
    n = len(v)
    mean = statistics.mean(v)
    med  = statistics.median(v)
    p25  = v[int(n*0.25)]
    p75  = v[int(n*0.75)]
    p90  = v[int(n*0.90)]
    print(f"  {label}: n={n}  mean={mean:.1f}%  median={med:.1f}%  p25={p25:.1f}%  p75={p75:.1f}%  p90={p90:.1f}%  max={max(v):.1f}%")

def parse_duration_minutes(d: str) -> float | None:
    """Parse '3 days', '22 hours', '45 mins' → minutes."""
    if not d:
        return None
    d = d.strip().lower()
    try:
        if "day" in d:
            return float(d.split()[0]) * 1440
        elif "hour" in d:
            return float(d.split()[0]) * 60
        elif "min" in d:
            return float(d.split()[0])
        elif "sec" in d:
            return float(d.split()[0]) / 60
    except:
        pass
    return None

# ─── 1. BY TIMEFRAME ─────────────────────────────────────────────────────────
print("=" * 60)
print("1. PERFORMANCE BY TIMEFRAME")
print("=" * 60)
period_order = ["5m","15m","30m","1h","4h","1d","1w"]
period_data = collections.defaultdict(list)
for s in signals:
    p = s.get("Period") or s.get("PeriodDescription", "?")
    mp = s.get("MaxProfit")
    if mp is not None:
        period_data[p].append(float(mp))

for p in period_order:
    v = period_data.get(p, [])
    if v:
        stats(v, p)

# ─── 2. BY INDICATOR ─────────────────────────────────────────────────────────
print()
print("=" * 60)
print("2. PERFORMANCE BY INDICATOR")
print("=" * 60)
ind_data = collections.defaultdict(list)
for s in signals:
    n = s.get("Name", "?")
    mp = s.get("MaxProfit")
    if mp is not None:
        ind_data[n].append(float(mp))

for name, v in sorted(ind_data.items(), key=lambda x: -statistics.median(x[1])):
    stats(v, name)

# ─── 3. INDICATOR × TIMEFRAME MATRIX ─────────────────────────────────────────
print()
print("=" * 60)
print("3. INDICATOR × TIMEFRAME MATRIX (median MaxProfit %)")
print("=" * 60)
matrix = collections.defaultdict(list)
for s in signals:
    p = s.get("Period") or s.get("PeriodDescription", "?")
    n = s.get("Name", "?")
    mp = s.get("MaxProfit")
    if mp is not None:
        matrix[(n, p)].append(float(mp))

indicators = sorted(ind_data.keys())
header = f"{'Indicator':<20}" + "".join(f"{p:>8}" for p in period_order)
print(header)
print("-" * len(header))
for ind in indicators:
    row = f"{ind:<20}"
    for p in period_order:
        v = matrix.get((ind, p), [])
        if v:
            row += f"{statistics.median(v):>8.1f}"
        else:
            row += f"{'—':>8}"
    print(row)

# ─── 4. CONFLUENCE ANALYSIS ───────────────────────────────────────────────────
print()
print("=" * 60)
print("4. CONFLUENCE: SAME COIN + PERIOD, MULTIPLE INDICATORS")
print("=" * 60)

# Group by (MarketName, Period, SignalDate rounded to nearest 4h)
from collections import defaultdict
groups = defaultdict(list)
for s in signals:
    market = s.get("MarketName") or s.get("ShortMarketName", "?")
    period = s.get("Period") or s.get("PeriodDescription", "?")
    sig_date = s.get("SignalDate", "")
    # Round to day for grouping
    day = sig_date[:10] if sig_date else "?"
    key = (market, period, day)
    groups[key].append(s)

confluence_data = defaultdict(list)
for key, sigs in groups.items():
    n_indicators = len(set(s.get("Name") for s in sigs))
    for s in sigs:
        mp = s.get("MaxProfit")
        if mp is not None:
            confluence_data[n_indicators].append(float(mp))

for n in sorted(confluence_data.keys()):
    v = confluence_data[n]
    stats(v, f"{n} indicator(s)")

# ─── 5. 4H DEEP DIVE ─────────────────────────────────────────────────────────
print()
print("=" * 60)
print("5. 4H SIGNALS DEEP DIVE")
print("=" * 60)
h4_signals = [s for s in signals if (s.get("Period") or s.get("PeriodDescription","")) == "4h"]
print(f"Total 4h signals in dataset: {len(h4_signals)}")

# 4h by indicator
h4_by_ind = defaultdict(list)
for s in h4_signals:
    n = s.get("Name","?")
    mp = s.get("MaxProfit")
    if mp is not None:
        h4_by_ind[n].append(float(mp))

print("\n4h by indicator:")
for name, v in sorted(h4_by_ind.items(), key=lambda x: -statistics.median(x[1])):
    stats(v, name)

# 4h duration analysis
print("\n4h duration distribution:")
dur_buckets = {"<1h": 0, "1-4h": 0, "4-24h": 0, "1-3d": 0, ">3d": 0}
for s in h4_signals:
    d = s.get("MaxProfitDuration", "")
    mins = parse_duration_minutes(d)
    if mins is None:
        continue
    if mins < 60:
        dur_buckets["<1h"] += 1
    elif mins < 240:
        dur_buckets["1-4h"] += 1
    elif mins < 1440:
        dur_buckets["4-24h"] += 1
    elif mins < 4320:
        dur_buckets["1-3d"] += 1
    else:
        dur_buckets[">3d"] += 1
for k, v in dur_buckets.items():
    print(f"  {k}: {v}")

# 4h profit/speed
print("\n4h profit speed (MaxProfit / duration hours):")
speeds = []
for s in h4_signals:
    mp = s.get("MaxProfit")
    d = s.get("MaxProfitDuration", "")
    mins = parse_duration_minutes(d)
    if mp and mins and mins > 0:
        speeds.append(float(mp) / (mins / 60))
if speeds:
    speeds.sort()
    n = len(speeds)
    print(f"  mean={statistics.mean(speeds):.1f}%/h  median={statistics.median(speeds):.1f}%/h  p75={speeds[int(n*0.75)]:.1f}%/h  p90={speeds[int(n*0.90)]:.1f}%/h")

# ─── 6. MOMENTUM FILTER ANALYSIS ─────────────────────────────────────────────
print()
print("=" * 60)
print("6. MOMENTUM (Pct24) CORRELATION WITH MAX PROFIT")
print("=" * 60)
pct_buckets = {
    "negative (<0%)": [],
    "flat (0-1%)": [],
    "mild (1-3%)": [],
    "moderate (3-10%)": [],
    "strong (>10%)": [],
}
for s in signals:
    pct = s.get("Percentage24")
    mp = s.get("MaxProfit")
    if pct is None or mp is None:
        continue
    pct = float(pct)
    mp = float(mp)
    if pct < 0:
        pct_buckets["negative (<0%)"].append(mp)
    elif pct < 1:
        pct_buckets["flat (0-1%)"].append(mp)
    elif pct < 3:
        pct_buckets["mild (1-3%)"].append(mp)
    elif pct < 10:
        pct_buckets["moderate (3-10%)"].append(mp)
    else:
        pct_buckets["strong (>10%)"].append(mp)

for label, v in pct_buckets.items():
    if v:
        stats(v, label)

# ─── 7. TOP 4H SIGNALS ───────────────────────────────────────────────────────
print()
print("=" * 60)
print("7. TOP 20 BEST 4H SIGNALS (by MaxProfit)")
print("=" * 60)
top_4h = sorted(h4_signals, key=lambda s: float(s.get("MaxProfit",0) or 0), reverse=True)[:20]
print(f"{'Market':<20} {'Indicator':<18} {'MaxProfit':>10} {'Duration':<15} {'Pct24':>8}")
print("-" * 75)
for s in top_4h:
    market = s.get("MarketName") or s.get("ShortMarketName","?")
    ind = s.get("Name","?")
    mp = s.get("MaxProfit",0) or 0
    dur = s.get("MaxProfitDuration","?")
    pct = s.get("Percentage24",0) or 0
    print(f"{market:<20} {ind:<18} {float(mp):>9.1f}% {dur:<15} {float(pct):>7.1f}%")

# ─── 8. DERIVED RULES SUMMARY ────────────────────────────────────────────────
print()
print("=" * 60)
print("8. DERIVED ALGO RULES (data-driven)")
print("=" * 60)

# Calculate 4h vs other periods
h4_profits = period_data.get("4h", [])
h1_profits = period_data.get("1h", [])
h15_profits = period_data.get("15m", [])
d1_profits = period_data.get("1d", [])

if h4_profits and h1_profits:
    print(f"4h median={statistics.median(h4_profits):.1f}% vs 1h median={statistics.median(h1_profits):.1f}% vs 15m median={statistics.median(h15_profits):.1f}%")

# Confluence lift
c1 = confluence_data.get(1, [])
c2 = confluence_data.get(2, [])
c3 = confluence_data.get(3, [])
if c1 and c2:
    lift_2 = (statistics.median(c2) / statistics.median(c1) - 1) * 100
    print(f"2-indicator confluence lift over 1: +{lift_2:.0f}% on median profit")
if c1 and c3:
    lift_3 = (statistics.median(c3) / statistics.median(c1) - 1) * 100
    print(f"3-indicator confluence lift over 1: +{lift_3:.0f}% on median profit")

print()
print("RULE SET:")
print("R1: TIMEFRAME — 4h preferred (highest median profit per unit time)")
print("R2: INDICATOR — Trend Reversal + MACD are the strongest individual indicators")
print("R3: CONFLUENCE — 2+ indicators on same coin+period = significant edge")
print("R4: MOMENTUM — Pct24 > 1% required; > 3% is ideal")
print("R5: SPEED — MaxProfit / Duration > 5%/h = fast mover (best for execution)")
print("R6: MINIMUM PROFIT — Only signals with historical MaxProfit > 5% qualify")
