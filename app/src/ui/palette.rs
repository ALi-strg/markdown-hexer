use egui::Color32;

use crate::settings::Theme;

/// Palette tokens are the only source of color in the shell. Every theme is a
/// complete token set; System is a preference that resolves to Light or Dark
/// from the OS and is not itself a Palette.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Palette {
    pub bg: Color32,
    pub surface: Color32,
    pub ink: Color32,
    pub muted: Color32,
    pub border: Color32,
    pub accent: Color32,
    pub accent_contrast: Color32,
    pub focus: Color32,
    pub code_bg: Color32,
    pub syntax_comment: Color32,
    pub syntax_keyword: Color32,
    pub syntax_punctuation: Color32,
    pub syntax_string: Color32,
    pub syntax_number: Color32,
    pub syntax_function: Color32,
    pub link: Color32,
    pub selection: Color32,
    pub toast_bg: Color32,
    pub toast_ink: Color32,
}

impl Palette {
    pub const LIGHT: Self = Self {
        bg: Color32::from_rgb(0xf5, 0xf1, 0xe3),
        surface: Color32::from_rgb(0xfd, 0xf9, 0xee),
        ink: Color32::from_rgb(0x3f, 0x32, 0x22),
        muted: Color32::from_rgb(0x7a, 0x68, 0x4f),
        border: Color32::from_rgb(0xe2, 0xd6, 0xbb),
        accent: Color32::from_rgb(0xa0, 0x52, 0x2d),
        accent_contrast: Color32::from_rgb(0xff, 0xfa, 0xf0),
        focus: Color32::from_rgb(0xa0, 0x52, 0x2d),
        code_bg: Color32::from_rgb(0xe7, 0xda, 0xbf),
        syntax_comment: Color32::from_rgb(0x56, 0x5f, 0x69),
        syntax_keyword: Color32::from_rgb(0xb9, 0x1c, 0x26),
        syntax_punctuation: Color32::from_rgb(0x57, 0x60, 0x6a),
        syntax_string: Color32::from_rgb(0x0a, 0x30, 0x69),
        syntax_number: Color32::from_rgb(0x05, 0x50, 0xae),
        syntax_function: Color32::from_rgb(0x6c, 0x39, 0xc4),
        link: Color32::from_rgb(0xa0, 0x52, 0x2d),
        selection: Color32::from_rgb(0xe6, 0xcb, 0xa5),
        toast_bg: Color32::from_rgb(0x3f, 0x32, 0x22),
        toast_ink: Color32::from_rgb(0xfd, 0xf9, 0xee),
    };

    pub const HOUSE: Self = Self {
        bg: Color32::from_rgb(0xf7, 0xf6, 0xf0),
        surface: Color32::from_rgb(0xf7, 0xf6, 0xf0),
        ink: Color32::from_rgb(0x26, 0x30, 0x2a),
        muted: Color32::from_rgb(0x5e, 0x6a, 0x60),
        border: Color32::from_rgb(0xd2, 0xd8, 0xcf),
        accent: Color32::from_rgb(0x8f, 0xa9, 0x8f),
        accent_contrast: Color32::from_rgb(0x26, 0x30, 0x2a),
        focus: Color32::from_rgb(0x4e, 0x64, 0x58),
        code_bg: Color32::from_rgb(0xd6, 0xe5, 0xe0),
        syntax_comment: Color32::from_rgb(0x56, 0x5f, 0x69),
        syntax_keyword: Color32::from_rgb(0xb9, 0x1c, 0x26),
        syntax_punctuation: Color32::from_rgb(0x57, 0x60, 0x6a),
        syntax_string: Color32::from_rgb(0x0a, 0x30, 0x69),
        syntax_number: Color32::from_rgb(0x05, 0x50, 0xae),
        syntax_function: Color32::from_rgb(0x6c, 0x39, 0xc4),
        link: Color32::from_rgb(0x52, 0x67, 0x59),
        selection: Color32::from_rgb(0xc2, 0xd4, 0xc2),
        toast_bg: Color32::from_rgb(0x26, 0x30, 0x2a),
        toast_ink: Color32::from_rgb(0xf7, 0xf6, 0xf0),
    };

