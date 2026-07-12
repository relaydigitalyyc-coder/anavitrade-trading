from __future__ import annotations

"""Coinlegs public-snapshot ingestion utilities.

The goal is to use Coinlegs as a derivatives-intelligence input without making
this research system dependent on private APIs, credentials, CAPTCHA bypasses,
or brittle recursive scraping. The module supports three safe modes:

1. Read a user-exported/saved CSV snapshot.
2. Parse static text/HTML captured from a public Coinlegs page.
3. Fetch a public URL with urllib. If the page is JavaScript-only, fail cleanly
   and ask the caller to use a browser-rendered snapshot/export instead.

No login, paywall, or anti-bot bypass code is included.
"""

import csv
import re
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

COINLEGS_BASE_URL = "https://www.coinlegs.com"
DEFAULT_EXCHANGE = "Binance"

CANONICAL_COLUMNS = [
    "timestamp",
    "exchange",
    "symbol",
    "price",
    "price_change_pct",
    "volume_24h_usd",
    "volume_change_1h_pct",
    "volume_change_4h_pct",
    "volume_change_6h_pct",
    "volume_change_24h_pct",
    "oi_usd",
    "oi_change_1h_pct",
    "oi_change_4h_pct",
    "funding_rate_pct",
    "predicted_funding_rate_pct",
    "long_short_ratio",
    "liquidation_1h_usd",
    "liquidation_4h_usd",
    "liquidation_24h_usd",
    "source_url",
]

COLUMN_ALIASES = {
    "coin": "symbol",
    "pair": "symbol",
    "ticker": "symbol",
    "market": "symbol",
    "last": "price",
    "last_price": "price",
    "price_usd": "price",
    "change": "price_change_pct",
    "price_change": "price_change_pct",
    "price_change_24h": "price_change_pct",
    "price_change_24h_pct": "price_change_pct",
    "volume": "volume_24h_usd",
    "volume_24h": "volume_24h_usd",
    "turnover_24h": "volume_24h_usd",
    "turnover_24h_usd": "volume_24h_usd",
    "volume_change_1h": "volume_change_1h_pct",
    "volume_change_in_1_hour": "volume_change_1h_pct",
    "volume_change_4h": "volume_change_4h_pct",
    "volume_change_in_4_hours": "volume_change_4h_pct",
    "volume_change_6h": "volume_change_6h_pct",
    "volume_change_in_6_hours": "volume_change_6h_pct",
    "volume_change_24h": "volume_change_24h_pct",
    "open_interest": "oi_usd",
    "open_interest_usd": "oi_usd",
    "oi": "oi_usd",
    "oi_1h": "oi_change_1h_pct",
    "oi_1h_pct": "oi_change_1h_pct",
    "oi_change_1h": "oi_change_1h_pct",
    "oi_change_4h": "oi_change_4h_pct",
    "funding": "funding_rate_pct",
    "funding_rate": "funding_rate_pct",
    "predicted_funding": "predicted_funding_rate_pct",
    "predicted_funding_rate": "predicted_funding_rate_pct",
    "long_short": "long_short_ratio",
    "long_short_ratio_24h": "long_short_ratio",
    "ls_ratio": "long_short_ratio",
    "liq_1h": "liquidation_1h_usd",
    "liquidation_1h": "liquidation_1h_usd",
    "liquidations_1h": "liquidation_1h_usd",
    "liq_4h": "liquidation_4h_usd",
    "liquidation_4h": "liquidation_4h_usd",
    "liq_24h": "liquidation_24h_usd",
    "liquidation_24h": "liquidation_24h_usd",
    "liquidations_24h": "liquidation_24h_usd",
}


