#!/usr/bin/env python3
"""
build-genealogy.py — generate genealogy.html and styles/genealogy.css.

WHY THIS IS GENERATED
The page used to be a hand-placed collage: a canopy SVG, four copies of a
wind gust, four whirlwind <img>s, eight camera SVGs and four tiled smoke
backgrounds (~1,700 <circle>s), roughly 290 KB, held together by absolute
positioning. It broke at 390 px, and the largest, highest-contrast element on
it — the wind — was byte-identical on every era, so the most prominent thing
on the page encoded nothing.

It is now one diagram drawn from references/REFERENCES.json. Every mark is a
graded archive entry placed at its year, in the row of the system family it
was demonstrated against. Nothing is hand-placed, so the page cannot drift
away from the archive: re-run this script after editing REFERENCES.json.

    python3 scripts-dev/build-genealogy.py

Writes genealogy.html and styles/genealogy.css from the repo root.

TWO SVGs, NOT ONE, AND WHY
SVG geometry cannot reflow: a 25-year horizontal axis that works at 1440 px
is 300 px wide on a phone, where 20 marks collide. So there are two
<svg> blocks — a landscape chart and a stacked portrait one — and a media
query shows exactly one. They are generated from the same data by the same
functions, so they cannot disagree.

The cameras are inlined into BOTH, rather than defined once as a <symbol>
and referenced with <use>. That is deliberate, and it is the same lesson the
old wind block learned the hard way: CSS selectors do not cross into a <use>
shadow tree, so `[data-lens="spent"] .cam-iris` in cameras.css would never
reach an iris inside a symbol, and every lens would render live. Inlined,
cameras.css applies unchanged and data-lens works. The duplication costs
about 3 KB against the 290 KB this page no longer ships.
"""

import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# 1. The rows: families of face-reading system, oldest first.
#
# `span` is the years that family was the state of the art. Those ranges are
# the ones this page has always published; they are editorial, not derived,
# and they are drawn as the heavy segment of each row line.
#
# `targets` maps the `target` values in REFERENCES.json onto a row. Note that
# "public-space-surveillance" is a deployment context rather than a reading
# technology, so an entry carrying it resolves through its co-listed
# technology target instead — see row_for().
# ---------------------------------------------------------------------------
ROWS = [
    dict(
        key="detection", cam="bullet", short="Detection",
        span=(2001, 2009),
        title="Face detection",
        sub="Haar cascades · Viola-Jones",
        body="Rectangles of light and dark slid across the frame. Cheap, fast, "
             "everywhere, and it only ever looked for contrast.",
        targets={"face-detection"},
    ),
    dict(
        key="landmark", cam="dome", short="Landmarks",
        span=(2010, 2013),
        title="Landmark geometry",
        sub="Eigenfaces · Fisherfaces · 68-point meshes",
        body="The face as a set of distances between named points. The dome "
             "never shows you which way it looks.",
        targets=set(),
    ),
    dict(
        key="embeddings", cam="cube", short="Embeddings",
        span=(2014, 2016),
        title="Learned embeddings",
        sub="DeepFace · FaceNet · ArcFace",
        body="Systems stop measuring features and start learning them: every "
             "face becomes a vector in a space nobody designed by hand.",
        targets={"face-recognition", "face-verification", "public-space-surveillance"},
    ),
    dict(
        key="depth", cam="pill", short="Depth / NIR",
        span=(2017, 2020),
        title="Depth & near-infrared",
        sub="Dot projectors · NIR sensors · liveness",
        body="The face as 3D geometry, read in the dark, with a liveness check "
             "a photograph cannot pass.",
        targets={"nir-face-recognition", "3d-face-recognition", "depth-face-recognition"},
    ),
    dict(
        key="network", cam="pole", short="Networked",
        span=(2020, None), present=True,
        title="Networked readers",
        sub="Pole cameras · shared watchlists",
        body="Fixed cameras stop being cameras and become one queryable index. "
             "The reading is unchanged; the reach is not.",
        targets=set(),
    ),
    dict(
        key="wearable", cam="glasses", short="Wearable",
        span=(2020, None), present=True,
        title="Wearable readers",
        sub="Smart glasses · body-worn",
        body="The lens moves to eye level and stops looking like a lens. A "
             "different technology from the pole, and a different problem: you "
             "cannot learn to avoid a camera you cannot identify.",
        targets=set(),
    ),
    dict(
        key="other", cam=None, short="Not faces",
        span=None, muted=True,
        title="Not faces",
        sub="Object detection · classification · sensors",
        body="Adjacent results the lab borrows technique from. Drawn because "
             "they inform the work, set apart because they are not evidence "
             "about face reading.",
        targets={"object-detection", "image-classification", "traffic-sign-recognition",
                 "certified-defense", "deep-representation", "machine-learning-models",
                 "security-camera", "sensor-disturbance"},
    ),
]

# Evidence grade, from REFERENCES.json `reproducibility`. Three tiers, because
# three is what the mark can carry legibly at 18 px.
GRADE = {
    "code-available": "strong", "artifact-available": "strong",
    "build-files-available": "strong",
    "paper-available": "paper", "documented-project": "paper",
    "survey": "context", "artwork-documentation": "context",
}

Y0, Y1 = 2001, 2026          # the year axis
ROW_ORDER = [r["key"] for r in ROWS]


def row_for(ref):
    """Which row a reference belongs to.

    Most specific technology first: an NIR paper also lists face-verification,
    and would otherwise land in the embeddings row. "other" is the fallback,
    which is also where anything not aimed at face reading ends up — the
    Camera-Shy Hoodie, for instance, targets a camera sensor rather than a
    face matcher, and its own `limitations` field says so.
    """
    targets = set(ref.get("target", []))
    for key in ("depth", "detection", "embeddings", "other"):
        row = next(r for r in ROWS if r["key"] == key)
        if row["targets"] & targets:
            return key
    return "other"


def credit(author):
    """`author` in REFERENCES.json is always a list. One name is used as-is,
    two are joined, more become "first et al." — a tooltip is not a citation,
    and the archive entry the mark links to carries the full list."""
    if not author:
        return ""
    if isinstance(author, str):
        return author
    if len(author) == 1:
        return author[0]
    if len(author) == 2:
        return " & ".join(author)
    return f"{author[0]} et al."


