/**
 * @module bbox-overlay
 * @description
 * Bbox match-state overlay — add-on for ghostati.html.
 *
 * Draws a bounding box around the detected face on its dedicated canvas
 * (`#bboxOverlay`), colored to reflect the latest match state computed by the
 * engine (matched / eluded / unclear / unknown). Renders the current metrics
 * next to the box: live detection score, live distance and closest match ID.
 *
 * Reacts to events on `state.ghostatiEvents`. Does not mutate the engine.
 *
 * Color convention:
 *   red    = identified  (matched)
 *   green  = eluded
 *   blue   = unclear (post-makeup match below threshold against a saved face)
 *   grey   = unknown (also the fallback for any unmapped state)
 *
 * Overlay suppression:
 *   When the engine reports a `matchStateChanged` triggered by an explicit user
 *   action (`source: 'scan' | 'save' | 'find' | 'efficacy'`), the corresponding
 *   on-screen overlay covers the video for a moment. To avoid double visuals,
 *   the bbox is suppressed for `OVERLAY_SUPPRESS_MS` after such an event. The
 *   auto-find loop (`source: 'auto'`) never suppresses.
 */

import { state } from './state.js';

// ---------- Style constants ----------

/**
 * Stroke / label color for each known match state.
 * Exported so tests can assert color choices.
 * @type {{ matched: string, eluded: string, unclear: string, unknown: string }}
 */
export const COLORS = {
   matched: 'rgba(255, 122, 122, 0.95)',
   eluded:  'rgba(61, 220, 151, 0.95)',
   unclear: 'rgba(122, 192, 255, 0.95)',
   unknown: 'rgba(170, 180, 195, 0.85)',
};

const LINE_WIDTH_CSS = 2.6;

// Same font as the UI logger (see .log-line in styles/ghostati.css). Values are
// in CSS pixels and get multiplied by the canvas/CSS scale in `drawLabels` so
// the visual size stays consistent across resolutions (on mobile the canvas is
// 1920×1080 but rendered at ~350px wide: 12 canvas-pixels would be unreadable
// without scaling).
const LABEL_FONT_FAMILY     = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const LABEL_FONT_SIZE_CSS   = 12;
const LABEL_LINE_HEIGHT_CSS = 16;
const LABEL_PADDING_CSS     = 6;
const LABEL_GAP_CSS         = 8;

/** Suppression window after an overlay-producing user action, in milliseconds. */
export const OVERLAY_SUPPRESS_MS = 4000;

/** Numeric `matchStateChanged.detail` fields that map 1:1 onto `view`. */
const COPYABLE_FIELDS = ['liveMinDist', 'obfMinDist', 'liveMinId', 'obfMinId'];

// ---------- Module state ----------

/** Pristine values for the rendering view; used as the reset baseline. */
const INITIAL_VIEW = Object.freeze({
   matchState:  'unknown',
   liveMinDist: null,
   obfMinDist:  null,
   liveMinId:   null,
   obfMinId:    null,
});

/**
 * Current rendering view — single source of truth for what `drawLabels` and
 * `currentColor` display. Mutated in place (never reassigned) so the export
 * keeps a stable reference for tests.
 */
export const view = { ...INITIAL_VIEW };

let canvas = null;
let overlayEl = null;
let ctx = null;
/** Monotonic deadline (`performance.now()` domain). While `now < this`, skip drawing. */
let suppressUntil = 0;

// ---------- Bootstrap ----------

// `main.js` dispatches `ghostatiReady` on `window` when state, DOM elements and
// `window.Ghostati` are all ready. Same convention as `auto-find-loop.js`.
window.addEventListener('ghostatiReady', init, { once: true });

/**
 * Resolve canvas references and wire bus listeners. Idempotent enough to be
 * called from a test harness with a stub canvas already injected into the DOM.
 *
 * @returns {boolean} `true` on successful init, `false` if required DOM nodes
 *   are missing (a console warning is emitted in that case).
 */
