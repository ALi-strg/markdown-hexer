use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogResult};

const SAVE: &str = "save";
const DONT_SAVE: &str = "dont-save";
const CANCEL: &str = "cancel";

/// Maps the native Confirm-Discard Guard result to the choice strings the
/// frontend guard expects. Anything other than Save / Don't Save is Cancel.
pub fn map_dialog_result(result: MessageDialogResult) -> &'static str {
    match result {
        MessageDialogResult::Custom(label) if label == "Save" => SAVE,
        MessageDialogResult::Custom(label) if label == "Don't Save" => DONT_SAVE,
        _ => CANCEL,
    }
}

/// Shows the native Save / Don't Save / Cancel dialog and returns the choice.
#[tauri::command]
pub async fn show_confirm_discard(window: tauri::Window, filename: String) -> String {
    let result = window
        .app_handle()
        .dialog()
        .message(format!(
            "Do you want to save the changes you made to \"{filename}\"?"
        ))
        .title("Unsaved changes")
        .buttons(MessageDialogButtons::YesNoCancelCustom(
            "Save".to_string(),
            "Don't Save".to_string(),
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
    fn maps_the_save_button() {
        assert_eq!(
            map_dialog_result(MessageDialogResult::Custom("Save".to_string())),
            SAVE
        );
    }

    #[test]
    fn maps_the_dont_save_button() {
        assert_eq!(
            map_dialog_result(MessageDialogResult::Custom("Don't Save".to_string())),
            DONT_SAVE
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
