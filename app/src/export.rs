//! HTML Export: one standalone HTML file from a Document's in-memory Markdown.
//!
//! The Markdown goes through the same parser and raw-HTML policy as the
//! Preview: GFM tables, strikethrough, task lists and footnotes are enabled,
//! raw HTML is dropped, and every piece of text is escaped. Local images are
//! inlined as base64 data URLs through the Document-directory scope; remote
//! images keep their URL; a missing or unreadable image degrades to its alt
//! text instead of failing the export. No scripts, remote CSS, or fonts are
//! included, so the file renders on its own.

use std::fmt::Write as _;
use std::path::Path;

use egui::Color32;
use egui_extras::syntax_highlighting::{CodeTheme, TokenType, highlight};
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};

use crate::image::{ImageSource, ImageTarget};
use crate::settings::{FontChoice, TextSize};
use crate::ui::Palette;

/// Everything the HTML template needs from the running app. The Markdown and
/// Document scope come from the Document itself, so exporting never mutates it.
pub struct ExportOptions<'a> {
    pub title: &'a str,
    pub palette: Palette,
    pub font: FontChoice,
    pub text_size: TextSize,
    pub scope: Option<&'a Path>,
    pub images: &'a dyn ImageSource,
    /// Syntax highlighting shares egui's memo cache with the Preview.
    pub ctx: &'a egui::Context,
}

pub fn document(source: &str, options: &ExportOptions) -> String {
    let mut body = String::with_capacity(source.len() * 2);
    render_body(source, options, &mut body);

    let mut html = String::with_capacity(body.len() + 4096);
    html.push_str("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n");
    html.push_str("<meta charset=\"utf-8\">\n");
    html.push_str("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n");
    let _ = writeln!(html, "<title>{}</title>", escape(options.title));
    html.push_str("<style>\n");
    html.push_str(&stylesheet(options));
    html.push_str("</style>\n</head>\n<body>\n<main>\n");
    html.push_str(&body);
    html.push_str("</main>\n</body>\n</html>\n");
    html
}

/// The Palette-to-CodeTheme mapping, shared with the Preview so exported code
/// blocks carry the same syntax colors.
pub fn code_theme(style: &egui::Style, palette: &Palette) -> CodeTheme {
    let mut theme = CodeTheme::light(egui::TextStyle::Monospace.resolve(style).size);
    theme.format_mut(TokenType::Comment).color = palette.syntax_comment;
    theme.format_mut(TokenType::Keyword).color = palette.syntax_keyword;
    theme.format_mut(TokenType::StringLiteral).color = palette.syntax_string;
    theme.format_mut(TokenType::Literal).color = palette.syntax_number;
    theme.format_mut(TokenType::Function).color = palette.syntax_function;
    theme.format_mut(TokenType::Punctuation).color = palette.syntax_punctuation;
    theme
}

struct ImageState {
    destination: String,
    alt: String,
}

struct CodeState {
    language: Option<String>,
    text: String,
}

