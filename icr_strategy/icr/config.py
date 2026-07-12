from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class StrategyConfig(BaseModel):
    """Deterministic rules for the Impulse Compression Reclaim strategy.

    The base model is the April ICR engine. Optional confluence modules add
    ICT/SMT/divergence/MTF research annotations without allowing live trading.
    """

    fast_ma: int = Field(default=7, ge=2)
    mid_ma: int = Field(default=25, ge=3)
    slow_ma: int = Field(default=99, ge=10)
    atr_length: int = Field(default=14, ge=2)
    volume_ma_length: int = Field(default=20, ge=2)
    ma_slope_lookback: int = Field(default=5, ge=1)

    lookback_structure: int = Field(default=50, ge=10)
    min_impulse_bars: int = Field(default=3, ge=2)
    max_impulse_bars: int = Field(default=12, ge=3)
    min_pullback_bars: int = Field(default=3, ge=1)
    compression_lookback: int = Field(default=10, ge=4)
    max_signal_age_after_impulse: int = Field(default=28, ge=8)

    impulse_atr_mult: float = Field(default=1.5, gt=0)
    impulse_volume_mult: float = Field(default=1.05, gt=0)
    pullback_volume_max_ratio: float = Field(default=1.05, gt=0)
    compression_range_ratio: float = Field(default=0.92, gt=0)
    compression_atr_ratio: float = Field(default=0.98, gt=0)
    near_ma_atr_mult: float = Field(default=1.25, gt=0)
    ma_separation_atr_mult: float = Field(default=0.05, ge=0)
    candle_close_position_threshold: float = Field(default=0.60, ge=0, le=1)

    score_threshold: int = Field(default=75, ge=0, le=100)
    min_rr: float = Field(default=2.5, gt=0)
    stop_atr_buffer: float = Field(default=0.10, ge=0)

    tp1_r: float = Field(default=2.0, gt=0)
    tp2_r: float = Field(default=3.5, gt=0)
    tp1_fraction: float = Field(default=0.40, ge=0, le=1)
    tp2_fraction: float = Field(default=0.30, ge=0, le=1)
    runner_fraction: float = Field(default=0.30, ge=0, le=1)
    move_to_be_after_r: float = Field(default=1.5, gt=0)
    use_breakeven: bool = True
    use_ma25_runner_trail: bool = True

    allow_longs: bool = True
    allow_shorts: bool = True

    # Memory-integrated research modules.
    enable_ict: bool = True
    enable_divergence: bool = True
    enable_mtf: bool = True
    enable_smt: bool = False
    enable_currency_strength: bool = False
    enable_predictive_tags: bool = True
    enable_meta_labels: bool = True
    enable_coinlegs: bool = True
    coinlegs_score_cap: int = Field(default=10, ge=0, le=20)

    # Optional HTF coil gate. When enabled, ICR entries must occur during a
    # quantified compression/coiling regime. The score is expected in the input
    # candles as `coil_score`, usually produced by coiling_pump.annotate_market_with_coil_scores.
    enable_coil_gate: bool = False
    min_coil_score: float = Field(default=72.0, ge=0, le=100)
    coil_score_bonus_cap: int = Field(default=6, ge=0, le=12)


    # MTF defaults mirror the old scanner idea: 5m/15m/1h with H4/D1 context
    # available for research reports when the data supports resampling.
    mtf_timeframes: tuple[str, ...] = ("15min", "1h", "4h")
    mtf_required_agreement: int = Field(default=1, ge=0)
    mtf_bonus_cap: int = Field(default=8, ge=0, le=20)
    mtf_penalty_per_conflict: int = Field(default=4, ge=0, le=20)

    ict_lookback: int = Field(default=60, ge=10)
    ote_min_retrace: float = Field(default=0.62, ge=0, le=1)
    ote_max_retrace: float = Field(default=0.79, ge=0, le=1)
    fvg_max_age: int = Field(default=40, ge=3)
    ob_max_age: int = Field(default=50, ge=3)
    sweep_lookback: int = Field(default=20, ge=5)
    ny_killzone_bonus: int = Field(default=2, ge=0, le=5)

    divergence_lookback: int = Field(default=30, ge=10)
    divergence_pivot_span: int = Field(default=2, ge=1)
    predictive_zscore_threshold: float = Field(default=2.0, gt=0)
    bollinger_length: int = Field(default=20, ge=5)
    bollinger_std: float = Field(default=2.0, gt=0)

    # Optional execution filters for exchange-style research. Set to None to disable.
    max_spread_bps: float | None = Field(default=None, ge=0)
    min_volume_ma20: float | None = Field(default=None, ge=0)

    @field_validator("max_impulse_bars")
    @classmethod
    def _validate_impulse_lengths(cls, v: int, info):
        min_bars = info.data.get("min_impulse_bars")
        if min_bars is not None and v < min_bars:
            raise ValueError("max_impulse_bars must be >= min_impulse_bars")
        return v

    @field_validator("runner_fraction")
    @classmethod
    def _validate_exit_fractions(cls, v: float, info):
        tp1 = info.data.get("tp1_fraction", 0.0)
        tp2 = info.data.get("tp2_fraction", 0.0)
        total = tp1 + tp2 + v
        if abs(total - 1.0) > 1e-9:
            raise ValueError("tp1_fraction + tp2_fraction + runner_fraction must equal 1.0")
        return v

    @field_validator("ote_max_retrace")
    @classmethod
    def _validate_ote_zone(cls, v: float, info):
        mn = info.data.get("ote_min_retrace")
        if mn is not None and v < mn:
            raise ValueError("ote_max_retrace must be >= ote_min_retrace")
        return v


class BacktestConfig(BaseModel):
    """Execution assumptions for historical research."""

    initial_equity: float = Field(default=10_000.0, gt=0)
    risk_per_trade_pct: float = Field(default=0.01, gt=0, le=1)
    max_daily_loss_r: float = Field(default=3.0, gt=0)
    max_open_positions: int = Field(default=3, ge=1)
    max_open_per_symbol: int = Field(default=1, ge=1)
    max_open_per_cluster: int = Field(default=2, ge=1)
    enforce_portfolio_chronology: bool = True
    enforce_daily_loss_limit: bool = True
    enforce_correlation_clusters: bool = True
    fee_rate: float = Field(default=0.0004, ge=0)
    slippage_bps: float = Field(default=2.0, ge=0)
    same_candle_policy: Literal["stop_first"] = "stop_first"
    output_dir: Path = Field(default=Path("outputs"))
