from pathlib import Path

import pandas as pd
import pytest

from icr.backtester import Backtester
from icr.config import BacktestConfig, StrategyConfig
from icr.data_loader import load_csv, load_many
from icr.risk import create_trade
from icr.signals import Signal


def test_load_csv_rejects_missing_columns(tmp_path: Path):
    path = tmp_path / "bad.csv"
    pd.DataFrame({"timestamp": ["2026-01-01"], "open": [1]}).to_csv(path, index=False)
    with pytest.raises(ValueError, match="missing required columns"):
        load_csv(path)


def test_load_many_does_not_recurse(tmp_path: Path):
    nested = tmp_path / "nested"
    nested.mkdir()
    pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-01", periods=2, freq="h", tz="UTC"),
            "open": [1, 1],
            "high": [1.1, 1.1],
            "low": [0.9, 0.9],
            "close": [1, 1],
            "volume": [100, 100],
        }
    ).to_csv(nested / "hidden.csv", index=False)
    with pytest.raises(FileNotFoundError, match="No direct .csv"):
        load_many(tmp_path)


def test_same_candle_stop_first_policy():
    signal = Signal(
        symbol="TEST",
        timeframe="1H",
        index=0,
        timestamp=pd.Timestamp("2026-01-01T00:00:00Z"),
        direction="long",
        entry=100.0,
        stop=95.0,
        tp1=110.0,
        tp2=117.5,
        tp3=125.0,
        score=90,
        trend_score=20,
        impulse_score=20,
        pullback_score=15,
        compression_score=15,
        trigger_score=15,
        volume_score=10,
        rr_score=5,
        rr_to_tp1=2.0,
        reason="unit test",
        impulse_start=0,
        impulse_end=0,
        compression_start=0,
        compression_end=0,
    )
    trade = create_trade(signal, equity=10_000, bt_cfg=BacktestConfig(fee_rate=0.0, slippage_bps=0.0))
    df = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(["2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z"]),
            "open": [100, 100],
            "high": [101, 112],
            "low": [99, 94],
            "close": [100, 108],
            "ma25": [100, 100],
        }
    )
    exit_index = Backtester(StrategyConfig(), BacktestConfig(fee_rate=0.0, slippage_bps=0.0))._resolve_trade(df, trade, signal, start_index=1)
    assert exit_index == 1
    assert trade.status == "closed"
    assert trade.exits[0].reason == "stop"
    assert trade.total_r == -1.0
