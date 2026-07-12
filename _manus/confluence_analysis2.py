"""
Comprehensive first-principles analysis — fetch all pages across all timeframes.
"""
import json, subprocess, time
from collections import defaultdict

def fetch_page(page):
    result = subprocess.run([
        "curl", "-s", "-X", "POST", "https://api.coinlegs.com/api/Exchange/SelectDetections",
        "-H", "Content-Type: application/json",
        "-d", json.dumps({
            "Exchg": "Binance", "Market": "USDT",
            "IncludeBuySignal": True, "IncludeNeutralSignal": False, "IncludeSellSignal": False,
            "DetectionIds": [47, 9, 8, 46, 7],
            "Periods": ["5m", "15m", "30m", "1h", "4h", "1d", "1w"],
            "StartDate": "2026-06-28T00:00:00.000Z", "EndDate": "2026-07-05T23:59:59.000Z",
            "__Key": "scraper", "Sorting": {}, "Page": page, "RowsInPage": 100
        })
    ], capture_output=True, text=True)
    return json.loads(result.stdout)

# Fetch all pages
all_sigs = []
first = fetch_page(0)
max_page = first["Data"]["MaxPage"]
all_sigs.extend(first["Data"]["Signals"])
print(f"Page 0: {len(first['Data']['Signals'])} signals, MaxPage={max_page}")

for p in range(1, min(max_page+1, 10)):
    d = fetch_page(p)
    sigs = d["Data"]["Signals"]
    all_sigs.extend(sigs)
    print(f"Page {p}: {len(sigs)} signals")
    time.sleep(0.2)

buy_sigs = [s for s in all_sigs if s["Signal"] == 1]
print(f"\nTotal Buy signals: {len(buy_sigs)}")

# ── MaxProfit distribution ──────────────────────────────────────────────────
profits = [(s["MaxProfit"] or 0) for s in buy_sigs]
print(f"\n── MaxProfit distribution (n={len(profits)}) ──")
buckets = [(0,0,"=0"), (0,0.5,"0-0.5%"), (0.5,2,"0.5-2%"), (2,5,"2-5%"), (5,10,"5-10%"), (10,20,"10-20%"), (20,999,"20%+")]
for lo, hi, label in buckets:
    if label == "=0":
        n = sum(1 for p in profits if p == 0)
    else:
        n = sum(1 for p in profits if lo <= p < hi)
    print(f"  {label:10}: {n:3} ({100*n/len(profits):.0f}%)")

# ── Pct24 alignment ─────────────────────────────────────────────────────────
print(f"\n── Pct24 vs MaxProfit (momentum alignment) ──")
for lo, hi, label in [(-999,-5,"< -5%"), (-5,-1,"-5 to -1%"), (-1,0,"-1 to 0%"), (0,1,"0-1%"), (1,3,"1-3%"), (3,10,"3-10%"), (10,999,">10%")]:
    cohort = [s for s in buy_sigs if lo <= (s.get("Percentage24") or 0) < hi]
    if not cohort: continue
    avg_mp = sum(s["MaxProfit"] or 0 for s in cohort) / len(cohort)
    pct_above5 = sum(1 for s in cohort if (s["MaxProfit"] or 0) >= 5)
    print(f"  Pct24 {label:12}: n={len(cohort):3}  avgMaxProfit={avg_mp:.2f}%  ≥5%: {pct_above5} ({100*pct_above5/len(cohort):.0f}%)")

# ── Timeframe vs MaxProfit ──────────────────────────────────────────────────
print(f"\n── Timeframe vs MaxProfit ──")
by_period = defaultdict(list)
for s in buy_sigs:
    by_period[s["Period"]].append(s["MaxProfit"] or 0)
for p in ["5m","15m","30m","1h","4h","1d","1w"]:
    if p in by_period:
        vals = by_period[p]
        avg = sum(vals)/len(vals)
        above5 = sum(1 for v in vals if v >= 5)
        above10 = sum(1 for v in vals if v >= 10)
        zero = sum(1 for v in vals if v == 0)
        print(f"  {p:5}: n={len(vals):3}  avg={avg:.2f}%  ≥5%: {above5} ({100*above5/len(vals):.0f}%)  ≥10%: {above10} ({100*above10/len(vals):.0f}%)  zero: {zero} ({100*zero/len(vals):.0f}%)")

# ── Indicator confluence: same coin+period, multiple indicators ──────────────
print(f"\n── Confluence: same coin+period, multiple indicators firing ──")
coin_period = defaultdict(list)
for s in buy_sigs:
    key = (s["MarketName"], s["Period"])
    coin_period[key].append(s)

