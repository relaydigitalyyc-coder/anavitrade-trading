from __future__ import annotations

import argparse
import json
from pathlib import Path

from .audit import run_quant_audit, write_audit_reports
from .backtester import Backtester
from .binance_data import (
    default_completed_month,
    download_monthly_archives,
    parse_interval_list,
    parse_symbol_list,
    write_altcoin_manifest,
)
from .coiling_pump import CoilConfig, run_coil_research, write_coil_reports
from .coinlegs import scrape_marketdetails_browser_many, scrape_marketdetails_many, write_coinlegs_template
from .coinlegs_fusion import attach_coinlegs_to_markets, coinlegs_market_snapshot, enrich_coinlegs_snapshot, read_and_enrich_coinlegs_snapshot
from .config import BacktestConfig, StrategyConfig
from .data_loader import MarketData, load_many
from .matrix import currency_strength_frame, latest_matrix
from .reporting import write_reports
from .real_edge import run_real_edge_research
from .sample_data import generate_sample_csv


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Impulse Compression Reclaim research backtester.")
    parser.add_argument("--input", type=str, help="CSV file or directory of direct CSV files. Required unless --generate-sample or --binance-htf is used.")
    parser.add_argument("--output", type=str, default="outputs", help="Output report directory.")
    parser.add_argument("--timeframe", type=str, default="1H", help="Label for the candle timeframe.")
    parser.add_argument("--generate-sample", action="store_true", help="Generate and backtest deterministic sample data.")
    parser.add_argument("--score-threshold", type=int, default=75)
    parser.add_argument("--min-rr", type=float, default=2.5)
    parser.add_argument("--risk-pct", type=float, default=0.01)
    parser.add_argument("--fee-rate", type=float, default=0.0004)
    parser.add_argument("--slippage-bps", type=float, default=2.0)
    parser.add_argument("--no-shorts", action="store_true")
    parser.add_argument("--no-longs", action="store_true")
    parser.add_argument("--disable-ict", action="store_true")
    parser.add_argument("--disable-divergence", action="store_true")
    parser.add_argument("--disable-mtf", action="store_true")
    parser.add_argument("--disable-coinlegs", action="store_true", help="Disable Coinlegs derivatives-intelligence confluence even if snapshot columns are present.")
    parser.add_argument("--coinlegs-snapshot", type=str, default=None, help="CSV snapshot exported/copied from Coinlegs or manually filled from docs/coinlegs_snapshot_template.csv.")
    parser.add_argument("--coinlegs-scrape-symbols", type=str, default=None, help="Comma-separated symbols to try from public Coinlegs marketdetails pages. No login/paywall bypass is used.")
    parser.add_argument("--coinlegs-browser", action="store_true", help="Use optional Playwright browser rendering for Coinlegs public pages. Requires requirements-browser.txt and chromium.")
    parser.add_argument("--coinlegs-exchange", type=str, default="Binance")
    parser.add_argument("--coinlegs-sleep", type=float, default=0.50, help="Polite sleep between Coinlegs public page fetch attempts.")
    parser.add_argument("--coinlegs-template", action="store_true", help="Write a Coinlegs snapshot CSV template into the output directory and exit if no market input is supplied.")
    parser.add_argument("--max-spread-bps", type=float, default=None)
    parser.add_argument("--min-volume-ma20", type=float, default=None)
    parser.add_argument("--no-audit", action="store_true", help="Skip the 200-question quant audit outputs.")
    parser.add_argument("--exhaustive-audit", action="store_true", help="Run full slow ablation/stress/walk-forward inside the 200-litmus audit. Use for real research, not quick smoke tests.")

    parser.add_argument("--htf-coil-scan", action="store_true", help="Write higher-timeframe coiling-pump research reports for the loaded candles.")
    parser.add_argument("--real-edge-report", action="store_true", help="Run the full real-edge research pack: combo ablations, yearly walk-forward, false-positive traps, threshold sweep, edge decision.")
    parser.add_argument("--coil-threshold", type=float, default=72.0, help="Minimum coil score for qualified coiling-pump events.")
    parser.add_argument("--pump-threshold", type=float, default=0.12, help="Forward MFE threshold used as the pump label, e.g. 0.12 = 12%.")
    parser.add_argument("--binance-htf", action="store_true", help="Download Binance public altcoin klines, then run HTF ICR + coil-pump research.")
    parser.add_argument("--binance-symbols", type=str, default=None, help="Comma-separated Binance symbols. Default is the built-in liquid altcoin USDT basket.")
    parser.add_argument("--binance-intervals", type=str, default="4h,1d", help="Comma-separated HTF intervals for Binance research, default 4h,1d.")
    parser.add_argument("--binance-start", type=str, default="2023-01", help="Monthly archive start month YYYY-MM.")
    parser.add_argument("--binance-end", type=str, default=None, help="Monthly archive end month YYYY-MM. Default is prior completed month.")
    parser.add_argument("--binance-sleep", type=float, default=0.15, help="Polite sleep between Binance archive downloads.")
    return parser.parse_args()


