export function getApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    // In dev, Vite proxies /api to localhost:8787
    return "";
  }
  // In production (Vercel), point at the Cloudflare Worker
  return "https://anavitrade-trading.erhazeariel.workers.dev";
}