def load_marks():
    with open(os.path.join(ROOT, "references", "REFERENCES.json"), encoding="utf-8") as fh:
        data = json.load(fh)
    refs = data["references"]
    marks = []
    for ref in refs:
        grade = GRADE.get(ref.get("reproducibility"), "context")
        marks.append(dict(
            year=int(ref["year"]), row=row_for(ref), grade=grade,
            slug=ref["slug"], title=ref["title"],
            author=credit(ref.get("author")),
        ))
    marks.sort(key=lambda m: (m["year"], m["title"]))
    return refs, marks


# ---------------------------------------------------------------------------
# 2. Cameras. Pulled from the markup that already shipped on this page, so the
#    fleet stays byte-comparable with the footer and the homepage. Authored in
#    a 0 0 100 100 box (the glasses in 0 0 100 74) per the cameras.css
#    contract, and placed with a translate+scale so one definition serves any
#    size.
# ---------------------------------------------------------------------------
CAMS = {
    "bullet": (100, 100, """
<path class="cam-mount" d="M45,30 V12 M32,12 H58" stroke-width="5"/>
<rect class="cam-shell" x="16" y="36" width="66" height="34" rx="5"/>
<path class="cam-mount" d="M12,30 H74 L84,40" stroke-width="5"/>
<circle class="cam-lens" cx="60" cy="51" r="14"/>
<circle class="cam-iris" id="{iid}" cx="60" cy="51" r="6.2"/>
<circle class="cam-glint" cx="55.8" cy="46.8" r="2.4"/>"""),
    "dome": (100, 100, """
<path class="cam-mount" d="M6,29 H94" stroke-width="7"/>
<path class="cam-shell" d="M20,29 A30,30 0 0 0 80,29 Z"/>
<circle class="cam-lens" cx="50" cy="44" r="15"/>
<circle class="cam-iris" id="{iid}" cx="50" cy="44" r="6.6"/>
<circle class="cam-glint" cx="45.5" cy="39.5" r="2.55"/>"""),
    "cube": (100, 100, """
<path class="cam-mount" d="M50,16 V6 M38,6 H62" stroke-width="5"/>
<rect class="cam-shell" x="16" y="16" width="68" height="68" rx="19"/>
<circle class="cam-dot cam-dot--ring" cx="73" cy="26" r="3.4"/>
<circle class="cam-lens" cx="50" cy="50" r="17"/>
<circle class="cam-iris" id="{iid}" cx="50" cy="50" r="7.5"/>
<circle class="cam-glint" cx="44.9" cy="44.9" r="2.9"/>"""),
    "pill": (100, 100, """
<path class="cam-mount" d="M40,36 V22 M28,22 H52" stroke-width="5"/>
<rect class="cam-shell" x="6" y="36" width="88" height="28" rx="14"/>
<g class="cam-dot cam-dot--dark"><circle cx="62" cy="44" r="2"/><circle cx="70" cy="50" r="2"/><circle cx="62" cy="56" r="2"/><circle cx="78" cy="45" r="2"/><circle cx="80" cy="55" r="2"/><circle cx="86" cy="50" r="2"/></g>
<circle class="cam-lens" cx="30" cy="50" r="12"/>
<circle class="cam-iris" id="{iid}" cx="30" cy="50" r="5.3"/>
<circle class="cam-glint" cx="26.4" cy="46.4" r="2"/>"""),
    "pole": (100, 100, """
<path class="cam-mount" d="M80,26 V92" stroke-width="6"/>
<path class="cam-mount" d="M80,30 H44" stroke-width="6"/>
<path class="cam-mount" d="M52,30 V40" stroke-width="5"/>
<rect class="cam-shell" x="10" y="40" width="72" height="30" rx="7"/>
<rect class="cam-panel" x="54" y="47" width="22" height="16" rx="3"/>
<g class="cam-dot"><circle cx="60" cy="51" r="2"/><circle cx="70" cy="51" r="2"/><circle cx="60" cy="59" r="2"/><circle cx="70" cy="59" r="2"/></g>
<circle class="cam-lens" cx="32" cy="55" r="12"/>
<circle class="cam-iris" id="{iid}" cx="32" cy="55" r="5.3"/>
<circle class="cam-glint" cx="28.4" cy="51.2" r="2"/>"""),
    # The glasses take the void iris. cameras.css is explicit about why: the
    # lens body is already cream, so a filled iris turns the pair into welding
    # goggles and eats the figure-of-eight silhouette. The glare bars carry
    # the state instead.
    "glasses": (100, 74, """
<path class="cam-mount" d="M8,44 L2,32 M92,44 L98,32" stroke-width="5"/>
<path class="cam-shell" d="M50,45 C65,25 90,25 90,45 C90,65 65,65 50,45 C35,25 10,25 10,45 C10,65 35,65 50,45 Z" stroke-linecap="round"/>
<path class="cam-glare" d="M22,52 L34,38 M29,53 L37,44"/>
<path class="cam-glare" d="M66,52 L78,38 M73,53 L81,44"/>
<circle class="cam-iris cam-iris--void" id="{iid}-l" cx="28" cy="45" r="9"/>
<circle class="cam-iris cam-iris--void" id="{iid}-r" cx="72" cy="45" r="9"/>"""),
}


def camera(kind, x, y, size, lens, iid, nodata=False):
    """One inlined camera as a positioned group.

    `lens` is the cameras.css state. "spent" wherever the archive holds a
    graded result against that family. "live" otherwise — but live means two
    different things, and the difference matters: on a present-day row it is
    a claim (still reading, nothing shown against it), and on an older row it
    only means the archive is thin. The second case gets cam-fig--nodata,
    which fades it, so a lit lens is never read as a finding it is not.
    """
    vw, vh, body = CAMS[kind]
    scale = size / vw
    cls = "cam-fig" + (" cam-fig--nodata" if nodata else "")
    return (f'<g class="{cls}" data-lens="{lens}" '
            f'transform="translate({x:.1f},{y:.1f}) scale({scale:.4f})">'
            f'{body.format(iid=iid).strip()}</g>')


