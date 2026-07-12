"""
Fetch the full April 1 – July 5, 2026 coinlegs historical dataset.
Fetches Buy-only signals across all timeframes and all 5 indicators.
Uses ISO date format (same as the working scraper).
"""
import json, time, csv, urllib.request

API_URL = "https://api.coinlegs.com/api/Exchange/SelectDetections"
DETECTION_IDS = [47, 9, 8, 46, 7]  # CCI, Ichimoku, MACD, Stochastic, Trend Reversal
PERIODS = ["5m", "15m", "30m", "1h", "4h", "1d", "1w"]

# ISO format — same as working scraper
START_DATE = "2026-04-01T00:00:00.000Z"
END_DATE   = "2026-07-05T23:59:59.000Z"

def fetch_page(page: int, rows: int = 100) -> dict:
    body = json.dumps({
        "Exchg": "Binance",
        "Market": "USDT",
        "IncludeBuySignal": True,
        "IncludeNeutralSignal": False,
        "IncludeSellSignal": False,
        "DetectionIds": DETECTION_IDS,
        "MarketName": "",
        "Periods": PERIODS,
        "StartDate": START_DATE,
        "EndDate": END_DATE,
        "__Key": "historical",
        "Sorting": {},
        "Page": page,
        "RowsInPage": rows,
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Origin": "https://www.coinlegs.com",
            "Referer": "https://www.coinlegs.com/detections",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=35) as resp:
        return json.loads(resp.read().decode("utf-8"))

# Test with page 0
print("Fetching page 0...")
p0 = fetch_page(0, 100)
if not p0.get("Success"):
    print("ERROR:", p0)
    exit(1)

total = p0["Data"]["TotalDetections"]
max_page = p0["Data"]["MaxPage"]
row_count = p0["Data"]["RowCount"]
print(f"Total: {total}, MaxPage: {max_page}, RowCount: {row_count}")

all_signals = list(p0["Data"]["Signals"])
print(f"  Page 0: {len(all_signals)} signals")

# Fetch all remaining pages
for page in range(1, max_page + 1):
    try:
        data = fetch_page(page, 100)
        if data.get("Success") and data["Data"].get("Signals"):
            sigs = data["Data"]["Signals"]
            all_signals.extend(sigs)
            print(f"  Page {page}: {len(sigs)} signals (total: {len(all_signals)})")
        else:
            print(f"  Page {page}: empty or failed")
        time.sleep(0.4)
    except Exception as e:
        print(f"  Page {page}: ERROR {e}")
        time.sleep(2)

print(f"\nTotal fetched: {len(all_signals)} signals")

# Save raw JSON
with open("/tmp/coinlegs_historical.json", "w") as f:
    json.dump(all_signals, f)
print("Saved /tmp/coinlegs_historical.json")

# Quick summary
by_period = {}
by_indicator = {}
for s in all_signals:
    p = s.get("Period", "?")
    n = s.get("Name", "?")
    by_period[p] = by_period.get(p, 0) + 1
    by_indicator[n] = by_indicator.get(n, 0) + 1

print("By period:", dict(sorted(by_period.items())))
print("By indicator:", by_indicator)