def _build_configs(args: argparse.Namespace) -> tuple[StrategyConfig, BacktestConfig, CoilConfig]:
    strategy_cfg = StrategyConfig(
        score_threshold=args.score_threshold,
        min_rr=args.min_rr,
        allow_longs=not args.no_longs,
        allow_shorts=not args.no_shorts,
        enable_ict=not args.disable_ict,
        enable_divergence=not args.disable_divergence,
        enable_mtf=not args.disable_mtf,
        enable_coinlegs=not args.disable_coinlegs,
        max_spread_bps=args.max_spread_bps,
        min_volume_ma20=args.min_volume_ma20,
    )
    backtest_cfg = BacktestConfig(
        risk_per_trade_pct=args.risk_pct,
        fee_rate=args.fee_rate,
        slippage_bps=args.slippage_bps,
        output_dir=Path(args.output),
    )
    coil_cfg = CoilConfig(threshold=args.coil_threshold, pump_threshold=args.pump_threshold)
    return strategy_cfg, backtest_cfg, coil_cfg




def _coinlegs_from_args(args: argparse.Namespace, output_dir: Path) -> tuple[pd.DataFrame | None, dict[str, str]]:
    import pandas as pd

    paths: dict[str, str] = {}
    if args.coinlegs_template:
        template_path = write_coinlegs_template(output_dir / "coinlegs_snapshot_template.csv")
        paths["coinlegs_template"] = str(template_path)

    snapshot = None
    if args.coinlegs_snapshot:
        snapshot = read_and_enrich_coinlegs_snapshot(args.coinlegs_snapshot)
    elif args.coinlegs_scrape_symbols:
        raw = (scrape_marketdetails_browser_many if args.coinlegs_browser else scrape_marketdetails_many)(
            parse_symbol_list(args.coinlegs_scrape_symbols),
            exchange=args.coinlegs_exchange,
            sleep_seconds=args.coinlegs_sleep,
        )
        raw_path = output_dir / "coinlegs_raw_snapshot.csv"
        raw.to_csv(raw_path, index=False)
        paths["coinlegs_raw_snapshot"] = str(raw_path)
        if raw.attrs.get("errors"):
            err_path = output_dir / "coinlegs_scrape_errors.csv"
            pd.DataFrame(raw.attrs["errors"]).to_csv(err_path, index=False)
            paths["coinlegs_scrape_errors"] = str(err_path)
        snapshot = enrich_coinlegs_snapshot(raw)

    if snapshot is not None:
        enriched_path = output_dir / "coinlegs_enriched_snapshot.csv"
        snapshot.to_csv(enriched_path, index=False)
        paths["coinlegs_enriched_snapshot"] = str(enriched_path)
    return snapshot, paths


def _attach_coinlegs_if_available(markets: list[MarketData], snapshot: pd.DataFrame | None, output_dir: Path) -> tuple[list[MarketData], dict[str, str]]:
    paths: dict[str, str] = {}
    if snapshot is None or snapshot.empty:
        return markets, paths
    enriched = attach_coinlegs_to_markets(markets, snapshot)
    market_path = output_dir / "coinlegs_market_snapshot.csv"
    coinlegs_market_snapshot(enriched).to_csv(market_path, index=False)
    paths["coinlegs_market_snapshot"] = str(market_path)
    return enriched, paths

def _run_standard(args: argparse.Namespace, strategy_cfg: StrategyConfig, backtest_cfg: BacktestConfig, coil_cfg: CoilConfig) -> dict:
    output_dir = Path(args.output)
    if args.generate_sample:
        sample_path = output_dir / "sample_ohlcv.csv"
        generate_sample_csv(sample_path)
        input_path = sample_path
    elif args.input:
        input_path = Path(args.input)
    else:
        raise SystemExit("Provide --input PATH, use --generate-sample, or use --binance-htf.")

    output_dir.resolve().mkdir(parents=True, exist_ok=True)
    coinlegs_snapshot, coinlegs_paths = _coinlegs_from_args(args, output_dir.resolve())
    markets = load_many(input_path, timeframe=args.timeframe)
    markets, attached_paths = _attach_coinlegs_if_available(markets, coinlegs_snapshot, output_dir.resolve())
    result = Backtester(strategy_cfg, backtest_cfg).run_many(markets)
    paths = write_reports(result, output_dir)
    paths.update({k: Path(v) for k, v in coinlegs_paths.items()})
    paths.update({k: Path(v) for k, v in attached_paths.items()})
    output_dir.resolve().mkdir(parents=True, exist_ok=True)
    matrix_path = output_dir.resolve() / "matrix_snapshot.csv"
    strength_path = output_dir.resolve() / "currency_strength.csv"
    latest_matrix(markets, strategy_cfg).to_csv(matrix_path, index=False)
    currency_strength_frame(markets).to_csv(strength_path, index=False)
    paths["matrix_snapshot"] = matrix_path
    paths["currency_strength"] = strength_path
    if args.htf_coil_scan:
        coil_paths = write_coil_reports(run_coil_research(markets, strategy_cfg, coil_cfg), output_dir)
        paths.update(coil_paths)
    if args.real_edge_report:
        edge_payload = run_real_edge_research(markets, strategy_cfg, backtest_cfg, coil_cfg, output_dir / "real_edge", exhaustive_audit=args.exhaustive_audit)
        paths.update({f"real_edge_{k}": v for k, v in edge_payload["paths"].items()})
    if not args.no_audit:
        audit_bundle = run_quant_audit(result, markets, strategy_cfg, backtest_cfg, exhaustive=args.exhaustive_audit)
        paths.update(write_audit_reports(audit_bundle, output_dir))
    return {"summary": result.summary, "paths": {k: str(v) for k, v in paths.items() if v.exists()}}


