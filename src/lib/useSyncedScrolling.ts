import type { LayoutMode } from "../stores/ui";
import {
  computeBlockRanges,
  findBlockIndexForLine,
  type BlockRange,
} from "./blockMap";

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

  return { attach, detach, sync };
}
