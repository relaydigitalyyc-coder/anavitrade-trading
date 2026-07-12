import { getAsterConfig } from "./config";
import type { AsterOrderRequest, ExecutionAdapterReceipt } from "./types";

export class AsterApiClient {
  constructor(private readonly baseUrl = getAsterConfig().apiBaseUrl) {}

  async getServerTime(): Promise<number> {
    const response = await fetch(`${this.baseUrl}/fapi/v1/time`);
    if (!response.ok) throw new Error(`ASTER_TIME_FAILED:${response.status}`);
    const data = (await response.json()) as { serverTime?: number };
    return Number(data.serverTime ?? Date.now());
  }

  async submitOrder(_request: AsterOrderRequest): Promise<ExecutionAdapterReceipt> {
    throw new Error("ASTER_ORDER_SUBMIT_NOT_WIRED");
  }

  async cancelOrder(_orderId: string): Promise<ExecutionAdapterReceipt> {
    throw new Error("ASTER_ORDER_CANCEL_NOT_WIRED");
  }
}
