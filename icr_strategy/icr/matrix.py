from __future__ import annotations

import pandas as pd

from .config import StrategyConfig
from .data_loader import MarketData
from .divergence import predictive_tag
from .indicators import add_indicators
from .structure import is_bearish_trend, is_bullish_trend
from .universe import returns_from_markets, currency_strength_from_returns


def latest_matrix(markets: list[MarketData], cfg: StrategyConfig) -> pd.DataFrame:
    """Create a compact scanner-style snapshot for the latest candle of each symbol.

    This is the research equivalent of the remembered matrix UI: direction bias,
    trend state, volume/z-score context, predictive tags, and latest close. It is
    intentionally CSV-based instead of a broker UI so it remains offline and safe.
    """
    rows: list[dict] = []
    for market in markets:
        df = add_indicators(market.candles, cfg)
        if df.empty:
            continue
        i = len(df) - 1
        row = df.iloc[i]
        bull = is_bullish_trend(df, i, cfg)
        bear = is_bearish_trend(df, i, cfg)
        if bull:
            trend = "bullish"
        elif bear:
            trend = "bearish"
        else:
            trend = "neutral"
        rows.append(
            {
                "symbol": market.symbol,
                "timeframe": market.timeframe,
                "timestamp": pd.Timestamp(row.timestamp).isoformat(),
                "close": float(row.close),
                "trend": trend,
                "ma7": float(row.ma7) if pd.notna(row.ma7) else None,
                "ma25": float(row.ma25) if pd.notna(row.ma25) else None,
                "ma99": float(row.ma99) if pd.notna(row.ma99) else None,
                "rsi14": float(row.rsi14) if pd.notna(row.rsi14) else None,
                "volume_zscore": float(row.volume_zscore) if pd.notna(row.volume_zscore) else None,
                "close_zscore20": float(row.close_zscore20) if pd.notna(row.close_zscore20) else None,
                "long_predictive_tag": predictive_tag(df, i, "long", cfg),
                "short_predictive_tag": predictive_tag(df, i, "short", cfg),
            }
        )
    return pd.DataFrame(rows)


def currency_strength_frame(markets: list[MarketData], lookback: int = 20) -> pd.DataFrame:
    returns = returns_from_markets(markets, lookback=lookback)
    rows = currency_strength_from_returns(returns)
    return pd.DataFrame(
        [{"currency": r.currency, "score": r.score, "pair_count": r.pair_count} for r in rows],
        columns=["currency", "score", "pair_count"],
    )