fn render_body(source: &str, options: &ExportOptions, out: &mut String) {
    let options_cmark = Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_FOOTNOTES;
    let mut links: Vec<bool> = Vec::new();
    let mut lists: Vec<bool> = Vec::new();
    let mut image: Option<ImageState> = None;
    let mut code: Option<CodeState> = None;
    let mut table_head = false;

    for event in Parser::new_ext(source, options_cmark) {
        match event {
            Event::Start(tag) => match tag {
                Tag::Paragraph => out.push_str("<p>"),
                Tag::Heading { level, .. } => {
                    let _ = write!(out, "<h{}>", heading_level(level));
                }
                Tag::BlockQuote(_) => out.push_str("<blockquote>\n"),
                Tag::CodeBlock(kind) => {
                    let language = match kind {
                        pulldown_cmark::CodeBlockKind::Fenced(info) => {
                            info.split_whitespace().next().map(str::to_owned)
                        }
                        pulldown_cmark::CodeBlockKind::Indented => None,
                    };
                    code = Some(CodeState {
                        language,
                        text: String::new(),
                    });
                }
                Tag::List(start) => match start {
                    Some(1) => {
                        lists.push(true);
                        out.push_str("<ol>\n");
                    }
                    Some(number) => {
                        lists.push(true);
                        let _ = writeln!(out, "<ol start=\"{number}\">");
                    }
                    None => {
                        lists.push(false);
                        out.push_str("<ul>\n");
                    }
                },
                Tag::Item => out.push_str("<li>"),
                Tag::Emphasis => {
                    if image.is_none() {
                        out.push_str("<em>");
                    }
                }
                Tag::Strong => {
                    if image.is_none() {
                        out.push_str("<strong>");
                    }
                }
                Tag::Strikethrough => {
                    if image.is_none() {
                        out.push_str("<del>");
                    }
                }
                Tag::Link { dest_url, .. } => {
                    let allowed = crate::platform::is_allowed_url(&dest_url);
                    if allowed && image.is_none() {
                        let _ = write!(out, "<a href=\"{}\">", escape(&dest_url));
                    }
                    links.push(allowed);
                }
                Tag::Image { dest_url, .. } => {
                    image = Some(ImageState {
                        destination: dest_url.to_string(),
                        alt: String::new(),
                    });
                }
                Tag::Table(_) => out.push_str("<table>\n"),
                Tag::TableHead => {
                    table_head = true;
                    out.push_str("<thead>\n<tr>");
                }
                Tag::TableRow => out.push_str("<tr>"),
                Tag::TableCell => {
                    if table_head {
                        out.push_str("<th>");
                    } else {
                        out.push_str("<td>");
                    }
                }
                Tag::FootnoteDefinition(label) => {
                    let _ = write!(
                        out,
                        "<div class=\"footnote\" id=\"fn-{}\"><span class=\"footnote-label\">[{}]</span> ",
                        escape(&label),
                        escape(&label)
                    );
                }
                _ => {}
            },
            Event::End(tag) => match tag {
                TagEnd::Paragraph => out.push_str("</p>\n"),
                TagEnd::Heading(level) => {
                    let _ = writeln!(out, "</h{}>", heading_level(level));
                }
                TagEnd::BlockQuote(_) => out.push_str("</blockquote>\n"),
                TagEnd::CodeBlock => {
                    if let Some(code) = code.take() {
                        push_code_block(out, options, code.language.as_deref(), &code.text);
                    }
                }
                TagEnd::List(_) => {
                    if lists.pop().unwrap_or(false) {
                        out.push_str("</ol>\n");
                    } else {
                        out.push_str("</ul>\n");
                    }
                }
                TagEnd::Item => out.push_str("</li>\n"),
                TagEnd::Emphasis => {
                    if image.is_none() {
                        out.push_str("</em>");
                    }
                }
                TagEnd::Strong => {
                    if image.is_none() {
                        out.push_str("</strong>");
                    }
                }
                TagEnd::Strikethrough => {
                    if image.is_none() {
                        out.push_str("</del>");
                    }
                }
                TagEnd::Link => {
                    let allowed = links.pop().unwrap_or(false);
                    if allowed && image.is_none() {
                        out.push_str("</a>");
                    }
                }
                TagEnd::Image => {
                    if let Some(image) = image.take() {
                        push_image(out, options, &image);
                    }
                }
                TagEnd::Table => out.push_str("</table>\n"),
                TagEnd::TableHead => {
                    table_head = false;
                    out.push_str("</tr>\n</thead>\n");
                }
                TagEnd::TableRow => out.push_str("</tr>\n"),
                TagEnd::TableCell => {
                    if table_head {
                        out.push_str("</th>");
                    } else {
                        out.push_str("</td>");
                    }
                }
                TagEnd::FootnoteDefinition => out.push_str("</div>\n"),
                _ => {}
            },
            Event::Text(text) => {
                if let Some(image) = image.as_mut() {
                    image.alt.push_str(&text);
                } else if let Some(code) = code.as_mut() {
                    code.text.push_str(&text);
                } else {
                    out.push_str(&escape(&text));
                }
            }
            Event::Code(text) => {
                if let Some(image) = image.as_mut() {
                    image.alt.push_str(&text);
                } else {
                    let _ = write!(out, "<code>{}</code>", escape(&text));
                }
            }
            // Raw HTML keeps the Preview policy: dropped, not sanitized.
            Event::Html(_) | Event::InlineHtml(_) => {}
            Event::SoftBreak => {
                if let Some(image) = image.as_mut() {
                    image.alt.push(' ');
                } else {
                    out.push('\n');
                }
            }
            Event::HardBreak => {
                if let Some(image) = image.as_mut() {
                    image.alt.push(' ');
                } else {
                    out.push_str("<br>\n");
                }
            }
            Event::Rule => out.push_str("<hr>\n"),
            Event::TaskListMarker(checked) => {
                if checked {
                    out.push_str("<input type=\"checkbox\" checked disabled> ");
                } else {
                    out.push_str("<input type=\"checkbox\" disabled> ");
                }
            }
            Event::FootnoteReference(label) => {
                let _ = write!(
                    out,
                    "<sup class=\"footnote-ref\"><a href=\"#fn-{}\">[{}]</a></sup>",
                    escape(&label),
                    escape(&label)
                );
            }
            _ => {}
        }
    }
}

