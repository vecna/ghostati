/** @module engine */
import { state } from './state.js';
import { els, clearOverlay } from './dom.js';
import { distance, avgPoint, drawClosedPath, drawOpenPath, roundRect } from './utils.js';
import { resizeCanvas } from './camera.js';
import { persistDb, renderDbStats } from './db.js';
import { setLog } from './utils.js';
import { DETECTOR_OPTIONS } from './config.js';

/**
 * Detect a face in the webcam video and optionally draw an overlay.
 * Returns the face detection result or null if no face is found.
 * @param {boolean} drawOverlay - Whether to draw the detection overlay.
 * @returns {Promise<Object|null>} Detection result.
 * @see scanFace - uses detectCurrentFace to log and dispatch match state.
 * @see saveFace - uses detectCurrentFace before saving a face.
 * @see findFace - uses detectCurrentFace to compare against stored faces.
 * @see testMakeupEfficacy - uses detectCurrentFace as the baseline detection.
 */
export async function detectCurrentFace(drawOverlay) {
   clearOverlay();
   const result = await faceapi.detectSingleFace(els.video, DETECTOR_OPTIONS)
      .withFaceLandmarks()
      .withAgeAndGender()
      .withFaceDescriptor();

   if (!result) {
      state.lastKnownEffectResult = null;
      setLog('Nessun volto rilevato nella webcam.');
      return null;
   }

   if (drawOverlay) drawResult(result);
   return result;
}

export function triggerOverlayFadeout() {
   els.overlay.style.transition = 'none';
   els.overlay.style.opacity = '1';
   void els.overlay.offsetHeight; // force reflow
   els.overlay.style.transition = 'opacity 2s ease-in-out';

   if (state.overlayFadeTimeout) clearTimeout(state.overlayFadeTimeout);
   state.overlayFadeTimeout = setTimeout(() => {
      els.overlay.style.opacity = '0';
   }, 5000);
}

/**
 * Build a canvas with video compositing, 2D ghostly overlay, and optional 3D plugin (via event).
 * Executes a Face API detection with landmarks and descriptor on the composite.
 * Returns an object containing the canvas, obfuscatedResult, and weakDetection flag.
 * If detection with the normal threshold (`scoreThreshold: 0.5`) fails, it retries with a relaxed threshold (0.1) to still extract numeric metrics from the composite —
 * useful as a "makeup efficacy indicator" even beyond the detection threshold.
 * `weakDetection` indicates when a fallback detection was required.
 * @param {Object} liveResult - Result from the live face detection.
 * @returns {Promise<Object>} An object with canvas, obfuscatedResult, and weakDetection.
 * @see findFace - uses this function to obtain a composite for post‑makeup comparison.
 * @see testMakeupEfficacy - uses this to evaluate makeup effect.
 */
export async function compositeAndDetect(liveResult) {
   const canvas = document.createElement('canvas');
   canvas.width = els.overlay.width;
   canvas.height = els.overlay.height;
   const ctx = canvas.getContext('2d');

   ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);

   const style = state.loadedGhostyles.get(state.activeEffect);
   if (style && style.module.onDraw) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const resized = faceapi.resizeResults(liveResult, { width: canvas.width, height: canvas.height });

      if (!resized.detection) {
         console.log('resized.detection non disponibile:', resized);
      } else {
         style.module.onDraw(ctx, resized.landmarks, resized.detection.box);
         ctx.restore();
      }
   }

   state.ghostatiEvents.dispatchEvent(new CustomEvent('beforeEfficacyComposite', {
      detail: { canvas, ctx, liveResult }
   }));

   let obfuscatedResult = await faceapi.detectSingleFace(canvas, DETECTOR_OPTIONS)
      .withFaceLandmarks()
      .withFaceDescriptor();
   let weakDetection = false;
   if (!obfuscatedResult) {
      const weakOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.1 });
      obfuscatedResult = await faceapi.detectSingleFace(canvas, weakOpts)
         .withFaceLandmarks()
         .withFaceDescriptor();
      weakDetection = !!obfuscatedResult;
   }

   return { canvas, obfuscatedResult, weakDetection };
}

