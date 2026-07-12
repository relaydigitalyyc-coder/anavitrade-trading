from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

from .config import StrategyConfig

Direction = Literal["long", "short"]


@dataclass(frozen=True)
class Impulse:
    direction: Direction
    start: int
    end: int
    origin: float
    extreme: float
    range_value: float
    avg_volume: float
    score: int


@dataclass(frozen=True)
class Compression:
    direction: Direction
    start: int
    end: int
    high: float
    low: float
    score: int
    avg_volume: float
    avg_range: float


def _finite_row(row: pd.Series, fields: list[str]) -> bool:
    return all(np.isfinite(float(row[f])) for f in fields)


def is_bullish_trend(df: pd.DataFrame, i: int, cfg: StrategyConfig) -> bool:
    r = df.iloc[i]
    if not _finite_row(r, ["ma7", "ma25", "ma99", "ma25_slope", "atr14"]):
        return False
    return bool(r.ma7 > r.ma25 > r.ma99 and r.close > r.ma25 and r.ma25_slope > 0)


def is_bearish_trend(df: pd.DataFrame, i: int, cfg: StrategyConfig) -> bool:
    r = df.iloc[i]
    if not _finite_row(r, ["ma7", "ma25", "ma99", "ma25_slope", "atr14"]):
        return False
    return bool(r.ma7 < r.ma25 < r.ma99 and r.close < r.ma25 and r.ma25_slope < 0)


def prior_high(df: pd.DataFrame, before_index: int, lookback: int) -> float:
    start = max(0, before_index - lookback)
    if before_index <= start:
        return float("nan")
    return float(df["high"].iloc[start:before_index].max())


def prior_low(df: pd.DataFrame, before_index: int, lookback: int) -> float:
    start = max(0, before_index - lookback)
    if before_index <= start:
        return float("nan")
    return float(df["low"].iloc[start:before_index].min())


def find_recent_impulse(df: pd.DataFrame, i: int, direction: Direction, cfg: StrategyConfig) -> Impulse | None:
    """Find the best recent impulse that ended before the trigger candle.

    All inspected candles are <= i, and impulse candidates end at least
    min_pullback_bars before i, so the current trigger candle is not reused as
    the historical impulse.
    """
    latest_allowed_end = i - cfg.min_pullback_bars
    earliest_allowed_end = max(0, i - cfg.max_signal_age_after_impulse)
    best: Impulse | None = None

    for end in range(latest_allowed_end, earliest_allowed_end - 1, -1):
        for length in range(cfg.min_impulse_bars, cfg.max_impulse_bars + 1):
            start = end - length + 1
            if start <= cfg.lookback_structure:
                continue
            seg = df.iloc[start : end + 1]
            end_row = df.iloc[end]
            if not _finite_row(end_row, ["atr14", "volume_ma20", "ma7", "ma25"]):
                continue
            rng = float(seg["high"].max() - seg["low"].min())
            if rng <= cfg.impulse_atr_mult * float(end_row.atr14):
                continue
            avg_volume = float(seg["volume"].mean())
            if avg_volume <= cfg.impulse_volume_mult * float(end_row.volume_ma20):
                continue

            if direction == "long":
                ph = prior_high(df, start, cfg.lookback_structure)
                if not np.isfinite(ph):
                    continue
                close_break = float(df["close"].iloc[end]) > ph
                ma_sep = (float(end_row.ma7) - float(end_row.ma25)) >= cfg.ma_separation_atr_mult * float(end_row.atr14)
                directional = float(df["close"].iloc[end]) > float(df["open"].iloc[start])
                if not (close_break and ma_sep and directional):
                    continue
                origin = float(seg["low"].min())
                extreme = float(seg["high"].max())
            else:
                pl = prior_low(df, start, cfg.lookback_structure)
                if not np.isfinite(pl):
                    continue
                close_break = float(df["close"].iloc[end]) < pl
                ma_sep = (float(end_row.ma25) - float(end_row.ma7)) >= cfg.ma_separation_atr_mult * float(end_row.atr14)
                directional = float(df["close"].iloc[end]) < float(df["open"].iloc[start])
                if not (close_break and ma_sep and directional):
                    continue
                origin = float(seg["high"].max())
                extreme = float(seg["low"].min())

            score = 0
            score += 6 if rng >= 2.0 * float(end_row.atr14) else 4
            score += 5 if avg_volume >= 1.25 * float(end_row.volume_ma20) else 3
            score += 5 if close_break else 0
            score += 4 if ma_sep else 0
            candidate = Impulse(direction, start, end, origin, extreme, rng, avg_volume, min(20, score))
            if best is None or (candidate.end > best.end) or (candidate.end == best.end and candidate.score > best.score):
                best = candidate
    return best


