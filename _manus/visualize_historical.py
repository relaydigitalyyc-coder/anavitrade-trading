"""
Generate professional dark-theme charts for the Anavitrade historical analysis.
"""
import json, statistics, collections, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

with open("/tmp/coinlegs_historical.json") as f:
    signals = json.load(f)

# ── Color palette ─────────────────────────────────────────────────────────────
BG     = "#0a0f1e"
CARD   = "#111827"
GREEN  = "#00d4aa"
GOLD   = "#f5c842"
BLUE   = "#3b82f6"
PURPLE = "#8b5cf6"
ORANGE = "#f97316"
RED    = "#ef4444"
GRAY   = "#6b7280"
WHITE  = "#f9fafb"

plt.rcParams.update({
    "figure.facecolor": BG,
    "axes.facecolor": CARD,
    "axes.edgecolor": "#1f2937",
    "axes.labelcolor": WHITE,
    "xtick.color": GRAY,
    "ytick.color": GRAY,
    "text.color": WHITE,
    "grid.color": "#1f2937",
    "grid.linewidth": 0.8,
    "font.family": "DejaVu Sans",
    "font.size": 11,
})

def parse_duration_minutes(d):
    if not d: return None
    d = d.strip().lower()
    try:
        if "day" in d: return float(d.split()[0]) * 1440
        elif "hour" in d: return float(d.split()[0]) * 60
        elif "min" in d: return float(d.split()[0])
    except: pass
    return None

# ── Prepare data ──────────────────────────────────────────────────────────────
period_order = ["5m","15m","30m","1h","4h","1d","1w"]
period_profits = collections.defaultdict(list)
ind_profits = collections.defaultdict(list)
matrix = collections.defaultdict(list)
pct24_buckets = collections.defaultdict(list)

for s in signals:
    p = s.get("Period") or s.get("PeriodDescription","?")
    n = s.get("Name","?")
    mp = s.get("MaxProfit")
    pct = s.get("Percentage24")
    if mp is None: continue
    mp = float(mp)
    period_profits[p].append(mp)
    ind_profits[n].append(mp)
    matrix[(n,p)].append(mp)
    if pct is not None:
        pct = float(pct)
        if pct < 0: pct24_buckets["<0%"].append(mp)
        elif pct < 1: pct24_buckets["0-1%"].append(mp)
        elif pct < 3: pct24_buckets["1-3%"].append(mp)
        elif pct < 10: pct24_buckets["3-10%"].append(mp)
        else: pct24_buckets[">10%"].append(mp)

# ── FIGURE 1: Period Performance ──────────────────────────────────────────────
fig, axes = plt.subplots(2, 2, figsize=(16, 12))
fig.patch.set_facecolor(BG)
fig.suptitle("Anavitrade — Historical Signal Analysis\nApril 1 – July 5, 2026 (1,266 top-performing signals)", 
             fontsize=16, fontweight="bold", color=WHITE, y=0.98)

# Chart 1: Median MaxProfit by Period
ax = axes[0, 0]
periods_present = [p for p in period_order if period_profits.get(p)]
medians = [statistics.median(period_profits[p]) for p in periods_present]
counts  = [len(period_profits[p]) for p in periods_present]
colors  = [GOLD if p == "4h" else GREEN for p in periods_present]
bars = ax.bar(periods_present, medians, color=colors, width=0.6, zorder=3)
ax.set_title("Median MaxProfit % by Timeframe", fontweight="bold", pad=12)
ax.set_ylabel("Median MaxProfit %")
ax.grid(axis="y", zorder=0)
ax.set_ylim(0, max(medians) * 1.25)
for bar, med, cnt in zip(bars, medians, counts):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1.5,
            f"{med:.0f}%\n(n={cnt})", ha="center", va="bottom", fontsize=9, color=WHITE)
# Highlight 4h
ax.annotate("★ Preferred", xy=(periods_present.index("4h"), medians[periods_present.index("4h")]),
            xytext=(periods_present.index("4h") + 0.5, medians[periods_present.index("4h")] + 8),
            color=GOLD, fontsize=9, fontweight="bold",
            arrowprops=dict(arrowstyle="->", color=GOLD, lw=1.2))

