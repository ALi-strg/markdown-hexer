# 01 — Diagnostic wizard for the affected host

**What to build:** an interactive bash wizard that a non-engineer (the maintainer's friend, who has the Bazzite machine) runs against the shipped v1.1.3 .AppImage. The wizard tests each candidate fix one at a time — `APPIMAGE_EXTRACT_AND_RUN=1` plus a single env-var override per run (`WEBKIT_DISABLE_COMPOSITING_MODE=1`, `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1`, a GStreamer/`GST_PLUGIN_SYSTEM_PATH_1_0` correction) — asks the friend "did it render? yes/no" after each, and captures stderr for the failure signature (`EGL_BAD_PARAMETER`, `symbol lookup error`, `SIGBUS`, `bwrap:`, `Failed to create GBM device`, `GStreamer element appsink not found`). Its single output is a log the maintainer reads to identify the root cause.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The wizard is a single self-contained script a non-engineer can run with copy-paste instructions.
- [ ] It tests `APPIMAGE_EXTRACT_AND_RUN=1` and each candidate env-var override independently, one at a time.
- [ ] After each candidate it records the friend's yes/no render verdict.
- [ ] It captures stderr (and any `pgrep` WebKit process state) into a log for each run.
- [ ] The friend can run the whole thing without editing files or using a terminal beyond running the script.
- [ ] The resulting log lets the maintainer identify the failure signature or the candidate that made it render.
