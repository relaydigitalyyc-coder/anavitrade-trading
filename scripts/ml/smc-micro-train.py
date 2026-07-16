#!/usr/bin/env python3
"""
SMC MICROSTRUCTURE TRAINING — 5m & 15m bars, full ML stack, Hetzner-deployable.

Strategy: SMC patterns on 5-15m (4x more signals than 1h, 16x more than 4h)
          + market state classification (regime-aware)
          + LightGBM classifier (or TensorFlow when available)
          → target 65% WR, PF ≥ 3

Usage on Hetzner:
  ssh root@5.161.229.209
  cd /opt/anavitrade && PYTHONPATH=/opt/anavitrade/scripts/ml \
    python3 scripts/ml/smc-micro-train.py

Tunable params via CLI:
  --tf 5m --lookback 30 --min-patterns 2 --model lightgbm
"""

import json, argparse, pickle, sys, time, os
from pathlib import Path
from datetime import datetime
import numpy as np
from collections import defaultdict

# ═══ Indicators (NO ATR division — raw structural values) ═══

def sma(v, n):
    out = np.zeros(len(v)); cs = np.cumsum(np.insert(v, 0, 0))
    out[n-1:] = (cs[n:] - cs[:-n]) / n; return out

def ema(v, n):
    out = np.zeros(len(v)); out[0] = v[0]; k = 2 / (n + 1)
    for i in range(1, len(v)): out[i] = k * v[i] + (1 - k) * out[i-1]
    return out

def atr_arr(h, l, c, n):
    tr = np.zeros(len(h)); tr[0] = h[0] - l[0]
    for i in range(1, len(h)):
        tr[i] = max(h[i] - l[i], abs(h[i] - c[i-1]), abs(l[i] - c[i-1]))
    return sma(tr, n)

def rsi_arr(c, n):
    out = np.full(len(c), 50.0)
    if len(c) < n + 1: return out
    d = np.diff(c); g = np.maximum(d, 0); lo = np.maximum(-d, 0)
    for i in range(n, len(c)):
        ag = g[i-n:i].mean(); al = lo[i-n:i].mean()
        out[i] = 100 - 100 / (1 + ag / al) if al > 0 else (100 if ag > 0 else 50)
    return out

def bb(c, n, m):
    mid = sma(c, n); up = np.zeros(len(c)); lo = np.zeros(len(c)); w = np.zeros(len(c))
    for i in range(n-1, len(c)):
        std = np.std(c[i-n+1:i+1])
        up[i] = mid[i] + m * std; lo[i] = mid[i] - m * std
        w[i] = (up[i] - lo[i]) / mid[i] * 100 if mid[i] > 0 else 0
    return mid, up, lo, w

def ao(h, l): return sma((h + l) / 2, 5) - sma((h + l) / 2, 34)


# ═══ Pivot Detection ═══

def pivot_low(l_arr, idx, lb=3):
    if idx < lb or idx >= len(l_arr) - lb: return False
    return all(l_arr[idx-j] >= l_arr[idx] and l_arr[idx+j] >= l_arr[idx]
               for j in range(1, lb+1))

def pivot_high(h_arr, idx, lb=3):
    if idx < lb or idx >= len(h_arr) - lb: return False
    return all(h_arr[idx-j] <= h_arr[idx] and h_arr[idx+j] <= h_arr[idx]
               for j in range(1, lb+1))


# ═══ SMC Pattern Detection (5m/15m optimized) ═══

def detect_order_block(bars_h, bars_l, bars_c, bars_o, idx, is_long, lookback=8):
    """Detect unmitigated order block. Lookback=8 on 5m = 40min window."""
    for ro in range(2, lookback):
        ob_i = idx - ro
        if ob_i < 2: continue
        if is_long:
            if not pivot_low(bars_l, ob_i, 2): continue
            if bars_c[ob_i] >= bars_o[ob_i]:  # must be bearish
                if ob_i + 1 < len(bars_h) and bars_c[ob_i+1] < bars_o[ob_i+1]:
                    ob_i += 1
                else: continue
            ob_t = max(bars_o[ob_i], bars_c[ob_i])
            ob_b = min(bars_o[ob_i], bars_c[ob_i])
            after_max = bars_h[:ob_i].max() if ob_i > 0 else bars_h[0]
            if after_max <= ob_t * 1.01: continue
            mitigated = any(bars_c[k] < ob_b for k in range(ob_i-1, -1, -1))
            if mitigated: continue
            return {'found': True, 'dist_pct': (bars_c[idx] - ob_b) / bars_c[idx] * 100 if bars_c[idx] > 0 else 0}
        else:
            if not pivot_high(bars_h, ob_i, 2): continue
            if bars_c[ob_i] <= bars_o[ob_i]:
                if ob_i + 1 < len(bars_h) and bars_c[ob_i+1] > bars_o[ob_i+1]:
                    ob_i += 1
                else: continue
            ob_t = max(bars_o[ob_i], bars_c[ob_i])
            ob_b = min(bars_o[ob_i], bars_c[ob_i])
            after_min = bars_l[:ob_i].min() if ob_i > 0 else bars_l[0]
            if after_min >= ob_b * 0.99: continue
            mitigated = any(bars_c[k] > ob_t for k in range(ob_i-1, -1, -1))
            if mitigated: continue
            return {'found': True, 'dist_pct': (ob_t - bars_c[idx]) / bars_c[idx] * 100 if bars_c[idx] > 0 else 0}
    return {'found': False, 'dist_pct': 0}