export function init() {
   canvas = document.getElementById('bboxOverlay');
   overlayEl = document.getElementById('overlay');
   if (!canvas || !overlayEl) {
      console.warn('[bbox-overlay] missing #bboxOverlay or #overlay, skipping init');
      return false;
   }
   ctx = canvas.getContext('2d');

   state.ghostatiEvents.addEventListener('detection', onDetection);
   state.ghostatiEvents.addEventListener('matchStateChanged', onMatchStateChanged);
   state.ghostatiEvents.addEventListener('dbChanged', onDbChanged);
   return true;
}

// ---------- Bus listeners ----------

/**
 * Handle a `detection` event by repainting the bbox and labels (or clearing
 * the canvas, when suppressed or when no face was detected).
 *
 * @param {CustomEvent<{ result: object }>} e
 */
export function onDetection(e) {
   const result = e.detail && e.detail.result;
   syncSize();
   syncMirror();
   clearBbox();
   // Skip drawing during the overlay suppression window: the engine's overlay
   // is on top of the video and the bbox would visually compete with it.
   if (performance.now() < suppressUntil) return;
   if (!result) return;

   const resized = faceapi.resizeResults(result, {
      width: canvas.width,
      height: canvas.height,
   });
   const box = extractBox(resized);
   if (!box) return;

   drawBox(box);
   drawLabels(box, extractScore(result));
}

/**
 * Apply the incoming match state to `view` and arm overlay suppression on
 * non-`auto` sources. `scan`/`save` events don't carry distance fields, so
 * each numeric field is only copied when present in the payload.
 *
 * @param {CustomEvent<{
 *   detectionState?: string,
 *   liveMinDist?: number, obfMinDist?: number,
 *   liveMinId?: number,   obfMinId?: number,
 *   source?: 'scan'|'save'|'find'|'efficacy'|'auto'
 * }>} e
 */
export function onMatchStateChanged(e) {
   const d = e.detail;
   if (!d) return;
   if (d.detectionState) view.matchState = d.detectionState;
   for (const k of COPYABLE_FIELDS) if (k in d) view[k] = d[k];
   // Any non-auto source has just painted an overlay onto the video; mute the
   // bbox for OVERLAY_SUPPRESS_MS to keep the two visuals from fighting.
   if (d.source && d.source !== 'auto') suppressUntil = performance.now() + OVERLAY_SUPPRESS_MS;
}

/**
 * Reset the view when the DB has been cleared. Other DB events (additions,
 * stat updates) are ignored — they don't invalidate the current match.
 *
 * @param {CustomEvent<{ count: number }>} e
 */
export function onDbChanged(e) {
   if (e.detail?.count === 0) Object.assign(view, INITIAL_VIEW);
}

// ---------- Geometry / rendering helpers ----------

/** Match the bbox canvas's intrinsic size to the engine overlay's. */
function syncSize() {
   if (canvas.width !== overlayEl.width || canvas.height !== overlayEl.height) {
      canvas.width = overlayEl.width;
      canvas.height = overlayEl.height;
   }
}

/** Mirror the bbox canvas in lockstep with the engine overlay (CSS transform). */
function syncMirror() {
   const t = overlayEl.style.transform;
   if (canvas.style.transform !== t) canvas.style.transform = t;
}

