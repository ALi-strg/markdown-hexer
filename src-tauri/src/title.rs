/// Formats the native OS title bar text for a Document.
///
/// `format_window_title("Untitled.md", false)` → `Untitled.md — Markdown-Magic`
/// `format_window_title("notes.md", true)`  → `notes.md * — Markdown-Magic`
pub fn format_window_title(filename: &str, dirty: bool) -> String {
    let dirty_marker = if dirty { " *" } else { "" };
    format!("{filename}{dirty_marker} — Markdown-Magic")
}

/// Linux-only Wayland workaround: the compositor-drawn titlebar is the GTK
/// client-side-decorations header bar, which does not follow `set_title`, so
/// it stays stuck on the initial title. After `set_title`, sync that header
/// bar's title too.
///
/// Defensive by contract — a silent no-op when there is no CSD titlebar
/// (`titlebar()` returns `None`, e.g. X11 / server-side decorations), when
/// the titlebar is not a `HeaderBar` (downcast fails), or when the main
/// thread is already shutting down. GTK widgets are only safe to touch on the
/// GTK main thread, so the whole chain runs inside `run_on_main_thread`;
/// `gtk_window()` itself is a thread-safe proxy to that thread.
#[cfg(target_os = "linux")]
pub fn sync_csd_titlebar(window: tauri::Window, title: String) {
    use tauri::Manager;

    let _ = window.clone().app_handle().run_on_main_thread(move || {
        use gtk::prelude::*;

        let Ok(gtk_window) = window.gtk_window() else {
            return;
        };
        let Some(titlebar) = gtk_window.titlebar() else {
            return;
        };
        let Ok(header_bar) = titlebar.downcast::<gtk::HeaderBar>() else {
            return;
        };
        header_bar.set_title(Some(&title));
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_document_title_has_no_asterisk() {
        assert_eq!(
            format_window_title("Untitled.md", false),
            "Untitled.md — Markdown-Magic"
        );
    }

    #[test]
    fn dirty_document_title_has_asterisk_before_separator() {
        assert_eq!(
            format_window_title("notes.md", true),
            "notes.md * — Markdown-Magic"
        );
    }
}
