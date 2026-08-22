import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useDocumentStore } from "./document";

export type LayoutMode = "split" | "preview" | "focus";

/// The canonical Layout Mode order, shared by the cycle shortcut and the
/// Layout Switcher segments so the two can never disagree.
export const LAYOUT_MODES: LayoutMode[] = ["split", "preview", "focus"];

const TOAST_DURATION_MS = 4000;

/// Window-level UI state. The Layout Mode is not app-wide: each Tab owns its
/// own mode (chosen when the Tab is created — New → Split View, Open →
/// Preview Only), and the window renders the Active Tab's mode. This store
/// only surfaces the Active Tab's mode for the window to render and lets the
/// Layout Switcher and the cycle shortcut mutate it; the mode itself lives on
/// the Tab record. Everything else here — divider, find overlay, toast,
/// last-used directory — is genuinely app-wide.
export const useUiStore = defineStore("ui", () => {
  const document = useDocumentStore();
  const dividerPosition = ref(0.5);
  const findOverlayOpen = ref(false);
  const lastDirectory = ref<string | null>(null);
  const toast = ref<string | null>(null);

  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  /// The Layout Mode the window renders: the Active Document's mode. The mode
  /// lives on the Active Tab's record, so switching Tabs changes what this
  /// reads and a mode set on one Tab never leaks into another.
  const layoutMode = computed<LayoutMode>(() => document.activeTab().layoutMode);

  /// Cycles the Active Document's Layout Mode through the canonical order.
  /// Only the Active Tab's record changes; every other Tab keeps its own mode.
  function cycleLayoutMode() {
    const index = LAYOUT_MODES.indexOf(layoutMode.value);
    document.activeTab().layoutMode =
      LAYOUT_MODES[(index + 1) % LAYOUT_MODES.length];
  }

  /// Sets the Active Document's Layout Mode directly from the Layout Switcher.
  /// Selecting the current mode changes nothing.
  function setLayoutMode(next: LayoutMode) {
    if (next === layoutMode.value) {
      return;
    }
    document.activeTab().layoutMode = next;
  }

  /// Makes the source visible so searching or replacing never works blind:
  /// Preview Only gives way to Split View (the Editor Pane is hidden there, so
  /// match highlighting and scroll-to-match would be impossible), while
  /// source-visible modes are unchanged. The switch is a one-off accommodation
  /// on the Active Document.
  function showSource() {
    if (layoutMode.value === "preview") {
      document.activeTab().layoutMode = "split";
    }
  }

  function showToast(message: string) {
    toast.value = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.value = null;
      toastTimer = undefined;
    }, TOAST_DURATION_MS);
  }

  function setLastDirectory(path: string) {
    const parts = path.split(/[\\/]/);
    parts.pop();
    lastDirectory.value = parts.join("/") || null;
  }

  return {
    layoutMode,
    dividerPosition,
    findOverlayOpen,
    lastDirectory,
    toast,
    cycleLayoutMode,
    setLayoutMode,
    showSource,
    showToast,
    setLastDirectory,
  };
});
