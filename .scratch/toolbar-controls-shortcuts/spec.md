# Spec: Toolbar controls, shortcut hints, Shortcuts Reference, app rename & light theme

Status: ready-for-agent

## Problem Statement

As a Markdown author I write exclusively with the keyboard and the mouse. Actions like Save, Save As, New, and Open exist today only as keyboard shortcuts — there is no mouse-accessible control for them, so a mouse-first user cannot save a Document at all. The shortcuts that do exist are undiscoverable: only Bold and Italic mention their key in a tooltip, and there is no central place to look up the rest. The product is also named "ALi-md-editor" even though the app is a Markdown editor, and the Light theme's cool-grey, near-black palette feels cold for a writing tool.

## Solution

The toolbar gains a Document Controls group — New, Open, Save, Save As, and Find & Replace — plus Undo/Redo, visible in Split View and Focus Mode. Preview Only stays clean: no new controls appear there, only the existing Theme, Font, and Layout Switcher. Every control shows its keyboard shortcut in its native hover tooltip, formatted `Name (Ctrl/Cmd+X)`. A Help button opens a Shortcuts Reference modal listing every shortcut, grouped by category, reachable from anywhere with `Ctrl/Cmd+/`. The app is renamed **Markdown-Magic** on every surface. The Light theme becomes warm: a beige background with dark brown text and sienna accents.

## User Stories

1. As a Markdown author, I want New, Open, Save, Save As, and Find & Replace controls in the toolbar, so that I can perform every Document action with the mouse.
2. As a Markdown author, I want the Document Controls visible in Split View and Focus Mode, so that I can act on the Document wherever I can see the source.
3. As a Markdown author, I want the toolbar in Preview Only to show only Theme, Font, and the Layout Switcher, so that the reading layout stays clean and distraction-free.
4. As a Markdown author, I want Undo and Redo controls beside the Formatting Buttons, so that I can reverse edits without the keyboard.
5. As a Markdown author, I want the Undo and Redo controls disabled when there is nothing to undo or redo, so that the buttons never silently no-op.
6. As a Markdown author, I want the Undo and Redo controls hidden in Preview Only, where there is no Editor Pane, while the keyboard shortcuts still work there.
7. As a Markdown author, I want every control element to show its shortcut when I hover over it, so that I can learn the shortcuts as I use the buttons.
8. As a Markdown author, I want tooltips formatted `Name (Ctrl/Cmd+X)`, so that the hint reads naturally on both Windows and macOS.
9. As a Markdown author, I want controls without a shortcut (Theme, Font) to show their name only, so that a tooltip is never misleading.
10. As a Markdown author, I want the Layout Switcher segments to show the cycle-layout shortcut in their tooltips, so that the layout controls are not shortcutless.
11. As a Markdown author, I want a Heading shortcut, so that I can apply a heading without lifting my hands from the keyboard.
12. As a Markdown author, I want a List shortcut, so that I can start a bulleted list by keyboard.
13. As a Markdown author, I want a Link shortcut, so that I can wrap text in a link without the mouse.
14. As a Markdown author, I want a Code shortcut, so that I can wrap text as inline code by keyboard.
15. As a Markdown author, I want a Help button in the toolbar, so that I can discover all shortcuts with one click.
16. As a Markdown author, I want the Help button to open a Shortcuts Reference modal, so that I can see every shortcut in one place.
17. As a Markdown author, I want the Shortcuts Reference grouped by category (File, Edit, Format, View, Help), so that I can find a shortcut quickly.
18. As a Markdown author, I want the Shortcuts Reference to list the new Document Control and formatting shortcuts, so that the reference is complete.
19. As a Markdown author, I want `Ctrl/Cmd+/` to open and close the Shortcuts Reference, so that I can reach it from Preview Only without a button.
20. As a Markdown author, I want to close the Shortcuts Reference with Esc, by clicking outside it, or by toggling the button, so that dismissing it is effortless.
21. As a Markdown author, I want the Help button hidden in Preview Only, so that the reading layout stays clean, while the shortcut still works there.
22. As a Markdown author, I want the window title to read `<filename> — Markdown-Magic`, so that the app is identifiable under its new name.
23. As a Markdown author, I want the Dirty asterisk and Untitled title format unchanged, so that the rename does not disturb existing behavior.
24. As a Markdown author, I want the app renamed Markdown-Magic everywhere — installer name, OS app identity, docs, and release notes — so that no surface still says ALi-md-editor.
25. As a Markdown author, I want the Light theme background to be a warm beige, so that writing feels comfortable and less clinical.
26. As a Markdown author, I want the Light theme text to be dark brown rather than black, so that the prose matches the warm palette.
27. As a Markdown author, I want the Light theme accents (links, active layout segment, caret, selection) to be a warm sienna, so that the palette is coherent.
28. As a Markdown author, I want the toolbar to wrap rather than overflow or hide controls when the window is narrow, so that every control stays reachable at the minimum window width.
29. As a Markdown author, I want the Shortcuts Reference to be read-only, so that opening it never changes the Document.

## Implementation Decisions

