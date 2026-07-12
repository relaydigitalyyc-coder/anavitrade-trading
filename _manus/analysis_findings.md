# Anavitrade Historical Signal Analysis Findings
## Dataset: 1,266 top-performing signals, April 1 – July 5, 2026

## KEY FINDINGS (data-derived rules)

### R1 — TIMEFRAME
- 4h: median 104.1% (n=250) — PREFERRED
- 1h: median 104.8% (n=353) — close second
- 15m: median 95.8% (n=324) — weakest
- 1d: median 104.3% (n=157)
- 1w: median 146% (n=7) — highest but tiny sample

### R2 — INDICATOR PRIORITY ON 4h
- MACD: median 116.3% (n=54) — STRONGEST
- Stochastic: median 110.1% (n=60) — SECOND
- Trend Reversal: median 102.5% (n=42)
- CCI: median 97.2% (n=58)
- Ichimoku: median 96.4% (n=36) — weakest on 4h, strongest on 1w

### R3 — CONFLUENCE (4h)
- 1 indicator: median 98% (n=162)
- 2 indicators: median 105% (n=70) — +7% lift
- 3 indicators: median 124% (n=18) — +26% lift
- 5 indicators: median 121.6% across all TFs

### R4 — MOMENTUM (Pct24) — COUNTER-INTUITIVE
- Negative (<0%): median 100.1% (n=786) — NOT a disqualifier!
- Flat (0-1%): median 102.1% (n=201)
- Mild (1-3%): median 76.6% (n=25) — WEAKEST
- Moderate (3-10%): median 93.2% (n=144)
- Strong (>10%): median 110.3% (n=110) — STRONGEST
- RULE: Do NOT gate on Pct24. Use as bonus only.

### R5 — PROFIT SPEED (4h)
- Median: 0.8%/h
- P75: 2.1%/h
- P90: 4.6%/h
- Signals >4.6%/h = fast movers, ideal for automated execution

## NEW SCORING ALGORITHM (data-derived)

### Hard Gate (only 1):
- MaxProfit > 0 (price actually moved)
- REMOVE Pct24 gate — data shows negative momentum signals are NOT worse

### Scoring (0–100):
A. Realized Outcome (35 pts):
   - ≥20%: 35 | ≥10%: 29 | ≥5%: 23 | ≥3%: 17 | ≥1%: 10 | ≥0.5%: 5 | >0: 2

B. Profit Speed (25 pts):
   - ≥10%/h: 25 | ≥5%/h: 20 | ≥2%/h: 15 | ≥1%/h: 10 | ≥0.5%/h: 6 | ≥0.1%/h: 3

C. Indicator Confluence (20 pts):
   - 5 indicators: 20 | 4: 18 | 3: 15 | 2: 8 | 1: 0

D. Timeframe (15 pts) — 4h BOOSTED:
   - 1w: 15 | 1d: 13 | 4h: 12 (boosted from 10) | 1h: 8 | 30m: 4 | 15m: 2 | 5m: 0

E. Indicator Quality on 4h (5 pts bonus):
   - MACD on 4h: +5 | Stochastic on 4h: +4 | Trend Reversal on 4h: +2

F. Momentum Bonus (5 pts):
   - Pct24 > 10%: +5 | Pct24 > 3%: +3 | Pct24 > 0%: +1 | Pct24 < 0%: 0

### Tiers: A ≥ 65 | B ≥ 40 | C ≥ 20 | rejected < 20
