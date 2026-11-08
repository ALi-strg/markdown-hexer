//! Literal, case-insensitive Find & Replace helpers.
//!
//! `FindState` lives on each `Document`; the matching helpers are pure so the
//! panel and the `Workspace` commands agree on the same match ranges.

use std::ops::Range;

/// Query and current match for one Document.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FindState {
    pub query: String,
    /// Index into [`matches`] for the current match; `0` when there is none.
    pub current: usize,
}

/// All non-overlapping matches of `query` in `content`, ignoring case.
pub fn matches(content: &str, query: &str) -> Vec<Range<usize>> {
    if query.is_empty() {
        return Vec::new();
    }
    let needle = query.to_lowercase();
    if needle.is_empty() {
        return Vec::new();
    }
    let (haystack, spans) = lower_with_spans(content);
    haystack
        .match_indices(&needle)
        .map(|(start, _)| {
            let end = start + needle.len() - 1;
            spans[start].0..spans[end].1
        })
        .collect()
}

/// Replace every match of `query` in `content` and return the count.
pub fn replace_all(content: &str, query: &str, replacement: &str) -> (String, usize) {
    let ranges = matches(content, query);
    if ranges.is_empty() {
        return (content.to_owned(), 0);
    }
    let mut replaced = String::with_capacity(content.len());
    let mut cursor = 0;
    for range in &ranges {
        replaced.push_str(&content[cursor..range.start]);
        replaced.push_str(replacement);
        cursor = range.end;
    }
    replaced.push_str(&content[cursor..]);
    (replaced, ranges.len())
}

/// Lowercased `text` plus, for every lowercased byte, the original byte span of
/// the character that produced it. That keeps offsets valid when a character
/// lowercases into several characters (for example `İ`).
fn lower_with_spans(text: &str) -> (String, Vec<(usize, usize)>) {
    let mut lower = String::with_capacity(text.len());
    let mut spans = Vec::with_capacity(text.len());
    for (start, character) in text.char_indices() {
        let end = start + character.len_utf8();
        for lowered in character.to_lowercase() {
            lower.push(lowered);
            spans.extend(std::iter::repeat_n((start, end), lowered.len_utf8()));
        }
    }
    (lower, spans)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_are_literal_and_case_insensitive() {
        assert_eq!(
            matches("Alpha alpha ALPHA", "alpha"),
            vec![0..5, 6..11, 12..17]
        );
        assert_eq!(matches("a.c abc", "a.c"), vec![0..3]);
        assert!(matches("abc", "a.c").is_empty());
    }

    #[test]
    fn matches_do_not_overlap_and_empty_query_matches_nothing() {
        assert_eq!(matches("aaaa", "aa"), vec![0..2, 2..4]);
        assert!(matches("abc", "").is_empty());
    }

    #[test]
    fn unicode_lowercase_keeps_original_offsets() {
        let ranges = matches("İstanbul", "i");
        assert_eq!(ranges, vec![0..2]);
        assert_eq!(matches("Straße", "STRASSE"), Vec::<Range<usize>>::new());
    }

    #[test]
    fn replace_all_counts_and_splices_every_match() {
        assert_eq!(
            replace_all("foo Foo foo", "foo", "bar"),
            ("bar bar bar".to_owned(), 3)
        );
        assert_eq!(
            replace_all("nothing", "foo", "bar"),
            ("nothing".to_owned(), 0)
        );
        assert_eq!(replace_all("abc", "b", ""), ("ac".to_owned(), 1));
    }
}