@dataclass(frozen=True)
class CoinlegsRecord:
    timestamp: str
    exchange: str
    symbol: str
    price: float | None = None
    price_change_pct: float | None = None
    volume_24h_usd: float | None = None
    volume_change_1h_pct: float | None = None
    volume_change_4h_pct: float | None = None
    volume_change_6h_pct: float | None = None
    volume_change_24h_pct: float | None = None
    oi_usd: float | None = None
    oi_change_1h_pct: float | None = None
    oi_change_4h_pct: float | None = None
    funding_rate_pct: float | None = None
    predicted_funding_rate_pct: float | None = None
    long_short_ratio: float | None = None
    liquidation_1h_usd: float | None = None
    liquidation_4h_usd: float | None = None
    liquidation_24h_usd: float | None = None
    source_url: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def normalize_symbol(symbol: str) -> str:
    s = str(symbol).strip().upper()
    s = re.sub(r"[^A-Z0-9]", "", s)
    if s.endswith("PERP"):
        s = s[:-4]
    if not s.endswith("USDT") and len(s) <= 10 and not s.endswith("USD"):
        # Coinlegs snippets often show base tickers on the homepage. For this
        # repo's Binance altcoin workflow, default the base to USDT.
        s = f"{s}USDT"
    return s


def _clean_label(label: str) -> str:
    s = str(label).strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return COLUMN_ALIASES.get(s, s)


