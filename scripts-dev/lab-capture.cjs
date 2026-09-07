#!/usr/bin/env node
/**
 * Drive lab.html with a fake webcam, measure the recognition distance and
 * capture workshop screenshots.
 *
 * Chromium replaces the camera with a Y4M file built by
 * `scripts-dev/build-face-fixtures.cjs`. The script starts a local static
 * server unless --base-url is given, waits for face-api to produce a
 * detection, saves an identity, and then reads `#gm-num`, `#gm-thr` and
 * `#gm-state` the way a participant reads them on screen.
 *
 * Subcommands:
 *   measure   Save the identity on the clean segment, sample the distance
 *             across the painted segment, print a table and write JSON.
 *   shots     Capture the workshop images: saved identity, landmark view,
 *             upload consent screen.
 *   probe     Dump the page state and console for one fixture. Use when a
 *             capture returns nothing and you need to know why.
 *
 * Usage:
 *   node scripts-dev/lab-capture.cjs measure --figure 9,10
 *   node scripts-dev/lab-capture.cjs shots --figure 9
 *   node scripts-dev/lab-capture.cjs probe --figure 9 --variant clean
 */

const fs = require('node:fs');
const path = require('node:path');
const httpServer = require('http-server');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'synthetic-faces', 'y4m');
const DEFAULT_SHOT_OUTPUT = path.join(ROOT, 'images', 'workshops');
const DEFAULT_MEASURE_OUTPUT = path.join(ROOT, 'tests', 'fixtures', 'synthetic-faces');
const COMMANDS = ['measure', 'shots', 'probe'];

function usage() {
   return `
Drive lab.html with a fake webcam to measure distances and capture screenshots.

Usage:
  node scripts-dev/lab-capture.cjs <measure|shots|probe> --figure <list> [options]

Options:
  --figure <list>      Figure numbers, comma-separated, or all (required)
  --fixtures <path>    Y4M folder
                       (default: tests/fixtures/synthetic-faces/y4m)
  --output <path>      measure: JSON destination folder
                       (default: tests/fixtures/synthetic-faces)
                       shots: image destination folder
                       (default: images/workshops)
  --base-url <url>     Use an already-running server instead of starting one
  --lab <path>         Lab page path (default: /lab.html)
  --variant <name>     probe only: clean, painted or pair (default: pair)
  --samples <n>        measure: readings across the painted segment (default: 6)
  --interval <sec>     measure: seconds between readings (default: 1.2)
  --settle <sec>       Seconds to wait after the first detection (default: 3)
  --save-wait <sec>    measure: seconds allowed for the save to register
                       (default: 5)
  --record <sec>       shots: seconds of clip to record (default: 7)
  --format <ext>       shots: jpg or png (default: jpg)
  --quality <n>        shots: JPEG quality 1-100 (default: 82)
  --prefix <name>      shots: file name prefix (default: ws-lab)
  --headed             Show the browser
  --keep-open <sec>    Leave the browser open after each run, for debugging
  --help               Show this help

Notes:
  measure needs figureN-pair.y4m. shots needs figureN-clean.y4m and
  figureN-painted.y4m. Build them first:
    npm run capture:fixtures -- --figure 9,10
`;
}

function requireValue(argv, index, option) {
   const value = argv[index + 1];
   if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
   return value;
}

