import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { pickSavePath } from "../lib/saveDialog";
import { useUiStore } from "./ui";

const UNTITLED_FILENAME = "Untitled.md";
const APP_TITLE_SUFFIX = " — ALi-md-editor";
const SAVE_FAILED_MESSAGE = "Save failed — your changes are not on disk";
const OPEN_FAILED_MESSAGE = "Open failed — the file could not be read";

export const useDocumentStore = defineStore("document", () => {
  const content = ref("");
  const canonicalPath = ref<string | null>(null);
  const savedContent = ref("");

  const dirty = computed(() => content.value !== savedContent.value);

  const filename = computed(() => {
    if (canonicalPath.value === null) {
      return UNTITLED_FILENAME;
    }
    return canonicalPath.value.split(/[\\/]/).pop() ?? UNTITLED_FILENAME;
  });

  const title = computed(() => {
    const asterisk = dirty.value ? " *" : "";
    return `${filename.value}${asterisk}${APP_TITLE_SUFFIX}`;
  });

  function mirrorContent(text: string) {
    content.value = text;
  }

  async function writeToPath(path: string): Promise<boolean> {
    try {
      await invoke("save_document", { path, content: content.value });
    } catch (error) {
      const ui = useUiStore();
      ui.showToast(
        typeof error === "string" && error.length > 0
          ? `Save failed: ${error}`
          : SAVE_FAILED_MESSAGE,
      );
      return false;
    }
    canonicalPath.value = path;
    savedContent.value = content.value;
    useUiStore().setLastDirectory(path);
    return true;
  }

  async function save(): Promise<boolean> {
    if (canonicalPath.value === null) {
      return saveAs();
    }
    return writeToPath(canonicalPath.value);
  }

  async function saveAs(): Promise<boolean> {
    const ui = useUiStore();
    const path = await pickSavePath({
      defaultPath: canonicalPath.value ?? ui.lastDirectory ?? undefined,
    });
    if (path === null) {
      return false;
    }
    return writeToPath(path);
  }

  /// Swaps the current Document for a fresh Untitled Document.
  ///
  /// The caller runs the Confirm-Discard Guard first when the Document is Dirty.
  function newDocument() {
    content.value = "";
    canonicalPath.value = null;
    savedContent.value = "";
  }

  /// Reads a file from disk and swaps it into the current Document.
  ///
  /// On success the path becomes canonical, the title updates to the filename,
  /// and Dirty clears. A failed read keeps the current Document and surfaces the
  /// error as a toast. Returns whether the swap happened.
  async function openDocument(path: string): Promise<boolean> {
    let text: string;
    try {
      text = await invoke<string>("open_document", { path });
    } catch (error) {
      const ui = useUiStore();
      ui.showToast(
        typeof error === "string" && error.length > 0
          ? `Open failed: ${error}`
          : OPEN_FAILED_MESSAGE,
      );
      return false;
    }
    content.value = text;
    canonicalPath.value = path;
    savedContent.value = text;
    useUiStore().setLastDirectory(path);
    return true;
  }

  return {
    content,
    canonicalPath,
    dirty,
    filename,
    title,
    mirrorContent,
    save,
    saveAs,
    newDocument,
    openDocument,
  };
});
