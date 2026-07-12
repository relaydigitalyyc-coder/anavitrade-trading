from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Iterable, Literal

import pandas as pd

from .config import BacktestConfig, StrategyConfig
from .data_loader import MarketData
from .indicators import add_indicators
from .risk import Trade, close_trade_piece, create_trade, mtm_unrealized_r, remaining_fraction, r_multiple
from .signals import Signal, find_signal
from .universe import risk_cluster


def _clear_runtime_caches() -> None:
    try:
        from .mtf import clear_mtf_cache
        clear_mtf_cache()
    except Exception:
        pass


@dataclass(frozen=True)
class SkippedSignal:
    symbol: str
    timeframe: str
    index: int
    timestamp: pd.Timestamp
    direction: Literal["long", "short"]
    score: int
    reason: str

    def to_dict(self) -> dict:
        out = asdict(self)
        out["timestamp"] = self.timestamp.isoformat()
        return out


@dataclass
class BacktestResult:
    trades: list[Trade]
    signals: list[Signal]
    equity_curve: pd.DataFrame
    summary: dict
    skipped_signals: list[SkippedSignal]


@dataclass(frozen=True)
class _Candidate:
    timestamp: pd.Timestamp
    symbol: str
    timeframe: str
    index: int
    signal: Signal
    frame_key: str


