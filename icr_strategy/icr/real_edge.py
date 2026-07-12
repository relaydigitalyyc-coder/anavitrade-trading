from __future__ import annotations

import json
import warnings
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd

from .audit import run_quant_audit, write_audit_reports
from .backtester import Backtester, BacktestResult
from .coiling_pump import (
    CoilConfig,
    annotate_markets_with_coil_scores,
    false_positive_traps,
    run_coil_research,
    threshold_sweep,
    write_coil_reports,
)
from .config import BacktestConfig, StrategyConfig
from .data_loader import MarketData
from .edge_decision import statistical_edge_test


@dataclass(frozen=True)
class EdgeDecision:
    edge_status: str
    decision: str
    reason: str
    min_required_trades: int
    min_required_qualified_coils: int
    baseline_trades: int
    baseline_expectancy_r: float
    baseline_net_r: float
    coil_qualified_events: int
    coil_pump_rate: float | None
    walk_forward_test_expectancy_r: float | None
    hard_fail_count: int
    warning_count: int

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class StatisticalEdgeResult:
    """Statistical edge result combining old and new frameworks."""
    legacy_decision: dict[str, Any] | None
    stat_decision: dict[str, Any] | None
    dsr_z: float | None
    dsr_p: float | None
    pbo_pct: float | None
    sharpe: float | None
    bootstrap_ci: dict[str, float] | None
    n_trades: int
    mbl: int | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _row_from_result(name: str, result) -> dict:
    row = {"scenario": name}
    row.update(result.summary)
    return row


def run_combo_ablations(markets: list[MarketData], strategy_cfg: StrategyConfig, bt_cfg: BacktestConfig, coil_cfg: CoilConfig) -> pd.DataFrame:
    """Run the four requested strategy combinations on the same candles.

    HTF coil is a real tradable gate here: the market candles are annotated with
    causal coil_score first, then StrategyConfig.enable_coil_gate requires the
    signal candle to meet min_coil_score. Coinlegs is controlled separately by
    enable_coinlegs and expects snapshot fields to already be attached.
    """
    coil_markets = annotate_markets_with_coil_scores(markets, strategy_cfg, coil_cfg)
    scenarios: list[tuple[str, list[MarketData], StrategyConfig]] = [
        (
            "base_icr_only",
            markets,
            strategy_cfg.model_copy(update={"enable_ict": False, "enable_divergence": False, "enable_mtf": False, "enable_coinlegs": False, "enable_coil_gate": False}),
        ),
        (
            "icr_plus_htf_coil",
            coil_markets,
            strategy_cfg.model_copy(update={"enable_coinlegs": False, "enable_coil_gate": True, "min_coil_score": coil_cfg.threshold}),
        ),
        (
            "icr_plus_coinlegs",
            markets,
            strategy_cfg.model_copy(update={"enable_coinlegs": True, "enable_coil_gate": False}),
        ),
        (
            "icr_plus_htf_coil_plus_coinlegs",
            coil_markets,
            strategy_cfg.model_copy(update={"enable_coinlegs": True, "enable_coil_gate": True, "min_coil_score": coil_cfg.threshold}),
        ),
    ]
    rows: list[dict] = []
    for name, scenario_markets, cfg in scenarios:
        result = Backtester(cfg, bt_cfg).run_many(scenario_markets)
        rows.append(_row_from_result(name, result))
    return pd.DataFrame(rows)


def walk_forward_by_year(markets: Iterable[MarketData], strategy_cfg: StrategyConfig, bt_cfg: BacktestConfig) -> pd.DataFrame:
    rows: list[dict] = []
    for market in markets:
        df = market.candles.copy()
        ts = pd.to_datetime(df["timestamp"], utc=True)
        df["_year"] = ts.dt.year
        for year, chunk in df.groupby("_year"):
            if len(chunk) < 140:
                rows.append({"symbol": market.symbol, "timeframe": market.timeframe, "year": int(year), "bars": int(len(chunk)), "status": "insufficient_bars"})
                continue
            sub = MarketData(market.symbol, market.timeframe, chunk.drop(columns=["_year"]).reset_index(drop=True))
            result = Backtester(strategy_cfg, bt_cfg).run_one(sub)
            row = {"symbol": market.symbol, "timeframe": market.timeframe, "year": int(year), "bars": int(len(chunk)), "status": "ok"}
            row.update(result.summary)
            rows.append(row)
    return pd.DataFrame(rows)


