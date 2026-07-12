# Anavitrade Platform — Product Requirements Document

**Version:** 1.0  
**Date:** July 2026  
**Status:** Draft  
**Owner:** Anavitrade Product Team

---

## 1. Executive Summary

Anavitrade is an autonomous quantitative trading platform that mirrors algorithmic trade signals onto client-controlled exchange accounts via secure API wallets. The current platform delivers a marketing landing page, a demo account creation flow, and a dashboard scaffold. This PRD defines the required improvements to evolve Anavitrade from a marketing shell into a fully operational, trust-worthy, and revenue-generating product.

The improvements are organized into six product areas: **Backend Trade Signal Integration**, **User Account & Authentication**, **Live Dashboard & Portfolio Intelligence**, **Ledger Nano & Hyperliquid Onboarding**, **Marketing & Conversion**, and **Trust, Legal & Risk Infrastructure**.

---

## 2. Current State

| Area | Status |
| --- | --- |
| Landing page (all sections) | Complete |
| Anavitrade branding and @ logo | Complete |
| iPhone mockup hero widget | Complete |
| Demo account creation (DB-backed) | Complete |
| Demo dashboard (mock data, chart, trade table) | Complete |
| Ledger Nano section on landing page | Complete |
| Backend trade signal wiring | Not started |
| Real user authentication (OAuth / email) | Partial (Manus OAuth only) |
| Live portfolio data from exchange | Not started |
| Hyperliquid API wallet onboarding flow | Not started |
| Pricing and subscription management | Not started |
| Risk disclosure and legal pages | Not started |
| Email notifications | Not started |
| Admin panel | Not started |

---

## 3. Goals and Success Metrics

The primary goal of this release cycle is to move from a demo-only product to a live-trading-capable platform with at least one paying client cohort.

| Goal | Metric | Target |
| --- | --- | --- |
| Activate live trade mirroring | Trades mirrored per day | ≥ 1 per active client |
| Grow demo-to-live conversion | % of demo accounts that connect exchange | ≥ 15% within 30 days |
| Establish trust infrastructure | Risk disclosure page live, legal reviewed | Before first live client |
| Reduce onboarding drop-off | Completion rate of Hyperliquid + API wallet setup | ≥ 60% |
| Enable subscription revenue | Stripe integration live | Before live trading launch |

---

## 4. Product Areas and Requirements

---

### 4.1 Backend Trade Signal Integration

**Priority:** P0 — Blocker for live product

**Context:** The demo dashboard currently renders mock trade data and a simulated portfolio curve. The backend procedures `demo.getTrades` and `demo.getPortfolioSeries` return empty arrays, with the frontend falling back to static placeholders. This must be replaced with a real signal pipeline.

**Requirements:**

**REQ-001 — Trade Signal Ingestion**  
The system must expose a secure internal API endpoint that accepts trade signal payloads from the Anavitrade execution engine. Each payload must include: asset pair, direction (long/short), entry price, take-profit price, stop-loss price, risk percentage, and timestamp. The endpoint must be authenticated with a server-to-server secret key and must never be exposed to the public internet without authentication.

**REQ-002 — Portfolio Snapshot Storage**  
On each trade open and close event, the system must record a portfolio snapshot for each active client account. Snapshots must include: timestamp (UTC), total portfolio value in USD, unrealised PnL, realised PnL for the period, and number of open positions. These snapshots power the capital growth chart on the dashboard.

**REQ-003 — Trade History Persistence**  
All executed trades (open and closed) must be persisted per client account in the `demo_trades` table (or a new `live_trades` table for production accounts). Each record must store: asset, direction, entry price, exit price (nullable), quantity, status (open/closed/cancelled), PnL (nullable until closed), opened_at, and closed_at (nullable).

**REQ-004 — Real-Time Dashboard Data**  
The `demo.getTrades` and `demo.getPortfolioSeries` tRPC procedures must be updated to query the database for real records. The frontend dashboard must poll or subscribe to these endpoints and reflect live data without requiring a page refresh. A 30-second polling interval is acceptable for the initial release; WebSocket streaming is a future enhancement.

