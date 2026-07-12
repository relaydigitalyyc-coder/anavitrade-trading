from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

from .config import StrategyConfig
from .data_loader import MarketData
from .indicators import add_indicators


@dataclass(frozen=True)
class CoilConfig:
    lookback: int = 30
    percentile_lookback: int = 180
    threshold: float = 72.0
    pump_threshold: float = 0.12
    forward_bars_4h: int = 18
    forward_bars_1d: int = 14
    cooldown_bars: int = 6
    min_history_bars: int = 220

    def horizon_for_timeframe(self, timeframe: str) -> int:
        tf = timeframe.lower()
        if tf in {"1d", "d", "daily"}:
            return self.forward_bars_1d
        return self.forward_bars_4h


def _clip_score(value: float) -> float:
    if not np.isfinite(value):
        return 0.0
    return float(max(0.0, min(100.0, value)))


def _percentile_rank(values: pd.Series, current: float) -> float:
    clean = pd.to_numeric(values, errors="coerce").dropna()
    if clean.empty or not np.isfinite(current):
        return 50.0
    return float((clean <= current).mean() * 100.0)


def _linear_slope(values: pd.Series) -> float:
    y = pd.to_numeric(values, errors="coerce").to_numpy(dtype=float)
    mask = np.isfinite(y)
    if mask.sum() < 3:
        return 0.0
    y = y[mask]
    x = np.arange(len(y), dtype=float)
    denom = float(((x - x.mean()) ** 2).sum())
    if denom <= 0:
        return 0.0
    return float(((x - x.mean()) * (y - y.mean())).sum() / denom)


def _safe_div(num: float, den: float, default: float = 0.0) -> float:
    if not np.isfinite(num) or not np.isfinite(den) or abs(den) < 1e-12:
        return default
    return float(num / den)


def add_coil_features(df: pd.DataFrame, cfg: StrategyConfig, coil_cfg: CoilConfig) -> pd.DataFrame:
    frame = add_indicators(df, cfg).copy()
    frame["range"] = frame["high"] - frame["low"]
    frame["range_ma"] = frame["range"].rolling(coil_cfg.lookback).mean()
    frame["long_range_median"] = frame["range"].rolling(coil_cfg.percentile_lookback).median()
    mid = frame["close"].rolling(cfg.bollinger_length).mean()
    std = frame["close"].rolling(cfg.bollinger_length).std(ddof=0)
    frame["bb_width"] = ((mid + cfg.bollinger_std * std) - (mid - cfg.bollinger_std * std)) / frame["close"].replace(0, np.nan)
    frame["bb_width_ma"] = frame["bb_width"].rolling(coil_cfg.lookback).mean()
    frame["volume_long_median"] = frame["volume"].rolling(coil_cfg.percentile_lookback).median()
    frame["rolling_high"] = frame["high"].rolling(coil_cfg.lookback).max()
    frame["rolling_low"] = frame["low"].rolling(coil_cfg.lookback).min()
    frame["prior_liquidity_high"] = frame["high"].shift(1).rolling(90).max()
    frame["future_max_high"] = frame["high"].shift(-1).rolling(coil_cfg.horizon_for_timeframe("4h")).max().shift(-(coil_cfg.horizon_for_timeframe("4h") - 1))
    return frame


