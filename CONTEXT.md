# Markdown Editor

A cross-platform Tauri 2 desktop app: a distraction-free Markdown editor with a live rendered preview and native file-system integration.

## Language

**Editor Pane**:
The left-hand panel containing the Markdown source, built on CodeMirror 6.
_Avoid_: Editor, code editor, text area

**Preview Pane**:
The right-hand panel showing the rendered HTML output of the current document.
_Avoid_: Preview, rendered view

**Synced Scrolling**:
The editor-driven behavior where scrolling the Editor Pane scrolls the Preview Pane to the corresponding block. One-way (editor → preview) and block-anchored, never proportional.
_Avoid_: Scroll sync, synchronized scrollbars

**Document**:
A Markdown file open in a Tab, plus its in-memory unsaved changes. There is exactly one Document per Tab and one Tab per Document.
_Avoid_: File, note, buffer

**Confirm-Discard Guard**:
The native dialog shown before a Tab close or the app close when a Dirty Document would be discarded. Offers Save / Don't Save / Cancel. `New` never triggers it — it adds a Tab rather than replacing a Document. `Open` adds a Tab, or — when the sole Tab is an empty Untitled Document — replaces it with the opened file; it never discards content, so it never triggers the Guard. On app close with several Dirty Tabs, the Guard runs once per Dirty Tab; Cancel anywhere aborts the close.
_Avoid_: Save prompt, unsaved-changes dialog

**Dirty**:
The state of a Document whose content differs from what's on disk, shown as an asterisk (*) in that Document's Tab and in the window title when it is the Active Document.
_Avoid_: Modified, unsaved, needs-saving

**Save**:
Write the Active Document to disk. For an Untitled Document, Save becomes Save As. Clears the Dirty state on success.
_Avoid_: Save File, write to disk

**Save As**:
Write the Active Document to a user-chosen path, which then becomes that Document's canonical path. The Document's Tab and the window title update to the new filename.
_Avoid_: Save copy, export

## Tabs

**Tab**:
The slot in the Tab Bar holding one Document. Each Tab keeps its own Document state — content, Dirty state, canonical path, Layout Mode, Find & Replace state, and the editor's cursor, scroll, and undo history — for the session. `New` inserts the new Tab after the active one and makes it Active. Tabs stay in insertion order (not reorderable).
_Avoid_: File tab, buffer

**Tab Bar**:
The strip at the very top of the window, above the toolbar, showing every open Tab in insertion order. Each Tab is labelled with its Document's filename (with the parent folder added when two open Documents share a basename) and a Dirty marker, and carries its own close control. Always visible in every Layout Mode; clicking a Tab makes it Active. A `+` affordance creates a New (Untitled) Tab. Tab shortcuts: Cmd/Ctrl+T New Tab, Cmd/Ctrl+W Close Tab, Ctrl+Tab / Ctrl+Shift+Tab next / previous Tab.
_Avoid_: Tab strip, tabs row

**Active Document**:
The Document in the focused Tab — the one the window's panes, Toolbar, and title reflect. The window displays the Active Document's Layout Mode and switches to it on Tab switch.
_Avoid_: Current document, open document

**Close Tab**:
Remove a Tab and its Document. If the Document is Dirty, the Confirm-Discard Guard runs first; Cancel keeps the Tab. Closing the Active Tab makes the Tab to its right Active (or the new last Tab). Closing the last Tab closes the window.
_Avoid_: Close file, destroy tab

**Find & Replace**:
The app-hosted search panel that operates on the Active Document. Each Tab keeps its own Find & Replace state (query and current match), so switching Tabs swaps the panel to that Tab's state. Preview Only gives no highlight or scroll feedback (its Editor Pane is hidden), so opening Find, typing a query, cycling matches, or triggering a replace first switches the Active Document to Split View.
_Avoid_: Search box, search-and-replace

## Layout Modes

The Layout Mode is a property of each Document, not of the window; the window displays the Active Document's mode.

**Split View**:
The default layout with both panes visible side by side. Chosen automatically when a New Document is created. The only mode in which Synced Scrolling is active.
_Avoid_: Split screen, side-by-side

**Preview Only**:
The layout with the Editor Pane hidden and the Preview Pane filling the window. Chosen automatically when an existing file is opened. No Synced Scrolling in this mode.
_Avoid_: Reading mode, view mode

**Focus Mode**:
The layout with the Preview Pane hidden and the Editor Pane filling the window.
_Avoid_: Writing mode, Zen mode

**Layout Switcher**:
The toolbar segmented control (Split / Preview / Focus) that sets the Active Document's Layout Mode directly. Always visible and enabled in every Layout Mode — it is the way out of Preview Only. The keyboard shortcut Cmd/Ctrl+Shift+P cycles the Active Document's modes.
_Avoid_: View toggle, mode selector, segmented buttons

**Formatting Buttons**:
The toolbar's Bold, Italic, Heading, List, Link, and Code controls. Visible in Split View and Focus Mode; hidden in Preview Only, where there is no Editor Pane to format. The Bold/Italic keyboard shortcuts no-op in Preview Only.
_Avoid_: Edit buttons, markup buttons

Each Document carries its own Layout Mode. When a Tab is created, the mode is auto-chosen (Open → Preview Only, New → Split View); afterwards the Layout Switcher sets only the Active Document's mode, remembered for that Tab's session. Save As does not change the Layout Mode. Modes are not persisted across launches (the app does not restore the previous session).

## Appearance

**Theme**:
The appearance preference shown in the toolbar. Seven states: System (default) or one of six curated Palettes — Light (warm beige), House (cool paper with green-gray ink), Dark (deep navy), High Contrast (near-black), Nord (cool arctic blue-grey), or Terminal Green (green-on-black). A manual choice persists until changed. Persisted in localStorage.
_Avoid_: Color mode, dark mode toggle

