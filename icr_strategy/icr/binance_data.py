from __future__ import annotations

import csv
import io
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass, asdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable

import pandas as pd

BINANCE_ARCHIVE_BASE = "https://data.binance.vision"
BINANCE_SPOT_REST_BASE = "https://api.binance.com"

KLINE_COLUMNS = [
    "open_time",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "close_time",
    "quote_asset_volume",
    "number_of_trades",
    "taker_buy_base_asset_volume",
    "taker_buy_quote_asset_volume",
    "ignore",
]

DEFAULT_ALTCOIN_USDT_SYMBOLS: tuple[str, ...] = (
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
    "DOGEUSDT",
    "ADAUSDT",
    "AVAXUSDT",
    "LINKUSDT",
    "NEARUSDT",
    "SUIUSDT",
    "SEIUSDT",
    "FETUSDT",
    "INJUSDT",
    "RUNEUSDT",
    "ARBUSDT",
    "OPUSDT",
    "APTUSDT",
    "WIFUSDT",
    "PEPEUSDT",
    "LTCUSDT",
    "DOTUSDT",
)


@dataclass(frozen=True)
class BinanceFetchRecord:
    symbol: str
    interval: str
    month: str | None
    source: str
    url: str
    status: str
    rows: int = 0
    message: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def normalize_symbol(symbol: str) -> str:
    clean = symbol.upper().replace("/", "").replace("_", "").strip()
    if not clean or not clean.isalnum():
        raise ValueError(f"Invalid Binance symbol: {symbol!r}")
    return clean


def parse_symbol_list(value: str | Iterable[str] | None) -> list[str]:
    if value is None:
        return list(DEFAULT_ALTCOIN_USDT_SYMBOLS)
    if isinstance(value, str):
        raw = [part.strip() for part in value.split(",")]
    else:
        raw = [str(part).strip() for part in value]
    out = []
    for symbol in raw:
        if symbol:
            out.append(normalize_symbol(symbol))
    if not out:
        raise ValueError("At least one symbol is required.")
    return list(dict.fromkeys(out))


def parse_interval_list(value: str | Iterable[str] | None) -> list[str]:
    if value is None:
        return ["4h", "1d"]
    if isinstance(value, str):
        raw = [part.strip() for part in value.split(",")]
    else:
        raw = [str(part).strip() for part in value]
    out = [part for part in raw if part]
    if not out:
        raise ValueError("At least one interval is required.")
    return out


def _parse_month(month: str) -> date:
    try:
        dt = datetime.strptime(month, "%Y-%m")
    except ValueError as exc:
        raise ValueError(f"Month must be YYYY-MM, got {month!r}") from exc
    return date(dt.year, dt.month, 1)


def _add_month(d: date) -> date:
    year = d.year + (1 if d.month == 12 else 0)
    month = 1 if d.month == 12 else d.month + 1
    return date(year, month, 1)


def iter_months(start_month: str, end_month: str) -> list[str]:
    start = _parse_month(start_month)
    end = _parse_month(end_month)
    if end < start:
        raise ValueError("end_month must be >= start_month")
    months = []
    cur = start
    while cur <= end:
        months.append(f"{cur.year:04d}-{cur.month:02d}")
        cur = _add_month(cur)
    return months


def default_completed_month(today: date | None = None) -> str:
    # Monthly Binance archive files are only reliable after month close, so use
    # the prior calendar month by default.
    today = today or date.today()
    first = date(today.year, today.month, 1)
    prev = date(first.year - 1, 12, 1) if first.month == 1 else date(first.year, first.month - 1, 1)
    return f"{prev.year:04d}-{prev.month:02d}"


def archive_zip_url(symbol: str, interval: str, month: str, market: str = "spot") -> str:
    symbol = normalize_symbol(symbol)
    if market != "spot":
        raise ValueError("Only spot archive downloading is implemented in this repo.")
    path = f"/data/spot/monthly/klines/{symbol}/{interval}/{symbol}-{interval}-{month}.zip"
    return BINANCE_ARCHIVE_BASE + path


def _http_get_bytes(url: str, timeout: float = 30.0) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "icr-strategy-research/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as response:  # noqa: S310 - public market-data URL
        return response.read()


def _timestamp_unit(series: pd.Series) -> str:
    vmax = int(series.dropna().astype("int64").max())
    if vmax >= 10**15:
        return "us"
    if vmax >= 10**12:
        return "ms"
    return "s"


