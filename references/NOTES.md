# References toolkit — maintenance notes

`references.html` is generated from `REFERENCES.json`. Three small command-line
tools do the work: two are plain Node (nothing to install), one is Python and
needs a virtual environment because it talks to the real internet.

None of these run automatically — you run each one by hand, in this order,
whenever you add or edit an entry.

## The three tools

### 1. `scripts-dev/validate-references.js`
Checks `REFERENCES.json` against the rules the schema and the build script
both assume: required fields present, enum values valid (`type`,
`ghostati_testability.level`, ...), tags used in `intervention`/`target`/
`domain` are declared in `tag_definitions`, no duplicate slugs or titles.

- **Reads:** `REFERENCES.json`
- **Writes:** nothing. Prints errors/warnings to the console and exits
  non-zero on failure.
- **Run:**
  ```bash
  node scripts-dev/validate-references.js
  ```

Run this first after any manual or LLM-assisted edit to the JSON — it's the
thing that would have caught the `ghostmaxxing_relevance` vs. `ghostati_relevance`
field-name mismatch that was in the old prompt file.

### 2. `scripts-dev/build-references-page.js`
Regenerates the reference list itself. Calls the validator automatically
first and refuses to build if it fails.

- **Reads:** `REFERENCES.json`, `templates/references.template.html`
- **Writes:** `references.html`
- **Run:**
  ```bash
  node scripts-dev/build-references-page.js
  ```

The header, nav, intro copy, and the "How this archive is maintained"
section live in `templates/references.template.html` — edit that file
directly for wording changes. The script only fills in its `{{...}}`
placeholders (`{{REFERENCE_COUNT}}`, `{{STATS_LINE}}`, `{{DECADE_NAV}}`,
`{{REFERENCES_BODY}}`); it never touches the rest of that file.

### 3. PROMPT-for-REFERENCES-metadata


1. Edit `REFERENCES.json` by hand, or generate/extend it with an LLM using
   `PROMPT-REFERENCES-UPDATE.txt`.
2. `node scripts-dev/validate-references.js` — fix anything it flags.
3. Get the preview image in place:
   - Has a paper/arXiv link → `python3 scripts-dev/extract-paper-figures.py --slug <slug>`,
     review the candidate, move/rename it to `images/references/<slug>.png`.
   - No paper (art/activism entry) → source or make a PNG by hand, save it
     to `images/references/<slug>.png`.
4. Confirm `preview_image` in the JSON points at `/images/references/<slug>.png`.
5. `node scripts-dev/build-references-page.js` to regenerate `references.html`.
6. Open `references.html` in a browser and spot-check the new card.


After generating or editing REFERENCES.json:

1. Run `node scripts-dev/validate-references.js` and fix anything it flags — it checks required fields, enum values, and tag_definitions consistency, and will catch a wrong field name (e.g. ghostati_relevance vs. ghostmaxxing_relevance) before it becomes a silent bug in the build.
2. Get preview_image assets in place per the Preview-image rules above.
3. Run `node scripts-dev/build-references-page.js` to regenerate references.html. It calls the validator itself and refuses to build on a failing JSON, but running it manually first gives you a clearer look at any errors.
