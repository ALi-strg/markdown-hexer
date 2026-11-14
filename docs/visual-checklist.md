# Visual checklist: Theme, Font, Text Size

Ticket 12 acceptance is checked at the token and style level, not with pixel
snapshots. ADR-0016 allows spacing and line-breaking differences between the
native Preview and 1.x, so a screenshot diff would fail for reasons the design
explicitly accepts.

The automated checks live in:

- `app/src/settings.rs` — parse, defaults, roundtrip, corrupt input, unknown
  fields, version fallback, font and Text Size mappings.
- `app/src/ui/palette.rs` — all six Palettes resolve their expected tokens,
  System resolves Light/Dark, contrast for ink/muted/focus/selection, the code
  surface against the page (at least 1.45:1), and syntax tokens against the code
  surface (at least 4.5:1).
- `app/src/ui/tests.rs` — first-frame Palette and `clear_color`, live System
  switch, Appearance menu persistence, font/Text Size helpers, Preview content
  style, chrome token wiring for every Theme.

Run `cargo test --all-targets` in `app/`. This checklist covers what a human
or an agent still has to confirm on a real window.

## Fixture

Use `app/tests/fixtures/readme.md`. It contains:

- an H1, nested H2 sections, paragraphs, emphasis, inline code, and links;
- a blockquote;
- an unordered list;
- a GFM table (`Tech Stack`);
- fenced `sh` code blocks;
- an image reference (`AppReadme.png`). The file is absent from the fixture
  directory, so the Preview must show its normal missing-image fallback without
  breaking the rest of the document.

Open the fixture from the command line or through Open. Preview is the default
Mode and the first frame must already use the persisted Theme.

## Screenshots

Run from `app/`:

```sh
cargo test --features screenshots --test screenshots -- --ignored --nocapture
```

This renders the fixture in every Palette and Text Size to
`.scratch/preview-polish/screenshots` (override with `PREVIEW_SCREENSHOT_DIR`).
Use the images as before/after evidence. The OS title bar is not part of the
rendered frame.

## Token expectations

The Palette tokens live in `app/src/ui/palette.rs`, and its tests are the source
of truth for values and contrast. Do not copy the values into this checklist;
run `cargo test --all-targets` before the manual pass, then check the rendered
result below. `System` is a preference, not a Palette: it resolves to Light or
Dark from the OS. House intentionally uses `bg == surface`; it has no separate
card surface.

## Per-Palette pass

Open `app/tests/fixtures/readme.md` in Preview for each pass. Switch with
**Appearance → Theme**. Do this for Light, House, Dark, High Contrast, Nord,
and Terminal Green, then run the System pass below. For each Palette confirm:

1. **First frame** — the window never flashes white or the previous Palette.
   Relaunch with that Theme persisted and watch the first visible frame.
2. **Chrome** — tab bar `surface` fill and `border` hairline; toolbar `bg`;
   tab labels `ink`, close glyph `muted`, active-tab underline `accent`; the
   active Preview/Edit mode button uses `accent` behind `accent_contrast`, and
   menu selections use `selection` behind `ink`.
3. **Ink and muted text** — tab titles, buttons, and toast text use `ink`;
   secondary labels and the code Copy button use `muted`.
4. **Borders** — tab bar, code frames, table rules, and the toast frame use
   `border`; blockquote rules and text use `muted`. Nothing falls back to
   egui's default blue-grey.
5. **Preview** — `bg` panel, body in `ink`, links in `link`, headings in the
   Preview's heading style and at the Preview Text Size.
6. **Editor** — `surface` frame, `ink` body text, `accent` headings, `muted`
   markers, `link` link text, and a `focus` caret.
7. **Code** — code blocks and inline code use `code_bg`, which reads as a
   separate surface from the page, not just a bordered box; the frame uses
   `border`; comments/keywords/punctuation/strings/numbers/functions match the
   active Palette's syntax tokens; the Copy label is `muted`.
8. **Selection** — drag-select text in Preview and Editor. The highlight is
   `selection`; the selection outline uses `focus`.
9. **Sections** — every heading has a `muted` chevron in the left margin;
   collapsing a parent hides its children; the chevron does not grow when Text
   Size changes.
10. **Toast** — copy a selection or a code block. The toast fill is `toast_bg`
    and its text is `toast_ink`.
