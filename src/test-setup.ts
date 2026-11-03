// Node 26 defines a built-in `localStorage` that is disabled without
// --localstorage-file. Vitest only copies jsdom globals that Node does not
// already define, so the browser Storage never reaches the tests there.
const nativeStorage = (() => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
})();
if (!nativeStorage) {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    key: (index) => [...store.keys()][index] ?? null,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
}

const emptyRect: DOMRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
} as DOMRect;

const emptyRectList: DOMRectList = {
  length: 0,
  item: () => emptyRect,
  [Symbol.iterator]: () => [][Symbol.iterator](),
};

Range.prototype.getClientRects = () => emptyRectList;
Range.prototype.getBoundingClientRect = () => emptyRect;

Element.prototype.getClientRects ||= () => emptyRectList;
Element.prototype.getBoundingClientRect ||= () => emptyRect;
