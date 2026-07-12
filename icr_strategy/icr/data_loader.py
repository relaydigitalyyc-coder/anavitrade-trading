from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

REQUIRED_COLUMNS = {"timestamp", "open", "high", "low", "close", "volume"}
OPTIONAL_COLUMNS = {"bid", "ask", "spread_bps", "spread", "commission_bps"}


@dataclass(frozen=True)
class MarketData:
    symbol: str
    timeframe: str
    candles: pd.DataFrame


def _normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"CSV is missing required columns: {sorted(missing)}")
    return df


def load_csv(path: str | Path, symbol: str | None = None, timeframe: str = "1H") -> MarketData:
    path = Path(path).expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"CSV file not found: {path}")
    if path.suffix.lower() != ".csv":
        raise ValueError(f"Expected a .csv file, got: {path.name}")

    df = pd.read_csv(path)
    df = _normalise_columns(df)
    columns = ["timestamp", "open", "high", "low", "close", "volume"] + [c for c in sorted(OPTIONAL_COLUMNS) if c in df.columns]
    df = df.loc[:, columns]

    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="raise")
    for col in [c for c in columns if c != "timestamp"]:
        df[col] = pd.to_numeric(df[col], errors="raise")

    if (df[["open", "high", "low", "close"]] <= 0).any().any():
        raise ValueError("OHLC prices must be positive.")
    if (df["volume"] < 0).any():
        raise ValueError("Volume cannot be negative.")
    if (df["high"] < df[["open", "close", "low"]].max(axis=1)).any():
        raise ValueError("Each high must be >= open, close, and low.")
    if (df["low"] > df[["open", "close", "high"]].min(axis=1)).any():
        raise ValueError("Each low must be <= open, close, and high.")
    if "bid" in df and "ask" in df and (df["ask"] < df["bid"]).any():
        raise ValueError("Ask must be >= bid when bid/ask columns are provided.")

    df = df.sort_values("timestamp").drop_duplicates("timestamp").reset_index(drop=True)
    inferred_symbol = symbol or path.stem.split("_")[0].upper()
    return MarketData(symbol=inferred_symbol, timeframe=timeframe, candles=df)


def load_many(input_path: str | Path, timeframe: str = "1H") -> list[MarketData]:
    """Load one CSV file or all direct CSV children of a folder.

    This intentionally refuses recursive directory traversal to prevent accidental
    full-drive scans or destructive automation patterns.
    """
    path = Path(input_path).expanduser().resolve()
    if path.is_file():
        return [load_csv(path, timeframe=timeframe)]
    if not path.exists() or not path.is_dir():
        raise FileNotFoundError(f"Input path not found: {path}")

    files = sorted(p for p in path.iterdir() if p.is_file() and p.suffix.lower() == ".csv")
    if not files:
        raise FileNotFoundError(f"No direct .csv files found in: {path}")
    return [load_csv(p, timeframe=timeframe) for p in files]
