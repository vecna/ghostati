import re, os
from illustrations_lib import *

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "illustrations")
def save(name, doc):
    p = os.path.join(OUT, name); open(p, "w", encoding="utf-8").write(doc)
    print(f"{name:34} {os.path.getsize(p):>8,} B")

# --------------------------------------------------------------------------
# 01  Born of the pyre — the documents burn, the smoke rises, the villain
#     condenses out of it. Portrait: poster, slide cover, phone wallpaper.
# --------------------------------------------------------------------------
def born_of_the_pyre():
    W, H = 900, 1600
    b = []
    # column of smoke, drawn first so everything else sits in front of it
    for i, y in enumerate((560, 735, 910)):
        g, _ = embed("images/motifs/smoke-tile.svg", f"t{i}", 450 - 68, y, 136)
        b.append(g)
    g, _ = embed("images/motifs/smoke-base.svg", "base", 120, 905, 660); b.append(g)  # bottom buried in the flames
    g, _ = embed("images/motifs/pyre.svg", "pyre", -150, H - 594, 1080); b.append(g)
    g, _ = embed("images/motifs/plume-head.svg", "head", 126, 40, 648); b.append(g)
    return svg(W, H, "".join(b), title="Born of the pyre")

# --------------------------------------------------------------------------
# 02  The villain wears the glasses. Square: sticker, avatar, slide corner.
#     The lenses are tinted, not cream, so the eyes glow through; two yellow
#     LEDs at the hinges — yellow is the identity's "still reading" colour —
#     and a REC in mono.
# --------------------------------------------------------------------------
def head_at(x, y, s=1.0, pre="head", eyes="live"):
    g, _ = embed("images/motifs/plume-head.svg", pre, x, y, 900 * s)
    if eyes == "spent":
        # pupil goes dark, the lens takes the pink residue ring, the spark goes out
        g = g.replace('<circle fill="#ff5f8f" cx="220" cy="276" r="15"></circle>',
                      '<circle fill="#072e26" cx="220" cy="276" r="15"></circle>')
        g = g.replace('<circle fill="#072e26" cx="220" cy="276" r="34"></circle>',
                      '<circle fill="#072e26" stroke="#ff5f8f" stroke-width="7" cx="220" cy="276" r="34"></circle>')
        g = g.replace('<circle fill="#fff1cf" cx="211" cy="267" r="6.4"></circle>', '')
    return g

def villain_glasses(transparent=False):
    W = H = 1080
    b = [head_at(90, 140)]
    # eye centres in canvas space: (310,526) and (770,526); glasses eyes are 44 apart
    s = 460 / 44
    gx, gy = 540 - 50 * s, 526 - 45 * s
    body = paint_camera("glasses", "live", "gl", shell=T["green_deep"], shell_opacity=0.58,
                        glare=T["cream"], glare_opacity=0.75)
    leds = ""
    for cx, anchor, tx in ((88, "start", 91.5), (12, "end", 8.5)):
        leds += (f'<circle cx="{cx}" cy="34" r="2.6" fill="{T["yellow"]}" stroke="{T["ink"]}" stroke-width="0.6"/>'
                 f'<circle cx="{cx}" cy="34" r="1" fill="{T["cream"]}"/>')
    leds += (f'<text x="91.5" y="28.5" font-family="JetBrains Mono, ui-monospace, Menlo, monospace" '
             f'font-size="4.2" font-weight="700" letter-spacing="0.4" fill="{T["ink"]}">REC</text>')
    b.append(f'<g transform="translate({gx:.2f},{gy:.2f}) scale({s:.4f})">{body}{leds}</g>')
    return svg(W, H, "".join(b), bg=None if transparent else T["bg"], title="The villain wears the glasses")

# --------------------------------------------------------------------------
# 03  Wasteland. A field of documents and faces on fire, and nothing standing
#     in it but pole readers. 16:9 slide background; the sky is empty on
#     purpose so a title can sit in it.
# --------------------------------------------------------------------------
def wasteland():
    W, H = 1920, 1080
    b = []
    for x in (0, 1080):
        g, _ = embed("images/motifs/pyre.svg", f"pyre{x}", x, H - 594, 1080); b.append(g)
    # (x, size, ground-line y) — small and high is far, big and low is near
    poles = [(60, 120, 775), (300, 150, 790), (520, 130, 785), (760, 140, 800), (1000, 125, 780),
             (1180, 135, 790), (1350, 160, 795), (1700, 150, 805), (1850, 130, 785),
             (120, 260, 900), (980, 250, 910), (1560, 270, 905),
             (560, 420, 1060), (1300, 400, 1075)]
    for i, (x, size, ground) in enumerate(poles):
        b.append(camera("street", x, ground - 0.92 * size, size, "live", f"p{i}"))
    return svg(W, H, "".join(b), title="Wasteland")

