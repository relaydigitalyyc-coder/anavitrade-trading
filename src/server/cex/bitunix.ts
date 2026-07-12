import { bitunixQueryParams, bitunixSign, randomNonce } from "./signing";
import type {
  CexBalance, CexClient, CexCredentials, CexOrderRequest, CexOrderResult,
  CexPermissionCheck, CexPosition,
} from "./clientTypes";

const BASE = "https://fapi.bitunix.com";

/**
 * Bitunix Futures client. Auth via headers api-key/sign/nonce/timestamp/language;
 * signature is double-SHA256 (no HMAC). Bitunix has no testnet and no key-
 * permission introspection API — trade-only is user-attested.
 */
export class BitunixFuturesClient implements CexClient {
  private readonly key: string;
  private readonly secret: string;

  constructor(creds: CexCredentials) {
    this.key = creds.apiKey;
    this.secret = creds.apiSecret;
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    opts: { query?: Record<string, string | number>; body?: unknown } = {},
  ) {
    const nonce = randomNonce();
    const timestamp = String(Date.now());
    const queryParams = method === "GET" && opts.query
      ? bitunixQueryParams(opts.query)
      : "";
    const body = method === "POST" && opts.body ? JSON.stringify(opts.body) : "";
    const sign = await bitunixSign({
      nonce, timestamp, apiKey: this.key, queryParams, body, secretKey: this.secret,
    });

    const headers: Record<string, string> = {
      "api-key": this.key,
      "sign": sign,
      "nonce": nonce,
      "timestamp": timestamp,
      "language": "en-US",
      "Content-Type": "application/json",
    };

    let url = `${BASE}${path}`;
    if (method === "GET" && opts.query) {
      const qs = Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k}=${v}`)
        .join("&");
      if (qs) url += `?${qs}`;
    }

    const res = await fetch(url, { method, headers, ...(body ? { body } : {}) });
    const text = await res.text();
    if (!res.ok) throw new Error(`BITUNIX_${res.status}:${text.slice(0, 300)}`);
    const json = text ? JSON.parse(text) : {};
    // Bitunix wraps responses as { code, msg, data }. code 0 = success.
    if (json.code !== undefined && json.code !== 0 && json.code !== "0") {
      throw new Error(`BITUNIX_API_${json.code}:${json.msg ?? "error"}`);
    }
    return json.data ?? json;
  }

  async validateAndReadBalance(): Promise<CexBalance> {
    const data = await this.request("GET", "/api/v1/futures/account", { query: { marginCoin: "USDT" } });
    const available = Number(data.available ?? 0);
    const margin = Number(data.margin ?? 0);
    const crossUnpnl = Number(data.crossUnrealizedPNL ?? 0);
    const isoUnpnl = Number(data.isolationUnrealizedPNL ?? 0);
    const equityUsd = available + margin + crossUnpnl + isoUnpnl;
    return { equityUsd, availableUsd: available };
  }

  async verifyTradeOnly(): Promise<CexPermissionCheck> {
    // No permission API. A successful account read proves the key works; trade-
    // only status is attested by the user (we never call a withdrawal endpoint).
    return {
      withdrawalDisabledVerified: false,
      permissionsVerified: false,
      note: "Bitunix exposes no key-permission API — trade-only is user-attested.",
    };
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.request("POST", "/api/v1/futures/account/change_leverage", {
      body: { symbol, leverage, marginCoin: "USDT" },
    });
  }

  async placeOrder(req: CexOrderRequest): Promise<CexOrderResult> {
    if (req.leverage) {
      try { await this.setLeverage(req.symbol, req.leverage); } catch { /* non-fatal */ }
    }
    // Bitunix attaches SL/TP inline on the entry order.
    const data = await this.request("POST", "/api/v1/futures/trade/place_order", {
      body: {
        symbol: req.symbol,
        side: req.side,
        orderType: req.type,
        qty: req.quantity,
        tradeSide: req.reduceOnly ? "CLOSE" : "OPEN",
        ...(req.type === "LIMIT" ? { price: req.price, effect: "GTC" } : {}),
        ...(req.stopLossPrice ? { slPrice: req.stopLossPrice, slStopType: "LAST_PRICE", slOrderType: "MARKET" } : {}),
        ...(req.takeProfitPrice ? { tpPrice: req.takeProfitPrice, tpStopType: "LAST_PRICE", tpOrderType: "MARKET" } : {}),
        ...(req.clientOrderId ? { clientId: req.clientOrderId } : {}),
      },
    });
    return {
      orderId: String(data.orderId ?? data.orderList?.[0]?.orderId ?? ""),
      status: "accepted",
      raw: data,
    };
  }

  async getPositions(symbol?: string): Promise<CexPosition[]> {
    const data = await this.request("GET", "/api/v1/futures/position/get_pending_positions", {
      query: symbol ? { symbol } : {},
    });
    const arr = Array.isArray(data) ? data : (data?.positionList ?? []);
    return arr.map((p: any) => {
      const qty = Number(p.qty ?? p.size ?? 0);
      const side = String(p.side ?? "").toUpperCase();
      return {
        symbol: p.symbol,
        sizeSigned: side === "SELL" || side === "SHORT" ? -qty : qty,
        entryPrice: Number(p.entryValue ?? p.avgOpenPrice ?? p.entryPrice ?? 0),
        leverage: Number(p.leverage ?? 0),
        unrealizedPnlUsd: Number(p.unrealizedPNL ?? 0),
      };
    });
  }
}
