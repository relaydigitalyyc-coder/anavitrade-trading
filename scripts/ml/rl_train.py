#!/usr/bin/env python3 -u
"""
PPO Trading Agent -- Reinforcement Learning for trade entry and position sizing.
===============================================================================

Learns WHEN to enter trades and HOW to size positions using a reward function
that maximizes profit while penalizing drawdown 2x harder than it rewards gains.

Observations: 30 meta-v20 MTF features + 7 context features = 37-dimensional.
Actions: 0=HOLD, 1=ENTER_LONG, 2=EXIT.
Risk: 1 ATR stop, 2 ATR target, max 48 bars held, 5% position size.

Usage:
  python3 scripts/ml/rl_train.py --timesteps 500000 --output /opt/anavitrade/models/rl/
  python3 scripts/ml/rl_train.py --quick --timesteps 50000
  python3 scripts/ml/rl_train.py --eval-only --model /opt/anavitrade/models/rl/ppo_trading_agent.zip
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=RuntimeWarning)
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
np.seterr(all="ignore")

# ═══ Path Setup ═══
BASE = Path(__file__).resolve().parent.parent.parent
if str(BASE) not in sys.path:
    sys.path.insert(0, str(BASE))

# ═══ Logging ═══
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("rl_train")

# ═══ Gym / SB3 Imports ═══
import gymnasium as gym
from gymnasium import spaces

try:
    import torch
except ImportError:
    torch = None  # type: ignore

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback, EvalCallback
from stable_baselines3.common.vec_env import DummyVecEnv

# ═══ Constants ═══
MS_15M = 15 * 60 * 1000
MS_1H = 60 * 60 * 1000
MS_4H = 4 * MS_1H

# 30 meta-v20 features in exact model_card.json order
FEATURE_NAMES: List[str] = [
    "ao_gradient", "bb_sqz_product",
    "h1_ao", "h1_bb_pos", "h1_bb_width", "h1_ma7_slope", "h1_macd", "h1_rsi",
    "h1_trend", "h1_vol_z",
    "h4_ao", "h4_bb_pos", "h4_bb_width", "h4_macd", "h4_rsi", "h4_trend",
    "m15_ao", "m15_atr_pct", "m15_bb_pos", "m15_bb_width", "m15_ma7_slope",
    "m15_macd", "m15_rsi", "m15_swing_dist", "m15_trend", "m15_vol_z",
    "mtf_15_1h_agree", "mtf_triple_agree", "rsi_gradient", "tf_vol_sum",
]

N_FEATURES = len(FEATURE_NAMES)  # 30
N_CONTEXT = 7
OBS_DIM = N_FEATURES + N_CONTEXT  # 37

# Default paths
DEFAULT_KLINES = BASE / "scripts/data/klines-mtf.json"
DEFAULT_OUTPUT = Path("/opt/anavitrade/models/rl/")


# ═══════════════════════════════════════════════════════════════════════════════
# INDICATOR HELPERS (vectorized, self-contained -- mirrors pipeline/features.py)
# ═══════════════════════════════════════════════════════════════════════════════


def _sma(values: np.ndarray, period: int) -> np.ndarray:
    out = np.zeros_like(values)
    if len(values) < period:
        return out
    cumsum = np.cumsum(np.insert(values, 0, 0))
    out[period - 1:] = (cumsum[period:] - cumsum[:-period]) / period
    return out


def _ema(values: np.ndarray, period: int) -> np.ndarray:
    out = np.zeros_like(values)
    if len(values) < 2:
        if len(values) > 0:
            out[0] = values[0]
        return out
    k = 2.0 / (period + 1)
    out[0] = float(values[0])
    for i in range(1, len(values)):
        out[i] = float(values[i]) * k + out[i - 1] * (1 - k)
    return out


def _macd_hist(close: np.ndarray, fast: int = 12, slow: int = 26, signal: int = 9) -> np.ndarray:
    ef = _ema(close, fast)
    es = _ema(close, slow)
    macd_line = ef - es
    sig_line = _ema(macd_line, signal)
    return macd_line - sig_line


def _true_range(high: np.ndarray, low: np.ndarray, close: np.ndarray) -> np.ndarray:
    tr = np.zeros(len(high), dtype=np.float64)
    tr[0] = float(high[0] - low[0])
    for i in range(1, len(high)):
        tr[i] = max(
            float(high[i] - low[i]),
            abs(float(high[i] - close[i - 1])),
            abs(float(low[i] - close[i - 1])),
        )
    return tr


def _atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> np.ndarray:
    return _sma(_true_range(high, low, close), period)


def _rsi(close: np.ndarray, period: int = 14) -> np.ndarray:
    out = np.full(len(close), 50.0)
    if len(close) < period + 1:
        return out
    delta = np.diff(close)
    gains = np.maximum(delta, 0)
    losses = np.maximum(-delta, 0)
    for i in range(period, len(close)):
        avg_gain = gains[i - period:i].mean()
        avg_loss = losses[i - period:i].mean()
        if avg_loss == 0:
            out[i] = 100.0
        else:
            out[i] = 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)
    return out


def _bb(close: np.ndarray, period: int = 20, std_mult: float = 2.0) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    mid = _sma(close, period)
    upper = np.zeros_like(close)
    lower = np.zeros_like(close)
    width = np.zeros_like(close)
    for i in range(period - 1, len(close)):
        window = close[i - period + 1:i + 1]
        std = float(np.std(window, ddof=0))
        upper[i] = mid[i] + std_mult * std
        lower[i] = mid[i] - std_mult * std
        width[i] = (upper[i] - lower[i]) / mid[i] * 100.0 if mid[i] > 0 else 0
    return mid, upper, lower, width


def _ao(high: np.ndarray, low: np.ndarray, fast: int = 5, slow: int = 34) -> np.ndarray:
    hl2 = (high + low) / 2.0
    return _sma(hl2, fast) - _sma(hl2, slow)


def _slope(values: np.ndarray, lookback: int, idx: int) -> float:
    if idx < lookback - 1:
        return 0.0
    ys = values[idx - lookback + 1:idx + 1]
    if np.std(ys) < 1e-10:
        return 0.0
    xs = np.arange(lookback, dtype=np.float64)
    try:
        return float(np.polyfit(xs, ys, 1)[0])
    except (np.linalg.LinAlgError, ValueError):
        return 0.0


def _swing_dist_atr(
    highs: np.ndarray, lows: np.ndarray, close: float, atr: float,
    idx: int, lookback: int = 15, swing_lb: int = 4,
) -> float:
    if idx < swing_lb or atr <= 0:
        return 5.0
    start = max(swing_lb, idx - lookback)
    end = idx - swing_lb + 1
    if start >= end:
        return 5.0
    h_window = highs[start:end]
    l_window = lows[start:end]
    best = 999.0
    for pv in h_window:
        if pv > close:
            best = min(best, (pv - close) / atr)
    for pv in l_window:
        if pv < close:
            best = min(best, (close - pv) / atr)
    return float(min(5.0, best)) if best < 999 else 5.0


# ═══════════════════════════════════════════════════════════════════════════════
# FEATURE BUILDER -- computes all 30 meta-v20 features per 15m bar
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class SymbolData:
    """Pre-computed features and price arrays for one trading symbol."""
    symbol: str
    features: np.ndarray      # (n_bars, 30) float64
    closes: np.ndarray         # (n_bars,) 15m close prices
    atrs: np.ndarray           # (n_bars,) 15m ATR(14) values
    highs: np.ndarray          # (n_bars,) 15m high prices
    lows: np.ndarray           # (n_bars,) 15m low prices
    timestamps: np.ndarray     # (n_bars,) unix milliseconds
    ma7: np.ndarray            # (n_bars,) 15m MA7 for trend detection
    ma25: np.ndarray           # (n_bars,) 15m MA25 for trend detection
    ma99: np.ndarray           # (n_bars,) 15m MA99 for trend detection
    n_bars: int = 0


def load_and_build_features(
    klines_path: Path,
    warmup: int = 100,
    min_bars: int = 200,
) -> List[SymbolData]:
    """Load klines-mtf.json, compute all indicators, assemble 30-feature arrays.

    Returns a list of SymbolData, one per valid symbol.
    """
    logger.info("Loading klines from %s", klines_path)
    with open(klines_path) as f:
        raw = json.load(f)

    symbols: List[SymbolData] = []

    for entry in raw:
        sym = entry["symbol"]
        klines = entry["klines"]
        m15_raw = klines.get("15m", [])
        h1_raw = klines.get("1h", [])
        h4_raw = klines.get("4h", [])

        if len(m15_raw) < min_bars or len(h1_raw) < min_bars or len(h4_raw) < min_bars:
            logger.debug("Skip %s: insufficient bars", sym)
            continue

        # ── Extract OHLCV arrays for each timeframe ──
        tfs = {}
        for tf_name, raw_bars in [("15m", m15_raw), ("1h", h1_raw), ("4h", h4_raw)]:
            tfs[tf_name] = {
                "open": np.array([b["open"] for b in raw_bars], dtype=np.float64),
                "high": np.array([b["high"] for b in raw_bars], dtype=np.float64),
                "low": np.array([b["low"] for b in raw_bars], dtype=np.float64),
                "close": np.array([b["close"] for b in raw_bars], dtype=np.float64),
                "volume": np.array([b["volume"] for b in raw_bars], dtype=np.float64),
                "ts": np.array([b["timestamp"] for b in raw_bars], dtype=np.int64),
            }

        # ── Compute indicators per timeframe ──
        def compute_tf(o, h, l, c, v, tf_nm):
            n = len(c)
            sma7 = _sma(c, 7)
            sma25 = _sma(c, 25)
            sma99 = _sma(c, 99)
            atr14 = _atr(h, l, c, 14)
            rsi14 = _rsi(c, 14)
            mid, upper, lower, width = _bb(c, 20, 2.0)
            bb_pos = np.where((upper - lower) > 0, (c - lower) / (upper - lower), 0.5)
            ao_vals = _ao(h, l)
            macd = _macd_hist(c)
            vol_ma = _sma(v, 20)
            vol_z = np.where(vol_ma > 0, (v - vol_ma) / vol_ma, 0.0)
            atr_pct = np.where(c > 0, atr14 / c * 100, 0.0)
            trend = np.zeros(n, dtype=np.float64)
            for i in range(n):
                if sma7[i] > sma25[i] > sma99[i]:
                    trend[i] = 1.0
                elif sma7[i] < sma25[i] < sma99[i]:
                    trend[i] = -1.0
            return {
                "sma7": sma7, "sma25": sma25, "sma99": sma99,
                "atr14": atr14, "rsi14": rsi14, "bb_mid": mid,
                "bb_upper": upper, "bb_lower": lower, "bb_width": width,
                "bb_pos": bb_pos, "ao": ao_vals, "macd": macd,
                "vol_z": vol_z, "atr_pct": atr_pct, "trend": trend,
                "high": h, "low": l, "close": c,
            }

        ind_15m = compute_tf(tfs["15m"]["open"], tfs["15m"]["high"], tfs["15m"]["low"],
                             tfs["15m"]["close"], tfs["15m"]["volume"], "15m")
        ind_1h = compute_tf(tfs["1h"]["open"], tfs["1h"]["high"], tfs["1h"]["low"],
                            tfs["1h"]["close"], tfs["1h"]["volume"], "1h")
        ind_4h = compute_tf(tfs["4h"]["open"], tfs["4h"]["high"], tfs["4h"]["low"],
                            tfs["4h"]["close"], tfs["4h"]["volume"], "4h")

        n15 = len(tfs["15m"]["close"])

        # ── Build timestamp lookup for 1h and 4h ──
        ts_1h = tfs["1h"]["ts"]
        ts_4h = tfs["4h"]["ts"]

        def find_containing_idx(target_ts: int, tf_ts: np.ndarray) -> int:
            """Return the index of the bar whose timestamp is <= target_ts."""
            for k in range(len(tf_ts) - 1, -1, -1):
                if tf_ts[k] <= target_ts:
                    return k
            return -1

        # ── Precompute ma7 slopes for h1 and m15 ──
        h1_ma7_slope_arr = np.zeros(len(ind_1h["sma7"]), dtype=np.float64)
        for i in range(len(h1_ma7_slope_arr)):
            h1_ma7_slope_arr[i] = _slope(ind_1h["sma7"], 5, i)

        m15_ma7_slope_arr = np.zeros(n15, dtype=np.float64)
        for i in range(n15):
            m15_ma7_slope_arr[i] = _slope(ind_15m["sma7"], 5, i)

        # ── Build feature matrix ──
        feats = np.zeros((n15, N_FEATURES), dtype=np.float64)

        for i in range(n15):
            ts_m15 = tfs["15m"]["ts"][i]
            i_h1 = find_containing_idx(ts_m15, ts_1h)
            i_h4 = find_containing_idx(ts_m15, ts_4h)

            # ── 15m features ──
            m15_ao = float(ind_15m["ao"][i])
            m15_atr_pct = float(ind_15m["atr_pct"][i])
            m15_bb_pos = float(np.clip(ind_15m["bb_pos"][i], 0, 1))
            m15_bb_width = float(ind_15m["bb_width"][i])
            m15_ma7_slope = float(m15_ma7_slope_arr[i])
            m15_macd = float(ind_15m["macd"][i])
            m15_rsi = float(ind_15m["rsi14"][i])
            m15_trend = float(ind_15m["trend"][i])
            m15_vol_z = float(ind_15m["vol_z"][i])
            m15_close = float(ind_15m["close"][i])
            m15_atr = float(ind_15m["atr14"][i])
            m15_swing = _swing_dist_atr(ind_15m["high"], ind_15m["low"], m15_close, m15_atr, i)

            # ── 1h features ──
            if i_h1 >= 0:
                h1_ao = float(ind_1h["ao"][i_h1])
                h1_bb_pos = float(np.clip(ind_1h["bb_pos"][i_h1], 0, 1))
                h1_bb_width = float(ind_1h["bb_width"][i_h1])
                h1_ma7_slope = float(h1_ma7_slope_arr[i_h1])
                h1_macd = float(ind_1h["macd"][i_h1])
                h1_rsi = float(ind_1h["rsi14"][i_h1])
                h1_trend = float(ind_1h["trend"][i_h1])
                h1_vol_z = float(ind_1h["vol_z"][i_h1])
            else:
                h1_ao = h1_bb_pos = h1_bb_width = h1_ma7_slope = h1_macd = 0.0
                h1_rsi = 50.0
                h1_trend = h1_vol_z = 0.0

            # ── 4h features ──
            if i_h4 >= 0:
                h4_ao = float(ind_4h["ao"][i_h4])
                h4_bb_pos = float(np.clip(ind_4h["bb_pos"][i_h4], 0, 1))
                h4_bb_width = float(ind_4h["bb_width"][i_h4])
                h4_macd = float(ind_4h["macd"][i_h4])
                h4_rsi = float(ind_4h["rsi14"][i_h4])
                h4_trend = float(ind_4h["trend"][i_h4])
            else:
                h4_ao = h4_bb_pos = h4_bb_width = h4_macd = 0.0
                h4_rsi = 50.0
                h4_trend = 0.0

            # ── Cross-TF features ──
            ao_gradient = h4_ao - m15_ao
            if abs(ao_gradient) > 1000:
                ao_gradient = 0.0

            rsi_gradient = m15_rsi - h4_rsi
            if abs(rsi_gradient) > 100:
                rsi_gradient = 0.0

            bb_sqz = m15_bb_width * h1_bb_width * h4_bb_width
            bb_sqz = min(bb_sqz, 100.0)

            tf_vol_sum = m15_vol_z + h1_vol_z

            mtf_15_1h = 1.0 if m15_trend * h1_trend > 0 else 0.0
            mtf_triple = 1.0 if (m15_trend * h1_trend * h4_trend) > 0 else 0.0

            # ── Assemble in model_card.json order ──
            feats[i] = [
                ao_gradient, bb_sqz,                                          # 0, 1
                h1_ao, h1_bb_pos, h1_bb_width, h1_ma7_slope, h1_macd,       # 2-6
                h1_rsi, h1_trend, h1_vol_z,                                  # 7-9
                h4_ao, h4_bb_pos, h4_bb_width, h4_macd, h4_rsi, h4_trend,   # 10-15
                m15_ao, m15_atr_pct, m15_bb_pos, m15_bb_width, m15_ma7_slope,  # 16-20
                m15_macd, m15_rsi, m15_swing, m15_trend, m15_vol_z,          # 21-25
                mtf_15_1h, mtf_triple, rsi_gradient, tf_vol_sum,             # 26-29
            ]

        # ── Trim warmup (where indicators are still unstable) ──
        if warmup < n15:
            feats = feats[warmup:]
            m15_c = tfs["15m"]["close"][warmup:]
            m15_atr_arr = ind_15m["atr14"][warmup:]
            m15_h = tfs["15m"]["high"][warmup:]
            m15_l = tfs["15m"]["low"][warmup:]
            m15_ts = tfs["15m"]["ts"][warmup:]
            m15_sma7 = ind_15m["sma7"][warmup:]
            m15_sma25 = ind_15m["sma25"][warmup:]
            m15_sma99 = ind_15m["sma99"][warmup:]
        else:
            m15_c = tfs["15m"]["close"]
            m15_atr_arr = ind_15m["atr14"]
            m15_h = tfs["15m"]["high"]
            m15_l = tfs["15m"]["low"]
            m15_ts = tfs["15m"]["ts"]
            m15_sma7 = ind_15m["sma7"]
            m15_sma25 = ind_15m["sma25"]
            m15_sma99 = ind_15m["sma99"]

        sd = SymbolData(
            symbol=sym,
            features=feats.astype(np.float64),
            closes=m15_c.astype(np.float64),
            atrs=m15_atr_arr.astype(np.float64),
            highs=m15_h.astype(np.float64),
            lows=m15_l.astype(np.float64),
            timestamps=m15_ts.astype(np.int64),
            ma7=m15_sma7.astype(np.float64),
            ma25=m15_sma25.astype(np.float64),
            ma99=m15_sma99.astype(np.float64),
            n_bars=len(feats),
        )
        symbols.append(sd)
        logger.debug("%s: %d bars after warmup", sym, sd.n_bars)

    logger.info("Loaded %d symbols, total bars: %d", len(symbols), sum(s.n_bars for s in symbols))
    return symbols


# ═══════════════════════════════════════════════════════════════════════════════
# GYMNASIUM TRADING ENVIRONMENT
# ═══════════════════════════════════════════════════════════════════════════════


class TradingEnv(gym.Env):
    """Gymnasium environment for PPO bar-by-bar trading.

    Steps through 15m bars of one symbol. The agent observes 37 features
    and takes one of three actions per step.

    Observation (37 dims):
      0-29 : 30 meta-v20 features at the current bar
      30   : in_position flag (0/1)
      31   : unrealized PnL percentage
      32   : bars_held / 48.0 (normalized)
      33   : max favorable excursion percentage
      34   : max adverse excursion percentage
      35   : distance from entry in ATR units
      36   : global account drawdown percentage

    Actions:
      0 = HOLD (skip if flat, stay if in position)
      1 = ENTER LONG (only valid when flat; 5% of equity)
      2 = EXIT (only valid when in position; close at market)

    Risk management (built into env, not the agent):
      - Hard stop: auto-exit when loss exceeds 1 ATR from entry
      - Take profit: auto-exit when gain exceeds 2 ATR from entry
      - Time limit: auto-exit after 48 bars
      - Global DD limit: episode terminates if equity drops 20% from initial
    """

    metadata = {"render_modes": []}

    def __init__(
        self,
        symbols: List[SymbolData],
        split_ratio: float = 0.8,
        mode: str = "train",
        initial_equity: float = 10_000.0,
        position_pct: float = 0.05,
        stop_atr: float = 1.0,
        target_atr: float = 2.0,
        max_bars_held: int = 48,
        global_dd_limit: float = 0.20,
        seed: Optional[int] = None,
    ):
        super().__init__()
        self._symbols = symbols
        self._split_ratio = split_ratio
        self._mode = mode
        self._initial_equity = initial_equity
        self._position_pct = position_pct
        self._stop_atr = stop_atr
        self._target_atr = target_atr
        self._max_bars_held = max_bars_held
        self._global_dd_limit = global_dd_limit

        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(OBS_DIM,), dtype=np.float64,
        )
        self.action_space = spaces.Discrete(3)

        self._rng = np.random.RandomState(seed)

        # Current progress
        self._idx: int = 0
        self._sym_idx: int = 0
        self._start_idx: int = 0
        self._end_idx: int = 0
        self._done: bool = False

        # Position state
        self._in_position: bool = False
        self._entry_price: float = 0.0
        self._entry_idx: int = 0
        self._bars_held: int = 0
        self._max_favorable: float = 0.0
        self._max_adverse: float = 0.0

        # Account
        self._equity: float = initial_equity
        self._peak_equity: float = initial_equity

        # Trade log for analysis
        self._trades: List[Dict] = []

    # ── Read-only properties for evaluation ──

    @property
    def equity(self) -> float:
        return self._equity

    @property
    def peak_equity(self) -> float:
        return self._peak_equity

    @property
    def in_position(self) -> bool:
        return self._in_position

    @property
    def trades(self) -> List[Dict]:
        return self._trades

    # ── Gym API ──

    def reset(self, *, seed: Optional[int] = None, options: Optional[dict] = None) -> Tuple[np.ndarray, dict]:
        if seed is not None:
            self._rng = np.random.RandomState(seed)

        # Pick a symbol, cycle sequentially with randomness for variety
        self._sym_idx = self._rng.randint(0, len(self._symbols))
        sd = self._symbols[self._sym_idx]

        # Chronological split
        if self._mode == "train":
            self._start_idx = 0
            self._end_idx = max(1, int(sd.n_bars * self._split_ratio))
        else:
            self._start_idx = max(0, int(sd.n_bars * self._split_ratio))
            self._end_idx = sd.n_bars

        # Need at least 50 bars for meaningful evaluation
        if self._end_idx - self._start_idx < 50:
            self._start_idx = 0
            self._end_idx = sd.n_bars

        # Random starting point within the partition (for training variety)
        if self._mode == "train" and self._end_idx - self._start_idx > 200:
            offset = self._rng.randint(0, (self._end_idx - self._start_idx) // 2)
            self._start_idx += offset

        self._idx = self._start_idx

        # Reset state
        self._in_position = False
        self._entry_price = 0.0
        self._entry_idx = 0
        self._bars_held = 0
        self._max_favorable = 0.0
        self._max_adverse = 0.0
        self._equity = self._initial_equity
        self._peak_equity = self._initial_equity
        self._trades = []
        self._done = False

        return self._build_obs(), {}

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, dict]:
        sd = self._symbols[self._sym_idx]

        if self._done:
            return self._build_obs(), 0.0, True, False, {}

        reward = 0.0
        info: dict = {"action": int(action)}

        # ── Validate and compute reward ──
        if action == 1 and self._in_position:
            reward = -1.0
            info["invalid"] = "enter_while_in_position"
        elif action == 2 and not self._in_position:
            reward = -1.0
            info["invalid"] = "exit_while_not_in_position"
        else:
            reward = self._compute_reward(action)

        # ── Execute action ──
        if action == 1 and not self._in_position:
            self._enter_position()
        elif action == 2 and self._in_position:
            self._exit_position()

        # ── Auto stop/target/time checks ──
        if self._in_position and self._idx < len(sd.closes):
            current_close = float(sd.closes[self._idx])
            atr = float(sd.atrs[self._idx])
            if atr > 0 and self._entry_price > 0:
                pnl_pct = (current_close - self._entry_price) / self._entry_price * 100
                stop_pct = self._stop_atr * atr / self._entry_price * 100
                target_pct = self._target_atr * atr / self._entry_price * 100

                if pnl_pct <= -stop_pct:
                    self._exit_position()
                    reward += self._stop_reward(pnl_pct)
                    info["auto_exit"] = "stop_loss"
                elif pnl_pct >= target_pct:
                    self._exit_position()
                    reward += self._target_reward(pnl_pct)
                    info["auto_exit"] = "take_profit"
                elif self._bars_held >= self._max_bars_held:
                    self._exit_position()
                    reward += self._time_exit_reward()
                    info["auto_exit"] = "time_limit"

        # ── Update tracking ──
        if self._in_position:
            self._bars_held += 1

        # ── Advance bar ──
        self._idx += 1
        if self._idx >= self._end_idx:
            if self._in_position:
                self._exit_position()
            self._done = True

        # ── Global DD kill ──
        if self._equity <= self._initial_equity * (1.0 - self._global_dd_limit):
            self._done = True
            reward -= 1.0

        obs = self._build_obs()
        return obs, reward, self._done, False, info

    # ── Observation ──

    def _build_obs(self) -> np.ndarray:
        sd = self._symbols[self._sym_idx]
        obs = np.zeros(OBS_DIM, dtype=np.float64)

        # Core 30 features
        if self._idx < sd.n_bars:
            obs[:N_FEATURES] = sd.features[self._idx]

        # Context
        obs[30] = 1.0 if self._in_position else 0.0

        if self._in_position and self._entry_price > 0 and self._idx < sd.n_bars:
            current_close = float(sd.closes[self._idx])
            pnl_pct = (current_close - self._entry_price) / self._entry_price * 100
            obs[31] = pnl_pct
            obs[33] = self._max_favorable
            obs[34] = self._max_adverse

            atr = float(sd.atrs[self._idx])
            if atr > 0:
                obs[35] = (current_close - self._entry_price) / atr / self._entry_price
        else:
            obs[31] = 0.0
            obs[33] = 0.0
            obs[34] = 0.0
            obs[35] = 0.0

        obs[32] = self._bars_held / float(self._max_bars_held)

        if self._initial_equity > 0:
            obs[36] = (self._initial_equity - self._equity) / self._initial_equity

        return obs

    # ── Position management ──

    def _enter_position(self) -> None:
        sd = self._symbols[self._sym_idx]
        if self._idx >= sd.n_bars:
            return
        self._entry_price = float(sd.closes[self._idx])
        self._entry_idx = self._idx
        self._bars_held = 0
        self._max_favorable = 0.0
        self._max_adverse = 0.0
        self._in_position = True

    def _exit_position(self) -> None:
        if not self._in_position:
            return
        sd = self._symbols[self._sym_idx]
        exit_idx = min(self._idx, sd.n_bars - 1)
        exit_price = float(sd.closes[exit_idx])
        pnl_pct = (exit_price - self._entry_price) / self._entry_price * 100 if self._entry_price > 0 else 0.0
        position_notional = self._equity * self._position_pct
        pnl_amount = position_notional * pnl_pct / 100.0
        self._equity += pnl_amount
        self._peak_equity = max(self._peak_equity, self._equity)

        self._trades.append({
            "entry_idx": self._entry_idx,
            "exit_idx": exit_idx,
            "entry_price": self._entry_price,
            "exit_price": exit_price,
            "pnl_pct": pnl_pct,
            "bars_held": self._bars_held,
            "max_favorable": self._max_favorable,
            "max_adverse": self._max_adverse,
        })

        self._in_position = False
        self._entry_price = 0.0

    # ── Reward function ──

    def _compute_reward(self, action: int) -> float:
        sd = self._symbols[self._sym_idx]
        reward = 0.0

        if self._idx >= sd.n_bars:
            return reward

        feats = sd.features[self._idx]
        current_close = float(sd.closes[self._idx])
        atr = float(sd.atrs[self._idx])

        # 1. Entry quality bonus
        if action == 1 and not self._in_position:
            h4_bb_pos = float(feats[11])  # index 11 = h4_bb_pos
            m15_rsi = float(feats[22])    # index 22 = m15_rsi
            if h4_bb_pos < 0.3 and m15_rsi < 45:
                reward += 0.1

        # 2. Skip penalty when all TFs agree bullish
        if action == 0 and not self._in_position:
            mtf_triple = float(feats[28])  # index 28 = mtf_triple_agree
            if mtf_triple > 0.5:
                reward -= 0.01

        # 3. Holding bonus/penalty
        if self._in_position and action == 0 and self._entry_price > 0:
            unrealized = (current_close - self._entry_price) / self._entry_price * 100
            if unrealized > 0:
                reward += 0.001 * unrealized
            else:
                reward -= 0.002 * abs(unrealized)

        # 4. Exit reward (agent chooses to exit)
        if action == 2 and self._in_position and self._entry_price > 0:
            pnl_pct = (current_close - self._entry_price) / self._entry_price * 100
            if pnl_pct > 0:
                reward += 1.0 + 0.1 * pnl_pct
            else:
                reward -= 2.0 + 0.2 * abs(pnl_pct)

        # 5. Drawdown penalty during trade
        if self._in_position and self._max_adverse < 0 and self._entry_price > 0:
            atr_pct = atr / self._entry_price * 100
            if abs(self._max_adverse) > atr_pct:
                reward -= 0.5

        # 6. Time penalty beyond 24 bars
        if self._in_position and self._bars_held > 24:
            reward -= 0.02 * (self._bars_held - 24)

        # 7. Global equity drawdown penalty
        dd = (self._initial_equity - self._equity) / self._initial_equity
        if dd > 0.10:
            reward -= 1.0

        return reward

    def _stop_reward(self, pnl_pct: float) -> float:
        return -2.0 - 0.2 * abs(pnl_pct)

    def _target_reward(self, pnl_pct: float) -> float:
        return 1.0 + 0.1 * pnl_pct

    def _time_exit_reward(self) -> float:
        return -1.0


def make_train_env(
    symbols: List[SymbolData],
    split_ratio: float = 0.8,
    seed: int = 0,
) -> TradingEnv:
    return TradingEnv(symbols, split_ratio=split_ratio, mode="train", seed=seed)


def make_eval_env(
    symbols: List[SymbolData],
    split_ratio: float = 0.8,
    seed: int = 0,
) -> TradingEnv:
    return TradingEnv(symbols, split_ratio=split_ratio, mode="eval", seed=seed)


# ═══════════════════════════════════════════════════════════════════════════════
# EVALUATION SUITE
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class EvalMetrics:
    """Comprehensive evaluation results."""
    total_return_pct: float = 0.0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    max_drawdown_pct: float = 0.0
    sharpe_ratio: float = 0.0
    num_trades: int = 0
    avg_bars_held: float = 0.0
    total_wins: int = 0
    total_losses: int = 0
    gross_profit: float = 0.0
    gross_loss: float = 0.0
    avg_win_pct: float = 0.0
    avg_loss_pct: float = 0.0
    momentum_trades: int = 0
    momentum_wr: float = 0.0
    reversal_trades: int = 0
    reversal_wr: float = 0.0
    equity_curve: List[float] = field(default_factory=list)
    final_equity: float = 0.0


def evaluate_agent(
    model,
    symbols: List[SymbolData],
    split_ratio: float = 0.8,
    deterministic: bool = True,
) -> EvalMetrics:
    """Run agent on out-of-sample data across all symbols and report metrics.

    Each symbol is evaluated independently, all trades aggregated.
    """
    logger.info("Evaluating agent on out-of-sample data...")

    env = TradingEnv(symbols, split_ratio=split_ratio, mode="eval")

    all_pnl: List[float] = []
    all_bars: List[int] = []
    n_wins = 0
    n_losses = 0
    gross_profit = 0.0
    gross_loss = 0.0
    equity_trace: List[float] = [10_000.0]

    # Regime counters: momentum = all 3 TFs bullish (trend > 0), reversal = not
    mom_pnl: List[float] = []
    rev_pnl: List[float] = []

    for sym_idx, sd in enumerate(symbols):
        eval_start = max(0, int(sd.n_bars * split_ratio))
        eval_end = sd.n_bars
        if eval_end - eval_start < 50:
            continue

        env._mode = "eval"
        env._sym_idx = sym_idx
        obs, _ = env.reset()

        done = False
        while not done:
            action, _state = model.predict(obs, deterministic=deterministic)

            prev_in_pos = env.in_position
            prev_entry = env._entry_price
            prev_bars = env._bars_held

            obs, reward, done, truncated, info = env.step(int(action))

            # Detect completed trades
            if prev_in_pos and not env.in_position and prev_entry > 0:
                exit_idx = min(env._idx - 1, sd.n_bars - 1)
                exit_price = float(sd.closes[exit_idx])
                pnl = (exit_price - prev_entry) / prev_entry * 100

                all_pnl.append(pnl)
                all_bars.append(prev_bars)
                if pnl > 0:
                    n_wins += 1
                    gross_profit += pnl
                else:
                    n_losses += 1
                    gross_loss += abs(pnl)

                # Regime classification (use feature at entry)
                if env._idx > 0 and env._idx - 1 < sd.n_bars:
                    entry_feats = sd.features[env._idx - 1]
                    mtf_triple = float(entry_feats[28])
                    h4_trend = float(entry_feats[15])
                    if mtf_triple > 0.5 and h4_trend > 0:
                        mom_pnl.append(pnl)
                    else:
                        rev_pnl.append(pnl)

        # Close any open trade at episode end
        if env.in_position and env._entry_price > 0:
            exit_price = float(sd.closes[-1])
            pnl = (exit_price - env._entry_price) / env._entry_price * 100
            all_pnl.append(pnl)
            all_bars.append(env._bars_held)
            if pnl > 0:
                n_wins += 1
                gross_profit += pnl
            else:
                n_losses += 1
                gross_loss += abs(pnl)

        equity_trace.append(env.equity)

    n_trades = len(all_pnl)
    if n_trades == 0:
        logger.warning("No trades executed during evaluation")
        return EvalMetrics()

    # ── Aggregate ──
    wr = n_wins / n_trades
    pf = gross_profit / gross_loss if gross_loss > 0 else float("inf")
    avg_win = gross_profit / n_wins if n_wins > 0 else 0.0
    avg_loss = gross_loss / n_losses if n_losses > 0 else 0.0
    avg_bars_held = float(np.mean(all_bars)) if all_bars else 0.0

    # Total return
    total_return = (env.equity - env._initial_equity) / env._initial_equity * 100

    # Max drawdown from trade returns
    cumulative = 100.0
    peak = 100.0
    max_dd = 0.0
    for r in all_pnl:
        cumulative *= (1.0 + r / 100.0)
        peak = max(peak, cumulative)
        dd = (peak - cumulative) / peak * 100.0
        max_dd = max(max_dd, dd)

    # Sharpe ratio (annualized from 15m bars)
    if n_trades > 1:
        ret_arr = np.array([p / 100.0 for p in all_pnl])
        mean_ret = float(np.mean(ret_arr))
        std_ret = float(np.std(ret_arr, ddof=1))
        # ~35,040 15m bars per year; each trade is a discrete event
        # Use sqrt of annual trades estimated from avg holding
        avg_duration = avg_bars_held if avg_bars_held > 0 else 1
        annual_factor = np.sqrt(35040.0 / avg_duration)
        sharpe = (mean_ret / std_ret * annual_factor) if std_ret > 0 else 0.0
    else:
        sharpe = 0.0

    # Regime breakdown
    mom_wr = sum(1 for p in mom_pnl if p > 0) / len(mom_pnl) if mom_pnl else 0.0
    rev_wr = sum(1 for p in rev_pnl if p > 0) / len(rev_pnl) if rev_pnl else 0.0

    return EvalMetrics(
        total_return_pct=round(total_return, 2),
        win_rate=round(wr, 4),
        profit_factor=round(pf, 2),
        max_drawdown_pct=round(max_dd, 2),
        sharpe_ratio=round(sharpe, 2),
        num_trades=n_trades,
        avg_bars_held=round(avg_bars_held, 2),
        total_wins=n_wins,
        total_losses=n_losses,
        gross_profit=round(gross_profit, 2),
        gross_loss=round(gross_loss, 2),
        avg_win_pct=round(avg_win, 2),
        avg_loss_pct=round(avg_loss, 2),
        momentum_trades=len(mom_pnl),
        momentum_wr=round(mom_wr, 4),
        reversal_trades=len(rev_pnl),
        reversal_wr=round(rev_wr, 4),
        equity_curve=equity_trace,
        final_equity=env.equity,
    )


def evaluate_random_baseline(
    symbols: List[SymbolData],
    split_ratio: float = 0.8,
    seed: int = 42,
) -> EvalMetrics:
    """Baseline: random agent with equal probability for hold/enter/exit."""
    rng = np.random.RandomState(seed)
    env = TradingEnv(symbols, split_ratio=split_ratio, mode="eval")

    all_pnl: List[float] = []
    all_bars: List[int] = []
    n_wins = 0
    gp = 0.0
    gl = 0.0

    for sym_idx, sd in enumerate(symbols):
        eval_start = max(0, int(sd.n_bars * split_ratio))
        if sd.n_bars - eval_start < 50:
            continue

        env._mode = "eval"
        env._sym_idx = sym_idx
        env.reset()
        done = False

        while not done:
            action = int(rng.randint(0, 3))
            prev_in = env.in_position
            prev_entry = env._entry_price
            prev_bars = env._bars_held
            obs, reward, done, truncated, info = env.step(action)

            if prev_in and not env.in_position and prev_entry > 0:
                exit_idx = min(env._idx - 1, sd.n_bars - 1)
                exit_price = float(sd.closes[exit_idx])
                pnl = (exit_price - prev_entry) / prev_entry * 100
                all_pnl.append(pnl)
                all_bars.append(prev_bars)
                if pnl > 0:
                    n_wins += 1
                    gp += pnl
                else:
                    gl += abs(pnl)

    n_trades = len(all_pnl)
    if n_trades == 0:
        return EvalMetrics()

    wr = n_wins / n_trades
    pf = gp / gl if gl > 0 else float("inf")

    # Total return uses the environment's equity (with position sizing)
    total_return = (env.equity - env._initial_equity) / env._initial_equity * 100

    # Max drawdown from position-sized returns
    cumulative = 100.0
    peak = 100.0
    max_dd = 0.0
    for r in all_pnl:
        cumulative *= (1.0 + r / 100.0 * 0.05)  # 5% position sizing
        peak = max(peak, cumulative)
        max_dd = max(max_dd, (peak - cumulative) / peak * 100.0)

    return EvalMetrics(
        total_return_pct=round(total_return, 2),
        win_rate=round(wr, 4),
        profit_factor=round(pf, 2),
        max_drawdown_pct=round(max_dd, 2),
        num_trades=n_trades,
        avg_bars_held=round(float(np.mean(all_bars)), 2) if all_bars else 0.0,
        total_wins=n_wins,
        total_losses=n_trades - n_wins,
        gross_profit=round(gp, 2),
        gross_loss=round(gl, 2),
    )


def evaluate_rsi_baseline(
    symbols: List[SymbolData],
    split_ratio: float = 0.8,
) -> EvalMetrics:
    """Baseline: enter when m15 RSI < 30, exit when m15 RSI > 70."""
    env = TradingEnv(symbols, split_ratio=split_ratio, mode="eval")

    all_pnl: List[float] = []
    all_bars: List[int] = []
    n_wins = 0
    gp = 0.0
    gl = 0.0

    for sym_idx, sd in enumerate(symbols):
        eval_start = max(0, int(sd.n_bars * split_ratio))
        if sd.n_bars - eval_start < 50:
            continue

        env._mode = "eval"
        env._sym_idx = sym_idx
        env.reset()
        done = False

        while not done:
            # m15_rsi is at feature index 22
            m15_rsi = float(sd.features[env._idx][22]) if env._idx < sd.n_bars else 50.0

            if not env.in_position and m15_rsi < 30:
                action = 1
            elif env.in_position and m15_rsi > 70:
                action = 2
            else:
                action = 0

            prev_in = env.in_position
            prev_entry = env._entry_price
            prev_bars = env._bars_held
            obs, reward, done, truncated, info = env.step(action)

            if prev_in and not env.in_position and prev_entry > 0:
                exit_idx = min(env._idx - 1, sd.n_bars - 1)
                exit_price = float(sd.closes[exit_idx])
                pnl = (exit_price - prev_entry) / prev_entry * 100
                all_pnl.append(pnl)
                all_bars.append(prev_bars)
                if pnl > 0:
                    n_wins += 1
                    gp += pnl
                else:
                    gl += abs(pnl)

    n_trades = len(all_pnl)
    if n_trades == 0:
        return EvalMetrics()

    wr = n_wins / n_trades
    pf = gp / gl if gl > 0 else float("inf")
    total_return = (env.equity - env._initial_equity) / env._initial_equity * 100

    return EvalMetrics(
        total_return_pct=round(total_return, 2),
        win_rate=round(wr, 4),
        profit_factor=round(pf, 2),
        num_trades=n_trades,
        avg_bars_held=round(float(np.mean(all_bars)), 2) if all_bars else 0.0,
        total_wins=n_wins,
        total_losses=n_trades - n_wins,
        gross_profit=round(gp, 2),
        gross_loss=round(gl, 2),
        avg_win_pct=round(gp / n_wins, 2) if n_wins > 0 else 0.0,
        avg_loss_pct=round(gl / (n_trades - n_wins), 2) if n_trades > n_wins else 0.0,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# FEATURE IMPORTANCE
# ═══════════════════════════════════════════════════════════════════════════════


def compute_feature_importance(model, n_features: int = N_FEATURES) -> Dict[str, float]:
    """Estimate feature importance from the policy network's first-layer weights.

    Uses the mean absolute weight of the first linear layer connecting the
    observation to the shared/extractor network as a proxy for feature relevance.
    """
    import torch

    importance: Dict[str, float] = {}
    try:
        sd_state = model.policy.state_dict()
        # SB3 MlpPolicy structure: mlp_extractor.policy_net.0.weight = first layer
        target_key = "mlp_extractor.policy_net.0.weight"
        if target_key in sd_state:
            weights = sd_state[target_key].cpu().numpy()
            # Expected shape: (hidden_dim, OBS_DIM) = (128, 37)
            avg_abs = np.mean(np.abs(weights), axis=0)
            if len(avg_abs) == OBS_DIM:
                for i, name in enumerate(FEATURE_NAMES):
                    importance[name] = float(avg_abs[i])
                ctx_names = [
                    "in_position", "pnl_pct", "bars_held_norm",
                    "max_favorable", "max_adverse", "dist_from_entry", "account_dd",
                ]
                for i, cn in enumerate(ctx_names):
                    importance[cn] = float(avg_abs[n_features + i])
            elif len(avg_abs) <= N_FEATURES:
                # If the first layer doesn't map all 37 dims directly (unlikely),
                # just fill what we can
                for i, name in enumerate(FEATURE_NAMES):
                    if i < len(avg_abs):
                        importance[name] = float(avg_abs[i])

        if not importance:
            logger.warning("Could not extract feature importance -- no matching layer found")
            return {}

    except Exception as e:
        logger.warning("Feature importance failed: %s", e)
        return {}

    # Normalize
    total = sum(importance.values())
    if total > 0:
        importance = {k: round(v / total, 6) for k, v in importance.items()}

    return importance


# ═══════════════════════════════════════════════════════════════════════════════
# TRAINING
# ═══════════════════════════════════════════════════════════════════════════════


def train_ppo(
    symbols: List[SymbolData],
    output_dir: Path,
    total_timesteps: int = 500_000,
    quick: bool = False,
    split_ratio: float = 0.8,
    seed: int = 42,
    ent_coef: float = 0.01,
) -> Tuple[object, EvalMetrics]:
    """Train a PPO agent on the trading environment."""
    output_dir.mkdir(parents=True, exist_ok=True)

    if quick:
        n_envs = 2
        n_steps = 512
        batch_size = 32
        n_epochs = 5
        total_timesteps = min(total_timesteps, 50_000)
    else:
        n_envs = 4
        n_steps = 2048
        batch_size = 64
        n_epochs = 10

    # ── Create environments ──
    train_env = DummyVecEnv([
        lambda: make_train_env(symbols, split_ratio=split_ratio, seed=seed + i)
        for i in range(n_envs)
    ])

    eval_env = DummyVecEnv([
        lambda: make_eval_env(symbols, split_ratio=split_ratio, seed=seed + 9999)
    ])

    # ── Build PPO model ──
    import torch.nn as nn

    policy_kwargs = dict(
        net_arch=dict(pi=[128, 64], vf=[128, 64]),
        activation_fn=nn.ReLU,
    )

    logger.info(
        "PPO config: timesteps=%d, n_steps=%d, batch=%d, epochs=%d, n_envs=%d, ent_coef=%.3f",
        total_timesteps, n_steps, batch_size, n_epochs, n_envs, ent_coef,
    )

    model = PPO(
        "MlpPolicy",
        train_env,
        policy_kwargs=policy_kwargs,
        learning_rate=3e-4,
        n_steps=n_steps,
        batch_size=batch_size,
        n_epochs=n_epochs,
        gamma=0.99,
        gae_lambda=0.95,
        clip_range=0.2,
        ent_coef=ent_coef,
        vf_coef=0.5,
        max_grad_norm=0.5,
        verbose=1,
        seed=seed,
        device="cpu",
    )

    # ── Eval callback ──
    eval_freq = max(5000, total_timesteps // 20)
    eval_cb = EvalCallback(
        eval_env,
        best_model_save_path=str(output_dir),
        log_path=str(output_dir / "eval_logs"),
        eval_freq=eval_freq,
        n_eval_episodes=5,
        deterministic=True,
        render=False,
        verbose=1,
    )

    logger.info("Starting training for %d timesteps...", total_timesteps)
    t0 = time.time()
    model.learn(total_timesteps=total_timesteps, callback=eval_cb)
    elapsed = time.time() - t0
    logger.info("Training done in %.1f s (%.1f steps/s)",
                 elapsed, total_timesteps / max(elapsed, 0.1))

    # ── Save ──
    model_path = output_dir / "ppo_trading_agent"
    model.save(str(model_path))
    logger.info("Saved %s.zip", model_path)

    # ── Evaluate ──
    metrics = evaluate_agent(model, symbols, split_ratio=split_ratio)
    return model, metrics


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════


def main() -> None:
    parser = argparse.ArgumentParser(
        description="PPO Trading Agent -- RL for trade entry and position sizing",
    )
    parser.add_argument("--timesteps", type=int, default=500_000)
    parser.add_argument("--quick", action="store_true", help="Quick test mode")
    parser.add_argument("--output", type=str, default=str(DEFAULT_OUTPUT))
    parser.add_argument("--klines", type=str, default=str(DEFAULT_KLINES))
    parser.add_argument("--eval-only", action="store_true", help="Skip training, eval only")
    parser.add_argument("--model", type=str, default=None, help="Path to existing model .zip")
    parser.add_argument("--n-symbols", type=int, default=0, help="Limit to N symbols")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--split-ratio", type=float, default=0.8)
    parser.add_argument("--ent-coef", type=float, default=0.01)
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    klines_path = Path(args.klines)

    if not klines_path.exists():
        logger.error("Klines not found: %s", klines_path)
        sys.exit(1)

    # ── Load data ──
    symbols = load_and_build_features(klines_path)
    if args.n_symbols > 0:
        symbols = symbols[:args.n_symbols]
    if args.quick:
        symbols = symbols[:min(5, len(symbols))]
        logger.info("Quick mode: %d symbols", len(symbols))

    if not symbols:
        logger.error("No valid symbols")
        sys.exit(1)

    logger.info("Symbols: %d, total bars: %d", len(symbols), sum(s.n_bars for s in symbols))

    # ── Train or Eval ──
    if args.eval_only:
        if not args.model or not Path(args.model).exists():
            logger.error("--model required and must exist for --eval-only")
            sys.exit(1)
        logger.info("Loading %s", args.model)
        model = PPO.load(args.model, device="cpu")
        metrics = evaluate_agent(model, symbols, split_ratio=args.split_ratio)
    else:
        model, metrics = train_ppo(
            symbols, output_dir,
            total_timesteps=args.timesteps,
            quick=args.quick,
            split_ratio=args.split_ratio,
            seed=args.seed,
            ent_coef=args.ent_coef,
        )

    # ── Baselines ──
    logger.info("Computing baselines...")
    rnd = evaluate_random_baseline(symbols, split_ratio=args.split_ratio, seed=args.seed)
    rsi = evaluate_rsi_baseline(symbols, split_ratio=args.split_ratio)

    # ── Feature importance ──
    logger.info("Computing feature importance...")
    importance = compute_feature_importance(model)

    # ── Build report ──
    report = {
        "model": "ppo_trading_agent",
        "timesteps": args.timesteps,
        "n_symbols": len(symbols),
        "total_bars": sum(s.n_bars for s in symbols),
        "obs_dim": OBS_DIM,
        "feature_names": FEATURE_NAMES,
        "ppo_agent": {
            "total_return_pct": metrics.total_return_pct,
            "win_rate": metrics.win_rate,
            "profit_factor": metrics.profit_factor,
            "max_drawdown_pct": metrics.max_drawdown_pct,
            "sharpe_ratio": metrics.sharpe_ratio,
            "num_trades": metrics.num_trades,
            "total_wins": metrics.total_wins,
            "total_losses": metrics.total_losses,
            "avg_win_pct": metrics.avg_win_pct,
            "avg_loss_pct": metrics.avg_loss_pct,
            "avg_bars_held": metrics.avg_bars_held,
            "momentum_trades": metrics.momentum_trades,
            "momentum_wr": metrics.momentum_wr,
            "reversal_trades": metrics.reversal_trades,
            "reversal_wr": metrics.reversal_wr,
            "final_equity": round(metrics.final_equity, 2),
        },
        "baseline_random": {
            "total_return_pct": rnd.total_return_pct,
            "win_rate": rnd.win_rate,
            "profit_factor": rnd.profit_factor,
            "max_drawdown_pct": rnd.max_drawdown_pct,
            "num_trades": rnd.num_trades,
        },
        "baseline_rsi": {
            "total_return_pct": rsi.total_return_pct,
            "win_rate": rsi.win_rate,
            "profit_factor": rsi.profit_factor,
            "num_trades": rsi.num_trades,
            "avg_bars_held": rsi.avg_bars_held,
        },
        "feature_importance_top10": [
            [name, imp] for name, imp in
            sorted(importance.items(), key=lambda x: x[1], reverse=True)[:10]
        ] if importance else [],
        "config": {
            "split_ratio": args.split_ratio,
            "seed": args.seed,
            "ent_coef": args.ent_coef,
            "quick": args.quick,
        },
    }

    report_path = output_dir / "eval_report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    logger.info("Saved %s", report_path)

    # ── Print summary ──
    print("\n" + "=" * 68)
    print("  PPO TRADING AGENT -- EVALUATION SUMMARY")
    print("=" * 68)
    print(f"  Symbols: {len(symbols):>5}   Total bars: {sum(s.n_bars for s in symbols):>6}   Timesteps: {args.timesteps:>7}")
    print("-" * 68)
    print(f"  {'Metric':<26} {'PPO':>10} {'Random':>10} {'RSI':>10}")
    print("-" * 68)
    print(f"  {'Total Return %':<26} {metrics.total_return_pct:>10.2f} {rnd.total_return_pct:>10.2f} {rsi.total_return_pct:>10.2f}")
    print(f"  {'Win Rate':<26} {metrics.win_rate:>10.4f} {rnd.win_rate:>10.4f} {rsi.win_rate:>10.4f}")
    print(f"  {'Profit Factor':<26} {metrics.profit_factor:>10.2f} {rnd.profit_factor:>10.2f} {rsi.profit_factor:>10.2f}")
    print(f"  {'Max Drawdown %':<26} {metrics.max_drawdown_pct:>10.2f} {rnd.max_drawdown_pct:>10.2f} {'--':>10}")
    print(f"  {'Sharpe Ratio':<26} {metrics.sharpe_ratio:>10.2f} {'--':>10} {'--':>10}")
    print(f"  {'Num Trades':<26} {metrics.num_trades:>10} {rnd.num_trades:>10} {rsi.num_trades:>10}")
    print(f"  {'Avg Bars Held':<26} {metrics.avg_bars_held:>10.2f} {rnd.avg_bars_held:>10.2f} {rsi.avg_bars_held:>10.2f}")
    print("-" * 68)
    print(f"  Regime Breakdown:")
    print(f"    Momentum ({metrics.momentum_trades} trades):  WR = {metrics.momentum_wr:.4f}")
    print(f"    Reversal ({metrics.reversal_trades} trades):  WR = {metrics.reversal_wr:.4f}")
    if importance:
        print("-" * 68)
        print(f"  Top 5 Feature Importances:")
        top5 = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:5]
        for name, imp in top5:
            print(f"    {name:<30} {imp:.4f}")
    print("=" * 68 + "\n")


if __name__ == "__main__":
    main()
