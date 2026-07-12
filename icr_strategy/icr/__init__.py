"""Impulse Compression Reclaim strategy research package."""

from .config import StrategyConfig, BacktestConfig
from .backtester import Backtester
from .edge_decision import StatisticalEdgeDecision, statistical_edge_test
from .stats import (
    bootstrap_confidence_interval,
    deflated_sharpe_ratio,
    minimum_backtest_length,
    probability_of_backtest_overfitting,
)
from .universe import EXNESS_UNIVERSE, currency_strength_from_returns

__all__ = [
    "StrategyConfig",
    "BacktestConfig",
    "Backtester",
    "EXNESS_UNIVERSE",
    "currency_strength_from_returns",
    "statistical_edge_test",
    "StatisticalEdgeDecision",
    "deflated_sharpe_ratio",
    "probability_of_backtest_overfitting",
    "minimum_backtest_length",
    "bootstrap_confidence_interval",
]