/**
 * Run a single effect pass: performs face detection (with optional landmarks) and draws the effect overlay.
 * Manages state flags to avoid concurrent inference.
 * @returns {Promise<boolean>} Whether the overlay should be cleared (no face detected without active effect).
 * @see drawEffectOverlay - invoked to render the effect.
 * @see detectCurrentFace - used internally for detection when an active effect is present.
 */
export async function runEffectPass() {
   if (state.isSystemBusy || state.effectInferenceInFlight || els.video.readyState < 2) return;
   state.effectInferenceInFlight = true;
   let retToCleanOverlay = false; // do not clean except if no face detected and no active effect, otherwise keep last overlay
   try {
      const detector = faceapi.detectSingleFace(els.video, DETECTOR_OPTIONS);
      const result = state.activeEffect ? await detector.withFaceLandmarks() : await detector;

      if (!result) {
         state.lastKnownEffectResult = null;
         if (state.activeEffect) 
            retToCleanOverlay = true;
      } else if (state.activeEffect) {
         drawEffectOverlay(result, false);
      } else {
         state.lastKnownEffectResult = result;
      }

      state.ghostatiEvents.dispatchEvent(new CustomEvent('detection', {
         detail: { result: result || null, activeEffect: state.activeEffect }
      }));
   } catch (err) {
      console.error(err);
   } finally {
      state.effectInferenceInFlight = false;
   }
   return retToCleanOverlay;
}

/**
 * Draw the effect overlay onto the canvas, optionally including the detection scaffold.
 * Resizes the canvas, clears previous drawings, and renders the active effect style if present.
 * @param {Object} result - Face detection result.
 * @param {boolean} [includeDetectionScaffold=false] - Whether to draw the detection scaffold.
 * @see runEffectPass - calls this to render overlay after detection.
 * @see drawDetectionScaffold - optionally used when includeDetectionScaffold is true.
 */
export function drawEffectOverlay(result, includeDetectionScaffold = false) {
   resizeCanvas(els);
   const ctx = els.overlay.getContext('2d');
   ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
   const resized = faceapi.resizeResults(result, { width: els.overlay.width, height: els.overlay.height });
   if (!resized.detection) {
      console.log("drawEffectOverlay: no detection?", resized);
      // messo questo log perché a volte è undefined?
      return;
   }
   if (includeDetectionScaffold) drawDetectionScaffold(resized);
   if (state.activeEffect) {
      const style = state.loadedGhostyles.get(state.activeEffect);
      if (style && style.module.onDraw) {
         ctx.save();
         ctx.lineCap = 'round';
         ctx.lineJoin = 'round';
         style.module.onDraw(ctx, resized.landmarks, resized.detection.box);
         ctx.restore();
      }
   }
   state.lastKnownEffectResult = result;
}

/**
 * Draw visual scaffolding for a detection result: bounding box, eye line, and facial landmarks.
 * Useful for debugging and user feedback.
 * @param {CanvasRenderingContext2D} ctx - Canvas context to draw on.
 * @param {Object} resized - Resized detection result containing box and landmarks.
 * @see drawEffectOverlay - may call this when includeDetectionScaffold is true.
 * @see drawResult - calls this to display detection scaffold.
 */
