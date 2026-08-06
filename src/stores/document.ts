import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { pickSavePath } from "../lib/saveDialog";
import { pickExternalModificationChoice } from "../lib/externalDialog";
import { useUiStore } from "./ui";

const UNTITLED_FILENAME = "Untitled.md";
const APP_TITLE_SUFFIX = " — ALi-md-editor";
const SAVE_FAILED_MESSAGE = "Save failed — your changes are not on disk";
const OPEN_FAILED_MESSAGE = "Open failed — the file could not be read";

export const useDocumentStore = defineStore("document", () => {
  const content = ref("");
  const canonicalPath = ref<string | null>(null);
  const savedContent = ref("");
  const diskContent = ref<string | null>(null);

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

  /// Tells the Rust `asset://` protocol which directory to scope image serving
  /// to. Called whenever the Document's canonical path changes so relative
  /// image paths always resolve against the current Document's directory.
  function syncAssetRoot() {
    void invoke("set_asset_root", { documentPath: canonicalPath.value });
  }

  /// Writes `text` to `path`, surfacing a failure as a toast. Does not update
  /// the Document's path, Dirty state, or Externally-Modified baseline.
  async function writeToDisk(path: string, text: string): Promise<boolean> {
    try {
      await invoke("save_document", { path, content: text });
      return true;
    } catch (error) {
      const ui = useUiStore();
      ui.showToast(
        typeof error === "string" && error.length > 0
          ? `Save failed: ${error}`
          : SAVE_FAILED_MESSAGE,
      );
      return false;
    }
  }

  async function writeToPath(path: string): Promise<boolean> {
    if (!(await writeToDisk(path, content.value))) {
      return false;
    }
    canonicalPath.value = path;
    savedContent.value = content.value;
    diskContent.value = content.value;
    syncAssetRoot();
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
    diskContent.value = null;
    syncAssetRoot();
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
    diskContent.value = text;
    syncAssetRoot();
    useUiStore().setLastDirectory(path);
    return true;
  }

  /// Replaces the Document with the on-disk version, treating it as the new
  /// saved baseline so Dirty clears and the change is not re-detected.
  function reloadFrom(text: string) {
    content.value = text;
    savedContent.value = text;
    diskContent.value = text;
  }

  /// Writes the current content over the Document's file without clearing
  /// Dirty: an Overwrite resolves the conflict but is not a Save.
  async function overwriteToDisk(): Promise<boolean> {
    if (canonicalPath.value === null) {
      return false;
    }
    if (!(await writeToDisk(canonicalPath.value, content.value))) {
      return false;
    }
    diskContent.value = content.value;
    return true;
  }

  /// Detects an Externally-Modified file on window focus.
  ///
  /// Compares the on-disk content against the state seen at load/save time. A
  /// clean Document reloads silently; a Dirty Document asks the user for
  /// Reload / Overwrite / Cancel. Returns whether the Document content was
  /// replaced by a reload (silent or chosen), so the caller can push it into
  /// the editor.
  async function checkExternalModification(): Promise<boolean> {
    if (canonicalPath.value === null) {
      return false;
    }
    let state: { content: string };
    try {
      state = await invoke<{ content: string }>("inspect_document", {
        path: canonicalPath.value,
      });
    } catch {
      return false;
    }
    if (state.content === diskContent.value) {
      return false;
    }
    if (!dirty.value) {
      reloadFrom(state.content);
      return true;
    }
    const choice = await pickExternalModificationChoice(filename.value);
    if (choice === "reload") {
      reloadFrom(state.content);
      return true;
    }
    if (choice === "overwrite") {
      await overwriteToDisk();
    }
    return false;
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
    checkExternalModification,
  };
});
