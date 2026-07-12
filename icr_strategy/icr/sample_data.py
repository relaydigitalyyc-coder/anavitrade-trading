from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


def generate_sample_csv(path: str | Path, bars: int = 260, seed: int = 7) -> Path:
    """Create deterministic OHLCV data with one clean ICR-style long setup."""
    rng = np.random.default_rng(seed)
    path = Path(path).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)

    timestamps = pd.date_range("2026-01-01", periods=bars, freq="h", tz="UTC")
    close = np.zeros(bars)
    close[0] = 1.0
    for i in range(1, bars):
        drift = 0.0008
        close[i] = close[i - 1] * (1 + drift + rng.normal(0, 0.0015))

    # Build a visible bullish impulse, then pullback/compression, then reclaim.
    start = 120
    impulse_steps = np.linspace(close[start - 1] * 1.01, close[start - 1] * 1.18, 8)
    close[start : start + 8] = impulse_steps
    comp_base = impulse_steps[-1]
    pullback = np.array([0.985, 0.972, 0.965, 0.960, 0.958, 0.961, 0.963, 0.964, 0.966, 0.967]) * comp_base
    close[start + 8 : start + 18] = pullback
    close[start + 18] = comp_base * 1.012
    for i in range(start + 19, bars):
        close[i] = close[i - 1] * (1 + 0.0015 + rng.normal(0, 0.002))

    open_ = np.r_[close[0], close[:-1]] * (1 + rng.normal(0, 0.0008, bars))
    high = np.maximum(open_, close) * (1 + rng.uniform(0.001, 0.004, bars))
    low = np.minimum(open_, close) * (1 - rng.uniform(0.001, 0.004, bars))
    volume = rng.normal(1000, 90, bars).clip(100)
    volume[start : start + 8] *= 2.2
    volume[start + 8 : start + 18] *= 0.75
    volume[start + 18] *= 1.7

    df = pd.DataFrame(
        {
            "timestamp": timestamps,
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
        }
    )
    df.to_csv(path, index=False)
    return path

