/// Formats the native OS title bar text for a Document.
///
/// `format_window_title("Untitled.md", false)` → `Untitled.md — ALi-md-editor`
/// `format_window_title("notes.md", true)`  → `notes.md * — ALi-md-editor`
pub fn format_window_title(filename: &str, dirty: bool) -> String {
    let dirty_marker = if dirty { " *" } else { "" };
    format!("{filename}{dirty_marker} — ALi-md-editor")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_document_title_has_no_asterisk() {
        assert_eq!(
            format_window_title("Untitled.md", false),
            "Untitled.md — ALi-md-editor"
        );
    }

    #[test]
    fn dirty_document_title_has_asterisk_before_separator() {
        assert_eq!(
            format_window_title("notes.md", true),
            "notes.md * — ALi-md-editor"
        );
    }
}
