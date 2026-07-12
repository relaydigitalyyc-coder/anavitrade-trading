from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Literal

import pandas as pd

from .config import BacktestConfig, StrategyConfig
from .signals import Signal

Direction = Literal["long", "short"]


@dataclass
class ExitFill:
    timestamp: pd.Timestamp
    price: float
    fraction: float
    r_multiple: float
    reason: str

    def to_dict(self) -> dict:
        out = asdict(self)
        out["timestamp"] = self.timestamp.isoformat()
        return out


@dataclass
class Trade:
    symbol: str
    timeframe: str
    direction: Direction
    entry_time: pd.Timestamp
    entry_index: int
    entry: float
    initial_stop: float
    tp1: float
    tp2: float
    tp3: float
    score: int
    reason: str
    size_units: float
    risk_amount: float
    exits: list[ExitFill] = field(default_factory=list)
    exit_time: pd.Timestamp | None = None
    exit_index: int | None = None
    total_r: float = 0.0
    pnl_quote: float = 0.0
    status: str = "open"

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "direction": self.direction,
            "entry_time": self.entry_time.isoformat(),
            "entry_index": self.entry_index,
            "entry": self.entry,
            "initial_stop": self.initial_stop,
            "tp1": self.tp1,
            "tp2": self.tp2,
            "tp3": self.tp3,
            "score": self.score,
            "reason": self.reason,
            "size_units": self.size_units,
            "risk_amount": self.risk_amount,
            "exit_time": self.exit_time.isoformat() if self.exit_time is not None else None,
            "exit_index": self.exit_index,
            "total_r": self.total_r,
            "pnl_quote": self.pnl_quote,
            "status": self.status,
            "exits": [e.to_dict() for e in self.exits],
        }


def slippage_adjusted(price: float, direction: Direction, side: Literal["entry", "exit"], bps: float) -> float:
    slip = bps / 10_000.0
    if direction == "long":
        return price * (1 + slip) if side == "entry" else price * (1 - slip)
    return price * (1 - slip) if side == "entry" else price * (1 + slip)


def r_multiple(direction: Direction, entry: float, stop: float, exit_price: float) -> float:
    risk = abs(entry - stop)
    if risk <= 0:
        raise ValueError("Entry-stop distance must be positive.")
    if direction == "long":
        return (exit_price - entry) / risk
    return (entry - exit_price) / risk


def position_size(equity: float, risk_pct: float, entry: float, stop: float) -> tuple[float, float]:
    risk_amount = equity * risk_pct
    risk_per_unit = abs(entry - stop)
    if risk_per_unit <= 0:
        raise ValueError("Entry-stop distance must be positive.")
    return risk_amount / risk_per_unit, risk_amount


def create_trade(signal: Signal, equity: float, bt_cfg: BacktestConfig) -> Trade:
    effective_entry = slippage_adjusted(signal.entry, signal.direction, "entry", bt_cfg.slippage_bps)
    size, risk_amount = position_size(equity, bt_cfg.risk_per_trade_pct, effective_entry, signal.stop)
    return Trade(
        symbol=signal.symbol,
        timeframe=signal.timeframe,
        direction=signal.direction,
        entry_time=signal.timestamp,
        entry_index=signal.index,
        entry=effective_entry,
        initial_stop=signal.stop,
        tp1=signal.tp1,
        tp2=signal.tp2,
        tp3=signal.tp3,
        score=signal.score,
        reason=signal.reason,
        size_units=size,
        risk_amount=risk_amount,
    )


def close_trade_piece(
    trade: Trade,
    timestamp: pd.Timestamp,
    index: int,
    raw_price: float,
    fraction: float,
    reason: str,
    bt_cfg: BacktestConfig,
) -> None:
    if fraction <= 0:
        return
    if sum(e.fraction for e in trade.exits) + fraction > 1.0000001:
        raise ValueError("Cannot close more than 100% of a trade.")
    price = slippage_adjusted(raw_price, trade.direction, "exit", bt_cfg.slippage_bps)
    gross_r = r_multiple(trade.direction, trade.entry, trade.initial_stop, price)
    notional_entry = trade.entry * trade.size_units * fraction
    notional_exit = price * trade.size_units * fraction
    fees = (notional_entry + notional_exit) * bt_cfg.fee_rate
    fee_r = fees / trade.risk_amount if trade.risk_amount else 0.0
    net_piece_r = gross_r * fraction - fee_r
    trade.exits.append(ExitFill(timestamp=timestamp, price=price, fraction=fraction, r_multiple=net_piece_r, reason=reason))
    trade.total_r = sum(e.r_multiple for e in trade.exits)
    trade.pnl_quote = trade.total_r * trade.risk_amount
    if sum(e.fraction for e in trade.exits) >= 0.999999:
        trade.status = "closed"
        trade.exit_time = timestamp
        trade.exit_index = index


def remaining_fraction(trade: Trade) -> float:
    return max(0.0, 1.0 - sum(e.fraction for e in trade.exits))


def mtm_unrealized_r(trade: Trade, current_close: float) -> float:
    """Compute mark-to-market unrealised PnL in R units.

    Returns the R-multiple of the open (unclosed) portion of the trade at
    ``current_close``.  If the trade is fully closed or has zero remaining
    fraction, returns 0.0.
    """
    remaining = remaining_fraction(trade)
    if remaining <= 0 or trade.risk_amount <= 0:
        return 0.0
    risk = abs(trade.entry - trade.initial_stop)
    if risk <= 0:
        return 0.0
    if trade.direction == "long":
        return (current_close - trade.entry) / risk * remaining
    return (trade.entry - current_close) / risk * remaining

