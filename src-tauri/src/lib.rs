mod asset;
mod confirm;
mod encoding;
mod external;
mod inspect;
mod instance;
mod open;
mod save;
mod title;

/// Sets the OS window title from the Document's filename and Dirty flag.
///
/// The frontend calls this whenever the Document or its Dirty state changes so
/// the native title bar stays in sync: `<filename> * — Markdown-Magic`.
#[tauri::command]
fn set_document_title(window: tauri::Window, filename: String, dirty: bool) {
    let title = title::format_window_title(&filename, dirty);
    window
        .set_title(&title)
        .expect("failed to set window title");
    #[cfg(target_os = "linux")]
    title::sync_csd_titlebar(window, title);
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

use tauri::{Emitter, Manager};

/// Handles a second launch of the app (e.g. double-clicking another `.md`
/// file while the app is already running). Forwards the file path to the
/// frontend, which runs the normal Open flow in the existing window. The
/// single-instance plugin guarantees the second process never shows a window.
fn handle_second_instance(app: &tauri::AppHandle, argv: Vec<String>) {
    if let Some(path) = instance::extract_file_path(&argv) {
        let pending = app.state::<instance::PendingFile>();
        pending.set(path.clone());
        let _ = app.emit("file-open-requested", path);
    }
}

/// Returns and clears the file path that the frontend should open: either the
/// file the app was launched with, or a file forwarded by a second instance.
#[tauri::command]
fn get_pending_file(state: tauri::State<instance::PendingFile>) -> Option<String> {
    state.take()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            handle_second_instance(app, argv);
        }))
        .register_uri_scheme_protocol("asset", |ctx, request| {
            let scope = ctx.app_handle().state::<asset::DocumentScope>();
            let document_path = scope.0.lock().unwrap().clone();
            asset::serve(request, document_path)
        })
        .setup(|app| {
            app.manage(asset::DocumentScope(std::sync::Mutex::new(None)));
            app.manage(instance::PendingFile::from_startup_args());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_document_title,
            save_document,
            open_document,
            inspect_document,
            get_pending_file,
            asset::set_asset_root,
            confirm::show_confirm_discard,
            external::show_external_modified
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