def score_coil_row(frame: pd.DataFrame, i: int, coil_cfg: CoilConfig) -> dict:
    row = frame.iloc[i]
    start = max(0, i - coil_cfg.percentile_lookback)
    recent_start = max(0, i - coil_cfg.lookback + 1)
    hist = frame.iloc[start:i]
    recent = frame.iloc[recent_start : i + 1]
    if len(hist) < max(60, coil_cfg.lookback * 2) or len(recent) < coil_cfg.lookback:
        return {"coil_score": 0.0, "coil_grade": "insufficient_history"}

    close = float(row.close)
    atr = float(row.atr14) if "atr14" in row else np.nan
    atr_rank = _percentile_rank(hist["atr14"], atr) if "atr14" in hist else 50.0
    bb = float(row.bb_width) if "bb_width" in row else np.nan
    bb_rank = _percentile_rank(hist["bb_width"], bb) if "bb_width" in hist else 50.0

    current_range = float(recent["range"].mean())
    long_range = float(hist["range"].median())
    range_ratio = _safe_div(current_range, long_range, default=1.0)
    range_contraction = _clip_score((1.0 - min(range_ratio, 1.5) / 1.5) * 100.0)
    atr_contraction = _clip_score(100.0 - atr_rank)
    bb_squeeze = _clip_score(100.0 - bb_rank)

    vol_ma20 = float(row.volume_ma20) if "volume_ma20" in row else np.nan
    long_vol = float(hist["volume"].median())
    vol_ratio = _safe_div(vol_ma20, long_vol, default=1.0)
    volume_dryup = _clip_score((1.25 - min(vol_ratio, 1.25)) / 1.25 * 100.0)

    low_slope = _linear_slope(recent["low"])
    high_slope = _linear_slope(recent["high"])
    price_scale = max(close, 1e-12)
    higher_lows = _clip_score(50.0 + 5000.0 * _safe_div(low_slope, price_scale, default=0.0))
    high_pressure = _clip_score(60.0 - 5000.0 * _safe_div(abs(max(high_slope, 0.0)), price_scale, default=0.0)) if low_slope > 0 else 25.0

    ma7 = float(row.ma7) if "ma7" in row else np.nan
    ma25 = float(row.ma25) if "ma25" in row else np.nan
    ma99 = float(row.ma99) if "ma99" in row else np.nan
    ma25_slope = float(row.ma25_slope) if "ma25_slope" in row else 0.0
    ma25_dist_atr = abs(close - ma25) / atr if np.isfinite(atr) and atr > 0 and np.isfinite(ma25) else 5.0
    ma_squeeze = abs(ma7 - ma25) / atr if np.isfinite(atr) and atr > 0 and np.isfinite(ma7) and np.isfinite(ma25) else 5.0
    ma_context = 0.0
    if np.isfinite(ma7) and np.isfinite(ma25) and np.isfinite(ma99):
        if close >= ma25 and ma7 >= ma25 and ma25 >= ma99:
            ma_context = 90.0
        elif close >= ma25 and ma25_slope >= 0:
            ma_context = 72.0
        elif close >= ma99:
            ma_context = 55.0
        else:
            ma_context = 25.0
    ma_squeeze_score = _clip_score(100.0 - min(ma_squeeze, 3.0) / 3.0 * 100.0)
    near_ma_score = _clip_score(100.0 - min(ma25_dist_atr, 3.0) / 3.0 * 100.0)

    prior_high = float(row.prior_liquidity_high) if "prior_liquidity_high" in row and np.isfinite(float(row.prior_liquidity_high)) else np.nan
    dist_to_high = _safe_div(prior_high - close, close, default=np.nan)
    liquidity_overhead = 0.0
    if np.isfinite(dist_to_high):
        if 0.01 <= dist_to_high <= 0.22:
            liquidity_overhead = 90.0 - abs(dist_to_high - 0.08) * 180.0
        elif 0.0 <= dist_to_high < 0.01:
            liquidity_overhead = 60.0
        elif dist_to_high > 0.22:
            liquidity_overhead = 35.0
        else:
            liquidity_overhead = 45.0
    liquidity_overhead = _clip_score(liquidity_overhead)

    compression_high = float(recent["high"].max())
    reclaim_distance = _safe_div(compression_high - close, close, default=1.0)
    reclaim_readiness = _clip_score(100.0 - min(max(reclaim_distance, 0.0), 0.08) / 0.08 * 100.0)
    if close > compression_high * 0.995:
        reclaim_readiness = max(reclaim_readiness, 82.0)

    base_score = (
        0.16 * range_contraction
        + 0.14 * atr_contraction
        + 0.14 * bb_squeeze
        + 0.12 * volume_dryup
        + 0.12 * higher_lows
        + 0.08 * high_pressure
        + 0.10 * ma_context
        + 0.05 * ma_squeeze_score
        + 0.04 * near_ma_score
        + 0.03 * liquidity_overhead
        + 0.02 * reclaim_readiness
    )

    coinlegs_alpha = float(row.coinlegs_alpha_score) if "coinlegs_alpha_score" in row and np.isfinite(float(row.coinlegs_alpha_score)) else np.nan
    coinlegs_bias = str(row.coinlegs_bias) if "coinlegs_bias" in row else "missing"
    coinlegs_details = str(row.coinlegs_details) if "coinlegs_details" in row else ""
    coinlegs_boost = 0.0
    if np.isfinite(coinlegs_alpha):
        coinlegs_boost = max(-10.0, min(12.0, (coinlegs_alpha - 50.0) * 0.25))
        if coinlegs_bias == "bullish_derivative_accumulation":
            coinlegs_boost += 4.0
        elif coinlegs_bias == "crowded_trap_risk":
            coinlegs_boost -= 8.0
        elif coinlegs_bias == "dead_or_distribution":
            coinlegs_boost -= 6.0
    score = _clip_score(base_score + coinlegs_boost)
    grade = "A+" if score >= 85 else "A" if score >= 78 else "B" if score >= 70 else "watch" if score >= 60 else "ignore"
    return {
        "coil_score": round(float(score), 3),
        "base_coil_score": round(float(base_score), 3),
        "coinlegs_alpha_score": round(float(coinlegs_alpha), 3) if np.isfinite(coinlegs_alpha) else np.nan,
        "coinlegs_bias": coinlegs_bias,
        "coinlegs_boost": round(float(coinlegs_boost), 3),
        "coinlegs_details": coinlegs_details,
        "coil_grade": grade,
        "range_contraction": round(range_contraction, 3),
        "atr_contraction": round(atr_contraction, 3),
        "bb_squeeze": round(bb_squeeze, 3),
        "volume_dryup": round(volume_dryup, 3),
        "higher_lows": round(higher_lows, 3),
        "high_pressure": round(high_pressure, 3),
        "ma_context": round(ma_context, 3),
        "ma_squeeze_score": round(ma_squeeze_score, 3),
        "near_ma25_score": round(near_ma_score, 3),
        "liquidity_overhead": round(liquidity_overhead, 3),
        "reclaim_readiness": round(reclaim_readiness, 3),
        "range_ratio": round(float(range_ratio), 6),
        "volume_ratio": round(float(vol_ratio), 6),
        "distance_to_prior_high_pct": round(float(dist_to_high * 100.0), 4) if np.isfinite(dist_to_high) else np.nan,
        "compression_high": compression_high,
        "compression_low": float(recent["low"].min()),
    }