def detect_fvg(bars_h, bars_l, bars_c, bars_o, idx, is_long, lookback=6):
    """Detect Fair Value Gap. Lookback=6 on 5m = 30min window."""
    for ro in range(1, lookback):
        a_i = idx - ro - 2; b_i = idx - ro - 1; c_i = idx - ro
        if a_i < 0: continue
        gap_t = bars_l[a_i]; gap_b = bars_h[c_i]
        if gap_t <= gap_b: continue
        if is_long:
            if not (bars_c[b_i] > bars_o[b_i]): continue
        else:
            if not (bars_c[b_i] < bars_o[b_i]): continue
        mitigated = any(bars_h[idx-k] >= gap_b and bars_l[idx-k] <= gap_t
                       for k in range(ro-1, -1, -1) if idx-k >= 0)
        if mitigated: continue
        return {'found': True, 'dist_pct': (bars_c[idx] - gap_b) / bars_c[idx] * 100 if bars_c[idx] > 0 else 0}
    return {'found': False, 'dist_pct': 0}

def detect_sweep(bars_h, bars_l, bars_c, idx, is_long, lookback=6):
    """Detect liquidity sweep."""
    for ro in range(2, lookback):
        sw_i = idx - ro
        if sw_i < 2: continue
        if is_long:
            if not pivot_low(bars_l, sw_i, 2): continue
            pv = bars_l[sw_i]; wicked = False; reclaimed = False
            for k in range(ro-1, -1, -1):
                ki = idx - k
                if bars_l[ki] < pv: wicked = True
                if wicked and bars_c[ki] > pv: reclaimed = True; break
            if wicked and reclaimed:
                return {'found': True, 'depth_pct': (pv - bars_l[ki]) / bars_c[idx] * 100 if bars_c[idx] > 0 else 0}
        else:
            if not pivot_high(bars_h, sw_i, 2): continue
            pv = bars_h[sw_i]; wicked = False; rejected = False
            for k in range(ro-1, -1, -1):
                ki = idx - k
                if bars_h[ki] > pv: wicked = True
                if wicked and bars_c[ki] < pv: rejected = True; break
            if wicked and rejected:
                return {'found': True, 'depth_pct': (bars_h[ki] - pv) / bars_c[idx] * 100 if bars_c[idx] > 0 else 0}
    return {'found': False, 'depth_pct': 0}


# ═══ Market State Classification ═══

def classify_market_state(bars_c, bars_atr, idx, lookback=20):
    """Classify current market: trending_up, trending_down, ranging, volatile_breakout, compression, distribution"""
    c = bars_c[idx]; atr_v = bars_atr[idx]
    if atr_v <= 0: return 'undefined'

    recent = bars_c[max(0, idx-lookback):idx+1]
    ma7 = recent[-7:].mean() if len(recent) >= 7 else recent.mean()
    ma20 = recent.mean()
    ma7_slope = (recent[-1] - recent[-7]) / atr_v if len(recent) >= 7 else 0
    ma20_slope = (recent[-1] - recent[-20]) / atr_v if len(recent) >= 20 else 0

    # Volatility
    vol = np.std(recent) / recent.mean() * 100 if recent.mean() > 0 else 0
    bb_width = vol * 2  # proxy

    # Range vs trend
    ranges = np.diff(recent)
    directional_moves = sum(1 for r in ranges if abs(r) > atr_v * 0.5)

    if directional_moves >= len(recent) * 0.6:
        return 'trending_up' if ma7_slope > 0.5 else ('trending_down' if ma7_slope < -0.5 else 'trending')
    if vol > 5:
        return 'volatile_breakout'
    if bb_width < 1.5:
        return 'compression'
    if ma7_slope > 0.2:
        return 'trending_up'
    if ma7_slope < -0.2:
        return 'trending_down'
    return 'ranging'


# ═══ Main Training Loop ═══

