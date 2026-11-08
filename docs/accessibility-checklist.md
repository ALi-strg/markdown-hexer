# Accessibility checklist: keyboard and screen readers

Ticket 15 acceptance is "a keyboard-only or screen-reader user can open, read,
edit, save, close, fold Sections, copy code, and find every action without a
mouse." The automated part is in `app/src/ui/tests.rs`; this checklist covers
what still has to be confirmed on a real window with a real screen reader.

## Automated checks

Run `cargo test --all-targets` in `app/`.

- `ui::tests::accessibility_tree_exposes_tab_state_and_close_names` — Tab role,
  selected state, dirty name, "Close <tab>" buttons, TabList container, mode
  toggle as a RadioButton, Save as a Button.
- `ui::tests::preview_exposes_heading_level_expand_state_and_copy_status` —
  Heading role and level, expanded state on Section headings, Enter on a focused
  heading folds it, Code Copy by keyboard, polite Status toast.
- `ui::tests::about_dialog_is_named_and_escape_returns_focus_to_preview` —
  Dialog role, name, description, initial focus on Close, Escape restores focus
  to the Preview.
- `ui::tests::tab_strip_arrow_keys_move_focus_and_selection_without_a_trap` —
  Left/Right move focus and activate within the strip; Tab leaves it.
- `ui::tests::keyboard_only_new_type_save_as_preview_and_close_workflow` — New,
  type, Save As, Preview, Close with no pointer, then focus returns to the
  Editor.
- `ui::tests::find_panel_exposes_labelled_fields_and_escape_restores_editor` —
  named Find/Replace fields, Status match count, Escape restores the Editor.
- `ui::palette.rs` tests — every Palette plus System keeps ink, muted text,
  links, syntax tokens, selection, focus, and toast text at WCAG contrast
  (4.5:1 for text, 3:1 for the focus ring and selection against its
  background). High Contrast asserts 7:1 for focus and ink.

## Keyboard map

| Action | Keys |
| --- | --- |
| Move focus | Tab / Shift+Tab |
| Activate focused control | Enter or Space |
| Move inside the Tab Bar | Left / Right (activates as focus moves) |
| Close Tab | Ctrl+W |
| New Tab | Ctrl+T |
| New document | Ctrl+N |
| Open | Ctrl+O |
| Save / Save As | Ctrl+S / Ctrl+Shift+S |
| Preview ↔ Edit | Ctrl+E |
| Find | Ctrl+F |
| Cycle Tabs | Ctrl+Tab / Ctrl+Shift+Tab |
| Move Tab | Ctrl+Shift+PgUp / Ctrl+Shift+PgDn |
| Bold / Italic (Edit) | Ctrl+B / Ctrl+I |
| About | Ctrl+/ |
| Close Find or About | Escape |

Focus order follows the drawing order: Tab Bar, toolbar, Mode Switcher, content,
status/toast. There is no keyboard trap. Escape in Find returns focus to the
Editor; Escape in About returns focus to the Editor or Preview region that opened
it. Closing a Tab returns focus to the Editor or Preview.

## Fixture

Use `app/tests/fixtures/readme.md`. It has an H1 with nested H2 sections, a
blockquote, a list, a GFM table, fenced code blocks, links, and an image
reference.

## Keyboard-only script

- [ ] Start with no arguments. Tab Bar has one tab, Preview is active. Tab reaches
      Preview, toolbar, Mode Switcher, and the Tab Bar in a loop with no dead end.
- [ ] Ctrl+N, type Markdown, Ctrl+S (or Ctrl+Shift+S with a path). The Tab name
      gains "unsaved changes" until the write succeeds; no dialog steals focus
      silently.
- [ ] Ctrl+E switches to Preview, Ctrl+E back to Edit; focus lands in the visible
      content both times.
- [ ] Ctrl+F, type a word, Enter/Shift+Enter move matches, Escape closes Find and
      the Editor has focus again.
