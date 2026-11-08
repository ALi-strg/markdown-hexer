# Releasing Markdown Hexer 2.0

This page is the operator's guide to the 2.0 release pipeline: what the CI
produces, how the Version is chosen, how the installers behave, and what was
actually verified on a real host.

## Version rule

The Version is the git tag at build time with the leading `v` stripped:

| Tag | Version shown in About and bundles |
|---|---|
| `v2.0.0` | `2.0.0` |
| `v2.0.1` | `2.0.1` |
| `v2.0.0-rc.1` | `2.0.0-rc.1` (release marked prerelease) |

CI derives it from `GITHUB_REF_NAME`, then `app/packaging/set_version.py`
rewrites the single `version` line in `app/Cargo.toml` before building. The
About Dialog reads `CARGO_PKG_VERSION`, so the Dialog and every Bundle carry
the same value by construction. The checked-in `2.0.0` is only the development
baseline and is never treated as the release version by CI.

The NSIS internal product version is numeric (`2.0.0.0`) while the display
Version and asset name keep the full tag. WiX requires a numeric
`ProductVersion`, and cargo-packager rejects a non-numeric prerelease such as
`rc.1`, so prerelease tags build the NSIS installer only. The MSI is produced
for final tags (`v2.0.0`).

## Trigger

`.github/workflows/release.yml` runs on `push` of any `v*` tag. It:

1. validates the tag as `vMAJOR.MINOR.PATCH[-prerelease]` and sets `version`
   plus the prerelease flag;
2. builds Windows, macOS, and Linux bundles in parallel (prerelease tags skip
   the WiX MSI);
3. writes `SHA256SUMS`;
4. creates a **draft** GitHub Release named after the tag and attaches every
   asset. Tags whose version contains a `-` are marked prerelease.

The draft stays unpublished until the maintainer reviews the assets and
publishes it. Nothing is signed, notarized, or uploaded anywhere else.

## Assets

| Platform | Asset | Built by |
|---|---|---|
| Windows | `markdown-hexer_<version>_windows-x64.exe` | cargo-packager / NSIS |
| Windows | `markdown-hexer_<version>_windows-x64.msi` | cargo-packager / WiX 3.11 (final tags only) |
| macOS | `markdown-hexer_<version>_macos-aarch64.dmg` | cargo-packager / create-dmg |
| macOS | `markdown-hexer_<version>_macos-aarch64.app.tar.gz` | `tar` of the `.app` |
| Linux | `markdown-hexer_<version>_linux-x86_64.deb` | cargo-packager / dpkg-deb |
| Linux | `markdown-hexer_<version>_linux-x86_64.AppImage` | cargo-packager / linuxdeploy |
| Linux | `markdown-hexer_<version>_linux-x86_64.rpm` | cargo-generate-rpm |
| Linux | `markdown-hexer_<version>_linux-x86_64.flatpak` | flatpak-builder, wrapping the `.deb` |
| all | `SHA256SUMS` | `sha256sum` over the assets |

The release asset names are renamed from cargo-packager's output by CI; the
local output keeps the packager's names (`markdown-hexer_<version>_x64-setup.exe`,
`markdown-hexer_<version>_x64_en-US.msi`, `Markdown Hexer_<version>_aarch64.dmg`,
`markdown-hexer_<version>_amd64.deb`, `markdown-hexer_<version>_x86_64.AppImage`).

Only x86_64 Linux and aarch64 macOS are built. Windows arm64 and Intel macOS
are not produced today.

## Install and uninstall

### Windows — NSIS `.exe`

Per-user, no elevation. Installs to `%LOCALAPPDATA%\Markdown Hexer`, registers
file associations for the current user, and adds an uninstall entry.

```powershell
markdown-hexer_<version>_windows-x64.exe /S     # silent install
& "$env:LOCALAPPDATA\Markdown Hexer\uninstall.exe" /S
```

The uninstaller removes the install directory and restores the extensions'
previous default handlers (or removes the values when there was no previous
handler). User settings in `%APPDATA%\markdown-hexer\settings.json` are not
removed.

### Windows — WiX `.msi`

Per-machine; requires elevation. Silent install fails with **Error 1925** when
the session is not elevated (see the smoke checklist). Installs under
`Program Files` and registers the associations under `HKLM\Software\Classes`.

```powershell
msiexec /i markdown-hexer_<version>_windows-x64.msi     # shows UAC
msiexec /x markdown-hexer_<version>_windows-x64.msi
```

### macOS

Open the DMG and drag **Markdown Hexer** to Applications, or unpack the
`.app.tar.gz`. The app is unsigned and not notarized: Gatekeeper refuses the
first launch until you right-click it and choose **Open**, or run
`xattr -dr com.apple.quarantine "/Applications/Markdown Hexer.app"`.

Uninstall by moving the app to the Trash. Settings live in
`~/Library/Application Support/markdown-hexer/settings.json` and are left in
place.

### Linux

```sh
sudo apt install ./markdown-hexer_<version>_linux-x86_64.deb
sudo dnf install ./markdown-hexer_<version>_linux-x86_64.rpm
chmod +x markdown-hexer_<version>_linux-x86_64.AppImage && ./markdown-hexer_<version>_linux-x86_64.AppImage
flatpak install markdown-hexer_<version>_linux-x86_64.flatpak
```

