# Project TODO

- [x] Set up dark theme with DM Sans + Inter fonts, navy/green color palette
- [x] Navigation bar with Product/Company dropdowns, Get Started and Login CTAs
- [x] Hero section with headline, subtitle, and interactive portfolio chart widget
- [x] Interactive chart widget with Balance/Portfolio/Fixed tabs, time range selectors, mock data
- [x] About section with 3 principle cards (Automate, Simplify, Scale)
- [x] Why Choose section with 3 feature cards (Automated Simplicity, Security & Control, Smarter Technology)
- [x] Strategy section with algorithm flow diagram
- [x] How It Works section with 3 steps
- [x] Testimonials carousel with user quotes
- [x] FAQ accordion with Anavitrade-specific Q&A
- [x] Footer with nav links, social icons, legal links
- [x] Demo account creation flow (sign-up form with starting capital selection)
- [x] Database schema for demo accounts
- [x] Demo dashboard page with portfolio balance, trade history table, capital growth chart
- [x] Anavitrade @ logo branding across all touchpoints
- [x] Write vitest tests for demo account backend
- [x] Premium CSS system: glassmorphism, gradient accents, refined animations, glow effects
- [x] iPhone mockup in hero section with trading widget inside
- [x] Cinematic scroll animations with framer-motion throughout
- [x] Navbar redesign: glassmorphism, smooth transitions, premium hover states
- [x] Hero section: large typography, animated gradient text, floating elements
- [x] About section: premium card hover effects, animated icons, staggered reveal
- [x] Why Choose section: glass cards with glow borders, icon animations
- [x] Strategy section: animated flow diagram with glowing connections
- [x] How It Works section: numbered steps with premium styling
- [x] Testimonials: glass card carousel with smooth transitions
- [x] FAQ: refined accordion with smooth expand animations
- [x] Footer: premium layout with gradient accents
- [x] Micro-interactions: button press effects, hover glow, smooth page transitions
- [x] Add Ledger Nano hardware wallet section to landing page with prominent device image
- [x] Add Ledger Nano FAQ item explaining hardware wallet integration
- [x] Reword provided Ledger content for Anavitrade's context (custody, API wallet, copytrade)

## Auth & Hyperliquid Onboarding Sprint

- [x] DB schema: add passwordHash, emailVerified, verificationToken, resetToken to users table
- [x] DB schema: create live_accounts table (userId, status, subscriptionTier, killSwitchActive)
- [x] DB schema: create api_wallet_connections table (userId, walletAddress, encryptedKey, status, hyperliquidAccount, createdAt, revokedAt)
- [x] Backend: register procedure (email+password, bcrypt hash, send verification email)
- [x] Backend: login procedure (verify password, issue JWT session cookie)
- [x] Backend: verifyEmail procedure (token-based)
- [x] Backend: forgotPassword + resetPassword procedures
- [x] Backend: connectApiWallet procedure (store encrypted API wallet credentials)
- [x] Backend: validateApiWallet procedure (Hyperliquid read-only check)
- [x] Backend: revokeApiWallet procedure
- [x] Backend: getLiveAccount procedure
- [x] Frontend: /register page with email+password form
- [x] Frontend: /login page
- [x] Frontend: /verify-email page
- [x] Frontend: /forgot-password and /reset-password pages
- [x] Frontend: /onboarding/hyperliquid 5-step wizard (account, deposit, API wallet, Ledger approval, confirm)
- [x] Frontend: /account/settings page (profile, security, API wallet status, revocation)
- [x] Frontend: upgrade demo dashboard with wallet status banner, kill switch, win rate, total return metrics
- [x] Navbar: add Login/Register links wired to auth pages
- [x] Write vitest tests for all new auth and wallet procedures
- [x] Frontend: /verify-email confirmation page with resend option
- [x] Navbar: wire Login button to /login and Get Started to /register
- [x] Remove fake/hardcoded trades from Dashboard trade history — show empty state instead
- [x] Fix login flow so users who registered can sign back in (session cookie + auth state)

