import type { EditorState } from "@codemirror/state";
import { getSearchQuery } from "@codemirror/search";

export interface MatchInfo {
  index: number;
  total: number;
}

export interface MatchRange {
  from: number;
  to: number;
}

/// Reports how many matches the current search query has in `state` and which
/// of them `target` (or the main selection when `target` is null) points into
/// (1-based), or `null` when the query is empty or has no matches.
export function computeMatchInfo(
  state: EditorState,
  target: MatchRange | null = null,
): MatchInfo | null {
  const query = getSearchQuery(state);
  if (!query.valid) {
    return null;
  }
  const selection = state.selection.main;
  const cursor = query.getCursor(state);
  let total = 0;
  let index = -1;
  let match = cursor.next();
  while (!match.done) {
    total++;
    const current = match.value;
    if (target === null) {
      if (current.from <= selection.from && selection.from <= current.to) {
        index = total;
      }
    } else if (current.from === target.from && current.to === target.to) {
      index = total;
    }
    match = cursor.next();
  }
  if (total === 0 || index === -1) {
    return null;
  }
  return { index, total };
}

/// The first match of the current query starting at or after `pos`, wrapping
/// to the document start, or `null` when the query has no matches.
export function nextMatchAfter(
  state: EditorState,
  pos: number,
): MatchRange | null {
  const query = getSearchQuery(state);
  if (!query.valid) {
    return null;
  }
  const cursor = query.getCursor(state, pos);
  let match = cursor.next();
  if (match.done) {
    const wrap = query.getCursor(state, 0, pos);
    match = wrap.next();
  }
  return match.done
    ? null
    : { from: match.value.from, to: match.value.to };
}

/// The last match of the current query starting before `pos`, wrapping to the
/// document end, or `null` when the query has no matches.
export function prevMatchBefore(
  state: EditorState,
  pos: number,
): MatchRange | null {
  const query = getSearchQuery(state);
  if (!query.valid) {
    return null;
  }
  const cursor = query.getCursor(state, 0, pos);
  let last: MatchRange | null = null;
  let match = cursor.next();
  while (!match.done) {
    last = { from: match.value.from, to: match.value.to };
    match = cursor.next();
  }
  if (last === null) {
    const wrap = query.getCursor(state, pos);
    let wrapped = wrap.next();
    while (!wrapped.done) {
      last = { from: wrapped.value.from, to: wrapped.value.to };
      wrapped = wrap.next();
    }
  }
  return last;
}