/** Clear the entire bbox canvas. */
function clearBbox() {
   ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Pull the bounding box out of a face-api result, handling both shapes.
 *
 *   detectSingleFace()                        → result.box
 *   detectSingleFace().withFaceLandmarks()    → result.detection.box
 *
 * @param {object} resized A face-api result already passed through `resizeResults`.
 * @returns {{x:number, y:number, width:number, height:number}|undefined}
 */
export function extractBox(resized) {
   return (resized.detection && resized.detection.box) || resized.box;
}

/**
 * Pull the detection confidence score out of a face-api result. Same dual
 * shape as {@link extractBox}.
 *
 * @param {object} result
 * @returns {number|null}
 */
export function extractScore(result) {
   if (result.detection && typeof result.detection.score === 'number') return result.detection.score;
   if (typeof result.score === 'number') return result.score;
   return null;
}

/**
 * Format a number for display, or `'—'` when not a finite number.
 *
 * @param {*} value
 * @param {number} digits
 * @returns {string}
 */
export function fmt(value, digits) {
   return (typeof value === 'number' && Number.isFinite(value)) ? value.toFixed(digits) : '—';
}

/**
 * Pick the stroke / label color from {@link COLORS} matching the current
 * `view.matchState`, with a fallback to the `unknown` grey.
 *
 * @returns {string}
 */
export function currentColor() {
   return COLORS[view.matchState] || COLORS.unknown;
}

/** Ratio between intrinsic canvas pixels and CSS pixels at the current layout. */
function cssScale() {
   const cssW = canvas.clientWidth || canvas.width;
   return canvas.width / cssW;
}

/**
 * Stroke the bounding rectangle at the current color and scaled line width.
 * @param {{x:number, y:number, width:number, height:number}} box
 */
function drawBox(box) {
   const scale = cssScale();
   ctx.save();
   ctx.lineWidth = LINE_WIDTH_CSS * scale;
   ctx.strokeStyle = currentColor();
   ctx.strokeRect(box.x, box.y, box.width, box.height);
   ctx.restore();
}

/**
 * Draw the metric labels next to the bounding box. The label block is
 * un-mirrored (the CSS mirror applies to the whole canvas) so the text reads
 * left-to-right even when the webcam is in mirror mode.
 *
 * @param {{x:number, y:number, width:number, height:number}} box
 * @param {number|null} score Live detection score from face-api.
 */
function drawLabels(box, score) {
   const lines = [
      `detection ${fmt(score, 2)}`,
      `distance  ${fmt(view.liveMinDist, 3)}`,
      `faceId    ${fmt(view.liveMinId, 0)}`,
   ];

   // If the Ghostyle has shifted the closest match onto a different ID than
   // the live detector picks, surface it: it makes the embedding drift under
   // makeup readable at a glance.
   if (Number.isFinite(view.obfMinId) && view.obfMinId !== view.liveMinId) {
      lines.push(`ObfFaceId! ${fmt(view.obfMinId, 0)}`);
   }

   // Canvas→CSS scale: multiply every CSS-px dimension to get canvas-px values
   // that match the on-screen rendering size.
   const scale = cssScale();
   const fontSize   = LABEL_FONT_SIZE_CSS   * scale;
   const lineHeight = LABEL_LINE_HEIGHT_CSS * scale;
   const padding    = LABEL_PADDING_CSS     * scale;
   const gap        = LABEL_GAP_CSS         * scale;

   ctx.save();
   ctx.font = `${fontSize}px ${LABEL_FONT_FAMILY}`;
   ctx.textBaseline = 'top';
   const widths = lines.map(t => ctx.measureText(t).width);
   const blockW = Math.max(...widths) + padding * 2;
   const blockH = lineHeight * lines.length + padding * 2;

   const aboveY = box.y - blockH - gap;
   const belowY = box.y + box.height + gap;
   const top = aboveY >= 0 ? aboveY : belowY;
   let left = box.x;
   if (left + blockW > canvas.width) left = canvas.width - blockW;
   if (left < 0) left = 0;

   // Un-mirror just the label block if the canvas is mirrored, so the text is
   // legible regardless of camera orientation.
   const mirrored = (canvas.style.transform || '').includes('scaleX(-1)');
   if (mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      left = canvas.width - left - blockW;
   }

   ctx.fillStyle = 'rgba(12, 14, 22, 0.78)';
   ctx.fillRect(left, top, blockW, blockH);

   ctx.fillStyle = currentColor();
   lines.forEach((t, i) => {
      ctx.fillText(t, left + padding, top + padding + i * lineHeight);
   });
   ctx.restore();
}
