from __future__ import annotations

import numpy as np
import pandas as pd

from .config import StrategyConfig


def sma(series: pd.Series, length: int) -> pd.Series:
    return series.rolling(length, min_periods=length).mean()


def ema(series: pd.Series, length: int) -> pd.Series:
    return series.ewm(span=length, adjust=False, min_periods=length).mean()


def atr(df: pd.DataFrame, length: int = 14) -> pd.Series:
    high = df["high"]
    low = df["low"]
    close = df["close"]
    prev_close = close.shift(1)
    tr = pd.concat(
        [
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.rolling(length, min_periods=length).mean()


def rsi(series: pd.Series, length: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1 / length, min_periods=length, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / length, min_periods=length, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    out = 100 - (100 / (1 + rs))
    return out.fillna(50.0)


def zscore(series: pd.Series, length: int) -> pd.Series:
    mean = series.rolling(length, min_periods=length).mean()
    std = series.rolling(length, min_periods=length).std(ddof=0)
    return (series - mean) / std.replace(0, np.nan)


def add_indicators(df: pd.DataFrame, cfg: StrategyConfig) -> pd.DataFrame:
    out = df.copy()
    out["ma7"] = sma(out["close"], cfg.fast_ma)
    out["ma25"] = sma(out["close"], cfg.mid_ma)
    out["ma99"] = sma(out["close"], cfg.slow_ma)
    out["ema20"] = ema(out["close"], 20)
    out["atr14"] = atr(out, cfg.atr_length)
    out["volume_ma20"] = sma(out["volume"], cfg.volume_ma_length)
    out["volume_zscore"] = zscore(out["volume"], cfg.volume_ma_length).fillna(0.0)
    out["range"] = out["high"] - out["low"]
    out["body"] = (out["close"] - out["open"]).abs()
    out["body_ratio"] = np.where(out["range"] > 0, out["body"] / out["range"], 0.0)
    out["close_position"] = np.where(
        out["range"] > 0,
        (out["close"] - out["low"]) / out["range"],
        0.5,
    )
    out["ma25_slope"] = out["ma25"] - out["ma25"].shift(cfg.ma_slope_lookback)
    out["ma99_slope"] = out["ma99"] - out["ma99"].shift(cfg.ma_slope_lookback)
    out["rsi14"] = rsi(out["close"], 14)
    out["close_zscore20"] = zscore(out["close"], 20).fillna(0.0)
    bb_mid = sma(out["close"], cfg.bollinger_length)
    bb_std = out["close"].rolling(cfg.bollinger_length, min_periods=cfg.bollinger_length).std(ddof=0)
    out["bb_mid"] = bb_mid
    out["bb_upper"] = bb_mid + cfg.bollinger_std * bb_std
    out["bb_lower"] = bb_mid - cfg.bollinger_std * bb_std
    out["bb_width"] = (out["bb_upper"] - out["bb_lower"]) / out["bb_mid"].replace(0, np.nan)
    # WARNING: pivot_high_centered/pivot_low_centered use center=True which
    # looks at span bars on EACH side of the current candle. This LEAKS FUTURE
    # DATA and is only valid for post-hoc analysis where the decision candle
    # excludes the confirmation window. Do NOT use these columns for live or
    # live-equivalent signal generation — use pivot_high/pivot_low below.
    span = cfg.divergence_pivot_span
    out["pivot_high_centered"] = out["high"].eq(out["high"].rolling(2 * span + 1, center=True, min_periods=2 * span + 1).max())
    out["pivot_low_centered"] = out["low"].eq(out["low"].rolling(2 * span + 1, center=True, min_periods=2 * span + 1).min())
    # Causal pivots — no lookahead. Uses trailing window (center=False) so that
    # the current bar is compared only against past bars. At bar i, detects
    # whether bar i is the highest/lowest of the last 2*span+1 bars.
    out["pivot_high"] = out["high"].eq(out["high"].rolling(2 * span + 1, center=False, min_periods=2 * span + 1).max())
    out["pivot_low"] = out["low"].eq(out["low"].rolling(2 * span + 1, center=False, min_periods=2 * span + 1).min())
    out["displacement"] = np.where(out["atr14"] > 0, out["body"] / out["atr14"], 0.0)
    return out