def regime_report(markets: Iterable[MarketData], candidates: pd.DataFrame) -> pd.DataFrame:
    if candidates.empty:
        return pd.DataFrame(columns=["regime", "events", "pump_rate", "avg_mfe_pct", "avg_mae_pct"])
    df = candidates.copy()
    def regime(row: pd.Series) -> str:
        ma = float(row.get("ma_context", np.nan))
        atr = float(row.get("atr_contraction", np.nan))
        vol = float(row.get("volume_dryup", np.nan))
        if ma >= 72 and atr >= 55 and vol >= 45:
            return "trend_coil_volume_dryup"
        if ma < 55:
            return "weak_trend_context"
        if vol < 35:
            return "no_volume_dryup"
        return "mixed_coil"
    df["regime"] = df.apply(regime, axis=1)
    return df.groupby("regime", as_index=False).agg(
        events=("coil_score", "count"),
        pump_rate=("pump_label", "mean"),
        avg_mfe_pct=("mfe_pct", "mean"),
        avg_mae_pct=("mae_pct", "mean"),
    ).sort_values(["pump_rate", "avg_mfe_pct"], ascending=[False, False])


def make_edge_decision(
    summary: dict,
    audit_summary: dict,
    coil_summary: dict,
) -> EdgeDecision:
    """Legacy boolean-checklist edge decision.

    .. deprecated::
        Use :func:`make_statistical_edge_decision` instead.
    """
    warnings.warn(
        "make_edge_decision is deprecated; use make_statistical_edge_decision instead",
        DeprecationWarning,
        stacklevel=2,
    )
    return _make_edge_decision_impl(summary, audit_summary, coil_summary)


def _make_edge_decision_impl(summary: dict, audit_summary: dict, coil_summary: dict) -> EdgeDecision:
    trades = int(summary.get("total_trades", 0) or 0)
    exp = float(summary.get("expectancy_r", 0.0) or 0.0)
    net_r = float(summary.get("net_r", 0.0) or 0.0)
    hard_fails = int(audit_summary.get("hard_fail_count", 0) or 0)
    warns = int(audit_summary.get("warning_count", 0) or 0)
    q_events = int(coil_summary.get("qualified_events", 0) or 0)
    pump_rate = coil_summary.get("pump_rate_qualified")
    min_trades = 100
    min_coils = 100
    wf_exp = None
    key = audit_summary.get("key_metrics", {}) if isinstance(audit_summary, dict) else {}
    if isinstance(key, dict):
        val = key.get("walk_forward_test_exp")
        wf_exp = float(val) if val is not None and pd.notna(val) else None

    reasons: list[str] = []
    if hard_fails:
        reasons.append(f"{hard_fails} hard audit failures")
    if trades < min_trades:
        reasons.append(f"only {trades} trades, need {min_trades}+")
    if q_events < min_coils:
        reasons.append(f"only {q_events} qualified coil events, need {min_coils}+")
    if exp <= 0:
        reasons.append("baseline expectancy <= 0")
    if pump_rate is None or not np.isfinite(float(pump_rate)):
        reasons.append("qualified coil pump rate unavailable")
    elif float(pump_rate) < 0.55:
        reasons.append(f"qualified coil pump rate {float(pump_rate):.2%} below 55%")
    if wf_exp is not None and wf_exp <= 0:
        reasons.append("walk-forward test expectancy <= 0")

    if reasons:
        status = "UNPROVEN"
        decision = "Do not deploy live. Continue research/data collection."
    else:
        status = "EDGE_CANDIDATE"
        decision = "Paper trade only; graduate to tiny live risk after live-forward confirmation."
        reasons.append("sample size, expectancy, pump-rate, and audit gates passed")
    return EdgeDecision(status, decision, "; ".join(reasons), min_trades, min_coils, trades, exp, net_r, q_events, None if pump_rate is None else float(pump_rate), wf_exp, hard_fails, warns)


