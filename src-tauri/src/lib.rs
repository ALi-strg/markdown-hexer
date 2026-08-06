mod confirm;
mod external;
mod inspect;
mod open;
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

/// Reads a Document's content from a path chosen by the user.
///
/// The frontend resolves the path (an Open dialog) and calls this only after a
/// path is known. A failed read keeps the current Document and surfaces the OS
/// error as a toast.
#[tauri::command]
fn open_document(path: String) -> Result<String, String> {
    open::read_document(&path)
}

/// Inspects the Document's file on disk for Externally-Modified detection.
///
/// The frontend calls this on window focus and compares the returned content
/// against the state it saw at load/save time. A missing or unreadable file
/// surfaces as an error, which the frontend treats as "no change".
#[tauri::command]
fn inspect_document(path: String) -> Result<inspect::FileState, String> {
    inspect::inspect_document(&path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            set_document_title,
            save_document,
            open_document,
            inspect_document,
            confirm::show_confirm_discard,
            external::show_external_modified
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
