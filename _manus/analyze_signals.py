import json, subprocess, sys

result = subprocess.run([
    "curl", "-s", "-X", "POST", "https://api.coinlegs.com/api/Exchange/SelectDetections",
    "-H", "Content-Type: application/json",
    "-d", json.dumps({
        "Exchg": "Binance", "Market": "USDT",
        "IncludeBuySignal": True, "IncludeNeutralSignal": False, "IncludeSellSignal": False,
        "DetectionIds": [47, 9, 8, 46, 7], "MarketName": "",
        "Periods": ["5m", "15m", "30m", "1h", "4h", "1d", "1w"],
        "StartDate": "2026-06-29T00:00:00.000Z", "EndDate": "2026-07-05T23:59:59.000Z",
        "__Key": "scraper", "Sorting": {}, "Page": 0, "RowsInPage": 100
    })
], capture_output=True, text=True)

d = json.loads(result.stdout)
print("Keys in Data:", list(d.get("Data", {}).keys()))
sigs = d["Data"]["Signals"]
print(f"Signals in page: {len(sigs)}")

# Analyze quality fields
maxprofits = [s["MaxProfit"] for s in sigs if s.get("MaxProfit") is not None]
pcts = [s["Percentage24"] for s in sigs if s.get("Percentage24") is not None]
periods = {}
indicators = {}
for s in sigs:
    periods[s["Period"]] = periods.get(s["Period"], 0) + 1
    indicators[s["Name"]] = indicators.get(s["Name"], 0) + 1

print(f"\nMaxProfit: min={min(maxprofits):.2f}% max={max(maxprofits):.2f}% avg={sum(maxprofits)/len(maxprofits):.2f}%")
print(f"MaxProfit >1%: {sum(1 for p in maxprofits if p >= 1)}")
print(f"MaxProfit >2%: {sum(1 for p in maxprofits if p >= 2)}")
print(f"MaxProfit >5%: {sum(1 for p in maxprofits if p >= 5)}")
print(f"MaxProfit >10%: {sum(1 for p in maxprofits if p >= 10)}")
print(f"\nPct24: min={min(pcts):.2f}% max={max(pcts):.2f}% avg={sum(pcts)/len(pcts):.2f}%")
print(f"Pct24 >0: {sum(1 for p in pcts if p > 0)}")
print(f"Pct24 >3%: {sum(1 for p in pcts if p >= 3)}")
print(f"\nPeriods: {dict(sorted(periods.items()))}")
print(f"Indicators: {indicators}")

# Duration analysis
durs = [s["MaxProfitDuration"] for s in sigs if s.get("MaxProfitDuration")]
print(f"\nDuration samples: {durs[:10]}")

# Top 10 by MaxProfit
print("\nTop 10 by MaxProfit:")
top = sorted(sigs, key=lambda s: s.get("MaxProfit") or 0, reverse=True)[:10]
for s in top:
    print(f"  {s['MarketName']:15} {s['Name']:20} {s['Period']:5}  "
          f"MaxProfit={s.get('MaxProfit')}%  Dur={s.get('MaxProfitDuration')}  "
          f"Pct24={s.get('Percentage24')}%  LastPrice={s.get('LastPrice')}")

# Signals with MaxProfit=0 or None
zero = sum(1 for s in sigs if not s.get("MaxProfit"))
print(f"\nSignals with no MaxProfit data: {zero}/{len(sigs)}")