export function drawDetectionScaffold(ctx, resized) {
   const box = resized.detection.box;
   const landmarks = resized.landmarks;
   const leftEye = landmarks.getLeftEye();
   const rightEye = landmarks.getRightEye();
   const nose = landmarks.getNose();
   const jaw = landmarks.getJawOutline();
   const mouth = landmarks.getMouth();

   ctx.save();
   ctx.lineWidth = 2.2;
   ctx.strokeStyle = 'rgba(122, 162, 255, 0.95)';
   ctx.strokeRect(box.x, box.y, box.width, box.height);

   const leftCenter = avgPoint(leftEye);
   const rightCenter = avgPoint(rightEye);
   ctx.beginPath();
   ctx.moveTo(leftCenter.x, leftCenter.y);
   ctx.lineTo(rightCenter.x, rightCenter.y);
   ctx.stroke();

   ctx.strokeStyle = 'rgba(255, 122, 122, 0.85)';
   drawClosedPath(ctx, leftEye, null, 'rgba(255, 122, 122, 0.85)', 2);
   drawClosedPath(ctx, rightEye, null, 'rgba(255, 122, 122, 0.85)', 2);

   ctx.strokeStyle = 'rgba(159, 122, 234, 0.88)';
   drawOpenPath(ctx, jaw, 'rgba(159, 122, 234, 0.88)', 2);
   ctx.strokeStyle = 'rgba(61, 220, 151, 0.88)';
   drawOpenPath(ctx, nose, 'rgba(61, 220, 151, 0.88)', 2);
   ctx.strokeStyle = 'rgba(255, 204, 102, 0.88)';
   drawClosedPath(ctx, mouth, null, 'rgba(255, 204, 102, 0.88)', 2);

   ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
   [leftCenter, rightCenter, avgPoint(nose.slice(3)), avgPoint(mouth.slice(0, 7))].forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
   });

   const lines = ['volto rilevato'];
   if (typeof resized.age === 'number') lines.push(`eta stimata: ${Math.round(resized.age)}`);
   if (resized.gender) lines.push(`genere stimato: ${resized.gender}`);

   ctx.font = '14px Inter, system-ui, sans-serif';
   const pad = 6;
   const lineHeight = 18;
   const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
   const boxWidth = maxWidth + pad * 2;
   const boxHeight = lines.length * lineHeight + pad * 2;
   const startX = box.x;
   const startY = Math.max(16, box.y - boxHeight - 8);

   if (state.isMirrored) {
      ctx.translate(startX + boxWidth / 2, startY + boxHeight / 2);
      ctx.scale(-1, 1);
      ctx.translate(-(startX + boxWidth / 2), -(startY + boxHeight / 2));
   }

   ctx.fillStyle = 'rgba(15, 17, 21, 0.78)';
   ctx.strokeStyle = 'rgba(255,255,255,0.10)';
   ctx.lineWidth = 1;
   roundRect(ctx, startX, startY, boxWidth, boxHeight, 8);
   ctx.fill();
   ctx.stroke();

   ctx.fillStyle = 'rgba(238, 242, 255, 0.96)';
   lines.forEach((line, i) => {
      ctx.fillText(line, startX + pad, startY + pad + (i + 1) * lineHeight - 4);
   });
   ctx.restore();
}

/**
 * Draw the detection result on the overlay canvas, including the detection scaffold and any active effect.
 * @param {Object} result - Detection result.
 * @see drawDetectionScaffold - used to draw scaffold.
 * @see drawEffectOverlay - effect drawing is performed here if active.
 */
export function drawResult(result) {
   resizeCanvas(els);
   const ctx = els.overlay.getContext('2d');
   ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
   const resized = faceapi.resizeResults(result, { width: els.overlay.width, height: els.overlay.height });
   drawDetectionScaffold(ctx, resized);
   if (state.activeEffect) {
      const style = state.loadedGhostyles.get(state.activeEffect);
      if (style && style.module.onDraw) {
         ctx.save();
         ctx.lineCap = 'round';
         ctx.lineJoin = 'round';
         style.module.onDraw(ctx, resized.landmarks, resized.detection.box);
         ctx.restore();
      }
   }
   state.lastKnownEffectResult = result;
}


/**
 * Scan the current face, trigger overlay fadeout, log details, and dispatch a match‑state change event.
 * @see detectCurrentFace - obtains the base detection used for scanning.
 */
export async function scanFace() {
   const result = await detectCurrentFace(true);
   if (!result) return;
   triggerOverlayFadeout();
   const age = Math.round(result.age);
   const gender = result.gender || 'n/d';
   const confidence = typeof result.genderProbability === 'number' ? ` (${Math.round(result.genderProbability * 100)}%)` : '';
   const score = result.detection.score;
   setLog(`Volto trovato. Età stimata: ${age}. Genere stimato: ${gender}${confidence}. Detection score: ${score.toFixed(2)}.`);

   state.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
      detail: { detectionState: Ghostati.computeMatchState(result.descriptor), source: 'scan', score }
   }));

}

