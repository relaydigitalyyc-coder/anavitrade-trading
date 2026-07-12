from __future__ import annotations

from dataclasses import dataclass
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from .config import StrategyConfig
from .structure import Impulse


@dataclass(frozen=True)
class ICTConfluence:
    score_delta: int
    fvg_present: bool
    order_block_present: bool
    ote_present: bool
    sweep_present: bool
    killzone_present: bool
    details: str


def _safe_ts(row: pd.Series) -> pd.Timestamp | None:
    try:
        return pd.Timestamp(row.timestamp)
    except Exception:
        return None


def in_ny_killzone(timestamp: pd.Timestamp) -> bool:
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize("UTC")
    ny = timestamp.tz_convert(ZoneInfo("America/New_York"))
    mins = ny.hour * 60 + ny.minute
    return (7 * 60 <= mins <= 11 * 60) or (13 * 60 <= mins <= 15 * 60)


def recent_fvg(df: pd.DataFrame, i: int, direction: str, cfg: StrategyConfig) -> tuple[bool, str]:
    start = max(2, i - cfg.fvg_max_age)
    current_close = float(df.iloc[i].close)
    for k in range(i - 1, start - 1, -1):
        a = df.iloc[k - 2]
        c = df.iloc[k]
        if direction == "long" and float(c.low) > float(a.high):
            low, high = float(a.high), float(c.low)
            touched = low <= current_close <= high or current_close >= low
            if touched:
                return True, f"bull_fvg[{k-2}:{k}]={low:.8f}-{high:.8f}"
        if direction == "short" and float(c.high) < float(a.low):
            low, high = float(c.high), float(a.low)
            touched = low <= current_close <= high or current_close <= high
            if touched:
                return True, f"bear_fvg[{k-2}:{k}]={low:.8f}-{high:.8f}"
    return False, "no_fvg"


def recent_order_block(df: pd.DataFrame, i: int, direction: str, impulse: Impulse, cfg: StrategyConfig) -> tuple[bool, str]:
    start = max(0, impulse.start - cfg.ob_max_age)
    search = df.iloc[start : impulse.start + 1]
    if search.empty:
        return False, "no_ob"
    if direction == "long":
        bearish = search[search["close"] < search["open"]]
        if bearish.empty:
            return False, "no_bull_ob"
        ob = bearish.iloc[-1]
        price = float(df.iloc[i].close)
        low, high = float(ob.low), float(ob.high)
        return (low <= price <= high or price >= low), f"bull_ob={low:.8f}-{high:.8f}"
    bullish = search[search["close"] > search["open"]]
    if bullish.empty:
        return False, "no_bear_ob"
    ob = bullish.iloc[-1]
    price = float(df.iloc[i].close)
    low, high = float(ob.low), float(ob.high)
    return (low <= price <= high or price <= high), f"bear_ob={low:.8f}-{high:.8f}"


def ote_check(df: pd.DataFrame, i: int, direction: str, impulse: Impulse, cfg: StrategyConfig) -> tuple[bool, str]:
    price = float(df.iloc[i].close)
    rng = abs(impulse.extreme - impulse.origin)
    if rng <= 0:
        return False, "no_ote"
    if direction == "long":
        high = impulse.extreme
        z_high = high - cfg.ote_min_retrace * rng
        z_low = high - cfg.ote_max_retrace * rng
        ok = z_low <= price <= z_high
    else:
        low = impulse.extreme
        z_low = low + cfg.ote_min_retrace * rng
        z_high = low + cfg.ote_max_retrace * rng
        ok = z_low <= price <= z_high
    return ok, f"ote={z_low:.8f}-{z_high:.8f}"


def liquidity_sweep(df: pd.DataFrame, i: int, direction: str, cfg: StrategyConfig) -> tuple[bool, str]:
    start = max(0, i - cfg.sweep_lookback)
    prior = df.iloc[start:i]
    if prior.empty:
        return False, "no_sweep"
    row = df.iloc[i]
    if direction == "long":
        prior_low = float(prior["low"].min())
        ok = float(row.low) < prior_low and float(row.close) > prior_low
        return ok, f"sellside_sweep={prior_low:.8f}"
    prior_high = float(prior["high"].max())
    ok = float(row.high) > prior_high and float(row.close) < prior_high
    return ok, f"buyside_sweep={prior_high:.8f}"


def ict_confluence(df: pd.DataFrame, i: int, direction: str, impulse: Impulse, cfg: StrategyConfig) -> ICTConfluence:
    if not cfg.enable_ict:
        return ICTConfluence(0, False, False, False, False, False, "ict disabled")
    fvg, fvg_msg = recent_fvg(df, i, direction, cfg)
    ob, ob_msg = recent_order_block(df, i, direction, impulse, cfg)
    ote, ote_msg = ote_check(df, i, direction, impulse, cfg)
    sweep, sweep_msg = liquidity_sweep(df, i, direction, cfg)
    ts = _safe_ts(df.iloc[i])
    kz = bool(ts is not None and in_ny_killzone(ts))
    score = 0
    score += 3 if fvg else 0
    score += 3 if ob else 0
    score += 4 if ote else 0
    score += 3 if sweep else 0
    score += cfg.ny_killzone_bonus if kz else 0
    # Cap because ICT is confluence, not a replacement for the base setup.
    score = min(10, score)
    details = ";".join([fvg_msg, ob_msg, ote_msg, sweep_msg, f"ny_killzone={kz}"])
    return ICTConfluence(int(score), fvg, ob, ote, sweep, kz, details)
