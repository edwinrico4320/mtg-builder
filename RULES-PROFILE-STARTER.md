# Rules Library Profile — Starter Design

Yes, the builder can generate an offline Magic rules reference from a GitHub directory.

Recommended repository structure:

```
data/rules/
  index.json
  000-introduction.md
  100-game-concepts.md
  200-parts-of-a-card.md
  300-card-types.md
  400-zones.md
  500-turn-structure.md
  600-spells-abilities-effects.md
  700-additional-rules.md
  800-multiplayer.md
  900-casual-variants.md
  glossary.md
```

`index.json` supplies chapter order, titles, version information, and file paths.
The browser builder can fetch those files and generate one of two static outputs:

1. `mtg-rules.html` — one offline HTML file with a chapter navigator and deep links.
2. `rules/index.html` plus one HTML file per chapter — smaller files and faster phone loading.

The generated output can remain HTML/CSS-only. JavaScript is needed only inside the
GitHub Pages builder while assembling the files; the downloaded rules reference does
not need scripting.

Recommended static features:
- portrait: chapter navigator above the rules
- landscape: sticky chapter navigator on the left
- numbered rule anchors such as `#rule-704-5`
- glossary navigator
- previous/next chapter links
- print-friendly CSS
- source version/date banner
- optional split-by-chapter output profile

Keep source attribution and the source rules version/date in the generated output.
