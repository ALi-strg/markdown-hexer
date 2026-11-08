//! Pure Markdown formatting for the Edit toolbar.
//!
//! Selections use character indices, matching [`egui::TextEdit`] state, so the
//! result can be stored back without a second conversion at the UI boundary.

use std::ops::Range;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FormatAction {
    Bold,
    Italic,
    Heading,
    List,
    Link,
    Code,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FormatResult {
    pub text: String,
    pub selection: Range<usize>,
}

impl FormatAction {
    pub fn apply(self, text: &str, selection: Range<usize>) -> FormatResult {
        let len = text.chars().count();
        let start = selection.start.min(len);
        let end = selection.end.clamp(start, len);
        match self {
            Self::Bold => wrap(text, start, end, "**", "**"),
            Self::Italic => wrap(text, start, end, "_", "_"),
            Self::Heading => prefix_line(text, start, end, "## "),
            Self::List => prefix_line(text, start, end, "- "),
            Self::Link => link(text, start, end),
            Self::Code => code(text, start, end),
        }
    }
}

fn byte_index(text: &str, char_index: usize) -> usize {
    text.char_indices()
        .nth(char_index)
        .map_or(text.len(), |(byte, _)| byte)
}

/// Wraps a selection in `prefix`/`suffix`, or inserts the empty pair with the
/// caret between the markers. A non-empty selection keeps the formatted text
/// selected, matching the 1.x editor.
fn wrap(text: &str, start: usize, end: usize, prefix: &str, suffix: &str) -> FormatResult {
    let start_byte = byte_index(text, start);
    let end_byte = byte_index(text, end);
    let selected = &text[start_byte..end_byte];
    let mut formatted =
        String::with_capacity(text.len() + prefix.len() + selected.len() + suffix.len());
    formatted.push_str(&text[..start_byte]);
    formatted.push_str(prefix);
    formatted.push_str(selected);
    formatted.push_str(suffix);
    formatted.push_str(&text[end_byte..]);

    let prefix_chars = prefix.chars().count();
    let selection = if start == end {
        let caret = start + prefix_chars;
        caret..caret
    } else {
        let end = start + prefix_chars + (end - start) + suffix.chars().count();
        start..end
    };
    FormatResult {
        text: formatted,
        selection,
    }
}

/// Prefixes the line containing the selection start and shifts the selection
/// with the inserted marker. Repeated formatting prefixes again, as in 1.x.
fn prefix_line(text: &str, start: usize, end: usize, prefix: &str) -> FormatResult {
    let line_byte = text[..byte_index(text, start)]
        .rfind('\n')
        .map_or(0, |newline| newline + 1);
    let mut formatted = String::with_capacity(text.len() + prefix.len());
    formatted.push_str(&text[..line_byte]);
    formatted.push_str(prefix);
    formatted.push_str(&text[line_byte..]);

    let shift = prefix.chars().count();
    FormatResult {
        text: formatted,
        selection: start + shift..end + shift,
    }
}

fn link(text: &str, start: usize, end: usize) -> FormatResult {
    let start_byte = byte_index(text, start);
    let end_byte = byte_index(text, end);
    let mut formatted = String::with_capacity(text.len() + 7);
    formatted.push_str(&text[..start_byte]);
    if start == end {
        formatted.push_str("[]()");
        formatted.push_str(&text[end_byte..]);
        let caret = start + 3;
        return FormatResult {
            text: formatted,
            selection: caret..caret,
        };
    }

    let selected = &text[start_byte..end_byte];
    formatted.push('[');
    formatted.push_str(selected);
    formatted.push_str("](url)");
    formatted.push_str(&text[end_byte..]);

    let url_start = start + selected.chars().count() + 3;
    FormatResult {
        text: formatted,
        selection: url_start..url_start + 3,
    }
}

fn code(text: &str, start: usize, end: usize) -> FormatResult {
    if start == end {
        return wrap(text, start, end, "`", "`");
    }

    let start_byte = byte_index(text, start);
    let end_byte = byte_index(text, end);
    let selected = &text[start_byte..end_byte];
    if selected.contains('\n') {
        let fence = "`".repeat(longest_backtick_run(selected).max(2) + 1);
        let mut formatted =
            String::with_capacity(text.len() + selected.len() + fence.len() * 2 + 2);
        formatted.push_str(&text[..start_byte]);
        formatted.push_str(&fence);
        formatted.push('\n');
        formatted.push_str(selected);
        formatted.push('\n');
        formatted.push_str(&fence);
        formatted.push_str(&text[end_byte..]);

        let inner_start = start + fence.chars().count() + 1;
        return FormatResult {
            text: formatted,
            selection: inner_start..inner_start + (end - start),
        };
    }

    let fence = "`".repeat(longest_backtick_run(selected) + 1);
    // CommonMark strips one padding space from a code span whose content starts
    // and ends with a space, so pad when the selection would otherwise change.
    let pad = selected.starts_with('`')
        || selected.ends_with('`')
        || (selected.starts_with(' ')
            && selected.ends_with(' ')
            && selected.chars().any(|character| character != ' '));
    let (prefix, suffix) = if pad {
        (format!("{fence} "), format!(" {fence}"))
    } else {
        (fence.clone(), fence)
    };
    wrap(text, start, end, &prefix, &suffix)
}

fn longest_backtick_run(text: &str) -> usize {
    let mut longest = 0;
    let mut run = 0;
    for character in text.chars() {
        if character == '`' {
            run += 1;
            longest = longest.max(run);
        } else {
            run = 0;
        }
    }
    longest
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(
        text: &str,
        selection: Range<usize>,
        action: FormatAction,
        expected: &str,
        expected_selection: Range<usize>,
    ) {
        let result = action.apply(text, selection);
        assert_eq!(result.text, expected, "{action:?} on {text:?}");
        assert_eq!(
            result.selection, expected_selection,
            "{action:?} selection on {text:?}"
        );
    }

    #[test]
    fn wrap_insert_and_line_cases() {
        let cases = [
            // Bold: wrap, insert, multiline, and a selection that already has markers.
            (
                "hello world",
                0..5,
                FormatAction::Bold,
                "**hello** world",
                0..9,
            ),
            ("abc", 1..1, FormatAction::Bold, "a****bc", 3..3),
            ("a\nb", 0..3, FormatAction::Bold, "**a\nb**", 0..7),
            ("**bold**", 0..8, FormatAction::Bold, "****bold****", 0..12),
            // Italic uses underscores, so asterisks in the selection stay unambiguous.
            ("hello", 0..5, FormatAction::Italic, "_hello_", 0..7),
            ("abc", 2..2, FormatAction::Italic, "ab__c", 3..3),
            ("a*b", 0..3, FormatAction::Italic, "_a*b_", 0..5),
            // Heading and list prefix the line containing the selection start.
            (
                "first\nsecond",
                8..8,
                FormatAction::Heading,
                "first\n## second",
                11..11,
            ),
            ("title", 0..5, FormatAction::Heading, "## title", 3..8),
            ("title", 2..2, FormatAction::Heading, "## title", 5..5),
            ("# title", 0..7, FormatAction::Heading, "## # title", 3..10),
            (
                "alpha\nbeta",
                0..0,
                FormatAction::List,
                "- alpha\nbeta",
                2..2,
            ),
            ("beta", 0..4, FormatAction::List, "- beta", 2..6),
            ("- item", 0..6, FormatAction::List, "- - item", 2..8),
            // Link keeps the selected text as the label and selects the URL.
            ("docs", 0..4, FormatAction::Link, "[docs](url)", 7..10),
            ("abc", 1..1, FormatAction::Link, "a[]()bc", 4..4),
            ("a\nb", 0..3, FormatAction::Link, "[a\nb](url)", 6..9),
            ("[x](y)", 0..6, FormatAction::Link, "[[x](y)](url)", 9..12),
            // Code wraps, inserts, fences multiline text, and widens for backticks.
            (
                "const x = 1",
                0..11,
                FormatAction::Code,
                "`const x = 1`",
                0..13,
            ),
            ("abc", 3..3, FormatAction::Code, "abc``", 4..4),
            ("a\nb", 0..3, FormatAction::Code, "```\na\nb\n```", 4..7),
            ("a`b", 0..3, FormatAction::Code, "``a`b``", 0..7),
            ("`x`", 0..3, FormatAction::Code, "`` `x` ``", 0..9),
            ("   ", 0..3, FormatAction::Code, "`   `", 0..5),
            (
                "a\n```\nb",
                0..7,
                FormatAction::Code,
                "````\na\n```\nb\n````",
                5..12,
            ),
        ];

        for (text, selection, action, expected, expected_selection) in cases {
            check(text, selection, action, expected, expected_selection);
        }
    }

    #[test]
    fn selections_are_character_indices() {
        check("héllo", 0..5, FormatAction::Bold, "**héllo**", 0..9);
        check("aé", 1..2, FormatAction::Italic, "a_é_", 1..4);
        check("é", 0..1, FormatAction::Link, "[é](url)", 4..7);
    }

    #[test]
    fn out_of_range_selections_are_clamped() {
        check("abc", 10..10, FormatAction::Bold, "abc****", 5..5);
        check("abc", 0..99, FormatAction::List, "- abc", 2..5);
    }
}