fn heading_level(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

fn push_code_block(out: &mut String, options: &ExportOptions, language: Option<&str>, text: &str) {
    out.push_str("<pre><code");
    if let Some(language) = language {
        let _ = write!(out, " class=\"language-{}\"", escape(language));
    }
    out.push('>');
    let style = egui::Style::default();
    let job = highlight(
        options.ctx,
        &style,
        &code_theme(&style, &options.palette),
        text,
        language.unwrap_or(""),
    );
    let mut cursor = 0;
    for section in &job.sections {
        let range = section.byte_range.clone();
        let start: usize = range.start.into();
        let end: usize = range.end.into();
        if start < cursor || end > job.text.len() {
            continue;
        }
        out.push_str(&escape(&job.text[cursor..start]));
        let slice = &job.text[start..end];
        let color = section.format.color;
        if color.a() == 0 || color == Color32::PLACEHOLDER {
            out.push_str(&escape(slice));
        } else {
            let _ = write!(
                out,
                "<span style=\"color:{}\">{}</span>",
                hex(color),
                escape(slice)
            );
        }
        cursor = end;
    }
    out.push_str(&escape(&job.text[cursor..]));
    out.push_str("</code></pre>\n");
}

fn push_image(out: &mut String, options: &ExportOptions, image: &ImageState) {
    let alt = image.alt.replace(['\n', '\r'], " ");
    match options.images.resolve(options.scope, &image.destination) {
        ImageTarget::Local(path) => {
            match std::fs::read(&path).ok().map(|bytes| (mime(&path), bytes)) {
                Some((mime, bytes)) => {
                    let _ = write!(
                        out,
                        "<img src=\"data:{mime};base64,{}\" alt=\"{}\">",
                        base64(&bytes),
                        escape(&alt)
                    );
                }
                None => push_alt(out, &alt),
            }
        }
        ImageTarget::Remote => {
            let _ = write!(
                out,
                "<img src=\"{}\" alt=\"{}\">",
                escape(&image.destination),
                escape(&alt)
            );
        }
        ImageTarget::Alt => push_alt(out, &alt),
    }
}

fn push_alt(out: &mut String, alt: &str) {
    if !alt.trim().is_empty() {
        let _ = write!(out, "<span class=\"image-alt\">{}</span>", escape(alt));
    }
}

fn mime(path: &Path) -> &'static str {
    match path
        .extension()
        .map(|extension| extension.to_string_lossy().to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("avif") => "image/avif",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let first = chunk[0] as u32;
        let second = chunk.get(1).copied().unwrap_or(0) as u32;
        let third = chunk.get(2).copied().unwrap_or(0) as u32;
        let value = (first << 16) | (second << 8) | third;
        output.push(ALPHABET[(value >> 18) as usize & 63] as char);
        output.push(ALPHABET[(value >> 12) as usize & 63] as char);
        output.push(if chunk.len() > 1 {
            ALPHABET[(value >> 6) as usize & 63] as char
        } else {
            '='
        });
        output.push(if chunk.len() > 2 {
            ALPHABET[value as usize & 63] as char
        } else {
            '='
        });
    }
    output
}

fn escape(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());
    for character in text.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(character),
        }
    }
    escaped
}

fn hex(color: Color32) -> String {
    format!("#{:02x}{:02x}{:02x}", color.r(), color.g(), color.b())
}

fn font_stack(font: FontChoice) -> &'static str {
    match font {
        FontChoice::Default => "system-ui, -apple-system, \"Segoe UI\", Roboto, Arial, sans-serif",
        FontChoice::Serif => "Georgia, \"Times New Roman\", Times, serif",
        FontChoice::Sans => "\"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
        FontChoice::Mono => MONO_STACK,
    }
}

const MONO_STACK: &str =
    "ui-monospace, \"Cascadia Code\", \"JetBrains Mono\", Consolas, \"Liberation Mono\", monospace";

