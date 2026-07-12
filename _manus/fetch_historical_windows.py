"""
Fetch full April 1 – July 5, 2026 coinlegs dataset using 7-day sliding windows.
The API only accepts ~7-day ranges, so we iterate week by week.
"""
import json, time, urllib.request
from datetime import datetime, timedelta, timezone

API_URL = "https://api.coinlegs.com/api/Exchange/SelectDetections"
DETECTION_IDS = [47, 9, 8, 46, 7]  # CCI, Ichimoku, MACD, Stochastic, Trend Reversal
PERIODS = ["5m", "15m", "30m", "1h", "4h", "1d", "1w"]

HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Origin": "https://www.coinlegs.com",
    "Referer": "https://www.coinlegs.com/detections",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

def fetch_page(start_iso: str, end_iso: str, page: int) -> dict:
    body = json.dumps({
        "Exchg": "Binance",
        "Market": "USDT",
        "IncludeBuySignal": True,
        "IncludeNeutralSignal": False,
        "IncludeSellSignal": False,
        "DetectionIds": DETECTION_IDS,
        "MarketName": "",
        "Periods": PERIODS,
        "StartDate": start_iso,
        "EndDate": end_iso,
        "__Key": "historical",
        "Sorting": {},
        "Page": page,
        "RowsInPage": 100,
    }).encode("utf-8")
    req = urllib.request.Request(API_URL, data=body, headers=HEADERS, method="POST")
    with urllib.request.urlopen(req, timeout=35) as resp:
        return json.loads(resp.read().decode("utf-8"))

def fetch_window(start_dt: datetime, end_dt: datetime) -> list:
    """Fetch all pages for a given date window."""
    start_iso = start_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    end_iso = end_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    
    try:
        p0 = fetch_page(start_iso, end_iso, 0)
    except Exception as e:
        print(f"    ERROR page 0: {e}")
        return []
    
    if not p0.get("Success"):
        print(f"    API returned Success=False")
        return []
    
    total = p0["Data"]["TotalDetections"]
    max_page = p0["Data"]["MaxPage"]
    signals = list(p0["Data"]["Signals"])
    
    print(f"    Total={total}, MaxPage={max_page}, got {len(signals)}")
    
    for page in range(1, min(max_page + 1, 50)):  # cap at 50 pages = 5000 per window
        try:
            data = fetch_page(start_iso, end_iso, page)
            if data.get("Success") and data["Data"].get("Signals"):
                signals.extend(data["Data"]["Signals"])
            time.sleep(0.3)
        except Exception as e:
            print(f"    ERROR page {page}: {e}")
            time.sleep(1)
    
    return signals

# Build 7-day windows from April 1 to July 5
start = datetime(2026, 4, 1, 0, 0, 0, tzinfo=timezone.utc)
end_overall = datetime(2026, 7, 5, 23, 59, 59, tzinfo=timezone.utc)

all_signals = []
seen_ids = set()

window_start = start
window_num = 0

while window_start < end_overall:
    window_end = min(window_start + timedelta(days=7), end_overall)
    window_num += 1
    
    label = f"{window_start.strftime('%b %d')} – {window_end.strftime('%b %d')}"
    print(f"\nWindow {window_num}: {label}")
    
    sigs = fetch_window(window_start, window_end)
    
    # Deduplicate by signal ID
    new_count = 0
    for s in sigs:
        sid = s.get("Id")
        if sid and sid not in seen_ids:
            seen_ids.add(sid)
            all_signals.append(s)
            new_count += 1
    
    print(f"    New unique signals: {new_count} (running total: {len(all_signals)})")
    
    window_start = window_end + timedelta(seconds=1)
    time.sleep(0.5)

print(f"\n{'='*60}")
print(f"TOTAL UNIQUE SIGNALS: {len(all_signals)}")

# Save
with open("/tmp/coinlegs_historical.json", "w") as f:
    json.dump(all_signals, f)
print("Saved /tmp/coinlegs_historical.json")

# Quick summary
by_period = {}
by_indicator = {}
profits = []
for s in all_signals:
    p = s.get("Period", "?")
    n = s.get("Name", "?")
    mp = s.get("MaxProfit")
    by_period[p] = by_period.get(p, 0) + 1
    by_indicator[n] = by_indicator.get(n, 0) + 1
    if mp is not None:
        profits.append(float(mp))

period_order = ["5m","15m","30m","1h","4h","1d","1w"]
print("\nBy period:")
for p in period_order:
    print(f"  {p}: {by_period.get(p, 0)}")
print("\nBy indicator:", by_indicator)
if profits:
    import statistics
    print(f"\nMaxProfit stats: min={min(profits):.2f}% mean={statistics.mean(profits):.2f}% median={statistics.median(profits):.2f}% max={max(profits):.2f}%")
    print(f"Signals with MaxProfit>5%: {sum(1 for p in profits if p>5)}")
    print(f"Signals with MaxProfit>10%: {sum(1 for p in profits if p>10)}")
    print(f"Signals with MaxProfit>20%: {sum(1 for p in profits if p>20)}")