class Backtester:
    """Historical research executor.

    `run_one` remains a simple one-symbol sequential backtest. `run_many` is a
    chronological portfolio executor. It scans candidate signals per market,
    sorts them by timestamp, then enforces max open positions, per-symbol caps,
    correlation-cluster caps, and realized daily loss breakers before opening the
    next trade. Trades are still resolved candle-by-candle with next-candle entry
    and conservative stop-first intrabar ambiguity.
    """

    def __init__(self, strategy_config: StrategyConfig | None = None, backtest_config: BacktestConfig | None = None):
        self.strategy_config = strategy_config or StrategyConfig()
        self.backtest_config = backtest_config or BacktestConfig()

    def run_many(self, markets: Iterable[MarketData]) -> BacktestResult:
        _clear_runtime_caches()
        market_list = list(markets)
        if len(market_list) <= 1 or not self.backtest_config.enforce_portfolio_chronology:
            # Preserve the deterministic single-market path and make one-market
            # runs easy to reason about in unit tests.
            all_trades: list[Trade] = []
            all_signals: list[Signal] = []
            all_skips: list[SkippedSignal] = []
            equity = self.backtest_config.initial_equity
            equity_points: list[dict] = []
            for market in market_list:
                result = self.run_one(market, starting_equity=equity)
                all_trades.extend(result.trades)
                all_signals.extend(result.signals)
                all_skips.extend(result.skipped_signals)
                if not result.equity_curve.empty:
                    equity = float(result.equity_curve["equity"].iloc[-1])
                    equity_points.extend(result.equity_curve.to_dict("records"))
            equity_curve = pd.DataFrame(equity_points)
            summary = self._summarise(all_trades, equity_curve, skipped=all_skips)
            _clear_runtime_caches()
            return BacktestResult(all_trades, all_signals, equity_curve, summary, all_skips)

        return self._run_many_chronological(market_list)

    def _generate_candidates(self, markets: list[MarketData]) -> tuple[list[_Candidate], dict[str, pd.DataFrame]]:
        cfg = self.strategy_config
        candidates: list[_Candidate] = []
        frames: dict[str, pd.DataFrame] = {}
        for market in markets:
            df = add_indicators(market.candles, cfg)
            frame_key = f"{market.symbol}|{market.timeframe}"
            frames[frame_key] = df
            min_index = max(cfg.slow_ma + cfg.ma_slope_lookback, cfg.lookback_structure + cfg.max_impulse_bars + cfg.compression_lookback)
            for i in range(min_index, len(df) - 2):
                signal = find_signal(df, i, market.symbol, market.timeframe, cfg)
                if signal is not None:
                    candidates.append(_Candidate(signal.timestamp, market.symbol, market.timeframe, i, signal, frame_key))
        candidates.sort(key=lambda c: (c.timestamp.value, c.symbol, c.index))
        return candidates, frames

    def _run_many_chronological(self, markets: list[MarketData]) -> BacktestResult:
        bt_cfg = self.backtest_config
        candidates, frames = self._generate_candidates(markets)
        equity = bt_cfg.initial_equity
        active: list[Trade] = []
        closed: list[Trade] = []
        signals: list[Signal] = []
        skipped: list[SkippedSignal] = []
        equity_points: list[dict] = []
        realized_daily_r: dict[pd.Timestamp, float] = {}

        def flush_closed_through(timestamp: pd.Timestamp) -> None:
            nonlocal equity, active
            still_active: list[Trade] = []
            to_close = sorted([t for t in active if t.exit_time is not None and t.exit_time <= timestamp], key=lambda t: t.exit_time)
            for trade in to_close:
                equity += trade.pnl_quote
                closed.append(trade)
                day = pd.Timestamp(trade.exit_time).normalize()
                realized_daily_r[day] = realized_daily_r.get(day, 0.0) + trade.total_r
                equity_points.append(
                    {
                        "timestamp": trade.exit_time.isoformat() if trade.exit_time is not None else timestamp.isoformat(),
                        "symbol": trade.symbol,
                        "equity": equity,
                        "trade_total_r": trade.total_r,
                        "trade_pnl_quote": trade.pnl_quote,
                        "open_positions_after_close": max(0, len(active) - len(to_close)),
                    }
                )
            closed_ids = {id(t) for t in to_close}
            for trade in active:
                if id(trade) not in closed_ids:
                    still_active.append(trade)
            active = still_active

        def _compute_mtm_daily_r(day: pd.Timestamp, asof_ts: pd.Timestamp) -> float:
            """Compute unrealised MTM R for active trades on this day.

            Only negative (loss-making) unrealised PnL is counted toward the
            daily loss breaker.  Positive unrealised PnL is not netted against
            realised losses — the breaker is conservative.
            """
            mtm = 0.0
            for trade in active:
                remaining = remaining_fraction(trade)
                if remaining <= 0:
                    continue
                frame_key = f"{trade.symbol}|{trade.timeframe}"
                df_t = frames.get(frame_key)
                if df_t is None:
                    continue
                ts_col = pd.to_datetime(df_t["timestamp"], utc=True, errors="coerce")
                mask = ts_col <= asof_ts
                if not mask.any():
                    continue
                last_idx = mask.values.nonzero()[0][-1]
                close_price = float(df_t.iloc[last_idx].close)
                ur = mtm_unrealized_r(trade, close_price)
                if ur < 0:
                    mtm += ur
            return mtm

        for candidate in candidates:
            signal = candidate.signal
            flush_closed_through(signal.timestamp)
            day = pd.Timestamp(signal.timestamp).normalize()
            if bt_cfg.enforce_daily_loss_limit:
                mtm_loss = _compute_mtm_daily_r(day, signal.timestamp) if active else 0.0
                total_daily = realized_daily_r.get(day, 0.0) + mtm_loss
                if total_daily <= -abs(bt_cfg.max_daily_loss_r):
                    breaker_reason = "daily_loss_breaker" if mtm_loss >= 0 else "daily_loss_breaker_mtm"
                    skipped.append(self._skip(signal, breaker_reason))
                    continue
            if len(active) >= bt_cfg.max_open_positions:
                skipped.append(self._skip(signal, "max_open_positions"))
                continue
            same_symbol_open = sum(1 for t in active if t.symbol == signal.symbol)
            if same_symbol_open >= bt_cfg.max_open_per_symbol:
                skipped.append(self._skip(signal, "max_open_per_symbol"))
                continue
            if bt_cfg.enforce_correlation_clusters:
                cluster = risk_cluster(signal.symbol)
                same_cluster_open = sum(1 for t in active if risk_cluster(t.symbol) == cluster)
                if same_cluster_open >= bt_cfg.max_open_per_cluster:
                    skipped.append(self._skip(signal, f"max_open_cluster:{cluster}"))
                    continue

            trade = create_trade(signal, equity, bt_cfg)
            df = frames[candidate.frame_key]
            self._resolve_trade(df, trade, signal, start_index=signal.index + 1)
            # The position is now known but not booked into equity until its
            # historical exit time is reached by the portfolio clock.
            active.append(trade)
            signals.append(signal)

        flush_closed_through(pd.Timestamp.max.tz_localize("UTC"))
        equity_curve = pd.DataFrame(equity_points).sort_values("timestamp").reset_index(drop=True) if equity_points else pd.DataFrame()
        summary = self._summarise(closed, equity_curve, skipped=skipped)
        _clear_runtime_caches()
        return BacktestResult(closed, signals, equity_curve, summary, skipped)

    @staticmethod
    def _skip(signal: Signal, reason: str) -> SkippedSignal:
        return SkippedSignal(
            symbol=signal.symbol,
            timeframe=signal.timeframe,
            index=signal.index,
            timestamp=signal.timestamp,
            direction=signal.direction,
            score=signal.score,
            reason=reason,
        )

    def run_one(self, market: MarketData, starting_equity: float | None = None) -> BacktestResult:
        _clear_runtime_caches()
        cfg = self.strategy_config
        bt_cfg = self.backtest_config
        df = add_indicators(market.candles, cfg)
        min_index = max(cfg.slow_ma + cfg.ma_slope_lookback, cfg.lookback_structure + cfg.max_impulse_bars + cfg.compression_lookback)
        equity = starting_equity if starting_equity is not None else bt_cfg.initial_equity
        trades: list[Trade] = []
        signals: list[Signal] = []
        skipped: list[SkippedSignal] = []
        equity_points: list[dict] = []
        next_allowed_index = min_index
        realized_daily_r: dict[pd.Timestamp, float] = {}

        i = min_index
        while i < len(df) - 2:
            if i < next_allowed_index:
                i += 1
                continue
            signal = find_signal(df, i, market.symbol, market.timeframe, cfg)
            if signal is None:
                i += 1
                continue
            day = pd.Timestamp(signal.timestamp).normalize()
            if bt_cfg.enforce_daily_loss_limit and realized_daily_r.get(day, 0.0) <= -abs(bt_cfg.max_daily_loss_r):
                skipped.append(self._skip(signal, "daily_loss_breaker"))
                i += 1
                continue

            signals.append(signal)
            trade = create_trade(signal, equity, bt_cfg)
            exit_index = self._resolve_trade(df, trade, signal, start_index=i + 1)
            trades.append(trade)
            equity += trade.pnl_quote
            if trade.exit_time is not None:
                exit_day = pd.Timestamp(trade.exit_time).normalize()
                realized_daily_r[exit_day] = realized_daily_r.get(exit_day, 0.0) + trade.total_r
            equity_points.append(
                {
                    "timestamp": trade.exit_time.isoformat() if trade.exit_time is not None else df.iloc[-1].timestamp.isoformat(),
                    "symbol": market.symbol,
                    "equity": equity,
                    "trade_total_r": trade.total_r,
                    "trade_pnl_quote": trade.pnl_quote,
                    "open_positions_after_close": 0,
                }
            )
            next_allowed_index = max(exit_index + 1, i + 1)
            i = next_allowed_index

        equity_curve = pd.DataFrame(equity_points)
        summary = self._summarise(trades, equity_curve, skipped=skipped)
        _clear_runtime_caches()
        return BacktestResult(trades, signals, equity_curve, summary, skipped)

    def _resolve_trade(self, df: pd.DataFrame, trade: Trade, signal: Signal, start_index: int) -> int:
        cfg = self.strategy_config
        bt_cfg = self.backtest_config
        stop = trade.initial_stop
        tp1_hit = False
        tp2_hit = False
        be_armed = False

        for j in range(start_index, len(df)):
            row = df.iloc[j]
            timestamp = pd.Timestamp(row.timestamp)
            high = float(row.high)
            low = float(row.low)
            close = float(row.close)

            if trade.direction == "long":
                stop_hit = low <= stop
                tp1_hit_now = (not tp1_hit) and high >= signal.tp1
                tp2_hit_now = (not tp2_hit) and high >= signal.tp2
                tp3_hit_now = high >= signal.tp3
            else:
                stop_hit = high >= stop
                tp1_hit_now = (not tp1_hit) and low <= signal.tp1
                tp2_hit_now = (not tp2_hit) and low <= signal.tp2
                tp3_hit_now = low <= signal.tp3

            # Conservative policy: if a target and stop are both inside the same
            # candle, the stop resolves first. No intrabar path hallucination.
            if stop_hit:
                close_trade_piece(trade, timestamp, j, stop, remaining_fraction(trade), "stop", bt_cfg)
                return j

            if tp1_hit_now:
                close_trade_piece(trade, timestamp, j, signal.tp1, cfg.tp1_fraction, "tp1", bt_cfg)
                tp1_hit = True
                if trade.status == "closed":
                    return j
            if tp2_hit_now:
                close_trade_piece(trade, timestamp, j, signal.tp2, cfg.tp2_fraction, "tp2", bt_cfg)
                tp2_hit = True
                if trade.status == "closed":
                    return j
            if tp3_hit_now:
                close_trade_piece(trade, timestamp, j, signal.tp3, remaining_fraction(trade), "tp3", bt_cfg)
                return j

            # Stop upgrades are armed only after this candle is closed, so they
            # cannot improve same-candle fills.
            current_r = r_multiple(trade.direction, trade.entry, trade.initial_stop, close)
            if cfg.use_breakeven and not be_armed and current_r >= cfg.move_to_be_after_r:
                if trade.direction == "long":
                    stop = max(stop, trade.entry)
                else:
                    stop = min(stop, trade.entry)
                be_armed = True

            if cfg.use_ma25_runner_trail and be_armed and tp2_hit and pd.notna(row.ma25):
                if trade.direction == "long":
                    stop = max(stop, float(row.ma25))
                else:
                    stop = min(stop, float(row.ma25))

        last = df.iloc[-1]
        close_trade_piece(trade, pd.Timestamp(last.timestamp), len(df) - 1, float(last.close), remaining_fraction(trade), "end_of_data", bt_cfg)
        return len(df) - 1

    def _summarise(self, trades: list[Trade], equity_curve: pd.DataFrame, skipped: list[SkippedSignal] | None = None) -> dict:
        skipped = skipped or []
        if not trades:
            return {
                "total_trades": 0,
                "wins": 0,
                "losses": 0,
                "breakevens": 0,
                "win_rate_total": 0.0,
                "net_r": 0.0,
                "expectancy_r": 0.0,
                "average_win_r": 0.0,
                "average_loss_r": 0.0,
                "profit_factor_r": 0.0,
                "max_drawdown_quote": 0.0,
                "ending_equity": self.backtest_config.initial_equity,
                "skipped_signals": len(skipped),
            }
        r_values = [t.total_r for t in trades]
        wins = sum(1 for r in r_values if r > 0.05)
        losses = sum(1 for r in r_values if r < -0.05)
        breakevens = len(trades) - wins - losses
        gross_win = sum(r for r in r_values if r > 0)
        gross_loss = abs(sum(r for r in r_values if r < 0))
        if not equity_curve.empty:
            eq = equity_curve["equity"].astype(float)
            dd = (eq.cummax() - eq).max()
            ending_equity = float(eq.iloc[-1])
        else:
            dd = 0.0
            ending_equity = self.backtest_config.initial_equity
        return {
            "total_trades": len(trades),
            "wins": wins,
            "losses": losses,
            "breakevens": breakevens,
            "win_rate_total": wins / len(trades),
            "net_r": float(sum(r_values)),
            "expectancy_r": float(sum(r_values) / len(trades)),
            "average_win_r": float(gross_win / wins) if wins else 0.0,
            "average_loss_r": float(-gross_loss / losses) if losses else 0.0,
            "profit_factor_r": float(gross_win / gross_loss) if gross_loss else None,
            "max_drawdown_quote": float(dd),
            "ending_equity": ending_equity,
            "skipped_signals": len(skipped),
        }
