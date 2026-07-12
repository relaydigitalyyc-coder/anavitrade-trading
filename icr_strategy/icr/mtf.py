from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from .config import StrategyConfig
from .indicators import add_indicators


@dataclass(frozen=True)
class MTFConfluence:
    score_delta: int
    agreement_count: int
    conflict_count: int
    details: str


def clear_mtf_cache() -> None:
    # Kept for compatibility with the backtester cache-clear hook. The MTF
    # implementation is intentionally stateless to avoid pandas/Python cleanup
    # instability seen during repeated exhaustive audit loops.
    return None


def _resample_ohlcv(df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    if df.empty:
        return df.copy()
    work = df.copy()
    work["timestamp"] = pd.to_datetime(work["timestamp"], utc=True)
    work = work.set_index("timestamp")
    out = work.resample(timeframe, label="right", closed="right").agg(
        {
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
        }
    )
    out = out.dropna().reset_index()
    return out


def _trend_state(row: pd.Series) -> str:
    try:
        if row.ma7 > row.ma25 > row.ma99 and row.ma25_slope > 0 and row.close > row.ma25:
            return "bull"
        if row.ma7 < row.ma25 < row.ma99 and row.ma25_slope < 0 and row.close < row.ma25:
            return "bear"
    except Exception:
        return "neutral"
    return "neutral"


def mtf_confluence(df: pd.DataFrame, i: int, direction: str, cfg: StrategyConfig) -> MTFConfluence:
    if not cfg.enable_mtf or i <= 0:
        return MTFConfluence(0, 0, 0, "mtf disabled")
    base_time = pd.Timestamp(df.iloc[i].timestamp)
    want = "bull" if direction == "long" else "bear"
    opposite = "bear" if direction == "long" else "bull"
    agreements = 0
    conflicts = 0
    pieces: list[str] = []
    base = df.loc[:i, ["timestamp", "open", "high", "low", "close", "volume"]]
    for tf in cfg.mtf_timeframes:
        higher_raw = _resample_ohlcv(base, tf)
        if len(higher_raw) < cfg.slow_ma + cfg.ma_slope_lookback:
            continue
        higher = add_indicators(higher_raw, cfg)
        eligible = higher[higher["timestamp"] <= base_time]
        if eligible.empty:
            continue
        state = _trend_state(eligible.iloc[-1])
        pieces.append(f"{tf}:{state}")
        if state == want:
            agreements += 1
        elif state == opposite:
            conflicts += 1
    delta = min(cfg.mtf_bonus_cap, agreements * 3) - conflicts * cfg.mtf_penalty_per_conflict
    if agreements < cfg.mtf_required_agreement:
        delta -= cfg.mtf_penalty_per_conflict
    return MTFConfluence(int(delta), agreements, conflicts, ",".join(pieces) or "no_htf")
