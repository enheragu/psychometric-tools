# Tool Core (Skeleton)

Shared utilities to build psychometric-tools pages by configuration, while keeping page-specific logic minimal.

## Current modules

- `tool-core.js`
  - `parseInlineYamlArrayMap(raw)`
  - `applyOrderPolicy({ availableModels, policy, yamlOrder, ranker })`
  - `resolveAutoselection({ orderedModels, policy, fallbackCount })`

## Recommended architecture for new tools

Use this layout for each new tool page:

```
my-tool/
  index.html
  css/
    style.css
  js/
    tool-config.js      # Presets, metric sources, ordering defaults
    i18n.js             # Local copy only
    app.js              # Page orchestration only (loads, binds, renders)
```

Shared reusable area:

```
psychometric-tools/assets/tool-core/
  tool-core.js          # Generic data/order helpers
  README.md
```

## Migration strategy

1. Move static configuration from each page `app.js` to `js/tool-config.js`.
2. Keep page state/render logic in `app.js`.
3. Replace repeated helpers with `window.StatToolCore` functions.
4. Add new helpers to `tool-core.js` only when at least two tools need them.

## Next extraction candidates

- Shared preset/metric tab renderer.
- Shared selected/unselected model list renderer.
- Shared simulation job lifecycle utility (busy, stale, cancellation token).