- **Shortcut registry (single source of truth).** Introduce a small registry module mapping each control to its label and shortcut. Both the toolbar tooltips and the Shortcuts Reference derive their text from this registry, so the two can never drift. This is the module the "all controls show their shortcut" promise hangs off.
- **Document Controls group.** A new toolbar group containing New, Open, Save, Save As, and Find & Replace, positioned at the left end before the Formatting Buttons. Visible in Split View and Focus Mode only (`v-show` keyed off the layout mode, mirroring the Formatting Buttons pattern).
- **Undo/Redo controls.** Placed beside the Formatting Buttons in the same source-visible-mode visibility rule. Their enabled state is derived from CodeMirror's native history (via the history field's undo depth), observed through the editor-owning component's update listener and surfaced reactively to the toolbar through the app component. Dispatching undo/redo uses CodeMirror's own commands so behavior matches the shortcuts exactly.
- **New formatting shortcuts.** Heading `Ctrl/Cmd+Shift+H`, List `Ctrl/Cmd+Shift+L`, Link `Ctrl/Cmd+K`, Code `Ctrl/Cmd+Shift+C`, dispatched through the existing window keydown handler into the same formatting path as Bold/Italic. Conflict-checked against the installed `@codemirror/lang-markdown` (its default keymap binds only Enter and Backspace) and CodeMirror `basicSetup` (no matching bindings), so nothing is shadowed.
- **Tooltips.** Native `title` attributes, text `Name (Ctrl/Cmd+X)`, using the literal `Ctrl/Cmd` string per the existing convention so one string serves both platforms. Controls with no shortcut (Theme, Font) show the bare name; the Layout Switcher segments show `Switch to <Mode> (Ctrl/Cmd+Shift+P)`. No custom tooltip component.
- **Help button.** Placed at the toolbar's right end past the Layout Switcher, hidden in Preview Only (its shortcut still works there).
- **Shortcuts Reference modal.** A modal overlay listing the registry contents grouped as File (New/Open/Save/Save As), Edit (Undo/Redo/Find), Format (Bold/Italic/Heading/List/Link/Code), View (Cycle layout), Help (Shortcuts Reference). Static, non-interactive entries. Toggled by the Help button or `Ctrl/Cmd+/`; dismissed by Esc, clicking outside, or toggling again. Opening it must not touch the Document or editor state.
- **Toolbar overflow.** The toolbar lays out with flex-wrap so controls wrap to a second row rather than scroll or hide at the 800px minimum window width.
- **Rename to Markdown-Magic.** Change every surface: the window-title suffix constant and `index.html` title, Tauri `productName` and `identifier` (`com.markdownmagic.editor`), Cargo package description and authors, README/PRD/domain docs, release-note bodies, e2e title assertions, and the localStorage key prefixes (`alimd:` → `markdownmagic:`, including the e2e stub keys). Window title format stays `<filename> — Markdown-Magic` with the `*` Dirty marker and `Untitled.md` behavior unchanged. The identifier change registers existing installs as a new app on the OS — accepted at 0.1.0 with a single user. The repo slug `markdown-editor` is not renamed.
- **Light theme palette.** Repalette only the Light (default) theme block in the theme CSS: background warm beige, surface warm cream, text dark brown, muted text warm grey-brown, borders warm tan, accent sienna with links/caret/selection following it, and warm code backgrounds. Dark theme and the System dark palette are untouched. No component or logic changes — the swap rides the existing CSS variables.

## Testing Decisions

- **What makes a good test here:** assert external behavior only — simulate a click or keydown, then assert the visible result: which controls are rendered and visible, the exact `title` attribute text, the presence/content of the Shortcuts Reference, the Document and editor content after a save/format/undo, the enabled/disabled state of Undo/Redo, and the `data-theme` attribute. Avoid asserting internal wiring, store method call order, or registry plumbing.
- **Primary seam — full-app integration tests (`App.spec.ts`).** Carries nearly all coverage: Document Controls render, visibility across the three layout modes, and each action's effect; Undo/Redo behavior and disabled state; tooltip strings on every control; the four new shortcut keys; Help button + Shortcuts Reference open/content/close (button, Esc, click-outside, `Ctrl/Cmd+/`); Preview Only cleanliness; theme attribute changes. Prior art in the same file: toolbar button clicks (`toolbar-bold`), keydown events for Save/New/Open/Find/Bold/Italic, layout-segment clicks, find-panel open/close, and theme/font `data-*` assertions.
- **Store seam — `document.spec.ts`.** The title-suffix constant changes here; existing title-string assertions are updated to the Markdown-Magic suffix (including the Dirty and Untitled variants).
- **e2e seam.** Update every `getTitle()` assertion across the e2e suites to the Markdown-Magic suffix. Optionally add a single computed-style assertion that the Light theme renders the warm background and text colors, verifying the palette actually reaches the DOM.
- **Registry is not unit-tested separately.** App-level assertions on tooltip text and reference content both consume the real registry, proving the single source drives the two surfaces consistently without a dedicated test seam.

## Out of Scope

- Custom or styled tooltip component (native `title` tooltips stay).
- Iconography or an icon set for the controls (text labels stay).
- Interactive Shortcuts Reference entries (click-to-run or click-to-copy).
- A command palette or searchable shortcuts.
- New keyboard shortcuts for the Theme or Font selects.
- Any change to the Dark theme or the System-follows-dark palette.
- Renaming the repo slug, `.scratch/` conventions, or restructuring docs folders.
- Migrating or preserving localStorage settings across the key rename (single user; a one-time reset is accepted).
- Migrating existing OS installs across the identifier change.
- Rewriting historical slice docs.

## Further Notes

- The shortcut-conflict check was performed against the installed `@codemirror/lang-markdown` (its `markdown()` support binds only Enter and Backspace) and CodeMirror's `basicSetup` default keymap; the four new bindings and `Ctrl/Cmd+/` are all unclaimed.
- Renaming the localStorage keys means current Theme/Font settings reset once after the change; acceptable to the single user.
- The Find & Replace control opens the existing Find & Replace panel; in Preview Only it is hidden, but `Ctrl/Cmd+F` still opens the panel from there.
- The Shortcuts Reference must always be rendered from the registry — treat the list as generated from the same data the tooltips read, not as a second hand-maintained list.
- Tooltip text uses the literal `Ctrl/Cmd` prefix rather than detecting the platform, matching the existing tooltip style.
