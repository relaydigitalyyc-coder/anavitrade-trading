# Standalone Anavitrade Trading App Plan

## Scope

Build the Manus export as an independent trading platform app. Do not merge it into `/home/ariel/anavi-project/anavi`.

## Approach

1. Reconstruct a Vite React project around the flat Manus export.
2. Preserve the existing route structure and trading/dashboard views.
3. Replace the missing Manus backend dependency with a local front-end data shim for auth, demo stats, signals, and wallet session state.
4. Fix Web3 wallet connection through Wagmi:
   - injected wallets
   - MetaMask
   - Coinbase Wallet
   - WalletConnect when `VITE_WALLETCONNECT_PROJECT_ID` is configured
   - graceful fallback when no project ID or wallet extension exists
5. Add compact TradingView widgets to trading-oriented dashboard surfaces.
6. Refine the UI for a focused trading product: dense, operational, readable, mobile-safe.
7. Verify with typecheck/build and run a local dev server.

## Verification

- `pnpm install`
- `pnpm check`
- `pnpm build`
- Start dev server and provide the local URL.