fn stylesheet(options: &ExportOptions) -> String {
    let palette = options.palette;
    format!(
        "\
:root {{
  --bg: {bg};
  --surface: {surface};
  --ink: {ink};
  --muted: {muted};
  --border: {border};
  --accent: {accent};
  --accent-contrast: {accent_contrast};
  --code-bg: {code_bg};
  --syntax-comment: {syntax_comment};
  --syntax-keyword: {syntax_keyword};
  --syntax-punctuation: {syntax_punctuation};
  --syntax-string: {syntax_string};
  --syntax-number: {syntax_number};
  --syntax-function: {syntax_function};
  --link: {link};
}}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; padding: 0; background: var(--bg); color: var(--ink); }}
body {{
  font-family: {font};
  font-size: {size}px;
  line-height: 1.65;
  -webkit-text-size-adjust: 100%;
}}
main {{ max-width: 46rem; margin: 0 auto; padding: 3rem 1.5rem 5rem; }}
h1, h2, h3, h4, h5, h6 {{ line-height: 1.25; margin: 2rem 0 0.75rem; }}
h1 {{ font-size: 2em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }}
h2 {{ font-size: 1.5em; border-bottom: 1px solid var(--border); padding-bottom: 0.25em; }}
h3 {{ font-size: 1.25em; }}
h4, h5, h6 {{ font-size: 1em; }}
p, ul, ol, blockquote, pre, table {{ margin: 0 0 1rem; }}
a {{ color: var(--link); text-decoration: underline; text-underline-offset: 2px; }}
strong {{ font-weight: 700; }}
del {{ color: var(--muted); }}
hr {{ border: 0; border-top: 1px solid var(--border); margin: 2rem 0; }}
blockquote {{
  margin-left: 0;
  padding: 0.25rem 0 0.25rem 1rem;
  border-left: 3px solid var(--accent);
  color: var(--muted);
}}
ul, ol {{ padding-left: 1.6rem; }}
li {{ margin: 0.2rem 0; }}
li > input[type=\"checkbox\"] {{ margin-right: 0.5rem; accent-color: var(--accent); }}
code {{
  font-family: {mono};
  font-size: 0.9em;
  background: var(--code-bg);
  border: 1px solid var(--border);
  padding: 0.1em 0.35em;
}}
pre {{
  background: var(--code-bg);
  border: 1px solid var(--border);
  padding: 0.9rem 1rem;
  overflow-x: auto;
  line-height: 1.45;
}}
pre code {{ background: none; border: 0; padding: 0; font-size: 0.9em; white-space: pre; }}
table {{ border-collapse: collapse; width: auto; max-width: 100%; }}
th, td {{ border: 1px solid var(--border); padding: 0.4rem 0.7rem; text-align: left; vertical-align: top; }}
th {{ background: var(--surface); font-weight: 700; }}
img {{ max-width: 100%; height: auto; border: 1px solid var(--border); }}
.image-alt {{ color: var(--muted); font-style: italic; }}
.footnote {{
  border-top: 1px solid var(--border);
  margin-top: 2rem;
  padding-top: 0.5rem;
  color: var(--muted);
  font-size: 0.9em;
}}
.footnote-ref a {{ text-decoration: none; }}
",
        bg = hex(palette.bg),
        surface = hex(palette.surface),
        ink = hex(palette.ink),
        muted = hex(palette.muted),
        border = hex(palette.border),
        accent = hex(palette.accent),
        accent_contrast = hex(palette.accent_contrast),
        code_bg = hex(palette.code_bg),
        syntax_comment = hex(palette.syntax_comment),
        syntax_keyword = hex(palette.syntax_keyword),
        syntax_punctuation = hex(palette.syntax_punctuation),
        syntax_string = hex(palette.syntax_string),
        syntax_number = hex(palette.syntax_number),
        syntax_function = hex(palette.syntax_function),
        link = hex(palette.link),
        font = font_stack(options.font),
        mono = MONO_STACK,
        size = options.text_size.preview_size(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::image::NativeImageSource;

    fn context() -> egui::Context {
        egui::Context::default()
    }

    fn options<'a>(palette: Palette, scope: Option<&'a Path>) -> ExportOptions<'a> {
        ExportOptions {
            title: "exported.md",
            palette,
            font: FontChoice::Default,
            text_size: TextSize::Medium,
            scope,
            images: &NativeImageSource,
            ctx: Box::leak(Box::new(context())),
        }
    }

    #[test]
    fn exports_gfm_blocks_and_footnotes() {
        let source = "\
# Title

Sub
---

| Name | Value |
| :--- | ---: |
| alpha | 1 |

> quoted

---

- [x] done
- [ ] todo

1. first

Use `code`.

```rust
fn main() {}
```

~~gone~~

See note[^1].

[^1]: Footnote text.
";
        let html = document(source, &options(Palette::LIGHT, None));

        assert!(html.contains("<h1>Title</h1>"));
        assert!(html.contains("<h2>Sub</h2>"));
        assert!(html.contains("<table>"));
        assert!(html.contains("<th>Name</th>"));
        assert!(html.contains("<blockquote>"));
        assert!(html.contains("<hr>"));
        assert!(html.contains("<input type=\"checkbox\" checked disabled>"));
        assert!(html.contains("<input type=\"checkbox\" disabled>"));
        assert!(html.contains("<ol>"));
        assert!(html.contains("</ol>"));
        assert!(html.contains("</ul>"));
        assert!(html.contains("<code>code</code>"));
        assert!(html.contains("<pre><code class=\"language-rust\">"));
        assert!(html.contains("<del>gone</del>"));
        assert!(html.contains("class=\"footnote-ref\""));
        assert!(html.contains("class=\"footnote\" id=\"fn-1\""));
        assert!(!html.contains("<script"));
        assert!(!html.contains("<details"));
        assert!(!html.contains("onclick"));
    }

    #[test]
    fn drops_raw_html_and_scripts() {
        let source = "\
<div>
secret
</div>

Hello <b>world</b>.

<script>alert(1)</script>
";
        let html = document(source, &options(Palette::LIGHT, None));

        assert!(!html.contains("<div"));
        assert!(!html.contains("secret"));
        assert!(!html.contains("alert"));
        assert!(!html.contains("<script"));
        assert!(html.contains("Hello world."));
    }

    #[test]
    fn escapes_text_and_the_title() {
        let mut options = options(Palette::LIGHT, None);
        options.title = "a < b & \"c\".md";
        let html = document("5 < 6 & \"quotes\" and 'apostrophes'", &options);

        assert!(html.contains("5 &lt; 6 &amp; &quot;quotes&quot; and &#39;apostrophes&#39;"));
        assert!(html.contains("<title>a &lt; b &amp; &quot;c&quot;.md</title>"));
    }

    #[test]
    fn keeps_allowed_links_and_drops_unsafe_hrefs() {
        let source = "\
[good](https://example.com) [mail](mailto:me@example.com) \
[bad](javascript:alert) [relative](other.md)
";
        let html = document(source, &options(Palette::LIGHT, None));

        assert!(html.contains("<a href=\"https://example.com\">good</a>"));
        assert!(html.contains("<a href=\"mailto:me@example.com\">mail</a>"));
        assert!(html.contains("bad"));
        assert!(!html.contains("javascript"));
        assert!(!html.contains("href=\"other.md\""));
        assert!(html.contains("relative"));
    }

    #[test]
    fn inlines_local_images_and_passes_remote_urls_through() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("one.png"), b"hello").unwrap();
        let source =
            "![local](one.png)\n\n![a *b*](one.png)\n\n![remote](https://example.com/x.png)\n";
        let html = document(source, &options(Palette::LIGHT, Some(directory.path())));

        assert!(html.contains("src=\"data:image/png;base64,aGVsbG8=\""));
        assert!(html.contains("alt=\"local\""));
        assert!(html.contains("alt=\"a b\""));
        assert!(!html.contains("<em>"));
        assert!(html.contains("<img src=\"https://example.com/x.png\" alt=\"remote\">"));
    }

    #[test]
    fn missing_and_out_of_scope_images_degrade_to_alt_text() {
        let directory = tempfile::tempdir().unwrap();
        let source = "![missing](gone.png) ![outside](../outside.png) ![empty]()";
        let html = document(source, &options(Palette::LIGHT, Some(directory.path())));

        assert!(!html.contains("<img"));
        assert!(html.contains("<span class=\"image-alt\">missing</span>"));
        assert!(html.contains("<span class=\"image-alt\">outside</span>"));
        assert!(!html.contains("![empty]"));
        assert!(html.contains("</html>"));
    }

    #[test]
    fn stylesheet_derives_from_palette_font_and_text_size() {
        let mut options = options(Palette::DARK, None);
        options.font = FontChoice::Mono;
        options.text_size = TextSize::Large;
        let html = document("text", &options);

        assert!(html.contains("--bg: #0f1826"));
        assert!(html.contains("--ink: #e6ecf5"));
        assert!(html.contains("--code-bg: #0b1320"));
        assert!(html.contains("--accent: #4d7cfe"));
        assert!(html.contains("font-size: 17px"));
        assert!(html.contains("font-family: ui-monospace"));
        assert!(!html.contains("<link"));
        assert!(!html.contains("@import"));
        assert!(!html.contains("http://"));
        assert!(!html.contains("https://"));
    }

    #[test]
    fn shared_readme_fixture_exports_preview_constructs() {
        let html = document(
            include_str!("../tests/fixtures/readme.md"),
            &options(Palette::LIGHT, None),
        );

        assert!(html.contains("<table>"));
        assert!(html.contains("<pre><code class=\"language-sh\">"));
        assert!(html.contains("<h1>Markdown Hexer</h1>"));
        assert!(html.contains("image-alt"));
        assert!(!html.contains("<script"));
    }
}
