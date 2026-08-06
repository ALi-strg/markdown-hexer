import { defineStore } from "pinia";
import { computed, ref } from "vue";

const UNTITLED_FILENAME = "Untitled.md";
const APP_TITLE_SUFFIX = " — ALi-md-editor";

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

  return { content, canonicalPath, dirty, filename, title, mirrorContent };
});
