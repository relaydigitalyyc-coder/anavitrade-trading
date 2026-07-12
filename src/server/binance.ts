import { eq, desc } from "drizzle-orm";
import { getDb } from "./db";
import { getEnv } from "./_core/env";
import { binanceSettings, tradeExecutions } from "../drizzle/schema";

/** Web Crypto HMAC-SHA256 for Binance API signing */
async function createHmacSha256(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getBinanceSettings() {
  let db: ReturnType<typeof getDb> | null = null;
  try { db = getDb(); } catch { /* env not set */ }
  if (!db) {
    return { killSwitchActive: false, positionSizePct: "5.00", leverage: 3, minQualityScore: 0, autoTradeEnabled: true };
  }
  const [settings] = await db.select().from(binanceSettings).limit(1);
  if (!settings) return { killSwitchActive: false, positionSizePct: "5.00", leverage: 3, minQualityScore: 0, autoTradeEnabled: true };
  return settings;
}

export async function toggleKillSwitch(active: boolean) {
  let db: ReturnType<typeof getDb> | null = null;
  try { db = getDb(); } catch { /* env not set */ }
  if (!db) throw new Error("Database not available");
  const [settings] = await db.select().from(binanceSettings).limit(1);
  if (settings) {
    await db.update(binanceSettings).set({ killSwitchActive: active } as any).where(eq(binanceSettings.id, settings.id));
  } else {
    await db.insert(binanceSettings).values({ killSwitchActive: active } as any);
  }
}

export async function updateBinanceSettings(input: { positionSizePct?: number; leverage?: number; autoTradeEnabled?: boolean }) {
  let db: ReturnType<typeof getDb> | null = null;
  try { db = getDb(); } catch { /* env not set */ }
  if (!db) throw new Error("Database not available");
  const settings: Record<string, unknown> = {};
  if (input.positionSizePct !== undefined) settings.positionSizePct = String(input.positionSizePct);
  if (input.leverage !== undefined) settings.leverage = input.leverage;
  if (input.autoTradeEnabled !== undefined) settings.autoTradeEnabled = input.autoTradeEnabled;
  const [existing] = await db.select().from(binanceSettings).limit(1);
  if (existing) {
    await db.update(binanceSettings).set(settings as any).where(eq(binanceSettings.id, existing.id));
  } else {
    await db.insert(binanceSettings).values(settings as any);
  }
}

export async function getTradeExecutions(limit = 50) {
  let db: ReturnType<typeof getDb> | null = null;
  try { db = getDb(); } catch { /* env not set */ }
  if (!db) return [];
  return db.select().from(tradeExecutions).orderBy(desc(tradeExecutions.executedAt)).limit(limit);
}

export async function getFuturesBalance() {
  const env = getEnv();
  const apiKey = env.BINANCE_API_KEY;
  const secretKey = env.BINANCE_SECRET_KEY;
  if (!apiKey || !secretKey) return 0;
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await createHmacSha256(secretKey, queryString);
    const response = await fetch(`https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`, {
      headers: { "X-MBX-APIKEY": apiKey },
    });
    const data = (await response.json()) as any;
    if (data.totalWalletBalance) return parseFloat(data.totalWalletBalance);
    return 0;
  } catch {
    return 0;
  }
}

export async function executeTradeForSignal(signal: { id: number; marketName: string; price: string; maxProfit: string; qualityTier: string; qualityScore: number }) {
  const settings = await getBinanceSettings();
  if (settings.killSwitchActive) return { success: false, reason: "kill_switch_active" };
  if (!settings.autoTradeEnabled) return { success: false, reason: "auto_trade_disabled" };
  return { success: false, reason: "binance_api_not_configured" };
}
