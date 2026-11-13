# 03 - Code background: distinct in every Palette

**What to build:** Inline code and fenced code blocks sit on a code background clearly different from the page in every Palette, while syntax text stays readable. The fenced block keeps its hairline border, the scrollbar track keeps the page background, and HTML Export uses the same code background.

**Type:** task

**Blocked by:** None - can start immediately.

**Status:** resolved

- [x] `code_bg` reaches at least 1.2:1 contrast against `bg` in Light, House, Dark, High Contrast, Nord, and Terminal Green.
- [x] Starting values: Light `#E7DABF`, House `#D6E5E0`, Dark `#1B2942`, High Contrast `#1A1A1A`, Nord `#20262F`, Terminal Green `#16261A`. Values may move as long as the 1.2:1 floor and the syntax floor hold.
- [x] Every syntax token reaches at least 4.5:1 on `code_bg`. The shared Light/House comment and function tokens are retuned (`#565F69`, `#6C39C4`); the other four already pass.
- [x] Inline code and fenced code blocks share the same `code_bg` token; the 1 px border is kept; the code block corner radius is unchanged.
- [x] The scrollbar track no longer inherits `code_bg`; it uses the page background.
- [x] HTML Export's code background matches the Preview.
- [x] Palette unit tests enforce the 1.2:1 code-vs-page floor and the 4.5:1 syntax floor; the stable Light token values are updated; all existing tests stay green.
- [ ] The README fixture is checked manually in all six Palettes, and one HTML Export is opened in a browser.
- [x] No new token and no new dependency.

## Comments

Resolved on `preview-polish` (merge `f0d5b79`; code review fixes `c793a0e`).
The code-review pass refreshed `docs/visual-checklist.md` to the new token
values and aligned the rest of its tables. The manual six-Palette and browser
checks remain for reviewer confirmation.
