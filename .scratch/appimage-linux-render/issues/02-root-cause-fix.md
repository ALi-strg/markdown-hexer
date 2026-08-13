# 02 — Root-cause fix for the AppImage render

**What to build:** the fix the diagnostic wizard (01) validates, applied so the .AppImage renders on the affected host. Two possible shapes, selected by the wizard's evidence:
- If an env-var override made it render: extend the existing Linux override in the binary (alongside the DMABUF one) with the validated variable, plus a Linux unit test mirroring the existing env-var test.
- If stderr implicates the bundled payload (e.g. `EGL_BAD_PARAMETER` from over-bundled libraries, or a helper-binary mismatch): strip the over-bundled libraries from the .AppImage payload in CI (the upstream `excludeLibraries` bundler option is not yet in the pinned tauri).

Either way: .deb, .rpm, and Flatpak Bundles are untouched and keep rendering.

**Blocked by:** 01 — Diagnostic wizard for the affected host (the wizard's evidence picks which shape the fix takes).

**Status:** ready-for-agent

- [ ] The .AppImage renders content on the affected host (validated by the wizard's yes/no flow for the chosen candidate).
- [ ] The fix is baked in, not requiring the user to set env vars.
- [ ] If the fix is a binary env override: a Linux unit test asserts the override is set, mirroring the existing DMABUF env-var test.
- [ ] .deb, .rpm, and Flatpak Bundles still render (no regression to working formats).
- [ ] The evidence (failure signature) that selected this shape is recorded with the ticket.
