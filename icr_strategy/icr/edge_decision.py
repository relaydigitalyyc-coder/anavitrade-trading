"""Statistical edge-testing for the ICR strategy.

Replaces the boolean-checklist ``make_edge_decision()`` with a rigorous
statistical framework:

- Deflated Sharpe Ratio (DSR) corrects for multiple-testing bias.
- Probability of Backtest Overfitting (PBO) quantifies overfit risk.
- Bootstrap confidence interval on expectancy provides a robust bound.
- The final decision is a four-tier classification backed by these metrics.

The deprecated ``make_edge_decision_simple()`` remains available for
transitional use, with a deprecation warning.
"""

from __future__ import annotations

import math
import warnings
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
import scipy.stats as sp_stats

from .stats import (
    bootstrap_confidence_interval,
    deflated_sharpe_ratio,
    estimate_pbo_from_sharpe,
    minimum_backtest_length,
    probability_of_backtest_overfitting,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MIN_TRADES_CANDIDATE = 100
_MIN_TRADES_STRONG = 200


# ---------------------------------------------------------------------------
# Decision types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class StatisticalEdgeDecision:
    """Rigorous statistical edge test result.

    Attributes
    ----------
    edge_class : str
        One of ``"STRONG_EDGE"``, ``"CANDIDATE_EDGE"``, ``"INSUFFICIENT"``.
    reason : str
        Human-readable explanation of the decision.
    sharpe : float or None
        Observed per-trade Sharpe ratio of the R-values.
    dsr_z : float or None
        Deflated Sharpe Ratio z-score (corrected for multiple testing).
    dsr_p : float or None
        P-value of the deflated Sharpe test (probability SR <= 0 post
        correction).
    pbo_pct : float or None
        Probability of Backtest Overfitting (0-100%).
    bootstrap_ci : dict or None
        Bootstrap 95% confidence interval on expectancy: keys ``lower``,
        ``upper``, ``observed``.
    n_trades : int
        Number of trades in the sample.
    mbl : int or None
        Minimum backtest length needed for significance.
    _raw : dict
        Full set of computed metrics (for downstream users).
    """

    edge_class: str
    reason: str
    sharpe: float | None
    dsr_z: float | None
    dsr_p: float | None
    pbo_pct: float | None
    bootstrap_ci: dict[str, float] | None
    n_trades: int
    mbl: int | None
    _raw: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d.pop("_raw")  # redundant; caller can recompute from the other fields
        return d


# ---------------------------------------------------------------------------
# Statistical edge test
# ---------------------------------------------------------------------------


def statistical_edge_test(
    r_values: list[float],
    n_parameters: int = 1,
    skewness: float | None = None,
    kurtosis: float | None = None,
    returns_matrix: np.ndarray | None = None,
    pbo_override: float | None = None,
) -> StatisticalEdgeDecision:
    """Run the full statistical edge test on a series of trade R-values.

    Steps
    -----
    1. Compute the per-trade Sharpe ratio from R-values.
    2. Compute DSR, adjusting for *n_parameters* as the number of trials.
    3. Estimate PBO (from ``returns_matrix`` if given, or via the conservative
       ``estimate_pbo_from_sharpe`` approximation).
    4. Compute a one-shot bootstrap 95% confidence interval on expectancy.
    5. Classify the edge.

    Parameters
    ----------
    r_values : list of float
        Trade R-multiples (one per closed trade).
    n_parameters : int
        Number of strategy parameters / trials tested during development.
        Used as the *n_trials* argument for DSR and the conservative PBO
        estimator.  Default 1 (no multiple-testing correction).
    skewness, kurtosis : float or None
        Skewness / excess kurtosis of the R distribution.  If None, computed
        from the sample.
    returns_matrix : np.ndarray or None
        Optional (T x N) matrix of returns across *N* parameter configurations
        for a full CSCV-based PBO estimate.  If provided, ``n_parameters`` is
        ignored for PBO.
    pbo_override : float or None
        Optional direct PBO value (0-100%).  Useful when you have a PBO
        estimate from a different pipeline.

    Returns
    -------
    StatisticalEdgeDecision
    """
    n = len(r_values)
    if n < 2:
        return StatisticalEdgeDecision(
            edge_class="INSUFFICIENT",
            reason="fewer than 2 trades",
            sharpe=None,
            dsr_z=None,
            dsr_p=None,
            pbo_pct=None,
            bootstrap_ci=None,
            n_trades=n,
            mbl=None,
            _raw={"n_trades": n},
        )

    arr = np.asarray(r_values, dtype=float)
    mean_r = float(arr.mean())
    std_r = float(arr.std(ddof=1))
    sharpe = mean_r / std_r if std_r > 0 else 0.0

    # Skewness / kurtosis
    if skewness is None:
        skewness = float(sp_stats.skew(arr)) if n >= 3 else 0.0
    if kurtosis is None:
        kurtosis = float(sp_stats.kurtosis(arr, bias=False)) if n >= 4 else 0.0

    # DSR
    trials = max(n_parameters, 1)
    dsr = deflated_sharpe_ratio(
        sharpe=sharpe,
        n_observations=n,
        n_trials=trials,
        skewness=skewness,
        kurtosis=kurtosis,
    )
    dsr_z = dsr["dsr_z"]
    dsr_p = dsr["dsr_p"]

    # PBO
    if pbo_override is not None:
        pbo_pct = float(pbo_override)
    elif returns_matrix is not None:
        pbo_result = probability_of_backtest_overfitting(returns_matrix)
        pbo_pct = pbo_result["pbo_pct"]
    else:
        pbo_pct = estimate_pbo_from_sharpe(
            sharpe=sharpe,
            n_observations=n,
            n_trials=trials,
        )

    # Bootstrap CI on expectancy
    ci = bootstrap_confidence_interval(arr, alpha=0.05)
    ci_lower = ci["lower"]
    ci_upper = ci["upper"]

    # MBL
    mbl_result = minimum_backtest_length(sharpe, alpha=0.05)
    mbl = mbl_result["min_observations"]
    if not math.isfinite(mbl):
        mbl_nice = None
    else:
        mbl_nice = int(mbl)

    # ---- Classification ---------------------------------------------------
    raw = {
        "sharpe": round(sharpe, 4),
        "dsr_z": dsr_z,
        "dsr_p": dsr_p,
        "pbo_pct": pbo_pct,
        "bootstrap_ci_lower": ci_lower,
        "bootstrap_ci_upper": ci_upper,
        "expectancy_r": round(mean_r, 4),
        "mbl": mbl_nice,
    }

    # STRONG_EDGE
    if (
        dsr_z > 1.0
        and pbo_pct < 25.0
        and ci_lower > 0.0
        and n >= _MIN_TRADES_STRONG
    ):
        return StatisticalEdgeDecision(
            edge_class="STRONG_EDGE",
            reason=(
                f"DSR_z={dsr_z:.2f} > 1.0, PBO={pbo_pct:.1f}% < 25%, "
                f"bootstrap CI lower={ci_lower:.2f}R > 0, "
                f"n={n} >= {_MIN_TRADES_STRONG}"
            ),
            sharpe=round(sharpe, 4),
            dsr_z=dsr_z,
            dsr_p=dsr_p,
            pbo_pct=pbo_pct,
            bootstrap_ci=ci,
            n_trades=n,
            mbl=mbl_nice,
            _raw=raw,
        )

    # CANDIDATE_EDGE
    if (
        dsr_z > 0.5
        and pbo_pct < 40.0
        and ci_lower > -0.2
        and n >= _MIN_TRADES_CANDIDATE
    ):
        return StatisticalEdgeDecision(
            edge_class="CANDIDATE_EDGE",
            reason=(
                f"DSR_z={dsr_z:.2f} > 0.5, PBO={pbo_pct:.1f}% < 40%, "
                f"bootstrap CI lower={ci_lower:.2f}R > -0.2R, "
                f"n={n} >= {_MIN_TRADES_CANDIDATE}"
            ),
            sharpe=round(sharpe, 4),
            dsr_z=dsr_z,
            dsr_p=dsr_p,
            pbo_pct=pbo_pct,
            bootstrap_ci=ci,
            n_trades=n,
            mbl=mbl_nice,
            _raw=raw,
        )

    # INSUFFICIENT — build specific reason
    failures: list[str] = []
    if n < _MIN_TRADES_CANDIDATE:
        failures.append(f"n={n} < {_MIN_TRADES_CANDIDATE}")
    if dsr_z <= 0.5:
        failures.append(f"DSR_z={dsr_z:.2f} <= 0.5")
    if pbo_pct >= 40.0:
        failures.append(f"PBO={pbo_pct:.1f}% >= 40%")
    if ci_lower <= -0.2:
        failures.append(f"bootstrap CI lower={ci_lower:.2f}R <= -0.2R")
    if ci_lower <= 0.0 and n >= _MIN_TRADES_STRONG:
        failures.append(f"bootstrap CI lower={ci_lower:.2f}R <= 0")

    return StatisticalEdgeDecision(
        edge_class="INSUFFICIENT",
        reason="; ".join(failures) if failures else "unknown",
        sharpe=round(sharpe, 4),
        dsr_z=dsr_z,
        dsr_p=dsr_p,
        pbo_pct=pbo_pct,
        bootstrap_ci=ci,
        n_trades=n,
        mbl=mbl_nice,
        _raw=raw,
    )


# ---------------------------------------------------------------------------
# Deprecated simple checkerboard
# ---------------------------------------------------------------------------


def make_edge_decision_simple(
    summary: dict,
    audit_summary: dict,
    coil_summary: dict,
) -> dict:
    """Deprecated boolean-checklist edge decision.

    .. deprecated::
        Use :func:`statistical_edge_test` instead.  This function is kept
        for transitional backward-compatibility and will be removed in a
        future release.
    """
    warnings.warn(
        "make_edge_decision_simple is deprecated; use statistical_edge_test instead",
        DeprecationWarning,
        stacklevel=2,
    )
    from .real_edge import make_edge_decision as _real_make_edge_decision
    return asdict(_real_make_edge_decision(summary, audit_summary, coil_summary))


