// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// WebKitGTK's DMABUF renderer produces a blank/white window on some Linux
/// hosts — most often NVIDIA GPUs, and on Wayland (see ADR 0007). Disabling it
/// before the Tauri Builder starts makes every Linux bundle (.deb, .rpm,
/// .AppImage, Flatpak) render reliably; the defect is host-GPU, not packaging.
#[cfg(target_os = "linux")]
fn disable_dmabuf_renderer() {
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
}

fn main() {
    #[cfg(target_os = "linux")]
    disable_dmabuf_renderer();

    markdown_editor_lib::run()
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn disables_dmabuf_renderer_on_linux() {
        disable_dmabuf_renderer();
        assert_eq!(
            std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").unwrap(),
            "1"
        );
    }
}
