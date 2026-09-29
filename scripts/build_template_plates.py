#!/usr/bin/env python3
"""Build the generator's template plates from all-the-bufo source images.

The generator composites a user's photo into a slot on a template. Those
templates are hand-picked bufos whose held object can either be painted out
(when it sits on a flat background) or covered completely by the subject.

This is an authoring tool, not part of the runtime: it is run once, and its
output (templates/*.png and templates/templates.json) is committed. Rerun it
after cloning all-the-bufo to reproduce the plates byte for byte:

    python3 scripts/build_template_plates.py path/to/all-the-bufo

Pure stdlib on purpose - no Pillow, no numpy, nothing to install.
"""

from __future__ import annotations

import json
import struct
import sys
import zlib
from pathlib import Path

Pixels = bytearray


def decode_png(path: Path) -> tuple[int, int, Pixels]:
    """Decode an 8-bit non-interlaced PNG to RGBA bytes."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")

    pos, idat, palette, transparency = 8, b"", None, None
    width = height = color = 0
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        kind = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            width, height, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or interlace:
                raise ValueError(f"{path}: only 8-bit non-interlaced PNGs are supported")
        elif kind == b"IDAT":
            idat += body
        elif kind == b"PLTE":
            palette = body
        elif kind == b"tRNS":
            transparency = body
        elif kind == b"IEND":
            break
        pos += 12 + length

    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color]
    raw = zlib.decompress(idat)
    stride = width * channels
    flat = bytearray(height * stride)
    previous = bytearray(stride)
    read = 0

    for y in range(height):
        filter_type = raw[read]
        read += 1
        line = bytearray(raw[read : read + stride])
        read += stride
        for i in range(stride):
            left = line[i - channels] if i >= channels else 0
            up = previous[i]
            up_left = previous[i - channels] if i >= channels else 0
            value = line[i]
            if filter_type == 1:
                value += left
            elif filter_type == 2:
                value += up
            elif filter_type == 3:
                value += (left + up) // 2
            elif filter_type == 4:
                pa, pb, pc = abs(up - up_left), abs(left - up_left), abs(left + up - 2 * up_left)
                value += left if pa <= pb and pa <= pc else (up if pb <= pc else up_left)
            line[i] = value & 0xFF
        flat[y * stride : (y + 1) * stride] = line
        previous = line

    rgba = bytearray(width * height * 4)
    for i in range(width * height):
        if color == 6:
            rgba[i * 4 : i * 4 + 4] = flat[i * 4 : i * 4 + 4]
        elif color == 2:
            rgba[i * 4 : i * 4 + 3] = flat[i * 3 : i * 3 + 3]
            rgba[i * 4 + 3] = 255
        elif color == 3:
            index = flat[i]
            rgba[i * 4 : i * 4 + 3] = palette[index * 3 : index * 3 + 3]
            rgba[i * 4 + 3] = transparency[index] if transparency and index < len(transparency) else 255
        elif color == 4:
            grey = flat[i * 2]
            rgba[i * 4 : i * 4 + 3] = bytes([grey] * 3)
            rgba[i * 4 + 3] = flat[i * 2 + 1]
        else:
            grey = flat[i]
            rgba[i * 4 : i * 4 + 3] = bytes([grey] * 3)
            rgba[i * 4 + 3] = 255
    return width, height, rgba


def encode_png(path: Path, width: int, height: int, rgba: Pixels) -> None:
    raw = b"".join(b"\x00" + bytes(rgba[y * width * 4 : (y + 1) * width * 4]) for y in range(height))

    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def fill(rgba: Pixels, width: int, box: tuple[int, int, int, int], color: tuple[int, int, int, int]) -> None:
    x, y, w, h = box
    for row in range(y, y + h):
        for col in range(x, x + w):
            index = (row * width + col) * 4
            rgba[index : index + 4] = bytes(color)


def extract_hands(rgba: Pixels, width: int, height: int, box: tuple[int, int, int, int]) -> Pixels:
    """Lift bufo's hands out of an image so they can be drawn in front of the subject.

    Green pixels are bufo. His black outline is the tricky part: the object he
    is holding is inked in the same black, so ink is kept only where it hugs a
    green pixel - otherwise the object's silhouette comes along for the ride.
    """
    x, y, w, h = box
    green = set()
    for row in range(y, y + h):
        for col in range(x, x + w):
            index = (row * width + col) * 4
            r, g, b, a = rgba[index], rgba[index + 1], rgba[index + 2], rgba[index + 3]
            if a > 40 and 10 < g < 220 and g >= r - 10 and g > b + 10:
                green.add((col, row))

    reach = 2
    near_green = {
        (col + dx, row + dy)
        for col, row in green
        for dy in range(-reach, reach + 1)
        for dx in range(-reach, reach + 1)
    }

    out = bytearray(width * height * 4)
    for row in range(y, y + h):
        for col in range(x, x + w):
            index = (row * width + col) * 4
            r, g, b, a = rgba[index], rgba[index + 1], rgba[index + 2], rgba[index + 3]
            if a <= 40:
                continue
            ink = r < 90 and g < 100 and b < 90
            if (col, row) in green or (ink and (col, row) in near_green):
                out[index : index + 4] = bytes([r, g, b, a])
    return out


# Each template names the all-the-bufo image it is derived from, the slot the
# subject is drawn into, and how the plate is prepared.
TEMPLATES = [
    {
        "slug": "bufo-thinks-about",
        "name": "Bufo thinks about …",
        "namePattern": ":bufo-thinks-about-{subject}:",
        "source": "bufo-thinks-about-azure.png",
        # The thought bubble's interior is flat white, so the original logo
        # paints out cleanly and the subject can sit inside without covering it.
        "paint": [{"box": [72, 11, 41, 42], "color": [255, 255, 255, 255]}],
        "slot": {"x": 68, "y": 12, "w": 50, "h": 40, "rotate": 0, "fit": "contain"},
        "sortOrder": 10,
    },
    {
        "slug": "old-bufo-yells-at",
        "name": "Old bufo yells at …",
        "namePattern": ":old-bufo-yells-at-{subject}:",
        "source": "old-bufo-yells-at-hubble.png",
        # Flat sky background: the satellite paints out with the sky colour.
        "paint": [{"box": [0, 0, 72, 72], "color": [100, 207, 253, 255]}],
        "slot": {"x": 8, "y": 8, "w": 56, "h": 52, "rotate": 0, "fit": "contain"},
        "sortOrder": 20,
    },
    {
        "slug": "bufo-takes",
        "name": "Bufo takes …",
        "namePattern": ":bufo-takes-{subject}:",
        "source": "bufo-takes-croissant.png",
        # The croissant sits on bufo's chest with no flat background to restore,
        # so the subject covers it instead of painting it out.
        "paint": [],
        "slot": {"x": 14, "y": 49, "w": 48, "h": 48, "rotate": 0, "fit": "cover"},
        "sortOrder": 30,
    },
    {
        "slug": "bufo-offers",
        "name": "Bufo offers …",
        "namePattern": ":bufo-offers-{subject}:",
        "source": "bufo-offers-a-bagel.png",
        # The whole "bufo offers X" family shares one base pose; diffing two of
        # them (a bagel against a clover) gives the exact region the object
        # occupies, which the subject then covers.
        "paint": [],
        "slot": {"x": 5, "y": 46, "w": 73, "h": 67, "rotate": 0, "fit": "cover"},
        "sortOrder": 40,
    }
]

def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    source_root = Path(sys.argv[1])
    if not (source_root / "all-the-bufo").is_dir() and source_root.name != "all-the-bufo":
        print(f"expected an all-the-bufo checkout, got {source_root}")
        return 2
    images = source_root if source_root.name == "all-the-bufo" else source_root / "all-the-bufo"

    out_dir = Path(__file__).resolve().parent.parent / "templates"
    out_dir.mkdir(exist_ok=True)

    manifest = []
    for template in TEMPLATES:
        source = images / template["source"]
        width, height, rgba = decode_png(source)

        for patch in template.get("paint", []):
            fill(rgba, width, tuple(patch["box"]), tuple(patch["color"]))

        base_name = f"{template['slug']}.base.png"
        encode_png(out_dir / base_name, width, height, rgba)

        overlay_name = None
        overlay = template.get("overlay")
        if overlay:
            lifted = extract_hands(rgba, width, height, tuple(overlay["box"]))
            overlay_name = f"{template['slug']}.overlay.png"
            encode_png(out_dir / overlay_name, width, height, lifted)

        manifest.append(
            {
                "slug": template["slug"],
                "name": template["name"],
                "namePattern": template["namePattern"],
                "base": base_name,
                "overlay": overlay_name,
                "canvas": {"w": width, "h": height},
                "slot": template["slot"],
                "sortOrder": template["sortOrder"],
                "derivedFrom": f"knobiknows/all-the-bufo:all-the-bufo/{template['source']}",
            }
        )
        print(f"{template['slug']}: {width}x{height} base={base_name} overlay={overlay_name}")

    (out_dir / "templates.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