def _future_metrics(frame: pd.DataFrame, i: int, horizon: int) -> dict:
    close = float(frame.iloc[i].close)
    future = frame.iloc[i + 1 : i + 1 + horizon]
    if close <= 0 or future.empty:
        return {"future_bars": len(future), "mfe_pct": np.nan, "mae_pct": np.nan, "future_close_return_pct": np.nan}
    return {
        "future_bars": int(len(future)),
        "mfe_pct": float((future["high"].max() / close - 1.0) * 100.0),
        "mae_pct": float((future["low"].min() / close - 1.0) * 100.0),
        "future_close_return_pct": float((future["close"].iloc[-1] / close - 1.0) * 100.0),
    }


def coil_candidates_for_market(market: MarketData, strategy_cfg: StrategyConfig, coil_cfg: CoilConfig) -> pd.DataFrame:
    frame = add_coil_features(market.candles, strategy_cfg, coil_cfg)
    horizon = coil_cfg.horizon_for_timeframe(market.timeframe)
    rows: list[dict] = []
    last_kept = -10**9
    for i in range(max(coil_cfg.min_history_bars, coil_cfg.percentile_lookback + coil_cfg.lookback), len(frame) - max(1, horizon)):
        scores = score_coil_row(frame, i, coil_cfg)
        if scores.get("coil_grade") == "insufficient_history":
            continue
        if float(scores["coil_score"]) < 55.0:
            continue
        if i - last_kept < coil_cfg.cooldown_bars and float(scores["coil_score"]) < coil_cfg.threshold:
            continue
        if float(scores["coil_score"]) >= coil_cfg.threshold:
            last_kept = i
        fut = _future_metrics(frame, i, horizon)
        rows.append(
            {
                "symbol": market.symbol,
                "timeframe": market.timeframe,
                "index": i,
                "timestamp": pd.Timestamp(frame.iloc[i].timestamp).isoformat(),
                "close": float(frame.iloc[i].close),
                "horizon_bars": horizon,
                **scores,
                **fut,
                "pump_label": bool(np.isfinite(fut["mfe_pct"]) and fut["mfe_pct"] >= coil_cfg.pump_threshold * 100.0),
            }
        )
    out = pd.DataFrame(rows)
    if not out.empty:
        out = out.sort_values(["coil_score", "timestamp"], ascending=[False, True]).reset_index(drop=True)
    return out


