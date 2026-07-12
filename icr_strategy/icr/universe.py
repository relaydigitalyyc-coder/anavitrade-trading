from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable

import pandas as pd


# Research universe based on the remembered Exness scanner requirement:
# majors, minors, exotics, metals, crypto, indices. This is symbol metadata only.
EXNESS_FX_MAJORS = (
    "EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCHF", "USDCAD",
)
EXNESS_FX_MINORS = (
    "EURGBP", "EURJPY", "EURCHF", "EURCAD", "EURAUD", "EURNZD",
    "GBPJPY", "GBPCHF", "GBPCAD", "GBPAUD", "GBPNZD",
    "AUDJPY", "AUDCHF", "AUDCAD", "AUDNZD", "NZDJPY", "NZDCHF", "NZDCAD",
    "CADJPY", "CADCHF", "CHFJPY",
)
EXNESS_EXOTICS = (
    "USDZAR", "USDMXN", "USDTRY", "USDNOK", "USDSEK", "USDDKK", "USDPLN",
    "EURZAR", "EURTRY", "GBPZAR", "GBPTRY", "AUDSGD", "USDSGD", "USDHKD",
)
EXNESS_METALS = ("XAUUSD", "XAGUSD")
EXNESS_CRYPTO = ("BTCUSD", "ETHUSD", "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT")
EXNESS_INDICES = ("US30", "US500", "USTEC", "DE30", "UK100", "JP225")

EXNESS_UNIVERSE = EXNESS_FX_MAJORS + EXNESS_FX_MINORS + EXNESS_EXOTICS + EXNESS_METALS + EXNESS_CRYPTO + EXNESS_INDICES

KNOWN_FX_CODES = {
    "AUD", "CAD", "CHF", "DKK", "EUR", "GBP", "HKD", "JPY", "MXN",
    "NOK", "NZD", "PLN", "SEK", "SGD", "TRY", "USD", "ZAR",
}


def split_fx_symbol(symbol: str) -> tuple[str, str] | None:
    s = symbol.upper().replace("/", "").replace("_", "")
    if len(s) == 6 and s.isalpha() and s[:3] in KNOWN_FX_CODES and s[3:] in KNOWN_FX_CODES:
        return s[:3], s[3:]
    return None


def inverse_symbol(symbol: str) -> str | None:
    parts = split_fx_symbol(symbol)
    if parts is None:
        return None
    base, quote = parts
    return quote + base


@dataclass(frozen=True)
class CurrencyStrengthRow:
    currency: str
    score: float
    pair_count: int


def currency_strength_from_returns(symbol_returns: dict[str, float]) -> list[CurrencyStrengthRow]:
    """Derive independent currency strength from pair returns.

    Positive EURUSD return adds strength to EUR and subtracts from USD.
    Positive EURGBP return adds EUR and subtracts GBP. This mirrors the remembered
    request to infer GBP strength from GBPUSD/GBPAUD/GBPJPY and weakness through
    inverse pairs like EURGBP.
    """
    scores: dict[str, float] = defaultdict(float)
    counts: dict[str, int] = defaultdict(int)
    for symbol, ret in symbol_returns.items():
        parts = split_fx_symbol(symbol)
        if parts is None:
            continue
        base, quote = parts
        value = float(ret)
        scores[base] += value
        scores[quote] -= value
        counts[base] += 1
        counts[quote] += 1
    rows = [CurrencyStrengthRow(cur, scores[cur] / max(1, counts[cur]), counts[cur]) for cur in scores]
    return sorted(rows, key=lambda r: r.score, reverse=True)


def symbol_return(df: pd.DataFrame, lookback: int = 20) -> float:
    if len(df) <= lookback:
        return 0.0
    start = float(df["close"].iloc[-lookback])
    end = float(df["close"].iloc[-1])
    if start <= 0:
        return 0.0
    return end / start - 1.0


def returns_from_markets(markets: Iterable[object], lookback: int = 20) -> dict[str, float]:
    out: dict[str, float] = {}
    for market in markets:
        symbol = getattr(market, "symbol")
        candles = getattr(market, "candles")
        out[str(symbol).upper()] = symbol_return(candles, lookback)
    return out


def asset_class(symbol: str) -> str:
    s = symbol.upper().replace("/", "").replace("_", "")
    if split_fx_symbol(s) is not None:
        return "fx"
    if s in EXNESS_METALS or s.startswith(("XAU", "XAG")):
        return "metals"
    if any(token in s for token in ("BTC", "ETH", "SOL", "BNB", "USDT")):
        return "crypto"
    if s in EXNESS_INDICES or any(token in s for token in ("US30", "US500", "USTEC", "NAS", "SPX", "DE30", "UK100", "JP225")):
        return "indices"
    return "other"


def risk_cluster(symbol: str) -> str:
    """Coarse correlation bucket for portfolio caps.

    FX pairs share a cluster with their strongest obvious currency dependency,
    crypto is one beta bucket, metals another, and indices another. This is a
    conservative research approximation, not a substitute for empirical rolling
    correlation estimates.

    Crypto sub-clusters:
      - ``crypto_large_cap``: BTC, ETH (largest by market cap, highest liquidity)
      - ``crypto_mid_cap``: Top-20 market-cap assets (e.g. SOL, BNB, XRP, ADA)
      - ``crypto_meme``: DOGE, SHIB, PEPE and similar high-beta meme coins
    """
    s = symbol.upper().replace("/", "").replace("_", "")
    parts = split_fx_symbol(s)
    if parts is not None:
        base, quote = parts
        if "USD" in parts:
            other = base if quote == "USD" else quote
            return f"fx_usd_{other}"
        return "fx_crosses"
    klass = asset_class(s)
    if klass == "crypto":
        # Sub-cluster by coin type.
        coin = s.replace("USDT", "").replace("USD", "")
        if coin in ("BTC", "ETH"):
            return "crypto_large_cap"
        if coin in ("DOGE", "SHIB", "PEPE", "FLOKI", "WIF", "BONK"):
            return "crypto_meme"
        return "crypto_mid_cap"
    if klass == "metals":
        return "metals_beta"
    if klass == "indices":
        return "indices_beta"
    return f"other_{s}"