function parseArgs(argv) {
   const options = {
      command: null,
      figures: null,
      fixtures: DEFAULT_FIXTURES,
      output: null,
      baseUrl: null,
      lab: '/lab.html',
      variant: 'pair',
      samples: 6,
      interval: 1.2,
      settle: 3,
      saveWait: 5,
      record: 7,
      format: 'jpg',
      quality: 82,
      prefix: 'ws-lab',
      headed: false,
      keepOpen: 0,
   };

   for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index];
      if (arg === '--help') { process.stdout.write(usage()); process.exit(0); }
      if (!arg.startsWith('--') && !options.command) {
         if (!COMMANDS.includes(arg)) throw new Error(`Unknown subcommand: ${arg}. Expected ${COMMANDS.join(', ')}.`);
         options.command = arg;
         continue;
      }
      if (arg === '--headed') { options.headed = true; continue; }
      if (arg === '--figure') { options.figures = requireValue(argv, index, arg); index += 1; continue; }
      if (arg === '--fixtures') { options.fixtures = path.resolve(ROOT, requireValue(argv, index, arg)); index += 1; continue; }
      if (arg === '--output') { options.output = path.resolve(ROOT, requireValue(argv, index, arg)); index += 1; continue; }
      if (arg === '--base-url') { options.baseUrl = requireValue(argv, index, arg).replace(/\/$/, ''); index += 1; continue; }
      if (arg === '--lab') {
         const value = requireValue(argv, index, arg);
         options.lab = value.startsWith('/') ? value : `/${value}`;
         index += 1;
         continue;
      }
      if (arg === '--variant') {
         const value = requireValue(argv, index, arg);
         if (!['clean', 'painted', 'pair'].includes(value)) throw new Error(`--variant must be clean, painted or pair.`);
         options.variant = value;
         index += 1;
         continue;
      }
      if (arg === '--prefix') { options.prefix = requireValue(argv, index, arg); index += 1; continue; }
      if (arg === '--format') {
         const value = requireValue(argv, index, arg).toLowerCase();
         if (!['jpg', 'jpeg', 'png'].includes(value)) throw new Error('--format must be jpg or png.');
         options.format = value === 'jpeg' ? 'jpg' : value;
         index += 1;
         continue;
      }
      if (['--samples', '--interval', '--settle', '--save-wait', '--record', '--quality', '--keep-open'].includes(arg)) {
         const value = Number(requireValue(argv, index, arg));
         if (!Number.isFinite(value) || value < 0) throw new Error(`${arg} must be a non-negative number.`);
         if (arg === '--samples') options.samples = Math.max(1, Math.round(value));
         if (arg === '--interval') options.interval = value;
         if (arg === '--settle') options.settle = value;
         if (arg === '--save-wait') options.saveWait = value;
         if (arg === '--record') options.record = value;
         if (arg === '--quality') options.quality = Math.min(100, Math.max(1, Math.round(value)));
         if (arg === '--keep-open') options.keepOpen = value;
         index += 1;
         continue;
      }
      throw new Error(`Unknown option: ${arg}`);
   }

   if (!options.command) throw new Error(`A subcommand is required: ${COMMANDS.join(', ')}.`);
   if (!options.figures) throw new Error('--figure is required. Pass numbers such as 9,10 or the word all.');
   if (!options.output) {
      options.output = options.command === 'shots' ? DEFAULT_SHOT_OUTPUT : DEFAULT_MEASURE_OUTPUT;
   }
   return options;
}

/** Print a repository-relative path, or an absolute one when it lies outside. */
function displayPath(file) {
   const relative = path.relative(ROOT, file);
   return relative.startsWith('..') ? file : relative;
}

function resolveFigures(options) {
   if (options.figures === 'all') {
      if (!fs.existsSync(options.fixtures)) throw new Error(`Fixture folder not found: ${options.fixtures}`);
      const numbers = new Set();
      for (const entry of fs.readdirSync(options.fixtures)) {
         const match = /^figure(\d+)-(pair|clean)\.y4m$/.exec(entry);
         if (match) numbers.add(Number(match[1]));
      }
      const found = [...numbers].sort((a, b) => a - b);
      if (!found.length) throw new Error(`No Y4M fixtures in ${options.fixtures}. Run npm run capture:fixtures first.`);
      return found;
   }
   const numbers = options.figures.split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
      const value = Number(item);
      if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid figure number: ${item}`);
      return value;
   });
   return [...new Set(numbers)].sort((a, b) => a - b);
}

function fixtureFile(options, figure, variant) {
   const file = path.join(options.fixtures, `figure${figure}-${variant}.y4m`);
   if (!fs.existsSync(file)) {
      throw new Error(`Missing fixture ${path.relative(ROOT, file)}. Build it with:\n  npm run capture:fixtures -- --figure ${figure}`);
   }
   return file;
}

function findSystemChrome() {
   if (process.platform !== 'linux') return undefined;
   return [
      '/opt/pw-browsers/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
   ].find((candidate) => fs.existsSync(candidate));
}

async function startLocalServer() {
   const server = httpServer.createServer({ root: ROOT, cache: -1, cors: false });
   await new Promise((resolve, reject) => {
      server.server.once('error', reject);
      server.server.listen(0, '127.0.0.1', resolve);
   });
   const address = server.server.address();
   return {
      baseUrl: `http://127.0.0.1:${address.port}`,
      close: () => new Promise((resolve) => server.server.close(resolve)),
   };
}

