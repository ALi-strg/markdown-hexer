# 04 — Rename to Markdown-Magic + light theme palette

**What to build:** The product renamed to **Markdown-Magic** on every surface — window title suffix, the HTML title, Tauri `productName` and identifier (`com.markdownmagic.editor`), Cargo metadata, docs, release notes, e2e assertions, and the localStorage key prefixes (`markdownmagic:`). The window title format stays `<filename> — Markdown-Magic` with the Dirty asterisk and Untitled behavior unchanged, and the repo slug is not renamed. At the same time the Light theme is repaletted through its CSS variables to a warm beige background with dark brown text and sienna accents (links, caret, selection, active layout segment), leaving the Dark theme and the System-follows-dark palette untouched. A one-time localStorage settings reset after the key change is accepted — no migration.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] The window title reads `<filename> — Markdown-Magic` with the Dirty asterisk and Untitled Documents unchanged
- [ ] No user-visible or build surface still says ALi-md-editor: product name, Tauri productName and identifier `com.markdownmagic.editor`, HTML title, Cargo metadata, README/PRD/domain docs, release-note bodies
- [ ] localStorage keys use the `markdownmagic:` prefix for settings and e2e stubs
- [ ] The Light theme renders a warm beige background, dark brown text, and sienna accents
- [ ] The Dark theme and the System-follows-dark palette are unchanged
- [ ] e2e title assertions are updated to the Markdown-Magic suffix
- [ ] A computed-style assertion verifies the Light palette actually reaches the DOM (background and text colors)

## Notes

This is one mechanical change applied across source, config, docs, and tests together so the tree stays green as a unit — no coexistence period needed. The identifier change registers existing installs as a new app on the OS; acceptable at 0.1.0 with a single user.