**Palette**:
A concrete color scheme, one of the six: Light, House, Dark, High Contrast, Nord, or Terminal Green. System is a Theme but not a Palette. The Design language is shared across all Palettes.
_Avoid_: Theme (the seven-state preference; System is a Theme but not a Palette)

**Design language**:
The shared visual treatment of the app chrome: Helvetica Neue or its fallback, monospace uppercase micro-labels, hairline borders, and flat surfaces with no radius or shadow. It follows the alitools-pages House style. The Design language does not replace a Palette and does not control the Editor Pane or Preview Pane content fonts.
_Avoid_: look-and-feel, skin, theme

**System**:
The default Theme state. Not a Palette: it follows the OS live and resolves to the Light Palette for light mode or the Dark Palette for dark mode. House is an explicit Palette and is not selected by System. Persisted in localStorage.
_Avoid_: Auto theme, OS theme

**Text Size**:
The shared preference controlling how large text renders in the Editor Pane and the Preview Pane. Three choices — Small, Medium (default), Large — a single pick applies to both panes. Persisted in localStorage.
_Avoid_: Font size (the typeface choice, not its size)

## File Lifecycle

**Untitled Document**:
A Document created by `New` or at first launch that has no canonical path. Multiple Untitled Documents may be open at once, disambiguated by a number (`Untitled.md`, `Untitled 2.md`, …). Numbering is derived from the open set: the next number is one past the highest currently open, or 1 when no Untitled Document is open — so the launch Tab's consumption by an Open frees its number. An empty Untitled Document that is the sole Tab is a placeholder: Open replaces it with the opened file rather than stacking a second Tab. Save behaves as Save As until it gains a path.
_Avoid_: New file, nameless file

**Externally-Modified**:
The state where the file on disk changed (mtime or content) since the Document was loaded or last saved. Checked for the Active Document on window focus and on Tab activation; a background Tab is only checked when it becomes Active, one dialog at a time. If the Document is Dirty the user chooses Reload / Overwrite / Cancel; if clean it reloads silently.
_Avoid_: File changed, stale file

## Window Title

The window title reads `<filename> — Markdown Hexer`, where `<filename>` is the Active Document's, with `*` inserted after it when the Active Document is Dirty (e.g., `notes.md * — Markdown Hexer`). Untitled Documents read `Untitled.md — Markdown Hexer` (or `Untitled 2.md`, …). The product name is **Markdown Hexer**.
_Avoid_: markdown-editor (the repo slug), Markdown Editor

## Distribution

**Version**:
The product's release version, taken from the git tag at build time with the leading `v` stripped (`v1.0.3` → `1.0.3`). Every shipped Bundle carries it, and the About Dialog shows it. The static version in the source manifests is a dev baseline and never ships.
_Avoid_: build number, manifest version, 0.1.0

**Release**:
A tagged set of Bundles for one Version, published on GitHub Releases. Created as a draft when a `v*` tag is pushed; tags carrying a semver prerelease segment (e.g. `v1.1.0-rc.1`) are marked prerelease.
_Avoid_: build, artifact set, milestone

**Bundle**:
A platform-specific installer or package produced by the CI build — `.exe`/`.msi` (Windows), `.dmg`/`.app.tar.gz` (macOS), `.deb`/`.AppImage`/`.rpm`/`.flatpak` (Linux). A Bundle's filename embeds its Version, Platform Label, and architecture.
_Avoid_: artifact, installer, binary

**Platform Label**:
The canonical OS name in a Bundle filename: `windows`, `macos`, or `linux`.
_Avoid_: darwin, ubuntu, win32

**Flatpak Bundle**:
A Linux Bundle in the Flatpak format — a single-file `.flatpak` attached to a GitHub Release and installed with `flatpak install`. Not the same thing as a Flathub listing.
_Avoid_: flatpack, flatpak ref, "the appimage of flatpak"

**Distribution Channel**:
The place a user obtains a Bundle from. Today only GitHub Releases; Flathub — the Flatpak app store — is a possible future channel, deferred by choice: the repository is public, so Flathub's public-source requirement no longer blocks it, but publishing there is not the current goal.
_Avoid_: release, store (unless Flathub specifically), download site

**Flathub**:
The Flatpak app store, a Distribution Channel distinct from the Flatpak Bundle format. Deferred by choice — possible now that the repository is public, but not the current goal.
_Avoid_: flatpak (the format), the flatpak store

## About

**About Dialog**:
The modal opened by the toolbar's About button or `Ctrl/Cmd+/` (from any Layout Mode) that shows the product name, the Version of the running Bundle, a link to the repository, and the Shortcuts Reference.
_Avoid_: Help dialog, about box, shortcuts modal

## Development

**Contributor**:
Anyone who engages with the project — reports a bug, asks a question, or submits a Pull Request. Strangers and trusted people alike; direct access to the repository is not required.
_Avoid_: user (a person who runs the app), collaborator

**Collaborator**:
A person with direct Write access to the repository — a trusted person granted access by the Code Owner. Collaborators push feature branches and open Pull Requests into `main`; they cannot merge without Code Owner approval.
_Avoid_: contributor (overlaps with the public-facing term), developer, team member

**Code Owner**:
The repository's sole owner (Adrian Link, GitHub `ALi-strg`), named in `CODEOWNERS`. Required to approve every Pull Request into the protected `main` branch, and the only person who merges and publishes Releases.
_Avoid_: maintainer, owner role, admin

**Contribution Policy**:
The rule, documented in CONTRIBUTING.md, that Pull Requests from outside the Collaborator circle are closed without merging, while bug reports via Issues are always welcome. Revisited once the codebase stabilizes.
_Avoid_: PR policy, contributing guidelines
