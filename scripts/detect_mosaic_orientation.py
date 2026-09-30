#!/usr/bin/env python3
"""Work out how each mosaic's tile names map onto its grid, by measuring seams.

`name-a-b` is ambiguous: bigbufo means row-then-column, bufo-blank-stare means
column-then-row. Guessing transposes the picture. The correct arrangement is
decidable, though — in the right one, the pixels along each internal seam
continue from one tile into the next, and in the wrong one they do not.

    python3 scripts/detect_mosaic_orientation.py https://cdn.bufo.club

Prints a verdict per mosaic and the SQL to record it. Tiles are read from the
public manifest, so this runs against whatever is deployed.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_template_plates import decode_png  # noqa: E402

TILE = re.compile(r"^(.*)-(\d+)-(\d+)$")


def fetch(url: str) -> bytes:
    # The CDN turns away a bare urllib user agent.
    request = urllib.request.Request(url, headers={"User-Agent": "bufo.club-tools/1.0"})
    with urllib.request.urlopen(request) as response:
        return response.read()


def seam_cost(left, right) -> float:
    """Mean colour difference down the join between two side-by-side tiles."""
    lw, lh, lp = left
    rw, rh, rp = right
    height = min(lh, rh)
    total, counted = 0.0, 0
    for y in range(height):
        li = (y * lw + (lw - 1)) * 4
        ri = (y * rw) * 4
        # Transparent edges carry no signal about whether the seam matches.
        if lp[li + 3] < 40 or rp[ri + 3] < 40:
            continue
        total += sum(abs(lp[li + k] - rp[ri + k]) for k in range(3)) / 3
        counted += 1
    return total / counted if counted else 0.0


def transpose(tile):
    """Rotate a tile's pixels so vertical seams can be scored as horizontal ones."""
    w, h, p = tile
    out = bytearray(w * h * 4)
    for y in range(h):
        for x in range(w):
            src = (y * w + x) * 4
            dst = (x * h + y) * 4
            out[dst : dst + 4] = p[src : src + 4]
    return (h, w, out)


def score(tiles: dict, rows: int, cols: int, swap: bool) -> float:
    """Total seam cost for one interpretation; lower means the pieces line up."""
    def at(row: int, col: int):
        return tiles.get((col, row) if swap else (row, col))

    total, seams = 0.0, 0
    for row in range(rows):
        for col in range(cols - 1):
            a, b = at(row, col), at(row, col + 1)
            if a and b:
                total += seam_cost(a, b)
                seams += 1
    for col in range(cols):
        for row in range(rows - 1):
            a, b = at(row, col), at(row + 1, col)
            if a and b:
                total += seam_cost(transpose(a), transpose(b))
                seams += 1
    return total / seams if seams else float("inf")


def main() -> int:
    cdn = sys.argv[1] if len(sys.argv) > 1 else "https://cdn.bufo.club"
    manifest = json.loads(fetch(f"{cdn}/manifest/latest.json"))

    groups: dict[str, dict] = defaultdict(dict)
    for bufo in manifest["bufos"]:
        hit = TILE.match(bufo["s"])
        if hit:
            groups[hit.group(1)][(int(hit.group(2)), int(hit.group(3)))] = bufo["e"]

    statements = []
    for base, cells in sorted(groups.items()):
        a_max = max(a for a, _ in cells) + 1
        b_max = max(b for _, b in cells) + 1
        if len(cells) != a_max * b_max or a_max < 2 or b_max < 2:
            continue

        tiles = {}
        for (a, b), ext in cells.items():
            tiles[(a, b)] = decode_png_bytes(fetch(f"{cdn}/b/{base}-{a}-{b}.{ext}"))

        row_col = score(tiles, a_max, b_max, swap=False)
        col_row = score(tiles, b_max, a_max, swap=True)
        verdict = "row-col" if row_col <= col_row else "col-row"
        print(f"{base:24} row-col={row_col:7.2f}  col-row={col_row:7.2f}  ->  {verdict}")
        statements.append(
            "INSERT INTO mosaic_layouts (base, orientation, updated_at) "
            f"VALUES ('{base}', '{verdict}', unixepoch()) "
            "ON CONFLICT (base) DO UPDATE SET orientation = excluded.orientation, "
            "updated_at = excluded.updated_at;"
        )

    if statements:
        out = Path(__file__).resolve().parent.parent / ".seed-cache" / "mosaic-layouts.sql"
        out.parent.mkdir(exist_ok=True)
        out.write_text("\n".join(statements) + "\n")
        print(f"\nwrote {out}")
    return 0


def decode_png_bytes(data: bytes):
    tmp = Path("/tmp/.mosaic-tile.png")
    tmp.write_bytes(data)
    return decode_png(tmp)


if __name__ == "__main__":
    raise SystemExit(main())
