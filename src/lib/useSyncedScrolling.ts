import type { LayoutMode } from "../stores/ui";
import {
  computeBlockRanges,
  findBlockIndexForLine,
  type BlockRange,
} from "./blockMap";
import { setSectionCollapsed, SECTION_COLLAPSED_CLASS } from "./sections";

export interface SyncedScrollingView {
  lineBlockAtHeight(height: number): { from: number };
  state: { doc: { lineAt(pos: number): { number: number } } };
  scrollDOM: HTMLElement;
}

export interface SyncedScrollingDeps {
  getView: () => SyncedScrollingView | null;
  getPreviewHost: () => HTMLElement | null;
  getLayoutMode: () => LayoutMode;
  getSource: () => string;
  /// Reports the Sections that were auto-expanded so the caller can drop them
  /// from the Tab's collapsed state.
  expandSections?: (keys: string[]) => void;
}

export function useSyncedScrolling(deps: SyncedScrollingDeps) {
  let lastSource: string | null = null;
  let lastRanges: BlockRange[] = [];
  let scroller: HTMLElement | null = null;
  let scrollHandler: (() => void) | null = null;

  function getRanges(): BlockRange[] {
    const source = deps.getSource();
    if (source !== lastSource) {
      lastRanges = computeBlockRanges(source);
      lastSource = source;
    }
    return lastRanges;
  }

  /// Auto-expands every collapsed Section wrapping `block` — a scroll target
  /// inside a collapsed Section is invisible, so its Sections open first — and
  /// reports the expanded keys so the Tab's state stays in step.
  function expandCollapsedAncestors(block: HTMLElement) {
    const keys: string[] = [];
    let section =
      block.parentElement?.closest<HTMLElement>(".md-section") ?? null;
    while (section !== null) {
      if (section.classList.contains(SECTION_COLLAPSED_CLASS)) {
        setSectionCollapsed(section, false);
        const key = section.dataset.sectionKey;
        if (key !== undefined) {
          keys.push(key);
        }
      }
      section = section.parentElement?.closest<HTMLElement>(".md-section") ?? null;
    }
    if (keys.length > 0) {
      deps.expandSections?.(keys);
    }
  }

  /// Expands every collapsed Section wrapping the block containing the editor
  /// position `pos` — Find & Replace navigates to matches, and a match inside
  /// a collapsed Section must surface even when the editor's own
  /// scrollIntoView is a no-op (already visible) and fires no scroll event.
  /// Does not scroll the Preview Pane: the editor scroll drives Synced
  /// Scrolling as usual.
  function expandToPos(view: SyncedScrollingView, pos: number) {
    const host = deps.getPreviewHost();
    if (!host) return;

    const ranges = getRanges();
    if (ranges.length === 0) return;

    const line = view.state.doc.lineAt(pos).number - 1;
    const blockIndex = findBlockIndexForLine(ranges, line);
    const block = host.querySelector(`[data-block-index="${blockIndex}"]`);
    if (!(block instanceof HTMLElement)) return;

    expandCollapsedAncestors(block);
  }

  function sync(view: SyncedScrollingView | null = deps.getView()) {
    const host = deps.getPreviewHost();
    if (!view || !host) return;
    if (deps.getLayoutMode() !== "split") return;

    const ranges = getRanges();
    if (ranges.length === 0) return;

    const topBlock = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
    const line = view.state.doc.lineAt(topBlock.from).number - 1;
    const blockIndex = findBlockIndexForLine(ranges, line);
    const block = host.querySelector(`[data-block-index="${blockIndex}"]`);
    if (!(block instanceof HTMLElement)) return;

    expandCollapsedAncestors(block);

    host.scrollTop =
      block.getBoundingClientRect().top -
      host.getBoundingClientRect().top +
      host.scrollTop;
  }

  function attach() {
    const view = deps.getView();
    if (!view) return;
    scroller = view.scrollDOM;
    scrollHandler = () => sync();
    scroller.addEventListener("scroll", scrollHandler, { passive: true });
  }

  function detach() {
    if (scroller && scrollHandler) {
      scroller.removeEventListener("scroll", scrollHandler);
    }
    scroller = null;
    scrollHandler = null;
  }

  return { attach, detach, sync, expandToPos };
}