**REQ-005 — Proportional Risk Calculation**  
The signal mirroring engine must apply percentage-based risk conversion, not 1:1 notional copying. The formula is: `client_size = client_equity × signal_risk_percent`. The system must cap maximum position size at a configurable per-client limit and must not copy leverage blindly — it must copy the actual risk, invalidation distance, and margin impact.

---

### 4.2 User Account and Authentication

**Priority:** P0 — Required before live trading

**Context:** The current authentication relies on Manus OAuth, which is suitable for internal development but not for public client onboarding. Clients need a standard email/password or social login flow, and demo accounts need to be upgradeable to live accounts.

**Requirements:**

**REQ-006 — Email and Password Registration**  
Users must be able to register with an email address and password. Passwords must be hashed with bcrypt (minimum 12 rounds). Email verification must be required before account activation. A "Forgot Password" flow with a time-limited reset token must be implemented.

**REQ-007 — Demo-to-Live Account Upgrade**  
A demo account must be upgradeable to a live account. The upgrade flow must prompt the user to: (1) verify their email, (2) complete the Hyperliquid API wallet connection, and (3) select a subscription plan. The demo account's trade history and starting capital selection must be preserved as a reference record.

**REQ-008 — Session Management**  
Sessions must expire after 30 days of inactivity. Users must be able to view and revoke active sessions from their account settings page. JWT tokens must be rotated on each login.

**REQ-009 — Account Settings Page**  
Users must have access to an account settings page with the following sections: Profile (name, email), Security (change password, active sessions), Exchange Connection (API wallet status, revoke access), Notifications (email preferences), and Danger Zone (delete account).

---

### 4.3 Live Dashboard and Portfolio Intelligence

**Priority:** P1 — Core product experience

**Context:** The demo dashboard has the correct structural layout but renders placeholder data. It must be wired to real data and extended with the analytics features that differentiate Anavitrade as a serious quantitative platform.

**Requirements:**

**REQ-010 — Capital Growth Chart**  
The portfolio balance chart must render real portfolio snapshots from the database. It must support time range selectors (1D, 1W, 1M, 3M, 1Y, All) and must display the percentage return for the selected period alongside the chart. The chart must use a smooth area curve with the green accent color and a subtle gradient fill.

**REQ-011 — Trade History Table**  
The trade history table must display all open and closed trades with the following columns: Asset, Direction (Long/Short badge), Entry Price, Exit Price, Quantity, PnL (green for positive, red for negative), Status, and Opened/Closed timestamps. The table must support filtering by status (Open / Closed / All) and sorting by date and PnL.

**REQ-012 — Key Performance Metrics**  
The dashboard header must display four key metrics: Total Return (%), Win Rate (%), Total Trades, and Current Open Positions. These must be calculated from the trade history and updated on each data refresh.

**REQ-013 — Risk Controls Display**  
The dashboard must show the client's current risk configuration: max daily loss limit, max leverage, max position size, and whether the emergency kill switch is active. These settings must be editable from the dashboard with a confirmation dialog.

**REQ-014 — Emergency Kill Switch**  
A prominently placed kill switch button must be available on the dashboard. When activated, it must immediately halt all new trade executions for the client's account and send a confirmation email. The kill switch state must be persisted in the database and checked by the signal mirroring engine before placing any order.

---

### 4.4 Ledger Nano and Hyperliquid Onboarding

**Priority:** P1 — Required for the Ledger user segment

**Context:** The landing page now has a Ledger Nano section explaining the custody architecture. The onboarding flow for Ledger users connecting to Hyperliquid via an API wallet does not yet exist as a guided product experience.

**Requirements:**

