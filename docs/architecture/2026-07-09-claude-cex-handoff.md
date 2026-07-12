# Claude Handoff: CEX Flow Must Share These Contracts

Last updated: 2026-07-09

## Boundary

Codex is building the Aster DEX flow. Claude is expected to build the CEX flow separately.

Do not let DEX and CEX become separate products internally. Both flows must use the same lifecycle:

```text
TradeIntent -> RiskDecision -> ExecutionJob -> ExecutionReceipt -> OrderEvent -> NavSnapshot -> FeeAccrual
```

## Shared Truth

The strategy engine should emit a provider-neutral `TradeIntent`:

- symbol
- side
- order type
- target notional or sizing hint
- target leverage
- optional limit/SL/TP
- source and external signal id

The risk engine owns whether a user gets an order:

- copytrade enabled
- account active
- kill switch off
- max leverage
- max position size
- max daily loss
- available equity
- unpaid fee restrictions

The execution adapter only executes an already-approved job. It must not invent risk policy.

## Minimal Adapter Contract

```ts
type ExecutionAdapter = {
  submitOrder(jobId: number, request: unknown): Promise<ExecutionReceipt>;
  cancelOrder(orderId: string): Promise<ExecutionReceipt>;
};
```

For DEX, `request` is Aster order payload plus Builder metadata.

For CEX, `request` should map to the exchange API order payload.

Both paths must persist:

- job id
- provider
- user id
- idempotency key
- submitted order id
- status
- raw provider event payloads

## Fee Model

Fees are not provider-specific:

- 2% annual management fee on capital, accrued daily.
- 20% performance fee on net new profits above high-water mark.

Use shared `nav_snapshots`, `fee_periods`, and `fee_payments`.

Do not implement 2-and-20 as CEX trade commissions or Aster builder fees. Those are execution-layer fees. The Anavitrade platform fee is a separate ledger.

## Aster-Specific Notes For Claude

DEX flow is Aster-only:

- no Hyperliquid naming in new UX or new schema,
- no Binance execution path for the DEX surface,
- Aster Builder address is the execution attribution/commission address,
- Aster Agent signer is user-specific and backend-held,
- Agent should be perps-only and withdrawal-disabled.

If CEX support needs API keys, keep the key-custody model separate from Aster Agent signer custody. Do not reuse `aster_agent_accounts`.

## Current Files To Coordinate With

- `docs/architecture/2026-07-09-aster-dex-flow.md`
- `src/drizzle/schema.ts`
- `src/server/aster/*`
- `src/server/routers.ts` exposes `aster`

Any CEX work should add its own execution adapter while reusing `trade_intents`, `execution_jobs`, `order_events`, `nav_snapshots`, `fee_periods`, and `fee_payments`.
