# 01 - Section hierarchy: heading scale and separator rules

**What to build:** Open a long README in the Preview View. Headings form a clear size ladder, and a hairline rule marks the start of each Section at levels 1–3. The first content block has no leading rule; H4–H6 rely on size. The rule uses the active Palette and the heading sizes follow the Text Size preference.

**Type:** task

**Blocked by:** None - can start immediately.

**Status:** resolved

- [x] Preview Heading is 1.6× Preview Body. Section headings use the Native Preview's level factors in order: H1 = Heading, H2–H6 = Body + (Heading − Body) × 0.835 / 0.668 / 0.501 / 0.334 / 0.167. At Medium the ladder is 24 / 22.5 / 21 / 19.5 / 18 / 16.5 px.
- [x] Section headings match headings rendered inside Section bodies; the one-level-low mapping is gone.
- [x] A 1 px `border` rule sits above each Section heading of level 1–3, with about 20 px above and 8 px below, spanning the content width.
- [x] The first content block has no rule when it is a Section and no renderable preamble content precedes it (link-reference or footnote definitions alone do not count); a first Section after a renderable preamble still gets a rule.
- [x] H4–H6 have no rule. Deep nesting does not add more lines.
- [x] A collapsed Section keeps its heading and rule; child rules disappear with the hidden subtree.
- [ ] The rule is visible in all six Palettes, including High Contrast, using tokens only.
- [x] Heading sizes scale with Small, Medium, and Large Text Size.
- [x] HTML Export output is unchanged: no rules, same heading markup.
- [x] The pure level-size helper is unit-tested for H1–H6 at all Text Sizes. The Preview content-style test asserts 1.6× Body and no chrome leak. Existing Section kittest tests stay green.
- [ ] The README fixture is checked manually in Light, House, Dark, High Contrast, Nord, and Terminal Green.

## Comments

Resolved on `preview-polish` (merge `075649a`; code review fixes `c793a0e`).
`cargo test --all-targets` 247 passed; clippy and fmt clean. The six-Palette
visual pass remains for reviewer confirmation.