# ---------------------------------------------------------------------------
# 3. The marks. One lens per archive entry: a dark barrel with a pink residue
#    ring, the same vocabulary as a spent camera lens, at chart scale.
# ---------------------------------------------------------------------------
def mark(cx, cy, m, r, muted):
    cls = f"gen-mark gen-mark--{m['grade']}" + (" gen-mark--muted" if muted else "")
    label = f"{m['title']} — {m['year']}"
    if m["author"]:
        label = f"{m['title']} — {m['author']}, {m['year']}"
    return (
        f'<a class="gen-marklink" href="/references/#{m["slug"]}" '
        f'aria-label="{html.escape(label, quote=True)}">'
        f'<title>{html.escape(label)}</title>'
        f'<g class="{cls}" transform="translate({cx:.1f},{cy:.1f})">'
        f'<circle class="gen-mark__hit" r="{r + 7:.1f}"/>'
        f'<circle class="gen-mark__lens" r="{r:.1f}"/>'
        f'<circle class="gen-mark__iris" r="{r * 0.44:.1f}"/>'
        f'</g></a>'
    )


def stacked(marks_in_row):
    """Same-year entries would sit on top of each other, so they step away
    from the line. Returns (mark, level) pairs."""
    out, seen = [], {}
    for m in marks_in_row:
        n = seen.get(m["year"], 0)
        seen[m["year"]] = n + 1
        out.append((m, n))
    return out


# ---------------------------------------------------------------------------
# 4. Landscape chart — rows of system families against a year axis.
# ---------------------------------------------------------------------------
def chart_landscape(by_row):
    W, H_TOP, H_BOT, ROW_H = 1240, 66, 34, 82
    LEFT, RIGHT = 392, 34
    H = H_TOP + ROW_H * len(ROWS) + H_BOT
    plot = W - LEFT - RIGHT

    def x(year):
        return LEFT + (year - Y0) / (Y1 - Y0) * plot

    o = [f'<svg class="gen-chart gen-chart--wide" viewBox="0 0 {W} {H}" '
         f'role="img" aria-labelledby="genChartTitle genChartDesc">',
         '<title id="genChartTitle">Documented counter-moves, by year and by '
         'the family of face-reading system they were demonstrated against</title>',
         '<desc id="genChartDesc">Seven rows, oldest system first. The heavy '
         'segment of each row is the years that family was the state of the '
         'art. Each mark is one graded entry in the reference archive, placed '
         'at the year it was first demonstrated. The two present-day rows, '
         'networked readers and wearable readers, carry no marks.</desc>']

    # year ruler
    for year in range(Y0, Y1 + 1):
        major = year % 5 == 0 or year == Y0
        o.append(f'<line class="gen-tick{" gen-tick--major" if major else ""}" '
                 f'x1="{x(year):.1f}" y1="{H_TOP - 22}" x2="{x(year):.1f}" y2="{H - H_BOT}"/>')
        if major:
            o.append(f'<text class="gen-year" x="{x(year):.1f}" y="{H_TOP - 32}" '
                     f'text-anchor="middle">{year}</text>')

    for i, row in enumerate(ROWS):
        yc = H_TOP + ROW_H * i + ROW_H / 2
        muted = row.get("muted", False)
        marks = by_row[row["key"]]
        lens = "spent" if marks and not muted else "live"
        nodata = not marks and not muted and not row.get("present")

        # the row line, faint across the axis
        o.append(f'<line class="gen-line{" gen-line--muted" if muted else ""}" '
                 f'x1="{LEFT:.1f}" y1="{yc:.1f}" x2="{W - RIGHT}" y2="{yc:.1f}"/>')
        # the era span, heavy
        if row["span"]:
            s, e = row["span"]
            o.append(f'<line class="gen-span{" gen-span--open" if e is None else ""}" '
                     f'x1="{x(s):.1f}" y1="{yc:.1f}" x2="{x(e if e else Y1):.1f}" y2="{yc:.1f}"/>')

        # header: camera, then title and subtitle
        if row["cam"]:
            cw = 74 if row["cam"] != "glasses" else 78
            o.append(camera(row["cam"], 24, yc - cw / 2 * (0.74 if row["cam"] == "glasses" else 1),
                            cw, lens, f'gen-iris-{row["key"]}', nodata))
        tx = 118
        # 23px serif has ~17px of cap height above its baseline, so the mono
        # span label needs to sit 32 up, not 25, or the two boxes touch.
        o.append(f'<text class="gen-rowtitle{" gen-rowtitle--muted" if muted else ""}" '
                 f'x="{tx}" y="{yc - 6:.1f}">{html.escape(row["title"])}</text>')
        o.append(f'<text class="gen-rowsub" x="{tx}" y="{yc + 16:.1f}">'
                 f'{html.escape(row["sub"])}</text>')
        if row["span"]:
            s, e = row["span"]
            o.append(f'<text class="gen-rowspan" x="{tx}" y="{yc - 32:.1f}">'
                     f'{s}&#8211;{e if e else "now"}</text>')

        # marks, or the note that says there are none
        if marks:
            for m, level in stacked(marks):
                o.append(mark(x(m["year"]), yc - level * 23, m, 9, muted))
        elif not muted:
            note = ("No documented counter-move." if row.get("present")
                    else "Nothing graded in the archive yet.")
            anchor = x(row["span"][0]) + 16
            o.append(f'<text class="gen-empty" x="{anchor:.1f}" y="{yc - 12:.1f}">'
                     f'{html.escape(note)}</text>')

    o.append('</svg>')
    return "\n".join(o)