/**
 * Capture the current face, save its descriptor and metadata to the local database, and log the action.
 * @see detectCurrentFace - obtains the face data to be saved.
 */
export async function saveFace() {
   const result = await detectCurrentFace(true);
   if (!result) return;
   triggerOverlayFadeout();
   const id = state.db.nextId;
   state.db.nextId += 1;
   state.db.faces.push({
      id,
      descriptor: Array.from(result.descriptor),
      age: Math.round(result.age),
      gender: result.gender || null,
      savedAt: new Date().toISOString()
   });
   persistDb();
   renderDbStats();
   const score = result.detection.score;
   setLog(`Impronta biometrica salvata con ID ${id}. Detection score: ${score.toFixed(2)}.`);

   state.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
      detail: { detectionState: window.Ghostati.computeMatchState(result.descriptor), source: 'save', score }
   }));

}

/**
 * findFace
 * Goal: find the best matching face in the database, optionally using a composited
 * post‑makeup image when a plugin is active.
 *
 * `findFace` now serves solely as an orchestrator:
 *   1. Guard against an empty database and obtain a live detection result.
 *   2. Trigger UI feedback (overlay fade‑out) – the only allowed side‑effects.
 *   3. Delegate metric calculations to pure helpers that receive explicit
 *     parameters and return immutable results.
 *   4. Use the helper outcomes to decide the match state and compose a user‑
 *      facing log message.
 *   5. Dispatch a `matchStateChanged` event with a concise payload.
 *
 * By limiting mutable global interactions to these well‑defined steps we gain:
 * • Simple unit tests for each helper (no DOM or global state needed).
 * • Clear separation of concerns – UI logic vs. algorithmic logic.
 * • Easier future extensions (e.g., alternative matching algorithms) without
 *   touching the orchestration flow.
 */
export async function findFace() {
   // Guard: empty DB
   if (state.db.faces.length === 0) {
      setLog('Archivio locale vuoto. Salva almeno un volto prima della ricerca.');
      clearOverlay();
      return;
   }

   const liveResult = await detectCurrentFace(true);
   if (!liveResult) return;
   triggerOverlayFadeout();

   // Pure metric computation
   const { liveScore, liveMinDist, liveMinId } = computeLiveMetrics(liveResult);
   let composite = null;
   if (hasActivePlugin()) {
      composite = await compositeAndDetect(liveResult);
   }
   const { obfScore, obfMinDist, obfMinId, weakDetection, detectionTotallyFailed } = computeCompositeMetrics(composite || {});

   const { detectionState, headline } = decideMatchState({
      liveMinDist,
      liveMinId,
      obfMinDist,
      obfMinId,
      weakDetection,
      detectionTotallyFailed,
   });

   const distLog = buildDistLog({ liveMinDist, obfMinDist });
   setLog(`${headline} ${distLog}.`);

   state.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
      detail: {
         detectionState,
         source: 'find',
         distance: obfMinDist != null ? obfMinDist : liveMinDist,
         matchedId: detectionState === 'matched' ? (obfMinDist != null ? obfMinId : liveMinId) : null,
         score: liveScore,
         obfuscatedScore: obfScore,
         liveMinDist,
         obfMinDist,
         weakDetection,
      },
   }));
}


/**
 * testMakeupEfficacy
 * Goal: Evaluate makeup efficacy by comparing live and composited detections against stored faces.
 * 
 * Similar to `findFace`, the original `testMakeupEfficacy` blended UI updates,
 * state changes, and computational logic. To enable isolated testing we moved
 * all metric‑related calculations into pure helper functions (`computeEfficacyMetrics`,
 * `buildEfficacyDistLog`, and `decideEfficacyOutcome`).
 *
 * The top‑level function now:
 *   1. Acquires a baseline face detection without overlay.
 *   2. Generates a composited image (if possible) and updates UI state.
 *   3. Calls pure helpers to evaluate distances, scores, and overall outcome.
 *   4. Constructs a descriptive log string and dispatches a `matchStateChanged`
 *      event with a minimal payload.
 *
 * This separation ensures the core logic can be unit‑tested in isolation and
 * keeps side‑effects confined to clearly defined sections.
 */
