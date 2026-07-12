from __future__ import annotations

"""Derivatives-intelligence fusion for Coinlegs snapshots.

The scoring is intentionally conservative. Coinlegs-like derivatives metrics are
used as an evidence layer around the April ICR + HTF coil engine, not as a trade
trigger by themselves.
"""

import logging
from dataclasses import dataclass
from typing import Iterable

import numpy as np
import pandas as pd

from .coinlegs import CANONICAL_COLUMNS, normalize_symbol, read_coinlegs_snapshot_csv
from .data_loader import MarketData

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class CoinlegsConfluence:
    score_delta: int
    alpha_score: float
    bias: str
    details: str


def _num(row: pd.Series, col: str, default: float = np.nan) -> float:
    if col not in row:
        return default
    try:
        value = float(row[col])
    except (TypeError, ValueError):
        return default
    return value if np.isfinite(value) else default


def _clip(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    if not np.isfinite(value):
        return 50.0
    return float(max(lo, min(hi, value)))


def _component_from_signed_pct(value: float, bullish_center: float, max_abs: float, invert: bool = False) -> float:
    if not np.isfinite(value):
        return 50.0
    raw = 50.0 + 50.0 * ((value - bullish_center) / max_abs)
    if invert:
        raw = 100.0 - raw
    return _clip(raw)


def enrich_coinlegs_snapshot(snapshot: pd.DataFrame) -> pd.DataFrame:
    if snapshot.empty:
        cols = CANONICAL_COLUMNS + [
            "demand_velocity_score",
            "leverage_expansion_score",
            "funding_sanity_score",
            "crowding_sanity_score",
            "liquidation_activity_score",
            "coinlegs_alpha_score",
            "coinlegs_bias",
            "coinlegs_details",
        ]
        return pd.DataFrame(columns=cols)

    df = snapshot.copy()
    for col in CANONICAL_COLUMNS:
        if col not in df.columns:
            df[col] = np.nan if col not in {"timestamp", "exchange", "symbol", "source_url"} else ""
    df["symbol"] = df["symbol"].map(normalize_symbol)
    numeric = [c for c in CANONICAL_COLUMNS if c not in {"timestamp", "exchange", "symbol", "source_url"}]
    for col in numeric:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    demand = []
    leverage = []
    funding_sanity = []
    crowding_sanity = []
    liquidation_activity = []
    alpha = []
    bias = []
    details = []

    for _, row in df.iterrows():
        v1 = _num(row, "volume_change_1h_pct")
        v4 = _num(row, "volume_change_4h_pct")
        v6 = _num(row, "volume_change_6h_pct")
        v24 = _num(row, "volume_change_24h_pct")
        pchg = _num(row, "price_change_pct")
        oi1 = _num(row, "oi_change_1h_pct")
        oi4 = _num(row, "oi_change_4h_pct")
        funding = _num(row, "funding_rate_pct")
        pred_funding = _num(row, "predicted_funding_rate_pct")
        ls = _num(row, "long_short_ratio")
        liq1 = _num(row, "liquidation_1h_usd")
        liq4 = _num(row, "liquidation_4h_usd")
        liq24 = _num(row, "liquidation_24h_usd")
        volume_usd = _num(row, "volume_24h_usd")
        oi_usd = _num(row, "oi_usd")

        volume_stack = np.nanmean([v for v in [v1, v4, v6, v24] if np.isfinite(v)]) if any(np.isfinite(v) for v in [v1, v4, v6, v24]) else np.nan
        demand_score = _component_from_signed_pct(volume_stack, bullish_center=0.0, max_abs=40.0)
        if np.isfinite(pchg) and abs(pchg) <= 3.0 and np.isfinite(volume_stack) and volume_stack > 8.0:
            demand_score = min(100.0, demand_score + 10.0)  # participation while price is still coiled

        leverage_stack = np.nanmean([v for v in [oi1, oi4] if np.isfinite(v)]) if any(np.isfinite(v) for v in [oi1, oi4]) else np.nan
        leverage_score = _component_from_signed_pct(leverage_stack, bullish_center=0.0, max_abs=20.0)
        if np.isfinite(leverage_stack) and leverage_stack > 35.0:
            leverage_score = 45.0  # too much new leverage before reclaim can be trap fuel

        fund = np.nanmean([v for v in [funding, pred_funding] if np.isfinite(v)]) if any(np.isfinite(v) for v in [funding, pred_funding]) else np.nan
        if not np.isfinite(fund):
            fund_score = 55.0
        elif -0.03 <= fund <= 0.03:
            fund_score = 92.0
        elif -0.08 <= fund < -0.03:
            fund_score = 78.0  # shorts paying is okay for squeeze continuation
        elif 0.03 < fund <= 0.08:
            fund_score = 62.0
        else:
            fund_score = 28.0  # overheated crowding

        if not np.isfinite(ls):
            crowd_score = 55.0
        elif 0.75 <= ls <= 1.35:
            crowd_score = 88.0
        elif 0.55 <= ls < 0.75:
            crowd_score = 74.0
        elif 1.35 < ls <= 1.80:
            crowd_score = 52.0
        else:
            crowd_score = 25.0

        liq_sum = np.nansum([v for v in [liq1, liq4, liq24] if np.isfinite(v)])
        scale = max(volume_usd if np.isfinite(volume_usd) else 0.0, oi_usd if np.isfinite(oi_usd) else 0.0, 1.0)
        liq_ratio = liq_sum / scale
        liq_score = _clip(50.0 + min(liq_ratio, 0.04) / 0.04 * 45.0) if liq_sum > 0 else 50.0

        alpha_score = (
            0.32 * demand_score
            + 0.22 * leverage_score
            + 0.18 * fund_score
            + 0.16 * crowd_score
            + 0.12 * liq_score
        )
        alpha_score = _clip(alpha_score)

        if alpha_score >= 75 and demand_score >= 68 and fund_score >= 55 and crowd_score >= 50:
            b = "bullish_derivative_accumulation"
        elif alpha_score >= 62:
            b = "constructive_watch"
        elif fund_score < 35 or crowd_score < 35:
            b = "crowded_trap_risk"
        elif demand_score < 38 and leverage_score < 45:
            b = "dead_or_distribution"
        else:
            b = "neutral"

        demand.append(round(demand_score, 3))
        leverage.append(round(leverage_score, 3))
        funding_sanity.append(round(fund_score, 3))
        crowding_sanity.append(round(crowd_score, 3))
        liquidation_activity.append(round(liq_score, 3))
        alpha.append(round(alpha_score, 3))
        bias.append(b)
        details.append(
            f"demand={demand_score:.1f}, leverage={leverage_score:.1f}, funding={fund_score:.1f}, crowd={crowd_score:.1f}, liq={liq_score:.1f}, bias={b}"
        )

    df["demand_velocity_score"] = demand
    df["leverage_expansion_score"] = leverage
    df["funding_sanity_score"] = funding_sanity
    df["crowding_sanity_score"] = crowding_sanity
    df["liquidation_activity_score"] = liquidation_activity
    df["coinlegs_alpha_score"] = alpha
    df["coinlegs_bias"] = bias
    df["coinlegs_details"] = details
    return df


def read_and_enrich_coinlegs_snapshot(path: str) -> pd.DataFrame:
    return enrich_coinlegs_snapshot(read_coinlegs_snapshot_csv(path))


def coinlegs_confluence_from_row(row: pd.Series, direction: str) -> CoinlegsConfluence:
    if "coinlegs_alpha_score" not in row:
        return CoinlegsConfluence(0, np.nan, "missing", "no Coinlegs snapshot columns")
    alpha = _num(row, "coinlegs_alpha_score")
    bias = str(row.get("coinlegs_bias", "neutral"))
    details = str(row.get("coinlegs_details", ""))
    if not np.isfinite(alpha):
        return CoinlegsConfluence(0, np.nan, bias, "Coinlegs row present but alpha missing")

    if direction == "long":
        if bias == "bullish_derivative_accumulation" and alpha >= 75:
            delta = 10
        elif alpha >= 70:
            delta = 7
        elif alpha >= 62:
            delta = 4
        elif bias == "crowded_trap_risk":
            delta = -8
        elif bias == "dead_or_distribution" or alpha < 42:
            delta = -6
        else:
            delta = 0
    else:
        # For shorts, crowded longs are useful. Bullish accumulation is not.
        if bias == "crowded_trap_risk":
            delta = 8
        elif bias == "dead_or_distribution" and alpha < 45:
            delta = 5
        elif bias == "bullish_derivative_accumulation":
            delta = -8
        elif alpha >= 70:
            delta = -4
        else:
            delta = 0
    return CoinlegsConfluence(int(delta), float(alpha), bias, details)


def attach_coinlegs_to_markets(
    markets: Iterable[MarketData],
    enriched_snapshot: pd.DataFrame,
    max_data_age_days: float = 7.0,
) -> list[MarketData]:
    """Attach Coinlegs scoring to market candles with temporal alignment.

    Coinlegs snapshot data is ONLY applied to candles whose timestamp is within
    ``max_data_age_days`` of the snapshot timestamp. Candles older than that will
    not receive Coinlegs columns — preventing a 2026 snapshot from being
    retroactively applied to 2024 candles.

    Parameters
    ----------
    markets:
        Iterable of MarketData instances with candle OHLCV data.
    enriched_snapshot:
        Enriched Coinlegs snapshot DataFrame (output of
        ``enrich_coinlegs_snapshot``). Must contain a ``timestamp`` column and a
        ``symbol`` column.
    max_data_age_days:
        Maximum age in days between the snapshot timestamp and the candle
        timestamp for Coinlegs data to be applied. Default 7.0.

    Returns
    -------
    list[MarketData]:
        Markets with Coinlegs columns attached where temporally aligned.
        Markets whose candles are all too old for the snapshot are returned
        unchanged (no Coinlegs columns).
    """
    snapshot = enriched_snapshot.copy()
    if snapshot.empty:
        return list(markets)
    snapshot["symbol"] = snapshot["symbol"].map(normalize_symbol)

    # Determine the snapshot reference timestamp (latest across all rows).
    snap_ts = pd.to_datetime(snapshot["timestamp"], utc=True, errors="coerce").dropna()
    if snap_ts.empty:
        LOGGER.warning("Coinlegs snapshot has no valid timestamps — skipping temporal alignment")
        return list(markets)
    snapshot_reference_ts = snap_ts.max()

    by_symbol = snapshot.drop_duplicates("symbol", keep="last").set_index("symbol")
    out: list[MarketData] = []
    add_cols = [
        "coinlegs_alpha_score",
        "coinlegs_bias",
        "coinlegs_details",
        "demand_velocity_score",
        "leverage_expansion_score",
        "funding_sanity_score",
        "crowding_sanity_score",
        "liquidation_activity_score",
        "volume_change_1h_pct",
        "volume_change_4h_pct",
        "volume_change_6h_pct",
        "volume_change_24h_pct",
        "oi_change_1h_pct",
        "oi_change_4h_pct",
        "funding_rate_pct",
        "predicted_funding_rate_pct",
        "long_short_ratio",
        "liquidation_1h_usd",
        "liquidation_4h_usd",
        "liquidation_24h_usd",
    ]
    for market in markets:
        df = market.candles.copy()
        symbol = normalize_symbol(market.symbol)

        # Check if candles are temporally aligned with the snapshot.
        candle_ts = pd.to_datetime(df["timestamp"], utc=True, errors="coerce").dropna()
        if candle_ts.empty:
            # No valid timestamps — skip Coinlegs enrichment for this market.
            out.append(MarketData(symbol=market.symbol, timeframe=market.timeframe, candles=df))
            continue

        candle_max_ts = candle_ts.max()
        age_days = (snapshot_reference_ts - candle_max_ts).total_seconds() / 86400.0
        if age_days > max_data_age_days:
            LOGGER.warning(
                "Coinlegs snapshot (%s) too old for %s candles (max candle %s, age %.1f days > %.1f) — skipping",
                snapshot_reference_ts.isoformat(),
                symbol,
                candle_max_ts.isoformat(),
                age_days,
                max_data_age_days,
            )
            # Return market data without Coinlegs columns intact (not a crash).
            out.append(MarketData(symbol=market.symbol, timeframe=market.timeframe, candles=df))
            continue

        if symbol in by_symbol.index:
            row = by_symbol.loc[symbol]
            for col in add_cols:
                df[f"coinlegs_{col}" if not col.startswith("coinlegs_") else col] = row[col] if col in row else np.nan
        out.append(MarketData(symbol=market.symbol, timeframe=market.timeframe, candles=df))
    return out


def coinlegs_market_snapshot(markets: Iterable[MarketData]) -> pd.DataFrame:
    rows: list[dict] = []
    for market in markets:
        df = market.candles
        if df.empty or "coinlegs_alpha_score" not in df.columns:
            continue
        row = df.iloc[-1]
        rows.append(
            {
                "symbol": market.symbol,
                "timeframe": market.timeframe,
                "coinlegs_alpha_score": _num(row, "coinlegs_alpha_score"),
                "coinlegs_bias": str(row.get("coinlegs_bias", "")),
                "demand_velocity_score": _num(row, "coinlegs_demand_velocity_score"),
                "leverage_expansion_score": _num(row, "coinlegs_leverage_expansion_score"),
                "funding_sanity_score": _num(row, "coinlegs_funding_sanity_score"),
                "crowding_sanity_score": _num(row, "coinlegs_crowding_sanity_score"),
                "liquidation_activity_score": _num(row, "coinlegs_liquidation_activity_score"),
                "details": str(row.get("coinlegs_details", "")),
            }
        )
    out = pd.DataFrame(rows)
    if not out.empty:
        out = out.sort_values("coinlegs_alpha_score", ascending=False).reset_index(drop=True)
    return out
