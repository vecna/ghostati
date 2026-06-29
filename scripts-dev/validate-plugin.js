#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function readTargetPath() {
  const input = process.argv[2];
  if (!input) {
    console.log('Uso: npm run validate-plugin -- <path-plugin.js>');
    process.exit(1);
  }
  return path.resolve(process.cwd(), input);
}

function extractHeaderBlock(source) {
  const start = source.indexOf('==Ghostyle==');
  const end = source.indexOf('==/Ghostyle==');
  if (start === -1 || end === -1 || end <= start) return null;
  return source.slice(start, end + '==/Ghostyle=='.length);
}

function hasTag(header, tag) {
  return new RegExp(`@${tag}\\s+`, 'i').test(header);
}

function getTagValue(header, tag) {
  const match = header.match(new RegExp(`@${tag}\\s+([^\\n\\r*]+)`, 'i'));
  return match ? match[1].trim() : null;
}

function hasExportedFunction(source, fnName) {
  return new RegExp(`export\\s+function\\s+${fnName}\\s*\\(`).test(source);
}

function validateRiskyPatterns(source, warnings) {
  if (/landmarks\s*\[\s*0\s*\]/.test(source)) {
    warnings.push('Uso potenzialmente rischioso: accesso diretto a landmarks[0] senza guard esplicita.');
  }

  if (/export\s+async\s+function\s+onDraw\s*\(/.test(source)) {
    warnings.push('Pattern sconsigliato: onDraw asincrona (render loop hot-path).');
  }

  if (/export\s+function\s+onDraw[\s\S]*?\{[\s\S]*?await\s+/.test(source)) {
    warnings.push('Pattern sconsigliato: uso di await dentro onDraw.');
  }
}

function run() {
  const targetPath = readTargetPath();
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(targetPath)) {
    console.log(`✗ File non trovato: ${targetPath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(targetPath, 'utf8');
  const header = extractHeaderBlock(source);

  if (!header) {
    errors.push('Header Ghostyle mancante o malformato (==Ghostyle== / ==/Ghostyle==).');
  } else {
    if (!hasTag(header, 'name')) errors.push('Tag richiesto mancante: @name');
    if (!hasTag(header, 'description')) errors.push('Tag richiesto mancante: @description');

    const releaseDate = getTagValue(header, 'release_date');
    if (releaseDate) {
      const parsed = new Date(releaseDate);
      if (Number.isNaN(parsed.getTime())) {
        errors.push(`@release_date non valida: ${releaseDate}`);
      }
    }
  }

  const hasOnDraw = hasExportedFunction(source, 'onDraw');
  const hasPaintUV = hasExportedFunction(source, 'paintUV');
  if (!hasOnDraw && !hasPaintUV) {
    errors.push('Il plugin deve esportare almeno una callback: onDraw oppure paintUV.');
  }

  const hasOnInit = hasExportedFunction(source, 'onInit');
  const hasOnClear = hasExportedFunction(source, 'onClear');
  if (hasOnInit && !hasOnClear) {
    warnings.push('onInit presente ma onClear assente (consigliata simmetria init/clear).');
  }

  validateRiskyPatterns(source, warnings);

  const relPath = path.relative(process.cwd(), targetPath) || targetPath;
  console.log(`validate-plugin: ${relPath}`);

  if (!errors.length && !warnings.length) {
    console.log('✓ OK');
    process.exit(0);
  }

  for (const err of errors) console.log(`✗ ${err}`);
  for (const warn of warnings) console.log(`⚠ ${warn}`);

  process.exit(errors.length ? 1 : 0);
}

run();
