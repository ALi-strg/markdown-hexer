use std::hash::{DefaultHasher, Hash, Hasher};
use std::ops::Range;
use std::sync::Arc;

use egui::text::{ByteIndex, LayoutJob, LayoutSection, TextFormat};
use egui::{Align, FontId, Galley, Ui};

use crate::ui::Palette;

/// Cheap, line/token-level Markdown colouring. It never parses the document
/// into an AST; the resulting LayoutJob is cached by content revision.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TokenStyle {
    Text,
    Heading,
    Marker,
    Code,
    Link,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Token {
    pub range: Range<usize>,
    pub style: TokenStyle,
}

#[derive(Clone, Copy, Debug)]
struct Fence {
    marker: u8,
    count: usize,
}

#[derive(Default)]
struct Spans {
    tokens: Vec<Token>,
}

impl Spans {
    fn push(&mut self, range: Range<usize>, style: TokenStyle) {
        if range.is_empty() {
            return;
        }
        if let Some(last) = self.tokens.last_mut()
            && last.style == style
            && last.range.end == range.start
        {
            last.range.end = range.end;
            return;
        }
        self.tokens.push(Token { range, style });
    }
}

/// Scan Markdown into contiguous, non-overlapping style spans.
pub fn scan_markdown(text: &str) -> Vec<Token> {
    let mut spans = Spans::default();
    let mut fence: Option<Fence> = None;
    let mut offset = 0;

    for line in text.split_inclusive('\n') {
        let line_end = line.len();
        let content_len = line.trim_end_matches(['\n', '\r']).len();
        let content = &line[..content_len];

        if let Some(open) = fence {
            spans.push(offset..offset + line_end, TokenStyle::Code);
            if is_closing_fence(content, open) {
                fence = None;
            }
            offset += line_end;
            continue;
        }

        if let Some(open) = opening_fence(content) {
            spans.push(offset..offset + line_end, TokenStyle::Code);
            fence = Some(open);
            offset += line_end;
            continue;
        }

        let leading = content.len() - content.trim_start_matches([' ', '\t']).len();
        let rest = &content[leading..];
        let rest_start = offset + leading;

        if let Some(heading_len) = heading_len(rest) {
            let marker_end = rest_start
                + heading_len
                + usize::from(rest.as_bytes().get(heading_len) == Some(&b' '));
            spans.push(offset..rest_start, TokenStyle::Text);
            spans.push(rest_start..marker_end, TokenStyle::Marker);
            spans.push(marker_end..offset + content_len, TokenStyle::Heading);
            spans.push(offset + content_len..offset + line_end, TokenStyle::Text);
        } else if is_thematic_break(rest) {
            spans.push(offset..offset + line_end, TokenStyle::Marker);
        } else if rest.starts_with('>') {
            spans.push(offset..rest_start, TokenStyle::Text);
            let mut position = leading;
            while position < content_len && content.as_bytes()[position] == b'>' {
                let end = if content.as_bytes().get(position + 1) == Some(&b' ') {
                    position + 2
                } else {
                    position + 1
                };
                spans.push(offset + position..offset + end, TokenStyle::Marker);
                position = end;
            }
            scan_inline(&mut spans, content, offset, position, content_len);
            spans.push(offset + content_len..offset + line_end, TokenStyle::Text);
        } else if let Some(marker_len) = list_marker_len(rest) {
            spans.push(offset..rest_start, TokenStyle::Text);
            spans.push(rest_start..rest_start + marker_len, TokenStyle::Marker);
            scan_inline(
                &mut spans,
                content,
                offset,
                leading + marker_len,
                content_len,
            );
            spans.push(offset + content_len..offset + line_end, TokenStyle::Text);
        } else {
            spans.push(offset..rest_start, TokenStyle::Text);
            scan_inline(&mut spans, content, offset, leading, content_len);
            spans.push(offset + content_len..offset + line_end, TokenStyle::Text);
        }

        offset += line_end;
    }

    spans.tokens
}

fn heading_len(rest: &str) -> Option<usize> {
    let hashes = rest.bytes().take_while(|byte| *byte == b'#').count();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    match rest.as_bytes().get(hashes) {
        None => Some(hashes),
        Some(byte) if byte.is_ascii_whitespace() => Some(hashes),
        _ => None,
    }
}

fn opening_fence(content: &str) -> Option<Fence> {
    let marker = *content.as_bytes().first()?;
    if marker != b'`' && marker != b'~' {
        return None;
    }
    let count = content.bytes().take_while(|byte| *byte == marker).count();
    (count >= 3).then_some(Fence { marker, count })
}

fn is_closing_fence(content: &str, fence: Fence) -> bool {
    let trimmed = content.trim();
    let bytes = trimmed.as_bytes();
    let count = bytes
        .iter()
        .take_while(|byte| **byte == fence.marker)
        .count();
    count >= fence.count && count == bytes.len()
}

fn is_thematic_break(rest: &str) -> bool {
    let mut marker = None;
    let mut count = 0;
    for character in rest.chars() {
        if character == ' ' || character == '\t' {
            continue;
        }
        if !matches!(character, '-' | '*' | '_') {
            return false;
        }
        if marker.is_some_and(|seen| seen != character) {
            return false;
        }
        marker = Some(character);
        count += 1;
    }
    count >= 3
}

