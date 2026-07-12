/** Provider-neutral shapes shared by every CEX client. */

export type CexCredentials = {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  testnet?: boolean;
};

export type CexBalance = {
  /** Total account equity in USD/USDT. */
  equityUsd: number;
  availableUsd: number;
};

export type CexPermissionCheck = {
  /** True only if we positively confirmed withdrawals are disabled. */
  withdrawalDisabledVerified: boolean;
  /** True if the exchange exposes a permission API and we could read it. */
  permissionsVerified: boolean;
  /** Human-readable note for the audit log / UI. */
  note: string;
};

/** Neutral order request the execution adapter builds from a TradeIntent. */
export type CexOrderRequest = {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: string;
  price?: string;
  leverage?: number;
  stopLossPrice?: string;
  takeProfitPrice?: string;
  reduceOnly?: boolean;
  clientOrderId?: string;
};

export type CexOrderResult = {
  orderId: string;
  status: "accepted" | "filled" | "rejected";
  raw?: unknown;
};

export type CexPosition = {
  symbol: string;
  sizeSigned: number; // + long, - short
  entryPrice: number;
  leverage: number;
  unrealizedPnlUsd: number;
};

export interface CexClient {
  validateAndReadBalance(): Promise<CexBalance>;
  verifyTradeOnly(): Promise<CexPermissionCheck>;
  setLeverage(symbol: string, leverage: number): Promise<void>;
  placeOrder(req: CexOrderRequest): Promise<CexOrderResult>;
  getPositions(symbol?: string): Promise<CexPosition[]>;
}
