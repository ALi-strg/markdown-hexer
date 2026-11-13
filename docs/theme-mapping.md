# Theme mapping: Markdown Hexer and House style

## Decision

Markdown Hexer uses the alitools-pages House style as its global Design language for app chrome. Its six color Palettes remain independent. Light stays the default Palette when System follows a light OS preference; House is an explicit Palette.

The app does not copy page-only House elements such as hero images, full-height landing sections, or giant display headlines.

## Canonical source

The canonical House tokens live in the `:root` block of the alitools-pages Hub template:

`alitools-pages/sites/root/template.html`

The 2.0 app's Palette values live in `app/src/ui/palette.rs`; the table below
records the canonical House tokens the House Palette derives from:

| House token | Value | Markdown Hexer role |
|---|---|---|
| paper | `#f7f6f0` | background and flat surfaces |
| ink | `#26302a` | primary text and toast background |
| muted | `#78827a` | secondary text and gutters |
| line | `#d2d8cf` | borders, separators, and code borders |
| sage | `#8fa98f` | active controls, accents, and blockquote borders |
| blue | `#dce9e5` | the base for the House code surface and soft table tint |

The app maps the canonical tokens to its Palette fields because the other
Palettes already use those roles:

| Palette field | House treatment |
|---|---|
| `bg` | `paper` |
| `surface` | `paper`, with no separate card surface |
| `ink` | `ink` |
| `muted` | `muted`, darkened in the Palette for contrast |
| `border` | `line` |
| `accent` | `sage` |
| `accent_contrast` | `ink` |
| `selection` | a darker `blue` so ink stays readable |
| `code_bg` | a deeper `blue` that separates code from the page |
| `link` | the higher-contrast sage text value |
| `focus` | the focus and caret value |

The House syntax fields reuse the Light Palette's syntax tokens. Both sets are
retuned in `palette.rs` so every token stays at least 4.5:1 on the code
background. Syntax is content styling, not app chrome, and stays readable
without inventing a second syntax palette.

## Global Design language

The shared chrome uses:

- `"Helvetica Neue", Arial, sans-serif` for the app UI;
- 11px monospace uppercase labels with letter spacing for toolbar and dialog labels;
- 1px borders;
- zero-radius controls and surfaces;
- no decorative box shadows.

The Editor Pane and Preview Pane keep their existing user-selectable Font choices. The Design language only controls app chrome.

## Screenshots

The intended download page screenshot set shows three different Palettes so the
feature is visible: Light, High Contrast, and House. The Preview screenshot
harness renders the fixture in every Palette and Text Size (see
`docs/visual-checklist.md`); the download-page crops still need a human.

## Maintenance

When the canonical House tokens change:

1. Compare the Hub template's `:root` values with the canonical table above.
2. Port the shared values into the House Palette in `app/src/ui/palette.rs`.
3. Run the Palette tests from `app/` and recheck the contrast assertions; adjust
   the app-specific values if needed.
4. Regenerate the Preview screenshots and the download-page set if the rendered
   chrome changes.

There is no automated mirror guard for the canonical House tokens; the Palette
tests guard the app values.
