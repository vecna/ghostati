"""
Composition helpers for standalone Ghostmaxxing illustrations.

Every output is a PAINTED SVG — hex baked in, no CSS classes, no var() —
because these are for slides, stickers and wallpapers, where the site's
stylesheet is not present. The styleguide's own rule: class-driven files
render black through <img>; painted files travel.
"""
import re, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

T = dict(bg="#f26a1b", bg_deep="#d95a12", ink="#0a0a08", text="#0a2540", muted="#35526e",
         green_soft="#2f7a5c", green="#0b4a3c", green_deep="#072e26", green_night="#061f1a",
         yellow="#f0c24a", cream="#fff1cf", pink="#ff5f8f", soil="#0a2b23")
VAR = {"--gm-pink": T["pink"], "--gm-green-deep": T["green_deep"], "--gm-green": T["green"],
       "--gm-green-soft": T["green_soft"], "--gm-cream": T["cream"], "--gm-yellow": T["yellow"],
       "--gm-ink": T["ink"], "--gm-soil": T["soil"], "--gm-bg": T["bg"]}

def read(p): return open(os.path.join(R, p), encoding="utf-8").read()

def viewbox(svg):
    m = re.search(r'viewBox="([^"]+)"', svg)
    return [float(v) for v in m.group(1).split()]

def inner(svg):
    """Contents between the outer <svg ...> and </svg>."""
    s = re.sub(r'^.*?<svg\b[^>]*>', '', svg, count=1, flags=re.S)
    s = re.sub(r'</svg>\s*$', '', s, flags=re.S)
    return s.strip()

def bake_vars(s):
    return re.sub(r'var\((--gm-[a-z-]+)\)', lambda m: VAR[m.group(1)], s)

def prefix_ids(s, pre):
    """Namespace every id and every reference to it, so two embedded files
    with the same id (pyre's #fbody, plume-head's #ph-*) cannot collide."""
    ids = set(re.findall(r'\bid="([^"]+)"', s))
    for i in sorted(ids, key=len, reverse=True):
        s = re.sub(r'\bid="%s"' % re.escape(i), f'id="{pre}-{i}"', s)
        s = re.sub(r'url\(#%s\)' % re.escape(i), f'url(#{pre}-{i})', s)
        s = re.sub(r'href="#%s"' % re.escape(i), f'href="#{pre}-{i}"', s)
    return s

def strip_a11y(s):
    return re.sub(r'\s(role|aria-label|aria-hidden|class)="[^"]*"', '', s)

def embed(path, pre, x, y, w, h=None, extra=""):
    """Place a source SVG into the composition at (x, y) with rendered width w.
    Honours a non-zero viewBox origin (plume-head is `0 -110 900 800`)."""
    svg = read(path)
    vx, vy, vw, vh = viewbox(svg)
    s = w / vw
    body = prefix_ids(bake_vars(inner(svg)), pre)
    body = re.sub(r'\s(role|aria-label|aria-hidden)="[^"]*"', '', body)
    tx, ty = x - vx * s, y - vy * s
    return (f'<g transform="translate({tx:.2f},{ty:.2f}) scale({s:.4f})"{extra}>{body}</g>',
            vh * s)

