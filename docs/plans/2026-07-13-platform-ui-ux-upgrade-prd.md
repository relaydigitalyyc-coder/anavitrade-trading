# PRD: Platform UI/UX Upgrade with 21st.dev Component System

Date: 2026-07-13
Repo: `/home/ariel/anavitrade-trading`
Stack: React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, framer-motion, wouter
Theme: dark-only OKLCH, deep navy surfaces, azure primary, gold winner states

## 1. Purpose

Upgrade the Anavitrade platform UI from a polished dashboard into a production-grade trading workstation that feels dense, fast, accessible, and trustworthy across desktop, tablet, and mobile. The upgrade should maximize practical use of 21st.dev community component patterns while preserving the existing ANAVI visual identity and design tokens.

This PRD is for build execution. It should be implemented as scoped UI/UX increments with verification gates, not as a visual redesign.

## 2. Source Inputs

Primary product context:
- Existing design system: `src/styles/tokens.css`, `src/styles/utilities.css`, `src/styles/animations.css`, `src/styles/components.css`
- Existing app shell: `src/components/DashboardLayout.tsx`
- Core dashboard surfaces: `src/pages/Dashboard.tsx`, `src/components/dashboard/*`, `src/components/WalletPanel.tsx`, `src/components/ConnectedExchangesPanel.tsx`

21st.dev source categories:
- Component index: https://21st.dev/community/components
- Marquee components: https://21st.dev/community/components/s/marquee
- Stats & KPI components: https://21st.dev/community/components/s/stats
- Dashboard components: https://21st.dev/community/components/s/dashboard
- Table components: https://21st.dev/community/components/s/table
- Related categories to inspect during implementation: Cards, Charts & Data Viz, Empty States, Sidebars, Paginations, Tabs, Tooltips, Toggles, Sign Ins, Sign ups

21st.dev MCP note:
- Use the 21st.dev MCP directly when available in the agent environment.
- In the current session, a callable 21st.dev MCP was not exposed; the fallback is source-backed use of the public 21st.dev catalog and local implementation of selected patterns.
- Do not paste unreviewed third-party component code directly into product files. Import/adapt only after dependency, accessibility, and visual-token review.

## 3. Product Goals

1. Dashboard scan speed
   Users should understand portfolio status, execution readiness, latest signal quality, and risk posture within 5 seconds at 1440px desktop and without horizontal page scroll at 375px mobile.

2. Trading trust
   Copytrade, wallet, Aster, exchange, and kill-switch states must communicate custody, risk, and operational status clearly without relying on color alone.

3. Mobile parity
   Mobile should not be a compressed desktop table. Signal feed, stat cards, wallet state, exchange controls, and onboarding forms need mobile-native card/list layouts.

4. Perceived performance
   Route transitions, async content, chart panels, signal feeds, exchange panels, and auth flows should show skeletons or contextual empty/error states instead of blank areas or spinner-only states.

5. Motion discipline
   Motion must be subtle, functional, and reduced-motion compliant. Micro-interactions should use 150-300ms transitions or spring feedback, and no animation may block input.

## 4. Non-Goals

- Do not change brand direction, color identity, typography stack, or dark-only mode.
- Do not add decorative shader/orb-heavy effects from 21st.dev if they reduce readability or performance.
- Do not introduce a second design system beside shadcn/ui plus existing ANAVI CSS tokens.
- Do not change trading logic, auth contracts, CEX contracts, or backend APIs except where UI state handling requires explicit loading/error fields.
- Do not ship unbounded animation libraries or heavy visual dependencies without bundle review.

## 5. Component Adoption Strategy

### 5.1 21st.dev Components to Prioritize

Use these categories first because they map directly to platform needs:

1. Marquees
   Target surface: market ticker / signal ticker / compact winner stream.
   Build as: `MarketTickerRail` or upgrade `TradingViewMiniWidgets` with a tokenized, pause-on-hover, reduced-motion-safe ticker.
   Required behavior: paused or static list under `prefers-reduced-motion: reduce`; no content hidden from screen readers.