def make_statistical_edge_decision(
    baseline: BacktestResult,
    audit_summary: dict,
    n_parameters: int = 10,
) -> StatisticalEdgeResult:
    """Statistical edge decision using DSR, PBO, and bootstrap CI.

    This is the recommended replacement for :func:`make_edge_decision`.
    It extracts R-values from the backtest result and runs the full
    statistical test suite.

    Parameters
    ----------
    baseline : BacktestResult
        The backtest result containing trade data.
    audit_summary : dict
        The audit summary dict (for legacy compatibility).
    n_parameters : int
        Number of strategy parameters tested during development (default 10).

    Returns
    -------
    StatisticalEdgeResult
    """
    r_values = [float(t.total_r) for t in baseline.trades]
    stat_dec = statistical_edge_test(
        r_values=r_values,
        n_parameters=n_parameters,
    )
    legacy = _make_edge_decision_impl(
        baseline.summary,
        audit_summary,
        {},
    )
    return StatisticalEdgeResult(
        legacy_decision=legacy.to_dict(),
        stat_decision=stat_dec.to_dict(),
        dsr_z=stat_dec.dsr_z,
        dsr_p=stat_dec.dsr_p,
        pbo_pct=stat_dec.pbo_pct,
        sharpe=stat_dec.sharpe,
        bootstrap_ci=stat_dec.bootstrap_ci,
        n_trades=len(r_values),
        mbl=stat_dec.mbl,
    )


def run_real_edge_research(
    markets: list[MarketData],
    strategy_cfg: StrategyConfig,
    bt_cfg: BacktestConfig,
    coil_cfg: CoilConfig,
    output_dir: str | Path,
    exhaustive_audit: bool = True,
) -> dict[str, Path | dict]:
    out = Path(output_dir).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)

    # Baseline real backtest.
    baseline = Backtester(strategy_cfg, bt_cfg).run_many(markets)

    # HTF coil pump event study.
    coil_bundle = run_coil_research(markets, strategy_cfg, coil_cfg)
    coil_paths = write_coil_reports(coil_bundle, out)
    candidates = coil_bundle["htf_coil_candidates"]
    traps = false_positive_traps(candidates, coil_cfg.threshold) if isinstance(candidates, pd.DataFrame) else pd.DataFrame()
    sweep = threshold_sweep(candidates) if isinstance(candidates, pd.DataFrame) else pd.DataFrame()
    regimes = regime_report(markets, candidates) if isinstance(candidates, pd.DataFrame) else pd.DataFrame()

    traps_path = out / "false_positive_traps.csv"
    sweep_path = out / "best_thresholds.csv"
    regimes_path = out / "year_regime_report.csv"
    traps.to_csv(traps_path, index=False)
    sweep.to_csv(sweep_path, index=False)
    regimes.to_csv(regimes_path, index=False)

    combos = run_combo_ablations(markets, strategy_cfg, bt_cfg, coil_cfg)
    combos_path = out / "combo_ablation_report.csv"
    combos.to_csv(combos_path, index=False)

    wf = walk_forward_by_year(markets, strategy_cfg, bt_cfg)
    wf_path = out / "walk_forward_by_year.csv"
    wf.to_csv(wf_path, index=False)

    audit_bundle = run_quant_audit(baseline, markets, strategy_cfg, bt_cfg, exhaustive=exhaustive_audit)
    audit_paths = write_audit_reports(audit_bundle, out)

    # Statistical edge decision (new)
    stat_edge = make_statistical_edge_decision(
        baseline=baseline,
        audit_summary=audit_bundle.summary,
        n_parameters=10,
    )
    decision_path = out / "statistical_edge_decision.json"
    with decision_path.open("w", encoding="utf-8") as f:
        json.dump(stat_edge.to_dict(), f, indent=2, allow_nan=False)

    # Legacy decision (deprecated but kept for backward compat)
    legacy_decision = _make_edge_decision_impl(
        baseline.summary,
        audit_bundle.summary,
        coil_bundle.get("coil_summary", {}),
    )
    legacy_path = out / "edge_decision.json"
    with legacy_path.open("w", encoding="utf-8") as f:
        json.dump(legacy_decision.to_dict(), f, indent=2, allow_nan=False)

    return {
        "baseline_summary": baseline.summary,
        "coil_summary": coil_bundle.get("coil_summary", {}),
        "edge_decision": legacy_decision.to_dict(),
        "statistical_edge_decision": stat_edge.to_dict(),
        "paths": {
            **coil_paths,
            **audit_paths,
            "false_positive_traps": traps_path,
            "best_thresholds": sweep_path,
            "combo_ablation_report": combos_path,
            "walk_forward_by_year": wf_path,
            "year_regime_report": regimes_path,
            "edge_decision": legacy_path,
            "statistical_edge_decision": decision_path,
        },
    }