fn list_marker_len(rest: &str) -> Option<usize> {
    let bytes = rest.as_bytes();
    if let Some(first) = bytes.first()
        && matches!(first, b'-' | b'*' | b'+')
        && matches!(bytes.get(1), Some(b' ' | b'\t'))
    {
        return Some(2);
    }
    let digits = bytes
        .iter()
        .take_while(|byte| byte.is_ascii_digit())
        .count();
    if (1..=9).contains(&digits)
        && matches!(bytes.get(digits), Some(b'.' | b')'))
        && matches!(bytes.get(digits + 1), Some(b' ' | b'\t'))
    {
        return Some(digits + 2);
    }
    None
}

fn scan_inline(spans: &mut Spans, line: &str, base: usize, mut index: usize, end: usize) {
    let bytes = line.as_bytes();
    while index < end {
        let character = line[index..].chars().next().unwrap_or('\0');
        match character {
            '`' => {
                let run = bytes[index..end]
                    .iter()
                    .take_while(|byte| **byte == b'`')
                    .count();
                if let Some(close) = find_delimiter(line, index + run, end, b'`', run) {
                    spans.push(base + index..base + index + run, TokenStyle::Marker);
                    spans.push(base + index + run..base + close, TokenStyle::Code);
                    spans.push(base + close..base + close + run, TokenStyle::Marker);
                    index = close + run;
                } else {
                    spans.push(base + index..base + index + run, TokenStyle::Marker);
                    index += run;
                }
            }
            '*' | '_' => {
                let byte = character as u8;
                let run = bytes[index..end]
                    .iter()
                    .take_while(|candidate| **candidate == byte)
                    .count();
                let delimiter = if run >= 2 { 2 } else { 1 };
                if let Some(close) = find_delimiter(line, index + delimiter, end, byte, delimiter) {
                    spans.push(base + index..base + index + delimiter, TokenStyle::Marker);
                    spans.push(base + index + delimiter..base + close, TokenStyle::Text);
                    spans.push(base + close..base + close + delimiter, TokenStyle::Marker);
                    index = close + delimiter;
                } else {
                    spans.push(base + index..base + index + 1, TokenStyle::Marker);
                    index += 1;
                }
            }
            '[' | '!' => {
                if let Some((range, next)) = link_at(line, index, end) {
                    spans.push(base + range.start..base + range.end, TokenStyle::Link);
                    index = next;
                } else {
                    spans.push(
                        base + index..base + index + character.len_utf8(),
                        TokenStyle::Text,
                    );
                    index += character.len_utf8();
                }
            }
            _ => {
                let next = next_special(line, index, end);
                spans.push(base + index..base + next, TokenStyle::Text);
                index = next;
            }
        }
    }
}

fn next_special(line: &str, mut index: usize, end: usize) -> usize {
    while index < end {
        let character = line[index..].chars().next().unwrap_or('\0');
        if matches!(character, '`' | '*' | '_' | '[') {
            break;
        }
        if character == '!' && line.as_bytes().get(index + 1) == Some(&b'[') {
            break;
        }
        index += character.len_utf8();
    }
    index
}

fn find_delimiter(line: &str, from: usize, end: usize, byte: u8, count: usize) -> Option<usize> {
    let bytes = line.as_bytes();
    let mut index = from;
    while index < end {
        if bytes[index] == byte {
            let run = bytes[index..end]
                .iter()
                .take_while(|candidate| **candidate == byte)
                .count();
            if run == count {
                return Some(index);
            }
            index += run;
        } else {
            index += 1;
        }
    }
    None
}

fn link_at(line: &str, index: usize, end: usize) -> Option<(Range<usize>, usize)> {
    let bytes = line.as_bytes();
    let bracket = if bytes[index] == b'!' {
        (bytes.get(index + 1) == Some(&b'[')).then_some(index + 1)?
    } else {
        index
    };
    let label_end = line[bracket + 1..end].find(']')? + bracket + 1;
    if bytes.get(label_end + 1) != Some(&b'(') {
        return None;
    }
    let destination_end = line[label_end + 2..end].find(')')? + label_end + 2;
    Some((index..destination_end + 1, destination_end + 1))
}

pub struct MarkdownHighlighter {
    palette: Palette,
    font: FontId,
}

impl MarkdownHighlighter {
    pub fn new(palette: Palette, font: FontId) -> Self {
        Self { palette, font }
    }

