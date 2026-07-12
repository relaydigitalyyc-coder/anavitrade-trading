import type { CexClient, CexCredentials } from "./clientTypes";
import { BinanceFuturesClient } from "./binance";
import { BitunixFuturesClient } from "./bitunix";
import { isLiveExchange } from "./registry";

/** Build the right CEX client for an exchange id. Throws for non-live exchanges. */
export function createCexClient(exchange: string, creds: CexCredentials): CexClient {
  if (!isLiveExchange(exchange)) {
    throw new Error(`EXCHANGE_NOT_LIVE:${exchange}`);
  }
  switch (exchange) {
    case "binance":
      return new BinanceFuturesClient(creds);
    case "bitunix":
      return new BitunixFuturesClient(creds);
    default:
      throw new Error(`EXCHANGE_UNSUPPORTED:${exchange}`);
  }
}
