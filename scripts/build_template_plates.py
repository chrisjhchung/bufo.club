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


def content_bounds(rgba: Pixels, width: int, height: int, alpha_floor: int = 12):
    """Bounding box of the non-transparent pixels."""
    x0, y0, x1, y1 = width, height, -1, -1
    for row in range(height):
        for col in range(width):
            if rgba[(row * width + col) * 4 + 3] > alpha_floor:
                if col < x0:
                    x0 = col
                if row < y0:
                    y0 = row
                if col > x1:
                    x1 = col
                if row > y1:
                    y1 = row
    if x1 < 0:
        return (0, 0, width, height)
    return (x0, y0, x1 - x0 + 1, y1 - y0 + 1)


def squarify(
    rgba: Pixels,
    width: int,
    height: int,
    slot: dict,
    anchor: str = "center",
    pad: float = 0.0,
    trim: bool = True,
):
    """Trim the transparent margin and lay the art into a square canvas.

    Plates come in whatever shape the art was cropped to. Centring a 260x404
    plate inside a 404 square wastes a third of the frame on empty bands, which
    reads as "bufo is too small". Trimming first means he fills the emoji, and
    `anchor` decides whether he sits centred or stands on the bottom edge.

    The slot rectangle is carried through the same transform, so coordinates
    measured against the original plate keep pointing at the same place.
    """
    bx, by, bw, bh = content_bounds(rgba, width, height) if trim else (0, 0, width, height)

    # The square has to hold bufo *and* wherever the subject goes, so the frame
    # is the union of the two. Sizing to the art alone would clip a slot that
    # sits beside him; sizing to the whole plate leaves dead space.
    ux0 = min(bx, slot["x"])
    uy0 = min(by, slot["y"])
    ux1 = max(bx + bw, slot["x"] + slot["w"])
    uy1 = max(by + bh, slot["y"] + slot["h"])
    uw, uh = ux1 - ux0, uy1 - uy0

    size = int(round(max(uw, uh) * (1.0 + pad * 2)))
    scale = 1.0

    # Round once: rounding inside the copy loop drops or doubles whole rows
    # whenever the offset lands on a half pixel.
    offset_x = int(round((size - uw) / 2 - ux0))
    if anchor == "bottom":
        offset_y = int(round(size - uh - size * pad - uy0))
    else:
        offset_y = int(round((size - uh) / 2 - uy0))

    out = bytearray(size * size * 4)
    for row in range(height):
        target_row = row + offset_y
        if not (0 <= target_row < size):
            continue
        for col in range(width):
            target_col = col + offset_x
            if not (0 <= target_col < size):
                continue
            src = (row * width + col) * 4
            if rgba[src + 3] == 0:
                continue
            dst = (target_row * size + target_col) * 4
            out[dst : dst + 4] = rgba[src : src + 4]

    moved = dict(slot)
    moved["x"] = slot["x"] + offset_x
    moved["y"] = slot["y"] + offset_y
    moved["w"] = int(round(slot["w"] * scale))
    moved["h"] = int(round(slot["h"] * scale))
    return size, out, moved


