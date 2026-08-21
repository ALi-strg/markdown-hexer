# Theme mapping: Markdown Hexer and House style

## Decision

Markdown Hexer uses the alitools-pages House style as its global Design language for app chrome. Its six color Palettes remain independent. Light stays the default Palette when System follows a light OS preference; House is an explicit Palette.

The app does not copy page-only House elements such as hero images, full-height landing sections, or giant display headlines.

## Canonical source

The canonical House tokens live in the `:root` block of the alitools-pages Hub template:

`alitools-pages/sites/root/template.html`

The House Palette in `src/styles.css` mirrors the six shared colors by value:

| House token | Value | Markdown Hexer role |
|---|---|---|
| paper | `#f7f6f0` | background and flat surfaces |
| ink | `#26302a` | primary text and toast background |
| muted | `#78827a` | secondary text and gutters |
| line | `#d2d8cf` | borders, separators, and code borders |
| sage | `#8fa98f` | active controls, accents, and blockquote borders |
| blue | `#dce9e5` | selection, code surfaces, and soft table tint |

The app keeps its existing token names because the other Palettes already use those roles:

| App token | House value or treatment |
|---|---|
| `--background-color` | `paper` |
| `--surface-color` | `paper`, with no separate card surface |
| `--text-color` | `ink` |
| `--text-muted` | `muted` |
| `--border-color` / `--code-border` | `line` |
| `--accent-color` | `sage` |
| `--accent-contrast-color` | `ink` |
| `--selection-background` / `--code-background` | `blue` |
| `--link-color` / `--caret-color` | `#66816f`, the higher-contrast sage text value |

The House syntax variables reuse the Light Palette's GitHub-light hues. Syntax is content styling, not app chrome, and stays readable without inventing a second syntax palette.

## Global Design language

The shared chrome uses:

- `"Helvetica Neue", Arial, sans-serif` for the app UI;
- 11px monospace uppercase labels with letter spacing for toolbar and dialog labels;
- 1px borders;
- zero-radius controls and surfaces;
- no decorative box shadows.

The Editor Pane and Preview Pane keep their existing user-selectable Font choices. The Design language only controls app chrome.

## Screenshots

The intended download page screenshot set shows three different Palettes so the feature is visible: Light, High Contrast, and House. The old Nord screenshot is replaced by a House screenshot after a manual desktop capture.

## Maintenance

When the canonical House tokens change:

1. Compare the Hub template's `:root` values with the House block in `src/styles.css`.
2. Port the six shared values.
3. Recheck contrast for `--link-color`, `--caret-color`, active controls, syntax, and code surfaces.
4. Regenerate the three download-page screenshots if the rendered chrome changes.

There is no automated mirror guard yet. Add one if the duplicated token set begins to drift repeatedly.
