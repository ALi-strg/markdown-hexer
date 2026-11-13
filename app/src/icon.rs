/// The bundled 128×128 product icon for the OS window chrome.
pub fn window_icon() -> egui::IconData {
    eframe::icon_data::from_png_bytes(include_bytes!("../packaging/icons/128x128.png"))
        .expect("bundled 128x128 window icon is a valid PNG")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_icon_decodes_the_bundled_png() {
        let icon = window_icon();

        assert_eq!(icon.width, 128);
        assert_eq!(icon.height, 128);
        assert!(!icon.rgba.is_empty());
    }
}
