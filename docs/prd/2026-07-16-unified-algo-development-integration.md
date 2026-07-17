# PRD — Unified Algo: Development & Integration Path

**Date:** 2026-07-16
**Status:** Draft for review
**Owner:** Ariel
**Scope:** How the trading algorithm should be developed to production using every validated asset the system has accumulated — ML models, corpus-derived rules, empirical exit findings, signal engines, and the Worker/VPS execution infrastructure.

---

## 1. Problem Statement

The platform has built an enormous amount of raw capability, but it is fragmented across
three partially-overlapping strategy generations that were never unified:

1. **Rule-based ICR / ICT Sniper** — empirically calibrated, corpus-validated
   (694 trades, 68% WR, Sharpe 7.00 on corpus), but proven NOT to generalize to raw OHLCV.
2. **ML pipeline (meta-v7 → meta-v22)** — 22 model iterations, most of which failed
   honest chronological validation. **meta-v22-definitive is the first to meet the goal**
   (65% test WR, PF 3.14, maxDD 8%, threshold 0.52) but on only **40 test trades**.
3. **Live signal engines** — `unified-engine.ts` (8 sources, dual-regime),
   `inference-router.ts` (30-feature tRPC scorer), and the Coinlegs scraper that already
   auto-dispatches TradeIntents to execution.

Meanwhile, the execution rail (Worker risk engine → VPS static-IP executor) is deployed
and hardened, but the *decision layer* feeding it is still the raw Coinlegs Tier A/B
signal with no ML gate in the live path.

**The product to build is not a new model. It is the integration**: one decision pipeline
that combines the validated pieces, rejects the invalidated ones, and closes the
outcome-feedback loop.

## 2. Goals

| # | Goal | Metric | Target |
|---|------|--------|--------|
| G1 | Statistically validate meta-v22 | Chronological test trades at threshold 0.52 | ≥ 200 trades, WR ≥ 55%, PF ≥ 2.0 |
| G2 | ML gate in the live dispatch path | % of dispatched TradeIntents scored by model | 100% |
| G3 | Shadow-trading evidence before live | Paper-trade window on testnet | ≥ 14 days, ≥ 50 closed trades |
| G4 | Closed feedback loop | Live outcomes persisted and joined to inference features | 100% of executed trades |
| G5 | Graduated capital exposure | Live rollout stages with automatic demotion | 4 stages (below) |

### Non-Goals

- New feature engineering or new model architectures (metacognitive 6-layer, structural
  rewards, divergence stack) until G1–G4 are done. These are built but unvalidated —
  they are **inventory, not roadmap**.
- Multi-exchange expansion (BitUniX/Bybit/OKX adapters) — after live validation on the
  primary venue.
- UI work beyond surfacing model scores on the dashboard.

## 3. Asset Inventory — What Has Been Fed In, and Its Verdict

This is the ground truth the PRD builds on. Each asset is classified **USE**,
**USE-WITH-GUARD**, or **DO-NOT-USE**.

### 3.1 Models

| Asset | Verdict | Rationale |
|-------|---------|-----------|
| `meta-v22-definitive` (21 MTF features, n=39,688, calibrated, t=0.52) | **USE-WITH-GUARD** | Only model to pass chronological test (65% WR, PF 3.14, max 1 consecutive loss) — but 40 trades. Must extend test window before live capital. |
| meta-v20-mtf-context | DO-NOT-USE for gating | 80% WR was on 10 trades; raw probs never reach its 0.82 threshold in production (max 0.77) — it silently never fires. |
| meta-v7…v19, v21 | DO-NOT-USE | All failed honest validation (overfit, broken calibration, lookahead, symbol-order splits). Keep as ablation record. |

### 3.2 Corpus & Data

| Asset | Verdict | Rationale |
|-------|---------|-----------|
| `scripts/backtest-prioritized.json` (1,265 trades) | **USE for pattern extraction ONLY** | Circular for validation (it IS Coinlegs history with outcomes). Never train or validate against it. |
| `training-data-mtf-v4-merged.json` (88k rows, 66 feat) | USE | Primary training corpus. |
| 15m kline window (~490 bars / 5 days) | USE-WITH-GUARD | Too short for walk-forward — extend via VPS fetch (G1 dependency). |
| `macro-context.json` (DXY/SPX/VIX/Gold) | Inventory | Unvalidated as features; revisit post-G4. |

### 3.3 Empirically Proven Rules (from `docs/analysis/EMPIRICAL_FINDINGS.md`)

These survive contact with data and MUST be encoded in the live path:

1. **Tier gate**: Tier A (≥80) is profitable (+0.21 avgR, 615 outcomes); Tier B is
   losing (−0.21 avgR). Live dispatch takes Tier A only; Tier B goes to paper.
2. **Alt-only universe**: Edge requires 2–4%+ 4h ATR. BTC/ETH/BNB are net negative —
   exclude majors from auto-dispatch.