export async function testMakeupEfficacy() {
   const result = await detectCurrentFace(false);
   if (!result) {
      setLog('Nessun volto di base trovato. Avvicinati alla webcam.');
      return;
   }
   const { canvas, obfuscatedResult, weakDetection } = await compositeAndDetect(result);
   state.lastCompositedCanvas = canvas;
   els.copyMakeupBtn.disabled = false;

   const liveScore = result.detection.score;
   const { liveMinDist, obfMinDist, obfScore, weakDetection: weakDet, }
      = computeEfficacyMetrics({ result, composite: { obfuscatedResult, weakDetection } });

   const distLog = buildEfficacyDistLog({ liveMinDist, obfMinDist, dbEmpty: state.db.faces.length === 0, result, obfuscatedResult });
   const { detectionState, headline, dist, } = decideEfficacyOutcome({
      result,
      liveMinDist,
      obfMinDist,
      weakDetection,
      obfuscatedResult,
      dbEmpty: state.db.faces.length === 0,
   });

   // Prepare payload for event dispatch
   const detail = {
      detectionState,
      source: 'efficacy',
      score: liveScore,
      obfuscatedScore: obfScore,
      liveMinDist,
      obfMinDist,
      weakDetection,
   };
   if (dist !== undefined) detail.distance = dist;

   setLog(`${headline} ${distLog}.`);
   state.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', { detail }));
}


/**
 * Determine whether a 2D or 3D effect plugin is currently active.
 * @returns {boolean} True if an effect plugin is active.
 * @see findFace - checks plugin status before compositing.
 * @see testMakeupEfficacy - checks plugin status.
 */
export function hasActivePlugin() {
   const G = window.Ghostati;
   const a2d = typeof G.getActiveEffect === 'function' && G.getActiveEffect();
   const a3d = typeof G.getActiveEffect3d === 'function' && G.getActiveEffect3d();
   return !!(a2d || a3d);
   // state.activeEffect = string with the effect name
}

function computeLiveMetrics(liveResult) {
   const liveScore = liveResult.detection.score;
   const distances = state.db.faces.map(e => ({
       id: e.id,
       distance: distance(liveResult.descriptor, e.descriptor)
   })).sort((a, b) => a.distance - b.distance);
   const liveMinDist = distances.length ? distances[0].distance : null;
   const liveMinId = distances.length ? distances[0].id : null;
   return { liveScore, liveMinDist, liveMinId };
}

/**
 * Compute metrics for the composited (post‑makeup) detection.
 *
 * If a plugin is active a composited image is generated and this function
 * evaluates the detection score and the smallest distance between the
 * composited descriptor and the faces stored in the DB. It also reports whether
 * a weak detection was performed or if detection completely failed.
 *
 * The function is pure – it only reads from `state.db` and the supplied
 * `composite` object and does not mutate any global state.
 *
 * @param {Object} composite - Result of `compositeAndDetect`, containing
 *   `obfuscatedResult` and `weakDetection`.
 * @returns {{obfScore:number|null, obfMinDist:number|null, obfMinId:number|null,
 *   weakDetection:boolean, detectionTotallyFailed:boolean}}
 *   Metrics used by `findFace`.
 * @see findFace – uses this helper to incorporate post‑makeup metrics.
 */
function computeCompositeMetrics(composite) {
   if (!composite || !composite.obfuscatedResult) {
       return {
           obfScore: null,
           obfMinDist: null,
           obfMinId: null,
           weakDetection: !!composite?.weakDetection,
           detectionTotallyFailed: true
       };
   }
   const obfScore = composite.obfuscatedResult.detection.score;
   const distances = state.db.faces.map(e => ({
       id: e.id,
       distance: distance(composite.obfuscatedResult.descriptor, e.descriptor)
   })).sort((a, b) => a.distance - b.distance);
   const obfMinDist = distances.length ? distances[0].distance : null;
   const obfMinId = distances.length ? distances[0].id : null;
   return {
       obfScore,
       obfMinDist,
       obfMinId,
       weakDetection: !!composite.weakDetection,
       detectionTotallyFailed: false
   };
}

