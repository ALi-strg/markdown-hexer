# 01 — Diagnostic wizard for the affected host

**What to build:** an interactive bash wizard that a non-engineer (the maintainer's friend, who has the Bazzite machine) runs against the shipped v1.1.3 .AppImage. The wizard tests each candidate fix one at a time — `APPIMAGE_EXTRACT_AND_RUN=1` plus a single env-var override per run (`WEBKIT_DISABLE_COMPOSITING_MODE=1`, `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1`, a GStreamer/`GST_PLUGIN_SYSTEM_PATH_1_0` correction) — asks the friend "did it render? yes/no" after each, and captures stderr for the failure signature (`EGL_BAD_PARAMETER`, `symbol lookup error`, `SIGBUS`, `bwrap:`, `Failed to create GBM device`, `GStreamer element appsink not found`). Its single output is a log the maintainer reads to identify the root cause.

**Blocked by:** None — can start immediately.

**Status:** ready-for-human

- [ ] The wizard is a single self-contained script a non-engineer can run with copy-paste instructions.
- [ ] It tests `APPIMAGE_EXTRACT_AND_RUN=1` and each candidate env-var override independently, one at a time.
- [ ] After each candidate it records the friend's yes/no render verdict.
- [ ] It captures stderr (and any `pgrep` WebKit process state) into a log for each run.
- [ ] The friend can run the whole thing without editing files or using a terminal beyond running the script.
- [ ] The resulting log lets the maintainer identify the failure signature or the candidate that made it render.

## Comments

2026-08-13 — delivered: `.scratch/appimage-linux-render/diagnostic-wizard.sh` (single self-contained bash wizard).

**What it does:** four runs, one candidate each — `APPIMAGE_EXTRACT_AND_RUN=1`; + `WEBKIT_DISABLE_COMPOSITING_MODE=1`; + `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1`; + `GST_PLUGIN_SYSTEM_PATH_1_0=<auto-detected system plugin dir>`. Candidate 4 is grounded in the research: the AppImage AppRun binary prepends its own GST export with `:old_env`, so a shell-set value survives as a fallback search path (verified against AppImageKit `AppRun.c` and tauri v2.11.5 bundler sources). If no system GStreamer dir is found, run 4 is skipped and the log records it as skipped, not failed.

**Copy-paste for the friend (Bazzite machine):**
```
cd ~/Downloads                      # wherever the AppImage is
chmod +x diagnostic-wizard.sh
./diagnostic-wizard.sh Markdown-Magic_1.1.3_amd64.AppImage
```
No argument needed when the AppImage sits next to the script. The wizard only asks y/n + Enter: it launches the app, asks "did it render?", kills the app (and its WebKit children, via its own process group) after each run, and writes `appimage-diagnostic-<timestamp>.log` next to the script.

**What the maintainer gets from the log:** host info; per-run candidate env, exact command, pid, process tree (WebKit helper processes alive or not), y/n verdict, exit code (signal deaths decoded, e.g. `SIGBUS`), full captured output, and matched failure signatures (`EGL_BAD_PARAMETER`, `symbol lookup error`, `SIGBUS`, `bwrap:`, `Failed to create GBM device`, `GStreamer element appsink not found`).

**Verified:** `bash -n`; harness smoke test (both verdict paths, running-instance branch, GST-skip branch, missing-AppImage and refused-kill edge paths); repo suites unaffected (vitest 397 passed, cargo test 33 passed). Reviewed via /code-review — all findings fixed (SIGPIPE/pipefail abort on signature spew, signal-exit decoding, log completeness for skipped candidates, library byte-identity restored, stage count when run 4 is skipped).

Remaining step is human: the friend runs it on the Bazzite host and sends the log back; that evidence selects the fix shape in issue 02.
