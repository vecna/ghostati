/** @module camera */
import { state } from './state.js';
import { setStatus, els, clearOverlay } from './dom.js';
import { setLog } from './utils.js';
import { runEffectPass } from './engine.js';
import { RECORDING_CONFIG } from './config.js';

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

   // Auto mirror based on facingMode
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

export function resizeCanvas() {
   // Allinea le dimensioni intrinseche del canvas a quelle native del video.
   // CSS object-fit: cover gestisce il crop visivo per coprire il contenitore,
   // così le coordinate restituite da face-api/MediaPipe (in pixel del video)
   // si proiettano 1:1 sul canvas, senza stretching su finestre con aspect
   // ratio diverso da quello della webcam. Fallback al contenitore prima che
   // il video abbia dimensioni note (boot pre-permessi camera).
   const rect = els.viewer.getBoundingClientRect();
   const w = els.video.videoWidth || Math.max(1, Math.floor(rect.width));
   const h = els.video.videoHeight || Math.max(1, Math.floor(rect.height));
   els.overlay.width = w;
   els.overlay.height = h;
}

/**
 *   Handle returned by `requestAnimationFrame` for the 2D effect render loop.
 *   **Range:** `null` when the loop is stopped; otherwise a positive rAF id.
 *   **Used in:** camera.js only (startEffectLoop sets/replaces it, stopEffectLoop
 *   cancels and nulls it).
 */
export let effectLoopHandle = null;

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

export function startEffectLoop() {
   if (effectLoopHandle) cancelAnimationFrame(effectLoopHandle);
   effectLoopHandle = requestAnimationFrame(effectLoop);
}

export function stopEffectLoop() {
   // Mai usato?
   if (effectLoopHandle) cancelAnimationFrame(effectLoopHandle);
   effectLoopHandle = null;
   state.effectInferenceInFlight = false;
}

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

      // Stop recording after durationMs (1 second)
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