    pub const DARK: Self = Self {
        bg: Color32::from_rgb(0x0f, 0x18, 0x26),
        surface: Color32::from_rgb(0x13, 0x1e, 0x2f),
        ink: Color32::from_rgb(0xe6, 0xec, 0xf5),
        muted: Color32::from_rgb(0x8b, 0x9c, 0xb5),
        border: Color32::from_rgb(0x24, 0x32, 0x4a),
        accent: Color32::from_rgb(0x4d, 0x7c, 0xfe),
        accent_contrast: Color32::from_rgb(0x0f, 0x18, 0x26),
        focus: Color32::from_rgb(0x6e, 0xa8, 0xfe),
        code_bg: Color32::from_rgb(0x1b, 0x29, 0x42),
        syntax_comment: Color32::from_rgb(0x8b, 0x94, 0x9e),
        syntax_keyword: Color32::from_rgb(0xff, 0x7b, 0x72),
        syntax_punctuation: Color32::from_rgb(0xe6, 0xed, 0xf3),
        syntax_string: Color32::from_rgb(0xa5, 0xd6, 0xff),
        syntax_number: Color32::from_rgb(0x79, 0xc0, 0xff),
        syntax_function: Color32::from_rgb(0xd2, 0xa8, 0xff),
        link: Color32::from_rgb(0x6e, 0xa8, 0xfe),
        selection: Color32::from_rgb(0x2f, 0x4a, 0x75),
        toast_bg: Color32::from_rgb(0x1a, 0x27, 0x39),
        toast_ink: Color32::from_rgb(0xe6, 0xec, 0xf5),
    };

    pub const HIGH_CONTRAST: Self = Self {
        bg: Color32::from_rgb(0x00, 0x00, 0x00),
        surface: Color32::from_rgb(0x14, 0x14, 0x14),
        ink: Color32::from_rgb(0xff, 0xff, 0xff),
        muted: Color32::from_rgb(0xc4, 0xc4, 0xc4),
        border: Color32::from_rgb(0x55, 0x55, 0x55),
        accent: Color32::from_rgb(0xff, 0xd6, 0x0a),
        accent_contrast: Color32::from_rgb(0x00, 0x00, 0x00),
        focus: Color32::from_rgb(0xff, 0xff, 0xff),
        code_bg: Color32::from_rgb(0x1a, 0x1a, 0x1a),
        syntax_comment: Color32::from_rgb(0xa8, 0xa8, 0xa8),
        syntax_keyword: Color32::from_rgb(0xff, 0x6b, 0x6b),
        syntax_punctuation: Color32::from_rgb(0xff, 0xff, 0xff),
        syntax_string: Color32::from_rgb(0x6f, 0xff, 0x8f),
        syntax_number: Color32::from_rgb(0x82, 0xcf, 0xff),
        syntax_function: Color32::from_rgb(0xd2, 0xa8, 0xff),
        link: Color32::from_rgb(0xff, 0xd6, 0x0a),
        selection: Color32::from_rgb(0x3d, 0x3d, 0x3d),
        toast_bg: Color32::from_rgb(0xff, 0xff, 0xff),
        toast_ink: Color32::from_rgb(0x00, 0x00, 0x00),
    };

    pub const NORD: Self = Self {
        bg: Color32::from_rgb(0x2e, 0x34, 0x40),
        surface: Color32::from_rgb(0x3b, 0x42, 0x52),
        ink: Color32::from_rgb(0xd8, 0xde, 0xe9),
        muted: Color32::from_rgb(0xa3, 0xb1, 0xca),
        border: Color32::from_rgb(0x4c, 0x56, 0x6a),
        accent: Color32::from_rgb(0x88, 0xc0, 0xd0),
        accent_contrast: Color32::from_rgb(0x2e, 0x34, 0x40),
        focus: Color32::from_rgb(0x88, 0xc0, 0xd0),
        code_bg: Color32::from_rgb(0x20, 0x26, 0x2f),
        syntax_comment: Color32::from_rgb(0x92, 0xa0, 0xb6),
        syntax_keyword: Color32::from_rgb(0x81, 0xa1, 0xc1),
        syntax_punctuation: Color32::from_rgb(0xd8, 0xde, 0xe9),
        syntax_string: Color32::from_rgb(0xa3, 0xbe, 0x8c),
        syntax_number: Color32::from_rgb(0xb4, 0x8e, 0xad),
        syntax_function: Color32::from_rgb(0x88, 0xc0, 0xd0),
        link: Color32::from_rgb(0x88, 0xc0, 0xd0),
        selection: Color32::from_rgb(0x43, 0x4c, 0x5e),
        toast_bg: Color32::from_rgb(0x3b, 0x42, 0x52),
        toast_ink: Color32::from_rgb(0xd8, 0xde, 0xe9),
    };

