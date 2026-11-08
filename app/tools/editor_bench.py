#!/usr/bin/env python3
"""Measure frame CPU time while typing, selecting, and scrolling a 5,000-line file.

The release example app is launched once per run with HEXER_EDITOR_BENCH_LOG
set. It warms up for two seconds (one second of typing), then records
eframe's frame CPU time for ten seconds of typing, shift-selection, and
scrolling, writes one CSV row per frame, and exits.
"""

from __future__ import annotations

import argparse
import csv
import math
import os
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = max(0, math.ceil(len(ordered) * fraction) - 1)
    return ordered[index]


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    suffix = ".exe" if os.name == "nt" else ""
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument(
        "--exe",
        type=Path,
        default=root / "target" / "release" / "examples" / f"editor_5k_bench{suffix}",
    )
    parser.add_argument(
        "--fixture",
        type=Path,
        default=root / "tests" / "fixtures" / "editor-100kb-5000.md",
    )
    parser.add_argument("--limit", type=float, default=16.7)
    args = parser.parse_args()

    if not args.exe.is_file():
        raise SystemExit(f"release example not found: {args.exe}")
    if not args.fixture.is_file():
        raise SystemExit(f"fixture not found: {args.fixture}")

    failed = False
    with tempfile.TemporaryDirectory(prefix="hexer-editor-") as temp:
        for run in range(args.runs):
            log = Path(temp) / f"frames-{run}.csv"
            env = os.environ.copy()
            env["HEXER_EDITOR_BENCH_LOG"] = str(log)
            # Foreground windows get a priority boost; match it so unrelated
            # background work does not masquerade as editor frame time.
            creationflags = getattr(subprocess, "HIGH_PRIORITY_CLASS", 0)
            proc = subprocess.run(
                [str(args.exe), str(args.fixture)],
                env=env,
                timeout=45,
                check=False,
                creationflags=creationflags,
            )
            if proc.returncode != 0 or not log.is_file():
                raise SystemExit(f"run {run}: benchmark did not finish (exit {proc.returncode})")
            with log.open(newline="", encoding="utf-8") as source:
                rows = list(csv.DictReader(source))
            values = [float(row["cpu_ms"]) for row in rows]
            if not values:
                raise SystemExit(f"run {run}: no frames recorded")
            span = float(rows[-1]["seconds"])
            if span < 9.5:
                raise SystemExit(f"run {run}: window too short ({span:.1f} s)")
            over = [row for row in rows if float(row["cpu_ms"]) > args.limit]
            print(
                f"run {run}: {len(values)} frames over {span:.2f} s, "
                f"p50 {statistics.median(values):.2f} ms, "
                f"p95 {percentile(values, 0.95):.2f} ms, "
                f"p99 {percentile(values, 0.99):.2f} ms, "
                f"max {max(values):.2f} ms, over budget {len(over)}"
            )
            for row in over:
                print(
                    f"  {row['seconds']} s {row['cpu_ms']} ms ({row['phase']})",
                    file=sys.stderr,
                )
            failed |= bool(over)

    print(f"binary: {args.exe}")
    print(f"fixture: {args.fixture}")
    print(f"target: no frame over {args.limit:.1f} ms CPU time")
    if failed:
        print("MISSED target", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
