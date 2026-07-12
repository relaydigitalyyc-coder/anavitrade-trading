# Codex Next Prompt

Use this repository as the base. Extend it only after all tests pass.

Immediate next upgrades:

1. Add true SMT divergence across correlated symbols.
2. Add a proper synthetic currency index per currency using all loaded pairs.
3. Add walk-forward validation splits.
4. Add parameter sweeps with fixed train/test periods.
5. Add market-regime stratification: trend, chop, expansion, compression.
6. Add a pure report-only HTML dashboard for matrix visualization.
7. Keep live trading out of scope unless a separate, reviewed execution module is explicitly created.

Constraints:

- No recursive file scanning.
- No API keys.
- No broker login.
- All tests must pass before producing output.
- Entry logic must not use future candles.
- Same-candle ambiguity remains stop-first.