- [ ] In Preview, focus a Section heading and press Enter; the Section folds and
      the heading reports collapsed. Press Enter again to expand.
- [ ] Focus a code block's Copy button and press Enter; the clipboard contains the
      code and a "Copied" status appears without moving focus.
- [ ] Ctrl+W closes the Tab; focus moves to the remaining content, not to a
      hidden widget.
- [ ] Open About, confirm Close has focus, Escape returns to the content.
- [ ] Repeat at all three Text Sizes; no label or button is clipped.

## Screen-reader smoke tests

### Windows Narrator

- [ ] Start Narrator (Win+Ctrl+Enter), open the app, keep Scan Mode off for forms
      and on for reading the Preview.
- [ ] Tab through the Tab Bar: each Tab is announced as a tab, the active Tab is
      selected, a dirty Tab includes "unsaved changes", and the close button is
      "Close <name>".
- [ ] In Preview, headings are announced as headings with a level; the Section
      chevron announces expanded/collapsed.
- [ ] Code Copy is announced as a button with its code-block number; the toast is
      announced once, not repeatedly.
- [ ] Open About; Narrator announces the dialog name and description, and the
      Close button; Escape returns to the document.

### Windows NVDA

- [ ] Start NVDA, open the app, leave browse mode for the chrome and use Tab.
- [ ] Insert+F7 lists headings from the Preview; expect Section headings only.
- [ ] Check the Tab Bar, toolbar, Find panel, About, and the native Save As and
      unsaved-changes dialogs have names and roles.
- [ ] Read a table and a list in Preview; both read in document order (see Known
      limits).

### macOS VoiceOver

- [ ] Start VoiceOver (Cmd+F5), open the app.
- [ ] VO+Right reads Preview text; the rotor (VO+U) lists headings and links.
- [ ] Tab reaches every control; VO+Space activates buttons, tabs, Section
      headings, and Copy.
- [ ] Check the Tab Bar dirty state and close names, the About dialog, and the
      native Save As and unsaved-changes sheets.

### Linux Orca

- [ ] Start Orca (Super+Alt+S) on Wayland with the accessibility bus running.
- [ ] Tab through the chrome; check that names and roles are spoken.
- [ ] Check Preview reading and heading navigation. Orca is best-effort; record
      what it misses rather than blocking the release on it.

## Known limits

These are accepted for 2.0 and must not be "fixed" by adding a runtime
dependency:

- The Tab Bar exposes a TabList container and Tab children, but not a position
  or set size; screen readers may not say "2 of 5".
- Preview headings, links, and Section expanded state are exposed. Lists,
  blockquotes, and tables from `egui_commonmark` flatten to text labels; there is
  no list or table role, no cell navigation, and no row/column announcement.
- Images render in Preview but their alt text is only a hover label, not an
  AccessKit name. The image itself is not a reading stop with alt text.
- Code block contents are one accessible text node; long blocks may be announced
  as a single run. The Copy button is a separate, labelled control.
- The native Open/Save/Export, Confirm-Discard, and External-Modified dialogs use
  the OS accessibility layer. The app does not draw or reimplement them; custom
  button labels are Save, Don't Save, Cancel, Reload, Overwrite.
- About is an in-app dialog with a Dialog role, name, and description. Modals do
  not trap Tab; a keyboard user can Tab out of the dialog as in other egui apps.
- Toast and status messages are polite live regions. A screen reader that is
  busy may miss a short "Copied" toast; the action still succeeds.
- High Contrast is an app Palette, not Windows forced-colors integration. The
  OS high-contrast theme is not detected.
- Multi-cursor editing is not offered (ADR-0014); reduced motion is not a 2.0
  requirement.

Record the OS, screen-reader version, Palette, and Text Size with each result.
If a check fails, fix the AccessKit metadata in `app/src/ui/mod.rs` and add or
extend a `egui_kittest` assertion instead of documenting the failure away.