**REQ-015 — Guided Hyperliquid API Wallet Setup**  
A step-by-step onboarding wizard must guide the user through: (1) creating a Hyperliquid account, (2) depositing USDC, (3) generating a dedicated API wallet, (4) approving the API wallet from their Ledger-controlled account, and (5) entering the API wallet credentials into Anavitrade. Each step must include screenshots or video guidance and a clear "I've completed this step" confirmation.

**REQ-016 — API Wallet Validation**  
After the user enters their API wallet credentials, the system must perform a read-only validation call to Hyperliquid to confirm the wallet is active, has trade-only permissions (no withdrawal access), and is correctly linked to the client's account. The result must be displayed to the user before they proceed.

**REQ-017 — API Wallet Status on Dashboard**  
The dashboard must display the current status of the connected API wallet: Active, Revoked, or Error. If the wallet is revoked or returns an error, the dashboard must display a prominent alert with a link to reconnect.

**REQ-018 — Revocation Instructions**  
The account settings page must include a dedicated section explaining how to revoke the API wallet from Hyperliquid directly, with step-by-step instructions and a direct link to the Hyperliquid account management page.

**REQ-019 — Ledger Navbar Link**  
The "Product" dropdown in the navigation bar must include a "Ledger Integration" link that anchors to the `#ledger` section on the landing page.

---

### 4.5 Marketing and Conversion

**Priority:** P1 — Required to drive demo-to-live conversion

**Context:** The landing page is visually complete but lacks conversion mechanics: a pricing section, email capture, and post-signup nurture flow.

**Requirements:**

**REQ-020 — Pricing Section**  
A pricing section must be added to the landing page between "How It Works" and "Testimonials." It must display at least two tiers (e.g., Starter and Pro) with clear feature differentiation, a monthly/annual billing toggle, and a prominent CTA for each tier. Pricing must be confirmed by the product owner before implementation.

**REQ-021 — Stripe Subscription Integration**  
Stripe must be integrated for subscription billing. The checkout flow must support monthly and annual billing cycles. Subscription status must be stored in the database and checked before activating live trade mirroring for a client account. Failed payments must trigger an email notification and a grace period before suspending the account.

**REQ-022 — Email Onboarding Sequence**  
On demo account creation, the system must send a welcome email containing: the user's dashboard link, a brief explanation of the demo experience, and a CTA to upgrade to a live account. A follow-up email must be sent 3 days after signup if the user has not upgraded.

**REQ-023 — Testimonials Autoplay**  
The testimonials carousel must autoplay with a 5-second interval and pause on hover. Navigation arrows must be added alongside the dot indicators for accessibility.

**REQ-024 — Hyperliquid in Exchange Logo Bar**  
Hyperliquid must be added to the exchange logo bar on the landing page, given its central role in the Ledger integration architecture.

---

### 4.6 Trust, Legal, and Risk Infrastructure

**Priority:** P0 — Required before any live client funds are involved

**Context:** Anavitrade operates in a regulated-adjacent space. Before any client connects real funds, the platform must have clear legal documentation, risk disclosures, and operational safeguards in place.

**Requirements:**

**REQ-025 — Risk Disclosure Page**  
A dedicated `/risk-disclosure` page must be created and linked from the footer. It must cover: the speculative nature of cryptocurrency trading, the risk of total capital loss, the fact that past algorithmic performance does not guarantee future results, the limitations of automated systems during extreme market events, and the client's responsibility for their own API wallet and account security.

**REQ-026 — Terms of Service Page**  
A `/terms` page must be created covering: the scope of the service (trade execution only, no fund custody), the client's obligations (accurate API key setup, maintaining sufficient account balance), prohibited uses, limitation of liability, and dispute resolution. Legal review is required before publishing.

**REQ-027 — Privacy Policy Page**  
A `/privacy` page must be created covering: what data is collected (email, trade history, portfolio snapshots), how it is stored and encrypted, third-party processors (Stripe, Hyperliquid), data retention periods, and the client's right to request deletion.