2. Stats & KPIs
   Target surface: `DashboardStatsRow`, demo performance summaries, wallet/exchange balances.
   Build as: compact KPI cards with icon, label, primary value, delta, secondary status, skeleton state.
   Required behavior: tabular numerals, no layout shift, accessible positive/negative labels beyond color.

3. Dashboard components
   Target surface: dashboard grid composition, execution readiness panel, wallet/exchange panels.
   Build as: dense workstation sections, not marketing cards. Preserve current shell and sidebar.
   Required behavior: stable responsive grid at 375, 768, 1440.

4. Tables
   Target surface: `LiveSignalFeed`, trade history, connected exchanges.
   Build as: desktop table plus mobile card/list mode. Support sorting affordance, pagination controls, skeleton rows, empty/error states.
   Required behavior: no horizontal page scroll on mobile; table cells use `scope`, readable headers, and tabular data.

### 5.2 21st.dev Components to Use Selectively

- Cards: use for repeated data items only, not nested page sections.
- Empty States: adapt for no signals, no exchanges, no wallet, no demo trades.
- Sidebars: only for refinement of current shadcn sidebar; do not replace the app shell.
- Tooltips: use for icon-only controls and dense risk metrics.
- Tabs/Toggles: use for mode, timeframe, tier, and view controls.
- Sign Ins / Sign ups: use for auth polish, but preserve existing auth flows and copy.

### 5.3 21st.dev Components to Avoid by Default

- Shader-heavy backgrounds, cursor effects, ornamental hero animations, and large WebGL/Spline scenes.
- Marketing-first hero/CTA blocks inside authenticated app surfaces.
- Components requiring dependencies that materially increase initial dashboard bundle without clear product value.

## 6. UX Requirements

### 6.1 Accessibility

- All interactive controls must have visible focus states.
- Icon-only controls must have `aria-label` or accessible text.
- Touch targets must be at least 44x44px where practical; dense table cells may be smaller only when not directly interactive.
- Status must not rely on color alone. Pair color with text, icon, or label.
- Route changes should move focus to the main region.
- Loading and errors should use `aria-live` where users need updates.
- Forms must have visible labels, inline error messages, autocomplete attributes, disabled submit states, and recovery guidance.

### 6.2 Responsive Behavior

Required viewport targets:
- 375px mobile
- 768px tablet
- 1440px desktop

Rules:
- No horizontal page scroll at 375px.
- Desktop data tables may scroll internally only inside their container.
- Signal feed switches to mobile cards below `md`.
- Dashboard cards use 2 columns on small screens only when content remains legible; otherwise single column.
- Header actions must remain reachable on mobile and may horizontally scroll within the header action area.

### 6.3 Loading, Error, Empty States

Every async dashboard surface must implement all three states:
- Loading: skeletons matching loaded dimensions.
- Empty: contextual next action, no blank cards.
- Error: cause plus retry path.

Initial required surfaces:
- Dashboard route fallback
- Signal feed
- Portfolio chart panel
- Wallet panel
- Connected exchanges
- Aster execution panel
- Historical performance
- Auth submit flows

### 6.4 Motion

- Use `MotionConfig reducedMotion="user"` at app root.
- Page transitions: 150-250ms opacity/translate, disabled or reduced under reduced motion.
- Press feedback: 0.97-0.99 scale for primary buttons/cards only.
- Skeleton shimmer/pulse must stop or reduce under reduced motion.
- Marquees must pause on hover/focus and become static under reduced motion.

## 7. Build Scope

### Phase 1: Foundation and Safety

Files likely touched:
- `src/App.tsx`
- `src/styles/animations.css`
- `src/styles/components.css`
- `src/styles/utilities.css`
- `src/components/DashboardLayout.tsx`
- `src/components/DashboardLayoutSkeleton.tsx`

Requirements:
- Route-level lazy loading with Suspense fallback.
- Reduced-motion root configuration.
- App-wide focus-visible consistency.
- Standard skeleton patterns for route, cards, rows, and charts.
- Shared utility classes for ticker, data-card, touch-safe icon button, and mobile data list.

