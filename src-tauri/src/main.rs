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

/// WebView2's GPU process is the documented source of hard, power-cycle-only
/// OS freezes during window resize on some Intel iGPU machines
/// (MicrosoftEdge/WebView2Feedback #3063 — see ADR 0013) and of blank-white
/// content over RDP sessions (#1115, #1179). A text editor gains nothing worth those defects
/// from GPU compositing, so `--disable-gpu` ships unconditionally via
/// `additionalBrowserArgs` in tauri.conf.json. This guard keeps the flag from
/// regressing out of the config.
#[cfg(test)]
mod conf_guard {
    #[test]
    fn webview_ships_disable_gpu() {
        let conf: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tauri.conf.json"
        ))
        .unwrap())
        .unwrap();
        let args = conf["app"]["windows"][0]["additionalBrowserArgs"]
            .as_str()
            .expect("main window must keep additionalBrowserArgs set");
        assert!(
            args.contains("--disable-gpu"),
            "additionalBrowserArgs in tauri.conf.json must keep --disable-gpu"
        );
    }
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
