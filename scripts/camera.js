import { state } from './state.js';
import { setStatus, els } from './main.js';
import { setLog } from './utils.js';
import { runEffectPass } from './engine.js';

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


export function effectLoop(ts = 0) {
   const currentDelay = parseInt(els.fpsSelect.value, 10) || 120;
   if (ts - state.lastEffectRun > currentDelay) {
      state.lastEffectRun = ts;
      runEffectPass();
   }
   state.effectLoopHandle = requestAnimationFrame(effectLoop);
}

export function startEffectLoop() {
   if (state.effectLoopHandle) cancelAnimationFrame(state.effectLoopHandle);
   state.effectLoopHandle = requestAnimationFrame(effectLoop);
}

export function stopEffectLoop() {
   // Mai usato?
   if (state.effectLoopHandle) cancelAnimationFrame(state.effectLoopHandle);
   state.effectLoopHandle = null;
   state.effectInferenceInFlight = false;
}