def latest_coil_scoreboard(markets: Iterable[MarketData], strategy_cfg: StrategyConfig, coil_cfg: CoilConfig) -> pd.DataFrame:
    rows: list[dict] = []
    for market in markets:
        frame = add_coil_features(market.candles, strategy_cfg, coil_cfg)
        if len(frame) < max(60, coil_cfg.lookback + 5):
            continue
        i = len(frame) - 1
        scores = score_coil_row(frame, i, coil_cfg)
        row = frame.iloc[i]
        rows.append(
            {
                "symbol": market.symbol,
                "timeframe": market.timeframe,
                "timestamp": pd.Timestamp(row.timestamp).isoformat(),
                "close": float(row.close),
                **scores,
            }
        )
    out = pd.DataFrame(rows)
    if not out.empty and "coil_score" in out:
        out = out.sort_values("coil_score", ascending=False).reset_index(drop=True)
    return out


def lift_by_score_bucket(candidates: pd.DataFrame, threshold: float) -> pd.DataFrame:
    if candidates.empty:
        return pd.DataFrame(columns=["score_bucket", "events", "pump_rate", "avg_mfe_pct", "avg_mae_pct", "avg_close_return_pct"])
    df = candidates.copy()
    bins = [0, 55, 60, 65, 70, 75, 80, 85, 90, 100]
    df["score_bucket"] = pd.cut(df["coil_score"], bins=bins, include_lowest=True)
    grouped = df.groupby("score_bucket", observed=True, as_index=False).agg(
        events=("coil_score", "count"),
        pump_rate=("pump_label", "mean"),
        avg_mfe_pct=("mfe_pct", "mean"),
        avg_mae_pct=("mae_pct", "mean"),
        avg_close_return_pct=("future_close_return_pct", "mean"),
    )
    grouped["score_bucket"] = grouped["score_bucket"].astype(str)
    grouped["threshold"] = threshold
    return grouped


def symbol_coil_performance(candidates: pd.DataFrame, threshold: float) -> pd.DataFrame:
    if candidates.empty:
        return pd.DataFrame(columns=["symbol", "timeframe", "qualified_events", "pump_rate", "avg_mfe_pct", "avg_mae_pct", "avg_close_return_pct", "avg_coil_score"])
    df = candidates[candidates["coil_score"] >= threshold].copy()
    if df.empty:
        return pd.DataFrame(columns=["symbol", "timeframe", "qualified_events", "pump_rate", "avg_mfe_pct", "avg_mae_pct", "avg_close_return_pct", "avg_coil_score"])
    return df.groupby(["symbol", "timeframe"], as_index=False).agg(
        qualified_events=("coil_score", "count"),
        pump_rate=("pump_label", "mean"),
        avg_mfe_pct=("mfe_pct", "mean"),
        avg_mae_pct=("mae_pct", "mean"),
        avg_close_return_pct=("future_close_return_pct", "mean"),
        avg_coil_score=("coil_score", "mean"),
    ).sort_values(["pump_rate", "avg_mfe_pct", "qualified_events"], ascending=[False, False, False])


