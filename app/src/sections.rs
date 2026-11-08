use std::collections::{HashMap, HashSet};
use std::ops::Range;

use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};

use crate::domain::DocumentId;

/// Top-level headings as collapsible Sections. Ranges point into the sanitized
/// render Markdown so each body can be rendered as its own segment.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Sections {
    pub preamble: Range<usize>,
    pub roots: Vec<Section>,
    /// Raw link reference definitions collected from the whole document. Each
    /// body segment re-appends them so references resolve across Sections.
    pub link_definitions: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Section {
    pub level: u8,
    pub title: String,
    pub key: String,
    pub heading: Range<usize>,
    pub body: Range<usize>,
    pub children: Vec<Section>,
}

impl Sections {
    pub fn parse(source: &str) -> Self {
        let mut headings = Vec::new();
        let mut list_depth = 0usize;
        let mut quote_depth = 0usize;
        let mut footnote_depth = 0usize;
        let mut open: Option<OpenHeading> = None;
        let options = Options::ENABLE_TABLES
            | Options::ENABLE_STRIKETHROUGH
            | Options::ENABLE_TASKLISTS
            | Options::ENABLE_FOOTNOTES;

        let mut parser = Parser::new_ext(source, options).into_offset_iter();
        for (event, range) in &mut parser {
            match event {
                Event::Start(Tag::Heading { level, .. }) => {
                    if list_depth == 0 && quote_depth == 0 && footnote_depth == 0 {
                        open = Some(OpenHeading {
                            level: level as u8,
                            title: String::new(),
                            start: range.start,
                            parser_end: range.end,
                        });
                    }
                }
                Event::End(TagEnd::Heading(_)) => {
                    if let Some(heading) = open.take() {
                        headings.push(Heading {
                            level: heading.level,
                            title: normalize(&heading.title),
                            start: heading.start,
                            body_start: heading_body_start(
                                source,
                                heading.start,
                                heading.parser_end,
                            ),
                        });
                    }
                }
                Event::Start(Tag::List(_)) => list_depth += 1,
                Event::End(TagEnd::List(_)) => list_depth = list_depth.saturating_sub(1),
                Event::Start(Tag::BlockQuote(_)) => quote_depth += 1,
                Event::End(TagEnd::BlockQuote(_)) => quote_depth = quote_depth.saturating_sub(1),
                Event::Start(Tag::FootnoteDefinition(_)) => footnote_depth += 1,
                Event::End(TagEnd::FootnoteDefinition) => {
                    footnote_depth = footnote_depth.saturating_sub(1)
                }
                Event::Text(text) | Event::Code(text) => {
                    if let Some(heading) = open.as_mut() {
                        heading.title.push_str(&text);
                    }
                }
                Event::SoftBreak | Event::HardBreak => {
                    if let Some(heading) = open.as_mut() {
                        heading.title.push(' ');
                    }
                }
                _ => {}
            }
        }

        let mut definitions: Vec<&str> = parser
            .reference_definitions()
            .iter()
            .filter_map(|(_, definition)| source.get(definition.span.clone()))
            .collect();
        definitions.sort_unstable();
        definitions.dedup();
        let link_definitions = definitions.join("\n");

        let preamble = 0..headings
            .first()
            .map_or(source.len(), |heading| heading.start);
        let Some(roots) = build_tree(source, &headings) else {
            return Self {
                preamble,
                roots: Vec::new(),
                link_definitions,
            };
        };
        Self {
            preamble,
            roots,
            link_definitions,
        }
    }

    pub fn keys(&self) -> Vec<&str> {
        fn walk<'a>(sections: &'a [Section], keys: &mut Vec<&'a str>) {
            for section in sections {
                keys.push(&section.key);
                walk(&section.children, keys);
            }
        }

        let mut keys = Vec::new();
        walk(&self.roots, &mut keys);
        keys
    }
}

impl Section {
    pub fn has_chevron(&self, source: &str) -> bool {
        !self.children.is_empty() || !source[self.body.clone()].trim().is_empty()
    }
}

/// Session-only collapse state, keyed by Document and Section identity.
#[derive(Default)]
pub struct SectionState {
    collapsed: HashMap<DocumentId, HashSet<String>>,
}

impl SectionState {
    pub fn collapsed_mut(&mut self, document_id: DocumentId) -> &mut HashSet<String> {
        self.collapsed.entry(document_id).or_default()
    }