def valid_pullback(df: pd.DataFrame, i: int, impulse: Impulse, cfg: StrategyConfig) -> tuple[bool, int, str]:
    start = impulse.end + 1
    end = i - 1
    if end - start + 1 < cfg.min_pullback_bars:
        return False, 0, "not enough pullback candles"
    pullback = df.iloc[start : end + 1]
    trigger_prev = df.iloc[end]
    if not _finite_row(trigger_prev, ["ma25", "atr14"]):
        return False, 0, "missing MA/ATR"

    avg_vol = float(pullback["volume"].mean())
    avg_range = float(pullback["range"].mean())
    impulse_avg_range = impulse.range_value / max(1, impulse.end - impulse.start + 1)
    near_ma = bool((pullback["close"] - pullback["ma25"]).abs().min() <= cfg.near_ma_atr_mult * float(trigger_prev.atr14))
    vol_ok = avg_vol <= impulse.avg_volume * cfg.pullback_volume_max_ratio
    range_ok = avg_range <= impulse_avg_range * 1.10

    if impulse.direction == "long":
        holds_origin = float(pullback["low"].min()) > impulse.origin
        strong_closes_against = int(((pullback["close"] < pullback["ma25"] - 0.25 * pullback["atr14"]).fillna(False)).sum())
        structure_ok = holds_origin and strong_closes_against <= 2
    else:
        holds_origin = float(pullback["high"].max()) < impulse.origin
        strong_closes_against = int(((pullback["close"] > pullback["ma25"] + 0.25 * pullback["atr14"]).fillna(False)).sum())
        structure_ok = holds_origin and strong_closes_against <= 2

    score = 0
    score += 5 if vol_ok else 0
    score += 4 if range_ok else 0
    score += 3 if near_ma else 0
    score += 3 if structure_ok else 0
    valid = score >= 10
    reason = "valid pullback" if valid else f"pullback weak: vol={vol_ok}, range={range_ok}, near_ma={near_ma}, structure={structure_ok}"
    return valid, min(15, score), reason


def detect_compression(df: pd.DataFrame, i: int, direction: Direction, cfg: StrategyConfig) -> Compression | None:
    end = i - 1
    start = end - cfg.compression_lookback + 1
    prev_start = start - cfg.compression_lookback
    if prev_start < 0 or start < 0:
        return None
    comp = df.iloc[start : end + 1]
    prev = df.iloc[prev_start:start]
    row = df.iloc[end]
    if not _finite_row(row, ["ma25", "atr14", "volume_ma20"]):
        return None

    comp_range = float(comp["range"].mean())
    prev_range = float(prev["range"].mean())
    comp_atr = float(comp["atr14"].mean())
    prev_atr = float(prev["atr14"].mean())
    comp_volume = float(comp["volume"].mean())
    prev_volume = float(prev["volume"].mean())
    comp_high = float(comp["high"].max())
    comp_low = float(comp["low"].min())
    width = comp_high - comp_low

    range_contract = comp_range <= prev_range * cfg.compression_range_ratio
    atr_contract = comp_atr <= prev_atr * cfg.compression_atr_ratio
    volume_contract = comp_volume <= min(prev_volume, float(row.volume_ma20)) * 1.05
    near_ma = bool((comp["close"] - comp["ma25"]).abs().min() <= cfg.near_ma_atr_mult * float(row.atr14))
    narrow = width <= 4.0 * float(row.atr14)
    small_bodies = float(comp["body_ratio"].mean()) <= 0.65

    score = 0
    score += 3 if range_contract else 0
    score += 3 if atr_contract else 0
    score += 3 if volume_contract else 0
    score += 2 if near_ma else 0
    score += 2 if narrow else 0
    score += 2 if small_bodies else 0

    if score < 8:
        return None
    return Compression(direction=direction, start=start, end=end, high=comp_high, low=comp_low, score=min(15, score), avg_volume=comp_volume, avg_range=comp_range)