# Chart 2: Indicator Performance (4h only)
ax = axes[0, 1]
h4_ind = collections.defaultdict(list)
for s in signals:
    p = s.get("Period") or s.get("PeriodDescription","?")
    if p != "4h": continue
    n = s.get("Name","?")
    mp = s.get("MaxProfit")
    if mp is not None:
        h4_ind[n].append(float(mp))

ind_names = sorted(h4_ind.keys(), key=lambda x: -statistics.median(h4_ind[x]))
ind_medians = [statistics.median(h4_ind[n]) for n in ind_names]
ind_means   = [statistics.mean(h4_ind[n]) for n in ind_names]
ind_counts  = [len(h4_ind[n]) for n in ind_names]
ind_colors  = [GOLD, GREEN, BLUE, PURPLE, ORANGE][:len(ind_names)]

x = np.arange(len(ind_names))
w = 0.35
bars1 = ax.bar(x - w/2, ind_medians, w, label="Median", color=ind_colors, alpha=0.9, zorder=3)
bars2 = ax.bar(x + w/2, ind_means, w, label="Mean", color=ind_colors, alpha=0.5, zorder=3)
ax.set_title("4h Indicator Performance (Median vs Mean)", fontweight="bold", pad=12)
ax.set_ylabel("MaxProfit %")
ax.set_xticks(x)
ax.set_xticklabels([n.replace(" ", "\n") for n in ind_names], fontsize=9)
ax.grid(axis="y", zorder=0)
ax.legend(facecolor=CARD, edgecolor=GRAY, labelcolor=WHITE, fontsize=9)
for bar, med, cnt in zip(bars1, ind_medians, ind_counts):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 1,
            f"{med:.0f}%\nn={cnt}", ha="center", va="bottom", fontsize=8, color=WHITE)

# Chart 3: Momentum (Pct24) vs MaxProfit
ax = axes[1, 0]
bucket_labels = ["<0%", "0-1%", "1-3%", "3-10%", ">10%"]
bucket_colors = [RED, GRAY, ORANGE, GREEN, GOLD]
bx = [l for l in bucket_labels if pct24_buckets.get(l)]
by = [statistics.median(pct24_buckets[l]) for l in bx]
bc = [bucket_colors[bucket_labels.index(l)] for l in bx]
bn = [len(pct24_buckets[l]) for l in bx]
bars = ax.bar(bx, by, color=bc, width=0.6, zorder=3)
ax.set_title("24h Momentum vs Median MaxProfit (all timeframes)", fontweight="bold", pad=12)
ax.set_xlabel("24h Price Change (Pct24)")
ax.set_ylabel("Median MaxProfit %")
ax.grid(axis="y", zorder=0)
for bar, med, cnt in zip(bars, by, bn):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
            f"{med:.0f}%\n(n={cnt})", ha="center", va="bottom", fontsize=9, color=WHITE)

# Chart 4: Confluence effect (4h only)
ax = axes[1, 1]
groups = collections.defaultdict(list)
for s in signals:
    p = s.get("Period") or s.get("PeriodDescription","?")
    if p != "4h": continue
    market = s.get("MarketName") or s.get("ShortMarketName","?")
    sig_date = s.get("SignalDate","")
    day = sig_date[:10] if sig_date else "?"
    key = (market, day)
    groups[key].append(s)

conf_data = collections.defaultdict(list)
for key, sigs in groups.items():
    n_ind = len(set(s.get("Name") for s in sigs))
    for s in sigs:
        mp = s.get("MaxProfit")
        if mp is not None:
            conf_data[n_ind].append(float(mp))

conf_ns = sorted(conf_data.keys())
conf_medians = [statistics.median(conf_data[n]) for n in conf_ns]
conf_counts  = [len(conf_data[n]) for n in conf_ns]
conf_colors  = [GRAY, GREEN, GOLD, ORANGE, PURPLE][:len(conf_ns)]
bars = ax.bar([f"{n} indicator{'s' if n>1 else ''}" for n in conf_ns], conf_medians,
              color=conf_colors, width=0.6, zorder=3)