    pub fn prune<'a>(
        &mut self,
        document_id: DocumentId,
        current_keys: impl IntoIterator<Item = &'a str>,
    ) {
        let Some(collapsed) = self.collapsed.get_mut(&document_id) else {
            return;
        };
        let current: HashSet<&str> = current_keys.into_iter().collect();
        collapsed.retain(|key| current.contains(key.as_str()));
    }

    pub fn retain_documents(&mut self, mut keep: impl FnMut(DocumentId) -> bool) {
        self.collapsed.retain(|document_id, _| keep(*document_id));
    }
}

struct OpenHeading {
    level: u8,
    title: String,
    start: usize,
    parser_end: usize,
}

struct Heading {
    level: u8,
    title: String,
    start: usize,
    body_start: usize,
}

fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn build_tree(source: &str, headings: &[Heading]) -> Option<Vec<Section>> {
    if headings.is_empty() {
        return None;
    }

    let mut parents: Vec<Option<usize>> = vec![None; headings.len()];
    let mut children: Vec<Vec<usize>> = vec![Vec::new(); headings.len()];
    let mut section_ends: Vec<usize> = vec![source.len(); headings.len()];
    let mut stack: Vec<usize> = Vec::new();
    for (index, heading) in headings.iter().enumerate() {
        while let Some(&top) = stack.last() {
            if headings[top].level < heading.level {
                break;
            }
            section_ends[top] = heading.start;
            stack.pop();
        }
        parents[index] = stack.last().copied();
        if let Some(parent) = parents[index] {
            children[parent].push(index);
        }
        stack.push(index);
    }

    let roots = (0..headings.len())
        .filter(|index| parents[*index].is_none())
        .collect::<Vec<_>>();
    Some(build_children(
        &roots,
        "",
        headings,
        &children,
        &section_ends,
    ))
}

fn build_children(
    indexes: &[usize],
    parent_key: &str,
    headings: &[Heading],
    children: &[Vec<usize>],
    section_ends: &[usize],
) -> Vec<Section> {
    let mut occurrences: HashMap<(u8, String), usize> = HashMap::new();
    let mut sections = Vec::with_capacity(indexes.len());
    for &index in indexes {
        let heading = &headings[index];
        let normalized_key = heading.title.to_lowercase();
        let occurrence = occurrences
            .entry((heading.level, normalized_key.clone()))
            .or_insert(0);
        let key = format!(
            "{parent_key}\u{1f}{}\u{1f}{normalized_key}\u{1f}{occurrence}",
            heading.level
        );
        *occurrence += 1;

        let body_end = children[index]
            .first()
            .map_or(section_ends[index], |child| headings[*child].start);
        sections.push(Section {
            level: heading.level,
            title: heading.title.clone(),
            key: key.clone(),
            heading: heading.start..heading.body_start,
            body: heading.body_start..body_end.max(heading.body_start),
            children: build_children(&children[index], &key, headings, children, section_ends),
        });
    }
    sections
}

/// Find the first byte after the heading block. Heading ranges vary in whether
/// they include the newline or Setext underline, so detect the ATX line or the
/// first underline explicitly.
fn heading_body_start(source: &str, start: usize, parser_end: usize) -> usize {
    let first_line_end = line_end(source, start);
    if is_atx(&source[start..first_line_end]) {
        return first_line_end;
    }

    let mut line_start = start;
    while line_start < source.len() {
        let end = line_end(source, line_start);
        let line = &source[line_start..end];
        if is_setext_underline(line) {
            return end;
        }
        line_start = end;
    }
    parser_end.min(source.len())
}

fn line_end(source: &str, start: usize) -> usize {
    source[start..]
        .find('\n')
        .map_or(source.len(), |offset| start + offset + 1)
}

fn is_atx(line: &str) -> bool {
    let trimmed = line.trim_start();
    let hashes = trimmed
        .chars()
        .take_while(|character| *character == '#')
        .count();
    if !(1..=6).contains(&hashes) {
        return false;
    }
    matches!(trimmed.as_bytes().get(hashes), None | Some(b' ' | b'\t'))
}