def _run_binance_htf(args: argparse.Namespace, strategy_cfg: StrategyConfig, backtest_cfg: BacktestConfig, coil_cfg: CoilConfig) -> dict:
    output_root = Path(args.output).expanduser().resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    symbols = parse_symbol_list(args.binance_symbols)
    intervals = parse_interval_list(args.binance_intervals)
    end_month = args.binance_end or default_completed_month()
    manifest_path = write_altcoin_manifest(output_root / "binance_altcoin_manifest.csv", symbols)
    coinlegs_snapshot, coinlegs_root_paths = _coinlegs_from_args(args, output_root)
    data_root = output_root / "binance_data"
    written, fetch_records = download_monthly_archives(
        symbols=symbols,
        intervals=intervals,
        start_month=args.binance_start,
        end_month=end_month,
        output_dir=data_root,
        sleep_seconds=args.binance_sleep,
    )

    interval_summaries: dict[str, dict] = {}
    for interval in intervals:
        interval_dir = data_root / interval
        if not interval_dir.exists() or not any(interval_dir.glob("*.csv")):
            interval_summaries[interval] = {"status": "no_data", "message": f"No CSVs downloaded for {interval}."}
            continue
        interval_output = output_root / f"backtest_{interval}"
        interval_bt_cfg = backtest_cfg.model_copy(update={"output_dir": interval_output})
        markets = load_many(interval_dir, timeframe=interval)
        markets, attached_paths = _attach_coinlegs_if_available(markets, coinlegs_snapshot, interval_output)
        result = Backtester(strategy_cfg, interval_bt_cfg).run_many(markets)
        paths = write_reports(result, interval_output)
        paths.update({k: Path(v) for k, v in attached_paths.items()})
        latest_matrix(markets, strategy_cfg).to_csv(interval_output / "matrix_snapshot.csv", index=False)
        currency_strength_frame(markets).to_csv(interval_output / "currency_strength.csv", index=False)
        coil_paths = write_coil_reports(run_coil_research(markets, strategy_cfg, coil_cfg), interval_output)
        if args.real_edge_report:
            edge_payload = run_real_edge_research(markets, strategy_cfg, interval_bt_cfg, coil_cfg, interval_output / "real_edge", exhaustive_audit=args.exhaustive_audit)
            paths.update({f"real_edge_{k}": v for k, v in edge_payload["paths"].items()})
        if not args.no_audit:
            audit_bundle = run_quant_audit(result, markets, strategy_cfg, interval_bt_cfg, exhaustive=args.exhaustive_audit)
            paths.update(write_audit_reports(audit_bundle, interval_output))
        paths.update(coil_paths)
        interval_summaries[interval] = {
            "status": "ok",
            "markets": len(markets),
            "summary": result.summary,
            "paths": {k: str(v) for k, v in paths.items() if v.exists()},
        }

    ok_rows = sum(r.rows for r in fetch_records if r.status == "ok")
    summary = {
        "schema": "ICR_BINANCE_HTF_RUN_v1",
        "symbols_requested": symbols,
        "intervals_requested": intervals,
        "start_month": args.binance_start,
        "end_month": end_month,
        "manifest": str(manifest_path),
        "coinlegs_paths": coinlegs_root_paths,
        "downloaded_csv_files": len(written),
        "downloaded_rows": ok_rows,
        "fetch_records": len(fetch_records),
        "intervals": interval_summaries,
    }
    with (output_root / "binance_htf_run_summary.json").open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, allow_nan=False)
    return {"summary": summary, "paths": {"binance_htf_run_summary": str(output_root / "binance_htf_run_summary.json")}}


def main() -> int:
    args = parse_args()
    if args.coinlegs_template and not (args.input or args.generate_sample or args.binance_htf):
        out = Path(args.output).expanduser().resolve()
        out.mkdir(parents=True, exist_ok=True)
        path = write_coinlegs_template(out / "coinlegs_snapshot_template.csv")
        print(json.dumps({"coinlegs_template": str(path)}, indent=2))
        return 0
    strategy_cfg, backtest_cfg, coil_cfg = _build_configs(args)
    if args.binance_htf:
        payload = _run_binance_htf(args, strategy_cfg, backtest_cfg, coil_cfg)
    else:
        payload = _run_standard(args, strategy_cfg, backtest_cfg, coil_cfg)
    print(json.dumps(payload["summary"], indent=2, allow_nan=False))
    print("\nWrote reports:")
    for name, path in payload.get("paths", {}).items():
        print(f"- {name}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
