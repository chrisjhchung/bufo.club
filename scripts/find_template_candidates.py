#!/usr/bin/env python3
"""Find bufo images that make good generator templates, and derive their slots.

The all-the-bufo collection contains families that share one base pose -
"bufo offers X", "bufo thinks about X" - drawn by pasting a different object
onto the same frog. Diffing two members of such a family isolates exactly the
pixels that differ, and those pixels *are* the object region: a slot rectangle
measured rather than guessed.

    python3 scripts/find_template_candidates.py path/to/all-the-bufo [--min-family 3]

Prints each candidate family with the tightest slot found and the member to use
as the base plate. Nothing is written; feed the numbers into TEMPLATES in
build_template_plates.py.
"""

from __future__ import annotations

import itertools
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_template_plates import decode_png  # noqa: E402

# A family is everything sharing a verb phrase: the first three hyphen-separated
# words catch "bufo-offers-a", "bufo-thinks-about", "old-bufo-yells-at".
def family_key(name: str) -> str:
    parts = name.removesuffix('.png').split('-')
    return '-'.join(parts[:3])


def diff_box(a: tuple[int, int, bytearray], b: tuple[int, int, bytearray], threshold: int = 24):
    wa, ha, pa = a
    wb, hb, pb = b
    if (wa, ha) != (wb, hb):
        return None
    x0, y0, x1, y1 = wa, ha, -1, -1
    for y in range(ha):
        row = y * wa
        for x in range(wa):
            i = (row + x) * 4
            if (
                abs(pa[i] - pb[i]) > threshold
                or abs(pa[i + 1] - pb[i + 1]) > threshold
                or abs(pa[i + 2] - pb[i + 2]) > threshold
                or abs(pa[i + 3] - pb[i + 3]) > threshold
            ):
                if x < x0:
                    x0 = x
                if y < y0:
                    y0 = y
                if x > x1:
                    x1 = x
                if y > y1:
                    y1 = y
    if x1 < 0:
        return None
    return (x0, y0, x1 - x0 + 1, y1 - y0 + 1)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    root = Path(sys.argv[1])
    images = root if root.name == 'all-the-bufo' else root / 'all-the-bufo'
    min_family = 3
    if '--min-family' in sys.argv:
        min_family = int(sys.argv[sys.argv.index('--min-family') + 1])

    families: dict[str, list[str]] = defaultdict(list)
    for path in sorted(images.glob('*.png')):
        families[family_key(path.name)].append(path.name)

    candidates = {k: v for k, v in families.items() if len(v) >= min_family}
    print(f'{len(candidates)} families with {min_family}+ members\n')

    results = []
    for key, members in sorted(candidates.items()):
        # Four members is plenty to find a matching pair, and keeps this quick.
        sample = members[:4]
        decoded = {}
        for name in sample:
            try:
                decoded[name] = decode_png(images / name)
            except Exception:
                continue

        best = None
        for a, b in itertools.combinations(decoded, 2):
            box = diff_box(decoded[a], decoded[b])
            if not box:
                continue
            width, height, _ = decoded[a]
            area = box[2] * box[3]
            # A pair that differs everywhere is two different drawings, not one
            # base with a swapped object.
            if area > width * height * 0.45:
                continue
            if best is None or area < best[0]:
                best = (area, box, a, b, width, height)

        if best:
            area, box, a, b, width, height = best
            results.append((area / (width * height), key, box, a, b, width, height))

    results.sort()
    print(f'{"family":26} {"slot (x,y,w,h)":22} {"canvas":9} base image')
    print('-' * 100)
    for share, key, box, a, _b, width, height in results:
        print(f'{key:26} {str(box):22} {f"{width}x{height}":9} {a}   ({share:.0%} of frame)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
