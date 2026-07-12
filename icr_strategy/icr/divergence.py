from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import StrategyConfig


@dataclass(frozen=True)
class DivergenceConfluence:
    score_delta: int
    kind: str
    predictive_tag: str
    details: str


def _confirmed_pivots(df: pd.DataFrame, i: int, direction: str, cfg: StrategyConfig) -> pd.DataFrame:
    # Exclude the last span candles because centered fractal pivots need right-side confirmation.
    end = max(0, i - cfg.divergence_pivot_span)
    start = max(0, end - cfg.divergence_lookback)
    col = "pivot_low" if direction == "long" else "pivot_high"
    if col not in df:
        return pd.DataFrame()
    piv = df.iloc[start:end]
    return piv[piv[col].fillna(False)]


def divergence_confluence(df: pd.DataFrame, i: int, direction: str, cfg: StrategyConfig) -> DivergenceConfluence:
    if not cfg.enable_divergence:
        return DivergenceConfluence(0, "disabled", "none", "divergence disabled")
    pivots = _confirmed_pivots(df, i, direction, cfg)
    kind = "none"
    score = 0
    details = "no confirmed RSI divergence"
    if len(pivots) >= 2 and "rsi14" in pivots:
        a = pivots.iloc[-2]
        b = pivots.iloc[-1]
        if direction == "long":
            price_higher_low = float(b.low) > float(a.low)
            price_lower_low = float(b.low) < float(a.low)
            rsi_higher_low = float(b.rsi14) > float(a.rsi14)
            rsi_lower_low = float(b.rsi14) < float(a.rsi14)
            if price_higher_low and rsi_lower_low:
                kind = "hidden_bullish"
                score = 5
            elif price_lower_low and rsi_higher_low:
                kind = "regular_bullish"
                score = 4
            details = f"{kind}: price {a.low:.8f}->{b.low:.8f}, rsi {a.rsi14:.2f}->{b.rsi14:.2f}"
        else:
            price_lower_high = float(b.high) < float(a.high)
            price_higher_high = float(b.high) > float(a.high)
            rsi_lower_high = float(b.rsi14) < float(a.rsi14)
            rsi_higher_high = float(b.rsi14) > float(a.rsi14)
            if price_lower_high and rsi_higher_high:
                kind = "hidden_bearish"
                score = 5
            elif price_higher_high and rsi_lower_high:
                kind = "regular_bearish"
                score = 4
            details = f"{kind}: price {a.high:.8f}->{b.high:.8f}, rsi {a.rsi14:.2f}->{b.rsi14:.2f}"

    tag = predictive_tag(df, i, direction, cfg)
    if tag not in {"none", "neutral"}:
        score += 2
    return DivergenceConfluence(min(7, score), kind, tag, details)


def predictive_tag(df: pd.DataFrame, i: int, direction: str, cfg: StrategyConfig) -> str:
    if not cfg.enable_predictive_tags:
        return "disabled"
    row = df.iloc[i]
    z = float(row.close_zscore20) if np.isfinite(float(row.close_zscore20)) else 0.0
    if direction == "long":
        if "bb_lower" in row and np.isfinite(float(row.bb_lower)) and float(row.low) <= float(row.bb_lower) and float(row.close) > float(row.bb_lower):
            return "predictive_bollinger_reclaim"
        if z <= -cfg.predictive_zscore_threshold and float(row.close_position) > 0.5:
            return "predictive_zscore_reclaim"
    else:
        if "bb_upper" in row and np.isfinite(float(row.bb_upper)) and float(row.high) >= float(row.bb_upper) and float(row.close) < float(row.bb_upper):
            return "predictive_bollinger_rejection"
        if z >= cfg.predictive_zscore_threshold and float(row.close_position) < 0.5:
            return "predictive_zscore_rejection"
    return "neutral"