# ---------------------------------------------------------------------------
# 5. Portrait chart — the same rows, stacked, sharing one ruler. Not a rotation
#    of the landscape one: at 390 px a 25-year axis is 300 px wide and twenty
#    marks collide, so each row gets its own full-width strip.
# ---------------------------------------------------------------------------
def chart_portrait(by_row):
    W, TOP, BOT, STRIP = 380, 50, 18, 104
    L, R = 14, 14
    H = TOP + STRIP * len(ROWS) + BOT
    plot = W - L - R

    def x(year):
        return L + (year - Y0) / (Y1 - Y0) * plot

    o = [f'<svg class="gen-chart gen-chart--narrow" viewBox="0 0 {W} {H}" '
         f'role="img" aria-labelledby="genChartTitleN genChartDescN">',
         '<title id="genChartTitleN">Documented counter-moves, by year and by '
         'the family of face-reading system they were demonstrated against</title>',
         '<desc id="genChartDescN">Seven strips, oldest system first. The '
         'heavy segment of each strip is the years that family was the state '
         'of the art. Each mark is one graded entry in the reference archive. '
         'The two present-day strips, networked readers and wearable readers, '
         'carry no marks.</desc>']

    for year in range(Y0, Y1 + 1):
        if year % 5 and year != Y0:
            continue
        o.append(f'<line class="gen-tick gen-tick--major" x1="{x(year):.1f}" '
                 f'y1="{TOP - 16}" x2="{x(year):.1f}" y2="{H - BOT}"/>')
        anchor = "start" if year == Y0 else ("end" if year == 2025 else "middle")
        # 2001 and 2005 are four years apart, which is 47 px of axis on a
        # 320 px screen — narrower than the two labels. 2005 is the one that
        # gets dropped there; its gridline stays.
        cls = "gen-year gen-year--crowded" if year == 2005 else "gen-year"
        o.append(f'<text class="{cls}" x="{x(year):.1f}" y="{TOP - 24}" '
                 f'text-anchor="{anchor}">{year}</text>')

    for i, row in enumerate(ROWS):
        y0 = TOP + STRIP * i
        yc = y0 + 74
        muted = row.get("muted", False)
        marks = by_row[row["key"]]
        lens = "spent" if marks and not muted else "live"
        nodata = not marks and not muted and not row.get("present")

        if row["cam"]:
            o.append(camera(row["cam"], L, y0 + 4, 42, lens,
                            f'gen-iris-n-{row["key"]}', nodata))
        tx = L + (52 if row["cam"] else 0)
        o.append(f'<text class="gen-rowtitle gen-rowtitle--narrow'
                 f'{" gen-rowtitle--muted" if muted else ""}" x="{tx}" '
                 f'y="{y0 + 22}">{html.escape(row["title"])}</text>')
        if row["span"]:
            s, e = row["span"]
            o.append(f'<text class="gen-rowspan" x="{tx}" y="{y0 + 40}">'
                     f'{s}&#8211;{e if e else "now"}</text>')

        o.append(f'<line class="gen-line{" gen-line--muted" if muted else ""}" '
                 f'x1="{L}" y1="{yc:.1f}" x2="{W - R}" y2="{yc:.1f}"/>')
        if row["span"]:
            s, e = row["span"]
            o.append(f'<line class="gen-span{" gen-span--open" if e is None else ""}" '
                     f'x1="{x(s):.1f}" y1="{yc:.1f}" x2="{x(e if e else Y1):.1f}" y2="{yc:.1f}"/>')

        if marks:
            for m, level in stacked(marks):
                o.append(mark(x(m["year"]), yc - level * 19, m, 7.5, muted))
        elif not muted:
            # On the span-label line, not the title line: right-anchored at the
            # title's baseline it collides with a two-word row name.
            # Shorter than the wide chart's wording on purpose: the full
            # sentence at a size that stays readable on a 320 px screen would
            # run into the row title. The cards below carry it in full.
            note = ("None documented." if row.get("present")
                    else "None graded yet.")
            o.append(f'<text class="gen-empty gen-empty--narrow" x="{W - R}" '
                     f'y="{y0 + 40}" text-anchor="end">{html.escape(note)}</text>')

    o.append('</svg>')
    return "\n".join(o)


# ---------------------------------------------------------------------------
# 6. Page chrome. Lifted verbatim from the shipping header and the footer that
#    every other page carries — genealogy.html was the one page with no footer.
# ---------------------------------------------------------------------------
HEADER = """    <header class="gm-site-header">
      <a class="gm-site-wordmark" href="/" aria-label="Ghostmaxxing homepage">
        <img class="gm-site-wordmark__mark" src="/images/logo/mark-color.svg"
          width="40" height="40" alt aria-hidden="true" />
        <span class="gm-site-wordmark__text">
          <span class="gm-site-wordmark__title">Ghostmaxxing</span>
          <span class="gm-site-wordmark__sub">A public lab for testing
            camouflage</span>
        </span>
      </a>
      <nav class="gm-site-nav" aria-label="Primary">
        <a class="gm-site-chip" href="/fediverse.html">in the Fediverse</a>
        <div class="gm-site-nav__group">
          <button class="gm-site-nav__trigger" aria-expanded="false"
            aria-controls="gmSiteMenu">Know more <span
              aria-hidden="true">&#9662;</span></button>
          <div class="gm-site-menu" id="gmSiteMenu">
            <div>
              <p class="gm-site-menu__kicker">Informative</p>
              <ul>
                <li><a href="/about.html">Vision &amp; about</a></li>
                <li><a href="/genealogy.html" aria-current="page">The genealogy of the read</a></li>
                <li><a href="/report.html">Report a deployment</a></li>
                <li><a href="/workshops.html">Workshops</a></li>
              </ul>
            </div>
            <div>
              <p class="gm-site-menu__kicker">Technology</p>
              <ul>
                <li><a href="/lab.html">Open the lab &#8599;</a></li>
                <li><a href="/references/">References archive</a></li>
                <li><a href="/docs/">Docs</a></li>
                <li><a href="https://github.com/vecna/ghostmaxxing">Code</a></li>
              </ul>
            </div>
          </div>
        </div>
        <a class="gm-site-cta" href="/report.html">Leak to us &#8599;</a>
      </nav>
    </header>"""

