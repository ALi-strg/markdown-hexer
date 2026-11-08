# Markdown Editor

A cross-platform desktop Markdown editor: a distraction-free editor with a native rendered preview and native file-system integration.

## Language

**Editor View**:
The view containing the Markdown source. It fills the window in Edit Mode.
_Avoid_: Editor, code editor, text area, Editor Pane

**Preview View**:
The view showing the current document rendered through the Native Preview. It fills the window in Preview Mode.
_Avoid_: Preview, rendered view, Preview Pane

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
The slot in the Tab Bar holding one Document. Each Tab keeps its own Document state — content, Dirty state, canonical path, Mode, Find & Replace state, collapsed Sections, and the editor's cursor, scroll, and undo history — for the session. `New` inserts the new Tab after the active one and makes it Active. Tabs can be reordered within the Tab Bar by dragging (Tabs shift aside as the drag crosses them; a drop right of the last Tab moves it to the end) or with Cmd/Ctrl+Shift+PageUp/PageDown, which move the Active Tab one position left or right. Dragging never makes a Tab Active. Order is session-only.
_Avoid_: File tab, buffer

**Tab Bar**:
The strip at the very top of the window, above the toolbar, showing every open Tab in the user's chosen order (initially insertion order). Each Tab is labelled with its Document's filename (with the parent folder added when two open Documents share a basename) and a Dirty marker, and carries its own close control. Always visible in both Modes; clicking a Tab makes it Active. A `+` affordance creates a New (Untitled) Tab. Tab shortcuts: Cmd/Ctrl+T New Tab, Cmd/Ctrl+W Close Tab, Ctrl+Tab / Ctrl+Shift+Tab next / previous Tab, Cmd/Ctrl+Shift+PageUp/PageDown move Tab left / right.
_Avoid_: Tab strip, tabs row

**Active Document**:
The Document in the focused Tab — the one the window's views, Toolbar, and title reflect. The window displays the Active Document's Mode and switches to it on Tab switch.
_Avoid_: Current document, open document

**Close Tab**:
Remove a Tab and its Document. If the Document is Dirty, the Confirm-Discard Guard runs first; Cancel keeps the Tab. Closing the Active Tab makes the Tab to its right Active (or the new last Tab). Closing the last Tab closes the window.
_Avoid_: Close file, destroy tab

**Find & Replace**:
The app-hosted search panel that operates on the Active Document in Edit Mode. Each Tab keeps its own Find & Replace state (query and current match), so switching Tabs swaps the panel to that Tab's state. Invoking Find & Replace from Preview Mode first switches the Active Document to Edit Mode; there is no split view and no cross-view highlight.
_Avoid_: Search box, search-and-replace

## Modes

The Mode is a property of each Document, not of the window; the window displays the Active Document's Mode. There are two Modes: Preview and Edit.

**Preview**:
The default Mode for an opened Document. The Preview View fills the window. No editor is initialized: the first entry into Edit Mode is what loads the editor. Copy-on-Select and the Code Copy Button are active.
_Avoid_: Reading mode, view mode, Preview Only

**Edit**:
The authoring Mode. The Editor View fills the window and there is no live rendered view. The editor initializes lazily on the first switch to Edit. Find & Replace and the Formatting Buttons are available.
_Avoid_: Writing mode, Focus Mode, source mode

**Mode Switcher**:
The toolbar segmented control (Preview / Edit) that sets the Active Document's Mode directly. Always visible and enabled in both Modes. The keyboard shortcut Cmd/Ctrl+E toggles the Active Document's Mode.
_Avoid_: View toggle, mode selector, segmented buttons, Layout Switcher

**Formatting Buttons**:
The toolbar's Bold, Italic, Heading, List, Link, and Code controls. Visible in Edit Mode; hidden in Preview Mode, where there is no Editor View to format. The Bold/Italic keyboard shortcuts no-op in Preview Mode.
_Avoid_: Edit buttons, markup buttons

Each Document carries its own Mode. When a Tab is created, the Mode is auto-chosen (Open → Preview, New → Edit); the launch Tab (an empty Untitled Document) is Edit, and a file opened at launch is Preview. Afterwards the Mode Switcher sets only the Active Document's Mode, remembered for that Tab's session. Save As does not change the Mode. Modes are not persisted across launches (the app does not restore the previous session).

## Preview

**Native Preview**:
The renderer that draws the Preview View from the Document's Markdown without a webview or HTML/CSS engine. It renders CommonMark plus GFM tables, strikethrough, task lists, and footnotes; headings, paragraphs, emphasis, lists, blockquotes, rules, fenced code with syntax colors, inline code, images, and links. Raw HTML is not rendered.
_Avoid_: HTML preview, webview, browser view

## Performance

**Cold Start**:
The time from process start to the first presented frame in which the Active Document is readable. The 2.0 targets are p95 ≤ 200 ms on Windows, ≤ 250 ms on Linux, and, on macOS, ≤ 200 ms to window chrome and ≤ 250 ms to a readable document, with a warm page cache. Windows is the primary gate; macOS is validated before release.
_Avoid_: Launch time, startup time

**Lazy Edit**:
The guarantee that a Preview launch constructs no editor state. The editor initializes on the first switch to Edit Mode; the budget is ≤ 150 ms to a usable editor for a 100 KB document.
_Avoid_: Deferred loading, code splitting

## Sections