11. **System** — select System, then change the OS light/dark setting while the
    app is open. The whole shell and content switch live. Select Light or Dark
    manually and confirm the OS change no longer overrides it.

## System pass

System must be checked twice, because it has two resolved Palettes:

1. With the OS in light mode, select **System**. The fixture and the whole
   shell must match the Light Palette, including the table, fenced code,
   missing-image fallback, and collapsible Sections.
2. Change the OS to dark mode while the app stays open. The same document must
   switch to the Dark Palette without a restart or a white intermediate frame.
3. Change the OS back to light and confirm the switch reverses.
4. Select Light manually, then change the OS to dark. The app must stay Light.
   Select System again and confirm it follows the OS.

### High Contrast specifics

- Keyboard focus and hovered/active controls have a 2 px `focus` stroke that is
  clearly visible on the High Contrast `bg`.
- The selection outline is `focus`, not the selection fill, so a selection
  inside a dark table still shows its extent.
- Ink on bg, focus on bg, and selection against ink meet the contrast
  assertions in `app/src/ui/palette.rs`. Do not "improve" the Palette by
  lowering them.

### House specifics

- Background and surface are both the House paper fill; the layout is flat,
  separated by `border` hairlines.
- Headings in the Editor use the sage `accent`, not the Light brown.
- Links use the House `link` token and the caret uses `focus`, not the sage
  accent, so they remain readable on paper.
- Selection and the code background are distinct pale surfaces.

### Terminal Green specifics

- All text is green-family; check that comments and punctuation remain
  distinguishable from body ink and from each other.
- Toast uses the Terminal Green `toast_bg` with `toast_ink`, not an inverted
  white flash.

## Text Size pass

Use **Appearance → Text Size** at Small, Medium, and Large on the same
document in Preview and Edit:

| Choice | Editor | Preview body | Preview headings | Code |
|---|---|---|---|---|
| Small | 12 px | 13 px | scaled from the body size | 13 px monospace |
| Medium | 14 px | 15 px | scaled from the body size | 15 px monospace |
| Large | 16 px | 17 px | scaled from the body size | 17 px monospace |

Confirm that:

- chrome (tab bar, toolbar, menus, dialogs, toast) does **not** change size;
- the scale survives switching Tabs and switching Preview/Edit;
- code blocks stay monospace while their size follows the Preview scale;
- the scale survives a relaunch.

## Font pass

Use **Appearance → Font** and check the same paragraph, a heading, a table, a
list, inline code, and a fenced block in both panes:

- **Default** — monospace editor, built-in proportional Preview, as in 1.x;
- **Serif** — serif in Editor and Preview;
- **Sans** — sans in Editor and Preview;
- **Mono** — monospace in Editor and Preview.

Code blocks may stay monospace for every choice. Chrome keeps the existing UI
font and sizes and must not change.

Include CJK text in the document for each choice. It must render through the
CJK fallback rather than showing tofu; the fallback is appended to every
content family.

The app resolves a persisted non-default font from known system font paths
before the first frame. It does not enumerate all installed fonts and does not
download anything. If the expected face is missing, the pane falls back to the
default family without an error.

## Persistence and settings file

One versioned file, one location:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\markdown-hexer\settings.json` |
| macOS | `~/Library/Application Support/markdown-hexer/settings.json` |
| Linux | `$XDG_CONFIG_HOME/markdown-hexer/settings.json`, else `~/.config/markdown-hexer/settings.json` |

Expected shape:

```json
{
  "version": 1,
  "theme": "dark",
  "font": "serif",
  "text_size": "large"
}
```

Checks:

1. Change Theme, Font, and Text Size, quit, and relaunch. All three are
   restored before the first visible frame.
2. Missing file, unreadable file, corrupt JSON, wrong `version`, or a value
   outside the enum all fall back to Light / Default / Medium without a crash
   or a dialog.
3. An unknown field (for example `"welcome_seen": true`) is ignored on load and
   dropped on the next save.
4. Saving writes a `.tmp` sibling and renames it over `settings.json`, so
   `settings.json` is always either the old or the new document. A forced quit
   during save may leave a `.tmp` file; it is ignored by the next load.
5. There is no session restore: no Tabs, scroll positions, cursor positions, or
   Find state are persisted.

## Non-goals

- No pixel-perfect comparison with 1.x. Wrapping, table layout, and spacing may
  differ (ADR-0016).
- No screenshots checked into the repo for this checklist.
- No network font download and no full font-directory scan.
