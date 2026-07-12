from __future__ import annotations

from dataclasses import dataclass, asdict

import pandas as pd

from .signals import Signal
from .risk import Trade


@dataclass(frozen=True)
class MetaLabel:
    symbol: str
    timeframe: str
    entry_time: str
    direction: str
    score: int
    total_r: float
    label_follow: int
    label_fade: int
    label_quality: str
    features: dict

    def to_dict(self) -> dict:
        out = asdict(self)
        # Keep CSV-friendly stable field order while preserving nested feature info.
        out["features"] = str(self.features)
        return out


def make_meta_label(signal: Signal, trade: Trade) -> MetaLabel:
    label_follow = 1 if trade.total_r > 0 else 0
    label_fade = 1 if trade.total_r < 0 else 0
    if trade.total_r >= 3:
        quality = "A_runner"
    elif trade.total_r >= 1:
        quality = "valid_follow"
    elif trade.total_r > -0.25:
        quality = "scratch"
    else:
        quality = "avoid_or_fade"
    features = {
        "trend_score": signal.trend_score,
        "impulse_score": signal.impulse_score,
        "pullback_score": signal.pullback_score,
        "compression_score": signal.compression_score,
        "trigger_score": signal.trigger_score,
        "volume_score": signal.volume_score,
        "rr_score": signal.rr_score,
        "ict_score": getattr(signal, "ict_score", 0),
        "divergence_score": getattr(signal, "divergence_score", 0),
        "mtf_score": getattr(signal, "mtf_score", 0),
        "rr_to_tp1": signal.rr_to_tp1,
    }
    return MetaLabel(
        symbol=trade.symbol,
        timeframe=trade.timeframe,
        entry_time=trade.entry_time.isoformat(),
        direction=trade.direction,
        score=trade.score,
        total_r=trade.total_r,
        label_follow=label_follow,
        label_fade=label_fade,
        label_quality=quality,
        features=features,
    )


def labels_frame(signals: list[Signal], trades: list[Trade]) -> pd.DataFrame:
    rows = []
    by_key = {(s.symbol, s.timeframe, s.index, s.direction): s for s in signals}
    for t in trades:
        sig = by_key.get((t.symbol, t.timeframe, t.entry_index, t.direction))
        if sig is not None:
            rows.append(make_meta_label(sig, t).to_dict())
    return pd.DataFrame(rows)
