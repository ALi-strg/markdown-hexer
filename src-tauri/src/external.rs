use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogResult};

const RELOAD: &str = "reload";
const OVERWRITE: &str = "overwrite";
const CANCEL: &str = "cancel";

/// Maps the native Externally-Modified dialog result to the choice strings the
/// frontend expects. Anything other than Reload / Overwrite is Cancel.
pub fn map_dialog_result(result: MessageDialogResult) -> &'static str {
    match result {
        MessageDialogResult::Custom(label) if label == "Reload" => RELOAD,
        MessageDialogResult::Custom(label) if label == "Overwrite" => OVERWRITE,
        _ => CANCEL,
    }
}

/// Shows the native Reload / Overwrite / Cancel dialog for an
/// Externally-Modified Dirty Document and returns the choice.
#[tauri::command]
pub async fn show_external_modified(window: tauri::Window, filename: String) -> String {
    let result = window
        .app_handle()
        .dialog()
        .message(format!(
            "\"{filename}\" was changed on disk. Reload to keep the on-disk version, or Overwrite to keep your changes."
        ))
        .title("File changed on disk")
        .buttons(MessageDialogButtons::YesNoCancelCustom(
            "Reload".to_string(),
            "Overwrite".to_string(),
            "Cancel".to_string(),
        ))
        .parent(&window)
        .blocking_show_with_result();
    map_dialog_result(result).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_the_reload_button() {
        assert_eq!(
            map_dialog_result(MessageDialogResult::Custom("Reload".to_string())),
            RELOAD
        );
    }

    #[test]
    fn maps_the_overwrite_button() {
        assert_eq!(
            map_dialog_result(MessageDialogResult::Custom("Overwrite".to_string())),
            OVERWRITE
        );
    }

    #[test]
    fn maps_the_cancel_button() {
        assert_eq!(
            map_dialog_result(MessageDialogResult::Custom("Cancel".to_string())),
            CANCEL
        );
    }

    #[test]
    fn anything_else_is_cancel() {
        assert_eq!(map_dialog_result(MessageDialogResult::Yes), CANCEL);
        assert_eq!(map_dialog_result(MessageDialogResult::No), CANCEL);
        assert_eq!(map_dialog_result(MessageDialogResult::Ok), CANCEL);
        assert_eq!(map_dialog_result(MessageDialogResult::Custom("maybe".to_string())), CANCEL);
    }
}
