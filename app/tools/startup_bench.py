#!/usr/bin/env python3
"""Measure real Markdown Hexer launches with a Win32 visibility poll.

T1 is the first visible window of the launched process. T2 is end-to-end from
process launch to the app's readable-frame timestamp in the startup CSV.
The app only writes that CSV when HEXER_STARTUP_LOG is set.
"""

from __future__ import annotations

import argparse
import ctypes
import math
import os
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

user32 = ctypes.windll.user32 if sys.platform == "win32" else None
EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)


def visible_window(pid: int, expected_title: str) -> tuple[int, str] | None:
    if user32 is None:
        raise SystemExit("this harness measures Windows launches only")
    found: list[tuple[int, str]] = []

    @EnumWindowsProc
    def callback(hwnd, _lparam):
        window_pid = ctypes.c_ulong()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(window_pid))
        if window_pid.value == pid and user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            buffer = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buffer, length + 1)
            if buffer.value == expected_title:
                found.append((hwnd, buffer.value))
                return False
        return True

    user32.EnumWindows(callback, 0)
    return found[0] if found else None


def read_rows(path: Path) -> list[list[str]]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    return [line.split(",") for line in lines[1:] if line]


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = max(0, math.ceil(len(ordered) * fraction) - 1)
    return ordered[index]


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=20)
    parser.add_argument(
        "--exe", type=Path, default=root / "target" / "release" / "markdown-hexer.exe"
    )
    parser.add_argument(
        "--fixture", type=Path, default=root / "tests" / "fixtures" / "startup.md"
    )
    parser.add_argument(
        "--font",
        choices=["default", "serif", "sans", "mono"],
        default="default",
        help="persist this Font in a throwaway APPDATA before measuring",
    )
    parser.add_argument(
        "--log-dir",
        type=Path,
        default=root / "target" / "bench-logs" / "startup",
        help="where the per-run startup CSVs are kept",
    )
    args = parser.parse_args()

    if not args.exe.is_file():
        raise SystemExit(f"release binary not found: {args.exe}")
    if not args.fixture.is_file():
        raise SystemExit(f"fixture not found: {args.fixture}")

    expected_title = f"{args.fixture.name} \u2014 Markdown Hexer"
    external_t1: list[float] = []
    external_t2: list[float] = []
    internal_t1: list[float] = []
    internal_t2: list[float] = []

    args.log_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="hexer-startup-") as temp:
        appdata = None
        if args.font != "default":
            appdata = Path(temp) / "appdata"
            (appdata / "markdown-hexer").mkdir(parents=True)
            (appdata / "markdown-hexer" / "settings.json").write_text(
                f'{{"version": 1, "theme": "light", "font": "{args.font}", '
                '"text_size": "medium"}}',
                encoding="utf-8",
            )
        for run in range(args.runs):
            log = args.log_dir / f"startup-{args.font}-{run}.csv"
            env = os.environ.copy()
            env["HEXER_STARTUP_LOG"] = str(log)
            if appdata is not None:
                env["APPDATA"] = str(appdata)
            launched_ms = time.time() * 1_000.0
            launched_mono = time.monotonic()
            proc = subprocess.Popen([str(args.exe), str(args.fixture)], env=env)
            try:
                t1 = None
                title = ""
                deadline = time.monotonic() + 10.0
                while time.monotonic() < deadline:
                    window = visible_window(proc.pid, expected_title)
                    if window is not None:
                        _, title = window
                        t1 = time.monotonic()
                        break
                    if proc.poll() is not None:
                        raise SystemExit(f"run {run}: app exited before showing a window")
                    time.sleep(0.002)
                if t1 is None:
                    raise SystemExit(
                        f"run {run}: titled window did not become visible in 10 s"
                    )
                if title != expected_title:
                    raise SystemExit(f"run {run}: title {title!r} != {expected_title!r}")

                rows: list[list[str]] = []
                while time.monotonic() < deadline:
                    rows = [row for row in read_rows(log) if len(row) == 4]
                    if rows:
                        break
                    time.sleep(0.002)
                if not rows:
                    raise SystemExit(f"run {run}: app never wrote a startup row")
                row = rows[0]
                t1_ms, t2_ms, _t1_unix, t2_unix = row
                external_t1.append((t1 - launched_mono) * 1_000.0)
                external_t2.append(float(t2_unix) - launched_ms)
                internal_t1.append(float(t1_ms))
                internal_t2.append(float(t2_ms))
            finally:
                proc.kill()
                proc.wait(timeout=10)

    def report(label: str, values: list[float]) -> None:
        print(
            f"{label}: median {statistics.median(values):.1f} ms, "
            f"p95 {percentile(values, 0.95):.1f} ms, "
            f"min {min(values):.1f}, max {max(values):.1f}"
        )

    print(f"runs: {args.runs}")
    print(f"binary: {args.exe} ({args.exe.stat().st_size / (1024 * 1024):.2f} MB)")
    print(f"fixture: {args.fixture}")
    print(f"font: {args.font}" + (" (persisted settings, APPDATA redirected)" if args.font != "default" else ""))
    report("T1 visible (external)", external_t1)
    report("T1 first frame (internal)", internal_t1)
    report("T2 readable (external, end-to-end)", external_t2)
    report("T2 readable (internal, from main)", internal_t2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
