from pathlib import Path

import pandas as pd

from icr.backtester import Backtester
from icr.config import BacktestConfig, StrategyConfig
from icr.data_loader import load_csv
from icr.risk import position_size, r_multiple
from icr.sample_data import generate_sample_csv


def test_position_size_and_r_multiple():
    size, risk_amount = position_size(10_000, 0.01, 100, 95)
    assert risk_amount == 100
    assert size == 20
    assert r_multiple("long", 100, 95, 110) == 2
    assert r_multiple("short", 100, 105, 90) == 2


def test_backtester_runs_and_outputs_trade(tmp_path: Path):
    path = generate_sample_csv(tmp_path / "sample.csv")
    market = load_csv(path)
    result = Backtester(
        StrategyConfig(score_threshold=70, min_rr=1.5),
        BacktestConfig(initial_equity=10_000, risk_per_trade_pct=0.01, fee_rate=0.0, slippage_bps=0.0),
    ).run_one(market)
    assert result.summary["total_trades"] >= 1
    assert len(result.trades) == result.summary["total_trades"]
    assert not result.equity_curve.empty
    assert set(["timestamp", "equity", "trade_total_r"]).issubset(result.equity_curve.columns)
