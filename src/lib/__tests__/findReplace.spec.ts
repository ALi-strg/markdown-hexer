import { describe, it, expect } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import { search, setSearchQuery, SearchQuery } from "@codemirror/search";
import {
  computeMatchInfo,
  nextMatchAfter,
  prevMatchBefore,
} from "../findReplace";

function stateWithQuery(doc: string, searchFor: string, anchor: number) {
  let state = EditorState.create({
    doc,
    selection: EditorSelection.single(anchor),
    extensions: [search()],
  });
  return setQuery(state, searchFor);
}

function setQuery(state: EditorState, searchFor: string) {
  return state.update({
    effects: setSearchQuery.of(
      new SearchQuery({ search: searchFor }),
    ),
  }).state;
}

describe("computeMatchInfo", () => {
  it("counts the matches and reports the index of the current match", () => {
    const state = stateWithQuery("alpha beta alpha\ngamma alpha", "alpha", 0);
    expect(computeMatchInfo(state)).toEqual({ index: 1, total: 3 });
  });

  it("reports the index of the match the selection points into", () => {
    // Second "alpha" starts at offset 11 ("alpha beta " is 11 chars).
    const state = stateWithQuery("alpha beta alpha\ngamma alpha", "alpha", 11);
    expect(computeMatchInfo(state)).toEqual({ index: 2, total: 3 });
  });

  it("returns null for an empty query", () => {
    const state = stateWithQuery("alpha beta", "", 0);
    expect(computeMatchInfo(state)).toBeNull();
  });

  it("returns null when there are no matches", () => {
    const state = stateWithQuery("alpha beta", "omega", 0);
    expect(computeMatchInfo(state)).toBeNull();
  });
});

describe("nextMatchAfter", () => {
  it("finds the first match at or after the position", () => {
    const state = stateWithQuery("alpha beta alpha\ngamma alpha", "alpha", 0);
    expect(nextMatchAfter(state, 0)).toEqual({ from: 0, to: 5 });
    expect(nextMatchAfter(state, 5)).toEqual({ from: 11, to: 16 });
    expect(nextMatchAfter(state, 16)).toEqual({ from: 23, to: 28 });
  });

  it("wraps to the first match after the last one", () => {
    const state = stateWithQuery("alpha beta alpha\ngamma alpha", "alpha", 0);
    expect(nextMatchAfter(state, 28)).toEqual({ from: 0, to: 5 });
  });

  it("returns null when there are no matches", () => {
    const state = stateWithQuery("alpha beta", "omega", 0);
    expect(nextMatchAfter(state, 0)).toBeNull();
  });
});

describe("prevMatchBefore", () => {
  it("finds the last match before the position", () => {
    const state = stateWithQuery("alpha beta alpha\ngamma alpha", "alpha", 0);
    expect(prevMatchBefore(state, 5)).toEqual({ from: 0, to: 5 });
    expect(prevMatchBefore(state, 11)).toEqual({ from: 0, to: 5 });
    expect(prevMatchBefore(state, 23)).toEqual({ from: 11, to: 16 });
  });

  it("wraps to the last match before the first one", () => {
    const state = stateWithQuery("alpha beta alpha\ngamma alpha", "alpha", 0);
    expect(prevMatchBefore(state, 0)).toEqual({ from: 23, to: 28 });
  });

  it("returns null when there are no matches", () => {
    const state = stateWithQuery("alpha beta", "omega", 0);
    expect(prevMatchBefore(state, 0)).toBeNull();
  });
});
