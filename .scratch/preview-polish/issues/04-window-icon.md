# 04 - Window icon: product icon in the title bar

**What to build:** The window title bar, Alt-Tab, Linux window, and macOS dev Dock show the product icon instead of egui's placeholder. The exe resource that Explorer, the taskbar, and the file association use stays as it is.

**Type:** task

**Blocked by:** None - can start immediately.

**Status:** resolved

- [x] The viewport icon is decoded from the bundled 128×128 product PNG before the window is created and passed through the viewport builder.
- [x] The PNG decode uses eframe's helper and the existing image dependency; no new dependency.
- [ ] Windows shows the product icon in the title bar and Alt-Tab. The taskbar and Explorer are unchanged.
- [ ] Linux shows the product icon as the window icon.
- [ ] macOS release keeps `icon.icns`; a dev build shows the product icon where the platform supports it.
- [x] The build script reruns when the 128×128 PNG changes.
- [x] The library icon loader is unit-tested to decode the PNG into a 128×128 non-empty RGBA image.
- [x] The decode happens before window creation without a measurable Cold Start regression.
- [x] The exe icon resource is untouched.
- [ ] The title bar, Alt-Tab, and taskbar are checked manually on Windows.

## Comments

Resolved on `preview-polish` (merge `4c4f30e`; code review fixes `c793a0e`).
The decode test and build wiring are green. The native title-bar/Alt-Tab/taskbar
and cross-platform window-icon checks remain for reviewer confirmation.