**REQ-028 — Safe Operating Rules Enforcement**  
The trade mirroring engine must enforce the following hard limits per client account, configurable within defined bounds: maximum daily loss limit (default 5% of account equity), maximum leverage (default 10x), maximum single position size (default 10% of account equity), no martingale or averaging-down logic unless explicitly agreed in writing, and an emergency kill switch accessible from the dashboard.

**REQ-029 — Audit Log**  
Every trade execution, API wallet connection/revocation, kill switch activation, and settings change must be written to an immutable audit log per client account. The audit log must be viewable by the client from their account settings page and by admins from the admin panel.

**REQ-030 — Admin Panel**  
An admin panel (accessible only to users with `role = admin`) must be built with the following views: All Accounts (list of demo and live accounts with status), Trade Log (all trades across all accounts), Signal Feed (incoming trade signals from the execution engine), and System Health (API wallet validation status per client, kill switch states).

---

## 5. Non-Functional Requirements

**Performance:** The dashboard must load within 2 seconds on a standard broadband connection. Trade history queries must return within 500ms for accounts with up to 10,000 trade records.

**Security:** All API wallet credentials must be encrypted at rest using AES-256. No client seed phrases or private keys must ever be requested, stored, or transmitted. All server-to-server communication must use HTTPS with certificate validation. Rate limiting must be applied to all public-facing API endpoints.

**Availability:** The trade mirroring engine must target 99.9% uptime. Planned maintenance windows must be communicated to clients at least 24 hours in advance.

**Scalability:** The architecture must support at least 500 concurrent active client accounts without degradation in trade execution latency.

**Accessibility:** All new pages and components must meet WCAG 2.1 AA standards, including keyboard navigation, visible focus rings, and sufficient color contrast ratios.

---

## 6. Out of Scope (This Release)

The following items are explicitly deferred to a future release cycle:

- Mobile native app (iOS / Android)
- WebSocket real-time trade streaming (polling is acceptable for v1)
- Multi-exchange simultaneous mirroring (single exchange per client for v1)
- Social trading features (public leaderboards, copy-other-users)
- Hyperliquid vault architecture (fund-style pooled accounts)
- Builder code fee mechanism
- White-label or API reseller offering

---

## 7. Implementation Priority Order

| Phase | Items | Rationale |
| --- | --- | --- |
| Phase 1 — Trust Foundation | REQ-025, REQ-026, REQ-027, REQ-028 | No live funds without legal and risk safeguards |
| Phase 2 — Auth and Accounts | REQ-006, REQ-007, REQ-008, REQ-009 | Required before any real user onboarding |
| Phase 3 — Signal Pipeline | REQ-001, REQ-002, REQ-003, REQ-004, REQ-005 | Core product functionality |
| Phase 4 — Live Dashboard | REQ-010, REQ-011, REQ-012, REQ-013, REQ-014 | Client retention and trust |
| Phase 5 — Ledger Onboarding | REQ-015, REQ-016, REQ-017, REQ-018, REQ-019 | Ledger user segment activation |
| Phase 6 — Monetization | REQ-020, REQ-021, REQ-022 | Revenue generation |
| Phase 7 — Admin and Audit | REQ-029, REQ-030 | Operational oversight |
| Phase 8 — Polish | REQ-023, REQ-024 | Conversion optimization |

---

## 8. Open Questions

The following decisions are required from the product owner before implementation begins:

1. **Pricing:** What are the subscription tier names, feature sets, and price points?
2. **Execution engine:** What is the architecture of the trade signal source — is it a separate service, a cron job, or a third-party signal provider?
3. **Hyperliquid API wallet:** Will Anavitrade store the client's API wallet private key server-side (encrypted), or will the client run a local agent that holds the key?
4. **Legal jurisdiction:** Which jurisdiction governs the Terms of Service, and has a lawyer reviewed the risk disclosure language?
5. **Kill switch scope:** When the kill switch is activated, should open positions be closed immediately, or should they be left open until they hit their take-profit or stop-loss?

---

*This document should be reviewed and signed off by the product owner before any Phase 1 work begins.*
