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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![set_document_title])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
