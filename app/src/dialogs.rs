use std::path::PathBuf;

/// Native dialogs sit behind this trait so the domain and tests never need a
/// windowing system. Called only when a Save As actually needs a path.
pub trait Dialogs {
    fn save_as(&self, suggested_name: &str) -> Option<PathBuf>;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct NativeDialogs;

impl Dialogs for NativeDialogs {
    fn save_as(&self, suggested_name: &str) -> Option<PathBuf> {
        rfd::FileDialog::new()
            .set_title("Save Markdown Document")
            .set_file_name(suggested_name)
            .add_filter("Markdown", &["md", "markdown"])
            .save_file()
    }
}