The `.deb`, `.rpm`, and Flatpak install `markdown-hexer.desktop` (Flatpak:
`com.markdownhexer.editor.desktop`) with `MimeType=text/markdown` and a
shared-mime-info entry for `*.md`, `*.markdown`, and `*.mdown`. The `.deb`'s
`Depends` and the `.rpm`'s `Requires` pull in `shared-mime-info` and
`desktop-file-utils`, whose file triggers rebuild the MIME and desktop
databases. Remove with `apt remove markdown-hexer`, `dnf remove
markdown-hexer`, or `flatpak uninstall com.markdownhexer.editor`. Settings live
in `$XDG_CONFIG_HOME/markdown-hexer/settings.json` (normally
`~/.config/markdown-hexer/settings.json`) and are not removed.

The AppImage does not install a desktop file or MIME entry by itself; use the
distro package or Flatpak if you want file associations.

## File associations

The contract is [os-associations.md](os-associations.md).

- **Windows**: extensions `.md`, `.markdown`, `.mdown` default to ProgID
  `MarkdownHexer.Document`; `DefaultIcon` is `"<install-dir>\markdown-hexer.exe",0`;
  `shell\open` is labelled `Open with Markdown Hexer` and runs
  `"<install-dir>\markdown-hexer.exe" "%1"`. NSIS writes `FriendlyTypeName` and
  calls `SHChangeNotify` after install and uninstall. MSI writes the same keys
  machine-wide via a WiX component group.
- **macOS**: `Info.plist` declares `net.daringfireball.markdown` as an imported
  UTI (extensions `md`, `markdown`, `mdown`; MIME `text/markdown`) and lists it
  in `CFBundleDocumentTypes` with the Editor role and `LSHandlerRank=Alternate`.
- **Linux**: `text/markdown` is declared by the shared-mime-info file; the
  desktop entry opens files with `%F`.

There is no "default handler" hijack: macOS registers as an Alternate handler,
and Windows/Linux respect the user's chosen default.

## Signing and trust caveats

- No code-signing certificates, notarization, GPG keys, or Flatpak signing keys
  are configured. Windows SmartScreen and macOS Gatekeeper will warn.
- MSI and NSIS bundles are unsigned, so an enterprise lockdown policy may
  refuse them.
- The Flatpak bundle is a single-file build from a pinned `org.gnome.Platform`
  runtime obtained from Flathub; it is not published on Flathub and has no
  auto-update. Installing it requires the GNOME runtime to be available from
  Flathub.
- CI needs network access to download NSIS, WiX, linuxdeploy, and the Flatpak
  runtime. The app itself makes no network calls at startup.

## Smoke checklist

Verified on Windows 11 Pro 10.0.26200 (Ryzen 7 9800X3D) with Defender active,
2026-11-08, from a local `2.0.0` build on branch `17-packaging-cutover`:

- [x] NSIS `.exe` silent install exits 0; app lands in
      `%LOCALAPPDATA%\Markdown Hexer`.
- [x] Installed app launches; About shows `Version 2.0.0`.
- [x] `shell\open` command (`<install>\markdown-hexer.exe "%1"`) opens a temp
      `.md` through `ShellExecuteEx`; the window title shows the file name.
- [x] Registry contains `.md`/`.markdown`/`.mdown` → `MarkdownHexer.Document`,
      `FriendlyTypeName`, `DefaultIcon`, and the open command.
- [x] Silent uninstall exits 0; the install directory, uninstall entry, and
      `MarkdownHexer.Document` ProgID are gone, and `.md`/`.markdown`/`.mdown`
      point at the previous default again. A full `HKCU\Software\Classes`
      export is not byte-identical because Windows adds unrelated AppModel
      timestamps and shell display names during the session; no Markdown Hexer
      keys remain.
- [ ] MSI install / About / association / uninstall — **UNVERIFIED**:
      silent `msiexec` returned 1603 with `Error 1925` ("You do not have
      sufficient privileges ... for all users") because the test session is not
      elevated and silent mode cannot show UAC. The MSI tables were inspected
      offline with WiX `dark.exe`; install behavior on an elevated host is
      unverified.
- [ ] macOS `.dmg` / `.app.tar.gz` install, Gatekeeper behavior, UTI
      registration — **UNVERIFIED** (no macOS host).
- [ ] Linux `.deb` / `.rpm` / `.AppImage` / Flatpak install, MIME association,
      tray/desktop integration — **UNVERIFIED** (no Linux host; packages are
      built only by CI).
- [ ] CI run of `release.yml` — **UNVERIFIED** (not pushed; workflow syntax
      reviewed only).

Before publishing a release, run on real hosts:

1. Windows (elevated for MSI): install, launch, About version, double-click a
   `.md`/`.markdown`/`.mdown`, uninstall, confirm the previous association is
   restored and Settings > Apps has no leftover entry.
2. macOS: open the DMG, drag to Applications, first-launch Gatekeeper path,
   open a `.md` via Finder, About version.
3. Linux: install each package, `xdg-mime query default text/markdown`, open a
   `.md` from the file manager, About version, uninstall.
