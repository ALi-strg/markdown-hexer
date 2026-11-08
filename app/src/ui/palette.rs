use egui::Color32;

/// Palette tokens are the only source of color in the shell. Ticket 02 ships
/// Light; the token layer exists so later themes do not reach into widgets.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Palette {
    pub bg: Color32,
    pub surface: Color32,
    pub ink: Color32,
    pub muted: Color32,
    pub border: Color32,
    pub accent: Color32,
    pub accent_contrast: Color32,
    pub code_bg: Color32,
    pub link: Color32,
    pub selection: Color32,
}

impl Palette {
    pub const LIGHT: Self = Self {
        bg: Color32::from_rgb(0xf5, 0xf1, 0xe3),
        surface: Color32::from_rgb(0xfd, 0xf9, 0xee),
        ink: Color32::from_rgb(0x3f, 0x32, 0x22),
        muted: Color32::from_rgb(0x85, 0x73, 0x5a),
        border: Color32::from_rgb(0xe2, 0xd6, 0xbb),
        accent: Color32::from_rgb(0xa0, 0x52, 0x2d),
        accent_contrast: Color32::from_rgb(0xff, 0xfa, 0xf0),
        code_bg: Color32::from_rgb(0xef, 0xe6, 0xd2),
        link: Color32::from_rgb(0xa0, 0x52, 0x2d),
        selection: Color32::from_rgb(0xe6, 0xcb, 0xa5),
    };

    pub const fn default_light() -> Self {
        Self::LIGHT
    }
}