Acceptance criteria:
- `npx tsc --noEmit` passes.
- `npx vite build` passes.
- No visual identity drift from current OKLCH tokens.

### Phase 2: 21st.dev-Inspired Dashboard Upgrade

Files likely touched:
- `src/pages/Dashboard.tsx`
- `src/components/dashboard/DashboardStatsRow.tsx`
- `src/components/dashboard/PortfolioChartPanel.tsx`
- `src/components/dashboard/LiveSignalFeed.tsx`
- `src/components/dashboard/GoldWinnersPodium.tsx`
- `src/components/TradingViewMiniWidgets.tsx`

Requirements:
- Replace/augment ticker area with a 21st.dev marquee-style `MarketTickerRail`.
- Upgrade KPI cards with 21st.dev stats pattern: stable height, tabular values, delta chips, skeleton support.
- Make signal feed desktop table plus mobile cards.
- Add explicit signal feed error and retry state if hook exposes error; otherwise extend hook.
- Ensure winners use gold token, icon/text labels, and no emoji-only markers.
- Chart panel gets skeleton and empty-state action.

Acceptance criteria:
- Dashboard is usable at 375/768/1440.
- Signal feed has no page-level horizontal scroll at 375.
- Reduced-motion mode removes marquee motion and route movement.
- Manual keyboard pass can reach every control in a logical order.

### Phase 3: Wallet, Exchange, and Execution Workstation

Files likely touched:
- `src/components/WalletPanel.tsx`
- `src/components/ConnectedExchangesPanel.tsx`
- `src/components/dashboard/AsterExecutionPanel.tsx`
- `src/components/dashboard/ActivationCard.tsx`
- onboarding pages under `src/pages/*Onboarding.tsx`

Requirements:
- Use dashboard/card patterns from 21st.dev but keep operational density.
- Improve kill-switch, revoke, refresh, and connect controls with accessible labels and confirmation states.
- Add skeletons to exchange list and wallet details.
- Add mobile-first layouts for exchange connection cards.
- Make destructive controls visually and spatially distinct.

Acceptance criteria:
- All icon-only actions have names.
- All async actions show pending state and prevent duplicate submission.
- Empty exchange/wallet states have clear next action.

### Phase 4: Auth and Public Flow Polish

Files likely touched:
- `src/pages/Login.tsx`
- `src/pages/Register.tsx`
- `src/pages/ForgotPassword.tsx`
- `src/pages/ResetPassword.tsx`
- `src/pages/VerifyEmail.tsx`
- `src/pages/DemoSignup.tsx`
- `src/pages/PublicDemo.tsx`

Requirements:
- Adapt 21st.dev sign-in/sign-up patterns only where they improve clarity.
- Preserve brand left-panel structure unless it creates mobile issues.
- Add `aria-describedby`, `aria-invalid`, and inline field recovery hints.
- Password toggle buttons must be keyboard reachable and labeled.
- Submit buttons show pending state with disabled double-submit protection.

Acceptance criteria:
- Forms remain usable on 375px without clipped text.
- Errors are announced and placed near fields.
- Auth pages do not introduce light-mode assumptions.

### Phase 5: Performance and Verification

Requirements:
- Audit Vite chunk output after lazy loading.
- Lazy load below-fold dashboard modules where chunk split is beneficial.
- Avoid importing heavy chart/animation dependencies into the initial public/auth bundle.
- Capture screenshots at 375, 768, 1440 for dashboard and auth pages.
- Check reduced motion in browser emulation.

Required commands:
```bash
npx tsc --noEmit
npx vite build
```

Optional repo script:
```bash
pnpm check
pnpm build
```

Acceptance criteria:
- Build passes.
- No new console errors in dashboard route.
- No horizontal page scroll on 375px dashboard.
- Bundle changes are explained if any chunk materially grows.

## 8. Implementation Notes

### 8.1 Component Location

