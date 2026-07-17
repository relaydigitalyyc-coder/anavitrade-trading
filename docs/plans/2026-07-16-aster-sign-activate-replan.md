# Aster Sign Activate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `Sign & Activate Aster` reliable across wallets whose current EVM chain differs from Aster's signing domain, while preserving Aster Agent plus Builder authorization.

**Architecture:** Keep the production activation path on Aster Code `POST /fapi/v3/approveAgent`, because it supports Agent approval plus `builder`/`maxFeeRate` in one request. Generate the Aster management EIP-712 payload on the server, sign it in the browser through raw EIP-1193 `eth_signTypedData_v4`, then submit the exact server challenge plus signature back to the Worker for Aster API submission and readback validation.

**Tech Stack:** React, Wagmi wallet connection state, raw EIP-1193 provider RPC, tRPC, Cloudflare Worker, Aster Futures/API V3, Node smoke tests, Playwright browser harness.

---

## Research Summary

- Aster Code management endpoints use dynamic EIP-712 `primaryType` values such as `ApproveAgent`; the docs also note demo field names capitalize the first letter before signing.
- Aster Code `approveAgent` accepts `builder` and `maxFeeRate`, which is required for Anavitrade builder attribution and fee cap approval.
- Aster trading endpoints use a separate `Message.msg` signature mode where the signed string must exactly match the final query string.
- Aster Futures `registerAndApproveAgent` is a different public endpoint with `signatureChainId` and `Message.msg` signing semantics. It is useful as a compatibility fallback, but it does not replace the current builder approval contract.
- The viem error `chainId should be same as current chainId` is a client-library validation problem. Avoid Wagmi/viem typed-data signing for this flow; call the wallet provider directly with `eth_signTypedData_v4`.

Source docs:
- https://asterdex.github.io/aster-api-website/asterCode/authentication/
- https://asterdex.github.io/aster-api-website/asterCode/endpoints/
- https://asterdex.github.io/aster-api-website/futures-v3/account%26trades/

## Current Local State

- `src/lib/asterWalletSignature.ts` already signs via raw `eth_signTypedData_v4`.
- `src/pages/AsterOnboarding.tsx` already gets the connector provider, prepares the server challenge, signs, and calls `completeRegistration`.
- `src/server/aster/store.ts` already builds dynamic `ApproveAgent` typed data with capitalized field names.
- `src/server/aster/client.ts` already reads empty JSON bodies safely and sends `signatureChainId` with `approveAgent`.
- `scripts/aster-contract-smoke.ts` already covers `signatureChainId`, empty response bodies, and the raw browser signing helper.

## Implementation Plan

### Task 1: Lock The Endpoint Contract

**Files:**
- Modify: `src/server/aster/types.ts`
- Modify: `src/server/aster/store.ts`
- Modify: `src/server/aster/client.ts`
- Test: `scripts/aster-contract-smoke.ts`

**Step 1: Add an explicit activation mode type**

Add a narrow internal type that names the current path:

```ts
export type AsterAgentActivationMode = "approveAgentWithBuilder";
```

Use it in the challenge response so future readers do not confuse this flow with `registerAndApproveAgent`.

**Step 2: Include the mode in the registration challenge**

In `registrationChallenge`, return:

```ts
activationMode: "approveAgentWithBuilder",
endpoint: "/fapi/v3/approveAgent",
```

**Step 3: Assert the mode in completion**

Extend the tRPC schema and `completeAsterRegistration` input to accept the mode/endpoint from the challenge, then reject any mismatched endpoint:

```ts
if (input.activationMode !== "approveAgentWithBuilder") {
  throw new Error("ASTER_REGISTRATION_MODE_MISMATCH");
}
```

**Step 4: Add smoke coverage**

In `scripts/aster-contract-smoke.ts`, assert the challenge mode and endpoint when creating mocked challenge data.

**Step 5: Verify**

Run:

```bash
pnpm aster:smoke-contract
```

Expected: `ASTER_CONTRACT_SMOKE_PASS`.

### Task 2: Harden Wallet Signing Boundaries

**Files:**
- Modify: `src/lib/asterWalletSignature.ts`
- Modify: `src/pages/AsterOnboarding.tsx`
- Test: `scripts/aster-contract-smoke.ts`

**Step 1: Validate typed-data shape before RPC**

Add checks that fail before wallet prompt when the server challenge is malformed:

```ts
if (input.typedData.domain?.name !== "AsterSignTransaction") {
  throw new Error("Invalid Aster signature challenge.");
}
if (input.typedData.primaryType !== "ApproveAgent") {
  throw new Error("Invalid Aster signature challenge type.");
}
```

**Step 2: Preserve the raw provider path**

Keep:

```ts
provider.request({
  method: "eth_signTypedData_v4",
  params: [account, JSON.stringify(typedData)],
});
```

Do not reintroduce Wagmi `useSignTypedData` or viem `signTypedData` in the browser activation path.

**Step 3: Improve user-facing chain error handling**

If a wallet rejects because it enforces current chain anyway, show a specific toast:

```ts
"Your wallet refused the Aster signing domain. Switch to the wallet/account that supports Aster typed-data signing and try again."
```

Do not ask the user to switch to chain `1666` unless the wallet explicitly requires it, because this is a signature-domain value, not necessarily the connected wallet chain.

**Step 4: Add smoke coverage**

Add a test that passes `eth_chainId = 0x1` but typed-data `domain.chainId = 1666`, and asserts the helper still calls `eth_signTypedData_v4`.

**Step 5: Verify**

Run:

```bash
pnpm aster:smoke-contract
```

