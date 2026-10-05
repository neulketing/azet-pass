# "AZET Pass" as one SVG path (Inter, from the Bitwarden clients' own webfont, OFL-1.1), for slots that cannot hold text
# (Android vector drawables). Output: generated/wordmark.json {width, height, path} with the cap height filling 72% of height.
# usage: python wordmark.py <inter.woff2> <height>
import json, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
font = TTFont(sys.argv[1]); H = float(sys.argv[2])
if 'fvar' in font:
    from fontTools.varLib.instancer import instantiateVariableFont
    font = instantiateVariableFont(font, {'wght': 700})
gs, cmap = font.getGlyphSet(), font.getBestCmap()
cap = font['OS/2'].sCapHeight or 1490
s = H * 0.72 / cap
pen = SVGPathPen(gs); x = 0
for ch in "AZET Pass":
    g = cmap[ord(ch)]
    gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, H * 0.86)))
    x += gs[g].width * s
json.dump({"width": round(x, 1), "height": H, "path": pen.getCommands()}, open("generated/wordmark.json", "w"))
print(round(x, 1), H, len(pen.getCommands()))
