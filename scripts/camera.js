
async function startCamera(stateo, elso) {
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
   elso.video.srcObject = stream;

   // Auto mirror based on facingMode
   stateo.isMirrored = stateo.currentFacingMode === 'user';
   elso.video.style.transform = stateo.isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
   elso.overlay.style.transform = stateo.isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
   if (elso.mirrorToggle) {
      elso.mirrorToggle.classList.toggle('mirrored', stateo.isMirrored);
      elso.mirrorToggle.textContent = stateo.isMirrored ? 'Webcam speculare: ON' : 'Mirror webcam';
   }

   await new Promise(resolve => {
      elso.video.onloadedmetadata = () => resolve();
   });
   await elso.video.play();
   elso.placeholder.style.display = 'none';
   setStatus('live', 'webcam attiva');
   setLog('Webcam attiva. Premi l\'icona bersaglio per la scansione o scegli un effetto.');
   resizeCanvas(elso);
   startEffectLoop(stateo, elso);
}

function resizeCanvas(elso) {
   // Allinea le dimensioni intrinseche del canvas a quelle native del video.
   // CSS object-fit: cover gestisce il crop visivo per coprire il contenitore,
   // così le coordinate restituite da face-api/MediaPipe (in pixel del video)
   // si proiettano 1:1 sul canvas, senza stretching su finestre con aspect
   // ratio diverso da quello della webcam. Fallback al contenitore prima che
   // il video abbia dimensioni note (boot pre-permessi camera).
   const rect = elso.viewer.getBoundingClientRect();
   const w = elso.video.videoWidth || Math.max(1, Math.floor(rect.width));
   const h = elso.video.videoHeight || Math.max(1, Math.floor(rect.height));
   elso.overlay.width = w;
   elso.overlay.height = h;
}

function triggerOverlayFadeout(stateo, elso) {
   elso.overlay.style.transition = 'none';
   elso.overlay.style.opacity = '1';
   void elso.overlay.offsetHeight; // force reflow
   elso.overlay.style.transition = 'opacity 2s ease-in-out';

   if (stateo.overlayFadeTimeout) clearTimeout(stateo.overlayFadeTimeout);
   stateo.overlayFadeTimeout = setTimeout(() => {
      elso.overlay.style.opacity = '0';
   }, 5000);
}


function effectLoop(stateo, elso, ts = 0) {
   const currentDelay = parseInt(elso.fpsSelect.value, 10) || 120;
   if (ts - stateo.lastEffectRun > currentDelay) {
      stateo.lastEffectRun = ts;
      runEffectPass(stateo, elso);
   }
   stateo.effectLoopHandle = requestAnimationFrame(function cbaf(ts) {
      effectLoop(stateo, elso, ts);
   });
}

function startEffectLoop(stateo, elso) {
   if (stateo.effectLoopHandle) cancelAnimationFrame(stateo.effectLoopHandle);
   stateo.effectLoopHandle = requestAnimationFrame(function cbaf(ts) {
      effectLoop(stateo, elso, ts);
   });
}

function stopEffectLoop(stateo) {
   // Mai usato?
   if (stateo.effectLoopHandle) cancelAnimationFrame(stateo.effectLoopHandle);
   stateo.effectLoopHandle = null;
   stateo.effectInferenceInFlight = false;
}