New platform-level UI components should live in:
- `src/components/dashboard/` for dashboard-specific modules.
- `src/components/ui/` only for generic reusable primitives.
- `src/components/` for cross-page product components like wallet/exchange/ticker panels.

### 8.2 Styling Rules

- Use Tailwind v4 utilities and existing token utilities first.
- Prefer OKLCH tokens and CSS variables from `src/styles/*.css`.
- Avoid raw hex except inside third-party iframe/document embeds where unavoidable.
- Preserve fonts: Satoshi for headings, DM Sans for body, JetBrains Mono for data.
- Cards: max 8-14px radius depending on existing local pattern; avoid nested card stacks.
- Data values: use tabular numerals.

### 8.3 21st.dev Import Rules

For each 21st.dev component adopted:
1. Record source category and component name in the PR or commit notes.
2. Strip incompatible colors, fonts, and marketing copy.
3. Replace styling with ANAVI tokens.
4. Replace emojis with Lucide icons.
5. Add reduced-motion behavior.
6. Add loading, empty, error states where applicable.
7. Verify TypeScript strictness and no unused dependencies.

## 9. Risks

- 21st.dev components may be visually impressive but not operationally appropriate for a trading workstation.
- Imported animations can increase bundle size or harm reduced-motion users.
- Data-heavy components can regress mobile usability if desktop table patterns are reused unchanged.
- Third-party embeds such as TradingView can dominate perceived performance unless isolated and lazy loaded.
- Root-level providers still pull large wallet/chart/motion dependencies into the production graph; route lazy loading helps page code but does not fully solve initial bundle weight.

## 10. Production System Caveats

These caveats must be resolved or consciously accepted before treating the UI upgrade as production-complete:

- API base URL is environment-sensitive. Current frontend production routing uses `getApiBaseUrl()` and points at the Cloudflare Worker origin. This is acceptable for the main Vercel deployment, but preview deployments, custom domains, or staging environments need env-based API configuration instead of a single hard-coded production URL.
- CORS is currently allowlist-based. The Worker allowlist includes localhost and the main Vercel app origin. Vercel preview URLs, branch URLs, and future custom domains will fail authenticated API calls unless CORS origin handling is expanded deliberately.
- Authenticated dashboard visual QA still needs a valid production-like session. Public/auth routes can be smoke-tested without backend state, but dashboard widgets depend on protected tRPC queries, wallet/session state, and live/demo account data.
- Market ticker data is partly fallback-driven. `MarketTickerRail` can render from top signal data, but until live market data is wired in, non-signal items are curated fallback values and should not be presented as exchange-authoritative real-time prices.
- Bundle weight remains a production performance risk. The build still includes large `wagmi`, wallet modal, Recharts, and Framer chunks. Further optimization should defer wallet providers and heavy chart modules until authenticated/dashboard use when practical.
- Third-party embeds remain a resilience risk. TradingView iframes are lazy-loaded, but network failures, blocked scripts, or slow embeds need graceful fallback states before launch-critical reliance.
- Build warnings from Rollup around third-party `ox` pure annotations are non-blocking today, but should be monitored during dependency upgrades.

## 11. Open Questions

- Should the market ticker use live exchange data, signal hook data, or static curated pairs until backend data is available?
- Should signal feed support column customization on desktop?
- Should exchange and wallet panels share a unified `ExecutionConnectionCard` pattern?
- Should the public marketing pages receive the same 21st.dev pass now or after authenticated app surfaces are complete?

## 12. Definition of Done

The UI/UX upgrade is done when:
- Dashboard, performance, wallet/exchange, onboarding, and auth surfaces pass responsive checks at 375/768/1440.
- All key async surfaces have loading, error, and empty states.
- All critical controls are keyboard reachable and visibly focused.
- Reduced-motion mode is respected for route transitions, tickers, skeletons, and micro-interactions.
- 21st.dev-derived components are tokenized to ANAVI OKLCH colors and do not introduce a competing visual language.
- `npx tsc --noEmit && npx vite build` passes.
