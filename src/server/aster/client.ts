import { getAsterConfig } from "./config";
import type { AsterOrderRequest, ExecutionAdapterReceipt } from "./types";
import type { Account } from "viem/accounts";
import { hashTypedData } from "viem";

/**
 * Standard EIP-712 domain for Aster DEX (EVM-compatible chain).
 * The verifying contract is the builder address, which acts as the
 * order-relayer contract on the destination chain.
 */
const ASTER_EIP712_DOMAIN = {
  name: "AsterDEX",
  version: "1",
  chainId: 1, // Ethereum mainnet — override via config in future
} as const;

const ASTER_ORDER_TYPES = {
  Order: [
    { name: "user", type: "address" },
    { name: "signer", type: "address" },
    { name: "symbol", type: "string" },
    { name: "side", type: "string" },
    { name: "type", type: "string" },
    { name: "quantity", type: "string" },
    { name: "price", type: "string" },
    { name: "leverage", type: "uint256" },
    { name: "builder", type: "address" },
    { name: "feeRate", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "expiration", type: "uint256" },
  ],
} as const;

export class AsterApiClient {
  constructor(private readonly baseUrl = getAsterConfig().apiBaseUrl) {}

  async getServerTime(): Promise<number> {
    const response = await fetch(`${this.baseUrl}/fapi/v1/time`);
    if (!response.ok) throw new Error(`ASTER_TIME_FAILED:${response.status}`);
    const data = (await response.json()) as { serverTime?: number };
    return Number(data.serverTime ?? Date.now());
  }

  /**
   * Submit an order to the Aster DEX API.
   *
   * Flow:
   * 1. Build the EIP-712 typed data payload (Order struct)
   * 2. Sign it with the agent's signer private key via viem
   * 3. POST the signed order + signature to Aster's REST endpoint
   * 4. Parse and return the execution receipt
   *
   * The signature proves the agent authorized the order off-chain.
   * The Aster DEX relayer contract verifies it on-chain.
   */
  async submitOrder(
    request: AsterOrderRequest,
    signer: Account,
  ): Promise<ExecutionAdapterReceipt> {
    const config = getAsterConfig();
    const nonce = Date.now();
    const expiration = nonce + 120_000; // 2-minute expiry
    const serverTime = await this.getServerTime();

    // Clamp expiration to server time to prevent clock-skew abuse
    const safeExpiration = Math.min(expiration, serverTime + 120_000);

    // Build typed data matching Aster's on-chain Order struct
    const typedData = {
      domain: { ...ASTER_EIP712_DOMAIN, verifyingContract: config.builderAddress as `0x${string}` },
      types: ASTER_ORDER_TYPES,
      primaryType: "Order" as const,
      message: {
        user: request.user as `0x${string}`,
        signer: request.signer as `0x${string}`,
        symbol: request.symbol,
        side: request.side,
        type: request.type,
        quantity: request.quantity,
        price: request.price ?? "0",
        leverage: BigInt(request.leverage ?? 1),
        builder: config.builderAddress as `0x${string}`,
        feeRate: request.feeRate ?? config.defaultFeeRate ?? "0",
        nonce: BigInt(nonce),
        expiration: BigInt(safeExpiration),
      },
    };

    // Sign the typed data using the agent's decrypted private key
    const signature = await signer.signTypedData(typedData);

    // Build the REST payload
    const body = {
      user: request.user,
      signer: request.signer,
      symbol: request.symbol,
      side: request.side,
      orderType: request.type,
      quantity: request.quantity,
      price: request.price ?? "",
      leverage: request.leverage ?? 1,
      builder: request.builder,
      feeRate: request.feeRate ?? config.defaultFeeRate ?? "0",
      nonce: nonce.toString(),
      expiration: safeExpiration.toString(),
      signature,
      timestamp: serverTime.toString(),
    };

    const response = await fetch(`${this.baseUrl}/fapi/v1/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "unknown");
      throw new Error(`ASTER_ORDER_REJECTED:${response.status}:${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      orderId?: string;
      status?: string;
      [key: string]: unknown;
    };

    // Normalise the provider's status string to our canonical enum.
    const rawStatus = (data.status ?? "").toLowerCase();
    const status: "accepted" | "filled" | "rejected" =
      rawStatus === "filled" || rawStatus === "executed" ? "filled"
      : rawStatus === "rejected" || rawStatus === "failed" ? "rejected"
      : "accepted";

    return {
      provider: "aster",
      orderId: data.orderId ?? `aster-${nonce}`,
      status,
      raw: data,
    };
  }

  async cancelOrder(_orderId: string): Promise<ExecutionAdapterReceipt> {
    throw new Error("ASTER_ORDER_CANCEL_NOT_WIRED");
  }
}
