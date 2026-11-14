# 05 - Code panel contrast: a visible surface step

**What to build:** The fenced code block and inline code read as a separate
surface from the page at a glance, not only through the hairline border. Raise
the `code_bg`-against-`bg` floor from 1.2:1 to 1.45:1 in every Palette and
retune the syntax tokens the deeper (or higher) code surface pushes below
4.5:1.

**Type:** task

**Blocked by:** None - supersedes the contrast floor and starting values in
`03-code-background.md`.

**Status:** resolved

- [x] `code_bg` reaches at least 1.45:1 contrast against `bg` in Light, House,
      Dark, High Contrast, Nord, and Terminal Green.
- [x] Light `#E7DABF` → `#D3C7AE`, House `#D6E5E0` → `#C2D0CB`, Dark
      `#1B2942` → `#2A374D`, High Contrast `#1A1A1A` → `#2B2B2B`, Nord
      `#20262F` → `#4C566A`, Terminal Green `#16261A` → `#243327`.
- [x] Every syntax token reaches at least 4.5:1 on the new `code_bg`. Shared
      Light/House: comment and punctuation `#4A525B`, keyword `#A01720`,
      function `#5E31AD`; number `#0550AE` still passes. Dark comment
      `#9AA2AA`. Nord comment `#C5CDD8`, keyword `#BECFDF`, string `#C0D3B0`,
      number `#DAC7D6`, function `#ABD3DE`. Terminal Green comment `#4CAD68`.
      High Contrast needed no syntax change.
- [x] Nord's code surface turns lighter, not darker: a 1.45:1 step darker from
      `#2E3440` lands near black and loses the Palette's blue-grey character,
      while `#4C566A` is Nord's own Polar Night 4 and matches the Palette's
      chrome, which already sits above the page.
- [x] Inline code, the fenced frame, the corner radius, and the Copy button
      placement are unchanged. One `code_bg` token still drives both inline
      code and fenced blocks, and HTML Export follows it automatically.
- [x] Palette tests enforce the 1.45:1 floor; the stable Light token values and
      the Export stylesheet expectation are updated; all existing tests stay
      green (`cargo test --all-targets`, `cargo clippy --all-targets`,
      `cargo fmt --check`).
- [x] The README fixture and a scratch fixture with a paragraph, inline code,
      and a `rust` fence were rendered in all six Palettes and checked by eye.
- [x] No new token and no new dependency.

## Comments

Resolved on `main`. The 1.2:1 floor from ticket 03 was the smallest step that
counted as "different"; on screen it still read as the same paper with a box
drawn on it. 1.45:1 is the first step that reads as a separate surface in the
rendered fixture.

Two known gaps in this area, both older than this ticket and left alone:
selecting text *inside* a code block is nearly invisible in the light Palettes
because `selection` is tuned against `bg`, not `code_bg`; and the Copy label is
`muted`, which sits at about 3.2:1 on the Light code surface.
