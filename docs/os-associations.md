# File associations

Ticket 17 (installers and release packaging) consumes this contract. It is the
single source of truth for the document types Markdown Hexer opens. The binary
is `markdown-hexer` (Windows `markdown-hexer.exe`). Paths arrive as ordinary
argv entries and are opened as Tabs in argument order, with the last path
Active.

## Shared metadata

| Field | Value |
| --- | --- |
| Product | Markdown Hexer |
| Extensions | `.md`, `.markdown`, `.mdown` |
| MIME type | `text/markdown` |
| Windows ProgId | `MarkdownHexer.Document` |
| macOS UTI | `net.daringfireball.markdown` |
| Linux desktop id | `markdown-hexer.desktop` |

The machine-readable copy is `app/packaging/file-associations.toml`.

## Windows

Register per user under `HKCU\Software\Classes` (or per machine under
`HKLM\Software\Classes`):

```text
. md / .markdown / .mdown
  (Default) = MarkdownHexer.Document

MarkdownHexer.Document
  (Default) = Markdown document
  FriendlyTypeName = Markdown Hexer document
  DefaultIcon
    (Default) = "<install-dir>\markdown-hexer.exe",0
  shell\open\command
    (Default) = "<install-dir>\markdown-hexer.exe" "%1"
```

Notify the shell with `SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, 0, 0)`.
The installer must quote the executable and `%1`; paths with spaces are normal.
Do not add a `DROP` verb: drag-and-drop into the window is handled by egui and
does not depend on the association.

## macOS

In the app bundle's `Info.plist` add `CFBundleDocumentTypes` with
`CFBundleTypeName = Markdown Document`, `CFBundleTypeRole = Editor`,
`LSHandlerRank = Alternate`, and `LSItemContentTypes = [net.daringfireball.markdown]`.
Also declare `UTImportedTypeDeclarations` for `net.daringfireball.markdown`
(`public.text`, extensions `md`, `markdown`, `mdown`, MIME `text/markdown`).
The bundle identifier is owned by ticket 17.

Finder open-file events (double-click, "Open With") are delivered as Apple
Events to an already running app, not as a new process. eframe 0.37 exposes no
open-file callback, so ticket 14 cannot receive them without patching
eframe/egui-winit or installing an `NSAppleEventManager` handler. See
`docs/manual-os-checklist.md`; this remains an explicit risk, not a silent
fallback.

## Linux

Install `markdown-hexer.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Markdown Hexer
Exec=markdown-hexer %F
MimeType=text/markdown;
Terminal=false
Categories=Utility;TextEditor;
```

Install the `text/markdown` MIME package association (for example
`/usr/share/mime/packages/markdown-hexer.xml` with `glob` patterns `*.md`,
`*.markdown`, `*.mdown`) and run `update-desktop-database` and
`update-mime-database`. Flatpak packaging (ADR 0006) must export the same
desktop file and MIME type; ticket 17 owns the manifest.

## Second instance

All platforms use the same binary: the first process owns a local socket, and
later launches forward their paths and exit. Windows uses a named pipe under
`\\.\pipe\markdown-hexer-2.0-<user>` with the default owner-only DACL and
remote clients rejected. Unix uses a `0600` socket in `$XDG_RUNTIME_DIR` (or
the temp directory) named `markdown-hexer-2.0-<uid>.sock`. Installers do not
need to create, clean up, or firewall anything; no TCP port is opened.
