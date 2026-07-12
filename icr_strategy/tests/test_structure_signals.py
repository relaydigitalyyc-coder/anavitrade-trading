from pathlib import Path

import pandas as pd

from icr.config import StrategyConfig
from icr.data_loader import load_csv
from icr.indicators import add_indicators
from icr.sample_data import generate_sample_csv
from icr.signals import find_signal
from icr.structure import detect_compression, find_recent_impulse, valid_pullback


def prepared_sample(tmp_path: Path):
    path = generate_sample_csv(tmp_path / "sample.csv")
    market = load_csv(path)
    cfg = StrategyConfig(score_threshold=70, min_rr=1.5)
    df = add_indicators(market.candles, cfg)
    return df, cfg, market


def test_impulse_detection_on_sample(tmp_path):
    df, cfg, _ = prepared_sample(tmp_path)
    signal_index = 138
    impulse = find_recent_impulse(df, signal_index, "long", cfg)
    assert impulse is not None
    assert impulse.direction == "long"
    assert impulse.range_value > 0
    assert impulse.score > 0


def test_pullback_and_compression_on_sample(tmp_path):
    df, cfg, _ = prepared_sample(tmp_path)
    signal_index = 138
    impulse = find_recent_impulse(df, signal_index, "long", cfg)
    assert impulse is not None
    ok, score, _ = valid_pullback(df, signal_index, impulse, cfg)
    assert ok
    assert score >= 10
    compression = detect_compression(df, signal_index, "long", cfg)
    assert compression is not None
    assert compression.high > compression.low


def test_find_signal_on_sample(tmp_path):
    df, cfg, market = prepared_sample(tmp_path)
    found = None
    for i in range(110, 170):
        found = find_signal(df, i, market.symbol, market.timeframe, cfg)
        if found is not None:
            break
    assert found is not None
    assert found.direction == "long"
    assert found.entry > found.stop
    assert found.score >= cfg.score_threshold
