import { chromium } from "playwright";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5174";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /ledger \/ web3/i }).waitFor({ timeout: 15000 });

await page.getByRole("button", { name: /ledger \/ web3/i }).click();
await page.getByRole("heading", { name: /connect wallet/i }).waitFor({ timeout: 10000 });
await page.getByRole("button", { name: /walletconnect/i }).click();
await page.getByText(/connecting to walletconnect/i).waitFor({ timeout: 15000 });
await page.locator("w3m-modal.open").waitFor({ timeout: 15000 });

await page.keyboard.press("Escape");
await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /ledger \/ web3/i }).waitFor({ timeout: 15000 });

await page.getByRole("button", { name: /ledger \/ web3/i }).click();
await page.getByRole("button", { name: /ledger nano/i }).click();
await page.getByText(/ledger nano setup/i).waitFor({ timeout: 10000 });
await page.getByText(/connect via usb/i).waitFor({ timeout: 10000 });
await page.getByText(/use walletconnect qr/i).waitFor({ timeout: 10000 });

await browser.close();

const filteredErrors = errors.filter((error) => {
  return (
    !error.includes("Failed to load resource") &&
    !error.includes("net::ERR_BLOCKED_BY_CLIENT") &&
    !error.includes("Connection request reset")
  );
});

if (filteredErrors.length) {
  console.error(filteredErrors.join("\n"));
  process.exit(1);
}

console.log("wallet smoke passed");