def run_coil_research(markets: Iterable[MarketData], strategy_cfg: StrategyConfig, coil_cfg: CoilConfig) -> dict[str, pd.DataFrame | dict]:
    market_list = list(markets)
    frames = [coil_candidates_for_market(market, strategy_cfg, coil_cfg) for market in market_list]
    candidates = pd.concat([f for f in frames if not f.empty], ignore_index=True) if any(not f.empty for f in frames) else pd.DataFrame()
    if not candidates.empty:
        candidates = candidates.sort_values(["coil_score", "timestamp"], ascending=[False, True]).reset_index(drop=True)
    latest = latest_coil_scoreboard(market_list, strategy_cfg, coil_cfg)
    qualified = candidates[candidates["coil_score"] >= coil_cfg.threshold].copy() if not candidates.empty else pd.DataFrame()
    summary = {
        "schema": "ICR_HTF_COILING_PUMP_RESEARCH_v1",
        "markets": len(market_list),
        "events_scanned": int(len(candidates)),
        "qualified_events": int(len(qualified)),
        "threshold": coil_cfg.threshold,
        "pump_threshold_pct": coil_cfg.pump_threshold * 100.0,
        "pump_rate_all": float(candidates["pump_label"].mean()) if not candidates.empty else None,
        "pump_rate_qualified": float(qualified["pump_label"].mean()) if not qualified.empty else None,
        "avg_mfe_pct_qualified": float(qualified["mfe_pct"].mean()) if not qualified.empty else None,
    }
    return {
        "htf_coil_candidates": candidates,
        "latest_coil_scoreboard": latest,
        "pump_lift_by_score_bucket": lift_by_score_bucket(candidates, coil_cfg.threshold),
        "symbol_coil_performance": symbol_coil_performance(candidates, coil_cfg.threshold),
        "qualified_coil_events": qualified,
        "coil_summary": summary,
    }


def write_coil_reports(bundle: dict[str, pd.DataFrame | dict], output_dir: str | Path) -> dict[str, Path]:
    out = Path(output_dir).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    paths = {
        "htf_coil_candidates": out / "htf_coil_candidates.csv",
        "latest_coil_scoreboard": out / "latest_coil_scoreboard.csv",
        "pump_lift_by_score_bucket": out / "pump_lift_by_score_bucket.csv",
        "symbol_coil_performance": out / "symbol_coil_performance.csv",
        "qualified_coil_events": out / "qualified_coil_events.csv",
        "coil_summary": out / "coil_summary.json",
    }
    for key, path in paths.items():
        obj = bundle.get(key)
        if isinstance(obj, pd.DataFrame):
            obj.to_csv(path, index=False)
        elif isinstance(obj, dict):
            with path.open("w", encoding="utf-8") as f:
                json.dump(obj, f, indent=2, allow_nan=False)
    return paths


def annotate_market_with_coil_scores(market: MarketData, strategy_cfg: StrategyConfig, coil_cfg: CoilConfig) -> MarketData:
    """Return a MarketData copy with causal HTF coil scores attached per candle.

    Scores are computed using only the candle at `i` and prior history. Future
    MFE/MAE labels are not attached to the tradable candle frame.
    """
    frame = add_coil_features(market.candles, strategy_cfg, coil_cfg)
    score_cols = [
        "coil_score",
        "base_coil_score",
        "coil_grade",
        "range_contraction",
        "atr_contraction",
        "bb_squeeze",
        "volume_dryup",
        "higher_lows",
        "high_pressure",
        "ma_context",
        "ma_squeeze_score",
        "near_ma25_score",
        "liquidity_overhead",
        "reclaim_readiness",
    ]
    for col in score_cols:
        frame[col] = np.nan if col != "coil_grade" else "insufficient_history"
    start = max(coil_cfg.min_history_bars, coil_cfg.percentile_lookback + coil_cfg.lookback)
    for i in range(start, len(frame)):
        scores = score_coil_row(frame, i, coil_cfg)
        if scores.get("coil_grade") == "insufficient_history":
            continue
        for col in score_cols:
            if col in scores:
                frame.at[i, col] = scores[col]
    return MarketData(market.symbol, market.timeframe, frame.reset_index(drop=True))


