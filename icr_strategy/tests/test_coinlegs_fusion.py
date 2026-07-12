from __future__ import annotations

import pandas as pd

from icr.coinlegs import parse_marketdetails_text, parse_number, records_to_frame, write_coinlegs_template, read_coinlegs_snapshot_csv
from icr.coinlegs_fusion import attach_coinlegs_to_markets, coinlegs_confluence_from_row, enrich_coinlegs_snapshot
from icr.coiling_pump import CoilConfig, score_coil_row
from icr.config import StrategyConfig
from icr.data_loader import MarketData


def test_parse_number_suffixes_and_percentages():
    assert parse_number("$1.25B") == 1_250_000_000
    assert parse_number("6.70%") == 6.7
    assert parse_number("−3.5%") == -3.5
    assert parse_number("n/a") is None


def test_parse_coinlegs_marketdetails_text():
    text = """
    SOLUSDT TradingView Summary 5m 15m 30m 1h 4h 1d 1w
    Price 150.25 Price Change 1.8%
    Volume 24H $850M
    Volume Change(in 1 Hour) 6.5%
    Volume Change(in 4 Hours) 14.0%
    Volume Change(in 6 Hours) 18.0%
    Open Interest $1.2B OI Change 4H 6.8%
    Funding Rate 0.012% Long/Short Ratio 1.08 24H Liq $22M
    """
    rec = parse_marketdetails_text(text, "SOLUSDT")
    assert rec.symbol == "SOLUSDT"
    assert rec.volume_change_4h_pct == 14.0
    assert rec.oi_usd == 1_200_000_000
    assert rec.long_short_ratio == 1.08


def test_coinlegs_enrichment_classifies_constructive_accumulation():
    df = records_to_frame([
        {
            "timestamp": "2026-01-01T00:00:00Z",
            "exchange": "Binance",
            "symbol": "SOLUSDT",
            "volume_change_1h_pct": 8.0,
            "volume_change_4h_pct": 18.0,
            "volume_change_6h_pct": 22.0,
            "price_change_pct": 1.5,
            "oi_change_1h_pct": 2.5,
            "oi_change_4h_pct": 8.5,
            "funding_rate_pct": 0.012,
            "long_short_ratio": 1.05,
            "volume_24h_usd": 850_000_000,
            "oi_usd": 1_100_000_000,
            "liquidation_24h_usd": 20_000_000,
        }
    ])
    enriched = enrich_coinlegs_snapshot(df)
    row = enriched.iloc[0]
    assert row.coinlegs_alpha_score >= 70
    assert row.coinlegs_bias in {"bullish_derivative_accumulation", "constructive_watch"}


def test_coinlegs_confluence_rewards_long_and_penalizes_trap():
    good = pd.Series({"coinlegs_alpha_score": 82.0, "coinlegs_bias": "bullish_derivative_accumulation", "coinlegs_details": "good"})
    trap = pd.Series({"coinlegs_alpha_score": 36.0, "coinlegs_bias": "crowded_trap_risk", "coinlegs_details": "bad"})
    assert coinlegs_confluence_from_row(good, "long").score_delta > 0
    assert coinlegs_confluence_from_row(trap, "long").score_delta < 0
    assert coinlegs_confluence_from_row(trap, "short").score_delta > 0


def test_attach_coinlegs_to_market_adds_constant_research_columns():
    candles = pd.DataFrame({
        "timestamp": pd.date_range("2026-01-01", periods=3, freq="4h", tz="UTC"),
        "open": [1.0, 1.01, 1.02],
        "high": [1.02, 1.03, 1.04],
        "low": [0.99, 1.00, 1.01],
        "close": [1.01, 1.02, 1.03],
        "volume": [100, 105, 110],
    })
    market = MarketData("SOLUSDT", "4h", candles)
    snap = enrich_coinlegs_snapshot(records_to_frame([{"symbol": "SOLUSDT", "volume_change_4h_pct": 20, "funding_rate_pct": 0.01, "long_short_ratio": 1.0}]))
    enriched_market = attach_coinlegs_to_markets([market], snap)[0]
    assert "coinlegs_alpha_score" in enriched_market.candles.columns
    assert enriched_market.candles["coinlegs_bias"].iloc[-1] in {"neutral", "constructive_watch", "bullish_derivative_accumulation"}


def test_write_and_read_coinlegs_template(tmp_path):
    path = write_coinlegs_template(tmp_path / "coinlegs_template.csv")
    df = read_coinlegs_snapshot_csv(path)
    assert not df.empty
    assert df.iloc[0].symbol == "SOLUSDT"


def test_coil_score_includes_coinlegs_boost():
    # Minimal row/history frame with enough indicators pre-filled for direct score_coil_row.
    n = 90
    frame = pd.DataFrame({
        "timestamp": pd.date_range("2026-01-01", periods=n, freq="4h", tz="UTC"),
        "open": [100.0] * n,
        "high": [101.0] * n,
        "low": [99.0] * n,
        "close": [100.0] * n,
        "volume": [1000.0] * n,
        "atr14": [1.0] * n,
        "ma7": [100.2] * n,
        "ma25": [100.0] * n,
        "ma99": [99.0] * n,
        "ma25_slope": [0.1] * n,
        "volume_ma20": [500.0] * n,
        "range": [1.0] * n,
        "bb_width": [0.02] * n,
        "prior_liquidity_high": [108.0] * n,
        "coinlegs_alpha_score": [82.0] * n,
        "coinlegs_bias": ["bullish_derivative_accumulation"] * n,
        "coinlegs_details": ["test"] * n,
    })
    cfg = CoilConfig(lookback=10, percentile_lookback=60)
    scored = score_coil_row(frame, 80, cfg)
    assert scored["coinlegs_boost"] > 0
    assert scored["coil_score"] >= scored["base_coil_score"]
