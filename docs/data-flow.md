# Data Flow — v8.7.1

1. Set discovery populates `data/set-index.json`.
2. Workspace state is restored from `data/workspace.json`.
3. Card JSON is normalized by catalog modules.
4. Images resolve through the shared/packed cache.
5. Prices resolve through the price snapshot layer.
6. Output Designer controls presentation.
7. Catalog profiles generate self-contained HTML.
8. Micro Catalog Preview uses representative normalized cards to tune density before a real print build.