# --------------------------------------------------------------------------
# 04  Spent. One dome, one gust, the lens out. Round sticker, cream edge.
# --------------------------------------------------------------------------
def spent_sticker():
    W = H = 800
    b = [f'<circle cx="400" cy="400" r="384" fill="{T["cream"]}" stroke="{T["ink"]}" stroke-width="10"/>',
         f'<clipPath id="disc"><circle cx="400" cy="400" r="340"/></clipPath>',
         f'<circle cx="400" cy="400" r="340" fill="{T["bg"]}"/>',
         '<g clip-path="url(#disc)">',
         camera("dome", 170, 198, 460, "spent", "d"),
         embed("images/motifs/whirlwind-a.svg", "ww", 300, 140, 380)[0],
         '</g>']
    return svg(W, H, "".join(b), bg=None, title="Spent")

# --------------------------------------------------------------------------
# 05  Dazzled. The gust crosses the villain's own eyes and they go out.
# --------------------------------------------------------------------------
def dazzled(transparent=False):
    W = H = 1080
    # the gust's ink occupies x 466..1185 of its 1200 box, source at (466,80);
    # scale 1.5 and put the source just off the left edge at eye height
    s = 1.25
    b = [head_at(90, 140, eyes="spent"),
         wind(-40 - 466 * s, 462 - 80 * s, 1200 * s)]
    return svg(W, H, "".join(b), bg=None if transparent else T["bg"], title="Dazzled")

# --------------------------------------------------------------------------
# 06  Fleet — a seamless tile of the six cameras at low opacity, for slide
#     backgrounds. Items that cross an edge are drawn again one tile over.
# --------------------------------------------------------------------------
def fleet_tile():
    S, size = 480, 104
    items = [("dome", 40, 28), ("bullet", 280, 28), ("cube", 160, 268), ("pill", 400, 268),
             ("street", 20, 388 - 240), ("glasses", 300, 150)]
    # keep the two extras off the main grid so the brick pattern stays legible
    items = [("dome", 40, 28), ("bullet", 280, 30), ("cube", 160, 268), ("pill", 400, 264)]
    b = [f'<g opacity="0.17">']
    for i, (name, x, y) in enumerate(items):
        for dx in (0, -S, S):
            for dy in (0, -S, S):
                xx, yy = x + dx, y + dy
                if xx + size < 0 or yy + size < 0 or xx > S or yy > S: continue
                b.append(camera(name, xx, yy, size, "live", f"f{i}{dx}{dy}".replace("-", "n")))
    b.append("</g>")
    return svg(S, S, "".join(b), title="Fleet tile")

def pyre_banner():
    W, H = 1920, 1080
    b = []
    cx = 1480                                    # the column's axis
    for i, y in enumerate((470, 640)):
        g, _ = embed("images/motifs/smoke-tile.svg", f"t{i}", cx - 64, y, 128); b.append(g)
    g, _ = embed("images/motifs/smoke-base.svg", "base", cx - 300, 720, 600); b.append(g)
    for x in (0, 1080):
        g, _ = embed("images/motifs/pyre.svg", f"pyre{x}", x, H - 480, 1080); b.append(g)   # scale 0.9 -> 594 tall, cropped by the canvas
    g, _ = embed("images/motifs/plume-head.svg", "head", cx - 300, 10, 600); b.append(g)
    return svg(W, H, "".join(b), title="Rising")

save("01-born-of-the-pyre.svg", born_of_the_pyre())
save("07-rising-banner.svg", pyre_banner())
save("02-villain-glasses.svg", villain_glasses())
save("02-villain-glasses-transparent.svg", villain_glasses(True))
save("03-wasteland.svg", wasteland())
save("04-spent-sticker.svg", spent_sticker())
save("05-dazzled.svg", dazzled())
save("05-dazzled-transparent.svg", dazzled(True))
save("06-fleet-tile.svg", fleet_tile())