3. **RSI entry filter**: reject long if RSI14 ≥ 70, short if RSI14 ≤ 30
   (+6.5% TotalR, Sharpe 3.47 → 3.79).
4. **The tail is sacred (exit engine)**: wide ratchet trail (5 ATR, arm at +4R),
   **no early breakeven, no partial scale-outs, no HTF-flip exits**. Every tested
   tail-capping mechanism destroyed returns (fib scale-outs: +274.8R → −117R).
5. **Direction/regime**: shorts +205R vs longs −85R in the bear window. A regime filter
   (MA200 slope / ATR trend) is required before longs get full size.

### 3.4 Infrastructure (deployed, working)

- Cloudflare Worker: signals, dashboard, risk engine (`decideExecution()`), D1, cron.
- Hetzner VPS 5.161.229.209: execution poller, static egress IP, testnet mode,
  Docker, 6h training cron.
- Dispatch already auto-wired: `runCoinlegsScraper()` → TradeIntent → all active CEX
  connections, with per-connection kill switch, global kill, per-signer order mutex,
  idempotency keys.
- CORTEX training supervisor (AUC-gated, silent no-op detection).
- `unified-engine.ts`, `inference-router.ts`, `ml_inferences` D1 table.

### 3.5 Standing Verification Gates (from the 2026-07-16 architecture post-mortem)

Every backtest/training run in this PRD is invalid unless it passes ALL of:

- [ ] ATR returns non-zero values (print range on one pair)
- [ ] Bar-by-bar forward scanning; no retroactive swing-confirmation exits
- [ ] Fixed %-risk sizing; no compounding on paper profits
- [ ] Time exits counted as losses at 0R, not dropped
- [ ] PF = gross profit / gross loss
- [ ] Train/test split by TIMESTAMP, never symbol order
- [ ] No feature uses post-entry data
- [ ] Corpus used only for pattern extraction

## 4. Product Requirements

### Phase 0 — Validation Hardening (blocks everything else)

**R0.1** Extend the kline dataset: fetch ≥ 120 days of 15m/1h/4h for the 50-pair alt
universe via the VPS (static IP + `BINANCE_API_KEY` bypasses the geo-block). Persist to
D1 and `scripts/data/`.

**R0.2** Re-run meta-v22 training + chronological walk-forward on the extended window
under CORTEX. Acceptance: ≥ 200 test trades at t=0.52 with WR ≥ 55% and PF ≥ 2.0.
If it fails, the model is demoted and Phase 1 ships **rules-only** (ICR gates §3.3)
with the ML score logged shadow-mode.

**R0.3** Port the calibrator into inference: `inference-router.ts` and `infer.py` must
apply the isotonic calibrator from the model directory (`calibrator.pkl`), not raw
LightGBM probabilities. Threshold constant lives in one place (model card), never
hardcoded in two runtimes.

**R0.4** Parity test: for 100 historical entries, the TypeScript 30-feature builder and
the Python training featurizer must produce vectors within 1e-6. A drift here silently
invalidates every live score.

### Phase 1 — One Decision Pipeline (integration core)

**R1.1** Single gate function. All dispatch flows through one decision layer
(extend `unified-engine.ts`), evaluated in order:

```
Coinlegs signal (or engine-native signal)
  → Universe gate      (alt-only, ATR% ≥ 2 on 4h; majors rejected)
  → Tier gate          (Tier A live; Tier B → paper book)
  → RSI extension gate (no chasing: L<70 / S>30)
  → Regime gate        (longs half-size unless bull regime)
  → ML gate            (calibrated meta-v22 score ≥ threshold from model card)
  → Risk engine        (existing decideExecution(): kill switches, limits)
  → TradeIntent → ExecutionJob → VPS
```

Every rejection is persisted with the failing gate name (D1 `ml_inferences` extended
with `gate_result`), so the funnel is auditable: signals in → rejects per gate → orders out.

**R1.2** Exit policy encoded server-side per §3.3.4: swing-pivot initial stop
(nearest swing low − 0.2 ATR), fixed TP removed in favor of the 5-ATR ratchet trail
armed at +4R. Explicit code-review checklist item: *no early-BE, no partials* — these
regress the tail and are banned by empirical finding, not preference.

**R1.3** Scoring is mandatory, not advisory: if the inference service is unreachable,
dispatch **fails closed** (no order), alerts, and logs — it does not fall back to
unscored dispatch.

### Phase 2 — Shadow & Paper Validation (testnet)

**R2.1** Run the full pipeline in `EXECUTION_MODE=testnet` for ≥ 14 days / ≥ 50 closed
trades. The paper book also records what Tier B and ML-rejected trades *would* have done
(counterfactual columns) — this is the cheapest source of gate-calibration data.

**R2.2** Daily automated report (Worker cron → D1 → dashboard): trades, WR, PF, avgR,
maxDD, per-gate rejection counts, model score distribution. Alert if score distribution
drifts (e.g., 95th percentile < threshold for 48h — the meta-v20 "never fires" failure
mode must be detected automatically this time).

