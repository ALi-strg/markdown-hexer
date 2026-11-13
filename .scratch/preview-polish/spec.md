# Preview visual polish (2.0)

Status: resolved

Implemented on `preview-polish` at `c793a0e` (code review fixes merged).

Decisions settled in a grilling session on 2026-11-13. Vocabulary follows
`GLOSSARY.md`: **Preview** (the Mode), **Preview View**, **Section**,
**Section Chevron**, **Palette**, **Theme**, **Text Size**, **Design language**.

## Problem Statement

A reader opening a long Markdown document in the Preview View sees a nearly flat
page. Section starts are hard to find: an H2 heading is only about 17 px against
a 15 px body, the type ladder is compressed, and nothing separates one Section
from the next. The control that should reveal the structure is a monospace
`v` / `>` that reads as a typo rather than a disclosure control.

In the OS chrome, the window title bar shows egui's placeholder icon while the
taskbar and Explorer show the product icon, so the app looks unfinished in the
one place every window shows.

Code surfaces are nearly the same colour as the page in several Palettes
(1.05–1.15:1 contrast), so inline code and fenced code blocks do not read as
code, especially in dark Palettes.

## Solution

Give the Preview View a clear Section hierarchy:

- a visible heading type ladder, with H1–H6 clearly stepped above body text;
- a hairline separator above Section headings at levels 1–3;
- a painted disclosure triangle in place of the text chevron;
- a Palette-specific code background that is clearly distinct from the page
  while keeping syntax text readable;
- the product icon in the window title bar, taken from the bundled icon set.

All colours stay Palette tokens, all existing behaviour stays the same, and the
Preview's reading width stays the full window width.

## User Stories

1. As a reader, I want a clear visual break before each Section, so that I can see where a new topic starts without hunting for the heading.
2. As a reader, I want H1–H6 to have an obvious size hierarchy, so that I can scan the document's structure.
3. As a reader, I want that hierarchy to scale with Text Size, so that it stays proportionate at Small, Medium, and Large.
4. As a reader, I want the first content block to start without a stray rule, so that the document begins cleanly.
5. As a reader, I want the separator to use the active Palette's border token, so that it looks native in every Theme.
6. As a reader, I want separators above H3 Sections as well, so that nested topics are as clear as top-level ones.
7. As a reader, I want H4–H6 to stand apart by size without extra rules, so that deep nesting does not become a wall of lines.
8. As a reader, I want a collapsed Section to keep its heading and separator, so that the document's skeleton stays visible.
9. As a reader, I want the Section Chevron to look like a disclosure control rather than a letter "v", so that I know the Section can be folded.
10. As a reader, I want the Section Chevron always visible on Sections with content, so that I do not have to hover to discover it.
11. As a reader, I want the triangle to point right when collapsed and down when expanded, so that the state is unambiguous.
12. As a reader, I want the Section Chevron muted at rest and stronger on hover/focus, so that it does not compete with the heading.
13. As a keyboard-first user, I want the Section Chevron focusable and toggled with Enter/Space, so that I can fold Sections without a mouse.
14. As a screen-reader user, I want the Section Chevron to keep "Expand section" / "Collapse section" and the heading to expose its level and expanded state, so that the structure is announced.
15. As a reader, I want the triangle painted rather than taken from a font, so that it never appears as tofu.
16. As a reader, I want inline code and fenced code blocks to sit on a background clearly different from the page in every Palette, so that code is easy to spot.
17. As a reader, I want syntax colours to stay readable on the new code background, so that highlighting does not become decoration.
18. As a reader, I want fenced code blocks to keep their hairline border, so that the block edge stays crisp.
19. As a reader, I want the scrollbar track to keep the page background rather than the code background, so that the stronger code fill does not tint the scrollbar.
20. As an author, I want HTML Export to use the same code background, so that the exported artifact matches the Preview I proofread.
21. As a Light or House user, I want the retuned syntax colours to stay distinct, so that code remains readable in those Palettes.
22. As a Windows user, I want the product icon in the window title bar, so that it matches the taskbar and Explorer.
23. As a Windows user, I want the same icon in Alt-Tab, so that the app is recognisable when switching windows.
24. As a Linux user, I want the product icon as the window icon, so that the desktop associates the window with the app.
25. As a macOS user running a dev build, I want the Dock icon to be the product icon, so that it matches what a shipped bundle shows.
26. As a user, I want the icon decoded before the window appears without a startup delay, so that Cold Start stays within budget.
27. As a High Contrast user, I want the separator, triangle, and code background to stay visible, so that the polish does not regress accessibility.
28. As a reader, I want the Preview reading width to stay the full window width, so that my documents do not reflow unexpectedly.
29. As a user, I want Section collapse state, per-Tab state, Copy-on-Select, and the Code Copy Button to behave as they do today, so that the visual change has no behavioural side effects.
30. As a collaborator, I want the changes pinned by palette and Preview tests, so that regressions are caught without pixel diffs.

