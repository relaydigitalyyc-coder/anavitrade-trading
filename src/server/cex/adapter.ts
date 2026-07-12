import { eq } from "drizzle-orm";
import { cexConnections } from "../../drizzle/schema";
import { getDb } from "../db";
import type { ExecutionAdapter, ExecutionAdapterReceipt } from "../aster/types";
import { createCexClient } from "./factory";
import { decryptCexCredentials } from "./store";
import type { CexOrderRequest } from "./clientTypes";

/**
 * CEX execution adapter — conforms to the shared ExecutionAdapter contract
 * (provider "cex"). It only executes an already-approved job; risk policy lives
 * in the risk engine, never here.
 *
 * The shared ExecutionAdapter types submitOrder's request as AsterOrderRequest;
 * the CEX order-neutral shape is structurally compatible for the fields we use,
 * so we accept the shared shape and translate.
 */
export class CexExecutionAdapter implements ExecutionAdapter {
  constructor(private readonly connectionId: number) {}

  private async loadClient() {
    const db = getDb();
    const [row] = await db.select().from(cexConnections)
      .where(eq(cexConnections.id, this.connectionId))
      .limit(1);
    if (!row) throw new Error("CEX_CONNECTION_NOT_FOUND");
    if (row.status !== "active") throw new Error("CEX_CONNECTION_NOT_ACTIVE");
    if (row.killSwitchActive) throw new Error("KILL_SWITCH_ACTIVE");
    const creds = await decryptCexCredentials(row);
    return { client: createCexClient(row.exchange, creds), exchange: row.exchange };
  }

  async submitOrder(_jobId: number, request: any): Promise<ExecutionAdapterReceipt> {
    const { client } = await this.loadClient();
    const order: CexOrderRequest = {
      symbol: request.symbol,
      side: request.side,
      type: request.type ?? "MARKET",
      quantity: request.quantity,
      price: request.price,
      leverage: request.leverage,
      stopLossPrice: request.stopLossPrice,
      takeProfitPrice: request.takeProfitPrice,
      reduceOnly: request.reduceOnly,
      clientOrderId: request.clientOrderId,
    };
    const result = await client.placeOrder(order);
    return { provider: "cex", orderId: result.orderId, status: result.status, raw: result.raw };
  }

  async cancelOrder(_orderId: string): Promise<ExecutionAdapterReceipt> {
    // Cancel is not required for the market-order copytrade path this pass.
    throw new Error("CEX_ORDER_CANCEL_NOT_WIRED");
  }
}
