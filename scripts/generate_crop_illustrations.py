"""
Generate simple original SVG illustrations for every crop the model can recommend.

    python scripts/generate_crop_illustrations.py

Reads ml-service/models/crop_recommendation/metadata.json (crop names + slugs) and writes
frontend/public/crops/<slug>.svg plus fallback.svg. These are stylised illustrations, not
photographs. To use a real photo for a crop, drop <slug>.jpg/.svg over it (the frontend
falls back to fallback.svg only when the file for the slug is missing).
Standard library only.
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
META = ROOT / "ml-service" / "models" / "crop_recommendation" / "metadata.json"
OUT = ROOT / "frontend" / "public" / "crops"

W, H = 200, 160
GREEN, DGREEN, LGREEN = "#3f9142", "#2a6b30", "#7fc46b"


def leaf(x, y, length, angle, fill=GREEN, width=None):
    """A pointed leaf starting at (x, y) pointing at `angle` degrees (0 = right, -90 = up)."""
    w = width or length * 0.38
    return (
        f'<g transform="translate({x},{y}) rotate({angle})"><path d="M0 0 C{length*.3} {-w} {length*.75} {-w*.8} {length} 0 '
        f'C{length*.75} {w*.8} {length*.3} {w} 0 0Z" fill="{fill}"/>'
        f'<path d="M0 0 L{length*.9} 0" stroke="{DGREEN}" stroke-width="1" opacity=".5"/></g>'
    )


def ellipse(cx, cy, rx, ry, fill, angle=0, stroke=None):
    s = f' stroke="{stroke}" stroke-width="1.2"' if stroke else ""
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{fill}" transform="rotate({angle} {cx} {cy})"{s}/>'


# ---------------------------------------------------------------- glyphs
def ear(grain, stem="#8a9a3a", awns=False, droop=False, ears=1):
    out = []
    for k in range(ears):
        ox = 100 + (k - (ears - 1) / 2) * 34
        top = 22 + (k % 2) * 6
        if droop:
            out.append(f'<path d="M{ox} 140 C{ox} 80 {ox+2} 50 {ox+26} 38" stroke="{stem}" stroke-width="3" fill="none"/>')
            for i in range(7):
                t = i / 6
                x, y = ox + 8 + 22 * t, 46 + 6 * t - 2
                out.append(ellipse(x + 2, y + 6 + i * 3, 4.2, 6.5, grain, 10 - i * 4))
        else:
            out.append(f'<path d="M{ox} 140 L{ox} {top+20}" stroke="{stem}" stroke-width="3" fill="none"/>')
            for i in range(6):
                y = top + i * 10
                out.append(ellipse(ox - 7, y + 6, 4.5, 8, grain, -25))
                out.append(ellipse(ox + 7, y + 6, 4.5, 8, grain, 25))
                if awns:
                    out.append(f'<path d="M{ox-9} {y} L{ox-16} {y-14} M{ox+9} {y} L{ox+16} {y-14}" stroke="{stem}" stroke-width="1"/>')
            out.append(ellipse(ox, top - 2, 4.5, 8, grain))
    out.append(leaf(100, 140, 46, -160, GREEN) + leaf(100, 140, 46, -20, LGREEN))
    return "".join(out)


def cob(kernel="#f2c230"):
    out = [leaf(100, 146, 70, -125, GREEN, 26), leaf(100, 146, 70, -55, LGREEN, 26)]
    out.append(f'<path d="M100 140 C78 120 76 60 100 24 C124 60 122 120 100 140Z" fill="{kernel}"/>')
    for r in range(8):
        for c in range(4):
            out.append(f'<circle cx="{88+c*8}" cy="{40+r*11}" r="3.2" fill="#e0a814" opacity=".55"/>')
    out.append(leaf(100, 146, 56, -100, DGREEN, 20))
    return "".join(out)


def pod(pod_color, leaf_color=GREEN, seed="#c9d98a", pods=3):
    out = [f'<path d="M100 148 C96 118 104 96 100 60" stroke="{DGREEN}" stroke-width="3" fill="none"/>']
    out.append(leaf(100, 132, 44, -155, leaf_color) + leaf(100, 116, 44, -25, leaf_color))
    angles = (-30, 30) if pods == 2 else (-32, 0, 32)
    for a in angles:
        out.append(
            f'<g transform="translate(100,52) rotate({a})">'
            f'<rect x="-9" y="0" width="18" height="66" rx="9" fill="{pod_color}" stroke="{DGREEN}" stroke-width="1.2" stroke-opacity=".5"/>'
        )
        for y in (14, 28, 42, 56):
            out.append(f'<circle cx="0" cy="{y}" r="5.2" fill="{seed}" opacity=".95"/>')
        out.append('<rect x="-6" y="4" width="3" height="56" rx="1.5" fill="#ffffff" opacity=".22"/></g>')
    return "".join(out)


def flower(petal, disk, petals=12, small=False, stem=GREEN):
    r = 15 if small else 22
    cx, cy = 100, 62
    out = [f'<path d="M100 146 L100 {cy+r}" stroke="{DGREEN}" stroke-width="4"/>', leaf(100, 124, 44, -155, stem) + leaf(100, 108, 44, -25, stem)]
    for i in range(petals):
        a = 360 / petals * i
        out.append(f'<ellipse cx="{cx}" cy="{cy-r-9}" rx="{5 if small else 7}" ry="{11 if small else 15}" fill="{petal}" transform="rotate({a} {cx} {cy})"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{disk}"/>')
    if not small:
        for i in range(14):
            a = i * 2.4
            out.append(f'<circle cx="{cx+math.cos(a)*(i*1.3)}" cy="{cy+math.sin(a)*(i*1.3)}" r="1.6" fill="#00000030"/>')
    return "".join(out)


def boll():
    out = [f'<path d="M100 148 L100 92" stroke="{DGREEN}" stroke-width="4"/>', leaf(100, 130, 48, -160) + leaf(100, 130, 48, -20, LGREEN)]
    for dx, dy, r in [(-16, 56, 17), (16, 56, 17), (0, 40, 19), (0, 66, 18)]:
        out.append(f'<circle cx="{100+dx}" cy="{dy}" r="{r}" fill="#ffffff" stroke="#dfe6e0" stroke-width="1.5"/>')
    out.append(f'<path d="M78 74 Q100 96 122 74 L114 92 L86 92Z" fill="#7a5a3a"/>')
    return "".join(out)


def stalks(fill="#7fb069", flower_color=None, tall=True):
    out = []
    for x, h in [(78, 90), (100, 116), (122, 96)]:
        out.append(f'<path d="M{x} 148 L{x} {148-h}" stroke="{DGREEN}" stroke-width="5" stroke-linecap="round"/>')
        for k in range(3):
            out.append(leaf(x, 140 - k * 26, 34, -150 if k % 2 == 0 else -30, fill))
        if flower_color:
            out.append(f'<circle cx="{x}" cy="{148-h-3}" r="6" fill="{flower_color}"/>')
    return "".join(out)


def cane():
    out = []
    for x, top in [(76, 52), (100, 38), (124, 48)]:
        out.append(f'<rect x="{x-6}" y="{top}" width="12" height="{148-top}" rx="5" fill="#9a4f7d"/>')
        for y in range(top + 16, 146, 22):
            out.append(f'<rect x="{x-7}" y="{y}" width="14" height="4" rx="2" fill="#6f2f57"/>')
        out.append(leaf(x, top + 4, 34, -125, GREEN, 12) + leaf(x, top + 4, 34, -55, LGREEN, 12))
    return "".join(out)


def palm(nut="#7a4b22", nuts=True):
    out = ['<path d="M96 148 C92 110 100 84 104 58 L112 58 C110 90 108 118 108 148Z" fill="#8a6a45"/>']
    for a in (-170, -140, -110, -70, -40, -10):
        out.append(leaf(108, 62, 50, a, GREEN, 14))
    if nuts:
        for dx in (-8, 4, 14):
            out.append(f'<circle cx="{108+dx}" cy="{62+abs(dx)/3}" r="7" fill="{nut}"/>')
    return "".join(out)


def banana():
    out = [leaf(100, 140, 84, -125, GREEN, 26), leaf(100, 140, 84, -55, LGREEN, 26)]
    out.append('<path d="M100 148 L100 60" stroke="#6b5a2d" stroke-width="5"/>')
    for i, (x, y) in enumerate([(70, 66), (86, 62), (102, 62), (118, 66)]):
        out.append(f'<path d="M{x} {y} C{x-16} {y+30} {x-6} {y+58} {x+10} {y+66} C{x+2} {y+40} {x+8} {y+24} {x+14} {y+6}Z" fill="#f2cf3a" stroke="#c9a41f" stroke-width="1.5"/>')
    return "".join(out)


def tuber(fill="#c69a5d", spots="#8a6a3a", long=False, tops=True):
    out = []
    if tops:
        out.append(leaf(100, 78, 56, -140, GREEN, 18) + leaf(100, 78, 56, -40, LGREEN, 18))
    if long:
        out.append(f'<path d="M40 128 C70 84 130 96 168 92 C150 132 80 148 40 128Z" fill="{fill}"/>')
        out.append(f'<path d="M60 124 C90 108 120 108 150 100" stroke="{spots}" stroke-width="2" fill="none" opacity=".5"/>')
    else:
        out.append(ellipse(100, 112, 52, 36, fill, -8))
        for x, y in [(78, 104), (104, 96), (122, 118), (90, 126), (70, 120)]:
            out.append(f'<circle cx="{x}" cy="{y}" r="2.6" fill="{spots}"/>')
    return "".join(out)


def bulb(fill, line, cloves=False):
    out = [f'<path d="M100 40 C96 22 104 14 110 10" stroke="{GREEN}" stroke-width="5" fill="none" stroke-linecap="round"/>']
    out.append(f'<path d="M100 40 C70 70 54 96 60 118 C66 140 134 140 140 118 C146 96 130 70 100 40Z" fill="{fill}"/>')
    n = 4 if cloves else 5
    for i in range(n):
        x = 66 + i * (68 / (n - 1))
        out.append(f'<path d="M100 42 C{x-8} 80 {x-10} 110 {x} 132" stroke="{line}" stroke-width="2" fill="none" opacity=".7"/>')
    out.append('<path d="M92 138 L88 150 M100 140 L100 152 M108 138 L112 150" stroke="#e5d7bd" stroke-width="2"/>')
    return "".join(out)


def rhizome(fill, cut):
    out = []
    for x, y, w, h, a in [(56, 100, 62, 26, -12), (94, 88, 58, 26, 8), (122, 108, 52, 24, -6), (78, 116, 50, 22, 4)]:
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" transform="rotate({a} {x+w/2} {y+h/2})"/>')
    out.append(f'<ellipse cx="66" cy="96" rx="6" ry="9" fill="{cut}"/>')
    out.append(leaf(96, 92, 58, -110, GREEN, 16) + leaf(120, 96, 52, -70, LGREEN, 16))
    return "".join(out)


def chilli(fill="#d62f2f"):
    out = [leaf(100, 40, 40, -150, GREEN, 14)]
    for dx, rot in [(-24, -12), (0, 0), (24, 12)]:
        out.append(f'<g transform="translate({100+dx},34) rotate({rot})"><path d="M0 0 C16 4 22 44 8 96 C4 104 0 98 -2 90 C-12 52 -10 8 0 0Z" fill="{fill}"/><path d="M-3 -2 L6 -2 L4 6 L-1 6Z" fill="{DGREEN}"/></g>')
    return "".join(out)


def sprig(fill=LGREEN):
    out = ['<path d="M100 148 L100 58" stroke="#3d7a3a" stroke-width="4"/>']
    for i, y in enumerate(range(70, 140, 22)):
        for s in (-1, 1):
            out.append(f'<circle cx="{100+s*22}" cy="{y}" r="15" fill="{fill}"/><circle cx="{100+s*34}" cy="{y+6}" r="10" fill="{GREEN}"/>')
    out.append(f'<circle cx="100" cy="50" r="18" fill="{fill}"/>')
    return "".join(out)


def peppercorn():
    out = ['<path d="M100 20 C96 60 104 90 100 116" stroke="#3d7a3a" stroke-width="3" fill="none"/>', leaf(100, 34, 50, -150, GREEN, 22) + leaf(100, 34, 50, -30, LGREEN, 22)]
    for i in range(12):
        x, y = 100 + (-1) ** i * (6 + (i % 3) * 4), 66 + i * 6
        out.append(f'<circle cx="{x}" cy="{y}" r="7" fill="{"#3c7a36" if i < 7 else "#c23b2e"}"/>')
    return "".join(out)


def cashew():
    out = [leaf(100, 36, 46, -160, GREEN, 18) + leaf(100, 36, 46, -20, LGREEN, 18)]
    out.append('<path d="M100 36 C60 44 54 116 100 130 C146 116 140 44 100 36Z" fill="#f08a2c"/>')
    out.append('<path d="M100 36 C76 50 70 80 82 108" stroke="#f7b56a" stroke-width="5" fill="none" opacity=".6"/>')
    out.append('<path d="M96 132 C108 130 132 138 128 152 C116 152 96 148 96 132Z" fill="#8a7a4a"/>')
    return "".join(out)


def peanut():
    out = [leaf(100, 60, 50, -155, GREEN, 18) + leaf(100, 60, 50, -25, LGREEN, 18)]
    out.append('<path d="M100 60 L100 84" stroke="#3d7a3a" stroke-width="3"/>')
    out.append('<path d="M62 132 C48 112 60 88 82 96 C92 100 96 108 104 108 C118 108 130 92 142 100 C158 112 148 140 130 138 C114 136 110 126 100 126 C88 126 78 148 62 132Z" fill="#d9b382" stroke="#b8905a" stroke-width="2"/>')
    return "".join(out)


def tobacco():
    out = ['<path d="M100 148 L100 40" stroke="#5f7a34" stroke-width="5"/>']
    for k, (y, a) in enumerate([(130, -155), (130, -25), (100, -150), (100, -30), (72, -140), (72, -40)]):
        out.append(leaf(100, y, 62 - k * 3, a, "#6aa84f" if k % 2 == 0 else "#7bb85f", 20))
    return "".join(out)


def generic():
    return (
        '<path d="M100 148 L100 70" stroke="#2a6b30" stroke-width="5" stroke-linecap="round"/>'
        + leaf(100, 100, 60, -150, GREEN, 22) + leaf(100, 84, 60, -30, LGREEN, 22)
        + leaf(100, 70, 34, -95, GREEN, 14)
    )


# ------------------------------------------------- crop -> (background, glyph)
CROPS = {
    "Wheat": ("#f8f0d2", lambda: ear("#e0b445", "#a9962e", awns=True, ears=1)),
    "Barley": ("#f4eed6", lambda: ear("#d8b04a", "#98902f", awns=True, ears=2)),
    "Rice": ("#eaf3d8", lambda: ear("#efd66a", "#7f9a35", droop=True, ears=1)),
    "Bajra": ("#f3ecdc", lambda: ear("#a89468", "#8a8c3a", ears=1)),
    "Jowar": ("#f7e8d4", lambda: ear("#c9663a", "#8a8c3a", droop=False, ears=1)),
    "Ragi": ("#f1e4d6", lambda: ear("#9a5b3a", "#7f8a35", droop=True, ears=1)),
    "Small Millets": ("#f3f0d6", lambda: ear("#d9c25a", "#7f9a35", ears=3)),
    "Maize": ("#fbf1cc", cob),
    "Arhar / Tur (Pigeon Pea)": ("#eef3d6", lambda: pod("#7cae4a", seed="#e3e58a")),
    "Cowpea (Lobia)": ("#eef3dc", lambda: pod("#a3c65f", seed="#f3f0c2")),
    "Gram": ("#f1ecd6", lambda: pod("#b6a558", seed="#e6d18a")),
    "Horse Gram": ("#f0ead8", lambda: pod("#9a8a52", seed="#c9a86a")),
    "Khesari": ("#e9f2dc", lambda: pod("#6fae55", seed="#d5e59a")),
    "Masoor": ("#f6e6d8", lambda: pod("#c98a4e", seed="#e59a5a")),
    "Moong (Green Gram)": ("#e6f2d8", lambda: pod("#4f9a45", seed="#a4d36a")),
    "Urad (Black Gram)": ("#e8efe0", lambda: pod("#3f4f3a", seed="#8a9a7a")),
    "Peas & Beans (Pulses)": ("#e4f3dc", lambda: pod("#5fb04a", seed="#b9e27a", pods=2)),
    "Soybean": ("#eef3d8", lambda: pod("#a9b56a", seed="#efe2a6")),
    "Guar Seed": ("#e6f0dc", lambda: pod("#5f9f4a", seed="#c9e08a")),
    "Sunflower": ("#fdf3c8", lambda: flower("#f6c21b", "#6b4423", 14)),
    "Safflower": ("#fdebd0", lambda: flower("#f2891f", "#c9651a", 14, small=True)),
    "Niger Seed": ("#fbf2c6", lambda: flower("#f4d03a", "#8a5a1e", 8, small=True)),
    "Rapeseed & Mustard": ("#fdf6c4", lambda: flower("#f7dc2e", "#d8b21a", 4, small=True)),
    "Linseed": ("#e8eefb", lambda: flower("#6f8fe0", "#f2d64a", 5, small=True)),
    "Sesamum": ("#f8f3ea", lambda: flower("#f4e9f6", "#d8b6d8", 5, small=True)),
    "Castor Seed": ("#f3e6e6", lambda: flower("#b8484a", "#7a2a2c", 9, small=True)),
    "Groundnut": ("#f7ecd8", peanut),
    "Cotton": ("#e9f3f1", boll),
    "Jute": ("#eaf1d8", lambda: stalks("#86b859", "#f2d64a")),
    "Mesta": ("#f1e8f3", lambda: stalks("#6aa84f", "#e8a3c9")),
    "Sunn Hemp": ("#f6f2c8", lambda: stalks("#78b34f", "#f4d03a")),
    "Sugarcane": ("#f1e6ef", cane),
    "Coconut": ("#e6f2ee", palm),
    "Arecanut": ("#eef2df", lambda: palm("#d8842a")),
    "Banana": ("#fbf3cb", banana),
    "Potato": ("#f5ecdc", lambda: tuber("#c9a26a", "#8a6a3a")),
    "Sweet Potato": ("#f7e5e0", lambda: tuber("#b8555a", "#7a2f36", long=True)),
    "Tapioca": ("#f2ebe0", lambda: tuber("#9a7048", "#6a4a2a", long=True)),
    "Onion": ("#f6e7ee", lambda: bulb("#c8557a", "#8a2f4f")),
    "Garlic": ("#f4f1ea", lambda: bulb("#f1ece0", "#b3a88c", cloves=True)),
    "Ginger": ("#f6ecd6", lambda: rhizome("#d9b26a", "#f2e2b0")),
    "Turmeric": ("#fbeecb", lambda: rhizome("#e0961b", "#f5c542")),
    "Dry Chillies": ("#fbe6e2", chilli),
    "Coriander": ("#e6f3dd", sprig),
    "Black Pepper": ("#e8efe0", peppercorn),
    "Cashew Nut": ("#fdeed8", cashew),
    "Tobacco": ("#ecf0dc", tobacco),
}


def svg(bg, body):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
        f'<rect width="{W}" height="{H}" rx="14" fill="{bg}"/>'
        f'<ellipse cx="100" cy="150" rx="62" ry="7" fill="#00000012"/>{body}</svg>'
    )


def main():
    meta = json.loads(META.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    missing = []
    for crop in meta["crops"]:
        entry = CROPS.get(crop["name"])
        if entry is None:
            missing.append(crop["name"])  # frontend will use fallback.svg for these
            continue
        bg, glyph = entry
        (OUT / f"{crop['slug']}.svg").write_text(svg(bg, glyph()), encoding="utf-8")
    (OUT / "fallback.svg").write_text(svg("#eef5ea", generic()), encoding="utf-8")
    print(f"Wrote {len(meta['crops']) - len(missing)} crop illustrations + fallback.svg to {OUT}")
    if missing:
        print("No illustration defined (will use fallback):", ", ".join(missing))


if __name__ == "__main__":
    main()