**Section**:
A collapsible region of the Preview View spanning one heading and everything under it until the next heading of the same or higher level. Every heading of any level — ATX (`#`) or Setext — starts a Section; content before the first heading belongs to no Section and is never collapsible. Headings nested inside lists or blockquotes do not start a Section. A Section is collapsed or expanded via a chevron in the heading's left margin; a heading with no content under it has no chevron. Collapsing a Section hides its entire subtree, including nested Sections. Collapse state is session-only per Tab, survives edits, re-renders, and Mode switches, and is not persisted across launches.
_Avoid_: fold, block group, outline

## Copying

**Copy-on-Select**:
The always-on Preview View behavior: when a mouse selection gesture ends (mouse-up after a drag, or a double-click selecting a word), the selected text is copied to the clipboard as plain text and confirmed by the Copy Toast near the cursor. Preview View only — selecting in the Editor View is an editing gesture and never copies. Keyboard copy (Ctrl/Cmd+C) copies natively and stays silent. No setting exists to turn it off.
_Avoid_: auto-copy, select-to-copy

**Copy Toast**:
The small transient label confirming a mouse-driven copy, shown near the cursor (below-right), fading after about 1.5 seconds, never intercepting clicks, and re-anchoring (not stacking) on repeated copies. Triggered by Copy-on-Select and the Code Copy Button; distinct from the app-wide bottom-center toast used for errors and status.
_Avoid_: notification, tooltip, popup

**Code Copy Button**:
The hover-revealed control in the top-right corner of every fenced code block in the Preview View. Copies the block's text content (trailing newline trimmed) as plain text and shows the Copy Toast at the click position. Keyboard-focusable.
_Avoid_: copy icon, clipboard button

## Appearance

**Theme**:
The appearance preference shown in the toolbar. Seven states: System (default) or one of six curated Palettes — Light (warm beige), House (cool paper with green-gray ink), Dark (deep navy), High Contrast (near-black), Nord (cool arctic blue-grey), or Terminal Green (green-on-black). A manual choice persists until changed.
_Avoid_: Color mode, dark mode toggle

**Palette**:
A concrete color scheme, one of the six: Light, House, Dark, High Contrast, Nord, or Terminal Green. System is a Theme but not a Palette. The Design language is shared across all Palettes.
_Avoid_: Theme (the seven-state preference; System is a Theme but not a Palette)

**Design language**:
The shared visual treatment of the app chrome: Helvetica Neue or its fallback, monospace uppercase micro-labels, hairline borders, and flat surfaces with no radius or shadow. It follows the alitools-pages House style. The Design language does not replace a Palette and does not control the Editor View or Preview View content fonts.
_Avoid_: look-and-feel, skin, theme

**System**:
The default Theme state. Not a Palette: it follows the OS live and resolves to the Light Palette for light mode or the Dark Palette for dark mode. House is an explicit Palette and is not selected by System.
_Avoid_: Auto theme, OS theme

**Text Size**:
The shared preference controlling how large text renders in the Editor View and the Preview View. Three choices — Small, Medium (default), Large — a single pick applies to both views.
_Avoid_: Font size (the typeface choice, not its size)

## File Lifecycle

**Untitled Document**:
A Document created by `New` or at first launch that has no canonical path. Multiple Untitled Documents may be open at once, disambiguated by a number (`Untitled.md`, `Untitled 2.md`, …). Numbering is derived from the open set: the next number is one past the highest currently open, or 1 when no Untitled Document is open — so the launch Tab's consumption by an Open frees its number. An empty Untitled Document that is the sole Tab is a placeholder: Open replaces it with the opened file rather than stacking a second Tab. Save behaves as Save As until it gains a path.
_Avoid_: New file, nameless file

**Externally-Modified**:
The state where the file on disk changed (mtime or content) since the Document was loaded or last saved. Checked for the Active Document on window focus and on Tab activation; a background Tab is only checked when it becomes Active, one dialog at a time. If the Document is Dirty the user chooses Reload / Overwrite / Cancel; if clean it reloads silently.
_Avoid_: File changed, stale file

## Export

**Export**:
Producing a standalone artifact from the Active Document's in-memory content — including Dirty changes; what you see is what you export. Export never modifies the Document and never triggers the Confirm-Discard Guard. Available in both Modes.
_Avoid_: save as PDF, download, share

**Print Export**:
Deferred to 2.1. The 2.0 app has no print path; when it returns, it will render a Print Render and hand it to the OS print dialog, where the user chooses Save-as-PDF (or a physical printer). The app never writes the PDF itself.
_Avoid_: PDF export (the PDF is one outcome of printing, not the feature), direct PDF export

**HTML Export**:
An Export that writes a self-contained `.html` file through the Save As flow — native save dialog, then the same write path as Save. Styles are embedded so the file renders correctly on its own. Local images are inlined as base64 data URLs at export time, read through the same Document-directory scope used for Preview images; remote image URLs pass through untouched; an unreadable or missing image is omitted, never failing the export.
_Avoid_: export page, HTML preview

**Print Render**:
An offscreen, full rendering of a Document's content via the same renderer as the Preview View, free of Preview-specific chrome: no Sections, no collapse state, no copy affordances. Identical Markdown → identical Export output regardless of the Preview View's current state.
_Avoid_: preview snapshot, printing the preview DOM

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
The modal opened by the toolbar's About button or `Ctrl/Cmd+/` (from either Mode) that shows the product name, the Version of the running Bundle, a link to the repository, and the Shortcuts Reference.
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
