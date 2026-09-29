"""Turn a name into a dot-matrix grid.

Renders the text large in Archivo (the portfolio's display face), then samples
it down to a grid: each cell stores how much of it is covered by ink, 0..1.
build.mjs turns that grid into dots, so all styling lives in one place.

Run once, or whenever the name changes:
    pip install pillow
    python scripts/dotname.py "KOUSHIK" "GOPATHI" --cols 116
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent

ap = argparse.ArgumentParser()
ap.add_argument("lines", nargs="+", help="one argument per line of text")
ap.add_argument("--cols", type=int, default=116, help="dots across")
ap.add_argument("--ss", type=int, default=12, help="supersampling per dot")
ap.add_argument("--gap", type=float, default=0.28, help="line gap, in line heights")
ap.add_argument("--pad", type=int, default=2, help="empty dots around the text")
ap.add_argument("-o", default=str(HERE.parent / "data" / "name-grid.json"))
args = ap.parse_args()

font = ImageFont.truetype(str(HERE / "archivo-display.ttf"), 400)

# Measure every line at a reference size, then scale so the widest one fills the grid.
boxes = [font.getbbox(line) for line in args.lines]
widest = max(b[2] - b[0] for b in boxes)
cap = max(b[3] - b[1] for b in boxes)
inner = (args.cols - 2 * args.pad) * args.ss
scale = inner / widest
line_h = cap * scale
rows_px = int(line_h * len(args.lines) + line_h * args.gap * (len(args.lines) - 1)) + 2 * args.pad * args.ss
rows = -(-rows_px // args.ss)

img = Image.new("L", (args.cols * args.ss, rows * args.ss), 0)
draw = ImageDraw.Draw(img)
big = ImageFont.truetype(str(HERE / "archivo-display.ttf"), round(400 * scale))
y = args.pad * args.ss
for line in args.lines:
    b = big.getbbox(line)
    x = (img.width - (b[2] - b[0])) / 2 - b[0]
    draw.text((x, y - b[1]), line, fill=255, font=big)
    y += line_h * (1 + args.gap)

# Box-filter down: the average of each ss×ss block is that dot's coverage.
small = img.resize((args.cols, rows), Image.BOX)
px = small.load()
grid = [[round(px[c, r] / 255, 2) for c in range(args.cols)] for r in range(rows)]
Path(args.o).write_text(json.dumps({"cols": args.cols, "rows": rows, "text": args.lines, "grid": grid}))
lit = sum(v > 0.1 for row in grid for v in row)
print(f"{args.cols}x{rows} grid, {lit} lit dots -> {args.o}")