async function launch(y4mFile, options) {
   return chromium.launch({
      headless: !options.headed,
      executablePath: findSystemChrome(),
      args: [
         '--use-fake-ui-for-media-stream',
         '--use-fake-device-for-media-stream',
         `--use-file-for-fake-video-capture=${y4mFile}`,
         '--autoplay-policy=no-user-gesture-required',
         '--use-angle=swiftshader',
         '--use-gl=angle',
         '--enable-unsafe-swiftshader',
         '--enable-webgl',
         '--ignore-gpu-blocklist',
         '--no-sandbox',
      ],
   });
}

async function openLab(y4mFile, options, baseUrl, viewport) {
   const browser = await launch(y4mFile, options);
   const context = await browser.newContext({
      viewport: viewport || { width: 1280, height: 860 },
      permissions: ['camera'],
      deviceScaleFactor: 2,
   });
   const page = await context.newPage();
   const logs = [];
   page.on('console', (message) => logs.push(`[${message.type()}] ${message.text()}`.slice(0, 240)));
   page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`.slice(0, 240)));
   await page.goto(`${baseUrl}${options.lab}`, { waitUntil: 'load' });
   const detected = await waitFor(
      page,
      () => Boolean(window.gstmxx && window.gstmxx.getLastResult && window.gstmxx.getLastResult()),
      60000,
   );
   await page.waitForTimeout(options.settle * 1000);
   return { browser, page, logs, detected };
}

const readout = (page) => withTimeout(page.evaluate(() => {
   const text = (id) => {
      const element = document.getElementById(id);
      return element ? String(element.textContent || '').trim() : null;
   };
   return {
      num: text('gm-num'),
      threshold: text('gm-thr'),
      state: text('gm-state'),
      uploadDisabled: (document.getElementById('gm-nav-upload') || {}).getAttribute
         ? document.getElementById('gm-nav-upload').getAttribute('aria-disabled')
         : null,
   };
}), 8000).catch(() => ({ num: null, threshold: null, state: null, uploadDisabled: null }));

async function freezeUi(page) {
   await page.addStyleTag({
      content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
   }).catch(() => {});
   await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      window.scrollTo(0, 0);
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
   }).catch(() => {});
}

function shotOptions(file, options) {
   return options.format === 'png'
      ? { path: file, type: 'png' }
      : { path: file, type: 'jpeg', quality: options.quality };
}

/**
 * Wait for a condition inside the page, polling from Node.
 *
 * The lab runs face-api and MediaPipe on the render loop. Under a headless
 * browser that starves requestAnimationFrame and disturbs Playwright's own
 * in-page pollers, so `waitForSelector` and `waitForFunction` time out on
 * elements that plainly exist. Asking the page one question at a time, from
 * outside, is slower and reliable.
 */
async function waitFor(page, predicate, timeoutMs, argument, pollMs = 400) {
   const deadline = Date.now() + timeoutMs;
   for (;;) {
      try {
         if (await withTimeout(page.evaluate(predicate, argument), 5000)) return true;
      } catch (error) {
         // A navigation destroys the execution context, and a frame busy with
         // inference can leave an evaluate unanswered. Both are normal here:
         // keep polling until the deadline rather than failing on one miss.
      }
      if (Date.now() >= deadline) return false;
      await page.waitForTimeout(pollMs);
   }
}

/**
 * Reject after `ms` if a page call has not answered.
 *
 * `page.evaluate` has no timeout of its own. When the lab's render loop blocks
 * the main thread the call never settles, which would hang the whole run.
 */
function withTimeout(promise, ms) {
   let timer = null;
   const guard = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`page call did not answer within ${ms}ms`)), ms);
   });
   promise.catch(() => {});
   return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/**
 * Click an element the way a participant would, and fall back to a direct DOM
 * click when Playwright's actionability check cannot run (see waitFor above).
 */
async function clickAction(page, selector, label) {
   // A busy frame can leave the presence check unanswered. That is not proof
   // the element is missing, so the click is attempted either way and only a
   // failure of every path is reported.
   await waitFor(page, (sel) => Boolean(document.querySelector(sel)), 45000, selector, 500);
   try {
      await page.click(selector, { timeout: 8000 });
      return 'click';
   } catch (actionabilityError) {
      // A frame busy with inference can leave one evaluate unanswered, so the
      // direct click is retried rather than treated as a failure.
      for (let attempt = 0; attempt < 3; attempt += 1) {
         const dispatched = await withTimeout(page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (!element) return false;
            element.scrollIntoView({ block: 'center' });
            element.click();
            return true;
         }, selector), 15000).catch(() => false);
         if (dispatched) return 'dispatch';
         await page.waitForTimeout(1500);
      }
      throw new Error(`${label || selector} could not be clicked: ${String(actionabilityError.message).split('\n')[0]}`);
   }
}

/**
 * Save the face currently on screen and wait for the saved-faces badge rather
 * than for a fixed delay, so a slow machine does not read the label too early.
 */
async function saveIdentity(page, options) {
   const how = await clickAction(page, '#saveBtn', 'Save button');
   const registered = await waitFor(page, () => {
      const db = window.gstmxx && window.gstmxx.getDb && window.gstmxx.getDb();
      const stored = db && Array.isArray(db.faces) ? db.faces.length : 0;
      if (stored > 0) return true;
      const counter = document.getElementById('dbCount');
      return Boolean(counter) && Number(counter.textContent) > 0;
   }, options.saveWait * 1000 + 10000);
   await page.waitForTimeout(1200);
   return { how, registered };
}

async function measureFigure(figure, options, baseUrl) {
   const y4mFile = fixtureFile(options, figure, 'pair');
   const { browser, page, logs, detected } = await openLab(y4mFile, options, baseUrl);
   try {
      if (!detected) return { figure, error: 'no detection within 60s', console: logs.slice(-6) };

      const before = await readout(page);
      const save = await saveIdentity(page, options);
      const saved = await readout(page);
      if (!save.registered) {
         return { figure, error: 'the Save button was clicked but no identity was stored', console: logs.slice(-6) };
      }

      const samples = [];
      for (let index = 0; index < options.samples; index += 1) {
         await page.waitForTimeout(options.interval * 1000);
         const sample = await readout(page);
         samples.push({ atSeconds: Number(((index + 1) * options.interval).toFixed(1)), ...sample });
      }

      const distances = samples.map((sample) => Number.parseFloat(sample.num)).filter((value) => Number.isFinite(value));
      const threshold = Number.parseFloat(String(saved.threshold || '').replace(/[^\d.]/g, '')) || null;
      const peak = distances.length ? Math.max(...distances) : null;
      const states = [...new Set(samples.map((sample) => sample.state).filter(Boolean))];
      return {
         figure,
         fixture: path.relative(ROOT, y4mFile),
         beforeSave: before.state,
         savedAs: saved.state,
         threshold,
         min: distances.length ? Number(Math.min(...distances).toFixed(2)) : null,
         peak: peak === null ? null : Number(peak.toFixed(2)),
         crossedThreshold: peak !== null && threshold !== null ? peak >= threshold : null,
         statesSeen: states,
         samples,
      };
   } catch (error) {
      return { figure, error: String(error?.message || error).split('\n')[0].slice(0, 160), console: logs.slice(-6) };
   } finally {
      if (options.keepOpen) await page.waitForTimeout(options.keepOpen * 1000);
      await browser.close();
   }
}

async function shotFigure(figure, options, baseUrl) {
   fs.mkdirSync(options.output, { recursive: true });
   const extension = options.format === 'png' ? 'png' : 'jpg';
   const name = (suffix) => path.join(options.output, `${options.prefix}-${suffix}.${extension}`);
   const written = [];
   const notes = [];

   // A. Save an identity on the clean face, then show the landmark view.
   {
      const y4mFile = fixtureFile(options, figure, 'clean');
      const { browser, page, detected } = await openLab(y4mFile, options, baseUrl, { width: 1280, height: 800 });
      try {
         if (!detected) throw new Error('no detection on the clean fixture');
         const save = await saveIdentity(page, options);
         if (!save.registered) throw new Error('the Save button was clicked but no identity was stored');
         const saved = await readout(page);
         notes.push(`save   : ${JSON.stringify(saved)}`);
         await freezeUi(page);
         const savedFile = name('save-id');
         await page.screenshot(shotOptions(savedFile, options));
         written.push(savedFile);

         const hasLandmarkToggle = await withTimeout(
            page.evaluate(() => Boolean(document.querySelector('[data-view="2d"]'))), 10000,
         ).catch(() => false);
         if (hasLandmarkToggle) {
            await clickAction(page, '[data-view="2d"]', 'Landmark view toggle');
            await page.waitForTimeout(4000);
            await freezeUi(page);
            const plainFile = name('save-id-plain');
            await page.screenshot(shotOptions(plainFile, options));
            written.push(plainFile);
            notes.push(`points : ${JSON.stringify(await readout(page))}`);
         } else {
            notes.push('points : [data-view="2d"] not found, skipped');
         }
      } finally {
         if (options.keepOpen) await page.waitForTimeout(options.keepOpen * 1000);
         await browser.close();
      }
   }

   // B. Record a clip on the painted face and open the upload consent screen.
   {
      const y4mFile = fixtureFile(options, figure, 'painted');
      const { browser, page, detected } = await openLab(y4mFile, options, baseUrl, { width: 1280, height: 1180 });
      try {
         if (!detected) throw new Error('no detection on the painted fixture');
         await saveIdentity(page, options);
         await clickAction(page, '#recordBtn', 'Record button');
         await page.waitForTimeout(options.record * 1000);
         notes.push(`record : ${JSON.stringify(await readout(page))}`);
         await clickAction(page, '#gm-nav-upload', 'Upload tab');
         await page.waitForTimeout(2500);
         const state = await withTimeout(page.evaluate(() => {
            const screen = document.getElementById('gm-screen-upload');
            return {
               screenClass: screen ? screen.className : null,
               clipMeta: (document.getElementById('gm-upload-clip-meta') || {}).textContent || null,
               submitDisabled: (document.getElementById('gm-upload-submit') || {}).disabled,
            };
         }), 10000).catch(() => ({ screenClass: null, clipMeta: null, submitDisabled: null }));
         notes.push(`upload : ${JSON.stringify(state)}`);
         if (state.screenClass && state.screenClass.includes('hidden')) {
            notes.push('upload : consent screen stayed hidden, no clip was recorded');
         }
         await withTimeout(page.evaluate(() => {
            const screen = document.getElementById('gm-screen-upload');
            if (screen) screen.scrollTop = 0;
            window.scrollTo(0, 0);
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
         }), 10000).catch(() => {});
         await freezeUi(page);
         const uploadFile = name('upload-consent');
         await page.screenshot(shotOptions(uploadFile, options));
         written.push(uploadFile);
      } finally {
         if (options.keepOpen) await page.waitForTimeout(options.keepOpen * 1000);
         await browser.close();
      }
   }

   return { figure, written, notes };
}

async function probeFigure(figure, options, baseUrl) {
   const y4mFile = fixtureFile(options, figure, options.variant);
   const { browser, page, logs, detected } = await openLab(y4mFile, options, baseUrl);
   try {
      const state = await withTimeout(page.evaluate(() => {
         const video = document.getElementById('video');
         return {
            video: video ? { width: video.videoWidth, height: video.videoHeight, paused: video.paused, hasStream: Boolean(video.srcObject) } : null,
            gstmxx: typeof window.gstmxx,
            api: window.gstmxx ? Object.keys(window.gstmxx).slice(0, 40) : [],
            bodyClass: document.body.className,
         };
      }), 10000).catch((error) => ({ error: String(error.message) }));
      return { figure, fixture: path.relative(ROOT, y4mFile), detected, state, readout: await readout(page), console: logs.slice(-20) };
   } finally {
      if (options.keepOpen) await page.waitForTimeout(options.keepOpen * 1000);
      await browser.close();
   }
}

function printMeasureTable(results, options) {
   const width = { figure: 10, saved: 22, min: 7, peak: 7 };
   process.stdout.write('\n');
   process.stdout.write(`${'figure'.padEnd(width.figure)}${'saved as'.padEnd(width.saved)}${'min'.padStart(width.min)}${'peak'.padStart(width.peak)}   verdict\n`);
   process.stdout.write(`${'-'.repeat(width.figure + width.saved + width.min + width.peak + 12)}\n`);
   for (const result of results) {
      if (result.error) {
         process.stdout.write(`${`figure${result.figure}`.padEnd(width.figure)}ERROR ${result.error}\n`);
         continue;
      }
      const verdict = result.crossedThreshold === null
         ? 'no reading'
         : result.crossedThreshold
            ? `eluded, crossed ${result.threshold}`
            : `still matched, under ${result.threshold}`;
      process.stdout.write(
         `${`figure${result.figure}`.padEnd(width.figure)}${String(result.savedAs || '').padEnd(width.saved)}` +
         `${String(result.min ?? '-').padStart(width.min)}${String(result.peak ?? '-').padStart(width.peak)}   ${verdict}\n`,
      );
   }
   process.stdout.write(`\nSamples per figure: ${options.samples} at ${options.interval}s intervals.\n`);
}

async function main() {
   const options = parseArgs(process.argv.slice(2));
   const figures = resolveFigures(options);

   let server = null;
   let baseUrl = options.baseUrl;
   if (!baseUrl) {
      server = await startLocalServer();
      baseUrl = server.baseUrl;
      process.stdout.write(`Serving ${path.relative(path.dirname(ROOT), ROOT)} on ${baseUrl}\n`);
   } else {
      process.stdout.write(`Using ${baseUrl}\n`);
   }

   try {
      if (options.command === 'measure') {
         const results = [];
         for (const figure of figures) {
            process.stdout.write(`figure${figure}: measuring\n`);
            const result = await measureFigure(figure, options, baseUrl);
            results.push(result);
            if (result.error) process.stdout.write(`  error: ${result.error}\n`);
            else process.stdout.write(`  saved as "${result.savedAs}", distance ${result.min} .. ${result.peak} against ${result.threshold}\n`);
         }
         printMeasureTable(results, options);
         fs.mkdirSync(options.output, { recursive: true });
         const jsonFile = path.join(options.output, 'lab-measurements.json');
         fs.writeFileSync(jsonFile, `${JSON.stringify({
            capturedAt: new Date().toISOString(),
            lab: `${baseUrl}${options.lab}`,
            samples: options.samples,
            intervalSeconds: options.interval,
            results,
         }, null, 2)}\n`);
         process.stdout.write(`Wrote ${displayPath(jsonFile)}\n`);
      }

      if (options.command === 'shots') {
         for (const figure of figures) {
            process.stdout.write(`figure${figure}: capturing\n`);
            const result = await shotFigure(figure, options, baseUrl);
            for (const note of result.notes) process.stdout.write(`  ${note}\n`);
            for (const file of result.written) process.stdout.write(`  wrote ${displayPath(file)}\n`);
         }
      }

      if (options.command === 'probe') {
         for (const figure of figures) {
            const result = await probeFigure(figure, options, baseUrl);
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
         }
      }
   } finally {
      if (server) await server.close();
   }
}

main().catch((error) => {
   process.stderr.write(`${String(error?.message || error)}\n`);
   process.exit(1);
});
