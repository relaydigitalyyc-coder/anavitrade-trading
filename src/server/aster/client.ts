import { getAsterConfig } from "./config";
import type { AsterAgentRegistrationParams, AsterOrderRequest, ExecutionAdapterReceipt } from "./types";
import type { Account } from "viem/accounts";

/**
 * Aster Futures API V3 signs the URL-encoded request params as a single
 * EIP-712 string message. The provider validates the literal encoded string.
 */
const ASTER_EIP712_DOMAIN = {
  name: "AsterSignTransaction",
  version: "1",
  chainId: 1666,
  verifyingContract: "0x0000000000000000000000000000000000000000" as `0x${string}`,
} as const;

const ASTER_MESSAGE_TYPES = {
  Message: [
    { name: "msg", type: "string" },
  ],
} as const;

let lastNonce = 0;

function nextNonce(): string {
  const candidate = Date.now() * 1000;
  lastNonce = candidate > lastNonce ? candidate : lastNonce + 1;
  return String(lastNonce);
}

function encodeParams(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

export class AsterApiClient {
  constructor(private readonly baseUrl = getAsterConfig().apiBaseUrl) {}

  async getServerTime(): Promise<number> {
    const response = await fetch(`${this.baseUrl}/fapi/v3/time`);
    if (!response.ok) throw new Error(`ASTER_TIME_FAILED:${response.status}`);
    const data = (await response.json()) as { serverTime?: number };
    return Number(data.serverTime ?? Date.now());
  }

  private async signedPost<T>(
    path: string,
    params: Record<string, string>,
    signer: Account,
  ): Promise<T> {
    const signedParams = {
      ...params,
      nonce: nextNonce(),
      signer: signer.address,
    };
    const unsignedPayload = encodeParams(signedParams);
    const signature = await signer.signTypedData({
      domain: ASTER_EIP712_DOMAIN,
      types: ASTER_MESSAGE_TYPES,
      primaryType: "Message",
      message: { msg: unsignedPayload },
    });

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Anavitrade/1.0",
      },
      body: `${unsignedPayload}&signature=${encodeURIComponent(signature)}`,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "unknown");
      throw new Error(`ASTER_REQUEST_REJECTED:${response.status}:${text.slice(0, 200)}`);
    }

    const data = await response.json() as T & { code?: number; msg?: string };
    if (typeof data.code === "number" && data.code < 0) {
      throw new Error(`ASTER_REQUEST_REJECTED:${data.code}:${data.msg ?? "unknown"}`);
    }

    return data;
  }

  async setLeverage(
    symbol: string,
    leverage: number,
    signer: Account,
  ): Promise<void> {
    const target = Math.trunc(leverage);
    if (!Number.isFinite(target) || target < 1 || target > 125) {
      throw new Error("ASTER_INVALID_LEVERAGE");
    }
    await this.signedPost("/fapi/v3/leverage", {
      symbol,
      leverage: String(target),
    }, signer);
  }

  async registerAndApproveAgent(
    params: AsterAgentRegistrationParams,
    signature: string,
  ): Promise<unknown> {
    const bodyParams = encodeParams(params);
    const response = await fetch(`${this.baseUrl}/fapi/v3/registerAndApproveAgent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Anavitrade/1.0",
      },
      body: `${bodyParams}&signature=${encodeURIComponent(signature)}`,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "unknown");
      throw new Error(`ASTER_AGENT_REGISTRATION_REJECTED:${response.status}:${text.slice(0, 200)}`);
    }

    const data = await response.json() as { code?: number; msg?: string; [key: string]: unknown };
    if (typeof data.code === "number" && data.code < 0) {
      throw new Error(`ASTER_AGENT_REGISTRATION_REJECTED:${data.code}:${data.msg ?? "unknown"}`);
    }
    return data;
  }

  async submitOrder(
    request: AsterOrderRequest,
    signer: Account,
  ): Promise<ExecutionAdapterReceipt> {
    const params: Record<string, string> = {
      symbol: request.symbol,
      type: request.type,
      side: request.side,
      quantity: request.quantity,
    };

    if (request.type === "LIMIT") {
      if (!request.price) throw new Error("ASTER_LIMIT_PRICE_REQUIRED");
      params.timeInForce = request.timeInForce ?? "GTC";
      params.price = request.price;
    }

    if (request.newClientOrderId) {
      params.newClientOrderId = request.newClientOrderId;
    }

    const data = await this.signedPost<{
      orderId?: string | number;
      status?: string;
      [key: string]: unknown;
    }>("/fapi/v3/order", params, signer);

    const rawStatus = (data.status ?? "").toLowerCase();
    const status: "accepted" | "filled" | "rejected" =
      rawStatus === "filled" || rawStatus === "executed" ? "filled"
      : rawStatus === "rejected" || rawStatus === "failed" ? "rejected"
      : "accepted";

    return {
      provider: "aster",
      orderId: String(data.orderId ?? data.clientOrderId ?? request.newClientOrderId ?? "aster-unknown"),
      status,
      raw: data,
    };
  }

  async cancelOrder(_orderId: string): Promise<ExecutionAdapterReceipt> {
    throw new Error("ASTER_ORDER_CANCEL_NOT_WIRED");
  }
}
