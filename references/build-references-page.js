#!/usr/bin/env node
'use strict';

/**
 * Regenerates references.html from REFERENCES.json + templates/references.template.html.
 *
 * Usage:
 *   node scripts-dev/validate-references.js && node scripts-dev/build-references-page.js
 *
 * What's static vs. generated:
 *   - templates/references.template.html holds the header, nav, intro copy, the
 *     "How this archive is maintained" section, and the aside shell. Edit that
 *     file directly for wording/nav changes — this script never touches it,
 *     it only fills in the {{...}} placeholders it contains.
 *   - Everything under {{REFERENCES_BODY}} (one card per entry, grouped by
 *     decade) is fully generated from REFERENCES.json every time this runs.
 *
 * This script has no npm dependencies — plain Node + fs/path only.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REFERENCES_PATH = path.join(ROOT, 'references', 'REFERENCES.json');
const TEMPLATE_PATH = path.join(ROOT, 'references', 'templates', 'references.template.html');
const OUTPUT_PATH = path.join(ROOT, 'references', 'index.html');
const VALIDATOR_PATH = path.join(ROOT, 'references', 'validate-references.js');

const TESTABILITY_LABEL = {
  direct: 'Direct testability',
  partial: 'Partial testability',
  indirect: 'Indirect testability',
  contextual: 'Contextual reference',
  no: 'Not testable in-browser',
};

const LINK_LABELS = [
  ['canonical', 'Canonical'],
  ['paper', 'Paper'],
  ['project', 'Project'],
  ['code', 'Code'],
  ['video', 'Video'],
  ['doi', 'DOI'],
  ['arxiv', 'arXiv'],
];

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function decadeOf(year) {
  return `${Math.floor(year / 10) * 10}s`;
}

function sortReferences(refs) {
  // Matches REFERENCES.json's own ordering_definition:
  // year desc, closeness desc, title asc.
  return [...refs].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.closeness !== b.closeness) return b.closeness - a.closeness;
    return a.title.localeCompare(b.title);
  });
}

function tagRow(ref) {
  const level = ref.ghostati_testability.level;
  const parts = [
    `<span class="tag">${esc(ref.year)}</span>`,
    `<span class="tag">${esc(capitalize(ref.type))}</span>`,
    `<span class="tag">Closeness ${esc(ref.closeness)}</span>`,
    `<span class="badge badge--${esc(level)}">${esc(TESTABILITY_LABEL[level] || level)}</span>`,
  ];
  return `<div class="reference-entry__meta">${parts.join('')}</div>`;
}

function topicTags(ref) {
  const tags = [...new Set([...ref.intervention, ...ref.target, ...ref.domain])];
  const chips = tags
    .map((t) => `<span class="tag tag--topic">${esc(t.replace(/-/g, ' '))}</span>`)
    .join('');
  return `<div class="reference-entry__meta reference-entry__meta--topics">${chips}</div>`;
}

function linksRow(ref) {
  const seen = new Set();
  const items = [];
  for (const [key, lbl] of LINK_LABELS) {
    const url = ref.links[key];
    if (url && !seen.has(url)) {
      seen.add(url);
      items.push(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${lbl}</a>`);
    }
  }
  if (items.length === 0) return '';
  return `<p class="reference-entry__links" aria-label="Links for ${esc(ref.title)}">${items.join(' &middot; ')}</p>`;
}

function entryHtml(ref) {
  return `
          <article class="content-section reference-entry" id="${esc(ref.slug)}">
            ${tagRow(ref)}
            <div class="reference-entry__layout">
              <div class="reference-entry__body">
                <h3>${esc(ref.title)}</h3>
                <p class="reference-entry__authors">${esc(ref.author.join(', '))}</p>
                <p>${esc(ref.description)}</p>
                ${topicTags(ref)}
                <div class="reference-entry__facts">
                  <div class="reference-entry__fact">
                    <span class="reference-entry__label">Demonstrated</span>
                    <p>${esc(ref.demonstrated)}</p>
                  </div>
                  <div class="reference-entry__fact">
                    <span class="reference-entry__label">Why it matters for Ghostmaxxing</span>
                    <p>${esc(ref.ghostati_relevance)}</p>
                  </div>
                  <div class="reference-entry__fact">
                    <span class="reference-entry__label">Ghostmaxxing testability</span>
                    <p>${esc(ref.ghostati_testability.reason)}</p>
                  </div>
                  <div class="reference-entry__fact">
                    <span class="reference-entry__label">Limits</span>
                    <p>${esc(ref.limitations)}</p>
                  </div>
                </div>
                <p class="reference-entry__citation">${esc(ref.citation)} &middot; ${esc(ref.reproducibility.replace(/-/g, ' '))}</p>
                ${linksRow(ref)}
              </div>
            </div>
          </article>`;
}

function buildReferencesBody(sortedRefs) {
  const chunks = [];
  const decades = [];
  let currentDecade = null;

  for (const ref of sortedRefs) {
    const dec = decadeOf(ref.year);
    if (dec !== currentDecade) {
      if (currentDecade !== null) chunks.push('</div>');
      chunks.push(`<h3 class="reference-decade" id="decade-${dec}">${dec}</h3>`);
      chunks.push('<div class="reference-decade__group">');
      decades.push(dec);
      currentDecade = dec;
    }
    chunks.push(entryHtml(ref));
  }
  if (currentDecade !== null) chunks.push('</div>');

  return { body: chunks.join('\n'), decades };
}

function main() {
  // Fail loudly rather than generate a page from a broken/incomplete JSON.
  try {
    execFileSync('node', [VALIDATOR_PATH], { stdio: 'inherit', cwd: ROOT });
  } catch (err) {
    console.error('\nvalidate-references.js failed — fix REFERENCES.json before building the page.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(REFERENCES_PATH, 'utf8'));
  const refs = sortReferences(data.references);

  const years = refs.map((r) => r.year);
  const yearMin = Math.min(...years);
  const yearMax = Math.max(...years);
  const nResearch = refs.filter((r) => r.type === 'research').length;
  const nOther = refs.length - nResearch;

  const { body, decades } = buildReferencesBody(refs);
  const decadeNav = decades.map((d) => `<a href="#decade-${d}">${d}</a>`).join('\n            ');
  const statsLine = `${refs.length} references &middot; ${nResearch} research &middot; ${nOther} art / activism &middot; ${yearMin}&ndash;${yearMax}`;

  let html = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  html = html
    .replace(/{{REFERENCE_COUNT}}/g, String(refs.length))
    .replace(/{{YEAR_MIN}}/g, String(yearMin))
    .replace(/{{YEAR_MAX}}/g, String(yearMax))
    .replace('{{STATS_LINE}}', statsLine)
    .replace('{{REFERENCES_BODY}}', body)
    .replace('{{DECADE_NAV}}', decadeNav);

  fs.writeFileSync(OUTPUT_PATH, html);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}: ${refs.length} entries across ${decades.length} decade group(s) (${decades.join(', ')}).`);
}

main();
