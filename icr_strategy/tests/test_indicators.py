import pandas as pd

from icr.config import StrategyConfig
from icr.indicators import add_indicators, sma, atr


def test_sma_calculation():
    s = pd.Series([1, 2, 3, 4, 5])
    out = sma(s, 3)
    assert pd.isna(out.iloc[1])
    assert out.iloc[2] == 2
    assert out.iloc[4] == 4


def test_atr_basic_range():
    df = pd.DataFrame(
        {
            "high": [11, 12, 13],
            "low": [9, 10, 11],
            "close": [10, 11, 12],
        }
    )
    out = atr(df, 2)
    assert out.iloc[1] == 2
    assert out.iloc[2] == 2


def test_add_indicators_contains_expected_columns():
    n = 120
    df = pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC"),
            "open": [1 + i * 0.01 for i in range(n)],
            "high": [1.01 + i * 0.01 for i in range(n)],
            "low": [0.99 + i * 0.01 for i in range(n)],
            "close": [1 + i * 0.01 for i in range(n)],
            "volume": [1000] * n,
        }
    )
    out = add_indicators(df, StrategyConfig())
    for col in ["ma7", "ma25", "ma99", "atr14", "volume_ma20", "ma25_slope"]:
        assert col in out.columns
    assert pd.notna(out["ma99"].iloc[-1])
