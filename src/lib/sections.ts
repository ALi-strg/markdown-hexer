import { type Token, type Tokens } from "marked";

/// The shared DOM contract for Preview Pane Sections (see CONTEXT.md): the
/// renderer emits `.md-section` wrappers carrying `data-section-key`, a
/// `.md-chevron` toggle (the ▸ glyph as a real text node) inside the head
/// block, and a `.md-section-body` for the content. Collapsed is the class
/// below; every build, query, and mutation site lives in this module.
export const SECTION_COLLAPSED_CLASS = "md-section-collapsed";

/// Applies a Section's collapsed state: flips the class (CSS hides the body,
/// whole subtree included) and mirrors it onto the chevron for assistive tech.
export function setSectionCollapsed(
  section: HTMLElement,
  collapsed: boolean,
): void {
  section.classList.toggle(SECTION_COLLAPSED_CLASS, collapsed);
  section
    .querySelector(".md-chevron")
    ?.setAttribute("aria-expanded", String(!collapsed));
}

/// The Section in `host` carrying the key `key`, or null. Sections are matched
/// by key so collapse state survives edits that shift block positions.
export function sectionByKey(
  host: HTMLElement,
  key: string,
): HTMLElement | null {
  return host.querySelector<HTMLElement>(
    `.md-section[data-section-key="${CSS.escape(key)}"]`,
  );
}

/// Re-applies collapsed state for every key after a render.
export function applyCollapsedSections(
  host: HTMLElement,
  keys: readonly string[],
): void {
  for (const key of keys) {
    const section = sectionByKey(host, key);
    if (section !== null) {
      setSectionCollapsed(section, true);
    }
  }
}

/// Toggles the Section a chevron click landed in: flips the collapsed state
/// and reports it so the caller can record it on the Tab (store interaction
/// stays out of this module). Returns null when the click missed a Section.
export function toggleSection(
  chevron: HTMLElement,
): { key: string; collapsed: boolean } | null {
  const section = chevron.closest(".md-section");
  if (!(section instanceof HTMLElement)) {
    return null;
  }
  const collapsed = !section.classList.contains(SECTION_COLLAPSED_CLASS);
  setSectionCollapsed(section, collapsed);
  const key = section.dataset.sectionKey;
  if (key === undefined) {
    return null;
  }
  return { key, collapsed };
}

/// Escapes a Section key for use inside a double-quoted HTML attribute.
function escAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/// Whether the Section starting at the heading `blockTokens[start]` (level
/// `level`) contains anything to collapse: any non-heading block until the
/// next heading of the same or higher level. A contentless heading (immediately
/// followed by another heading, or ending the Document) gets no Section.
function subtreeHasContent(
  blockTokens: Token[],
  start: number,
  level: number,
): boolean {
  for (let i = start + 1; i < blockTokens.length; i++) {
    const token = blockTokens[i];
    if (token.type !== "heading") {
      return true;
    }
    if ((token as Tokens.Heading).depth <= level) {
      return false;
    }
  }
  return false;
}

interface SectionFrame {
  level: number;
  key: string;
  head: string;
  body: string[];
}

function renderSection(frame: SectionFrame): string {
  return (
    `<div class="md-section" data-section-key="${escAttr(frame.key)}">` +
    frame.head +
    `<div class="md-section-body">${frame.body.join("")}</div>` +
    `</div>`
  );
}

function headBlock(blockIndex: number, headingHtml: string): string {
  return (
    `<div class="md-block md-section-head" data-block-index="${blockIndex}">` +
    `<button type="button" class="md-chevron" aria-label="Toggle section" aria-expanded="true">\u25B8</button>` +
    `${headingHtml}</div>`
  );
}

function blockDiv(blockIndex: number, html: string): string {
  return `<div class="md-block" data-block-index="${blockIndex}">${html}</div>`;
}

/// Wraps the kept blocks of a rendered Document into Sections: every heading
/// starts one, spanning until the next heading of the same or higher level, so
/// collapsing a heading hides its whole subtree. Keys disambiguate duplicate
/// headings by occurrence (h1:A#2). `renderTokenHtml` renders one token's
/// inner HTML (the lexer/highlight/parser side stays with the renderer); this
/// module owns the Section markup around it.
export function wrapSections(
  blockTokens: Token[],
  renderTokenHtml: (token: Token) => string,
): string {
  const root: string[] = [];
  const stack: SectionFrame[] = [];
  const occurrences = new Map<string, number>();
  const append = (html: string) => {
    if (stack.length === 0) {
      root.push(html);
    } else {
      stack[stack.length - 1].body.push(html);
    }
  };
  blockTokens.forEach((token, index) => {
    const html = renderTokenHtml(token);
    if (token.type === "heading") {
      const heading = token as Tokens.Heading;
      while (stack.length > 0 && stack[stack.length - 1].level >= heading.depth) {
        append(renderSection(stack.pop()!));
      }
      if (subtreeHasContent(blockTokens, index, heading.depth)) {
        const base = `h${heading.depth}:${heading.text}`;
        const occurrence = (occurrences.get(base) ?? 0) + 1;
        occurrences.set(base, occurrence);
        stack.push({
          level: heading.depth,
          key: `${base}#${occurrence}`,
          head: headBlock(index, html),
          body: [],
        });
        return;
      }
      append(blockDiv(index, html));
      return;
    }
    append(blockDiv(index, html));
  });
  while (stack.length > 0) {
    append(renderSection(stack.pop()!));
  }
  return root.join("");
}
