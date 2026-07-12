import { getEnv } from "../_core/env";

const DEFAULT_ASTER_API_BASE_URL = "https://fapi.asterdex.com";
const DEFAULT_ASTER_FEE_RATE = "0";

export function getAsterConfig() {
  const env = getEnv();
  return {
    apiBaseUrl: env.ASTER_API_BASE_URL ?? DEFAULT_ASTER_API_BASE_URL,
    builderAddress: env.ASTER_BUILDER_ADDRESS ?? "",
    defaultFeeRate: env.ASTER_DEFAULT_FEE_RATE ?? DEFAULT_ASTER_FEE_RATE,
    environment: env.ASTER_ENVIRONMENT ?? "production",
  };
}
