from pathlib import Path

from icr.config import StrategyConfig
from icr.data_loader import load_csv
from icr.matrix import latest_matrix, currency_strength_frame
from icr.sample_data import generate_sample_csv


def test_matrix_outputs_latest_snapshot(tmp_path: Path):
    path = generate_sample_csv(tmp_path / "GBPUSD_1h.csv")
    market = load_csv(path, timeframe="1H")
    cfg = StrategyConfig(enable_mtf=False)
    frame = latest_matrix([market], cfg)
    assert len(frame) == 1
    assert {"symbol", "trend", "long_predictive_tag", "short_predictive_tag"}.issubset(frame.columns)


def test_currency_strength_frame_is_csv_friendly(tmp_path: Path):
    path = generate_sample_csv(tmp_path / "GBPUSD_1h.csv")
    market = load_csv(path, timeframe="1H")
    frame = currency_strength_frame([market])
    assert {"currency", "score", "pair_count"}.issubset(frame.columns)
