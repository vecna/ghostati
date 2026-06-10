#!/usr/bin/env node
/**
 * Auto‑update README on CI.
 *
 * What it does:
 *  - Inserts/upserts a coverage badge (taken from the latest Vitest run).
 *  - Inserts a “Last commit” line with short SHA and message.
 *  - Optionally injects a small changelog of the last N commits.
 *
 * The script is pure‑JS so it runs both on GitHub Actions and locally.
 */

const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;

// ---------- Config ----------
const README_PATH = path.resolve(__dirname, '..', 'README.md');
const COVERAGE_BADGE_URL = (() => {
  const cov = getCoverage();
  if (cov != null) {
    const pct = Number(cov).toFixed(2);
    return `https://img.shields.io/badge/coverage-${pct}%25-lightgrey`;
  }
  return 'https://img.shields.io/badge/coverage-UNKNOWN-lightgrey';
})();
const CHANGELOG_COMMITS = 5; // how many recent commits to list
// ---------------------------
// Helper to compute coverage percentage from various sources
function getCoverage() {
  const coverageRoot = path.resolve(__dirname, '..', 'coverage'); 
  // use lcov.info file
  const lcovPath = path.join(coverageRoot, 'lcov.info');
  if (fs.existsSync(lcovPath)) {
    const lcov = fs.readFileSync(lcovPath, 'utf8');
    const linesMatch = lcov.match(/LF:(\d+)/);
    const hitsMatch = lcov.match(/LH:(\d+)/);
    if (linesMatch && hitsMatch) {
      const total = parseInt(linesMatch[1], 10);
      const hit = parseInt(hitsMatch[1], 10);
      if (total) return (hit / total) * 100;
    }
  }
  return null;
}

// Helper to run a git command and get trimmed stdout
const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();

// ------------------------------------------------------------------
// 1️⃣  Gather data
// ------------------------------------------------------------------
const latestCommitSha = git('rev-parse --short HEAD');
const latestCommitMsg = git('log -1 --pretty=%s');
const recentCommits = git(`log -${CHANGELOG_COMMITS} --pretty=%h:%s`).split('\n');

// ------------------------------------------------------------------
// 2️⃣  Read current README
// ------------------------------------------------------------------
let readme = fs.readFileSync(README_PATH, 'utf8');

// ------------------------------------------------------------------
// 3️⃣  Replace/Insert the badge line (just after the title)
// ------------------------------------------------------------------
readme = readme.replace(
  /(##+\s+.*\n)(?!\!\[Unit\ Test\ Coverage\])/,
  `$1![Unit Test Coverage](${COVERAGE_BADGE_URL})\n`
);

// ------------------------------------------------------------------
// 4️⃣  Insert a “Last commit” line
// ------------------------------------------------------------------
const lastCommitLine = `\n**Last commit:** \`${latestCommitSha}\` – ${latestCommitMsg}\n`;
if (!readme.includes('**Last commit:**')) {
  // Append at the end of file if not present
  readme += lastCommitLine;
} else {
  // Replace the existing line
  readme = readme.replace(
    /\*\*Last commit:\*\* .*\n/,
    `${lastCommitLine}\n`
  );
}

// ------------------------------------------------------------------
// 5️⃣  Optional tiny changelog section
// ------------------------------------------------------------------
const changelogHeader = '\n## Recent changes\n';
let changelog = recentCommits
  .map((c) => {
    const [sha, msg] = c.split(':');
    return `- \`${sha}\` ${msg}`;
  })
  .join('\n');

if (!readme.includes('## Recent changes')) {
  readme += `${changelogHeader}${changelog}\n`;
} else {
  // Replace old block (simple regex, good enough for a small README)
  readme = readme.replace(
    /## Recent changes[\s\S]*?(?=\n##|$)/,
    `${changelogHeader}${changelog}`
  );
}

// ------------------------------------------------------------------
// 6️⃣  Write back
// ------------------------------------------------------------------
fs.writeFileSync(README_PATH, readme, 'utf8');
console.log('✅ README updated');
