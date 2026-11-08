use std::ops::Range;
use std::path::Path;

use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};

use crate::image::{ImageSource, ImageTarget, NativeImageSource, file_uri};
use crate::sections::Sections;

/// A preview artifact derived from a Document's content. `markdown` is the
/// sanitized source, `render_markdown` is what egui_commonmark renders (fenced
/// code replaced by app-rendered sentinels), and the tree is the app-side seam
/// for tests and later Preview features.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreparedPreview {
    pub markdown: String,
    pub render_markdown: String,
    pub first_frame_render_markdown: Option<String>,
    pub sections: Sections,
    pub first_frame_sections: Option<Sections>,
    pub code_blocks: Vec<FencedCode>,
    pub tree: RenderTree,
}

/// A fenced code block whose body is rendered by the app so it can use the
/// active palette and scroll independently of the page.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FencedCode {
    pub language: Option<String>,
    pub text: String,
}

impl FencedCode {
    /// Clipboard payload: the body without exactly one trailing newline.
    pub fn copy_text(&self) -> String {
        let mut text = self.text.as_str();
        if let Some(stripped) = text.strip_suffix('\n') {
            text = stripped.strip_suffix('\r').unwrap_or(stripped);
        }
        text.to_owned()
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RenderTree {
    pub blocks: Vec<Block>,
    pub images: Vec<ImageRef>,
    pub links: Vec<LinkRef>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ImageRef {
    pub alt: String,
    pub destination: String,
    pub range: Range<usize>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LinkRef {
    pub text: String,
    pub destination: String,
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
    TableCell,
    FootnoteDefinition,
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
    pub strikethrough: bool,
    pub task: Option<bool>,
    pub table_header: bool,
    pub footnote: Option<String>,
    pub footnote_ref: Option<String>,
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
            strikethrough: false,
            task: None,
            table_header: false,
            footnote: None,
            footnote_ref: None,
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
    prepare_with_images(source, None, &NativeImageSource)
}

pub fn prepare_with_images(
    source: &str,
    scope: Option<&Path>,
    images: &dyn ImageSource,
) -> PreparedPreview {
    let mut tree = RenderTree::default();
    let mut html_ranges = Vec::new();
    let mut code_blocks = Vec::new();
    let mut code_ranges = Vec::new();
    let mut image_ranges = Vec::new();
    parse_events(
        source,
        &mut tree,
        &mut html_ranges,
        &mut code_blocks,
        &mut code_ranges,
        &mut image_ranges,
    );

    let targets: Vec<ImageTarget> = tree
        .images
        .iter()
        .map(|image| images.resolve(scope, &image.destination))
        .collect();
    let first_frame_render_markdown = if tree.images.is_empty() {
        None
    } else {
        Some(build_render_markdown(
            source,
            &html_ranges,
            &code_ranges,
            &image_ranges,
            &tree.images,
            &targets,
            false,
        ))
    };

    let render_markdown = build_render_markdown(
        source,
        &html_ranges,
        &code_ranges,
        &image_ranges,
        &tree.images,
        &targets,
        true,
    );
    let sections = Sections::parse(&render_markdown);
    let first_frame_sections = first_frame_render_markdown.as_deref().map(Sections::parse);

    PreparedPreview {
        markdown: strip_ranges(source, &html_ranges),
        render_markdown,
        first_frame_render_markdown,
        sections,
        first_frame_sections,
        code_blocks,
        tree,
    }
}

fn parse_events(
    source: &str,
    tree: &mut RenderTree,
    html_ranges: &mut Vec<Range<usize>>,
    code_blocks: &mut Vec<FencedCode>,
    code_ranges: &mut Vec<(Range<usize>, usize)>,
    image_ranges: &mut Vec<(Range<usize>, usize)>,
) {
    let mut current = None;
    let mut list_stack: Vec<bool> = Vec::new();
    let mut quote_depth = 0usize;
    let mut table_header = false;
    let mut fenced_code = false;
    let mut footnote: Option<String> = None;
    let mut image: Option<usize> = None;
    let mut image_start = 0;
    let mut link: Option<usize> = None;
    let options = Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_FOOTNOTES;

    for (event, range) in Parser::new_ext(source, options).into_offset_iter() {
        match event {
            Event::Start(tag) => match tag {
                Tag::Paragraph => {
                    let block = with_footnote(
                        Block::paragraph(
                            list_stack.len(),
                            list_stack.last().copied().unwrap_or(false),
                            quote_depth > 0,
                        ),
                        &footnote,
                    );
                    tree.blocks.push(block);
                    current = Some(tree.blocks.len() - 1);
                }
                Tag::Heading { level, .. } => {
                    let block = with_footnote(
                        Block::heading(level, list_stack.len(), quote_depth > 0),
                        &footnote,
                    );
                    tree.blocks.push(block);
                    current = Some(tree.blocks.len() - 1);
                }
                Tag::Table(_) => {
                    table_header = false;
                    current = None;
                }
                Tag::TableHead => {
                    table_header = true;
                    current = None;
                }
                Tag::TableRow => {
                    table_header = false;
                    current = None;
                }
                Tag::TableCell => {
                    let mut block =
                        with_footnote(Block::paragraph(0, false, quote_depth > 0), &footnote);
                    block.kind = BlockKind::TableCell;
                    block.table_header = table_header;
                    tree.blocks.push(block);
                    current = Some(tree.blocks.len() - 1);
                }
                Tag::BlockQuote(_) => {
                    quote_depth += 1;
                    current = None;
                }
                Tag::CodeBlock(kind) => {
                    fenced_code = matches!(kind, pulldown_cmark::CodeBlockKind::Fenced(_));
                    let language = match kind {
                        pulldown_cmark::CodeBlockKind::Fenced(info) => {
                            info.split_whitespace().next().map(str::to_owned)
                        }
                        pulldown_cmark::CodeBlockKind::Indented => None,
                    };
                    tree.blocks.push(with_footnote(
                        Block {
                            kind: BlockKind::CodeBlock,
                            language,
                            ..Block::paragraph(0, false, false)
                        },
                        &footnote,
                    ));
                    current = Some(tree.blocks.len() - 1);
                }
                Tag::List(start) => {
                    list_stack.push(start.is_some());
                    current = None;
                }
                Tag::Item => current = None,
                Tag::Emphasis => mark(&mut tree.blocks, current, |block| block.emphasis = true),
                Tag::Strong => mark(&mut tree.blocks, current, |block| block.strong = true),
                Tag::Strikethrough => mark(&mut tree.blocks, current, |block| {
                    block.strikethrough = true
                }),
                Tag::Image { dest_url, .. } => {
                    tree.images.push(ImageRef {
                        alt: String::new(),
                        destination: dest_url.to_string(),
                        range: range.clone(),
                    });
                    image = Some(tree.images.len() - 1);
                    image_start = range.start;
                }
                Tag::Link { dest_url, .. } => {
                    tree.links.push(LinkRef {
                        text: String::new(),
                        destination: dest_url.to_string(),
                    });
                    link = Some(tree.links.len() - 1);
                }
                Tag::FootnoteDefinition(label) => {
                    let mut block = Block::paragraph(0, false, quote_depth > 0);
                    block.kind = BlockKind::FootnoteDefinition;
                    block.footnote = Some(label.to_string());
                    tree.blocks.push(block);
                    footnote = Some(label.to_string());
                    current = None;
                }
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Paragraph | TagEnd::Heading(_) => current = None,
                TagEnd::CodeBlock => {
                    if fenced_code && let Some(index) = current {
                        let block = &tree.blocks[index];
                        let code_index = code_blocks.len();
                        code_blocks.push(FencedCode {
                            language: block.language.clone(),
                            text: block.text.clone(),
                        });
                        code_ranges.push((range, code_index));
                    }
                    current = None;
                    fenced_code = false;
                }
                TagEnd::Table => {
                    current = None;
                }
                TagEnd::TableHead | TagEnd::TableRow => {
                    table_header = false;
                    current = None;
                }
                TagEnd::TableCell => current = None,
                TagEnd::FootnoteDefinition => {
                    footnote = None;
                    current = None;
                }
                TagEnd::Item => current = None,
                TagEnd::BlockQuote(_) => quote_depth = quote_depth.saturating_sub(1),
                TagEnd::List(_) => {
                    list_stack.pop();
                }
                TagEnd::Image => {
                    if let Some(index) = image.take() {
                        let range = image_start..range.end;
                        tree.images[index].range = range.clone();
                        image_ranges.push((range, index));
                    }
                }
                TagEnd::Link => link = None,
                _ => {}
            },
            Event::Text(text) => {
                if let Some(image) = image.and_then(|index| tree.images.get_mut(index)) {
                    image.alt.push_str(&text);
                }
                if let Some(link) = link.and_then(|index| tree.links.get_mut(index)) {
                    link.text.push_str(&text);
                }
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
                if let Some(image) = image.and_then(|index| tree.images.get_mut(index)) {
                    image.alt.push_str(&text);
                }
                if let Some(link) = link.and_then(|index| tree.links.get_mut(index)) {
                    link.text.push_str(&text);
                }
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
            Event::TaskListMarker(checked) => {
                let index = ensure_block(
                    tree,
                    &mut current,
                    list_stack.len(),
                    list_stack.last().copied().unwrap_or(false),
                    quote_depth > 0,
                );
                tree.blocks[index].task = Some(checked);
            }
            Event::FootnoteReference(label) => {
                let index = ensure_block(
                    tree,
                    &mut current,
                    list_stack.len(),
                    list_stack.last().copied().unwrap_or(false),
                    quote_depth > 0,
                );
                tree.blocks[index].text.push_str(&format!("[^{label}]"));
                tree.blocks[index].footnote_ref = Some(label.to_string());
            }
            Event::SoftBreak => {
                if let Some(image) = image.and_then(|index| tree.images.get_mut(index)) {
                    image.alt.push(' ');
                }
                append(&mut tree.blocks, current, " ")
            }
            Event::HardBreak => {
                if let Some(image) = image.and_then(|index| tree.images.get_mut(index)) {
                    image.alt.push(' ');
                }
                append(&mut tree.blocks, current, "\n")
            }
            Event::Rule => tree.blocks.push(Block {
                kind: BlockKind::Rule,
                ..Block::paragraph(0, false, false)
            }),
            Event::Html(_) | Event::InlineHtml(_) => html_ranges.push(range),
            _ => {}
        }
    }
}

fn with_footnote(mut block: Block, footnote: &Option<String>) -> Block {
    block.footnote.clone_from(footnote);
    block
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

/// Build widget input: raw HTML removed, fenced code replaced by sentinel
/// blocks that the app renderer handles, and image destinations resolved to
/// vetted `file://` URIs. When `allow_images` is false every image becomes alt
/// text so the first frame never reads or fetches an image.
fn build_render_markdown(
    source: &str,
    html_ranges: &[Range<usize>],
    code_ranges: &[(Range<usize>, usize)],
    image_ranges: &[(Range<usize>, usize)],
    images: &[ImageRef],
    targets: &[ImageTarget],
    allow_images: bool,
) -> String {
    struct Edit {
        range: Range<usize>,
        replacement: String,
    }

    let mut edits: Vec<Edit> = html_ranges
        .iter()
        .cloned()
        .map(|range| Edit {
            range,
            replacement: String::new(),
        })
        .chain(code_ranges.iter().map(|(range, index)| Edit {
            range: range.clone(),
            replacement: format!("<div data-hexer-code=\"{index}\"></div>\n"),
        }))
        .chain(image_ranges.iter().map(|(range, index)| {
            let image = &images[*index];
            let target = &targets[*index];
            let replacement = match (allow_images, target) {
                (true, ImageTarget::Local(path)) => {
                    format!("![{}]({})", escape_label(&image.alt), file_uri(path))
                }
                (true, ImageTarget::Remote) => source[range.clone()].to_owned(),
                _ => escape_label(&image.alt),
            };
            Edit {
                range: range.clone(),
                replacement,
            }
        }))
        .collect();
    edits.sort_by_key(|edit| edit.range.start);

    let mut output = String::with_capacity(source.len());
    let mut cursor = 0;
    for edit in edits {
        let range = edit.range;
        if range.start < cursor || range.end > source.len() {
            continue;
        }
        output.push_str(&source[cursor..range.start]);
        output.push_str(&edit.replacement);
        cursor = range.end;
    }
    output.push_str(&source[cursor..]);
    output
}

fn escape_label(text: &str) -> String {
    let text = text.replace(['\n', '\r'], " ");
    if text.trim().is_empty() {
        return "image".to_owned();
    }
    let mut escaped = String::with_capacity(text.len());
    for character in text.chars() {
        if matches!(
            character,
            '\\' | '`' | '*' | '_' | '[' | ']' | '<' | '>' | '#' | '!' | '|' | '~'
        ) {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
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

    fn snapshot(tree: &RenderTree) -> String {
        tree.blocks
            .iter()
            .map(|block| {
                let kind = match block.kind {
                    BlockKind::Heading => format!("heading h{}", block.level),
                    BlockKind::Paragraph => "paragraph".to_owned(),
                    BlockKind::Rule => "rule".to_owned(),
                    BlockKind::CodeBlock => "code-block".to_owned(),
                    BlockKind::TableCell => "table-cell".to_owned(),
                    BlockKind::FootnoteDefinition => "footnote-definition".to_owned(),
                };
                let mut flags = Vec::new();
                if block.depth > 0 {
                    flags.push(format!("depth={}", block.depth));
                }
                if block.ordered {
                    flags.push("ordered".to_owned());
                }
                if block.in_blockquote {
                    flags.push("quote".to_owned());
                }
                if block.emphasis {
                    flags.push("emphasis".to_owned());
                }
                if block.strong {
                    flags.push("strong".to_owned());
                }
                if block.inline_code {
                    flags.push("inline-code".to_owned());
                }
                if block.strikethrough {
                    flags.push("strikethrough".to_owned());
                }
                if let Some(task) = block.task {
                    flags.push(
                        if task {
                            "task=checked"
                        } else {
                            "task=unchecked"
                        }
                        .to_owned(),
                    );
                }
                if block.table_header {
                    flags.push("header".to_owned());
                }
                if let Some(footnote) = &block.footnote {
                    flags.push(format!("footnote={footnote}"));
                }
                if let Some(reference) = &block.footnote_ref {
                    flags.push(format!("ref={reference}"));
                }
                if let Some(language) = &block.language {
                    flags.push(format!("lang={language}"));
                }
                format!("{kind} [{}] {:?}", flags.join(","), block.text)
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn parses_gfm_tables() {
        let preview = prepare(
            "\
| Name | Value |
| :--- | ---: |
| alpha | 1 |
| beta | 2 |
",
        );

        assert_eq!(
            snapshot(&preview.tree),
            r#"table-cell [header] "Name"
table-cell [header] "Value"
table-cell [] "alpha"
table-cell [] "1"
table-cell [] "beta"
table-cell [] "2""#
        );
    }

    #[test]
    fn parses_gfm_strikethrough() {
        let preview = prepare("before ~~gone~~ after");

        assert_eq!(
            snapshot(&preview.tree),
            r#"paragraph [strikethrough] "before gone after""#
        );
    }

    #[test]
    fn parses_gfm_task_lists() {
        let preview = prepare("- [x] done\n- [ ] todo\n");

        assert_eq!(
            snapshot(&preview.tree),
            r#"paragraph [depth=1,task=checked] "done"
paragraph [depth=1,task=unchecked] "todo""#
        );
    }

    #[test]
    fn parses_gfm_footnotes() {
        let preview = prepare("See note[^1].\n\n[^1]: Footnote text.\n");

        assert_eq!(
            snapshot(&preview.tree),
            r#"paragraph [ref=1] "See note[^1]."
footnote-definition [footnote=1] ""
paragraph [footnote=1] "Footnote text.""#
        );
    }

    #[test]
    fn keeps_inline_code_monospaced_in_the_tree() {
        let preview = prepare("Use `cargo test` now.");

        assert_eq!(
            snapshot(&preview.tree),
            r#"paragraph [inline-code] "Use cargo test now.""#
        );
    }

    #[test]
    fn replaces_fenced_code_with_sentinels_for_the_renderer() {
        let source = "\
Intro.

```rust
fn main() {}
```

<!-- hidden -->

After.
";
        let preview = prepare(source);

        assert!(preview.markdown.contains("```rust"));
        assert!(preview.markdown.contains("fn main"));
        assert!(!preview.markdown.contains("hidden"));
        assert_eq!(
            preview.code_blocks,
            vec![FencedCode {
                language: Some("rust".to_owned()),
                text: "fn main() {}\n".to_owned(),
            }]
        );
        assert!(preview.render_markdown.contains("Intro."));
        assert!(
            preview
                .render_markdown
                .contains("<div data-hexer-code=\"0\"></div>")
        );
        assert!(!preview.render_markdown.contains("```"));
        assert!(!preview.render_markdown.contains("fn main"));
        assert!(!preview.render_markdown.contains("hidden"));
        assert!(preview.render_markdown.contains("After."));
    }

    #[test]
    fn fenced_code_sentinels_are_one_per_code_block() {
        let source = "\
```sh
echo one
```

text

```js
let two = 2;
```
";
        let preview = prepare(source);

        assert_eq!(preview.code_blocks.len(), 2);
        assert_eq!(
            preview.render_markdown.matches("data-hexer-code").count(),
            2
        );
        assert!(preview.render_markdown.contains("data-hexer-code=\"0\""));
        assert!(preview.render_markdown.contains("data-hexer-code=\"1\""));
        assert_eq!(preview.code_blocks[0].language.as_deref(), Some("sh"));
        assert_eq!(preview.code_blocks[1].text, "let two = 2;\n");
    }

    #[test]
    fn fenced_code_in_containers_gets_sentinels() {
        let preview = prepare(
            "> ```sh
> echo hi
> ```

1. item

   ```js
   let x = 1;
   ```
",
        );

        assert_eq!(preview.code_blocks.len(), 2);
        assert_eq!(
            preview.render_markdown.matches("data-hexer-code").count(),
            2
        );
        assert_eq!(preview.code_blocks[0].language.as_deref(), Some("sh"));
        assert_eq!(preview.code_blocks[1].language.as_deref(), Some("js"));
    }

    #[test]
    fn drops_user_supplied_code_sentinels_as_raw_html() {
        let source = "\
<div data-hexer-code=\"0\"></div>

```rust
fn main() {}
```
";
        let preview = prepare(source);

        assert_eq!(preview.code_blocks.len(), 1);
        assert_eq!(
            preview.render_markdown.matches("data-hexer-code").count(),
            1
        );
        assert!(!preview.markdown.contains("<div"));
    }

    #[test]
    fn readme_fixture_contains_rendered_constructs() {
        let preview = prepare(include_str!("../tests/fixtures/readme.md"));

        assert!(
            preview
                .tree
                .blocks
                .iter()
                .any(|block| block.kind == BlockKind::TableCell)
        );
        assert!(
            preview
                .code_blocks
                .iter()
                .any(|code| code.language.as_deref() == Some("sh"))
        );
        assert_eq!(
            preview.render_markdown.matches("data-hexer-code").count(),
            preview.code_blocks.len()
        );
    }

    struct StubImages;

    impl ImageSource for StubImages {
        fn resolve(&self, _scope: Option<&Path>, destination: &str) -> ImageTarget {
            match destination {
                "ok.png" => ImageTarget::Local(std::path::PathBuf::from("/scope/ok.png")),
                value if value.starts_with("https://") => ImageTarget::Remote,
                _ => ImageTarget::Alt,
            }
        }
    }

    #[test]
    fn extracts_image_and_link_destinations() {
        let source = "Before ![Alt *text*](ok.png) [site](https://example.com) and [bad](javascript:alert(1)).";
        let preview = prepare_with_images(source, None, &StubImages);

        assert_eq!(preview.tree.images.len(), 1);
        let image = &preview.tree.images[0];
        assert_eq!(image.alt, "Alt text");
        assert_eq!(image.destination, "ok.png");
        assert!(source[image.range.clone()].starts_with("![Alt *text*](ok.png)"));

        assert_eq!(preview.tree.links.len(), 2);
        assert_eq!(preview.tree.links[0].text, "site");
        assert_eq!(preview.tree.links[0].destination, "https://example.com");
        assert_eq!(preview.tree.links[1].destination, "javascript:alert(1)");
    }

    #[test]
    fn resolves_images_only_for_frames_after_the_first() {
        let source = "![one](ok.png)\n\n![remote](https://example.com/x.png)\n\n![bad](javascript:alert(1))\n";
        let preview = prepare_with_images(source, None, &StubImages);

        assert!(preview.render_markdown.contains("file:///scope/ok.png"));
        assert!(
            preview
                .render_markdown
                .contains("![remote](https://example.com/x.png)")
        );
        assert!(!preview.render_markdown.contains("javascript"));
        assert!(preview.render_markdown.contains("bad"));

        let first_frame = preview
            .first_frame_render_markdown
            .as_deref()
            .expect("images need a first-frame variant");
        assert!(first_frame.contains("one"));
        assert!(first_frame.contains("remote"));
        assert!(first_frame.contains("bad"));
        assert!(!first_frame.contains("file://"));
        assert!(!first_frame.contains("https://"));
        assert!(!first_frame.contains("!["));
        assert!(preview.first_frame_sections.is_some());
    }

    #[test]
    fn first_frame_variant_is_absent_without_images() {
        let preview = prepare("Just text.");
        assert!(preview.first_frame_render_markdown.is_none());
        assert!(preview.first_frame_sections.is_none());
    }

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
    fn code_copy_payload_trims_exactly_one_trailing_newline() {
        let payload = |text: &str| {
            FencedCode {
                language: None,
                text: text.to_owned(),
            }
            .copy_text()
        };

        assert_eq!(payload("one\n"), "one");
        assert_eq!(payload("one\r\n"), "one");
        assert_eq!(payload("one"), "one");
        assert_eq!(payload("one\n\n"), "one\n");
        assert_eq!(payload("one\r"), "one\r");
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
            "| a | b |\n|---|---|\n|",
            "- [x]",
            "~~unclosed",
            "[^1]: no reference",
            "```\n<not html>",
        ] {
            let _ = prepare(source);
        }
    }
}
