import pandas as pd

from icr.config import StrategyConfig
from icr.divergence import predictive_tag
from icr.ict import in_ny_killzone, ote_check
from icr.indicators import add_indicators
from icr.mtf import mtf_confluence
from icr.structure import Impulse
from icr.universe import currency_strength_from_returns, inverse_symbol, split_fx_symbol


def test_currency_strength_handles_inverse_pairs():
    rows = currency_strength_from_returns({"GBPUSD": 0.02, "GBPAUD": 0.01, "EURGBP": -0.01})
    scores = {r.currency: r.score for r in rows}
    assert scores["GBP"] > scores["USD"]
    assert scores["GBP"] > scores["EUR"]
    assert split_fx_symbol("GBPUSD") == ("GBP", "USD")
    assert inverse_symbol("EURGBP") == "GBPEUR"


def test_ote_zone_for_long_impulse():
    cfg = StrategyConfig(enable_mtf=False)
    df = pd.DataFrame({"close": [121.0]})
    impulse = Impulse("long", 0, 10, origin=100.0, extreme=160.0, range_value=60.0, avg_volume=1000, score=20)
    ok, details = ote_check(df, 0, "long", impulse, cfg)
    assert ok
    assert "ote=" in details


def test_ny_killzone_detection():
    assert in_ny_killzone(pd.Timestamp("2026-01-05T13:00:00Z"))  # 08:00 NY in winter
    assert not in_ny_killzone(pd.Timestamp("2026-01-05T04:00:00Z"))


def test_predictive_bollinger_tag():
    cfg = StrategyConfig()
    df = pd.DataFrame(
        {
            "low": [90.0],
            "high": [101.0],
            "close": [96.0],
            "close_position": [0.7],
            "close_zscore20": [-2.5],
            "bb_lower": [95.0],
            "bb_upper": [105.0],
        }
    )
    assert predictive_tag(df, 0, "long", cfg) == "predictive_bollinger_reclaim"


def test_mtf_confluence_returns_object_on_sample_like_data():
    n = 260
    df = pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-01", periods=n, freq="15min", tz="UTC"),
            "open": [100 + i * 0.1 for i in range(n)],
            "high": [101 + i * 0.1 for i in range(n)],
            "low": [99 + i * 0.1 for i in range(n)],
            "close": [100.5 + i * 0.1 for i in range(n)],
            "volume": [1000] * n,
        }
    )
    cfg = StrategyConfig(mtf_timeframes=("1h",), mtf_required_agreement=0)
    enriched = add_indicators(df, cfg)
    out = mtf_confluence(enriched, len(enriched) - 1, "long", cfg)
    assert isinstance(out.score_delta, int)
    assert out.details
