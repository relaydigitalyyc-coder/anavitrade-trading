from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Literal

import numpy as np
import pandas as pd

from .config import StrategyConfig
from .coinlegs_fusion import coinlegs_confluence_from_row
from .divergence import divergence_confluence
from .ict import ict_confluence
from .mtf import mtf_confluence
from .structure import (
    Compression,
    Impulse,
    detect_compression,
    find_recent_impulse,
    is_bearish_trend,
    is_bullish_trend,
    valid_pullback,
)

Direction = Literal["long", "short"]


@dataclass(frozen=True)
class Signal:
    symbol: str
    timeframe: str
    index: int
    timestamp: pd.Timestamp
    direction: Direction
    entry: float
    stop: float
    tp1: float
    tp2: float
    tp3: float
    score: int
    trend_score: int
    impulse_score: int
    pullback_score: int
    compression_score: int
    trigger_score: int
    volume_score: int
    rr_score: int
    rr_to_tp1: float
    reason: str
    impulse_start: int
    impulse_end: int
    compression_start: int
    compression_end: int
    ict_score: int = 0
    divergence_score: int = 0
    mtf_score: int = 0
    coinlegs_score: int = 0
    coinlegs_alpha_score: float = float("nan")
    coinlegs_bias: str = "missing"
    ict_details: str = ""
    divergence_kind: str = "none"
    predictive_tag: str = "neutral"
    mtf_details: str = ""
    coinlegs_details: str = ""

    def to_dict(self) -> dict:
        out = asdict(self)
        out["timestamp"] = self.timestamp.isoformat()
        return out


def _volume_confirmation(row: pd.Series, baseline_volume: float, direction: Direction) -> int:
    if not np.isfinite(baseline_volume) or baseline_volume <= 0:
        return 0
    vol_ratio = float(row.volume) / baseline_volume
    volume_z = float(row.volume_zscore) if "volume_zscore" in row and np.isfinite(float(row.volume_zscore)) else 0.0
    if vol_ratio >= 1.35 or volume_z >= 1.5:
        return 10
    if vol_ratio >= 1.15 or volume_z >= 1.0:
        return 8
    if vol_ratio >= 1.00:
        return 6
    return 0


def _trigger_score(row: pd.Series, compression: Compression, direction: Direction, cfg: StrategyConfig) -> tuple[bool, int, str]:
    close = float(row.close)
    ma7 = float(row.ma7)
    if direction == "long":
        level = max(compression.high, ma7)
        close_position_ok = float(row.close_position) >= cfg.candle_close_position_threshold
        decisive = close > level and close_position_ok
        distance = close - level
        reason = f"long reclaim above {level:.8f}"
    else:
        level = min(compression.low, ma7)
        close_position_ok = float(row.close_position) <= (1.0 - cfg.candle_close_position_threshold)
        decisive = close < level and close_position_ok
        distance = level - close
        reason = f"short breakdown below {level:.8f}"

    if not decisive:
        return False, 0, "no decisive reclaim/breakdown"
    atr = float(row.atr14)
    score = 10
    if atr > 0 and distance >= 0.20 * atr:
        score += 3
    if float(row.body_ratio) >= 0.50:
        score += 2
    if "displacement" in row and np.isfinite(float(row.displacement)) and float(row.displacement) >= 1.0:
        score += 1
    return True, min(15, score), reason


def _targets(direction: Direction, entry: float, stop: float, impulse: Impulse, cfg: StrategyConfig) -> tuple[float, float, float, float]:
    risk = abs(entry - stop)
    if risk <= 0:
        return float("nan"), float("nan"), float("nan"), float("nan")
    if direction == "long":
        tp1 = max(impulse.extreme, entry + cfg.tp1_r * risk)
        tp2 = max(entry + cfg.tp2_r * risk, entry + 0.75 * impulse.range_value)
        tp3 = max(entry + 5.0 * risk, entry + impulse.range_value)
        rr_to_tp1 = (tp1 - entry) / risk
    else:
        tp1 = min(impulse.extreme, entry - cfg.tp1_r * risk)
        tp2 = min(entry - cfg.tp2_r * risk, entry - 0.75 * impulse.range_value)
        tp3 = min(entry - 5.0 * risk, entry - impulse.range_value)
        rr_to_tp1 = (entry - tp1) / risk
    return tp1, tp2, tp3, rr_to_tp1


def _passes_optional_execution_filters(row: pd.Series, cfg: StrategyConfig) -> bool:
    if cfg.min_volume_ma20 is not None:
        if "volume_ma20" not in row or not np.isfinite(float(row.volume_ma20)) or float(row.volume_ma20) < cfg.min_volume_ma20:
            return False
    # CSVs can optionally include bid/ask or spread_bps. No spread data means the filter is skipped.
    if cfg.max_spread_bps is not None:
        spread_bps = None
        if "spread_bps" in row and np.isfinite(float(row.spread_bps)):
            spread_bps = float(row.spread_bps)
        elif "bid" in row and "ask" in row and np.isfinite(float(row.bid)) and np.isfinite(float(row.ask)) and float(row.close) > 0:
            spread_bps = (float(row.ask) - float(row.bid)) / float(row.close) * 10_000
        if spread_bps is not None and spread_bps > cfg.max_spread_bps:
            return False
    return True