# --- cameras: paint the class-driven icons with the cameras.css rules --------
PAINT = {
    "cam-mount": 'fill="none" stroke="{green}" stroke-linecap="round" stroke-linejoin="round"',
    "cam-shell": 'fill="{cream}" stroke="{green}" stroke-width="5" stroke-linejoin="round"',
    "cam-lens":  'fill="{green_deep}" stroke="{green}" stroke-width="3.4"',
    "cam-panel": 'fill="{green}"',
    "cam-glint": 'fill="{cream}" opacity="0.9"',
    "cam-glare": 'fill="none" stroke="{green}" stroke-width="3" stroke-linecap="round" opacity="0.38"',
}
def paint_camera(name, lens="live", pre="cam", shell=None, glare=None, shell_opacity=None, glare_opacity=None):
    """Return the painted inner markup of images/icons/cam-<name>.svg.
    lens: live | spent. shell / glare override the shell fill / glare stroke."""
    svg = read(f"images/icons/cam-{name}.svg")
    body = inner(svg)
    def sub(m):
        tag, attrs = m.group(1), m.group(2)
        cls = re.search(r'class="([^"]*)"', attrs)
        classes = cls.group(1).split() if cls else []
        attrs = re.sub(r'\s*class="[^"]*"', '', attrs)
        attrs = re.sub(r'\sid="([^"]+)"', lambda mm: f' id="{pre}-{mm.group(1)}"', attrs)
        paint = ""
        for c in classes:
            if c in PAINT and not (c == "cam-mount" and "stroke-width" in attrs and False):
                paint += " " + PAINT[c].format(**T)
        if "cam-shell" in classes and shell:
            paint = paint.replace(f'fill="{T["cream"]}"', f'fill="{shell}"')
        if "cam-shell" in classes and shell_opacity is not None:
            paint += f' fill-opacity="{shell_opacity}"'
        if "cam-glare" in classes and glare_opacity is not None:
            paint = re.sub(r'opacity="[0-9.]+"', f'opacity="{glare_opacity}"', paint)
        if "cam-glare" in classes and glare:
            paint = paint.replace(f'stroke="{T["green"]}"', f'stroke="{glare}"')
        if "cam-iris" in classes:
            if "cam-iris--void" in classes:
                paint += ' fill="none" stroke="none"'
            elif lens == "spent":
                paint += f' fill="{T["green_deep"]}" stroke="{T["pink"]}" stroke-width="2.5"'
            else:
                paint += f' fill="{T["yellow"]}"'
        if "cam-glint" in classes and lens == "spent":
            paint = paint.replace('opacity="0.9"', 'opacity="0"')
        if "cam-glare" in classes and lens == "spent":
            paint = paint.replace('opacity="0.38"', 'opacity="0.15"')
        if "cam-dot" in classes:
            if "cam-dot--dark" in classes: paint += f' fill="{T["green_deep"]}"'
            elif "cam-dot--ring" in classes: paint += f' fill="{T["yellow"]}" stroke="{T["green"]}" stroke-width="1.3"'
            else: paint += f' fill="{T["yellow"]}"'
        return f'<{tag}{attrs}{paint}'
    body = re.sub(r'<(path|rect|circle|g|ellipse)(\s[^>]*?)(?=/?>)', sub, body)
    return body

def camera(name, x, y, size, lens="live", pre="cam", **kw):
    """A painted camera placed with its 100-unit box scaled to `size`."""
    s = size / 100
    return f'<g transform="translate({x:.2f},{y:.2f}) scale({s:.4f})">{paint_camera(name, lens, pre, **kw)}</g>'

# --- the wind gust, from the old genealogy page's <defs> --------------------
def wind_body():
    """The gust, in its original 1200x170 authoring coordinates. Prefers the
    standalone motif file; falls back to the pre-rebuild genealogy.html."""
    p = os.path.join(R, "images/motifs/wind-gust.svg")
    if os.path.exists(p):
        return inner(open(p, encoding="utf-8").read())
    s = open("/tmp/genealogy.html.orig", encoding="utf-8").read()
    m = re.search(r'<g id="gm-wind">(.*?)</g></g></defs>', s, re.S)
    return bake_vars(m.group(1) + "</g>")

def wind(x, y, w, pre="wind", flip=False):
    """The gust is drawn for a 1200 x 170 box (the era__wind viewBox)."""
    s = w / 1200
    body = wind_body()
    body = body.replace('style="fill:none;stroke:', 'style="fill:none;stroke:')  # keep inline styles: they are hex now
    t = f'translate({x:.2f},{y:.2f}) scale({s:.4f})' + (' scale(-1,1) translate(-1200,0)' if flip else '')
    return f'<g transform="{t}">{body}</g>'

def svg(w, h, body, bg=T["bg"], title=""):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    t = f"<title>{title}</title>" if title else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
            f'{t}{rect}{body}</svg>')
