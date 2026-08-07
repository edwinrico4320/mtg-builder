# MTG Builder Architecture — v8.7.1

The builder is a browser-only workbench. It separates data collection from presentation so output profiles can evolve without rebuilding the card data pipeline.

```text
MTGJSON / rules / price snapshots
        ↓
normalized card data
        ↓
image cache + price layer
        ↓
output profiles
        ↓
self-contained HTML
```

## Micro Catalog

The Micro Catalog Preview is presentation-only. `micro-catalog-preview.js` consumes the active Output Designer profile and representative cards. It does not fetch set JSON, download images, or modify price data.
