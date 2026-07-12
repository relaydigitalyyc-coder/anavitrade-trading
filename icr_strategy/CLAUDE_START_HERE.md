# Claude Start Here

This repo is the full handoff package for the ICR/HTF coiling-pump quant algo.

Read these first, in order:
1. `docs/HANDOFF_REALITY_CHECK.md`
2. `docs/CLAUDE_MASTER_PROMPT.md`
3. `docs/ALGO_BLUEPRINT_FULL.md`
4. `docs/RUNBOOK_FOR_REAL_DATA.md`
5. `docs/FILE_MAP_FOR_CLAUDE.md`
6. `docs/IMPLEMENTATION_GAPS_FOR_CLAUDE.md`

Then run:
```bash
pip install -r requirements.txt
pytest -q
python -m icr.main --generate-sample --output outputs_smoke --real-edge-report --no-audit
```

Do not claim edge until real Binance/Coinlegs data passes `real_edge/edge_decision.json`.