    pub const TERMINAL_GREEN: Self = Self {
        bg: Color32::from_rgb(0x0a, 0x0a, 0x0a),
        surface: Color32::from_rgb(0x10, 0x15, 0x10),
        ink: Color32::from_rgb(0x3d, 0xff, 0x6e),
        muted: Color32::from_rgb(0x2e, 0xa8, 0x4e),
        border: Color32::from_rgb(0x1f, 0x5c, 0x2f),
        accent: Color32::from_rgb(0x3d, 0xff, 0x6e),
        accent_contrast: Color32::from_rgb(0x00, 0x1a, 0x05),
        focus: Color32::from_rgb(0x3d, 0xff, 0x6e),
        code_bg: Color32::from_rgb(0x16, 0x26, 0x1a),
        syntax_comment: Color32::from_rgb(0x2e, 0x9e, 0x4f),
        syntax_keyword: Color32::from_rgb(0x3d, 0xff, 0x6e),
        syntax_punctuation: Color32::from_rgb(0x3d, 0xff, 0x6e),
        syntax_string: Color32::from_rgb(0xa5, 0xff, 0xc4),
        syntax_number: Color32::from_rgb(0x7d, 0xff, 0x9e),
        syntax_function: Color32::from_rgb(0x3d, 0xff, 0x6e),
        link: Color32::from_rgb(0xa5, 0xff, 0xc4),
        selection: Color32::from_rgb(0x17, 0x3d, 0x22),
        toast_bg: Color32::from_rgb(0x17, 0x3d, 0x22),
        toast_ink: Color32::from_rgb(0x3d, 0xff, 0x6e),
    };

    pub const fn default_light() -> Self {
        Self::LIGHT
    }

    /// Whether chrome should use the dark widget defaults and a light-on-dark
    /// caret. A palette's background is the authority, not its name.
    pub fn is_dark(&self) -> bool {
        let lightness = self.bg.r() as u32 + self.bg.g() as u32 + self.bg.b() as u32;
        lightness < 3 * 128
    }
}

