#!/usr/bin/env python3
"""Mark a screenshot for Nik's guides: red rounded box(es) with a numbered circle matching the step.

Usage: python3 mark_screenshot.py in.png out-marked.png "x0,y0,x1,y1,LABEL" ["x0,y0,x1,y1,LABEL" ...]
Coordinates are in the image's own pixels. LABEL is the step number (or short text, e.g. OK).
Needs Pillow (pip install pillow).
"""
import sys
from PIL import Image, ImageDraw, ImageFont

RED = (220, 30, 30)


def font(size):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
              "C:/Windows/Fonts/arialbd.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main(src, dst, boxes):
    im = Image.open(src).convert("RGB")
    d = ImageDraw.Draw(im)
    scale = max(1, round(min(im.size) / 900))
    f = font(24 * scale)
    for spec in boxes:
        x0, y0, x1, y1, label = spec.split(",", 4)
        x0, y0, x1, y1 = map(int, (x0, y0, x1, y1))
        pad, r = 8 * scale, 22 * scale
        d.rounded_rectangle((x0 - pad, y0 - pad, x1 + pad, y1 + pad), radius=12 * scale, outline=RED, width=6 * scale)
        cx = min(x1 + pad + r + 4 * scale, im.width - r - 2)
        cy = max(y0 - pad, r + 2)
        rr = max(r, int(d.textlength(label, font=f) / 2) + 8 * scale)
        d.ellipse((cx - rr, cy - r, cx + rr, cy + r), fill=RED)
        d.text((cx, cy), label, fill="white", font=f, anchor="mm")
    im.save(dst)
    print(f"marked {len(boxes)} box(es) -> {dst}")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
