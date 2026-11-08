use std::path::PathBuf;

use rfd::{MessageButtons, MessageDialog, MessageDialogResult, MessageLevel};

use crate::domain::{ExternalChoice, GuardChoice};

pub trait Dialogs {
    fn open(&self) -> Option<PathBuf> {
        None
    }

    fn save_as(&self, suggested_name: &str) -> Option<PathBuf>;

    /// HTML Export destination. Export needs no new document state, so a
    /// cancelled dialog simply returns to the app.
    fn export_html(&self, _suggested_name: &str) -> Option<PathBuf> {
        None
    }

    /// Native Save / Don't Save / Cancel dialog. Closing it or pressing Esc
    /// is reported by rfd as anything but the two custom labels, i.e. Cancel.
    fn confirm_discard(&self, _title: &str) -> GuardChoice {
        GuardChoice::Cancel
    }

    /// Native Reload / Overwrite / Cancel dialog for a Dirty document that
    /// changed on disk.
    fn external_modified(&self, _title: &str) -> ExternalChoice {
        ExternalChoice::Cancel
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct NativeDialogs;

impl Dialogs for NativeDialogs {
    fn open(&self) -> Option<PathBuf> {
        rfd::FileDialog::new()
            .add_filter("Markdown Document", &["md", "markdown", "mdown"])
            .set_title("Open Markdown Document")
            .pick_file()
    }

    fn save_as(&self, suggested_name: &str) -> Option<PathBuf> {
        rfd::FileDialog::new()
            .add_filter("Markdown Document", &["md", "markdown", "mdown"])
            .set_title("Save Markdown Document")
            .set_file_name(suggested_name)
            .save_file()
    }

    fn export_html(&self, suggested_name: &str) -> Option<PathBuf> {
        rfd::FileDialog::new()
            .add_filter("HTML Document", &["html", "htm"])
            .set_title("Export HTML")
            .set_file_name(suggested_name)
            .save_file()
    }

    fn confirm_discard(&self, title: &str) -> GuardChoice {
        let result = MessageDialog::new()
            .set_level(MessageLevel::Warning)
            .set_title("Unsaved changes")
            .set_description(format!("Save changes to {title}?"))
            .set_buttons(MessageButtons::YesNoCancelCustom(
                "Save".to_owned(),
                "Don't Save".to_owned(),
                "Cancel".to_owned(),
            ))
            .show();
        map_guard(result)
    }

    fn external_modified(&self, title: &str) -> ExternalChoice {
        let result = MessageDialog::new()
            .set_level(MessageLevel::Warning)
            .set_title("File changed on disk")
            .set_description(format!(
                "\"{title}\" was changed on disk. Reload to keep the on-disk version, or Overwrite to keep your changes."
            ))
            .set_buttons(MessageButtons::YesNoCancelCustom(
                "Reload".to_owned(),
                "Overwrite".to_owned(),
                "Cancel".to_owned(),
            ))
            .show();
        map_external(result)
    }
}

fn map_guard(result: MessageDialogResult) -> GuardChoice {
    match result {
        MessageDialogResult::Custom(label) if label == "Save" => GuardChoice::Save,
        MessageDialogResult::Custom(label) if label == "Don't Save" => GuardChoice::DontSave,
        _ => GuardChoice::Cancel,
    }
}

fn map_external(result: MessageDialogResult) -> ExternalChoice {
    match result {
        MessageDialogResult::Custom(label) if label == "Reload" => ExternalChoice::Reload,
        MessageDialogResult::Custom(label) if label == "Overwrite" => ExternalChoice::Overwrite,
        _ => ExternalChoice::Cancel,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_labels_map_and_everything_else_cancels() {
        assert_eq!(
            map_guard(MessageDialogResult::Custom("Save".to_owned())),
            GuardChoice::Save
        );
        assert_eq!(
            map_guard(MessageDialogResult::Custom("Don't Save".to_owned())),
            GuardChoice::DontSave
        );
        for result in [
            MessageDialogResult::Custom("Cancel".to_owned()),
            MessageDialogResult::Cancel,
            MessageDialogResult::Ok,
        ] {
            assert_eq!(map_guard(result), GuardChoice::Cancel);
        }

        assert_eq!(
            map_external(MessageDialogResult::Custom("Reload".to_owned())),
            ExternalChoice::Reload
        );
        assert_eq!(
            map_external(MessageDialogResult::Custom("Overwrite".to_owned())),
            ExternalChoice::Overwrite
        );
        assert_eq!(
            map_external(MessageDialogResult::Cancel),
            ExternalChoice::Cancel
        );
    }
}
