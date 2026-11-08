#!/usr/bin/env python3
"""Run the 2.0 release gate on Windows and print one pass/fail table.

Release build only. Each gate is measured by its own script, which keeps its
raw CSV logs under `target/bench-logs/`. This runner parses their summaries;
it does not measure anything itself.

    cargo build --release --all-targets
    python tools/release_gate.py
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

STARTUP_LIMIT_MS = 200.0
FIRST_EDIT_LIMIT_MS = 150.0
FRAME_LIMIT_MS = 16.7
BINARY_LIMIT_MB = 20.0

T2 = re.compile(r"T2 readable \(external, end-to-end\): median ([\d.]+) ms, p95 ([\d.]+) ms")
FIRST_EDIT = re.compile(r"first Edit: median ([\d.]+) ms, p95 ([\d.]+) ms")
OVER = re.compile(r"over budget (\d+)")
MAX_FRAME = re.compile(r"max ([\d.]+) ms, over budget")


def run(script: Path, *args: str) -> tuple[str, int]:
    proc = subprocess.run(
        [sys.executable, str(script), *args],
        capture_output=True,
        text=True,
        timeout=900,
        check=False,
    )
    return proc.stdout + proc.stderr, proc.returncode


def gate(name: str, passed: bool, detail: str) -> tuple[str, bool, str]:
    return (name, passed, detail)


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=20)
    parser.add_argument("--frame-runs", type=int, default=5)
    args = parser.parse_args()

    exe = root / "target" / "release" / "markdown-hexer.exe"
    if not exe.is_file():
        raise SystemExit(f"release binary not found: {exe}")

    results: list[tuple[str, bool, str]] = []

    size_mb = exe.stat().st_size / (1024 * 1024)
    results.append(
        gate("binary size", size_mb <= BINARY_LIMIT_MB, f"{size_mb:.2f} MB")
    )

    output, code = run(root / "tools" / "startup_bench.py", "--runs", str(args.runs))
    match = T2.search(output)
    if not match or code != 0:
        results.append(gate("startup, default font", False, "no T2 line"))
    else:
        median, p95 = float(match[1]), float(match[2])
        results.append(
            gate(
                "startup, default font",
                p95 <= STARTUP_LIMIT_MS,
                f"T2 p50 {median:.0f} ms, p95 {p95:.0f} ms",
            )
        )

    output, code = run(
        root / "tools" / "startup_bench.py", "--runs", str(args.runs), "--font", "serif"
    )
    match = T2.search(output)
    if not match or code != 0:
        results.append(gate("startup, serif font", False, "no T2 line"))
    else:
        median, p95 = float(match[1]), float(match[2])
        results.append(
            gate(
                "startup, serif font",
                p95 <= STARTUP_LIMIT_MS,
                f"T2 p50 {median:.0f} ms, p95 {p95:.0f} ms",
            )
        )

    output, code = run(root / "tools" / "first_edit_bench.py", "--runs", str(args.runs))
    match = FIRST_EDIT.search(output)
    if not match or code != 0:
        results.append(gate("first edit, 100 KB", False, "no first-edit line"))
    else:
        median, p95 = float(match[1]), float(match[2])
        results.append(
            gate(
                "first edit, 100 KB",
                p95 <= FIRST_EDIT_LIMIT_MS,
                f"p50 {median:.0f} ms, p95 {p95:.0f} ms",
            )
        )

    for anchor in ("end", "start"):
        output, code = run(
            root / "tools" / "editor_bench.py",
            "--runs",
            str(args.frame_runs),
            "--anchor",
            anchor,
        )
        over = sum(int(value) for value in OVER.findall(output))
        worst = max((float(value) for value in MAX_FRAME.findall(output)), default=0.0)
        results.append(
            gate(
                f"5k frames, type at {anchor}",
                code == 0 and over == 0,
                f"{args.frame_runs} runs, {over} frames over {FRAME_LIMIT_MS} ms, "
                f"worst {worst:.1f} ms",
            )
        )

    width = max(len(name) for name, _, _ in results)
    print(f"release gate: {exe}")
    failed = False
    for name, passed, detail in results:
        failed |= not passed
        print(f"  {'PASS' if passed else 'FAIL'}  {name:<{width}}  {detail}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
