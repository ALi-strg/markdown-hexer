use std::ops::Range;

use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};

/// A preview artifact derived from a Document's content. The sanitized
/// markdown is what egui_commonmark renders; the tree is the app-side seam for
/// tests and later Preview features.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreparedPreview {
    pub markdown: String,
    pub tree: RenderTree,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RenderTree {
    pub blocks: Vec<Block>,
}

impl RenderTree {
    pub fn text(&self) -> String {
        self.blocks
            .iter()
            .map(|block| block.text.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BlockKind {
    Heading,
    Paragraph,
    Rule,
    CodeBlock,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Block {
    pub kind: BlockKind,
    pub text: String,
    pub level: u8,
    pub depth: usize,
    pub ordered: bool,
    pub in_blockquote: bool,
    pub emphasis: bool,
    pub strong: bool,
    pub inline_code: bool,
    pub language: Option<String>,
}

impl Block {
    fn paragraph(depth: usize, ordered: bool, in_blockquote: bool) -> Self {
        Self {
            kind: BlockKind::Paragraph,
            text: String::new(),
            level: 0,
            depth,
            ordered,
            in_blockquote,
            emphasis: false,
            strong: false,
            inline_code: false,
            language: None,
        }
    }

    fn heading(level: HeadingLevel, depth: usize, in_blockquote: bool) -> Self {
        Self {
            kind: BlockKind::Heading,
            level: level as u8,
            depth,
            in_blockquote,
            ..Self::paragraph(depth, false, in_blockquote)
        }
    }
}

pub fn prepare(source: &str) -> PreparedPreview {
    let mut tree = RenderTree::default();
    let mut html_ranges = Vec::new();
    parse_events(source, &mut tree, &mut html_ranges);

    PreparedPreview {
        markdown: strip_ranges(source, &html_ranges),
        tree,
    }
}

fn parse_events(source: &str, tree: &mut RenderTree, html_ranges: &mut Vec<Range<usize>>) {
    let mut current = None;
    let mut list_stack: Vec<bool> = Vec::new();
    let mut quote_depth = 0usize;

    for (event, range) in Parser::new_ext(source, Options::empty()).into_offset_iter() {
        match event {
            Event::Start(tag) => match tag {
                Tag::Paragraph => {
                    let block = Block::paragraph(
                        list_stack.len(),
                        list_stack.last().copied().unwrap_or(false),
                        quote_depth > 0,
                    );
                    tree.blocks.push(block);
                    current = Some(tree.blocks.len() - 1);
                }
                Tag::Heading { level, .. } => {
                    tree.blocks
                        .push(Block::heading(level, list_stack.len(), quote_depth > 0));
                    current = Some(tree.blocks.len() - 1);
                }
                Tag::BlockQuote(_) => {
                    quote_depth += 1;
                    current = None;
                }
                Tag::CodeBlock(kind) => {
                    let language = match kind {
                        pulldown_cmark::CodeBlockKind::Fenced(info) => {
                            info.split_whitespace().next().map(str::to_owned)
                        }
                        pulldown_cmark::CodeBlockKind::Indented => None,
                    };
                    tree.blocks.push(Block {
                        kind: BlockKind::CodeBlock,
                        language,
                        ..Block::paragraph(0, false, false)
                    });
                    current = Some(tree.blocks.len() - 1);
                }
                Tag::List(start) => {
                    list_stack.push(start.is_some());
                    current = None;
                }
                Tag::Item => current = None,
                Tag::Emphasis => mark(&mut tree.blocks, current, |block| block.emphasis = true),
                Tag::Strong => mark(&mut tree.blocks, current, |block| block.strong = true),
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Paragraph | TagEnd::Heading(_) | TagEnd::CodeBlock => current = None,
                TagEnd::Item => current = None,
                TagEnd::BlockQuote(_) => quote_depth = quote_depth.saturating_sub(1),
                TagEnd::List(_) => {
                    list_stack.pop();
                }
                _ => {}
            },
            Event::Text(text) => {
                let index = ensure_block(
                    tree,
                    &mut current,
                    list_stack.len(),
                    list_stack.last().copied().unwrap_or(false),
                    quote_depth > 0,
                );
                tree.blocks[index].text.push_str(&text);
            }
            Event::Code(text) => {
                let index = ensure_block(
                    tree,
                    &mut current,
                    list_stack.len(),
                    list_stack.last().copied().unwrap_or(false),
                    quote_depth > 0,
                );
                tree.blocks[index].text.push_str(&text);
                tree.blocks[index].inline_code = true;
            }
            Event::SoftBreak => append(&mut tree.blocks, current, " "),
            Event::HardBreak => append(&mut tree.blocks, current, "\n"),
            Event::Rule => tree.blocks.push(Block {
                kind: BlockKind::Rule,
                ..Block::paragraph(0, false, false)
            }),
            Event::Html(_) | Event::InlineHtml(_) => html_ranges.push(range),
            _ => {}
        }
    }
}

fn mark(blocks: &mut [Block], current: Option<usize>, change: impl FnOnce(&mut Block)) {
    if let Some(block) = current.and_then(|index| blocks.get_mut(index)) {
        change(block);
    }
}

/// Tight list items have no Paragraph event, so text can arrive with no block
/// open. Open one using the current list/quote context.
fn ensure_block(
    tree: &mut RenderTree,
    current: &mut Option<usize>,
    depth: usize,
    ordered: bool,
    in_blockquote: bool,
) -> usize {
    if let Some(index) = *current {
        return index;
    }
    tree.blocks
        .push(Block::paragraph(depth, ordered, in_blockquote));
    let index = tree.blocks.len() - 1;
    *current = Some(index);
    index
}

fn append(blocks: &mut [Block], current: Option<usize>, text: &str) {
    if let Some(block) = current.and_then(|index| blocks.get_mut(index)) {
        block.text.push_str(text);
    }
}

/// Remove raw HTML byte ranges, preserving every other byte of the source.
fn strip_ranges(source: &str, ranges: &[Range<usize>]) -> String {
    let mut output = String::with_capacity(source.len());
    let mut cursor = 0;

    for range in ranges {
        if range.start < cursor || range.end > source.len() {
            continue;
        }
        output.push_str(&source[cursor..range.start]);
        cursor = range.end;
    }
    output.push_str(&source[cursor..]);
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_commonmark_basics() {
        let source = "\
# Title

Sub
===

A *little* and **bold** paragraph with `code`.

- one
  - nested

1. first

> quoted

---

```rust
fn main() {}
```
";
        let preview = prepare(source);
        let blocks = &preview.tree.blocks;

        let heading = blocks
            .iter()
            .find(|block| block.kind == BlockKind::Heading)
            .unwrap();
        assert_eq!(heading.level, 1);
        assert_eq!(heading.text, "Title");

        let setext = blocks.iter().find(|block| block.text == "Sub").unwrap();
        assert_eq!(setext.kind, BlockKind::Heading);
        assert_eq!(setext.level, 1);

        let paragraph = blocks
            .iter()
            .find(|block| block.text.contains("little"))
            .unwrap();
        assert!(paragraph.emphasis);
        assert!(paragraph.strong);
        assert!(paragraph.inline_code);
        assert!(paragraph.text.contains("code"));

        let item = blocks.iter().find(|block| block.text == "one").unwrap();
        assert_eq!(item.depth, 1);
        assert!(!item.ordered);
        let nested = blocks.iter().find(|block| block.text == "nested").unwrap();
        assert_eq!(nested.depth, 2);

        let ordered = blocks.iter().find(|block| block.text == "first").unwrap();
        assert!(ordered.ordered);
        assert_eq!(ordered.depth, 1);

        assert!(
            blocks
                .iter()
                .any(|block| block.in_blockquote && block.text == "quoted")
        );
        assert!(blocks.iter().any(|block| block.kind == BlockKind::Rule));
        let code = blocks
            .iter()
            .find(|block| block.kind == BlockKind::CodeBlock)
            .unwrap();
        assert_eq!(code.language.as_deref(), Some("rust"));
        assert_eq!(code.text, "fn main() {}\n");
    }

    #[test]
    fn drops_raw_html_blocks_and_tags() {
        let source = "\
<div>
secret
</div>

Hello <b>world</b>.

<script>alert(1)</script>
";
        let preview = prepare(source);

        assert!(!preview.markdown.contains("<div"));
        assert!(!preview.markdown.contains("<b>"));
        assert!(!preview.markdown.contains("secret"));
        assert!(!preview.markdown.contains("alert"));
        assert!(preview.markdown.contains("Hello world."));
        assert!(!preview.tree.text().contains("secret"));
        assert!(preview.tree.text().contains("Hello world."));
    }

    #[test]
    fn drops_html_comments() {
        let preview = prepare("before\n\n<!-- hidden -->\n\nafter");

        assert!(!preview.markdown.contains("hidden"));
        assert!(!preview.tree.text().contains("hidden"));
        assert!(preview.tree.text().contains("before"));
        assert!(preview.tree.text().contains("after"));
    }

    #[test]
    fn malformed_markdown_does_not_panic() {
        for source in [
            "# unclosed [",
            "[link](",
            "```\nunclosed",
            "> ",
            "<div",
            "**",
            "\u{feff}# bom heading",
        ] {
            let _ = prepare(source);
        }
    }
}