FOOTER = """  <footer class="gm-site-footer">
    <div class="gm-site-footer__pyre" data-mode="full">
      <img src="/images/motifs/pyre.svg" alt aria-hidden="true" />
    </div>
    <img class="gm-site-footer__edge" src="/images/motifs/soil-edge.svg" alt
      aria-hidden="true" />
    <div class="gm-site-footer__row">
      <div class="gm-site-footer__cams">
        <svg class="cam" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <path class="cam-mount" d="M6,29 H94" stroke-width="7"></path>
          <path class="cam-shell" d="M20,29 A30,30 0 0 0 80,29 Z"></path>
          <circle class="cam-lens" cx="50" cy="44" r="15"></circle>
          <circle class="cam-iris" id="iris-foot-dome" cx="50" cy="44" r="6.6"></circle>
          <circle class="cam-glint" cx="45.5" cy="39.5" r="2.55"></circle>
        </svg>
        <svg class="cam" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <path class="cam-mount" d="M80,26 V92" stroke-width="6"></path>
          <path class="cam-mount" d="M80,30 H44" stroke-width="6"></path>
          <path class="cam-mount" d="M52,30 V40" stroke-width="5"></path>
          <rect class="cam-shell" x="10" y="40" width="72" height="30" rx="7"></rect>
          <rect class="cam-panel" x="54" y="47" width="22" height="16" rx="3"></rect>
          <g class="cam-dot"><circle cx="60" cy="51" r="2"></circle><circle cx="70" cy="51" r="2"></circle><circle cx="60" cy="59" r="2"></circle><circle cx="70" cy="59" r="2"></circle></g>
          <circle class="cam-lens" cx="32" cy="55" r="12"></circle>
          <circle class="cam-iris" id="iris-foot-street" cx="32" cy="55" r="5.3"></circle>
          <circle class="cam-glint" cx="28.4" cy="51.2" r="2"></circle>
        </svg>
        <svg class="cam" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <path class="cam-mount" d="M8,44 L2,32 M92,44 L98,32" stroke-width="5"></path>
          <path class="cam-shell" d="M50,45 C65,25 90,25 90,45 C90,65 65,65 50,45 C35,25 10,25 10,45 C10,65 35,65 50,45 Z" stroke-linecap="round"></path>
          <path class="cam-glare" d="M22,52 L34,38 M29,53 L37,44"></path>
          <path class="cam-glare" d="M66,52 L78,38 M73,53 L81,44"></path>
          <circle class="cam-iris cam-iris--void" id="iris-foot-glasses-l" cx="28" cy="45" r="9"></circle>
          <circle class="cam-iris cam-iris--void" id="iris-foot-glasses-r" cx="72" cy="45" r="9"></circle>
        </svg>
        <svg class="cam" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <path class="cam-mount" d="M45,30 V12 M32,12 H58" stroke-width="5"></path>
          <rect class="cam-shell" x="16" y="36" width="66" height="34" rx="5"></rect>
          <path class="cam-mount" d="M12,30 H74 L84,40" stroke-width="5"></path>
          <circle class="cam-lens" cx="60" cy="51" r="14"></circle>
          <circle class="cam-iris" id="iris-foot-bullet" cx="60" cy="51" r="6.2"></circle>
          <circle class="cam-glint" cx="55.8" cy="46.8" r="2.4"></circle>
        </svg>
      </div>
      <div class="gm-site-footer__links">
        <a href="/docs/">Technical documentation</a>
        <a href="https://github.com/vecna/ghostmaxxing">Code</a>
        <a href="/loader.html">Video Loader</a>
      </div>
    </div>
  </footer>"""


def key_lens():
    """A live dome lens at legend size. The row-header cameras use the same
    lens vocabulary as the marks on purpose — a spent lens and a mark mean the
    same thing — so the legend names the lit one, which is the state a reader
    has to be told how to read."""
    vw, vh, body = CAMS["dome"]
    return ('<svg class="gen-key__mark gen-key__mark--cam" viewBox="0 0 100 100" '
            'aria-hidden="true" focusable="false">'
            '<g class="cam-fig" data-lens="live">'
            + body.format(iid="gen-iris-key").strip() + '</g></svg>')


def key_mark(grade):
    return (f'<svg class="gen-key__mark" viewBox="-13 -13 26 26" aria-hidden="true" '
            f'focusable="false"><g class="gen-mark gen-mark--{grade}">'
            f'<circle class="gen-mark__lens" r="9"/>'
            f'<circle class="gen-mark__iris" r="3.96"/></g></svg>')