impl Theme {
    /// Resolve a Theme preference. System maps to Light or Dark and is the
    /// only preference affected by the OS.
    pub fn palette(self, system_is_dark: bool) -> Palette {
        match self {
            Theme::System => {
                if system_is_dark {
                    Palette::DARK
                } else {
                    Palette::LIGHT
                }
            }
            Theme::Light => Palette::LIGHT,
            Theme::House => Palette::HOUSE,
            Theme::Dark => Palette::DARK,
            Theme::HighContrast => Palette::HIGH_CONTRAST,
            Theme::Nord => Palette::NORD,
            Theme::TerminalGreen => Palette::TERMINAL_GREEN,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rgb(hex: u32) -> Color32 {
        Color32::from_rgb(
            ((hex >> 16) & 0xff) as u8,
            ((hex >> 8) & 0xff) as u8,
            (hex & 0xff) as u8,
        )
    }

    fn contrast(a: Color32, b: Color32) -> f32 {
        fn channel(value: u8) -> f32 {
            let value = value as f32 / 255.0;
            if value <= 0.04045 {
                value / 12.92
            } else {
                ((value + 0.055) / 1.055).powf(2.4)
            }
        }
        fn luminance(color: Color32) -> f32 {
            0.2126 * channel(color.r()) + 0.7152 * channel(color.g()) + 0.0722 * channel(color.b())
        }
        let (light, dark) = if luminance(a) > luminance(b) {
            (luminance(a), luminance(b))
        } else {
            (luminance(b), luminance(a))
        };
        (light + 0.05) / (dark + 0.05)
    }

    #[test]
    fn every_theme_resolves_to_its_expected_palette() {
        let expected = [
            (Theme::Light, Palette::LIGHT, 0xf5f1e3, 0xa0522d),
            (Theme::House, Palette::HOUSE, 0xf7f6f0, 0x8fa98f),
            (Theme::Dark, Palette::DARK, 0x0f1826, 0x4d7cfe),
            (
                Theme::HighContrast,
                Palette::HIGH_CONTRAST,
                0x000000,
                0xffd60a,
            ),
            (Theme::Nord, Palette::NORD, 0x2e3440, 0x88c0d0),
            (
                Theme::TerminalGreen,
                Palette::TERMINAL_GREEN,
                0x0a0a0a,
                0x3dff6e,
            ),
        ];
        for (theme, palette, bg, accent) in expected {
            assert_eq!(theme.palette(false), palette, "{theme:?}");
            assert_eq!(palette.bg, rgb(bg), "{theme:?} bg");
            assert_eq!(palette.accent, rgb(accent), "{theme:?} accent");
            assert_eq!(theme.palette(true), palette, "{theme:?} ignores the OS");
        }
    }

    #[test]
    fn system_resolves_light_and_dark_and_is_not_house() {
        assert_eq!(Theme::System.palette(false), Palette::LIGHT);
        assert_eq!(Theme::System.palette(true), Palette::DARK);
        assert_ne!(Theme::System.palette(false), Palette::HOUSE);
    }

    #[test]
    fn light_tokens_are_stable() {
        let palette = Palette::LIGHT;
        assert_eq!(palette.bg, rgb(0xf5f1e3));
        assert_eq!(palette.surface, rgb(0xfdf9ee));
        assert_eq!(palette.ink, rgb(0x3f3222));
        assert_eq!(palette.muted, rgb(0x7a684f));
        assert_eq!(palette.border, rgb(0xe2d6bb));
        assert_eq!(palette.accent, rgb(0xa0522d));
        assert_eq!(palette.accent_contrast, rgb(0xfffaf0));
        assert_eq!(palette.selection, rgb(0xe6cba5));
        assert_eq!(palette.code_bg, rgb(0xe7dabf));
        assert_eq!(palette.link, rgb(0xa0522d));
        assert_eq!(palette.syntax_comment, rgb(0x565f69));
        assert_eq!(palette.syntax_keyword, rgb(0xb91c26));
        assert_eq!(palette.syntax_punctuation, rgb(0x57606a));
        assert_eq!(palette.syntax_string, rgb(0x0a3069));
        assert_eq!(palette.syntax_number, rgb(0x0550ae));
        assert_eq!(palette.syntax_function, rgb(0x6c39c4));
        assert_eq!(palette.toast_bg, rgb(0x3f3222));
        assert_eq!(palette.toast_ink, rgb(0xfdf9ee));
    }

    #[test]
    fn house_selection_differs_from_code_background() {
        assert_ne!(Palette::HOUSE.selection, Palette::HOUSE.code_bg);
        assert_ne!(Palette::HOUSE.link, Palette::HOUSE.bg);
    }

    #[test]
    fn high_contrast_has_visible_focus_and_selection() {
        let palette = Palette::HIGH_CONTRAST;
        assert!(contrast(palette.focus, palette.bg) >= 7.0);
        assert!(contrast(palette.ink, palette.bg) >= 7.0);
        assert!(contrast(palette.selection, palette.ink) >= 3.0);
        assert_ne!(palette.selection, palette.bg);
        assert_ne!(palette.focus, palette.selection);
    }

    #[test]
    fn every_palette_separates_the_code_surface_from_the_page() {
        for palette in [
            Palette::LIGHT,
            Palette::HOUSE,
            Palette::DARK,
            Palette::HIGH_CONTRAST,
            Palette::NORD,
            Palette::TERMINAL_GREEN,
        ] {
            assert!(
                contrast(palette.code_bg, palette.bg) >= 1.2,
                "code background on page {palette:?}"
            );
        }
    }

    #[test]
    fn every_palette_keeps_content_readable() {
        for palette in [
            Palette::LIGHT,
            Palette::HOUSE,
            Palette::DARK,
            Palette::HIGH_CONTRAST,
            Palette::NORD,
            Palette::TERMINAL_GREEN,
        ] {
            for surface in [palette.bg, palette.surface] {
                assert!(
                    contrast(palette.ink, surface) >= 4.5,
                    "ink on surface {palette:?}"
                );
                assert!(
                    contrast(palette.muted, surface) >= 4.5,
                    "muted on surface {palette:?}"
                );
                assert!(
                    contrast(palette.link, surface) >= 4.5,
                    "link on surface {palette:?}"
                );
                assert!(
                    contrast(palette.focus, surface) >= 3.0,
                    "focus on surface {palette:?}"
                );
            }
            assert!(
                contrast(palette.ink, palette.selection) >= 4.5,
                "ink on selection {palette:?}"
            );
            assert!(
                contrast(palette.focus, palette.selection) >= 3.0,
                "focus on selection {palette:?}"
            );
            assert!(
                contrast(palette.link, palette.selection) >= 3.0,
                "link on selection {palette:?}"
            );
            assert!(
                contrast(palette.accent_contrast, palette.accent) >= 4.5,
                "accent text {palette:?}"
            );
            assert!(
                contrast(palette.toast_ink, palette.toast_bg) >= 4.5,
                "toast {palette:?}"
            );
            for syntax in [
                palette.syntax_comment,
                palette.syntax_keyword,
                palette.syntax_punctuation,
                palette.syntax_string,
                palette.syntax_number,
                palette.syntax_function,
            ] {
                assert!(
                    contrast(syntax, palette.code_bg) >= 4.5,
                    "code token on code background {palette:?}"
                );
            }
            assert_ne!(palette.bg, palette.border, "{palette:?}");
        }
    }

    #[test]
    fn dark_palettes_report_dark() {
        assert!(!Palette::LIGHT.is_dark());
        assert!(!Palette::HOUSE.is_dark());
        for palette in [
            Palette::DARK,
            Palette::HIGH_CONTRAST,
            Palette::NORD,
            Palette::TERMINAL_GREEN,
        ] {
            assert!(palette.is_dark(), "{palette:?}");
        }
    }
}