## Web3 Wallet Connect & Ledger Copytrade Sprint

- [x] Install wagmi v2, viem, @walletconnect/modal, @ledgerhq/connect-kit-loader
- [x] DB schema: web3_wallet_sessions table (userId, walletAddress, chainId, walletType, connectedAt, status)
- [x] WalletConnect modal component with Ledger Nano, MetaMask, WalletConnect options
- [x] Ledger-specific onboarding wizard with copytrade architecture explanation
- [x] Trust/reassurance UI: security badges, "funds never leave your wallet" messaging
- [x] Connected wallet dashboard panel with copytrade status and kill switch
- [x] Backend: saveWalletSession, getWalletSession, revokeWalletSession procedures
- [x] Copytrade architecture: signal receiver hook ready for algo wiring
- [x] Security page explaining the copytrade model in detail

## User Flow Fixes
- [x] Fix register → verify email → login → dashboard redirect chain
- [x] Fix session persistence and protected route guard
- [x] Fix WalletConnect modal save-to-DB and dashboard state refresh
- [x] Fix Ledger onboarding wizard step navigation and completion redirect
- [x] Fix HyperliquidOnboarding step flow and redirect to dashboard
- [x] Fix navbar: all links wired correctly
- [x] Fix empty states on dashboard and wallet panel
- [x] Fix account settings: profile save, password change, wallet revocation
- [x] Fix back buttons and escape routes on all subpages

## Real Wagmi + Ledger Integration
- [x] Set up wagmi v2 config with WalletConnect projectId, Ledger connector, MetaMask, Coinbase
- [x] Wrap app in WagmiProvider + QueryClientProvider
- [x] Rewrite WalletConnectModal with real useConnect/useAccount/useDisconnect hooks
- [x] Real Ledger Nano connection via @ledgerhq/connect-kit-loader (via WalletConnect protocol)
- [x] Wire real wallet address to DB save on connect
- [x] Add Security page link to navbar Product dropdown

## WalletConnect Project ID + Direct Ledger USB/BT
- [x] Wire VITE_WALLETCONNECT_PROJECT_ID into wagmi config (already set in env)
- [x] Implement direct Ledger USB/Bluetooth path via @ledgerhq/connect-kit-loader (LedgerConnect implementation)
- [x] Add "Connect via USB/Bluetooth" option in Ledger guide step of WalletConnectModal
- [x] Fallback to WalletConnect QR if connect-kit is unavailable or browser doesn't support WebUSB

## Auth Flow Consistency Fix
- [x] Unify Register page — single form creates real account + optional demo capital
- [x] Fix DemoSignup to redirect to /register instead of being a separate account path
- [x] Fix all CTA buttons: Get Started → /register, Start Demo Account → /register?demo=true, Login → /login
- [x] Fix post-register redirect: auto-login after register, go to /dashboard
- [x] Fix post-login redirect: always go to /dashboard
- [x] Remove duplicate/orphaned DemoSignup page — merge into Register
- [x] Ensure every account creation path writes a real users row to DB
- [x] Fix Navbar mobile menu CTAs to match desktop

## Coinlegs Scraper + Two-Tier Copy Sprint
- [x] DB schema: coinlegs_signals table (id, signalId, exchg, marketName, market, indicatorName, signal, period, price, signalDate, recordDate, percentage24, lastPrice, createdAt)
- [x] Backend: coinlegs scraper service using direct API call (deduplicates by signalId)
- [x] Backend: periodic job wiring — scraper runs every 5 minutes via Heartbeat cron (task_uid: cUPmgghCZ56GXmUbtCVyVA)
- [x] Backend: tRPC signals.list and signals.scraperStatus procedures
- [x] Frontend: Dashboard trade history table replaced with live coinlegs signal feed
- [x] Frontend: Dashboard signal feed with Buy/Sell/Neutral filter + timeframe filter + pagination
- [x] Landing page: Add PricingSection with two tier cards (Signal Delivery free, Automated Trades contact)
- [x] Landing page: Update hero badge, subheadline, WhyChoose cards, CTA section copy
- [x] Landing page: Update HowItWorks steps, FAQ Q&A to reflect two-tier offering