/**
 * Decide the overall match state based on live and composited metrics.
 *
 * Applies the matching threshold and handles cases where detection failed
 * entirely or only a weak detection was possible.
 *
 * @param {Object} params - Metric parameters.
 * @param {number|null} params.liveMinDist - Minimum distance for live detection.
 * @param {number|null} params.liveMinId - Matching face ID for live detection.
 * @param {number|null} params.obfMinDist - Minimum distance for composited detection.
 * @param {number|null} params.obfMinId - Matching face ID for composited detection.
 * @param {boolean} params.weakDetection - Whether composited detection was weak.
 * @param {boolean} params.detectionTotallyFailed - Whether composited detection failed.
 * @returns {{detectionState:string, headline:string}} Decision and message for UI.
 * @see findFace – consumes this decision to build event payload.
 */
function decideMatchState({ liveMinDist, liveMinId, obfMinDist, obfMinId, weakDetection, detectionTotallyFailed }) {
   const threshold = state.MATCH_THRESHOLD;
   if (detectionTotallyFailed) {
       return {
           detectionState: 'eluded',
           headline: 'Rilevatore ingannato dal makeup: face-api non trova un volto nel composito.'
       };
   }
   if (weakDetection) {
       return {
           detectionState: 'eluded',
           headline: 'Detection sul composito forzata a confidenza bassa (face-api non vede chiaramente un volto).'
       };
   }
   const useDist = obfMinDist != null ? obfMinDist : liveMinDist;
   const useId = obfMinDist != null ? obfMinId : liveMinId;
   if (useDist <= threshold) {
       return {
           detectionState: 'matched',
           headline: `Corrispondenza trovata: ID ${useId} (distanza ${useDist.toFixed(3)} ≤ ${threshold.toFixed(2)}).`
       };
   }
   return {
       detectionState: 'eluded',
       headline: `Nessuna corrispondenza sotto soglia ${threshold.toFixed(2)}.`
   };
}

/**
 * Build a log string describing live and optional post‑makeup distances.
 *
 * @param {Object} params
 * @param {number|null} params.liveMinDist - Live detection distance.
 * @param {number|null} params.obfMinDist - Post‑makeup detection distance, if any.
 * @returns {string} Formatted distance log.
 * @see findFace – used to generate log message for match result.
 */
function buildDistLog({ liveMinDist, obfMinDist }) {
   if (obfMinDist != null) {
       return `distanza live: ${liveMinDist.toFixed(3)}; distanza post-makeup: ${obfMinDist.toFixed(3)}`;
   }
   return `distanza live: ${liveMinDist.toFixed(3)}`;
}

// ---- Efficacy helpers -------------------------------------------------
/**
 * Compute efficacy metrics comparing live and composited detections against the DB.
 *
 * Determines the closest stored face distance for the live result and, if a
 * composited result exists, its distance and detection score.
 *
 * @param {Object} params
 * @param {Object} params.result - Live detection result.
 * @param {Object} params.composite - Composite detection result containing `obfuscatedResult` and `weakDetection`.
 * @returns {{liveMinDist:number|null, obfMinDist:number|null, obfScore:number|null, weakDetection:boolean}}
 *   Metrics used by `testMakeupEfficacy`.
 * @see testMakeupEfficacy – uses this helper for outcome calculation.
 */
function computeEfficacyMetrics({ result, composite }) {
   const liveMinDist = state.db.faces.length
       ? Math.min(...state.db.faces.map(e => distance(result.descriptor, e.descriptor)))
       : null;
   let obfScore = null,
       obfMinDist = null;
   if (composite.obfuscatedResult) {
       obfScore = composite.obfuscatedResult.detection.score;
       if (state.db.faces.length) {
           obfMinDist = Math.min(...state.db.faces.map(e => distance(composite.obfuscatedResult.descriptor, e.descriptor)));
       }
   }
   return {
       liveMinDist,
       obfMinDist,
       obfScore,
       weakDetection: composite.weakDetection
   };
}

