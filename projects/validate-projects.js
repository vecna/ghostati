#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(__dirname, 'PROJECTS.json');
const ALLOWED_STATUS = new Set(['active', 'archived', 'unknown']);

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isUrl(value) {
  return typeof value === 'string' && /^https?:\/\//.test(value);
}

function isSlug(value) {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function validateProjects(data) {
  const errors = [];
  const warnings = [];
  const assert = (condition, message) => { if (!condition) errors.push(message); };

  assert(data && typeof data === 'object', 'PROJECTS.json must contain an object.');
  assert(data.schema_version === '1.0', 'schema_version must be "1.0".');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(data.last_updated || ''), 'last_updated must use YYYY-MM-DD.');
  assert(data.language === 'en', 'language must be "en".');
  assert(Array.isArray(data.categories) && data.categories.length > 0, 'categories must be a non-empty array.');
  assert(Array.isArray(data.projects) && data.projects.length > 0, 'projects must be a non-empty array.');

  const categoryIds = new Set();
  for (const [index, category] of (data.categories || []).entries()) {
    const label = `category #${index + 1}`;
    assert(isSlug(category.id), `${label}: invalid id.`);
    assert(isText(category.label), `${label}: missing label.`);
    assert(isText(category.description), `${label}: missing description.`);
    if (categoryIds.has(category.id)) errors.push(`${label}: duplicate id "${category.id}".`);
    categoryIds.add(category.id);
  }

  const slugs = new Set();
  const names = new Set();
  for (const [index, project] of (data.projects || []).entries()) {
    const label = project && project.slug ? project.slug : `project #${index + 1}`;
    assert(project && typeof project === 'object', `${label}: must be an object.`);
    if (!project || typeof project !== 'object') continue;

    assert(isSlug(project.slug), `${label}: invalid slug.`);
    assert(isText(project.name), `${label}: missing name.`);
    assert(isUrl(project.url), `${label}: url must be absolute http(s).`);
    assert(categoryIds.has(project.category), `${label}: unknown category "${project.category}".`);
    assert(ALLOWED_STATUS.has(project.status), `${label}: status must be active, archived, or unknown.`);
    assert(isSlug(project.access), `${label}: access must be a lowercase slug.`);
    assert(isText(project.description), `${label}: missing description.`);

    if (slugs.has(project.slug)) errors.push(`${label}: duplicate slug.`);
    slugs.add(project.slug);
    const normalizedName = String(project.name || '').trim().toLowerCase();
    if (names.has(normalizedName)) warnings.push(`${label}: duplicate normalized name.`);
    names.add(normalizedName);

    const image = project.image || {};
    assert(/^\/images\/projects\/[a-z0-9-]+\.(?:avif|jpe?g|png|webp)$/.test(image.src || ''), `${label}: invalid local image src.`);
    assert(isText(image.alt), `${label}: image.alt is required.`);
    assert(isUrl(image.source_url), `${label}: image.source_url must be absolute http(s).`);
    assert(isText(image.credit), `${label}: image.credit is required.`);
    assert(isText(image.rights_status), `${label}: image.rights_status is required.`);

    const imagePath = path.join(ROOT, String(image.src || '').replace(/^\//, ''));
    if (image.src && !fs.existsSync(imagePath)) errors.push(`${label}: missing image file ${image.src}.`);

    assert(Array.isArray(project.links), `${label}: links must be an array.`);
    for (const [linkIndex, link] of (project.links || []).entries()) {
      assert(isText(link.label), `${label}: links[${linkIndex}].label is required.`);
      assert(isUrl(link.url), `${label}: links[${linkIndex}].url must be absolute http(s).`);
    }
  }

  return { errors, warnings };
}

function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const { errors, warnings } = validateProjects(data);
  warnings.forEach((warning) => console.warn(`warning: ${warning}`));
  if (errors.length) {
    errors.forEach((error) => console.error(`error: ${error}`));
    process.exit(1);
  }
  console.log(`PROJECTS.json OK (${data.projects.length} projects, ${data.categories.length} categories).`);
}

if (require.main === module) main();

module.exports = { validateProjects };
