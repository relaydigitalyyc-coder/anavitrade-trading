# UI Upgrade Production Caveats Audit

Date: 2026-07-13
Scope: 21st.dev-inspired UI/UX upgrade, production readiness, and agent handoff
Canonical pointer: `CLAUDE.md` -> "Agent Handoff Notes"

## Summary

The UI upgrade build is locally healthy, but the platform should not be treated as production-complete until the deployment/API caveats below are resolved or consciously accepted. The risks are mostly integration and runtime-environment risks, not TypeScript/build blockers.

## Verification Performed

- `npx tsc --noEmit` passed.
- `npx vite build` passed.
- `pnpm run check` passed, including the server TypeScript config.
- Public/login responsive smoke checks passed at 375px, 768px, and 1440px with no page errors and no horizontal overflow.

Known gap: authenticated dashboard visual QA still needs a production-like session and representative data. Public/auth route checks do not prove wallet, tRPC, signal, exchange, and dashboard states are production-ready.

## Production Caveats

### 1. API Origin Is Hard-Coded For Production

Evidence:
- `src/config.ts` returns an empty API base in dev and `https://anavitrade-trading.erhazeariel.workers.dev` in production.
- `src/main.tsx` uses `${getApiBaseUrl()}/api/trpc`.

Impact:
- Main Vercel production can reach the Worker, but staging, preview deployments, branch URLs, and future custom domains will silently inherit the same production Worker target.
- This makes environment separation, QA isolation, and rollback validation fragile.

Recommended next action:
- Replace the hard-coded production Worker origin with an explicit env var such as `VITE_API_BASE_URL`, with documented values for local, preview, staging, and production.

### 2. Worker CORS Allowlist Is Too Narrow For Preview/Custom Domains

Evidence:
- `src/server/worker.ts` currently allows `http://localhost:5174`, `http://127.0.0.1:5174`, and `https://anavitrade-trading.vercel.app`.

Impact:
- Vercel preview URLs, branch URLs, and custom domains will fail credentialed API calls unless their origins are added.
- This directly affects authenticated dashboard flows because tRPC fetches use `credentials: "include"`.

Recommended next action:
- Centralize allowed origins in Worker env config. Add a deliberate preview-domain strategy, either explicit preview origins or a constrained trusted regex for Vercel preview hosts.

### 3. Authenticated Dashboard QA Is Not Complete

Evidence:
- The smoke pass covered public/login responsiveness.
- The dashboard depends on protected tRPC queries, wallet/session state, live/demo account state, signal data, exchange connections, and kill-switch state.

Impact:
- Empty/error/loading states on authenticated trading surfaces can regress even when public pages and TypeScript pass.
- Dashboard-only failures may appear only with real session cookies, D1 state, or connected wallet/exchange data.

Recommended next action:
- Add a stable production-like QA account/session fixture and a scripted dashboard smoke covering `/dashboard`, wallet panel, signal feed, exchange panel, and kill-switch controls.

### 4. Market Ticker Uses Fallback Data

Evidence:
- `src/components/dashboard/MarketTickerRail.tsx` composes top signal data with curated fallback ticker items.

Impact:
- The ticker improves scanability, but fallback rows are not exchange-authoritative live prices.
- Product copy and release notes must not imply this rail is real-time market data until a live market source is wired in.

Recommended next action:
- Feed the ticker from a live market/signal API, or visibly scope fallback content as "signal highlights" instead of real-time prices.

### 5. Initial Bundle Still Contains Heavy Root Providers

Evidence:
- `src/main.tsx` mounts `WagmiProvider`, tRPC, React Query, and `MotionConfig` at the root.
- Route-level lazy loading now helps page modules, but wallet/provider libraries still affect the production graph.

Impact:
- Initial load can remain heavier than the route split suggests, especially for unauthenticated/public users.
- Wallet and chart dependencies should be watched as the dashboard grows.

Recommended next action:
- Audit `vite build` chunks after each UI/platform pass. Defer wallet modal/provider setup and chart-heavy modules until authenticated or dashboard routes where practical.

### 6. TradingView Embeds Need Runtime Fallbacks

Evidence:
- `src/components/TradingViewMiniWidgets.tsx` lazy-loads TradingView iframes with `srcDoc`.

Impact:
- Slow networks, blocked third-party scripts, or TradingView outages can leave empty chart regions.
- Lazy loading reduces initial cost but does not give the user a recovery state.

Recommended next action:
- Add timeout/error fallback UI around TradingView widgets, with copy that distinguishes unavailable embed data from unavailable internal trading data.

### 7. Rollup `ox` Warnings Are Non-Blocking But Should Be Tracked

Evidence:
- `npx vite build` passes with warnings about third-party `ox` pure annotations.

Impact:
- The warnings do not block release today, but dependency upgrades can change tree-shaking behavior or warning volume.

Recommended next action:
- Keep these warnings noted in release validation. Re-check after wallet/Wagmi-related dependency updates.

## Files Intentionally Not Normalized By This Audit

These files were already dirty or related to surrounding production work. This audit documents their implications but does not revert or refactor them:

- `src/config.ts`
- `src/main.tsx`
- `src/server/worker.ts`
- `src/server/analysis/engine.ts`
- `.gstack/browse.json`
- `src/styles/tokens.css`

## Agent Instructions

Any agent working on deployment, UI/UX continuation, API routing, CORS, Vercel, Cloudflare Worker release, or authenticated dashboard QA should read this file before making changes.

Do not treat the UI upgrade as production-complete solely because `tsc`, Vite build, and public route smoke tests pass. The remaining risk is in authenticated runtime integration and environment configuration.