ax.set_title("4h Confluence Effect on Median MaxProfit", fontweight="bold", pad=12)
ax.set_ylabel("Median MaxProfit %")
ax.grid(axis="y", zorder=0)
for bar, med, cnt in zip(bars, conf_medians, conf_counts):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
            f"{med:.0f}%\n(n={cnt})", ha="center", va="bottom", fontsize=9, color=WHITE)

plt.tight_layout(rect=[0, 0, 1, 0.96])
plt.savefig("/tmp/historical_analysis.png", dpi=150, bbox_inches="tight",
            facecolor=BG, edgecolor="none")
plt.close()
print("Saved /tmp/historical_analysis.png")

# ── FIGURE 2: Derived Rules Card ──────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(14, 8))
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)
ax.axis("off")

# Title
ax.text(0.5, 0.97, "Anavitrade — Data-Derived Algo Rules", transform=ax.transAxes,
        ha="center", va="top", fontsize=18, fontweight="bold", color=WHITE)
ax.text(0.5, 0.91, "Based on 1,266 top-performing signals, April 1 – July 5, 2026",
        transform=ax.transAxes, ha="center", va="top", fontsize=11, color=GRAY)

rules = [
    (GOLD,   "R1 — TIMEFRAME",
     "4h is the preferred timeframe. Median profit: 104.1% vs 95.8% for 15m.\n"
     "4h signals have the best risk-adjusted profile: large moves with manageable duration (4h–3d)."),
    (GREEN,  "R2 — INDICATOR PRIORITY (4h)",
     "MACD (median 116.3%) > Stochastic (110.1%) > Trend Reversal (102.5%) > CCI (97.2%) > Ichimoku (96.4%).\n"
     "Prioritize MACD and Stochastic on 4h. Ichimoku is weakest on 4h but strongest on 1w."),
    (BLUE,   "R3 — CONFLUENCE",
     "On 4h, 5-indicator confluence delivers median 121.6% vs 96.5% for single-indicator (+26%).\n"
     "4-indicator confluence: 105.6%. Even 2-indicator: +7% lift. Confluence is a genuine edge."),
    (PURPLE, "R4 — MOMENTUM FILTER",
     "Counter-intuitive finding: negative Pct24 (<0%) signals have median 100.1% — NOT a disqualifier.\n"
     "Strong momentum (>10%) has the highest median at 110.3%. Flat (0-1%) is the weakest at 102.1%.\n"
     "Rule: do NOT gate on Pct24. Instead, use it as a bonus score, not a hard filter."),
    (ORANGE, "R5 — PROFIT SPEED (4h)",
     "4h median profit speed: 0.8%/h. P75 = 2.1%/h. P90 = 4.6%/h.\n"
     "Signals at P90+ (>4.6%/h) are fast movers — ideal for automated execution.\n"
     "Slow signals (>3 days to peak) are better for signal-delivery tier (manual management)."),
]

y = 0.82
for color, title, body in rules:
    # Rule box
    rect = mpatches.FancyBboxPatch((0.02, y - 0.13), 0.96, 0.13,
                                    boxstyle="round,pad=0.01", linewidth=1.5,
                                    edgecolor=color, facecolor=CARD,
                                    transform=ax.transAxes)
    ax.add_patch(rect)
    ax.text(0.05, y - 0.015, title, transform=ax.transAxes,
            fontsize=11, fontweight="bold", color=color, va="top")
    ax.text(0.05, y - 0.045, body, transform=ax.transAxes,
            fontsize=9, color=WHITE, va="top", linespacing=1.5)
    y -= 0.16

plt.savefig("/tmp/algo_rules.png", dpi=150, bbox_inches="tight",
            facecolor=BG, edgecolor="none")
plt.close()
print("Saved /tmp/algo_rules.png")
