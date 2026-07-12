from pathlib import Path

import pandas as pd

from icr.backtester import Backtester
from icr.config import BacktestConfig, StrategyConfig
from icr.data_loader import load_many
from icr.reporting import write_reports
from icr.sample_data import generate_sample_csv
from icr.universe import asset_class, risk_cluster


def test_universe_asset_class_and_risk_cluster():
    assert asset_class("EURUSD") == "fx"
    assert asset_class("XAUUSD") == "metals"
    assert asset_class("BTCUSDT") == "crypto"
    assert risk_cluster("BTCUSDT") == "crypto_beta"
    assert risk_cluster("EURUSD").startswith("fx_usd_")


def test_finished_repo_writes_extended_reports(tmp_path: Path):
    generate_sample_csv(tmp_path / "BTCUSDT_1h.csv")
    markets = load_many(tmp_path)
    result = Backtester(StrategyConfig(score_threshold=70, min_rr=1.5), BacktestConfig(output_dir=tmp_path)).run_many(markets)
    paths = write_reports(result, tmp_path / "out")
    required = {
        "skipped_signals",
        "session_performance",
        "score_bucket_stats",
        "target_path_stats",
        "regime_report",
        "asset_class_stats",
        "config_snapshot",
    }
    assert required.issubset(paths)
    for name in required:
        assert paths[name].exists(), name
    trades = pd.read_csv(paths["trades"])
    assert "asset_class" in trades.columns
