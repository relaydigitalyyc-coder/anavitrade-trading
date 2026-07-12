# CLAUDE.md

## Project

Standalone Anavitrade trading platform reconstructed from a Manus export.

Important: this project is separate from `/home/ariel/anavi-project/anavi`. Do not merge changes into the ANAVI core repo unless explicitly asked.

## Commands

```bash
pnpm install
pnpm check
pnpm build
pnpm dev
pnpm smoke:wallet
```

Local dev runs on:

```text
http://localhost:5174/
```

## Environment

WalletConnect/Reown project ID is configured in `.env`:

```text
VITE_WALLETCONNECT_PROJECT_ID=05dcea0e853d0ee47e980c540ec55494
```

If this value changes, restart Vite because `import.meta.env` is read at startup.

## Architecture Notes

- Aster DEX foundation is the active onchain execution path. Read `docs/architecture/2026-07-09-aster-dex-flow.md` before changing execution/onboarding.
- Claude CEX work must share `TradeIntent -> ExecutionJob -> OrderEvent -> NavSnapshot -> FeeAccrual`; read `docs/architecture/2026-07-09-claude-cex-handoff.md`.

- `src/lib/wagmi.ts` owns Wagmi chains, connectors, and WalletConnect metadata.
- `src/components/WalletConnectModal.tsx` owns the wallet modal flow:
  - Ledger direct USB/Bluetooth via `@ledgerhq/connect-kit-loader`
  - Ledger QR fallback through WalletConnect
  - WalletConnect mobile QR
  - MetaMask
  - Coinbase Wallet
- `src/lib/trpc.ts` is a local compatibility shim replacing the missing Manus backend.
- Coinlegs data comes from the live Cloudflare Worker:
  `https://coinlegs-worker.erhazeariel.workers.dev/latest`
- TradingView mini widgets live in `src/components/TradingViewMiniWidgets.tsx`.

## Verification Status

Last verified on 2026-07-07:

```bash
pnpm check
pnpm build
pnpm smoke:wallet
```

The smoke test verifies the dashboard wallet button, the WalletConnect/Reown popup, and Ledger Nano USB / WalletConnect QR choices. The build may warn about large Wagmi/WalletConnect chunks. That is expected for now.

## Production Hardening — Pre-Mainnet

- **Static egress IP**: Cloudflare Workers share egress IPs, so exchange API-key IP whitelisting is
  impractical from the Worker itself. Before live funds, route order signing/submission through a
  dedicated execution service with a static egress address.
- **Encryption key**: `ENCRYPTION_KEY` is the Worker secret used as the AES-256 key for
  `encryptKey`/`decryptKey` (falls back to `JWT_SECRET` in dev). In production, set it via
  `npx wrangler secret put ENCRYPTION_KEY` — the JWT session secret and the data-at-rest key
  must NOT be the same value.
- **Per-connection kill switch**: Set via `cex.toggleKillSwitch` or manually in D1
  (`cex_connections.killSwitchActive`). The risk engine (`decideExecution()`) denies any job
  when active. Global kill: `exec.setGlobalKill`.
- **Dispatch is auto-wired**: `runCoinlegsScraper()` now emits a `TradeIntent` for every new
  Tier A/B buy signal and fans it to all active CEX connections. Idempotency is per (user, intent).
- **Order mutex**: `execution/dispatch.ts` serializes order submission per `cexConnectionId` so a
  signer never has two in-flight orders. `ExecutionJob.idempotencyKey` prevents duplicate mirrors.

## Guardrails

- Keep this project standalone.
- Do not delete `_manus`; it is the original source export reference.
- Use `apply_patch` for manual edits.
- Preserve the current dark trading UI unless a redesign is explicitly requested.

## Codex + Claude Multi-Agent Orchestration

The OpenAI Codex plugin (`codex@openai-codex`) is installed and enabled. Use it proactively for:

| Capability | Command | When |
|---|---|---|
| **Single review** | `/codex:review` | Quick review of current changes |
| **Adversarial review** | `/codex:adversarial-review` | Challenge design/approach before shipping |
| **Delegation** | `/codex:rescue` | Codex investigates/fixes something independently |
| **Multi-lens review** | `/codex:swarm review` | Parallel security + correctness + perf + adversarial review |
| **Task decomposition** | `/codex:swarm task --decompose` | Split complex work across N Codex workers |
| **Full orchestration** | `/codex:orchestrate` | Auto-detect optimal pattern across Codex + Claude agents |
| **Synthesize results** | `node "$CLAUDE_PLUGIN_ROOT/scripts/codex-synth.mjs" <job-id>` | Cross-lens dedup and priority ranking |

### Orchestration Decision Rules

- **Small changes (<5 files)**: Single `/codex:review` or nothing needed
- **Medium changes (5-15 files)**: Use `/codex:swarm review` for multi-lens coverage
- **Large features**: Use `/codex:orchestrate` which auto-decomposes across Codex + Claude agents
- **Bug investigation**: `/codex:rescue --background` + parallel Claude subagent exploration
- **Security audit**: `/codex:swarm review --lenses security,adversarial` + Claude `security-reviewer` agent
- **Codex handles**: Code review, debugging, research, straightforward implementation
- **Claude agents handle**: Architecture, security analysis, test design, synthesis

Always decompose large work across both systems. Run independent work in parallel. Synthesize at the end.
