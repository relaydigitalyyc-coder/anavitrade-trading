// Wallet E2E Tests
// Run: node tests/wallet-e2e.mjs
// Requires: dev server running on SMOKE_BASE_URL (default http://127.0.0.1:5174)

import { chromium } from "playwright";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5174";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];

  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  try {
    await fn(page);
    // Show filtered console errors but don't fail on resource-load noise
    const critical = errors.filter(
      (e) =>
        !e.includes("Failed to load resource") &&
        !e.includes("net::ERR_BLOCKED_BY_CLIENT") &&
        !e.includes("ERR_NAME_NOT_RESOLVED") &&
        !e.includes("Connection request reset") &&
        !e.includes("Worker.load") &&
        !e.includes("cross-origin") &&
        !e.includes("third-party"),
    );
    if (critical.length) {
      console.log(`  ⚠  ${critical.length} console error(s):`);
      critical.forEach((e) => console.log(`     ${e.slice(0, 200)}`));
    }
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  } finally {
    await browser.close();
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Tests ──────────────────────────────────────────────────────────

async function run() {
  console.log(`\nWallet E2E — ${BASE_URL}\n`);

  await test("Dashboard loads wallet panel", async (page) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    await page.getByRole("button", { name: /ledger.*web3/i }).waitFor({ state: "visible", timeout: 15000 });
  });

  await test("WalletConnect modal opens and shows all wallet options", async (page) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    await page.getByRole("button", { name: /ledger.*web3/i }).click();
    await page.getByRole("heading", { name: /connect wallet/i }).waitFor({ state: "visible", timeout: 10000 });

    // All 4 wallet options are visible
    await page.getByRole("button", { name: /ledger nano/i }).waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: /metamask/i }).waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: /walletconnect/i }).waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: /coinbase wallet/i }).waitFor({ state: "visible", timeout: 5000 });

    // Security guarantees visible
    await page.getByText(/private keys never leave/i).waitFor({ state: "visible", timeout: 5000 });
    await page.getByText(/zero custody/i).waitFor({ state: "visible", timeout: 5000 });
  });

  await test("Modal closes with X button", async (page) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    await page.getByRole("button", { name: /ledger.*web3/i }).click();
    await page.getByRole("heading", { name: /connect wallet/i }).waitFor({ state: "visible", timeout: 10000 });

    // Find and click the close button (X icon)
    await page.locator("button").filter({ has: page.locator("svg.lucide-x") }).click();
    // Modal should be gone
    await page.getByRole("heading", { name: /connect wallet/i }).waitFor({ state: "hidden", timeout: 5000 });
  });

  await test("Modal closes on backdrop click", async (page) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    await page.getByRole("button", { name: /ledger.*web3/i }).click();
    await page.getByRole("heading", { name: /connect wallet/i }).waitFor({ state: "visible", timeout: 10000 });

    // Click the dimmed overlay (backdrop)
    const backdrop = page.locator(".fixed.inset-0.z-50");
    await backdrop.click({ position: { x: 10, y: 10 } });
    await page.getByRole("heading", { name: /connect wallet/i }).waitFor({ state: "hidden", timeout: 5000 });
  });

  await test("Ledger option opens USB/Bluetooth/QR guide", async (page) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    await page.getByRole("button", { name: /ledger.*web3/i }).click();
    await page.getByRole("heading", { name: /connect wallet/i }).waitFor({ state: "visible", timeout: 10000 });

    await page.getByRole("button", { name: /ledger nano/i }).click();
    await page.getByText(/ledger nano setup/i).waitFor({ state: "visible", timeout: 5000 });
    await page.getByText(/connect via usb/i).waitFor({ state: "visible", timeout: 5000 });
    await page.getByText(/connect via bluetooth/i).waitFor({ state: "visible", timeout: 5000 });
    await page.getByText(/use walletconnect qr/i).waitFor({ state: "visible", timeout: 5000 });
  });

  await test("Ledger guide has back button", async (page) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    await page.getByRole("button", { name: /ledger.*web3/i }).click();
    await page.getByRole("heading", { name: /connect wallet/i }).waitFor({ state: "visible", timeout: 10000 });

    await page.getByRole("button", { name: /ledger nano/i }).click();
    await page.getByText(/ledger nano setup/i).waitFor({ state: "visible", timeout: 5000 });

    // Click back
    await page.getByText(/back to wallet selection/i).click();
    await page.getByRole("heading", { name: /connect wallet/i }).waitFor({ state: "visible", timeout: 5000 });
  });

  await test("MetaMask selection shows error when extension absent", async (page) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    await page.getByRole("button", { name: /ledger.*web3/i }).click();
    await page.getByRole("heading", { name: /connect wallet/i }).waitFor({ state: "visible", timeout: 10000 });

    await page.getByRole("button", { name: /metamask/i }).click();
    // Expect error or retry to appear since MetaMask extension isn't available headless
    const errEl = page.getByText("Connection Failed").or(page.getByText("Try Again"));
    await errEl.first().waitFor({ state: "visible", timeout: 20000 });
  });

  await test("Coinbase selection shows connecting state and fails gracefully", async (page) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    await page.getByRole("button", { name: /ledger.*web3/i }).click();
    await page.getByRole("heading", { name: /connect wallet/i }).waitFor({ state: "visible", timeout: 10000 });

    await page.getByRole("button", { name: /coinbase wallet/i }).click();
    // Should show connecting or error state after timeout
    await wait(3000);
    // After timeout or error, try-again button should be present or error shown
    const tryAgainBtn = page.getByText(/try again/i);
    const errHeading = page.getByText(/connection failed/i);
    const connecting = page.getByText(/connecting to coinbase/i);
    // One of these states should be visible — all acceptable outcomes
    await Promise.race([
      tryAgainBtn.waitFor({ state: "visible", timeout: 5000 }).then(() => {}),
      errHeading.waitFor({ state: "visible", timeout: 5000 }).then(() => {}),
      connecting.waitFor({ state: "visible", timeout: 2000 }).then(() => {}),
    ]);
  });

  await test("Wallet panel shows not-connected state on first load", async (page) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    // The wallet panel has a specific data attribute
    const walletButton = page.getByRole("button", { name: "Connect Wallet", exact: true });
    await walletButton.waitFor({ state: "visible", timeout: 15000 });
  });

  await test("Kill switch button hidden when no wallet connected", async (page) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    // The kill switch header button should NOT be visible
    const killBtn = page.getByRole("button", { name: /kill switch/i });
    const resumeBtn = page.getByRole("button", { name: /resume trading/i });
    await wait(1000);
    const killVisible = await killBtn.isVisible().catch(() => false);
    const resumeVisible = await resumeBtn.isVisible().catch(() => false);
    if (killVisible || resumeVisible) {
      throw new Error("Kill switch button visible when no wallet connected");
    }
  });

  await test("WalletConnect selection shows connecting spinner", async (page) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    await page.getByRole("button", { name: /ledger.*web3/i }).click();
    await page.getByRole("heading", { name: /connect wallet/i }).waitFor({ state: "visible", timeout: 10000 });

    await page.getByRole("button", { name: /walletconnect/i }).click();
    // Connecting state should appear
    await page.getByText(/connecting to walletconnect/i).waitFor({ state: "visible", timeout: 10000 });
  });

  await test("Error state shows Try Again button", async (page) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    await page.getByRole("button", { name: /ledger.*web3/i }).click();
    await page.getByRole("heading", { name: /connect wallet/i }).waitFor({ state: "visible", timeout: 10000 });

    // Trigger MetaMask connect to cause error
    await page.getByRole("button", { name: /metamask/i }).click();
    await page.getByText(/connection failed/i).waitFor({ state: "visible", timeout: 15000 });

    // Try Again should be present and clickable
    await page.getByRole("button", { name: /try again/i }).click();
    // Returns to wallet selection
    await page.getByRole("heading", { name: /connect wallet/i }).waitFor({ state: "visible", timeout: 5000 });
  });

  // Summary
  const total = passed + failed;
  console.log(`\n${total} tests — ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