Expected: `ASTER_CONTRACT_SMOKE_PASS`.

### Task 3: Make `signatureChainId` Contract Explicit

**Files:**
- Modify: `src/server/aster/client.ts`
- Modify: `src/server/aster/config.ts`
- Test: `scripts/aster-contract-smoke.ts`

**Step 1: Keep `signatureChainId` on `approveAgent`**

Even though the Aster Code endpoint table does not list it, deployed behavior has required it. Continue sending:

```ts
queryParams.set("signatureChainId", String(getAsterConfig().codeSigningChainId));
```

**Step 2: Add config naming comments**

Clarify that `ASTER_CODE_SIGNING_CHAIN_ID` controls Aster Code management signatures:

```ts
// Aster Code management domain: 1666 production, 714 testnet.
```

**Step 3: Assert defaults**

Smoke assertions:

```ts
assert.equal(params.get("signatureChainId"), "1666");
assert.equal(testnetParams.get("signatureChainId"), "714");
```

**Step 4: Verify**

Run:

```bash
pnpm aster:smoke-contract
```

Expected: both production and testnet `signatureChainId` assertions pass.

### Task 4: Keep Response Parsing Defensive

**Files:**
- Modify: `src/server/aster/client.ts`
- Test: `scripts/aster-contract-smoke.ts`

**Step 1: Preserve `readAsterJson`**

Keep parsing through `response.text()` first:

```ts
if (!text.trim()) return {} as T;
```

**Step 2: Use it everywhere Aster may return empty 2xx**

Confirm it is used by:
- `getServerTime`
- `getTickerPrice`
- `signedRequest`
- `approveAgent`

**Step 3: Verify**

Run:

```bash
pnpm aster:smoke-contract
```

Expected: empty success response test passes.

### Task 5: Browser-Level Activation Proof

**Files:**
- Modify: `scripts/aster-onboarding-browser.ts`
- Optionally create: `scripts/aster-onboarding-browser-mock.ts`

**Step 1: Add a deterministic mock browser script**

Mock tRPC responses for:
- wallet session
- `aster.prepareRegistration`
- `aster.completeRegistration`
- `aster.getStatus`

Inject a wallet where:

```ts
eth_chainId = "0x1";
typedData.domain.chainId = 1666;
```

**Step 2: Assert behavior**

The script must assert:
- the wallet receives `eth_signTypedData_v4`
- the payload has `primaryType: "ApproveAgent"`
- the payload has `domain.chainId: 1666`
- `completeRegistration` is called exactly once
- no visible `chainId should be same as current chainId` error appears

**Step 3: Keep live browser script separate**

Keep `scripts/aster-onboarding-browser.ts` as the full environment proof against a real local/dev backend.

**Step 4: Verify mocked browser flow**

Run the mock script with:

```bash
pnpm tsx scripts/aster-onboarding-browser-mock.ts
```

Expected: `ASTER_BUTTON_BROWSER_MOCK_PASS`.

### Task 6: Local And Production Rollout

**Files:**
- Modify only if needed: `vite.config.ts`
- Deploy command: `pnpm deploy`

**Step 1: Test with local Worker**

Run local Worker and Vite with the local API target:

```bash
pnpm run dev:server
VITE_API_TARGET=http://127.0.0.1:8787 pnpm run dev:client
```

**Step 2: Run full browser flow**

Run:

```bash
ASTER_BROWSER_BASE_URL=http://127.0.0.1:5173 pnpm tsx scripts/aster-onboarding-browser.ts
```

Expected: `ASTER_BROWSER_ONBOARDING_PASS`.

**Step 3: Deploy**

After local proof:

```bash
pnpm build
pnpm deploy
```

**Step 4: Production smoke**

Use the deployed app and verify the Sign & Activate button no longer returns:

```text
chainId should be same as current chainId
Unexpected end of JSON input
Mandatory parameter 'signatureChainId' was not sent
```

### Task 7: Backlog Fallback Only If Aster Rejects `approveAgent`

**Files:**
- Create: `src/server/aster/registerAndApprove.ts`
- Modify: `src/server/aster/client.ts`
- Modify: `src/server/aster/store.ts`
- Test: `scripts/aster-contract-smoke.ts`

**Step 1: Do not implement this unless live Aster rejects `approveAgent` after `signatureChainId` is deployed**

The fallback endpoint is:

```text
POST /fapi/v3/registerAndApproveAgent
```

It signs `Message.msg`, not dynamic `ApproveAgent`, and uses `signatureChainId` as both request parameter and EIP-712 domain chain ID.

**Step 2: Treat builder approval as a separate follow-up**

If using this fallback, add a second management signature for `approveBuilder`, because the fallback endpoint does not carry `builder`/`maxFeeRate` in the same documented contract.

**Step 3: Gate by config**

Add:

```text
ASTER_AGENT_REGISTRATION_ENDPOINT=approveAgent|registerAndApproveAgent
```

Default must remain `approveAgent`.

## Acceptance Criteria

- `Sign & Activate Aster` works when wallet current chain is Ethereum mainnet (`0x1`) and Aster typed-data domain chain is `1666`.
- Frontend never calls Wagmi/viem typed-data signing for Aster registration.
- Backend always sends `signatureChainId` for Aster Agent approval.
- Empty 2xx Aster responses do not throw JSON parse errors.
- Aster Agent and Builder readback both pass before local account status changes to `active`.
- `pnpm aster:smoke-contract` passes.
- `pnpm build` passes.
- `pnpm check` either passes or only reports unrelated pre-existing type errors with file references.