def parse_number(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float, np.integer, np.floating)):
        if np.isfinite(float(value)):
            return float(value)
        return None
    s = str(value).strip()
    if not s or s.lower() in {"nan", "none", "null", "n/a", "na", "--", "-"}:
        return None
    s = s.replace("\u2212", "-").replace("$", "").replace(",", "").replace("%", "").strip()
    multiplier = 1.0
    suffix = s[-1:].upper()
    if suffix in {"K", "M", "B", "T"}:
        multiplier = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}[suffix]
        s = s[:-1]
    try:
        return float(s) * multiplier
    except ValueError:
        match = re.search(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", s)
        if not match:
            return None
        try:
            return float(match.group(0)) * multiplier
        except ValueError:
            return None


def _value_after_label(text: str, label_patterns: Iterable[str]) -> float | None:
    compact = re.sub(r"\s+", " ", text)
    number = r"([-+]?\$?\d[\d,]*(?:\.\d+)?\s*[%KMBTkmbt]?)"
    for label in label_patterns:
        pattern = rf"{label}\s*[:\-]?\s*{number}"
        m = re.search(pattern, compact, flags=re.IGNORECASE)
        if m:
            return parse_number(m.group(1))
    return None


def marketdetails_url(symbol: str, exchange: str = DEFAULT_EXCHANGE) -> str:
    return f"{COINLEGS_BASE_URL}/marketdetails/{exchange}/{normalize_symbol(symbol)}"


def parse_marketdetails_text(text: str, symbol: str, exchange: str = DEFAULT_EXCHANGE, timestamp: str | None = None, source_url: str | None = None) -> CoinlegsRecord:
    """Parse a public Coinlegs marketdetails text/HTML snapshot.

    This parser is intentionally tolerant because rendered snapshots can come
    from browser text, copied tables, search snippets, or saved HTML. Missing
    fields remain null rather than causing fake data.
    """
    ts = timestamp or pd.Timestamp.utcnow().isoformat()
    source = source_url or marketdetails_url(symbol, exchange)
    return CoinlegsRecord(
        timestamp=ts,
        exchange=exchange,
        symbol=normalize_symbol(symbol),
        price=_value_after_label(text, [r"Price", r"Last Price", r"Close"]),
        price_change_pct=_value_after_label(text, [r"Price Change(?:\(.*?\))?", r"Change(?:\(.*?\))?"]),
        volume_24h_usd=_value_after_label(text, [r"Volume(?:\s*24H|\s*\(24H\))", r"Turnover(?:\s*24H)?"]),
        volume_change_1h_pct=_value_after_label(text, [r"Volume Change\s*\(\s*in\s*1\s*Hour\s*\)", r"Volume Change\s*1H"]),
        volume_change_4h_pct=_value_after_label(text, [r"Volume Change\s*\(\s*in\s*4\s*Hours\s*\)", r"Volume Change\s*4H"]),
        volume_change_6h_pct=_value_after_label(text, [r"Volume Change\s*\(\s*in\s*6\s*Hours\s*\)", r"Volume Change\s*6H"]),
        volume_change_24h_pct=_value_after_label(text, [r"Volume Change\s*\(\s*in\s*24\s*Hours\s*\)", r"Volume Change\s*24H"]),
        oi_usd=_value_after_label(text, [r"Open Interest", r"OI"]),
        oi_change_1h_pct=_value_after_label(text, [r"OI Change\s*\(\s*in\s*1\s*Hour\s*\)", r"OI Change\s*1H", r"OI\s*\(1H%\)"]),
        oi_change_4h_pct=_value_after_label(text, [r"OI Change\s*\(\s*in\s*4\s*Hours\s*\)", r"OI Change\s*4H", r"OI\s*\(4H%\)"]),
        funding_rate_pct=_value_after_label(text, [r"Funding Rate", r"Funding"]),
        predicted_funding_rate_pct=_value_after_label(text, [r"Predicted Funding Rate", r"Predicted Funding"]),
        long_short_ratio=_value_after_label(text, [r"Long\s*/\s*Short Ratio", r"Long Short Ratio", r"LS Ratio"]),
        liquidation_1h_usd=_value_after_label(text, [r"1H Liq(?:uidation)?", r"Liquidation\s*1H"]),
        liquidation_4h_usd=_value_after_label(text, [r"4H Liq(?:uidation)?", r"Liquidation\s*4H"]),
        liquidation_24h_usd=_value_after_label(text, [r"24H Liq(?:uidation)?", r"Liquidation\s*24H"]),
        source_url=source,
    )


def records_to_frame(records: Iterable[CoinlegsRecord | dict]) -> pd.DataFrame:
    rows: list[dict] = []
    for record in records:
        row = record.to_dict() if isinstance(record, CoinlegsRecord) else dict(record)
        row["symbol"] = normalize_symbol(row.get("symbol", ""))
        row["exchange"] = str(row.get("exchange") or DEFAULT_EXCHANGE)
        if not row.get("timestamp"):
            row["timestamp"] = pd.Timestamp.utcnow().isoformat()
        rows.append(row)
    df = pd.DataFrame(rows)
    for col in CANONICAL_COLUMNS:
        if col not in df.columns:
            df[col] = np.nan if col not in {"timestamp", "exchange", "symbol", "source_url"} else ""
    numeric = [c for c in CANONICAL_COLUMNS if c not in {"timestamp", "exchange", "symbol", "source_url"}]
    for col in numeric:
        df[col] = df[col].map(parse_number)
    df["symbol"] = df["symbol"].map(normalize_symbol)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce").fillna(pd.Timestamp.utcnow()).map(lambda x: x.isoformat())
    return df.loc[:, CANONICAL_COLUMNS].drop_duplicates(["exchange", "symbol"], keep="last").reset_index(drop=True)


def read_coinlegs_snapshot_csv(path: str | Path) -> pd.DataFrame:
    path = Path(path).expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"Coinlegs snapshot CSV not found: {path}")
    df = pd.read_csv(path)
    renamed = {_col: _clean_label(_col) for _col in df.columns}
    df = df.rename(columns=renamed)
    if "symbol" not in df.columns:
        raise ValueError("Coinlegs snapshot must include a symbol/coin/pair/ticker column.")
    if "exchange" not in df.columns:
        df["exchange"] = DEFAULT_EXCHANGE
    if "timestamp" not in df.columns:
        df["timestamp"] = pd.Timestamp.utcnow().isoformat()
    if "source_url" not in df.columns:
        df["source_url"] = ""
    return records_to_frame(df.to_dict("records"))


def write_coinlegs_template(path: str | Path) -> Path:
    path = Path(path).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    example = {
        "timestamp": pd.Timestamp.utcnow().isoformat(),
        "exchange": DEFAULT_EXCHANGE,
        "symbol": "SOLUSDT",
        "price": 150.0,
        "price_change_pct": 1.8,
        "volume_24h_usd": 850_000_000,
        "volume_change_1h_pct": 6.5,
        "volume_change_4h_pct": 14.0,
        "volume_change_6h_pct": 18.0,
        "volume_change_24h_pct": 32.0,
        "oi_usd": 1_200_000_000,
        "oi_change_1h_pct": 2.2,
        "oi_change_4h_pct": 6.8,
        "funding_rate_pct": 0.012,
        "predicted_funding_rate_pct": 0.015,
        "long_short_ratio": 1.08,
        "liquidation_1h_usd": 2_000_000,
        "liquidation_4h_usd": 6_500_000,
        "liquidation_24h_usd": 22_000_000,
        "source_url": marketdetails_url("SOLUSDT"),
    }
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CANONICAL_COLUMNS)
        writer.writeheader()
        writer.writerow(example)
    return path


