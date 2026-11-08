#!/usr/bin/env python3
"""Measure the first Preview -> Edit switch on a 100 KB / 5,000-line fixture.

The release app is launched once per run with HEXER_FIRST_EDIT_LOG set. It
paints Preview first, then on the next frame switches to Edit, records the
elapsed time through editor construction and layout, and closes itself.
"""

from __future__ import annotations

import argparse
import math
import os
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def read_ms(path: Path) -> float | None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    rows = lines[1:]
    if not rows:
        return None
    return float(rows[0])


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
        "--fixture",
        type=Path,
        default=root / "tests" / "fixtures" / "editor-100kb-5000.md",
    )
    parser.add_argument("--limit", type=float, default=150.0)
    args = parser.parse_args()

    if not args.exe.is_file():
        raise SystemExit(f"release binary not found: {args.exe}")
    if not args.fixture.is_file():
        raise SystemExit(f"fixture not found: {args.fixture}")

    samples: list[float] = []
    with tempfile.TemporaryDirectory(prefix="hexer-first-edit-") as temp:
        for run in range(args.runs):
            log = Path(temp) / f"first-edit-{run}.csv"
            env = os.environ.copy()
            env["HEXER_FIRST_EDIT_LOG"] = str(log)
            proc = subprocess.Popen([str(args.exe), str(args.fixture)], env=env)
            started = time.monotonic()
            value = None
            while time.monotonic() - started < 15.0:
                value = read_ms(log)
                if value is not None:
                    break
                if proc.poll() is not None:
                    break
                time.sleep(0.002)
            try:
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=10)
                raise SystemExit(f"run {run}: app did not close itself")
            if value is None:
                raise SystemExit(
                    f"run {run}: no first-edit row (exit {proc.returncode})"
                )
            samples.append(value)

    p95 = percentile(samples, 0.95)
    print(f"runs: {len(samples)}")
    print(f"binary: {args.exe} ({args.exe.stat().st_size / (1024 * 1024):.2f} MB)")
    print(f"fixture: {args.fixture}")
    print(
        f"first Edit: median {statistics.median(samples):.1f} ms, "
        f"p95 {p95:.1f} ms, p99 {percentile(samples, 0.99):.1f} ms, "
        f"min {min(samples):.1f} ms, max {max(samples):.1f} ms"
    )
    print(f"target: p95 <= {args.limit:.0f} ms")
    if p95 > args.limit:
        print("MISSED target", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