/**
 * Build a descriptive log for makeup efficacy testing.
 *
 * Handles cases where the database is empty, where no composited result is
 * detected, and where distances are available.
 *
 * @param {Object} params
 * @param {number|null} params.liveMinDist - Live detection distance.
 * @param {number|null} params.obfMinDist - Post‑makeup detection distance.
 * @param {boolean} params.dbEmpty - Whether the face DB has any entries.
 * @param {Object} params.result - Live detection result.
 * @param {Object} params.obfuscatedResult - Composited detection result.
 * @returns {string} Formatted distance description.
 * @see testMakeupEfficacy – incorporates this log into UI feedback.
 */
function buildEfficacyDistLog({ liveMinDist, obfMinDist, dbEmpty, result, obfuscatedResult }) {
   if (dbEmpty) {
       if (obfuscatedResult) {
           return `distanza self pre→post: ${distance(result.descriptor, obfuscatedResult.descriptor).toFixed(3)}`;
       }
       return 'distanza self pre→post: post-makeup non rilevato';
   }
   if (obfMinDist != null) {
       return `distanza live: ${liveMinDist.toFixed(3)}; distanza post-makeup: ${obfMinDist.toFixed(3)}`;
   }
   return `distanza live: ${liveMinDist.toFixed(3)}`;
}

/**
 * Decide the outcome of a makeup efficacy test.
 *
 * Evaluates detection success, weak detection flags, and distance thresholds to
 * produce a human‑readable headline and a detection state.
 *
 * @param {Object} params
 * @param {Object} params.result - Live detection result.
 * @param {number|null} params.liveMinDist - Live detection distance.
 * @param {number|null} params.obfMinDist - Post‑makeup detection distance.
 * @param {boolean} params.weakDetection - Whether composited detection was weak.
 * @param {Object|null} params.obfuscatedResult - Result of composited detection.
 * @param {boolean} params.dbEmpty - Whether the DB contains any faces.
 * @returns {{detectionState:string, headline:string, dist?:number}} Outcome description.
 * @see testMakeupEfficacy – uses this decision to dispatch events and log.
 */
export function decideEfficacyOutcome({ result, liveMinDist, obfMinDist, weakDetection, obfuscatedResult, dbEmpty }) {
   const threshold = state.MATCH_THRESHOLD;
   if (!obfuscatedResult) {
       const detectionState = dbEmpty ? 'unknown' : 'eluded';
       const headline = dbEmpty
           ? 'Risultato: NESSUN VOLTO INDIVIDUATO. Rilevatore ingannato! Salva un volto nel DB per testare il riconoscimento.'
           : 'Risultato: ECCELLENTE. Il trucco ha frammentato il volto al punto da distruggere l\'algoritmo di rilevamento.';
       return { detectionState, headline };
   }
   if (weakDetection) {
       const detectionState = dbEmpty ? 'unknown' : 'eluded';
       const headline = 'Risultato: BUONO. Detection sul composito forzata a confidenza bassa — face-api non vede chiaramente un volto.';
       return { detectionState, headline };
   }
   if (dbEmpty) {
       const dist = distance(result.descriptor, obfuscatedResult.descriptor);
       const detectionState = dist > threshold ? 'eluded' : 'matched';
       const headline = dist > threshold
           ? 'Risultato: IDENTITÀ NASCOSTA. La tua impronta è irriconoscibile rispetto al volto base. Salva un volto nel DB per testare contro i salvataggi!'
           : 'Risultato: INSUFFICIENTE. L\'identità biometrica è ancora intatta.';
       return { detectionState, headline, dist };
   }
   const detectionState = obfMinDist > threshold ? 'eluded' : 'matched';
   const headline = obfMinDist > threshold
       ? 'Risultato: BUONO (Spoofed). Volto rilevato ma l\'identità è irriconoscibile.'
       : 'Risultato: INSUFFICIENTE. Il sistema ti riconosce ancora in archivio. Aggiungi geometrie.';
   return { detectionState, headline };
}

