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
