"""Statistical rigor tools for the ICR strategy.

Provides the Deflated Sharpe Ratio (DSR), Probability of Backtest Overfitting
(PBO), and Minimum Backtest Length (MBL) computations described in the
literature on multiple-testing correction and backtest overfitting.

References
----------
Bailey, D.H. and Lopez de Prado, M., 2014.
    The deflated Sharpe ratio: Correcting for selection bias, backtest
    overfitting, and non-normality. *Journal of Portfolio Management*,
    40(5), pp.94-107.

Bailey, D.H., Borwein, J.M., Lopez de Prado, M. and Zhu, Q.J., 2014.
    PBO: Probability of backtest overfitting.
    *Journal of Computational Finance* (forthcoming).
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy import stats as sp_stats

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_EULER_MASCHERONI = 0.57721566490153286060651209008240243104215933593992


# ---------------------------------------------------------------------------
# Deflated Sharpe Ratio (DSR)
# ---------------------------------------------------------------------------


def deflated_sharpe_ratio(
    sharpe: float,
    n_observations: int,
    n_trials: int,
    skewness: float | None = None,
    kurtosis: float | None = None,
) -> dict[str, float]:
    """Compute the Deflated Sharpe Ratio (Bailey & Lopez de Prado 2014).

    Adjusts the observed Sharpe ratio for:
    - multiple-testing (selection) bias across *n_trials* parameter/config
      combinations;
    - non-normal return distributions (skewness / kurtosis).

    Parameters
    ----------
    sharpe : float
        Observed (annualised or per-trade) Sharpe ratio.
    n_observations : int
        Number of independent observations (trades / bars).  Must be >= 2.
    n_trials : int
        Number of trials / parameter configurations tested.  Must be >= 1.
    skewness : float or None
        Sample skewness of the return series.  None assumes normality.
    kurtosis : float or None
        Sample excess kurtosis of the return series.  None assumes normality.

    Returns
    -------
    dict
        dsr_z : float
            Deflated z-score (test statistic).
        dsr_p : float
            Probability that the true Sharpe ratio is non-positive after
            adjusting for multiple testing (one-sided).  Interpret as the
            "deflated Sharpe ratio" CDF value.
        expected_max_sr : float
            Expected maximum Sharpe under *n_trials* i.i.d. normal trials.
        variance_adjustment : float
            Variance inflation factor from non-normal skewness/kurtosis.

    References
    ----------
    Bailey & Lopez de Prado (2014), Eq. 6-13.
    """
    if n_observations < 2:
        raise ValueError("n_observations must be >= 2")
    if n_trials < 1:
        raise ValueError("n_trials must be >= 1")

    gamma = _EULER_MASCHERONI

    # Expected maximum of N i.i.d. standard normals:
    #   E[max(Z_N)] = (1 - gamma) * Phi^{-1}(1 - 1/N)
    #                 + gamma * Phi^{-1}(1 - 1/(N*e))
    inv_1_over_n = float(sp_stats.norm.ppf(1.0 - 1.0 / n_trials))
    inv_1_over_ne = float(sp_stats.norm.ppf(1.0 - 1.0 / (n_trials * math.e)))
    expected_max_sr = (1.0 - gamma) * inv_1_over_n + gamma * inv_1_over_ne

    # Mertens variance correction for non-normality:
    #   V = 1 - gamma3 * SR + (gamma4 - 1) * SR^2 / 4
    s = 0.0 if skewness is None else skewness
    k = 0.0 if kurtosis is None else kurtosis
    variance_adjustment = 1.0 - s * sharpe + (k - 1.0) * sharpe * sharpe / 4.0
    if variance_adjustment <= 0.0:
        variance_adjustment = 1.0  # fallback if estimates are pathological

    dsr_z = (sharpe * math.sqrt(n_observations - 1) - expected_max_sr) / math.sqrt(
        variance_adjustment
    )
    dsr_p = float(sp_stats.norm.cdf(dsr_z))

    return {
        "dsr_z": round(dsr_z, 4),
        "dsr_p": round(dsr_p, 4),
        "expected_max_sr": round(expected_max_sr, 4),
        "variance_adjustment": round(variance_adjustment, 4),
    }


# ---------------------------------------------------------------------------
# Probability of Backtest Overfitting (PBO)
# ---------------------------------------------------------------------------


def probability_of_backtest_overfitting(
    returns_matrix: np.ndarray,
    n_splits: int = 200,
    seed: int = 42,
) -> dict[str, Any]:
    """Estimate PBO via combinatorially symmetric cross-validation (CSCV).

    Uses random train/test splits as an approximation to the full CSCV
    procedure (which is O(2^T) and intractable for any realistic T).

    PBO = proportion of splits where the best in-sample strategy ranks in the
    worst half out-of-sample.

    Parameters
    ----------
    returns_matrix : np.ndarray of shape (T, N)
        Matrix of strategy returns / R-values:
        T = number of observations, N = number of strategies/parameter configs.
    n_splits : int
        Number of random train/test splits to evaluate.  Default 200.
    seed : int
        Random seed for reproducible sampling.

    Returns
    -------
    dict
        pbo_pct : float
            Probability of backtest overfitting (0-100%).
        overfit_count : int
            Number of splits where the best IS strategy was in the worst OOS
            half.
        total_splits : int
            Number of valid splits actually run.
        warning : str or None
            Warning message if data is insufficient.

    References
    ----------
    Bailey et al. (2014). PBO: Probability of backtest overfitting.
    """
    if returns_matrix.ndim != 2:
        raise ValueError("returns_matrix must be 2D (T x N)")
    T, N = returns_matrix.shape
    if T < 4 or N < 2:
        return {
            "pbo_pct": 50.0,
            "overfit_count": 0,
            "total_splits": 0,
            "warning": "insufficient data for CSCV (T<4 or N<2)",
        }

    rng = np.random.default_rng(seed)
    overfit_count = 0
    valid_splits = 0

    for _ in range(n_splits):
        indices = rng.permutation(T)
        half = T // 2
        if half < 2:
            continue
        train_idx = indices[:half]
        test_idx = indices[half:]

        train_perf = returns_matrix[train_idx].mean(axis=0)  # (N,)
        test_perf = returns_matrix[test_idx].mean(axis=0)  # (N,)

        # rank: 0 = best
        is_rank = np.argsort(np.argsort(-train_perf))
        oos_rank = np.argsort(np.argsort(-test_perf))

        best_is_idx = int(np.argmax(train_perf))
        # overfit if best IS strategy is in worst half OOS
        if oos_rank[best_is_idx] >= N // 2:
            overfit_count += 1
        valid_splits += 1

    pbo = (overfit_count / valid_splits * 100.0) if valid_splits > 0 else 50.0
    return {
        "pbo_pct": round(pbo, 1),
        "overfit_count": overfit_count,
        "total_splits": valid_splits,
        "warning": None,
    }


def estimate_pbo_from_sharpe(
    sharpe: float,
    n_observations: int,
    n_trials: int,
) -> float:
    """Conservative PBO estimate without a full returns matrix.

    Approximates the probability that the best of *n_trials* random strategies
    would achieve a Sharpe at least as extreme as the observed one.

    PBO_est = 1 - [Phi(SR * sqrt(T-1))]^n_trials

    Parameters
    ----------
    sharpe : float
        Observed Sharpe ratio (per-trade or annualised).
    n_observations : int
        Number of observations (trades).
    n_trials : int
        Number of parameter configurations tested.

    Returns
    -------
    float
        Estimated PBO as a percentage (clamped to [1, 99]).
    """
    if n_trials < 1 or n_observations < 2:
        return 50.0
    t_stat = sharpe * math.sqrt(n_observations - 1)
    p_random = float(sp_stats.norm.cdf(t_stat))
    p_best_beats = 1.0 - (p_random ** n_trials)
    return round(max(1.0, min(99.0, p_best_beats * 100.0)), 1)


# ---------------------------------------------------------------------------
# Minimum Backtest Length (MBL)
# ---------------------------------------------------------------------------


def minimum_backtest_length(
    sharpe: float,
    alpha: float = 0.05,
) -> dict[str, Any]:
    """Compute the minimum number of trades/bars needed for a given Sharpe
    ratio to be statistically significant at the *alpha* level.

    MBL = 1 + (z_{alpha/2} / SR)^2

    This represents the number of *independent* observations required to
    distinguish the observed Sharpe from zero.

    Parameters
    ----------
    sharpe : float
        Observed Sharpe ratio (per-trade or annualised).
    alpha : float
        Significance level (default 0.05 for 95% confidence).

    Returns
    -------
    dict
        min_observations : int
            Minimum number of observations required.  Infinity if SR <= 0.
        z_critical : float
            Critical value used.
        alpha : float
            Significance level used.
        warning : str or None
        """
    z_crit = float(sp_stats.norm.ppf(1.0 - alpha / 2.0))
    if sharpe <= 0.0:
        return {
            "min_observations": float("inf"),
            "z_critical": z_crit,
            "alpha": alpha,
            "warning": "Sharpe ratio is non-positive; infinite observations required",
        }
    mbl = 1.0 + (z_crit / sharpe) ** 2.0
    return {
        "min_observations": math.ceil(mbl),
        "z_critical": z_crit,
        "alpha": alpha,
        "warning": None,
    }


# ---------------------------------------------------------------------------
# Bootstrap confidence interval (shared utility)
# ---------------------------------------------------------------------------


def bootstrap_confidence_interval(
    values: np.ndarray,
    alpha: float = 0.05,
    n_replications: int = 1000,
    seed: int = 13,
    statistic: str = "mean",
) -> dict[str, float]:
    """Compute bootstrap confidence interval for a statistic.

    Parameters
    ----------
    values : np.ndarray
        1-D array of observations.
    alpha : float
        Significance level (default 0.05 yields 95% CI).
    n_replications : int
        Number of bootstrap replications.
    seed : int
        Random seed.
    statistic : str
        Statistic to bootstrap: "mean" or "median".

    Returns
    -------
    dict
        lower : float
        upper : float
        observed : float
    """
    rng = np.random.default_rng(seed)
    n = len(values)
    stat_fn = np.mean if statistic == "mean" else np.median
    observed = float(stat_fn(values))
    stats_ = np.empty(n_replications)
    for i in range(n_replications):
        sample = rng.choice(values, size=n, replace=True)
        stats_[i] = float(stat_fn(sample))
    return {
        "lower": round(float(np.quantile(stats_, alpha / 2.0)), 4),
        "upper": round(float(np.quantile(stats_, 1.0 - alpha / 2.0)), 4),
        "observed": round(observed, 4),
    }