def annotate_markets_with_coil_scores(markets: Iterable[MarketData], strategy_cfg: StrategyConfig, coil_cfg: CoilConfig) -> list[MarketData]:
    return [annotate_market_with_coil_scores(market, strategy_cfg, coil_cfg) for market in markets]


def false_positive_traps(candidates: pd.DataFrame, threshold: float) -> pd.DataFrame:
    """Explain qualified coil events that did not achieve the pump label."""
    columns = [
        "symbol",
        "timeframe",
        "timestamp",
        "coil_score",
        "mfe_pct",
        "mae_pct",
        "future_close_return_pct",
        "trap_reason",
    ]
    if candidates.empty:
        return pd.DataFrame(columns=columns)
    df = candidates[(candidates["coil_score"] >= threshold) & (~candidates["pump_label"].astype(bool))].copy()
    if df.empty:
        return pd.DataFrame(columns=columns)

    def reason(row: pd.Series) -> str:
        reasons: list[str] = []
        if float(row.get("volume_dryup", 0)) < 35:
            reasons.append("coil_without_volume_dryup")
        if float(row.get("liquidity_overhead", 0)) < 45:
            reasons.append("poor_overhead_liquidity_distance")
        if float(row.get("ma_context", 0)) < 55:
            reasons.append("weak_htf_ma_context")
        if float(row.get("reclaim_readiness", 0)) < 50:
            reasons.append("not_ready_to_reclaim")
        if float(row.get("coinlegs_boost", 0)) < 0:
            reasons.append("derivatives_crowding_or_distribution")
        if pd.notna(row.get("mae_pct")) and float(row.get("mae_pct")) < -6:
            reasons.append("deep_adverse_excursion_before_pump")
        return ";".join(reasons) or "score_looked_clean_but_no_follow_through"

    df["trap_reason"] = df.apply(reason, axis=1)
    keep = [c for c in columns if c in df.columns]
    return df.loc[:, keep].sort_values(["coil_score", "timestamp"], ascending=[False, True]).reset_index(drop=True)


def threshold_sweep(candidates: pd.DataFrame, pump_thresholds: Iterable[float] = (0.08, 0.10, 0.12, 0.15, 0.20)) -> pd.DataFrame:
    """Score thresholds against future MFE pump labels."""
    if candidates.empty:
        return pd.DataFrame(columns=["coil_threshold", "pump_threshold_pct", "events", "pump_rate", "avg_mfe_pct", "avg_mae_pct", "score_edge_ratio"])
    rows: list[dict] = []
    for pump_threshold in pump_thresholds:
        pump_pct = float(pump_threshold) * 100.0
        for coil_threshold in range(55, 91, 5):
            sample = candidates[candidates["coil_score"] >= coil_threshold].copy()
            if sample.empty:
                rows.append({"coil_threshold": coil_threshold, "pump_threshold_pct": pump_pct, "events": 0, "pump_rate": np.nan, "avg_mfe_pct": np.nan, "avg_mae_pct": np.nan, "score_edge_ratio": np.nan})
                continue
            pump_rate = float((sample["mfe_pct"] >= pump_pct).mean())
            avg_mfe = float(sample["mfe_pct"].mean())
            avg_mae = float(sample["mae_pct"].mean())
            edge_ratio = avg_mfe / abs(avg_mae) if np.isfinite(avg_mae) and abs(avg_mae) > 1e-12 else np.nan
            rows.append({"coil_threshold": coil_threshold, "pump_threshold_pct": pump_pct, "events": int(len(sample)), "pump_rate": pump_rate, "avg_mfe_pct": avg_mfe, "avg_mae_pct": avg_mae, "score_edge_ratio": edge_ratio})
    out = pd.DataFrame(rows)
    if not out.empty:
        out = out.sort_values(["pump_threshold_pct", "pump_rate", "score_edge_ratio", "events"], ascending=[True, False, False, False]).reset_index(drop=True)
    return out