def erase_foreign(rgba: Pixels, width: int, box: tuple[int, int, int, int]) -> None:
    """Clear everything inside `box` that is not bufo himself.

    Useful where the object sits on the transparent background - a crown above
    his head, a logo he is praying to, a sword blade - so the slot starts empty
    instead of relying on the subject to cover the original.
    """
    x, y, w, h = box
    for row in range(y, min(y + h, len(rgba) // (width * 4))):
        for col in range(x, min(x + w, width)):
            index = (row * width + col) * 4
            r, g, b, a = rgba[index], rgba[index + 1], rgba[index + 2], rgba[index + 3]
            if a == 0:
                continue
            green = 10 < g < 230 and g > r + 10 and g > b + 10
            ink = r < 90 and g < 100 and b < 90
            if not (green or ink):
                rgba[index + 3] = 0


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
        # Hand-prepared: an empty pose plus the arm as a separate layer, so the
        # subject sits in his grip with the fingers drawn in front of it.
        "file": "bufo-offers.base.png",
        "overlayFile": "bufo-offers.overlay.png",
        "paint": [],
        "slot": {"x": 5, "y": 46, "w": 73, "h": 67, "rotate": 0, "fit": "contain"},
        "sortOrder": 40,
    },
    {
        "slug": "bufo-wears",
        "name": "Bufo wears …",
        "namePattern": ":bufo-wears-{subject}:",
        "source": "bufo-wears-a-paper-crown.png",
        "paint": [],
        # The crown sits on transparency above his head, so it lifts out cleanly.
        "erase": [{"box": [50, 0, 62, 46]}],
        "slot": {"x": 54, "y": 0, "w": 56, "h": 42, "rotate": 0, "fit": "contain"},
        "sortOrder": 50,
    },
    {
        "slug": "bufo-wields",
        "name": "Bufo wields …",
        "namePattern": ":bufo-wields-{subject}:",
        "file": "bufo-wields.base.png",
        "paint": [],
        "square": {"anchor": "center"},
        # The crop leaves no room beside his fist, so the slot starts off the
        # left edge: the union sizing grows the square to fit it, giving the
        # weapon somewhere to rise into instead of covering his face.
        "slot": {"x": -70, "y": 28, "w": 178, "h": 188, "rotate": 0, "fit": "contain"},
        "sortOrder": 60,
    },
    {
        "slug": "bufo-prays-to",
        "name": "Bufo prays to …",
        "namePattern": ":bufo-prays-to-{subject}:",
        "source": "bufo-prays-to-azure.png",
        "paint": [],
        "erase": [{"box": [0, 0, 60, 60]}],
        # Behind the plate: whatever he prays to looms past his head rather
        # than being pasted on top of it.
        "slot": {"x": 0, "y": 0, "w": 66, "h": 60, "rotate": 0, "fit": "contain", "behind": True},
        "sortOrder": 70,
    },
    {
        "slug": "bufo-approves",
        "name": "Bufo approves …",
        "namePattern": ":bufo-approves-{subject}:",
        "file": "bufo-approves.base.png",
        "paint": [],
        # Keep the empty right-hand side: that is where the approved thing goes.
        # Bottom-anchored so he stands on the floor of the square.
        "square": {"anchor": "bottom"},
        "slot": {"x": 150, "y": 62, "w": 178, "h": 178, "rotate": 0, "fit": "contain", "behind": True},
        "sortOrder": 80,
    },
    {
        "slug": "bufo-babysits",
        "name": "Bufo babysits …",
        "namePattern": ":bufo-babysits-{subject}:",
        "file": "bufo-babysits.base.png",
        "paint": [],
        # Trimmed so he and the pram fill the emoji instead of floating in a
        # tall, mostly empty frame.
        "square": {"anchor": "bottom"},
        "slot": {"x": 22, "y": 252, "w": 118, "h": 86, "rotate": 0, "fit": "contain"},
        "sortOrder": 90,
    },
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
    src_dir = out_dir / "src"

    for template in TEMPLATES:
        # A hand-prepared plate is used as-is; a derived one is cut from the
        # all-the-bufo original by the paint/erase ops below.
        supplied = template.get("file")
        source = src_dir / supplied if supplied else images / template["source"]
        width, height, rgba = decode_png(source)

        for patch in template.get("paint", []):
            fill(rgba, width, tuple(patch["box"]), tuple(patch["color"]))

        for patch in template.get("erase", []):
            erase_foreign(rgba, width, tuple(patch["box"]))

        slot = dict(template["slot"])
        square = template.get("square")
        if square:
            size, rgba, slot = squarify(
                rgba,
                width,
                height,
                slot,
                anchor=square.get("anchor", "center"),
                pad=square.get("pad", 0.0),
                trim=square.get("trim", True),
            )
            width = height = size

        base_name = f"{template['slug']}.base.png"
        encode_png(out_dir / base_name, width, height, rgba)

        overlay_name = None
        supplied_overlay = template.get("overlayFile")
        if supplied_overlay:
            ow, oh, overlay_rgba = decode_png(src_dir / supplied_overlay)
            overlay_name = f"{template['slug']}.overlay.png"
            encode_png(out_dir / overlay_name, ow, oh, overlay_rgba)

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
                "slot": slot,
                "sortOrder": template["sortOrder"],
                "derivedFrom": (
                    f"supplied plate: templates/src/{supplied}"
                    if supplied
                    else f"knobiknows/all-the-bufo:all-the-bufo/{template['source']}"
                ),
            }
        )
        print(f"{template['slug']}: {width}x{height} base={base_name} overlay={overlay_name}")

    (out_dir / "templates.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