def klines_raw_to_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])
    df = df.copy()
    if len(df.columns) < 6:
        raise ValueError("Kline data must have at least 6 columns")
    df.columns = KLINE_COLUMNS[: len(df.columns)]
    unit = _timestamp_unit(df["open_time"])
    out = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(df["open_time"].astype("int64"), unit=unit, utc=True),
            "open": pd.to_numeric(df["open"], errors="raise"),
            "high": pd.to_numeric(df["high"], errors="raise"),
            "low": pd.to_numeric(df["low"], errors="raise"),
            "close": pd.to_numeric(df["close"], errors="raise"),
            "volume": pd.to_numeric(df["volume"], errors="raise"),
        }
    )
    out = out.sort_values("timestamp").drop_duplicates("timestamp").reset_index(drop=True)
    return out


def read_archive_zip_bytes(payload: bytes) -> pd.DataFrame:
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        members = [name for name in zf.namelist() if name.lower().endswith(".csv")]
        if not members:
            raise ValueError("Archive did not contain a CSV file")
        with zf.open(members[0]) as fh:
            raw = pd.read_csv(fh, header=None)
    return klines_raw_to_ohlcv(raw)


def write_fetch_log(records: list[BinanceFetchRecord], path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump([r.to_dict() for r in records], f, indent=2)
    return path


def download_monthly_archives(
    symbols: Iterable[str],
    intervals: Iterable[str],
    start_month: str,
    end_month: str,
    output_dir: str | Path,
    sleep_seconds: float = 0.15,
    timeout: float = 30.0,
) -> tuple[list[Path], list[BinanceFetchRecord]]:
    """Download Binance public monthly kline archives and convert to repo CSVs.

    No API key is used. Files are saved as: output_dir/<interval>/<SYMBOL>_<interval>.csv.
    Missing delisted/not-listed months are logged and skipped instead of failing
    the whole research run.
    """
    out = Path(output_dir).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    months = iter_months(start_month, end_month)
    records: list[BinanceFetchRecord] = []
    written: list[Path] = []

    for interval in intervals:
        interval_dir = out / interval
        interval_dir.mkdir(parents=True, exist_ok=True)
        for symbol in symbols:
            symbol = normalize_symbol(symbol)
            frames: list[pd.DataFrame] = []
            for month in months:
                url = archive_zip_url(symbol, interval, month)
                try:
                    payload = _http_get_bytes(url, timeout=timeout)
                    frame = read_archive_zip_bytes(payload)
                    frames.append(frame)
                    records.append(BinanceFetchRecord(symbol, interval, month, "binance_archive", url, "ok", len(frame)))
                except urllib.error.HTTPError as exc:
                    records.append(BinanceFetchRecord(symbol, interval, month, "binance_archive", url, "missing_or_http_error", 0, f"HTTP {exc.code}"))
                except Exception as exc:  # noqa: BLE001 - research download log must preserve all failures
                    records.append(BinanceFetchRecord(symbol, interval, month, "binance_archive", url, "error", 0, f"{type(exc).__name__}: {exc}"))
                if sleep_seconds > 0:
                    time.sleep(sleep_seconds)
            if frames:
                merged = pd.concat(frames, ignore_index=True).sort_values("timestamp").drop_duplicates("timestamp")
                path = interval_dir / f"{symbol}_{interval}.csv"
                merged.to_csv(path, index=False)
                written.append(path)
            else:
                records.append(BinanceFetchRecord(symbol, interval, None, "binance_archive", "", "no_rows_written", 0, "No monthly archive rows downloaded for symbol/interval."))
    write_fetch_log(records, out / "binance_fetch_log.json")
    return written, records


def rest_klines_url(symbol: str, interval: str, limit: int = 1000, start_time_ms: int | None = None, end_time_ms: int | None = None) -> str:
    params: dict[str, str | int] = {"symbol": normalize_symbol(symbol), "interval": interval, "limit": int(limit)}
    if start_time_ms is not None:
        params["startTime"] = int(start_time_ms)
    if end_time_ms is not None:
        params["endTime"] = int(end_time_ms)
    return BINANCE_SPOT_REST_BASE + "/api/v3/klines?" + urllib.parse.urlencode(params)


def fetch_recent_rest_klines(symbol: str, interval: str, limit: int = 1000, timeout: float = 20.0) -> pd.DataFrame:
    """Fetch recent Binance spot REST klines. Useful for current scanning.

    This is a fallback/extension path. Historical bulk research should prefer
    monthly archives from data.binance.vision because they are reproducible.
    """
    url = rest_klines_url(symbol, interval, limit=limit)
    payload = _http_get_bytes(url, timeout=timeout)
    raw = pd.read_json(io.BytesIO(payload))
    return klines_raw_to_ohlcv(raw)


def write_altcoin_manifest(path: str | Path, symbols: Iterable[str] | None = None) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [{"symbol": normalize_symbol(s), "quote": "USDT", "research_bucket": "liquid_altcoin_default"} for s in (symbols or DEFAULT_ALTCOIN_USDT_SYMBOLS)]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["symbol", "quote", "research_bucket"])
        writer.writeheader()
        writer.writerows(rows)
    return path