    pub fn layout(
        &self,
        ui: &Ui,
        text: &str,
        revision: u64,
        wrap_width: f32,
        cache: &mut HighlightCache,
    ) -> Arc<Galley> {
        let text_hash = hash_text(text);
        if cache.revision == Some(revision)
            && cache.text_hash == text_hash
            && (cache.wrap_width - wrap_width).abs() < 0.5
            && let Some(galley) = &cache.galley
        {
            return galley.clone();
        }

        let line_height = ui.fonts_mut(|fonts| fonts.row_height(&self.font))
            + ui.spacing().extra_text_line_spacing;
        let mut job = LayoutJob {
            text: text.to_owned(),
            ..Default::default()
        };
        job.wrap.max_width = wrap_width.max(64.0);
        job.halign = Align::LEFT;
        job.keep_trailing_whitespace = true;

        let tokens = scan_markdown(text);
        if tokens.is_empty() {
            job.sections.push(LayoutSection {
                leading_space: 0.0,
                byte_range: ByteIndex(0)..ByteIndex(0),
                format: self.format(TokenStyle::Text, line_height),
            });
        }
        for token in tokens {
            job.sections.push(LayoutSection {
                leading_space: 0.0,
                byte_range: ByteIndex(token.range.start)..ByteIndex(token.range.end),
                format: self.format(token.style, line_height),
            });
        }

        let galley = ui.fonts_mut(|fonts| fonts.layout_job(job));
        cache.revision = Some(revision);
        cache.text_hash = text_hash;
        cache.wrap_width = wrap_width;
        cache.galley = Some(galley.clone());
        galley
    }

    fn format(&self, style: TokenStyle, line_height: f32) -> TextFormat {
        let color = match style {
            TokenStyle::Text => self.palette.ink,
            TokenStyle::Heading => self.palette.accent,
            TokenStyle::Marker => self.palette.muted,
            TokenStyle::Code => self.palette.accent,
            TokenStyle::Link => self.palette.link,
        };
        let mut format = TextFormat {
            font_id: self.font.clone(),
            color,
            ..Default::default()
        };
        format.line_height = Some(line_height);
        format
    }
}

#[derive(Default)]
pub struct HighlightCache {
    revision: Option<u64>,
    text_hash: u64,
    wrap_width: f32,
    galley: Option<Arc<Galley>>,
}

fn hash_text(text: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    text.hash(&mut hasher);
    hasher.finish()
}

pub struct EditorResources {
    pub highlighter: MarkdownHighlighter,
    pub font: FontId,
}

impl EditorResources {
    pub fn new(palette: Palette) -> Self {
        let font = FontId::monospace(15.0);
        Self {
            highlighter: MarkdownHighlighter::new(palette, font.clone()),
            font,
        }
    }
}

#[derive(Default)]
pub struct EditorSession {
    pub cache: HighlightCache,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn styles(text: &str) -> Vec<(Range<usize>, TokenStyle)> {
        scan_markdown(text)
            .into_iter()
            .map(|token| (token.range, token.style))
            .collect()
    }

    fn assert_covers(text: &str) {
        let tokens = scan_markdown(text);
        let mut cursor = 0;
        for token in &tokens {
            assert_eq!(token.range.start, cursor, "gap or overlap at {cursor}");
            assert!(token.range.end > token.range.start);
            assert!(text.is_char_boundary(token.range.start));
            assert!(text.is_char_boundary(token.range.end));
            cursor = token.range.end;
        }
        assert_eq!(cursor, text.len(), "tokens must cover the whole document");
    }

    #[test]
    fn scans_headings_and_strong_markers() {
        let text = "# Title\n\nSome **bold** text.\n";
        let tokens = styles(text);

        assert!(tokens.contains(&(0..2, TokenStyle::Marker)));
        assert!(tokens.contains(&(2..7, TokenStyle::Heading)));
        assert!(tokens.contains(&(14..16, TokenStyle::Marker)));
        assert_covers(text);
    }

    #[test]
    fn scans_fenced_and_inline_code() {
        let text = "before `code` after\n```rust\nlet x = 1;\n```\n";
        let tokens = styles(text);

        assert!(tokens.iter().any(|(range, style)| {
            *style == TokenStyle::Code && &text[range.clone()] == "code"
        }));
        assert!(tokens.iter().any(|(range, style)| {
            *style == TokenStyle::Code && text[range.clone()].contains("let x = 1;")
        }));
        assert!(tokens.iter().any(|(range, style)| {
            *style == TokenStyle::Code && text[range.clone()].contains("```rust")
        }));
        assert_covers(text);
    }

    #[test]
    fn scans_lists_quotes_links_and_thematic_breaks() {
        let text = "- item [link](https://example.com)\n> quote\n---\n";
        let tokens = styles(text);

        assert!(tokens.contains(&(0..2, TokenStyle::Marker)));
        let quote = text.find('>').unwrap();
        assert!(tokens.contains(&(quote..quote + 2, TokenStyle::Marker)));
        let rule = text.find("---").unwrap();
        assert!(
            tokens
                .iter()
                .any(|(range, style)| *style == TokenStyle::Marker && range.contains(&rule))
        );
        assert!(
            tokens
                .iter()
                .any(|(range, style)| *style == TokenStyle::Link
                    && &text[range.clone()] == "[link](https://example.com)")
        );
        assert_covers(text);
    }

    #[test]
    fn handles_unclosed_delimiters_and_non_ascii_without_gaps() {
        let text = "héllo **open\n`unclosed\n#na hashtag\n";
        assert_covers(text);
    }

    #[test]
    fn empty_document_scans_to_nothing() {
        assert!(scan_markdown("").is_empty());
    }
}