fn is_setext_underline(line: &str) -> bool {
    let trimmed = line.trim();
    !trimmed.is_empty()
        && (trimmed.chars().all(|character| character == '=')
            || trimmed.chars().all(|character| character == '-'))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(source: &str) -> Sections {
        Sections::parse(source)
    }

    fn titles(sections: &[Section]) -> Vec<(u8, &str)> {
        sections
            .iter()
            .map(|section| (section.level, section.title.as_str()))
            .collect()
    }

    #[test]
    fn atx_and_setext_headings_become_sections() {
        let source = "# One\n\nbody one\n\nTwo\n---\n\nbody two\n";
        let sections = parsed(source);

        assert_eq!(titles(&sections.roots), vec![(1, "One")]);
        assert_eq!(titles(&sections.roots[0].children), vec![(2, "Two")]);
        assert_eq!(&source[sections.roots[0].heading.clone()], "# One\n");
        assert_eq!(
            &source[sections.roots[0].children[0].heading.clone()],
            "Two\n---\n"
        );
        assert_eq!(source[sections.roots[0].body.clone()].trim(), "body one");
        assert_eq!(
            source[sections.roots[0].children[0].body.clone()].trim(),
            "body two"
        );
    }

    #[test]
    fn content_before_the_first_heading_is_preamble() {
        let source = "intro\n\n# One\n\nbody\n";
        let sections = parsed(source);

        assert_eq!(source[sections.preamble.clone()].trim(), "intro");
        assert_eq!(titles(&sections.roots), vec![(1, "One")]);
    }

    #[test]
    fn headings_inside_lists_and_blockquotes_are_not_sections() {
        let source = "- item\n\n  # In list\n\n> # In quote\n\n# Real\n\nbody\n";
        let sections = parsed(source);

        assert_eq!(titles(&sections.roots), vec![(1, "Real")]);
    }

    #[test]
    fn nested_headings_become_child_sections_and_bound_bodies() {
        let source = "# A\na\n## B\nb\n### C\nc\n## D\nd\n# E\ne\n";
        let sections = parsed(source);

        assert_eq!(titles(&sections.roots), vec![(1, "A"), (1, "E")]);
        let a = &sections.roots[0];
        assert_eq!(titles(&a.children), vec![(2, "B"), (2, "D")]);
        assert_eq!(titles(&a.children[0].children), vec![(3, "C")]);
        assert_eq!(source[a.body.clone()].trim(), "a");
        assert_eq!(source[a.children[0].body.clone()].trim(), "b");
        assert_eq!(source[a.children[1].body.clone()].trim(), "d");
    }

    #[test]
    fn duplicate_heading_identity_includes_parent_and_occurrence() {
        let source = "# Intro\na\n## Intro\nb\n# Intro\nc\n## Intro\nd\n";
        let sections = parsed(source);

        let first = &sections.roots[0];
        let second = &sections.roots[1];
        assert_ne!(first.key, second.key);
        assert_ne!(first.children[0].key, second.children[0].key);
        assert_ne!(first.key, first.children[0].key);

        let same_parent = parsed("# A\n## Same\nx\n## Same\ny\n");
        assert_ne!(
            same_parent.roots[0].children[0].key,
            same_parent.roots[0].children[1].key
        );
    }

    #[test]
    fn heading_without_following_content_has_no_chevron() {
        let empty = parsed("# Empty\n");
        assert!(!empty.roots[0].has_chevron("# Empty\n"));

        let with_child = parsed("# Parent\n\n## Child\n\nbody\n");
        assert!(with_child.roots[0].has_chevron("# Parent\n\n## Child\n\nbody\n"));
    }

    #[test]
    fn inline_formatting_is_flattened_into_the_title() {
        let sections = parsed("# **Bold** and `code`\n\nbody\n");
        assert_eq!(sections.roots[0].title, "Bold and code");
    }

    #[test]
    fn keys_cover_the_whole_tree() {
        let sections = parsed("# A\n\n## B\n\nbody\n");
        assert_eq!(sections.keys().len(), 2);
    }

    #[test]
    fn reference_definitions_are_available_to_every_segment() {
        let source = "# A\n\n[link][ref]\n\n# B\n\n[ref]: https://example.com \"Title\"\n";
        let sections = parsed(source);

        assert!(
            sections
                .link_definitions
                .contains("[ref]: https://example.com")
        );
        assert!(!sections.link_definitions.contains("[^"));
    }

    #[test]
    fn collapse_state_prunes_to_current_keys() {
        let mut state = SectionState::default();
        state.collapsed_mut(1).insert("kept".to_owned());
        state.collapsed_mut(1).insert("gone".to_owned());
        state.collapsed_mut(2).insert("other-document".to_owned());

        state.prune(1, ["kept"]);

        let collapsed = state.collapsed_mut(1);
        assert!(collapsed.contains("kept"));
        assert!(!collapsed.contains("gone"));
        assert_eq!(state.collapsed.get(&2).map(HashSet::len), Some(1));

        state.retain_documents(|document_id| document_id == 1);
        assert_eq!(state.collapsed.len(), 1);
    }
}
