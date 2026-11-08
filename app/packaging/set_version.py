#!/usr/bin/env python3
"""Set the crate version from a release tag (leading `v` already stripped)."""

from __future__ import annotations

import pathlib
import re
import sys

SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$")


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: set_version.py <version>", file=sys.stderr)
        return 2
    version = sys.argv[1]
    if not SEMVER.match(version):
        print(f"not a semver version: {version!r}", file=sys.stderr)
        return 2

    manifest = pathlib.Path(__file__).resolve().parents[1] / "Cargo.toml"
    text = manifest.read_text(encoding="utf-8")
    # The first `version = "..."` in the file is the [package] version.
    updated, count = re.subn(
        r'^version = "[^"]*"$', f'version = "{version}"', text, count=1, flags=re.M
    )
    if count != 1:
        print(f"could not find the package version in {manifest}", file=sys.stderr)
        return 1
    manifest.write_text(updated, encoding="utf-8", newline="\n")
    print(f"{manifest}: version = {version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