# ---------------------------------------------------------------------------
# 7. Assemble the page.
# ---------------------------------------------------------------------------
def build_html(refs, marks, by_row):
    strong = sum(1 for m in marks if m["grade"] == "strong")
    face_marks = sum(len(by_row[r["key"]]) for r in ROWS if not r.get("muted"))

    cards = []
    for row in ROWS:
        n = len(by_row[row["key"]])
        classes = ["gen-row"]
        if row.get("present"):
            classes.append("gen-row--present")
        if row.get("muted"):
            classes.append("gen-row--muted")
        if row["span"]:
            s, e = row["span"]
            kicker = f"{s}&#8211;{e}" if e else f"{s}&#8211;now"
        else:
            kicker = "context"
        if row.get("present"):
            verdict = "No documented counter-move in the archive."
        elif n:
            verdict = f"{n} graded result{'s' if n != 1 else ''} in the archive."
        elif row.get("muted"):
            verdict = f"{n} graded results, none of them about face reading."
        else:
            verdict = "Nothing graded in the archive yet."
        cards.append(
            f'      <article class="{" ".join(classes)}">\n'
            f'        <p class="gen-row__kicker">{kicker}</p>\n'
            f'        <h2 class="gen-row__title">{html.escape(row["title"])}</h2>\n'
            f'        <p class="gen-row__sub">{html.escape(row["sub"])}</p>\n'
            f'        <p class="gen-row__body">{html.escape(row["body"])}</p>\n'
            f'        <p class="gen-row__verdict">{verdict}</p>\n'
            f'      </article>'
        )

    return f"""<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>The genealogy of the read | Ghostmaxxing</title>
  <meta name="description"
    content="What has been demonstrated against which family of face-reading system, and when. Every mark is a graded entry in the reference archive." />
  <link rel="canonical" href="https://ghostmaxxing.vecna.eu/genealogy.html" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#14100c" />
  <link rel="icon" type="image/svg+xml" href="/images/logo/mark-color.svg" />
  <link rel="icon" type="image/png" sizes="32x32" href="/images/logo/favicon-32.png" />
  <link rel="apple-touch-icon" href="/images/logo/favicon-180.png" />
  <meta property="og:title" content="The genealogy of the read | Ghostmaxxing" />
  <meta property="og:description"
    content="What has been demonstrated against which family of face-reading system, and when." />
  <meta property="og:type" content="article" />
  <meta property="og:image" content="/images/social-card.svg" />
  <meta name="twitter:card" content="summary_large_image" />

  <!-- One shared stylesheet, then one page stylesheet. -->
  <link rel="stylesheet" href="/styles/styles.css" />
  <link rel="stylesheet" href="/styles/genealogy.css" />
</head>

<body>

<!-- ---------------------------------------------------------------------------
     GENERATED FILE. Do not hand-edit.

       python3 scripts-dev/build-genealogy.py

     Every mark below is placed from references/REFERENCES.json, so the page
     cannot drift away from the archive it cites. Edit the archive, or edit
     ROWS in the build script, and re-run.

     This replaced a hand-placed collage: a canopy SVG, four copies of one
     wind gust, four whirlwind <img>s, eight camera SVGs and four tiled smoke
     backgrounds of roughly 1,700 <circle>s — about 290 KB that broke at
     390 px, and whose largest element was identical on every era. The wind is
     gone; so are images/motifs/whirlwind-*.svg and smoke-*.svg as far as this
     page is concerned.
     ------------------------------------------------------------------------ -->

<div class="gm-page">
  <div class="wrap">
{HEADER}

    <section class="gen-hero">
      <div class="gen-hero__lede">
        <h1>The genealogy of the read.</h1>
        <p class="gen-hero__statement">Which interventions affected earlier
          systems, where they stopped working, and what is still untested
          against today&#8217;s pipelines.</p>
      </div>
      <div class="gen-hero__how">
        <p class="gen-hero__kicker">How to read this</p>
        <p>Each row is a family of face-reading system, oldest first. The heavy
          part of the line is the years that family was the state of the art.
          Each mark is one graded entry in the
          <a href="/references/">reference archive</a>, placed at the year it
          was first shown in public &#8212; follow a mark to its conditions.</p>
        <p class="gen-hero__punch">The last two rows are the point: nothing in
          the archive has been demonstrated against either of them.</p>
      </div>
    </section>
  </div>

  <div class="wrap">
    <figure class="gen-figure">
{chart_landscape(by_row)}
{chart_portrait(by_row)}
      <figcaption class="gen-key">
        <span class="gen-key__item">{key_mark("strong")} code, artifact or build files published</span>
        <span class="gen-key__item">{key_mark("paper")} paper or documented project</span>
        <span class="gen-key__item">{key_mark("context")} survey or artwork documentation</span>
        <span class="gen-key__item"><svg class="gen-key__mark" viewBox="0 0 26 26" aria-hidden="true" focusable="false"><line class="gen-span" x1="1" y1="13" x2="25" y2="13"/></svg> years this family led</span>
        <span class="gen-key__item">{key_lens()} a lit lens on a row header: nothing in the archive has been shown against that family</span>
      </figcaption>
    </figure>

    <div class="gen-rows">
{chr(10).join(cards)}
    </div>

    <p class="gen-note gm-prose">Dates mark first public demonstration, not
      deployment. Every entry is a documented result under stated conditions:
      local, conditional and temporary, and the conditions are in the archive
      entry rather than on this page. {len(refs)} entries in total,
      {strong} of them with code or artifacts published, {face_marks} aimed at
      face reading. Where a row is empty it is empty in the archive, which is a
      claim about the archive and not a claim that nothing exists &#8212;
      <a href="/report.html">tell us what we are missing</a>.</p>
  </div>
</div>

{FOOTER}

  <script src="/pages-js/nav.js" defer></script>
</body>

</html>
"""