def fetch_public_page(url: str, timeout: float = 20.0) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ICR-Strategy-Research/1.0 (+public Coinlegs snapshot parser; no login bypass)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read()
            return raw.decode("utf-8", errors="replace")
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not fetch Coinlegs public page: {exc}") from exc


def scrape_marketdetails_static(symbol: str, exchange: str = DEFAULT_EXCHANGE, timeout: float = 20.0) -> CoinlegsRecord:
    url = marketdetails_url(symbol, exchange)
    text = fetch_public_page(url, timeout=timeout)
    if "You need to enable JavaScript" in text and len(text) < 5000:
        raise RuntimeError(
            "Coinlegs returned a JavaScript app shell instead of rendered data. "
            "Use --coinlegs-snapshot with a saved/exported CSV, or run the optional browser-rendered capture locally."
        )
    return parse_marketdetails_text(text, symbol=symbol, exchange=exchange, source_url=url)


def scrape_marketdetails_many(symbols: Iterable[str], exchange: str = DEFAULT_EXCHANGE, sleep_seconds: float = 0.5) -> pd.DataFrame:
    records: list[CoinlegsRecord] = []
    errors: list[dict] = []
    for symbol in symbols:
        try:
            records.append(scrape_marketdetails_static(symbol, exchange=exchange))
        except Exception as exc:  # deliberately captured into a report-like row
            errors.append({
                "timestamp": pd.Timestamp.utcnow().isoformat(),
                "exchange": exchange,
                "symbol": normalize_symbol(symbol),
                "source_url": marketdetails_url(symbol, exchange),
                "error": str(exc),
            })
        if sleep_seconds > 0:
            time.sleep(sleep_seconds)
    df = records_to_frame(records)
    if errors:
        df.attrs["errors"] = errors
    return df


def scrape_marketdetails_browser(symbol: str, exchange: str = DEFAULT_EXCHANGE, timeout_ms: int = 30000, headless: bool = True) -> CoinlegsRecord:
    """Render a public Coinlegs marketdetails page with Playwright, then parse text.

    This is optional because Playwright/browser binaries are heavy. Install with:
    pip install -r requirements-browser.txt && python -m playwright install chromium

    The function does not log in, evade captchas, or bypass access controls.
    """
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("Playwright is not installed. Install requirements-browser.txt and chromium first.") from exc

    url = marketdetails_url(symbol, exchange)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page(user_agent="ICR-Strategy-Research/1.0 public Coinlegs renderer")
        try:
            page.goto(url, wait_until="networkidle", timeout=timeout_ms)
            page.wait_for_timeout(1500)
            text = page.locator("body").inner_text(timeout=timeout_ms)
        finally:
            browser.close()
    return parse_marketdetails_text(text, symbol=symbol, exchange=exchange, source_url=url)


def scrape_marketdetails_browser_many(symbols: Iterable[str], exchange: str = DEFAULT_EXCHANGE, sleep_seconds: float = 0.5, timeout_ms: int = 30000, headless: bool = True) -> pd.DataFrame:
    records: list[CoinlegsRecord] = []
    errors: list[dict] = []
    for symbol in symbols:
        try:
            records.append(scrape_marketdetails_browser(symbol, exchange=exchange, timeout_ms=timeout_ms, headless=headless))
        except Exception as exc:  # deliberately captured into a report row
            errors.append({
                "timestamp": pd.Timestamp.utcnow().isoformat(),
                "exchange": exchange,
                "symbol": normalize_symbol(symbol),
                "source_url": marketdetails_url(symbol, exchange),
                "error": str(exc),
            })
        if sleep_seconds > 0:
            time.sleep(sleep_seconds)
    df = records_to_frame(records)
    if errors:
        df.attrs["errors"] = errors
    return df
