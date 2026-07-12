from __future__ import annotations

import io
import zipfile

import pandas as pd

from icr.binance_data import archive_zip_url, iter_months, klines_raw_to_ohlcv, read_archive_zip_bytes
from icr.coiling_pump import CoilConfig, coil_candidates_for_market, latest_coil_scoreboard, run_coil_research
from icr.config import StrategyConfig
from icr.data_loader import MarketData


def test_iter_months_and_archive_url() -> None:
    assert iter_months("2024-11", "2025-02") == ["2024-11", "2024-12", "2025-01", "2025-02"]
    assert archive_zip_url("solusdt", "4h", "2025-01").endswith("/SOLUSDT/4h/SOLUSDT-4h-2025-01.zip")


def test_klines_microsecond_timestamp_conversion() -> None:
    raw = pd.DataFrame(
        [
            [1735689600000000, "10", "11", "9", "10.5", "100", 1735703999999999, "0", 1, "0", "0", "0"],
            [1735704000000000, "10.5", "12", "10", "11.5", "120", 1735718399999999, "0", 1, "0", "0", "0"],
        ]
    )
    out = klines_raw_to_ohlcv(raw)
    assert list(out.columns) == ["timestamp", "open", "high", "low", "close", "volume"]
    assert out["timestamp"].iloc[0].year == 2025
    assert float(out["close"].iloc[-1]) == 11.5


def test_read_archive_zip_bytes() -> None:
    csv_bytes = b"1735689600000,10,11,9,10.5,100,1735703999999,0,1,0,0,0\n"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w") as zf:
        zf.writestr("TEST-4h-2025-01.csv", csv_bytes)
    out = read_archive_zip_bytes(buf.getvalue())
    assert len(out) == 1
    assert float(out.iloc[0].high) == 11.0


def _synthetic_coil_pump_market() -> MarketData:
    rows = []
    ts = pd.Timestamp("2024-01-01", tz="UTC")
    price = 10.0
    for i in range(280):
        # Uptrend, then contracting wedge, then pump.
        if i < 170:
            price *= 1.0015
            spread = 0.018
            volume = 1000 + i
        elif i < 235:
            progress = i - 170
            price *= 1.0006
            spread = max(0.003, 0.018 - progress * 0.00022)
            volume = 650 - progress * 3
        else:
            price *= 1.012
            spread = 0.02
            volume = 1400 + i * 3
        open_price = price * (1 - spread * 0.25)
        close = price
        high = price * (1 + spread)
        low = price * (1 - spread * 0.8)
        rows.append({"timestamp": ts + pd.Timedelta(hours=4 * i), "open": open_price, "high": high, "low": low, "close": close, "volume": max(10.0, volume)})
    return MarketData("COILUSDT", "4h", pd.DataFrame(rows))


def test_coil_research_finds_candidates() -> None:
    market = _synthetic_coil_pump_market()
    strategy_cfg = StrategyConfig()
    coil_cfg = CoilConfig(threshold=60, pump_threshold=0.08, min_history_bars=120, percentile_lookback=90)
    candidates = coil_candidates_for_market(market, strategy_cfg, coil_cfg)
    assert not candidates.empty
    assert "coil_score" in candidates.columns
    assert candidates["mfe_pct"].max() > 8.0
    latest = latest_coil_scoreboard([market], strategy_cfg, coil_cfg)
    assert len(latest) == 1
    bundle = run_coil_research([market], strategy_cfg, coil_cfg)
    assert bundle["coil_summary"]["markets"] == 1
