# 03 — Amend ADR 0007

**What to build:** correct ADR 0007's rationale after the root cause is confirmed. The ADR currently claims the Linux blank-window defect is "host-GPU, not packaging — the .deb on the same machine would fail identically"; the reported evidence (same machine, .deb/Flatpak fine, only .AppImage white) contradicts that. Replace the rationale with the actual mechanism found by 01 and fixed by 02, and record whether the fix lives in the binary or the bundler.

**Blocked by:** 02 — Root-cause fix for the AppImage render (the confirmed mechanism is what gets written down).

**Status:** ready-for-agent

- [ ] ADR 0007's rationale reflects the confirmed mechanism, not the old "host-GPU, not packaging" claim.
- [ ] It records whether the fix lives in the binary (env override) or the bundler (payload strip).
- [ ] It points at the research notes and the ticket that produced the evidence.
