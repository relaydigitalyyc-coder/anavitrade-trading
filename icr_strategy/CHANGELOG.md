# Changelog

## v7 Real Edge

- Added real-edge research harness.
- Added HTF coil gate into the actual ICR signal path.
- Added causal candle-level coil score annotation.
- Added requested four-combo ablation report: base ICR, ICR+HTF coil, ICR+Coinlegs, ICR+HTF coil+Coinlegs.
- Added yearly walk-forward report.
- Added false-positive trap report.
- Added best-threshold sweep report.
- Added edge_decision.json with explicit deploy/no-deploy decision.
- Added optional Playwright Coinlegs renderer with `requirements-browser.txt`.
- Fixed 200-litmus audit timeout by separating fast/bounded audit from real combo ablations.
- Preserved no-live-trading, no-API-key, no-login-bypass, and non-recursive file loading constraints.