**R2.3** Exit criteria to Phase 3: paper WR ≥ 50%, PF ≥ 1.8, maxDD ≤ 15%, zero
execution-integrity incidents (duplicate orders, mutex violations, unsigned dispatches).

### Phase 3 — Graduated Live Rollout

| Stage | Capital/trade | Promotion criterion | Demotion trigger (automatic) |
|-------|---------------|--------------------|------------------------------|
| L0 shadow | $0 (testnet) | R2.3 met | — |
| L1 | $25 risk | 20 trades, PF ≥ 1.5 | PF < 1.0 over trailing 20, or maxDD > 15% |
| L2 | $100 risk | 40 trades, PF ≥ 1.8 | same |
| L3 | Full risk-engine limits | 100 trades, PF ≥ 2.0 | same |

Demotion is enforced by the risk engine (extends existing kill-switch machinery), not by
a human noticing. Manual global kill remains available (`exec.setGlobalKill`).

### Phase 4 — Closed Feedback Loop & Continuous Training

**R4.1** Every executed trade's OrderEvents are joined back to its inference row
(feature vector + score + gates) in D1. This is the future training set that finally
escapes the Coinlegs-corpus circularity — outcomes from OUR pipeline on OUR entries.

**R4.2** VPS 6h training cron retrains on the growing live+historical set under CORTEX.
Promotion of a new model version requires: passes §3.5 gates, beats the incumbent on the
held-out chronological window, AND ≥ 7 days of shadow scoring alongside the incumbent
without material divergence. Model artifacts are versioned; rollback is a pointer change.

**R4.3** Only after the loop runs: revisit the unvalidated inventory (metacognitive
stack, divergence, volume profile, macro features, live-only OI/funding conviction) as
individually A/B-tested additions — one at a time, each through Phases 0-gate → 2 → 3.

## 5. Success Metrics (product-level)

- **Primary:** Live PF ≥ 2.0 and maxDD ≤ 15% over the first 100 live trades at L2+.
- **Integrity:** 0 unscored live dispatches; 0 duplicate orders; 100% of trades joined
  to inference rows.
- **Learning velocity:** ≥ 1 CORTEX-approved model promotion within 60 days of Phase 4
  start, driven by live-outcome data.

## 6. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| meta-v22's 40-trade result doesn't hold at n=200 | High | Phase 0 gate; rules-only fallback path is pre-approved (§R0.2) |
| Feature drift between TS and Python featurizers | High | R0.4 parity test in CI; single source of truth for feature order (`feature_names.json`) |
| Bear-market shorts edge inverts in bull regime | Medium | Regime gate half-sizes longs; per-direction PF tracked in R2.2 report |
| "Model never fires" (meta-v20 repeat) | Medium | Score-distribution drift alert (R2.2) |
| Session-level overclaiming (see §2 of arch doc) | Medium | §3.5 checklist is mandatory in every training PR; CORTEX blocks silent no-ops |
| Exchange/IP issues | Low | VPS static IP whitelisted per onboarding flow; fail-closed dispatch |

## 7. Milestones

| Milestone | Deliverable | Depends on |
|-----------|------------|------------|
| M1 (wk 1) | Extended klines + meta-v22 re-validation verdict | VPS Binance key |
| M2 (wk 2) | Unified gate function live in Worker, calibrated inference, parity test green | M1 |
| M3 (wk 2–4) | 14-day testnet shadow run + daily reports | M2 |
| M4 (wk 5+) | L1 live rollout | M3 exit criteria |
| M5 (wk 8+) | Feedback loop training promotion #1 | M4, 100+ joined outcomes |

## 8. Open Questions

1. Threshold policy: fixed 0.52 from the model card vs. percentile-based (top-N% of
   daily scores) to keep trade frequency stable as the score distribution drifts?
2. Should Tier B paper outcomes ever be allowed to promote Tier B to live, or is the
   corpus verdict (−0.21 avgR) permanent?
3. Regime filter implementation: MA200 slope on BTC 1d as global regime, or per-pair?
   (Corpus suggests per-pair ATR matters more than global regime for the universe gate.)
4. Redis order-mutex (planned) vs. current in-process mutex — required before L2 or L3?

## 9. Reference Documents

- `docs/architecture/2026-07-16-ml-pipeline-architecture.md` — honest post-mortem; §2 lists invalidated claims, §9 is the verification checklist adopted here
- `docs/analysis/EMPIRICAL_FINDINGS.md` — exit engine, RSI filter, tier/universe evidence
- `scripts/data/models/meta-v22-definitive/model_card.json` — current champion model
- `docs/architecture/2026-07-09-claude-cex-handoff.md` — TradeIntent → ExecutionJob contract
- `docs/ops/SYSTEM_OPERATIONS.md` — operational runbook
- `CLAUDE.md` §Phase 1 ML Unification — known issues this PRD resolves (R0.1–R0.4)
