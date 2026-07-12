import { binanceSignedQuery, hmacSha256Hex } from "./signing";
import type {
  CexBalance, CexClient, CexCredentials, CexOrderRequest, CexOrderResult,
  CexPermissionCheck, CexPosition,
} from "./clientTypes";

const FAPI_PROD = "https://fapi.binance.com";
const FAPI_TEST = "https://testnet.binancefuture.com";
const SAPI_PROD = "https://api.binance.com"; // key-permission introspection lives on spot host

const RECV_WINDOW = 5000;

/**
 * Binance USDT-M Futures client. Signed requests use HMAC-SHA256 over the query
 * string with header X-MBX-APIKEY; the signature is appended last and is not
 * itself signed.
 */
export class BinanceFuturesClient implements CexClient {
  private readonly key: string;
  private readonly secret: string;
  private readonly fapi: string;

  constructor(creds: CexCredentials) {
    this.key = creds.apiKey;
    this.secret = creds.apiSecret;
    this.fapi = creds.testnet ? FAPI_TEST : FAPI_PROD;
  }

  private headers() {
    return { "X-MBX-APIKEY": this.key };
  }

  private async signedGet(base: string, path: string, params: Record<string, string | number> = {}) {
    const query = await binanceSignedQuery(this.secret, {
      ...params, timestamp: Date.now(), recvWindow: RECV_WINDOW,
    });
    const res = await fetch(`${base}${path}?${query}`, { headers: this.headers() });
    const text = await res.text();
    if (!res.ok) throw new Error(`BINANCE_${res.status}:${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }

  private async signedPost(path: string, params: Record<string, string | number> = {}) {
    const query = await binanceSignedQuery(this.secret, {
      ...params, timestamp: Date.now(), recvWindow: RECV_WINDOW,
    });
    const res = await fetch(`${this.fapi}${path}?${query}`, { method: "POST", headers: this.headers() });
    const text = await res.text();
    if (!res.ok) throw new Error(`BINANCE_${res.status}:${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }

  async validateAndReadBalance(): Promise<CexBalance> {
    const acct = await this.signedGet(this.fapi, "/fapi/v3/account");
    const equityUsd = Number(acct.totalWalletBalance ?? acct.totalMarginBalance ?? 0);
    const availableUsd = Number(acct.availableBalance ?? 0);
    return { equityUsd, availableUsd };
  }

  async verifyTradeOnly(): Promise<CexPermissionCheck> {
    // apiRestrictions lives on the SPOT host. A futures-only key may not be able
    // to call it — in that case we cannot positively verify, so we don't claim to.
    try {
      const r = await this.signedGet(SAPI_PROD, "/sapi/v1/account/apiRestrictions");
      const withdrawalDisabled = r.enableWithdrawals === false;
      return {
        withdrawalDisabledVerified: withdrawalDisabled,
        permissionsVerified: true,
        note: withdrawalDisabled
          ? "Verified: withdrawals disabled, futures enabled."
          : "REJECT: key has withdrawal permission enabled.",
      };
    } catch (e: any) {
      return {
        withdrawalDisabledVerified: false,
        permissionsVerified: false,
        note: `Could not read key permissions (${String(e?.message).slice(0, 80)}). Relying on user attestation.`,
      };
    }
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.signedPost("/fapi/v1/leverage", { symbol, leverage });
  }

  async placeOrder(req: CexOrderRequest): Promise<CexOrderResult> {
    if (req.leverage) {
      try { await this.setLeverage(req.symbol, req.leverage); } catch { /* non-fatal */ }
    }
    // Entry order
    const entry = await this.signedPost("/fapi/v1/order", {
      symbol: req.symbol,
      side: req.side,
      type: req.type,
      quantity: req.quantity,
      ...(req.type === "LIMIT" ? { price: req.price ?? "", timeInForce: "GTC" } : {}),
      ...(req.reduceOnly ? { reduceOnly: "true" } : {}),
      ...(req.clientOrderId ? { newClientOrderId: req.clientOrderId } : {}),
    });

    // Reduce-only exits (separate orders — Binance can't attach SL/TP to entry)
    const exitSide = req.side === "BUY" ? "SELL" : "BUY";
    if (req.stopLossPrice) {
      await this.signedPost("/fapi/v1/order", {
        symbol: req.symbol, side: exitSide, type: "STOP_MARKET",
        stopPrice: req.stopLossPrice, closePosition: "true",
      }).catch(() => undefined);
    }
    if (req.takeProfitPrice) {
      await this.signedPost("/fapi/v1/order", {
        symbol: req.symbol, side: exitSide, type: "TAKE_PROFIT_MARKET",
        stopPrice: req.takeProfitPrice, closePosition: "true",
      }).catch(() => undefined);
    }

    const status = entry.status === "FILLED" ? "filled" : "accepted";
    return { orderId: String(entry.orderId ?? entry.clientOrderId ?? ""), status, raw: entry };
  }

  async getPositions(symbol?: string): Promise<CexPosition[]> {
    const rows = await this.signedGet(this.fapi, "/fapi/v3/positionRisk", symbol ? { symbol } : {});
    const arr = Array.isArray(rows) ? rows : [];
    return arr
      .map((p: any) => ({
        symbol: p.symbol,
        sizeSigned: Number(p.positionAmt ?? 0),
        entryPrice: Number(p.entryPrice ?? 0),
        leverage: Number(p.leverage ?? 0),
        unrealizedPnlUsd: Number(p.unRealizedProfit ?? p.unrealizedProfit ?? 0),
      }))
      .filter((p: CexPosition) => p.sizeSigned !== 0);
  }
}

/** Convenience: sign an arbitrary query (used by tests / debugging). */
export const _binanceSign = hmacSha256Hex;
