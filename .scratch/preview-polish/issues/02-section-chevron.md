# 02 - Section chevron: painted disclosure triangle

**What to build:** Replace the monospace `v` / `>` in the Section heading's left margin with a painted disclosure triangle. It points right when collapsed and down when expanded, is always visible on Sections with content, and is muted at rest and ink on hover/focus. The 16 px-wide hit area, focus ring, accessible labels, keyboard toggle, heading-click toggle, and per-Document session collapse state stay as they are.

**Type:** task

**Blocked by:** None - can start immediately.

**Status:** resolved

- [x] The Section Chevron is painted, not a text glyph, so it never depends on a font.
- [x] It points right when collapsed and down when expanded, centred in the existing 16 px-wide frameless control (egui floors the height at 20 px).
- [x] It is always visible for Sections with content and absent for headings with no content under them.
- [x] It is muted at rest and ink on hover/focus; the focus ring is unchanged.
- [x] The accessible label stays "Expand section" / "Collapse section"; the heading keeps its level and expanded state.
- [x] Mouse click, Enter/Space, and heading click toggle the Section; collapse state stays per Document and session-only.
- [x] No animation and no new dependency.
- [ ] The existing Section kittest tests stay green. The triangle is checked manually in all six Palettes.
- [x] The `Section Chevron` glossary entry stays accurate.

## Comments

Resolved on `preview-polish` (merge `6cd58cd`; code review fixes `c793a0e`).
`cargo test --all-targets` 247 passed; clippy and fmt clean. The six-Palette
manual check remains for reviewer confirmation.