def build_signal(
    df: pd.DataFrame,
    i: int,
    symbol: str,
    timeframe: str,
    direction: Direction,
    cfg: StrategyConfig,
) -> Signal | None:
    if direction == "long" and not cfg.allow_longs:
        return None
    if direction == "short" and not cfg.allow_shorts:
        return None

    row = df.iloc[i]
    coil_gate_delta = 0
    if cfg.enable_coil_gate:
        coil_value = float(row.coil_score) if "coil_score" in row and np.isfinite(float(row.coil_score)) else float("nan")
        if not np.isfinite(coil_value) or coil_value < cfg.min_coil_score:
            return None
        coil_gate_delta = int(max(0, min(cfg.coil_score_bonus_cap, round((coil_value - cfg.min_coil_score) / 5.0))))
    if not _passes_optional_execution_filters(row, cfg):
        return None

    trend_ok = is_bullish_trend(df, i, cfg) if direction == "long" else is_bearish_trend(df, i, cfg)
    if not trend_ok:
        return None
    trend_score = 20

    impulse = find_recent_impulse(df, i, direction, cfg)
    if impulse is None:
        return None

    pullback_ok, pullback_score, pullback_reason = valid_pullback(df, i, impulse, cfg)
    if not pullback_ok:
        return None

    compression = detect_compression(df, i, direction, cfg)
    if compression is None:
        return None
    if compression.end <= impulse.end:
        # Compression must resolve after the impulse, otherwise the setup is not sequential.
        return None

    if not np.isfinite(float(row.atr14)) or not np.isfinite(float(row.ma7)):
        return None
    trigger_ok, trigger_score, trigger_reason = _trigger_score(row, compression, direction, cfg)
    if not trigger_ok:
        return None

    volume_score = _volume_confirmation(row, compression.avg_volume, direction)
    if volume_score == 0:
        return None

    entry = float(row.close)
    atr_buffer = cfg.stop_atr_buffer * float(row.atr14)
    if direction == "long":
        stop = float(compression.low) - atr_buffer
        if stop >= entry:
            return None
    else:
        stop = float(compression.high) + atr_buffer
        if stop <= entry:
            return None

    tp1, tp2, tp3, rr_to_tp1 = _targets(direction, entry, stop, impulse, cfg)
    risk = abs(entry - stop)
    if risk <= 0:
        return None
    rr_available = (tp2 - entry) / risk if direction == "long" else (entry - tp2) / risk
    if not np.isfinite(rr_available) or rr_available < cfg.min_rr:
        rr_score = 0
    elif rr_available >= 4.0:
        rr_score = 5
    elif rr_available >= 3.0:
        rr_score = 4
    else:
        rr_score = 3

    ict = ict_confluence(df, i, direction, impulse, cfg)
    div = divergence_confluence(df, i, direction, cfg)
    mtf = mtf_confluence(df, i, direction, cfg)
    coinlegs = coinlegs_confluence_from_row(row, direction) if cfg.enable_coinlegs else coinlegs_confluence_from_row(pd.Series(dtype=object), direction)
    coinlegs_delta = max(-cfg.coinlegs_score_cap, min(cfg.coinlegs_score_cap, coinlegs.score_delta)) if cfg.enable_coinlegs else 0

    total_score = (
        trend_score
        + impulse.score
        + pullback_score
        + compression.score
        + trigger_score
        + volume_score
        + rr_score
        + ict.score_delta
        + div.score_delta
        + mtf.score_delta
        + coinlegs_delta
        + coil_gate_delta
    )
    total_score = int(max(0, min(100, total_score)))
    if total_score < cfg.score_threshold or rr_available < cfg.min_rr:
        return None

    reason_parts = [
        trigger_reason,
        pullback_reason,
        f"ICT({ict.score_delta}): {ict.details}",
        f"DIV({div.score_delta}): {div.kind}/{div.predictive_tag}",
        f"MTF({mtf.score_delta}): {mtf.details}",
        f"COINLEGS({coinlegs_delta}): alpha={coinlegs.alpha_score}, bias={coinlegs.bias}, {coinlegs.details}",
        f"COIL({coil_gate_delta}): score={float(row.coil_score) if 'coil_score' in row and np.isfinite(float(row.coil_score)) else 'missing'}",
        f"score={total_score}",
    ]

    return Signal(
        symbol=symbol,
        timeframe=timeframe,
        index=i,
        timestamp=pd.Timestamp(row.timestamp),
        direction=direction,
        entry=entry,
        stop=stop,
        tp1=tp1,
        tp2=tp2,
        tp3=tp3,
        score=total_score,
        trend_score=trend_score,
        impulse_score=impulse.score,
        pullback_score=pullback_score,
        compression_score=compression.score,
        trigger_score=trigger_score,
        volume_score=volume_score,
        rr_score=rr_score,
        rr_to_tp1=rr_to_tp1,
        reason="; ".join(reason_parts),
        impulse_start=impulse.start,
        impulse_end=impulse.end,
        compression_start=compression.start,
        compression_end=compression.end,
        ict_score=ict.score_delta,
        divergence_score=div.score_delta,
        mtf_score=mtf.score_delta,
        coinlegs_score=coinlegs_delta,
        coinlegs_alpha_score=coinlegs.alpha_score,
        coinlegs_bias=coinlegs.bias,
        ict_details=ict.details,
        divergence_kind=div.kind,
        predictive_tag=div.predictive_tag,
        mtf_details=mtf.details,
        coinlegs_details=coinlegs.details,
    )


def find_signal(df: pd.DataFrame, i: int, symbol: str, timeframe: str, cfg: StrategyConfig) -> Signal | None:
    long_signal = build_signal(df, i, symbol, timeframe, "long", cfg)
    short_signal = build_signal(df, i, symbol, timeframe, "short", cfg)
    if long_signal and short_signal:
        return long_signal if long_signal.score >= short_signal.score else short_signal
    return long_signal or short_signal