## Implementation Decisions

- **Preview heading hierarchy.** The Preview `Heading` text style is 1.6×
  the Preview Body size. At Medium (Body 15) that is 24 px; Small (13) gives
  20.8; Large (17) gives 27.2. It stays scoped to the Preview View and does not
  change app chrome.
- **Section heading scale.** Section heading sizes use the Native Preview's
  level factors in the correct order: H1 = Heading, H2 = Body + (Heading − Body)
  × 0.835, H3 × 0.668, H4 × 0.501, H5 × 0.334, H6 × 0.167. This removes the
  current one-level-low mapping. At Medium the ladder is 24 / 22.5 / 21 / 19.5 /
  18 / 16.5 px. Section headings use this helper; it mirrors the factors used
  by the Native Preview's body renderer (`egui_commonmark_backend` 0.26), so one
  Markdown level looks the same everywhere. The factors are pinned by a test; a
  dependency update must revisit them.
- **No bold dependency.** egui has no bold face loaded; `.strong()` changes
  text colour only. The hierarchy is carried by size and spacing, not weight.
- **Section separator.** A 1 px rule in the active Palette's `border` token
  sits above each Section heading of level 1–3, with about 20 px above and 8 px
  below (egui item spacing adds a few pixels). It spans the Preview View's
  content width. The first content block gets no rule when it is a Section and
  no renderable preamble content precedes it (link-reference or footnote
  definitions alone do not count); if a renderable preamble exists, the first
  Section still gets a rule. H4–H6 have no rule and rely on size. A
  collapsed Section keeps its rule; child rules disappear with the hidden
  subtree. The rule is painted chrome, not a Markdown horizontal rule, and never
  appears in HTML Export.
- **Section Chevron.** Replace the monospace glyph with egui's built-in painted
  disclosure triangle in the existing 16 px-wide frameless button (egui floors
  the height at 20 px). It points right
  when collapsed and down when expanded, is centred in the control, muted at
  rest, and ink on hover/focus. The focus ring, accessible labels, heading-click
  toggle, keyboard toggle, and per-Document session collapse state stay
  unchanged. No animation, no font glyph, no new dependency.
- **Code background.** Keep one `code_bg` token for inline code and fenced
  blocks. Every Palette's `code_bg` must reach at least 1.2:1 contrast against
  `bg`. Starting values: Light `#E7DABF`, House `#D6E5E0`, Dark `#1B2942`, High
  Contrast `#1A1A1A`, Nord `#20262F`, Terminal Green `#16261A`. Dark, High
  Contrast, and Terminal Green use a lighter code surface; Light, House, and
  Nord use a darker one.
- **Light/House syntax retune.** The shared Light and House syntax set is
  retuned so every token stays at least 4.5:1 on the new code background:
  comment `#565F69`, function `#6C39C4`; the other four tokens already pass.
  The tokens are shared with the Editor View, so its syntax colours change as a
  consequence; accepted.
- **Scrollbar decoupling.** `visuals.extreme_bg_color` is set to the page
  background instead of `code_bg`, so the scrollbar track does not inherit the
  stronger code fill.
- **HTML Export.** The code background CSS variable follows the `code_bg`
  token automatically. Export markup, typography, and Section chrome are
  unchanged.
