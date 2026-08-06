mod confirm;
mod save;
mod title;

/// Sets the OS window title from the Document's filename and Dirty flag.
///
/// The frontend calls this whenever the Document or its Dirty state changes so
/// the native title bar stays in sync: `<filename> * — ALi-md-editor`.
#[tauri::command]
fn set_document_title(window: tauri::Window, filename: String, dirty: bool) {
    window
        .set_title(&title::format_window_title(&filename, dirty))
        .expect("failed to set window title");
}

/// Writes the Document's content to a path chosen by the user.
///
/// The frontend resolves the path (a Save As dialog for an Untitled Document)
/// and calls this only after a path is known. A failed write keeps the Document
/// Dirty and surfaces the OS error as a toast.
#[tauri::command]
fn save_document(path: String, content: String) -> Result<(), String> {
    save::write_document(&path, &content)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            set_document_title,
            save_document,
            confirm::show_confirm_discard
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
