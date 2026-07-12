# Test Fixtures

Fixtures in this directory are generated from the Python ICR strategy to
provide deterministic test data for the TypeScript indicators module.

## Source

The canonical Python implementation lives at:

```
/home/ariel/anavitrade-trading/icr_strategy/icr/indicators.py
```

## Regeneration

To regenerate fixtures, run the Python strategy with a fixed seed and export
the `add_indicators` output as JSON:

```bash
cd /home/ariel/anavitrade-trading
python -c "
import json, numpy as np, pandas as pd
from icr_strategy.icr.indicators import add_indicators
from icr_strategy.icr.config import StrategyConfig

np.random.seed(42)
n = 200
df = pd.DataFrame({
    'open': np.cumsum(np.random.randn(n) * 0.5) + 100,
    'high': np.cumsum(np.random.randn(n) * 0.5) + 102,
    'low': np.cumsum(np.random.randn(n) * 0.5) + 98,
    'close': np.cumsum(np.random.randn(n) * 0.5) + 100,
    'volume': np.abs(np.random.randn(n) * 1000 + 5000),
})
df['high'] = df[['open', 'close', 'high']].max(axis=1)
df['low'] = df[['open', 'close', 'low']].min(axis=1)

cfg = StrategyConfig()
enriched = add_indicators(df, cfg)
# Drop NaN rows and keep first 100 clean rows
clean = enriched.dropna().head(100).reset_index(drop=True)
print(clean.to_json(orient='records', date_format='iso'))
" > src/server/analysis/__tests__/fixtures/expected.json
```

## Format

Each fixture file is a JSON file containing an array of record objects.
