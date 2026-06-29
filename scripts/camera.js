/**
 * @module camera
 * @description
 * Webcam lifecycle and the per-frame effect loop driver. Three areas of
 * responsibility, kept in one module because they share the `els.video`
 * element and the same lifecycle assumption ("the camera is started once
 * and stays running"):
 *
 *   1. Webcam acquisition: requesting `getUserMedia`, attaching the stream,
 *      applying the mirror transform based on facing mode, and resizing the
 *      overlay canvas to match the video's native dimensions.
 *   2. Effect render loop: throttled `requestAnimationFrame` driver that
 *      calls `runEffectPass()` from `engine.js` at the rate selected by the
 *      FPS dropdown.
 *   3. One-second recording: a small MediaRecorder wrapper used by the
 *      workshop's "capture and share" button.
 *
 * No module-level mutable state lives here except `effectLoopHandle` (the
 * rAF id used to cancel the loop on stop). All other state goes through
 * `state.js`.
 */
import { state } from './state.js';
import { setStatus, els, clearOverlay } from './dom.js';
import { setLog } from './utils.js';
import { runEffectPass } from './engine.js';
import { RECORDING_CONFIG } from './config.js';

/**
 * Acquire the webcam stream, attach it to the `<video>` element, configure
 * mirroring based on the current facing mode, and start the per-frame
 * effect loop. Resolves once the video has loaded its metadata and is
 * actually playing — callers can treat resolution as "the live feed is
 * visible on screen".
 *
 * Failure modes:
 * - `navigator.mediaDevices` missing (insecure context, e.g. HTTP on a LAN
 *   IP instead of localhost or HTTPS): logs an actionable message and
 *   throws.
 * - `getUserMedia` rejection: propagates the underlying error.
 *
 * @returns {Promise<void>}
 * @throws {Error} If the page is in an insecure context, or the user denies
 *   camera permission.
 * @see scripts/main.js – called once at the end of `init()` after every
 *   model has been loaded.
 * @see startEffectLoop – kicked off here.
 */
export async function startCamera() {
   if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      const httpsHint = !window.isSecureContext ? ' La pagina deve essere servita via HTTPS o da localhost (su mobile l\'IP locale non basta).' : '';
      setLog('Webcam non disponibile in questo contesto.' + httpsHint);
      throw new Error('mediaDevices unavailable (insecure context?)');
   }
   const stream = await navigator.mediaDevices.getUserMedia({
      video: {
         width: { ideal: 1920 },
         height: { ideal: 1080 },
         facingMode: state.currentFacingMode
      },
      audio: false
   });
   els.video.srcObject = stream;

   // Auto-mirror when using the front camera: by convention a selfie view
   // is mirrored, a rear-camera (environment) view is not.
   state.isMirrored = state.currentFacingMode === 'user';
   els.video.style.transform = state.isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
   els.overlay.style.transform = state.isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
   if (els.mirrorToggle) {
      els.mirrorToggle.classList.toggle('mirrored', state.isMirrored);
      els.mirrorToggle.textContent = state.isMirrored ? 'Webcam speculare: ON' : 'Mirror webcam';
   }

   await new Promise(resolve => {
      els.video.onloadedmetadata = () => resolve();
   });
   await els.video.play();
   els.placeholder.style.display = 'none';
   setStatus('live', 'webcam attiva');
   setLog('Webcam attiva. Premi l\'icona bersaglio per la scansione o scegli un effetto.');
   resizeCanvas();
   startEffectLoop();
}

/**
 * Align the overlay canvas's intrinsic dimensions to the video's native
 * resolution. CSS `object-fit: cover` then handles the visual crop to the
 * container, which means coordinates returned by face-api / MediaPipe (in
 * video-pixel space) project 1:1 onto the canvas without stretching, even
 * on screen aspect ratios different from the camera's. Falls back to the
 * container's bounding box before the video has known dimensions (during
 * boot, before camera permissions are granted).
 *
 * @see startCamera – called once after the stream starts.
 * @see scripts/engine.js – `drawGhostyleOverlay()` calls this before
 *   drawing, in case the window has been resized since the last frame.
 */
export function resizeCanvas() {
   const rect = els.viewer.getBoundingClientRect();
   const w = els.video.videoWidth || Math.max(1, Math.floor(rect.width));
   const h = els.video.videoHeight || Math.max(1, Math.floor(rect.height));
   els.overlay.width = w;
   els.overlay.height = h;
}

/**
 * Handle returned by the most recent `requestAnimationFrame` for the effect
 * render loop. Exported so tests can inspect the start / stop transitions.
 * `null` when the loop is not running.
 */
export let effectLoopHandle = null;

/**
 * One iteration of the effect render loop. Runs `runEffectPass()` from
 * `engine.js` if at least `currentDelay` milliseconds have passed since the
 * last execution (so the FPS dropdown actually throttles the inference,
 * even though `requestAnimationFrame` itself fires every 16–17 ms).
 * Schedules the next iteration unconditionally — to stop the loop, call
 * `stopEffectLoop()`.
 *
 * @param {number} [ts=0]  Timestamp from rAF; defaults to 0 for the very
 *   first frame so the first `runEffectPass` runs immediately.
 * @returns {Promise<void>}
 * @see runEffectPass – the actual face-api inference call.
 * @see startEffectLoop – schedules the first iteration.
 */