# ---------------------------------------------------------------------------
# 8. The page stylesheet. Layer: PAGE. Placement only — every colour and every
#    type step comes from tokens.css, and the cameras and the site chrome are
#    drawn by cameras.css and chrome.css.
# ---------------------------------------------------------------------------
CSS = """/* ============================================================================
   genealogy.css — placement for genealogy.html.

   Layer: PAGE. Depends on tokens.css for every value, cameras.css for the
   camera fleet and its lens states, chrome.css for the header and footer.
   Defines no --gm-* token and draws no component.

   WHAT THIS REPLACED
   The previous file placed a collage: a plume column built from three tiled
   background SVGs (smoke-tile, smoke-base, smoke-cut, ~1,700 <circle>s
   between them), a canopy, four absolutely positioned wind slots, four
   whirlwind <img>s and a pyre strip, with per-breakpoint overrides holding
   them in register. Roughly 290 KB, a hard seam wherever smoke-cut met a
   gust, and at 390 px the wind was display:none — so the illustration did not
   survive its own breakpoint while the text did.

   There are no background images in this file. Everything is either type,
   a rule, or geometry inside one of the two <svg> charts. The charts are
   generated; see scripts-dev/build-genealogy.py.

   Contents
     1. Page shell
     2. Hero
     3. The chart, and the orientation swap
     4. Chart parts: ruler, rows, spans, marks
     5. Row cards
     6. Note
     7. Narrow
     8. Reduced motion, forced colours, print
   ========================================================================= */


/* --- 1. Page shell --------------------------------------------------------- */

.gm-page {
  background: var(--gm-bg);
  overflow-x: hidden;
}

.wrap {
  max-width: var(--page-max);
  margin: 0 auto;
  padding: 0 clamp(18px, 4vw, 40px);
}


/* --- 2. Hero ---------------------------------------------------------------
   Two columns: the claim, and how to read the thing that supports it. The
   old hero put "How to read the lenses" in a box that taught a contrast the
   timeline never showed, because every era lens down the page was spent. The
   legend now sits under the chart, where the marks it describes are. */

.gen-hero {
  display: grid;
  gap: clamp(1.5rem, 4vw, 3.5rem);
  grid-template-columns: 1fr;
  padding: clamp(1.5rem, 4vw, 3rem) 0 clamp(1.75rem, 4vw, 2.75rem);
}

@media (min-width: 62rem) {
  .gen-hero {
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    align-items: end;
  }
}

.gen-hero h1 {
  margin: 0 0 0.6rem;
  font-family: var(--serif);
  font-weight: 700;
  font-size: var(--t-h1);
  line-height: var(--lh-heading);
  letter-spacing: var(--ls-display);
  color: var(--gm-ink);
}

.gen-hero__statement {
  margin: 0;
  max-width: 32ch;
  font-family: var(--serif);
  font-weight: 700;
  font-size: var(--t-lead);
  line-height: var(--lh-lead);
  color: var(--gm-ink);
}

.gen-hero__how {
  max-width: 46ch;
}

.gen-hero__how p {
  margin: 0 0 0.7rem;
  font-size: var(--t-body);
  line-height: var(--lh-body);
  color: var(--gm-text);
}

.gen-hero__kicker {
  font-family: var(--mono);
  font-size: var(--t-meta);
  font-weight: 600;
  letter-spacing: var(--ls-meta);
  text-transform: uppercase;
  color: var(--gm-green-deep);
}

/* The one sentence that states the finding. Ink on cream, because the same
   sentence on the orange is the mistake the old page made with its Limits
   lines: 2.65:1 and nobody read them. */
/* Scoped through the parent so it beats `.gen-hero__how p` on specificity
   rather than on !important. */
.gen-hero__how .gen-hero__punch {
  padding: 0.7rem 0.9rem;
  background: var(--gm-cream);
  border: 2px solid var(--gm-ink);
  box-shadow: 4px 4px 0 rgba(10, 10, 8, 0.16);
  font-weight: 700;
  color: var(--gm-ink);
}


/* --- 3. The chart ----------------------------------------------------------
   Two <svg> blocks, one shown at a time. SVG geometry cannot reflow: a
   25-year horizontal axis that reads at 1440 px is 300 px wide on a phone,
   where twenty marks collide. So the wide chart is rows against one axis and
   the narrow one is the same rows as stacked strips, generated from the same
   data by the same code. */

.gen-figure {
  margin: 0;
}

.gen-chart {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.gen-chart--narrow {
  display: none;
  /* Capped, or a 1024 px screen stretches a 380-unit viewBox to 944 px and
     every label with it: the 12 px year ruler would render at 30 px. Centred
     so the cap reads as a decision rather than as a broken float. */
  max-width: 34rem;
  margin-inline: auto;
}

/* The switch is set by the smallest type in the wide chart, not by a device.
   Its mono labels are 12 units in a 1240-unit box, so they render at
   12 x (content width / 1240). Below about 1120 px of viewport the content box
   is near 1040 px and that lands at 10 px, which is the floor for a
   letter-spaced mono label. Under it, the stacked chart takes over. */
@media (max-width: 70rem) {
  .gen-chart--wide { display: none; }
  .gen-chart--narrow { display: block; }
}


/* --- 4. Chart parts -------------------------------------------------------- */

.gen-tick {
  stroke: var(--gm-ink);
  stroke-opacity: 0.14;
  stroke-width: 1;
}

.gen-tick--major {
  stroke-opacity: 0.34;
}

.gen-year {
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  fill: var(--gm-green-deep);
}

/* The row line runs the whole axis so a mark landing after a family stopped
   leading still has a line to land on — which is the point of drawing the
   span separately. */
.gen-line {
  stroke: var(--gm-ink);
  stroke-opacity: 0.3;
  stroke-width: 2;
}

.gen-line--muted {
  stroke-dasharray: 3 6;
  stroke-opacity: 0.35;
}

.gen-span {
  stroke: var(--gm-ink);
  stroke-width: 5;
  stroke-linecap: butt;
}

/* An open-ended span has no end date, so it must not read as one. */
.gen-span--open {
  stroke-dasharray: 26 7;
}

.gen-rowtitle {
  font-family: var(--serif);
  font-weight: 700;
  font-size: 23px;
  letter-spacing: -0.02em;
  fill: var(--gm-ink);
}

.gen-rowtitle--narrow {
  font-size: 16px;
}

.gen-rowtitle--muted {
  fill: var(--gm-green-deep);
}

.gen-rowsub,
.gen-rowspan {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.05em;
  fill: var(--gm-green-deep);
}

.gen-rowspan {
  font-weight: 600;
  letter-spacing: var(--ls-meta);
}

/* An empty row is the finding, so it says so in words rather than by being
   blank. Serif italic, not the mono of a label: it is a sentence. */
.gen-empty {
  font-family: var(--serif);
  font-style: italic;
  font-size: 17px;
  fill: var(--gm-ink);
}

.gen-empty--narrow {
  font-size: 13px;
  font-style: normal;
  font-family: var(--mono);
  fill: var(--gm-green-deep);
}


/* --- 4b. Marks -------------------------------------------------------------
   One mark is one archive entry, drawn as a spent lens at chart scale: dark
   barrel, pink residue ring. Deliberately the same vocabulary as
   [data-lens="spent"] in cameras.css, because it means the same thing.

   Grade is carried by the iris, never by hue alone:
     strong   pink iris     code, artifact or build files published
     paper    dark iris     paper or documented project
     context  cream iris    survey or artwork documentation */

.gen-marklink {
  cursor: pointer;
}

.gen-mark__hit {
  fill: transparent;
}

.gen-mark__lens {
  fill: var(--gm-green-deep);
  stroke: var(--gm-pink);
  stroke-width: 3;
}

.gen-mark__iris {
  fill: var(--gm-pink);
}

.gen-mark--paper .gen-mark__iris {
  fill: var(--gm-green-deep);
}

.gen-mark--context .gen-mark__lens {
  stroke: var(--gm-cream);
}

.gen-mark--context .gen-mark__iris {
  fill: var(--gm-cream);
}

.gen-mark--muted {
  opacity: 0.5;
}

.gen-marklink:hover .gen-mark__lens,
.gen-marklink:focus-visible .gen-mark__lens {
  stroke-width: 6;
}

.gen-marklink:hover .gen-mark--muted,
.gen-marklink:focus-visible .gen-mark--muted {
  opacity: 1;
}

.gen-marklink:focus-visible {
  outline: var(--gm-focus-ring);
  outline-offset: 4px;
}


/* --- 4c. Legend ------------------------------------------------------------ */

.gen-key {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1.9rem;
  padding: 1.1rem 0 0;
  border-top: 2px solid var(--gm-ink);
  margin-top: 0.5rem;
}

.gen-key__item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--t-small);
  color: var(--gm-text);
}

.gen-key__mark {
  width: 22px;
  height: 22px;
  flex: none;
  overflow: visible;
}

.gen-key__mark--cam {
  width: 26px;
  height: 26px;
}

/* A lit lens on a present-day row is a claim. A lit lens on an older row only
   means the archive is thin there, so it is faded — the finding and the gap
   must not look the same. */
.cam-fig--nodata {
  opacity: 0.45;
}


/* --- 5. Row cards ----------------------------------------------------------
   The prose that used to be the era dossiers. It stays in HTML rather than in
   the SVG because SVG <text> does not wrap. */

.gen-rows {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(auto-fit, minmax(16.5rem, 1fr));
  margin: clamp(2rem, 5vw, 3.25rem) 0 0;
}

.gen-row {
  border-top: 2px solid var(--gm-ink);
  padding-top: 0.7rem;
}

.gen-row__kicker {
  margin: 0;
  font-family: var(--mono);
  font-size: var(--t-meta);
  font-weight: 600;
  letter-spacing: var(--ls-meta);
  text-transform: uppercase;
  color: var(--gm-green-deep);
}

.gen-row__title {
  margin: 0.15rem 0 0.1rem;
  font-family: var(--serif);
  font-weight: 700;
  font-size: var(--t-h3);
  line-height: var(--lh-heading);
  letter-spacing: -0.02em;
  color: var(--gm-ink);
}

.gen-row__sub {
  margin: 0 0 0.5rem;
  font-family: var(--mono);
  font-size: 0.68rem;
  letter-spacing: 0.05em;
  color: var(--gm-green-deep);
}

.gen-row__body {
  margin: 0 0 0.6rem;
  font-size: var(--t-small);
  line-height: 1.5;
  color: var(--gm-text);
}

.gen-row__verdict {
  margin: 0;
  font-size: var(--t-small);
  font-weight: 700;
  color: var(--gm-ink);
}

/* The two present-day rows carry the finding, so they get the surface. Absence
   set in the same typography as presence is the argument. */
.gen-row--present {
  padding: 0.9rem 1.05rem 1.05rem;
  background: var(--gm-cream);
  border: 2px solid var(--gm-ink);
  box-shadow: 4px 4px 0 rgba(10, 10, 8, 0.16);
}

.gen-row--muted {
  border-top-style: dashed;
  border-top-color: var(--gm-border-strong);
}

.gen-row--muted .gen-row__title {
  color: var(--gm-green-deep);
}


/* --- 6. Note ---------------------------------------------------------------
   The claims-grading footnote. It used to be the least legible text on the
   page at 1.94:1 on the orange; a lab whose brand voice is "every claim is
   graded before it ships" cannot have that. Ink on cream, 12:1. */

.gen-note {
  max-width: 62ch;
  margin: clamp(2rem, 5vw, 3rem) 0 clamp(2.5rem, 6vw, 4rem);
  padding: 1.1rem 1.25rem;
  background: var(--gm-cream);
  border-inline-start: 5px solid var(--gm-ink);
  font-size: var(--t-small);
  line-height: 1.55;
  color: var(--gm-ink);
}

.gen-note a {
  color: var(--gm-green);
}


/* --- 7. Narrow ------------------------------------------------------------- */

@media (max-width: 42rem) {
  .gen-hero {
    padding-top: 1.25rem;
  }

  .gen-key {
    gap: 0.5rem 1.2rem;
  }

  .gen-rows {
    grid-template-columns: 1fr;
  }
}

/* A 320 px screen leaves the stacked chart 284 px, where its 12.5-unit year
   ruler renders at 9 px. Give the gutter back and raise the ruler: 300 px of
   chart puts it at 11.8 px. This is the only tier that needs the exception. */
@media (max-width: 24rem) {
  .wrap {
    padding-inline: 10px;
  }

  .gen-chart--narrow .gen-year {
    font-size: 15px;
  }

  .gen-chart--narrow .gen-year--crowded {
    display: none;
  }

  .gen-chart--narrow .gen-rowspan {
    font-size: 14px;
  }
}


/* --- 8. Reduced motion, forced colours, print ------------------------------ */

@media (prefers-reduced-motion: reduce) {
  .gen-mark__lens,
  .cam-fig .cam-iris,
  .cam-fig .cam-glint {
    transition: none;
  }
}

/* In forced-colours mode the palette is the OS's. The marks still work,
   because a lens is a stroke and a fill rather than an image. */
@media (forced-colors: active) {
  .gen-mark__lens,
  .gen-span,
  .gen-line {
    stroke: CanvasText;
  }

  .gen-mark__iris {
    fill: CanvasText;
  }

  .gen-mark--context .gen-mark__iris {
    fill: Canvas;
  }

  .gen-hero__punch,
  .gen-row--present,
  .gen-note {
    border-color: CanvasText;
    box-shadow: none;
  }
}

@media print {
  .gm-page,
  .gen-hero__punch,
  .gen-row--present,
  .gen-note {
    background: #fff;
  }

  .gm-site-header,
  .gm-site-footer {
    display: none;
  }

  /* The wide chart is the one that fits a sheet of paper. */
  .gen-chart--wide { display: block; }
  .gen-chart--narrow { display: none; }
  .gen-figure { break-inside: avoid; }

  .gen-rows {
    grid-template-columns: repeat(2, 1fr);
  }
}
"""


def main():
    refs, marks = load_marks()
    by_row = {r["key"]: [m for m in marks if m["row"] == r["key"]] for r in ROWS}

    out_html = os.path.join(ROOT, "genealogy.html")
    out_css = os.path.join(ROOT, "styles", "genealogy.css")
    with open(out_html, "w", encoding="utf-8") as fh:
        fh.write(build_html(refs, marks, by_row))
    with open(out_css, "w", encoding="utf-8") as fh:
        fh.write(CSS)

    print(f"genealogy.html      {os.path.getsize(out_html):>7,} B")
    print(f"styles/genealogy.css {os.path.getsize(out_css):>6,} B")
    print(f"{len(refs)} archive entries -> "
          + ", ".join(f"{r['key']}:{len(by_row[r['key']])}" for r in ROWS))
    empty = [r["title"] for r in ROWS if not by_row[r["key"]] and not r.get("muted")]
    print("empty rows:", "; ".join(empty) or "none")
    return 0


if __name__ == "__main__":
    sys.exit(main())
