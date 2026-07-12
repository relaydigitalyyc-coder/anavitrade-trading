# File Map for Claude

## Core strategy
- `icr/signals.py`: base ICR signal generation and confluence score.
- `icr/structure.py`: impulse, pullback, compression primitives.
- `icr/indicators.py`: MA, ATR, RSI, Bollinger-style helpers.
- `icr/backtester.py`: trade simulation.
- `icr/risk.py`: position sizing, R logic.

## Intelligence layers
- `icr/ict.py`: FVG, OB, OTE, liquidity-sweep style confluence.
- `icr/divergence.py`: RSI and exhaustion tags.
- `icr/mtf.py`: higher-timeframe confluence.
- `icr/coiling_pump.py`: HTF coil score and pump event study.
- `icr/coinlegs.py`: Coinlegs snapshot/scrape utilities.
- `icr/coinlegs_fusion.py`: derivatives snapshot score/boost.
- `icr/meta_labeling.py`: feature labels.
- `icr/matrix.py`: scanner-style latest matrix output.

## Real-data and audit
- `icr/binance_data.py`: Binance public archive downloader.
- `icr/audit.py`: 200 litmus tests, ablations, stress, walk-forward.
- `icr/real_edge.py`: edge decision, traps, thresholds, ablation summary.
- `icr/main.py`: CLI entrypoint.

## Docs
- `docs/LITMUS_TESTS_200.md`: 200 acceptance checks.
- `docs/QUANT_AUDIT_200.csv`: audit framework data.
- `docs/REAL_EDGE_RUNBOOK.md`: original real-edge runbook.
- `docs/CLAUDE_MASTER_PROMPT.md`: handoff prompt.
- `docs/HANDOFF_REALITY_CHECK.md`: honesty file.
- `docs/ALGO_BLUEPRINT_FULL.md`: strategy blueprint.
- `docs/RUNBOOK_FOR_REAL_DATA.md`: commands.
- `docs/IMPLEMENTATION_GAPS_FOR_CLAUDE.md`: what to improve next.
