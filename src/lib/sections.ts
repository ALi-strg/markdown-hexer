/// The shared DOM contract for Preview Pane Sections (see CONTEXT.md): the
/// renderer emits `.md-section` wrappers carrying `data-section-key`, a
/// `.md-chevron` toggle inside the head block, and a `.md-section-body` for
/// the content. Collapsed is the class below; every mutation site goes through
/// `setSectionCollapsed` so the scheme has one home.
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
