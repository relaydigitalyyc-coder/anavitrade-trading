#!/usr/bin/env python3
"""Select the next batch of not-yet-tested Binance USD-M altcoin perpetuals.

Used by vps-locked-gate.sh so the VPS honest-testing cron continuously
expands coverage across the altcoin universe instead of re-fetching fresh
candles for the same fixed pair list every run. Majors are excluded
(EMPIRICAL_FINDINGS.md: "Edge is on Alts, Not Majors" -- BTC/ETH/BNB are
net-negative on the ICR edge, same exclusion GATE_CONFIG.majors applies
live in src/server/signals/dispatch-gate.ts).

Deliberately does NOT prioritize by highest 24h quoteVolume -- the ICR edge
has repeatedly shown up on smaller, lesser-known altcoins (EMPIRICAL_FINDINGS.md
"Edge is on Alts, Not Majors"; CLAUDE.md's known-good pairs -- PLUMEUSDT,
OPNUSDT, XPLUSDT, WCTUSDT, HEIUSDT -- are mid/small-cap, not top-volume
names), and a volume-descending queue would keep testing mega-caps first and
might never reach the long tail. Instead this ranks ascending by 24h
quoteVolume (smallest liquid alts first, after a floor to skip dead/illiquid
symbols) so the search actively goes where the edge has been found, not where
the liquidity is. Once every symbol in the current universe has been tested
at least once, the cycle resets and starts again from the bottom.

Usage:
  python3 scripts/ml/select-untested-pairs.py \
    --batch-size 20 \
    --output scripts/data/pairs/locked-gate-batch-YYYYMMDD.json \
    --state scripts/cortex/memory/tested-pairs.json
"""
from __future__ import annotations

import argparse
import json
import os
import urllib.request
from pathlib import Path

FAPI = "https://fapi.binance.com/fapi/v1"
EXCHANGE_INFO_URL = f"{FAPI}/exchangeInfo"
TICKER_24HR_URL = f"{FAPI}/ticker/24hr"
DEFAULT_MAJORS = ("BTCUSDT", "ETHUSDT", "BNBUSDT")


def _fetch_json(url: str, api_key: str = "") -> object:
    """fapi.binance.com is geo-blocked (HTTP 451) from some IPs, including the
    production VPS -- same issue already documented for kline-cron.ts and
    fetch-klines-mtf.mjs. X-MBX-APIKEY bypasses it; no trading permission
    needed, a read-only key is sufficient for exchangeInfo/ticker."""
    request = urllib.request.Request(url)
    if api_key:
        request.add_header("X-MBX-APIKEY", api_key)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


MIN_QUOTE_VOLUME_24H = 500_000.0  # floor to skip near-dead/illiquid symbols, not a cap-size filter


def ranked_universe(majors: tuple[str, ...] = DEFAULT_MAJORS,
                     min_quote_volume: float = MIN_QUOTE_VOLUME_24H,
                     api_key: str = "") -> list[str]:
    """Live USDT perpetuals, TRADING status, majors excluded, ranked by 24h
    quoteVolume ASCENDING (smallest liquid alts first -- see module docstring
    for why: the edge shows up on smaller alts, not the top-volume names)."""
    info = _fetch_json(EXCHANGE_INFO_URL, api_key)
    tickers = _fetch_json(TICKER_24HR_URL, api_key)

    volume_by_symbol = {t["symbol"]: float(t.get("quoteVolume") or 0) for t in tickers}
    candidates = [
        s["symbol"] for s in info["symbols"]
        if s["symbol"].endswith("USDT")
        and s["symbol"].isascii() and s["symbol"].replace("USDT", "").isalnum()
        and s.get("status") == "TRADING"
        and s.get("contractType") == "PERPETUAL"
        and s["symbol"] not in majors
        and volume_by_symbol.get(s["symbol"], 0.0) >= min_quote_volume
    ]
    candidates.sort(key=lambda sym: volume_by_symbol.get(sym, 0.0))
    return candidates


def select_batch(universe: list[str], tested: set[str], batch_size: int) -> tuple[list[str], bool]:
    """Returns (selected symbols, cycle_reset). Resets (clears effective `tested`
    for this selection) when fewer than batch_size untested symbols remain."""
    untested = [s for s in universe if s not in tested]
    cycle_reset = len(untested) < batch_size
    if cycle_reset:
        untested = universe  # start a fresh cycle from the smallest-liquidity end again
    return untested[:batch_size], cycle_reset


def load_state(path: Path) -> set[str]:
    if not path.exists():
        return set()
    try:
        return set(json.loads(path.read_text()).get("tested", []))
    except (json.JSONDecodeError, OSError):
        return set()


def save_state(path: Path, tested: set[str], cycle_reset: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    existing_cycles = 0
    if path.exists():
        try:
            existing_cycles = json.loads(path.read_text()).get("cycles_completed", 0)
        except (json.JSONDecodeError, OSError):
            pass
    payload = {
        "tested": sorted(tested),
        "cycles_completed": existing_cycles + (1 if cycle_reset else 0),
    }
    path.write_text(json.dumps(payload, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-size", type=int, default=20)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--majors", default=",".join(DEFAULT_MAJORS))
    parser.add_argument("--api-key", default=os.environ.get("BINANCE_API_KEY", ""),
                         help="X-MBX-APIKEY header value; defaults to $BINANCE_API_KEY. "
                              "Needed to bypass fapi.binance.com geo-block (HTTP 451) "
                              "from the VPS; read-only key, no trading permission required.")
    args = parser.parse_args()

    majors = tuple(m.strip() for m in args.majors.split(",") if m.strip())
    universe = ranked_universe(majors, api_key=args.api_key)
    tested = load_state(args.state)
    batch, cycle_reset = select_batch(universe, tested, args.batch_size)

    if not batch:
        raise SystemExit("no candidate pairs found -- exchangeInfo/ticker returned nothing usable")

    tested_after = (set() if cycle_reset else tested) | set(batch)
    save_state(args.state, tested_after, cycle_reset)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(batch, indent=2))

    print(f"universe={len(universe)} tested_before={len(tested)} "
          f"{'CYCLE_RESET ' if cycle_reset else ''}batch={len(batch)} -> {args.output}")
    print(f"  {batch}")


if __name__ == "__main__":
    main()