## Ethereal Azure Design System
- [x] Fix blank white screen — convert @layer utilities to @utility directive for Tailwind v4 compatibility
- [x] Rewrite index.css with @utility for all custom classes (glow-azure, glass-card, gradient-text, etc.)
- [x] Deep space navy background (#020814) rendering correctly
- [x] Azure glassmorphism design on homepage, dashboard, navbar
- [x] Gold winner row highlighting in signal table
- [x] Gradient text (azure shimmer) on hero section
- [x] Login page redesigned with split layout matching Register page quality
- [x] All 27 tests passing after design system changes

## Demo Data Audit & Fix
- [x] Audit DemoDashboard.tsx — find all hardcoded dates, fake chart data, mock stats
- [x] Audit Dashboard.tsx — find all hardcoded numbers, fake portfolio balance
- [x] Audit Home.tsx — find all hardcoded hero stats, BangersSection data, ProofBar numbers
- [x] Audit HistoricalPerformance.tsx — find all hardcoded dates and chart data
- [x] Fix demo account portfolio chart — generate coherent growth curve from account creation date
- [x] Fix demo dashboard stats — portfolio balance, P&L, dates all consistent with account age
- [x] Fix homepage hero stats — live from DB, not hardcoded
- [x] Fix BangersSection — real signals from DB, not hardcoded
- [x] Fix ProofBar — live DB stats
- [x] Fix Historical Performance page dates — use real Apr 1 – Jul 5, 2026 range

## Signal-to-Trade Sync Engine
- [x] Audit drizzle/schema.ts — understand demo_accounts, demo_trades, coinlegs_signals tables
- [x] Add portfolio_snapshots table (demoAccountId, balance, timestamp, signalCount)
- [x] Add signal_id FK to demo_trades table (link trade to the coinlegs signal that triggered it)
- [x] Add last_synced_signal_id to demo_accounts (track which signals have been applied)
- [x] Build syncSignalsToDemoAccounts() in db.ts — apply new Tier A/B signals to all demo accounts
- [x] Compute position size from account balance and risk settings (default 2% risk per trade)
- [x] Compute P&L from signal MaxProfit% × position size when signal closes
- [x] Write portfolio snapshot after each sync run
- [x] Wire syncSignalsToDemoAccounts() into the Heartbeat scraper job (runs every 5 min)
- [x] Update getPortfolioSeries() to return real portfolio_snapshots with real timestamps
- [x] Update getTrades() to return real demo_trades with signal metadata
- [x] Update DemoDashboard chart — real dates on X axis (not "Day 0", "Day 1")
- [x] Update DemoDashboard stats — balance/P&L from real DB values
- [x] Update DemoDashboard trade table — show signal name, indicator, period, score
- [x] Backfill historical portfolio snapshots for existing demo accounts from signal history (via triggerSync mutation)

## Live Demo Dashboard
- [x] Fix position sizing: 0.5% of portfolio per entry (was 2%)
- [x] Auto-poll portfolio series + trades every 30s (refetchInterval)
- [x] Animate new trade rows sliding in when new data arrives
- [x] Show "Live" pulse indicator on dashboard header
- [x] Show last-updated timestamp on chart
- [x] Show "New trade" toast notification when a new trade is detected
- [x] Add a live signal feed panel showing the latest incoming signals (auto-polls every 30s, toasts on new arrivals)

## July Results Showcase
- [x] Query full July signal set: Tier A+B, Buy, quality score ≥ threshold, including zero/negative MaxProfit
- [x] Add getJulyResults tRPC procedure returning wins + losses with full metadata
- [x] Build JulyResultsSection on homepage: wins highlighted in green, losses shown honestly in red
- [x] Show summary bar: total trades, win/loss count, net return, best/worst trade
- [x] Animate trade cards scrolling in with stagger

## Tier A Strategy + Position Sizing Settings
- [x] Extend demo_accounts schema: positionSizePct (default 1.0), pyramidingEnabled (bool), pyramidMaxEntries (int, default 3), pyramidScalePct (decimal, default 0.5)
- [x] Migrate DB with new columns
- [x] Update sync engine: filter Tier A only by default, respect positionSizePct per account
- [x] Add pyramiding logic: if pyramidingEnabled, add up to pyramidMaxEntries entries on same asset, each scaled by pyramidScalePct
- [x] Add updateDemoSettings tRPC mutation (positionSizePct, pyramidingEnabled, pyramidMaxEntries, pyramidScalePct)
- [x] Build Position Sizing & Pyramiding settings panel on DemoDashboard
- [x] Update homepage hero stats to show Tier A numbers: +14.9% July return, 18 trades, avg +15.53%
- [x] Update ProofBar with Tier A figures
- [x] Update July Results section: default tab to Tier A signals only, show Tier B as separate tab

## Investor-Ready Fixes
- [x] Fix WalletConnect crash: @walletconnect/ethereum-provider import error in wagmi/connectors
- [x] Make demo dashboard fully public: create /demo route with pre-seeded Tier A account, no wallet required
- [x] Add updateDemoSettings tRPC mutation (positionSizePct, strategyTier, pyramidingEnabled, pyramidMaxEntries, pyramidScalePct)
- [x] Build Position Sizing & Pyramiding settings panel on DemoDashboard
- [x] Update homepage hero stats to Tier A numbers: +14.9% July return, 18 trades, avg +15.53%
- [x] Update ProofBar with Tier A figures
- [x] Update July Results section: show Tier A tab as default
- [x] Full audit: check every page for broken UI, placeholder text, empty states, mobile responsiveness
- [x] Ensure all "coming soon" placeholders show toast on click (not broken)
- [x] Fix any mobile layout issues visible in the screenshots

## Real Gaps to Fix
- [x] Implement updateDemoSettings tRPC mutation with strategyTier, positionSizePct, pyramidingEnabled, pyramidMaxEntries, pyramidScalePct
- [x] Build Position Sizing & Pyramiding settings panel in PublicDemo.tsx (sliders + save button)
- [x] Update JulyResultsSection: Tier A as default tab (wins tab shows +2%+ signals), Tier B shown as Weak Signals tab
- [x] Audit all placeholder/coming-soon nav items — all links are real anchor links or real routes, no dead placeholders
- [x] Take mobile screenshots and fix any layout issues — fixed PublicDemo header overflow on mobile

## Trade History Mobile UI + Risk Engine
- [x] Update sync engine: 5% capital risk per trade, 3× leverage (position = balance × 5% × 3)
- [x] Update DB defaults: positionSizePct = 5.0, leverage = 3 on demo_accounts
- [x] Rebuild trade history in PublicDemo.tsx: mobile-first card layout
- [x] Each trade card shows: pair, tier badge, indicator, entry price, exit price, P&L $, return %, date range
- [x] Add mini sparkline chart per trade card (price movement from entry to exit)
- [x] Add a full equity curve chart screenshot/section visible on mobile

## Three Next-Step Improvements
- [x] Replace hero phone mockup with live equity curve component (pulls real public demo data via tRPC)
- [x] Add month selector to Monthly Trade Log section (July live, June/May/April "coming soon" placeholders)
- [x] Add leverage disclaimer banner in demo footer (Risk Disclosure with dynamic leverage/risk values)

## Entry & Exit Timestamps
- [x] Trade cards in /demo: replace single date with Opened/Closed boxes showing date + time
- [x] Desktop trade history table in /demo: replace single Date column with Opened + Closed columns (date + time each)
- [x] Live Signal Feed table in /demo: add time below signal date
- [x] DemoDashboard trade history table: replace single Date column with Opened + Closed columns (date + time each)
- [x] Monthly Trade Log cards on homepage: add signal time below date

## Equity Curve & Trade Duration
- [x] Equity curve anchored to July 1 with daily flat baseline points before first trade
- [x] Chart subtitle now shows "Jul 1 → Jul 6" span
- [x] Trade cards in /demo: Duration row below timestamps (e.g. "4h 22m")
- [x] Desktop trade history table in /demo: Duration column added
- [x] DemoDashboard trade history table: Duration column added

## Branding, Days-Active Counter, Sortable Duration, Signal Backfill
- [x] Upload @navi logo (@ symbol + wordmark) and apply as site logo/favicon
- [x] Update navbar branding to use @navi logo image
- [x] Add days-active counter to hero widget ("X days live" since Jul 1)
- [x] Add sortable Duration column header to /demo trade history table
- [x] Investigate and fix missing Jul 1–5 Tier A signals (sync cursor issue)

## @navi Branding + Days-Active + Sortable Duration + Jul 1 Backfill
- [x] Apply @navi transparent PNG logo to Navbar, PublicDemo header, DemoDashboard header, Footer
- [x] Fix missing Jul 1-5 signals: remove createdAt filter from sync engine, reset demo account cursor, backfill 41 Tier A trades from Jul 1-6
- [x] Add days-active counter to hero widget ("6d live" next to Tier A label)
- [x] Add sortable Duration, P&L, and Closed columns to PublicDemo trade history table (click header to sort asc/desc)
- [x] Fix React hooks-order violation in HeroWidget (move daysActive useMemo above early return)

## WalletConnect Fix + Backfill + Live Stats + Chart Annotation
- [x] Fix WalletConnect end-to-end: wagmi config, modal, wallet session save to DB, dashboard state refresh
- [x] Backfill all 12 registered-user demo accounts from Jul 1 (remove createdAt filter, reset cursors)
- [x] Update homepage hero stats (ProofBar, hero badge) to pull live from public demo account
- [x] Add "Strategy launched Jul 1" annotation/reference line on equity curve chart in /demo

## WalletConnect Fix + Backfill + Live Stats + Chart Annotation
- [x] Fix WalletConnect: wagmi metadata URL to use dynamic window.location.origin
- [x] Remove duplicate WalletConnectModal from Dashboard.tsx, consolidate to WalletPanel
- [x] Enable copytradeEnabled=true on wallet connect (signal feed is live)
- [x] Backfill all 12 registered-user demo accounts from Jul 1 (reset cursor, re-sync 41 signals each)
- [x] Fix startingCapital to $10,000 for all registered-user accounts
- [x] Add getPublicDemoStats procedure to demo router
- [x] Update homepage ProofBar to use live getPublicDemoStats (July Return, Avg Signal, Best Signal, Tier A count)
- [x] Update hero stats (July Return, Best Signal) to use live demoStats
- [x] Add "Strategy launched Jul 1" ReferenceLine annotation on equity curve chart

## Coinlegs Removal + TradingView + Hyperliquid Autotrading
- [ ] Audit and remove all "Coinlegs" text from frontend (UI labels, tooltips, disclaimers, comments)
- [ ] Audit and remove all "Coinlegs" text from backend (db.ts, routers.ts, schema comments)
- [ ] Replace with neutral branding: "Quantitative Signal Engine", "@navi Signals", "Proprietary Signals"
- [ ] Add TradingView lightweight-charts widget to trade cards in /demo (symbol chart per trade)
- [ ] Add TradingView Advanced Chart widget embed to the /demo equity curve section
- [ ] Wire Hyperliquid auto-trading: on new Tier A signal, place order for all copytradeEnabled wallet sessions
- [ ] Add Hyperliquid order placement helper in server/db.ts (sign + submit order via Hyperliquid API)
- [ ] Add trade execution log table to DB (walletAddress, signalId, orderId, status, executedAt)
- [ ] Show execution status in WalletPanel (last executed trade, order ID, status)
- [ ] Write vitest tests for Hyperliquid order placement helper