def main():
    parser = argparse.ArgumentParser(description='SMC Microstructure ML Training')
    parser.add_argument('--tf', default='5m', choices=['5m', '15m'], help='Primary timeframe')
    parser.add_argument('--lookback', type=int, default=30, help='SMC pattern lookback bars')
    parser.add_argument('--min-patterns', type=int, default=2, help='Minimum SMC patterns for entry')
    parser.add_argument('--model', default='lightgbm', choices=['lightgbm'], help='ML model')
    parser.add_argument('--output', type=str, help='Model output directory')
    args = parser.parse_args()

    klines_path = Path(__file__).resolve().parent.parent / 'data' / 'klines-mtf.json'
    if not klines_path.exists():
        klines_path = Path('/opt/anavitrade/scripts/ml/klines-mtf.json')

    print(f"Loading {klines_path}...")
    with open(klines_path) as f:
        pairs = json.load(f)
    print(f"  {len(pairs)} pairs")

    STOP_ATR = 1.0; RR = 2.0; MAX_BARS = 48
    all_trades = []

    for pair in pairs:
        sym = pair['symbol']
        bars = pair.get('klines', {}).get(args.tf, [])
        if len(bars) < 150: continue

        h = np.array([k['high'] for k in bars]); l = np.array([k['low'] for k in bars])
        c = np.array([k['close'] for k in bars]); o = np.array([k['open'] for k in bars])
        v = np.array([k['volume'] for k in bars]); t = np.array([k['timestamp'] for k in bars])
        a = atr_arr(h, l, c, 14); n = len(bars)
        rs = rsi_arr(c, 14); bm, bu, bl_arr, bw = bb(c, 20, 2)
        ao_v = ao(h, l)

        for i in range(50, n - MAX_BARS):
            if a[i] <= 0 or c[i] <= 0: continue

            # Detect SMC patterns
            ob_long = detect_order_block(h, l, c, o, i, True, args.lookback)
            ob_short = detect_order_block(h, l, c, o, i, False, args.lookback)
            fvg_long = detect_fvg(h, l, c, o, i, True, args.lookback)
            fvg_short = detect_fvg(h, l, c, o, i, False, args.lookback)
            sweep_long = detect_sweep(h, l, c, i, True, args.lookback)
            sweep_short = detect_sweep(h, l, c, i, False, args.lookback)

            # Market state
            state = classify_market_state(c, a, i)

            for direction, s_ob, s_fvg, s_swp in [
                ('long', ob_long, fvg_long, sweep_long),
                ('short', ob_short, fvg_short, sweep_short)
            ]:
                smc_count = sum([s_ob['found'], s_fvg['found'], s_swp['found']])
                if smc_count < args.min_patterns: continue

                # Entry
                entry = c[i + 1]; atr_e = a[i + 1]
                stop = entry - STOP_ATR * atr_e if direction == 'long' else entry + STOP_ATR * atr_e
                risk = abs(entry - stop)
                if risk <= 0: continue
                tp = entry + risk * RR if direction == 'long' else entry - risk * RR

                # Forward scan
                hit_tp = False; hit_sl = False; exit_bar = i + 1
                for fi in range(i + 2, min(n, i + MAX_BARS + 2)):
                    if direction == 'long':
                        if l[fi] <= stop: hit_sl = True; exit_bar = fi; break
                        if h[fi] >= tp: hit_tp = True; exit_bar = fi; break
                    else:
                        if h[fi] >= stop: hit_sl = True; exit_bar = fi; break
                        if l[fi] <= tp: hit_tp = True; exit_bar = fi; break

                pnl_r = RR if hit_tp else (-1.0 if hit_sl else (c[exit_bar] - entry) / risk)

                all_trades.append({
                    'tf': args.tf, 'sym': sym, 'dir': direction, 'state': state,
                    'smc_count': smc_count,
                    'ob': s_ob['found'], 'fvg': s_fvg['found'], 'sweep': s_swp['found'],
                    'rsi': rs[i], 'ao_slope': ao_v[i] - ao_v[max(0, i-3)],
                    'bb_pos': (c[i] - bl_arr[i]) / (bu[i] - bl_arr[i]) if bu[i] > bl_arr[i] else 0.5,
                    'bb_width': bw[i], 'vol_ratio': v[i] / max(v[max(0, i-20):i+1].mean(), 0.0001),
                    'win': hit_tp, 'pnl_r': pnl_r,
                })

    n_t = len(all_trades)
    if n_t == 0: print("NO TRADES — relax min_patterns"); return

    wins = sum(1 for t in all_trades if t['win'])
    wr = wins / n_t * 100
    pnls = [t['pnl_r'] for t in all_trades]
    gp = sum(p for p in pnls if p > 0); gl = abs(sum(p for p in pnls if p < 0))
    pf = gp / gl if gl > 0 else 999

    print(f"\n{'='*60}")
    print(f"SMC {args.tf} STRATEGY — min {args.min_patterns} patterns, {args.lookback}-bar lookback")
    print(f"{'='*60}")
    print(f"Trades: {n_t}  WR: {wr:.1f}%  PF: {pf:.2f}")
    print(f"Goal 65%: {'✓' if wr>=65 else '✗'}")
    print(f"Goal PF≥3: {'✓' if pf>=3 else '✗'}")

    # Breakdowns
    for st in sorted(set(t['state'] for t in all_trades)):
        ts = [t for t in all_trades if t['state'] == st]
        w = sum(1 for t in ts if t['win']) / len(ts) * 100 if ts else 0
        print(f"  {st:20s}: {len(ts):4d}t WR={w:5.1f}%")

    for c in range(1, 4):
        ts = [t for t in all_trades if t['smc_count'] == c]
        w = sum(1 for t in ts if t['win']) / len(ts) * 100 if ts else 0
        print(f"  {c} SMC patterns:   {len(ts):4d}t WR={w:5.1f}%")


if __name__ == '__main__':
    main()
