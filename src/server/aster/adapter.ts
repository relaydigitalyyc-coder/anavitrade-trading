import { eq } from "drizzle-orm";
import { asterAgentAccounts } from "../../drizzle/schema";
import { getDb, decryptKey } from "../db";
import { privateKeyToAccount } from "viem/accounts";
import { AsterApiClient } from "./client";
import type { ExecutionAdapter, ExecutionAdapterReceipt, AsterOrderRequest } from "./types";

/**
 * Aster DEX execution adapter — conforms to the shared ExecutionAdapter contract
 * (provider "aster"). Decrypts the agent's signer key, signs orders with EIP-712,
 * and submits to the Aster REST API.
 */
export class AsterExecutionAdapter implements ExecutionAdapter {
  constructor(private readonly agentId: number) {}

  async submitOrder(_jobId: number, request: any): Promise<ExecutionAdapterReceipt> {
    const db = getDb();
    const [row] = await db.select().from(asterAgentAccounts)
      .where(eq(asterAgentAccounts.id, this.agentId))
      .limit(1);
    if (!row) throw new Error("ASTER_AGENT_NOT_FOUND");
    if (row.status !== "active") throw new Error("ASTER_AGENT_NOT_ACTIVE");

    // Decrypt the signer private key and restore the viem account
    const privateKey = await decryptKey(row.encryptedSignerPrivateKey);
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    const orderRequest: AsterOrderRequest = {
      user: row.asterAccountAddress,
      signer: row.signerAddress,
      symbol: request.symbol,
      side: request.side,
      type: request.type ?? "MARKET",
      quantity: request.quantity,
      price: request.price,
      leverage: request.leverage ?? 1,
      builder: row.builderAddress,
      feeRate: row.feeRate ?? undefined,
    };

    const client = new AsterApiClient();
    return client.submitOrder(orderRequest, account);
  }

  async cancelOrder(_orderId: string): Promise<ExecutionAdapterReceipt> {
    throw new Error("ASTER_ORDER_CANCEL_NOT_WIRED");
  }
}