export async function effectLoop(ts = 0) {
   const currentDelay = parseInt(els.fpsSelect.value, 10) || 120;
   if (ts - state.lastEffectRun > currentDelay) {
      state.lastEffectRun = ts;
      let result = await runEffectPass();
      if (result) {
         clearOverlay();
      }
   }
   effectLoopHandle = requestAnimationFrame(effectLoop);
}

/**
 * Start (or restart) the effect render loop. Cancels any previously
 * scheduled rAF first so successive calls don't stack up parallel loops —
 * useful when the camera is restarted after a facingMode switch.
 *
 * @see effectLoop – the function actually scheduled.
 * @see startCamera – calls this once the stream is live.
 */
export function startEffectLoop() {
   if (effectLoopHandle) cancelAnimationFrame(effectLoopHandle);
   effectLoopHandle = requestAnimationFrame(effectLoop);
}

/**
 * Stop the effect render loop and reset the inference-in-flight guard.
 * Currently called only from unit tests; no production code path teardown
 * the loop because the page lifecycle does it implicitly. Kept for
 * completeness and as a test-only handle.
 *
 * @see startEffectLoop – the symmetric counterpart.
 * @see tests/unit/camera.test.js – asserts the cancel + null-out behaviour.
 */
export function stopEffectLoop() {
   if (effectLoopHandle) cancelAnimationFrame(effectLoopHandle);
   effectLoopHandle = null;
   state.effectInferenceInFlight = false;
}

/**
 * Capture a short video clip from the live webcam stream and either trigger
 * a browser download or POST it to the configured upload endpoint
 * (`RECORDING_CONFIG.mode`). Honours `state.isRecording` and
 * `state.isSystemBusy` to refuse overlapping captures, and updates the
 * record button visual state for the duration of the recording.
 *
 * MIME-type selection is best-effort: prefers H.264 MP4 (broadest player
 * support), falls back to MP4 generic, then VP9 WebM, then VP8 WebM. If
 * none of these are supported, `MediaRecorder` will throw and the error is
 * surfaced into the log.
 *
 * @returns {Promise<void>}
 * @see RECORDING_CONFIG – controls mode, endpoint, and duration.
 * @see scripts/main.js – wires the `recordBtn` click handler to this.
 */
export async function recordOneSecond() {
   if (state.isRecording || state.isSystemBusy) return;

   const stream = els.video.srcObject;
   if (!stream) {
      setLog("Errore: Webcam stream non attivo.");
      return;
   }

   // 1. Mark recording state
   state.isRecording = true;
   if (els.recordBtn) {
      els.recordBtn.classList.add('recording');
      els.recordBtn.disabled = true;
   }
   setLog("Registrazione avviata...");

   // 2. Select format
   let mimeType = 'video/webm';
   let extension = 'webm';

   if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264')) {
      mimeType = 'video/mp4;codecs=h264';
      extension = 'mp4';
   } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
      extension = 'mp4';
   } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      mimeType = 'video/webm;codecs=vp9';
      extension = 'webm';
   } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
      mimeType = 'video/webm;codecs=vp8';
      extension = 'webm';
   }

   try {
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      recorder.ondataavailable = (e) => {
         if (e.data && e.data.size > 0) {
            chunks.push(e.data);
         }
      };

      recorder.onstop = async () => {
         const blob = new Blob(chunks, { type: mimeType });
         const isUploadMode = RECORDING_CONFIG.mode === 'upload';

         if (isUploadMode) {
            setLog("Caricamento del video sul server in corso...");
            try {
               const formData = new FormData();
               const filename = `ghostati-recording-${Date.now()}.${extension}`;
               formData.append('video', blob, filename);

               const response = await fetch(RECORDING_CONFIG.uploadEndpoint, {
                  method: 'POST',
                  body: formData
               });

               if (response.ok) {
                  setLog(`Caricamento completato con successo sul server (HTTP ${response.status}) - File: ${filename}`);
               } else {
                  setLog(`Errore durante il caricamento del video: Server HTTP ${response.status} ${response.statusText}`);
               }
            } catch (err) {
               setLog(`Errore di rete durante il caricamento del video: ${err.message}`);
            }
         } else {
            // Direct download mode
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `ghostati-recording-${Date.now()}.${extension}`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
               document.body.removeChild(a);
               URL.revokeObjectURL(url);
            }, 100);
            setLog(`Registrazione completata e scaricata: ${a.download}`);
         }

         // Reset visual styles and state
         state.isRecording = false;
         if (els.recordBtn) {
            els.recordBtn.classList.remove('recording');
            // Re-enable if system not busy
            els.recordBtn.disabled = state.isSystemBusy;
         }
      };

      // Start recording
      recorder.start();

      // Stop recording after RECORDING_CONFIG.durationMs
      setTimeout(() => {
         if (recorder.state !== 'inactive') {
            recorder.stop();
         }
      }, RECORDING_CONFIG.durationMs);

   } catch (err) {
      setLog(`Errore durante l'inizializzazione di MediaRecorder: ${err.message}`);
      state.isRecording = false;
      if (els.recordBtn) {
         els.recordBtn.classList.remove('recording');
         els.recordBtn.disabled = state.isSystemBusy;
      }
   }
}