- **Window icon.** Decode the bundled 128×128 PNG at compile time and pass it
  to the viewport builder before the window is created. Use eframe's PNG helper
  with the existing image dependency. Add the PNG to the build script's rerun
  list. Keep the exe icon resource for Explorer, the taskbar, and
  `MarkdownHexer.Document.DefaultIcon`. On Windows, the viewport icon sets both
  small and big window icons, fixing the title bar and Alt-Tab while the taskbar
  keeps the exe icon. On Linux it sets the window icon. On macOS the shipped
  bundle keeps its `.icns`; a dev build gets the viewport icon where supported.
- **Icon seam.** The icon loader lives in a small library module so the PNG
  decode can be unit-tested; the binary consumes it.
- **Constraints.** Colours only from Palette tokens. No new dependencies. No
  reading-width change. No change to Section collapse semantics, Copy-on-Select,
  Code Copy Button, or HTML Export typography. ADR 0011 (flat, hairline, no
  radius/shadow) and ADR 0016 (Native Preview subset, Sections, Palette-driven
  styling) still govern.

## Testing Decisions

Good tests assert the design contract and external behaviour: Palette contrast
ratios, the Preview heading scale, Section toggle behaviour and accessibility,
and the embedded icon decoding. No pixel diffs, no assertions on paint calls or
internal widget structure.

- **Palette token seam (unit tests).** The existing Palette tests gain a
  `code_bg` vs `bg` minimum of 1.2:1 for all six Palettes, keep the existing
  4.5:1 syntax-on-code assertion, and update the stable Light token values.
  This is the external design contract, not an implementation detail.
- **Preview style seam (unit + kittest).** The existing Preview content-style
  test asserts Heading = 1.6 × Body and that the style does not leak into
  chrome. A small pure level-size helper is unit-tested for H1–H6 at Small,
  Medium, and Large, including the off-by-one this change fixes. This is the
  only new automated seam for the typography.
- **Section behaviour seam (existing kittest).** The existing Section tests
  cover toggle by mouse, keyboard, and heading click, label/role, heading level,
  expanded state, and per-Document/Tab collapse state. They stay green with the
  painted triangle; no test asserts the triangle's pixels.
- **Icon seam (unit test).** The library icon loader is unit-tested to decode
  the bundled PNG into a 128×128 non-empty RGBA image. The native title bar is
  checked manually because kittest does not create the OS window.
- **Manual visual seam.** Check the README fixture in Light, House, Dark, High
  Contrast, Nord, and Terminal Green, plus an HTML Export in a browser. Cover
  the first-block exception, a nested H3, a collapsed parent, inline code, and a
  fenced block. There is no screenshot generator; ADR 0016's fidelity bar is a
  real README fixture checked in every Palette.
- **No new integration seam.** The existing Preview kittest harness is the
  highest Preview seam and carries the Section behaviour. The pure heading-size
  helper and the icon module are small, side-effect-free unit seams.

## Out of Scope

- A maximum content width or centred reading column. The current window-width
  reading width is correct and stays.
- Styling changes for tables, blockquotes, lists, task lists, footnotes,
  images, or links.
- Chevron animation or Section collapse animation.
- Adding a Markdown horizontal rule or changing rendered Markdown output.
- HTML Export markup, typography, or Section chrome.
- Editor View chrome or background changes. The shared Light/House syntax token
  change is the only editor-visible consequence.
- The macOS bundle icon (`icon.icns`) and the Windows exe/taskbar/Explorer
  resource, which already show the product icon.
- Print Export and PDF.
- Screenshot generation or pixel-diff tooling.
- New Palettes or Themes, and new dependencies.

## Further Notes

- The **Section Chevron** term is added to `GLOSSARY.md` under Sections during
  this spec step; the Section entry now points at it.
- The manual six-Palette visual pass and the Windows title-bar/Alt-Tab check
  remain a human review step; the automated checks are green on `c793a0e`.
- No new ADR: these are reversible visual decisions with no surprising
  architecture trade-off. ADR 0011 and ADR 0016 still govern.
- Four tickets, no blocking edges. 01 and 02 both touch the Section heading
  row; if separate agents take them, land 01 first to reduce rebase noise. That
  is a recommended order, not a blocker.
- The screenshot that prompted this work was the House Palette. The changes
  must not be tuned to House alone; High Contrast and the dark Palettes are
  first-class checks.
- The code block's corner radius is unchanged. The Design language's no-radius
  rule applies to app chrome; code blocks are content.