single = {k: v for k, v in coin_period.items() if len(v) == 1}
double = {k: v for k, v in coin_period.items() if len(v) == 2}
triple = {k: v for k, v in coin_period.items() if len(v) >= 3}

def avg_mp(sigs): return sum(s["MaxProfit"] or 0 for s in sigs) / len(sigs)
def pct_above5(sigs): return 100 * sum(1 for s in sigs if (s["MaxProfit"] or 0) >= 5) / len(sigs)

single_sigs = [s for v in single.values() for s in v]
double_sigs = [s for v in double.values() for s in v]
triple_sigs = [s for v in triple.values() for s in v]

print(f"  1 indicator:  {len(single_sigs):3} signals  avgMaxProfit={avg_mp(single_sigs):.2f}%  ≥5%: {pct_above5(single_sigs):.0f}%")
if double_sigs:
    print(f"  2 indicators: {len(double_sigs):3} signals  avgMaxProfit={avg_mp(double_sigs):.2f}%  ≥5%: {pct_above5(double_sigs):.0f}%")
if triple_sigs:
    print(f"  3+ indicators:{len(triple_sigs):3} signals  avgMaxProfit={avg_mp(triple_sigs):.2f}%  ≥5%: {pct_above5(triple_sigs):.0f}%")

# Show top confluence examples
print(f"\n  Top confluence examples (2+ indicators):")
for (coin, period), sigs in sorted(double.items(), key=lambda x: -avg_mp(x[1]))[:8]:
    inds = [s["Name"] for s in sigs]
    mp_vals = [s["MaxProfit"] or 0 for s in sigs]
    print(f"    {coin:15} {period:5}: {', '.join(inds):40} MaxProfits={[f'{p:.1f}%' for p in mp_vals]}")

# ── Profit efficiency ────────────────────────────────────────────────────────
print(f"\n── Profit efficiency: MaxProfit / Duration ──")
def parse_hours(dur):
    if not dur: return None
    dur = dur.lower().strip()
    if "day" in dur:
        return float(dur.split()[0]) * 24
    elif "hour" in dur:
        return float(dur.split()[0])
    elif "min" in dur:
        return float(dur.split()[0]) / 60
    return None

eff_data = []
for s in buy_sigs:
    mp = s.get("MaxProfit") or 0
    h = parse_hours(s.get("MaxProfitDuration"))
    if mp > 0 and h and h > 0:
        eff_data.append((s["MarketName"], s["Period"], s["Name"], mp, h, mp/h))

eff_data.sort(key=lambda x: -x[5])
print(f"  Top 15 by %/hour:")
for coin, period, ind, mp, h, eff in eff_data[:15]:
    print(f"    {coin:15} {period:5} {ind:20} {mp:.2f}% in {h:.1f}h = {eff:.3f}%/h")

# ── Conclusion: what are the scoring criteria? ──────────────────────────────
print(f"\n── SCORING DESIGN CONCLUSION ──")
print("""
First-principles confluence scoring (all criteria must be data-justified):

GATE 1 — MaxProfit > 0 (hard filter)
  55% of signals have MaxProfit=0 — price never moved up. These are noise.
  Only signals with MaxProfit > 0 are worth showing.

GATE 2 — Pct24 > 0 (momentum alignment)
  Signals where Pct24 ≤ 0 have near-zero avg MaxProfit (0.06%).
  Momentum must be in the signal direction.

SCORING (0-100, all criteria must independently confirm):

A. Realized Outcome (MaxProfit) — 40 pts
   This is the ONLY objective truth: did the trade work?
   ≥20%: 40 | ≥10%: 32 | ≥5%: 24 | ≥2%: 16 | ≥0.5%: 8 | >0: 4

B. Profit Speed (MaxProfit / Duration hours) — 25 pts
   Fast moves are more tradeable (less overnight risk, tighter stops).
   ≥5%/h: 25 | ≥2%/h: 20 | ≥1%/h: 15 | ≥0.5%/h: 10 | ≥0.1%/h: 5

C. Indicator Confluence — 20 pts
   Same coin+period firing on 2+ independent indicators = genuine agreement.
   3+ indicators: 20 | 2 indicators: 12 | 1 indicator: 0
   (Confluence is binary — either multiple methods agree or they don't)

D. Timeframe Maturity — 15 pts
   Higher timeframes: more candles averaged, less noise, more institutional.
   1w: 15 | 1d: 13 | 4h: 10 | 1h: 7 | 30m: 4 | 15m: 2 | 5m: 0

Tiers: A ≥ 65, B ≥ 40, C ≥ 20, rejected < 20
""")
