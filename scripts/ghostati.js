/* 
import { distance, computeMatchState, avgPoint, lerp, scaleFrom, point, drawClosedPath, drawOpenPath, drawLabel, roundRect, expandEyePolygon, drawEyeWing, drawCheekSweep, drawContourBand, formatTime } from './utils.js'; */

const MODEL_URLS = {
   tiny: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights',
   landmarks: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_landmark_68',
   recognition: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_recognition',
   ageGender: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/age_gender_model'
};

const STORAGE_KEY = 'local-face-lab-db-v1';
const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
   inputSize: 416,
   scoreThreshold: 0.5
});

const els = {
   video: document.getElementById('video'),
   overlay: document.getElementById('overlay'),
   viewer: document.getElementById('viewer'),
   placeholder: document.getElementById('placeholder'),
   previewImage: document.getElementById('previewImage'),
   logBox: document.getElementById('logBox'),
   statusDot: document.getElementById('statusDot'),
   statusText: document.getElementById('statusText'),
   dbCount: document.getElementById('dbCount'),
   nextId: document.getElementById('nextId'),
   thresholdLabel: document.getElementById('thresholdLabel'),
   effectName: document.getElementById('effectName'),
   effectTracking: document.getElementById('effectTracking'),
   scanBtn: document.getElementById('scanBtn'),
   copyMakeupBtn: document.getElementById('copyMakeupBtn'),
   saveBtn: document.getElementById('saveBtn'),
   findBtn: document.getElementById('findBtn'),
   clearDbBtn: document.getElementById('clearDbBtn'),
   clearOverlayBtn: document.getElementById('clearOverlayBtn'),
   ghostylesContainer: document.getElementById('ghostylesContainer'),
   remoteGhostyleUrl: document.getElementById('remoteGhostyleUrl'),
   loadRemoteGhostyleBtn: document.getElementById('loadRemoteGhostyleBtn'),
   mirrorToggle: document.getElementById('mirrorToggle'), // Left for fallback, but managed by JS via camera direction
   switchCameraBtn: document.getElementById('switchCameraBtn'),
   dbCountBadge: document.getElementById('dbCountBadge'),
   fpsSelect: document.getElementById('fpsSelect')
};

function triggerOverlayFadeout() {
   els.overlay.style.transition = 'none';
   els.overlay.style.opacity = '1';
   void els.overlay.offsetHeight; // force reflow
   els.overlay.style.transition = 'opacity 2s ease-in-out';

   if (state.overlayFadeTimeout) clearTimeout(state.overlayFadeTimeout);
   state.overlayFadeTimeout = setTimeout(() => {
      els.overlay.style.opacity = '0';
   }, 5000);
}

// Mirror toggle logic (fallback, hidden in UI)
if (els.mirrorToggle) {
   els.mirrorToggle.addEventListener('click', () => {
      state.isMirrored = !state.isMirrored;
      els.video.style.transform = state.isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
      els.overlay.style.transform = state.isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
      els.mirrorToggle.classList.toggle('mirrored', state.isMirrored);
      els.mirrorToggle.textContent = state.isMirrored ? 'Webcam speculare: ON' : 'Mirror webcam';
   });
}

// Switch Camera logic
if (els.switchCameraBtn) {
   els.switchCameraBtn.addEventListener('click', async () => {
      state.currentFacingMode = state.currentFacingMode === 'user' ? 'environment' : 'user';
      setLog(`Cambio fotocamera... (${state.currentFacingMode})`);
      if (els.video.srcObject) {
         els.video.srcObject.getTracks().forEach(track => track.stop());
      }
      try {
         await startCamera();
      } catch (err) {
         handleError(err, 'Errore nel cambio fotocamera.');
      }
   });
}

const ghostatiEvents = new EventTarget();

// DEBUG: intercetta tutti gli errori non catturati nei listener
window.addEventListener('unhandledrejection', e => {
   console.error('[unhandledrejection]', e.reason);
});

// DEBUG: log di tutti gli eventi del bus
const _origDispatch = ghostatiEvents.dispatchEvent.bind(ghostatiEvents);
ghostatiEvents.dispatchEvent = function (event) {
   if (!(event.type === "landmarks3d" ||
      event.type === "detection" ||
      event.type === "matchStateChanged"))
      console.debug(`[event:${event.type}]`, event.detail);
   return _origDispatch(event);
};

const state = {
   db: loadDb(),
   activeEffect: null,
   effectLoopHandle: null,
   effectInferenceInFlight: false,
   lastEffectRun: 0,
   isSystemBusy: false,
   lastKnownEffectResult: null,
   lastCompositedCanvas: null,
   isMirrored: false,
   currentFacingMode: 'user',
   logsArchive: [],
   visibleLogStartIndex: 0,
   overlayFadeTimeout: null,
   isLogExpanded: false,
   nudgeStep: localStorage.getItem('ghostati-nudge-done') ? 6 : 1,
   MATCH_THRESHOLD: 0.58,
}


function updateEffectStats() {
   const style = loadedGhostyles.get(state.activeEffect);
   els.effectName.textContent = style ? style.name : 'nessuno';
   els.effectTracking.textContent = state.activeEffect ? 'on' : 'off';
}

function updateLogDisplay() {
   els.logBox.innerHTML = '';

   if (state.isLogExpanded) {
      els.logBox.classList.add('expanded');
      const startIdx = Math.max(0, state.logsArchive.length - 100);
      for (let i = startIdx; i < state.logsArchive.length; i++) {
         const clone = state.logsArchive[i].cloneNode(true);
         els.logBox.appendChild(clone);
      }
      els.logBox.scrollTop = els.logBox.scrollHeight;
   } else {
      els.logBox.classList.remove('expanded');
      let renderedCount = 0;
      for (let i = state.logsArchive.length - 1; i >= state.visibleLogStartIndex && renderedCount < 4; i--) {
         const clone = state.logsArchive[i].cloneNode(true);
         els.logBox.insertBefore(clone, els.logBox.firstChild);
         renderedCount++;
      }
   }
}

function setLog(message, sourcePlugin = null) {
   const line = document.createElement('div');
   line.className = 'log-line';

   const timeSpan = document.createElement('span');
   timeSpan.style.color = 'var(--muted)';
   timeSpan.style.marginRight = '8px';
   timeSpan.textContent = `[${formatTime()}]`;
   line.appendChild(timeSpan);

   if (sourcePlugin) {
      const span = document.createElement('span');
      span.style.color = 'var(--accent-2)';
      span.style.fontWeight = '800';
      span.style.marginRight = '8px';
      span.textContent = `[${sourcePlugin.toUpperCase()}]`;
      line.appendChild(span);
   }
   const textSpan = document.createElement('span');
   textSpan.textContent = message;
   line.appendChild(textSpan);

   state.logsArchive.push(line);
   if (state.logsArchive.length > 100) {
      state.logsArchive.shift();
      if (state.visibleLogStartIndex > 0) state.visibleLogStartIndex--;
   }

   updateLogDisplay();
}

function setStatus(kind, text) {
   els.statusDot.className = 'status-dot';
   if (kind === 'live') els.statusDot.classList.add('live');
   if (kind === 'error') els.statusDot.classList.add('error');
   els.statusText.textContent = text;
}

function setBusy(isBusy) {
   state.isSystemBusy = isBusy;
   [els.scanBtn, els.copyMakeupBtn, els.saveBtn, els.findBtn, els.clearDbBtn, els.clearOverlayBtn, els.loadRemoteGhostyleBtn].forEach(btn => {
      if (btn === els.copyMakeupBtn && !state.lastCompositedCanvas) btn.disabled = true;
      else btn.disabled = isBusy;
   });
   const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
   previewBtns.forEach(btn => btn.disabled = isBusy);
}

function resizeCanvas() {
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

function clearOverlay() {
   const ctx = els.overlay.getContext('2d');
   ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
   els.overlay.style.transition = 'none';
   els.overlay.style.opacity = '1';
   if (state.overlayFadeTimeout) clearTimeout(state.overlayFadeTimeout);
}

function updateNudging() {
   console.log("nudging - Temporaneamente disabilitato - step", state.nudgeStep);
}

/*
{
   if (nudgeStep > 5) return;
   
   document.querySelectorAll('.nudge-target').forEach(el => el.classList.remove('nudge-target'));
   
   if (nudgeStep === 1) els.scanBtn.classList.add('nudge-target');
   if (nudgeStep === 2) els.saveBtn.classList.add('nudge-target');
   if (nudgeStep === 3) {
      const toggleBtn = document.getElementById('toggleSettingsBtn');
      if (toggleBtn) toggleBtn.classList.add('nudge-target');
      els.ghostylesContainer.querySelectorAll('.preview-btn').forEach(btn => btn.classList.add('nudge-target'));
   }
   if (nudgeStep === 4) els.scanBtn.classList.add('nudge-target');
   if (nudgeStep === 5 && !els.copyMakeupBtn.disabled) els.copyMakeupBtn.classList.add('nudge-target');
} 
   */

window.Ghostati = {
   log: (message, sourcePlugin) => setLog(message, sourcePlugin),
   clearVisibleLogs: () => {
      state.visibleLogStartIndex = state.logsArchive.length;
      updateLogDisplay();
   },
   /* queste le funzioni utili nei plugin */
   distance,
   avgPoint,
   lerp,
   scaleFrom,
   point,
   drawClosedPath,
   drawOpenPath,
   drawLabel,
   roundRect,
   expandEyePolygon,
   drawEyeWing,
   drawCheekSweep,
   drawContourBand,
   /* fine delle funzioni usate nei plugin, ora implementate in utils.js */
   events: ghostatiEvents,
   getDb: () => structuredClone(state.db),
   getActiveEffect: () => state.activeEffect,
   getLastResult: () => state.lastKnownEffectResult,
   getMatchThreshold: () => state.MATCH_THRESHOLD,
   _computeMatchState: (descriptor) => computeMatchState(descriptor, state.db, state.MATCH_THRESHOLD),
   compositeAndDetect: (liveResult) => compositeAndDetect(liveResult),
   detectorOptions: DETECTOR_OPTIONS
};

const loadedGhostyles = new Map();

async function loadGhostyle(url, expectedName = null) {
   const id = url.split('/').pop().replace('.js', '');
   try {
      setLog(`Caricamento ghostyle da ${url}...`);

      /* Nota sul caricamento dinamico: avvengono 2 chiamate http, la prima
       * è per gestire il testo, con tutti i commenti e metadata, la seconda 
       * è per importare effettivamente il modulo. */
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const matchName = text.match(/@name\s+(.+)/);
      const name = matchName ? matchName[1].trim() : (expectedName || id);

      setLog(`Ghostyle '${name}' intergrità verificata, caricamento modulo...`);

      try {
         const module = await import(url);
         loadedGhostyles.set(id, { id, name, module, url });

         if (module.onInit) {
            console.log(`Funzione di inizializzazione trovata in '${name}'`);
            module.onInit();
         }
      } catch (err) {
         console.log(`Errore durante l'importazione del modulo '${name}': ${err.message}`);
         throw new Error(`Errore durante l'importazione del modulo: ${err.message}`);
      }

      const btn = document.createElement('button');
      btn.className = 'preview-btn';
      btn.textContent = name;
      btn.dataset.effect = id;
      btn.onclick = () => toggleEffect(id, btn);

      els.ghostylesContainer.appendChild(btn);

   } catch (err) {
      console.error(err);
      const btn = document.createElement('button');
      btn.className = 'preview-btn';
      btn.textContent = expectedName || id;
      btn.disabled = true;
      btn.style.color = 'var(--danger)';
      btn.style.borderColor = 'rgba(255, 122, 122, 0.4)';
      btn.title = `Errore di caricamento: ${err.message}`;
      els.ghostylesContainer.appendChild(btn);
      setLog(`Impossibile caricare Ghostyle ${expectedName || id}: ${err.message}`, 'Sistema (Error)');
   }
}

function drawDetectionScaffold(ctx, resized) {
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

function drawEffectOverlay(result, includeDetectionScaffold = false) {
   resizeCanvas();
   const ctx = els.overlay.getContext('2d');
   ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
   const resized = faceapi.resizeResults(result, { width: els.overlay.width, height: els.overlay.height });
   if (!resized.detection) {
      console.log("drawEffectOverlay: no detection?", resized);
      return
   } else {
      console.log("drawEffectOverlay: detection OK", resized.detection);
   }
   if (includeDetectionScaffold) drawDetectionScaffold(ctx, resized);
   if (state.activeEffect) {
      const style = loadedGhostyles.get(state.activeEffect);
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

async function detectCurrentFace(drawOverlay = true) {
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

function drawResult(result) {
   resizeCanvas();
   const ctx = els.overlay.getContext('2d');
   ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
   const resized = faceapi.resizeResults(result, { width: els.overlay.width, height: els.overlay.height });
   drawDetectionScaffold(ctx, resized);
   if (state.activeEffect) {
      const style = loadedGhostyles.get(state.activeEffect);
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

async function runEffectPass() {
   if (state.isSystemBusy || state.effectInferenceInFlight || els.video.readyState < 2) return;
   state.effectInferenceInFlight = true;
   try {
      const detector = faceapi.detectSingleFace(els.video, DETECTOR_OPTIONS);
      const result = state.activeEffect ? await detector.withFaceLandmarks() : await detector;

      if (!result) {
         state.lastKnownEffectResult = null;
         if (state.activeEffect) clearOverlay();
      } else if (state.activeEffect) {
         drawEffectOverlay(result, false);
      } else {
         state.lastKnownEffectResult = result;
      }

      ghostatiEvents.dispatchEvent(new CustomEvent('detection', {
         detail: { result: result || null, activeEffect: state.activeEffect }
      }));
   } catch (err) {
      console.error(err);
   } finally {
      state.effectInferenceInFlight = false;
   }
}

function effectLoop(ts = 0) {
   const currentDelay = parseInt(els.fpsSelect.value, 10) || 120;
   if (ts - state.lastEffectRun > currentDelay) {
      state.lastEffectRun = ts;
      runEffectPass();
   }
   state.effectLoopHandle = requestAnimationFrame(effectLoop);
}

function startEffectLoop() {
   if (state.effectLoopHandle) cancelAnimationFrame(state.effectLoopHandle);
   state.effectLoopHandle = requestAnimationFrame(effectLoop);
}

function stopEffectLoop() {
   if (state.effectLoopHandle) cancelAnimationFrame(state.effectLoopHandle);
   state.effectLoopHandle = null;
   state.effectInferenceInFlight = false;
}

function deactivateEffect({ silent = false } = {}) {
   const previousEffect = state.activeEffect;
   if (state.activeEffect) {
      const style = loadedGhostyles.get(state.activeEffect);
      if (style && style.module.onClear) {
         style.module.onClear(els.overlay.getContext('2d'));
      }
   }
   state.activeEffect = null;
   if (previousEffect) {
      ghostatiEvents.dispatchEvent(new CustomEvent('effectChanged', {
         detail: { activeEffect: null, previous: previousEffect }
      }));
   }
   const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
   previewBtns.forEach(btn => btn.classList.remove('active'));
   els.scanBtn.style.background = '';
   els.scanBtn.style.borderColor = '';
   els.scanBtn.style.color = '';

   updateEffectStats();
   state.lastKnownEffectResult = null;
   state.lastCompositedCanvas = null;
   els.copyMakeupBtn.disabled = true;
   clearOverlay();
   if (!silent) setLog('Guida makeup disattivata. Webcam ripristinata senza overlay.');
}

function toggleEffect(effect, button) {
   console.log(`toggleEffect, active: ${state.activeEffect} new effect ${effect} button ${button}`);

   if (state.activeEffect === effect) {
      deactivateEffect();
      return;
   }

   if (state.activeEffect) {
      deactivateEffect({ silent: true });
      // wait for complete removal then continue
   }

   const previousEffect = state.activeEffect;
   state.activeEffect = effect;
   ghostatiEvents.dispatchEvent(new CustomEvent('effectChanged', {
      detail: { activeEffect: effect, previous: previousEffect }
   }));
   const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
   previewBtns.forEach(btn => btn.classList.toggle('active', btn === button));
   els.previewImage.style.display = 'none';
   els.previewImage.removeAttribute('src');
   updateEffectStats();

   console.log('Loading Ghostyles', effect);
   const style = loadedGhostyles.get(effect);
   setLog(`Guida makeup attiva: ${style ? style.name : effect}. Cerca un volto nella webcam per vedere dove applicarlo.`);

   els.scanBtn.style.background = 'linear-gradient(180deg, rgba(159, 122, 234, 0.35), rgba(159, 122, 234, 0.15))';
   els.scanBtn.style.borderColor = 'rgba(159, 122, 234, 0.5)';
   els.scanBtn.style.color = '#fff';

   if (state.nudgeStep === 3) { state.nudgeStep = 4; updateNudging(); }

   if (state.overlayFadeTimeout) clearTimeout(state.overlayFadeTimeout);
   els.overlay.style.transition = 'none';
   els.overlay.style.opacity = '1';

   startEffectLoop();
}

async function scanFace() {
   const result = await detectCurrentFace(true);
   if (!result) return;
   triggerOverlayFadeout();
   const age = Math.round(result.age);
   const gender = result.gender || 'n/d';
   const confidence = typeof result.genderProbability === 'number' ? ` (${Math.round(result.genderProbability * 100)}%)` : '';
   const score = result.detection.score;
   setLog(`Volto trovato. Età stimata: ${age}. Genere stimato: ${gender}${confidence}. Detection score: ${score.toFixed(2)}.`);

   ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
      detail: { detectionState: Ghostati._computeMatchState(result.descriptor), source: 'scan', score }
   }));

   if (state.nudgeStep === 1) { state.nudgeStep = 2; updateNudging(); }
}

async function saveFace() {
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
   persistDb(state);
   renderDbStats(state, els);
   const score = result.detection.score;
   setLog(`Impronta biometrica salvata con ID ${id}. Detection score: ${score.toFixed(2)}.`);

   ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
      detail: { detectionState: Ghostati._computeMatchState(result.descriptor), source: 'save', score }
   }));

   if (state.nudgeStep === 2) { state.nudgeStep = 3; updateNudging(); }
}

async function findFace() {
   if (state.db.faces.length === 0) {
      setLog('Archivio locale vuoto. Salva almeno un volto prima della ricerca.');
      clearOverlay();
      return;
   }

   console.log("Faccie nel DB:", state.db.faces);
   const liveResult = await detectCurrentFace(true);
   if (!liveResult) return;
   triggerOverlayFadeout();

   const liveScore = liveResult.detection.score;
   const liveDistances = state.db.faces
      .map(entry => ({ id: entry.id, distance: distance(liveResult.descriptor, entry.descriptor) }))
      .sort((a, b) => a.distance - b.distance);
   const liveMinDist = liveDistances[0].distance;
   const liveMinId = liveDistances[0].id;


   // Se c'è un plugin attivo, calcola anche le metriche post-makeup. Con retry weak
   // dentro compositeAndDetect, abbiamo quasi sempre un descrittore (anche di bassa
   // confidenza) da cui estrarre obfMinDist e obfScore. weakDetection ci ricorda che
   // la prima detection (strict) è fallita.
   let obfScore = null;
   let obfMinDist = null;
   let obfMinId = null;
   let weakDetection = false;
   let detectionTotallyFailed = false;
   if (hasActivePlugin()) {
      const composite = await compositeAndDetect(liveResult);
      if (composite.obfuscatedResult) {
         obfScore = composite.obfuscatedResult.detection.score;
         const obfDistances = state.db.faces
            .map(e => ({ id: e.id, distance: distance(composite.obfuscatedResult.descriptor, e.descriptor) }))
            .sort((a, b) => a.distance - b.distance);
         obfMinDist = obfDistances[0].distance;
         obfMinId = obfDistances[0].id;
         weakDetection = !!composite.weakDetection;
      } else {
         detectionTotallyFailed = true;
      }
   }

   // Stato/match decision: con plugin il giudizio è basato sulla strict detection
   // (weakDetection → eluso a prescindere dalla distanza, perché face-api stessa
   // non si fida del volto). Senza plugin, semplicemente confronto liveMinDist.
   let detectionState, headline;
   if (detectionTotallyFailed) {
      detectionState = 'eluded';
      headline = `Rilevatore ingannato dal makeup: face-api non trova un volto nel composito.`;
   } else if (weakDetection) {
      detectionState = 'eluded';
      headline = `Detection sul composito forzata a confidenza bassa (face-api non vede chiaramente un volto).`;
   } else {
      const useDist = obfMinDist != null ? obfMinDist : liveMinDist;
      const useId = obfMinDist != null ? obfMinId : liveMinId;
      if (useDist <= state.MATCH_THRESHOLD) {
         detectionState = 'matched';
         headline = `Corrispondenza trovata: ID ${useId} (distanza ${useDist.toFixed(3)} ≤ ${state.MATCH_THRESHOLD.toFixed(2)}).`;
      } else {
         detectionState = 'eluded';
         headline = `Nessuna corrispondenza sotto soglia ${state.MATCH_THRESHOLD.toFixed(2)}.`;
      }
   }

   const distLog = obfMinDist != null
      ? `distanza live: ${liveMinDist.toFixed(3)}; distanza post-makeup: ${obfMinDist.toFixed(3)}`
      : `distanza live: ${liveMinDist.toFixed(3)}`;
   setLog(`${headline} ${distLog}.`);

   ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
      detail: {
         detectionState,
         source: 'find',
         distance: obfMinDist != null ? obfMinDist : liveMinDist,
         matchedId: detectionState === 'matched' ? (obfMinDist != null ? obfMinId : liveMinId) : null,
         score: liveScore,
         obfuscatedScore: obfScore,
         liveMinDist,
         obfMinDist,
         weakDetection
      }
   }));
}

async function startCamera() {
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

async function loadModels() {
   setStatus('init', 'caricamento modelli');
   setLog('Caricamento modelli face-api.js in corso…');
   await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/tiny_face_detector'),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URLS.landmarks),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URLS.recognition),
      faceapi.nets.ageGenderNet.loadFromUri(MODEL_URLS.ageGender)
   ]);
}

function clearDb() {
   state.db = { nextId: 0, faces: [] };
   persistDb(state);
   ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
      detail: { detectionState: 'unknown', source: 'clear' }
   }));
   setLog('Archivio locale cancellato. Il contatore ID riparte da 0.');
   renderDbStats(state, els);
}

function handleError(err, fallbackMessage) {
   console.log('Errore:', fallbackMessage);
   console.error(err);
   setStatus('error', 'errore');
   els.placeholder.style.display = 'grid';
   const detail = err && err.message ? ` (${err.message})` : '';
   setLog(fallbackMessage + detail);
}

// Costruisce un canvas col compositing video + ghostyle 2D + plugin 3D (via evento)
// e ci esegue una detection face-api con landmarks + descriptor. Ritorna
// {canvas, obfuscatedResult, weakDetection}.
// Se la detection con la soglia normale fallisce (`scoreThreshold: 0.5`), ritenta
// con una rilassata (0.1) per estrarre comunque metriche numeriche dal composito —
// utile come "indicatore di efficacia" del makeup anche oltre la soglia di rilevamento.
// `weakDetection` segnala quando si è dovuto fare il fallback.
async function compositeAndDetect(liveResult) {
   const canvas = document.createElement('canvas');
   canvas.width = els.overlay.width;
   canvas.height = els.overlay.height;
   const ctx = canvas.getContext('2d');

   ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);

   const style = loadedGhostyles.get(state.activeEffect);
   if (style && style.module.onDraw) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const resized = faceapi.resizeResults(liveResult, { width: canvas.width, height: canvas.height });
      style.module.onDraw(ctx, resized.landmarks, resized.detection.box);
      ctx.restore();
   }

   ghostatiEvents.dispatchEvent(new CustomEvent('beforeEfficacyComposite', {
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

function hasActivePlugin() {
   if (state.activeEffect) return true;
   const get3d = window.Ghostati && window.Ghostati.getActiveEffect3d;
   return typeof get3d === 'function' && !!get3d();
}

async function testMakeupEfficacy() {
   const result = await detectCurrentFace(false);
   if (!result) {
      setLog('Nessun volto di base trovato. Avvicinati alla webcam.');
      return;
   }

   const { canvas, obfuscatedResult, weakDetection } = await compositeAndDetect(result);

   state.lastCompositedCanvas = canvas;
   els.copyMakeupBtn.disabled = false;

   setLog('Analisi in corso... sottopongo il compositing a face-api');

   const liveScore = result.detection.score;
   const liveMinDist = state.db.faces.length > 0
      ? Math.min(...state.db.faces.map(e => distance(result.descriptor, e.descriptor)))
      : null;
   const obfScore = obfuscatedResult ? obfuscatedResult.detection.score : null;
   const obfMinDist = obfuscatedResult && state.db.faces.length > 0
      ? Math.min(...state.db.faces.map(e => distance(obfuscatedResult.descriptor, e.descriptor)))
      : null;

   // Suffix metriche da appendere ai messaggi
   const distLog = (() => {
      if (state.db.faces.length === 0) {
         // Senza DB la metrica è self-vs-post (non ha senso "min DB")
         if (obfuscatedResult) {
            const selfDist = distance(result.descriptor, obfuscatedResult.descriptor);
            return `distanza self pre→post: ${selfDist.toFixed(3)}`;
         }
         return 'distanza self pre→post: post-makeup non rilevato';
      }
      return obfMinDist != null
         ? `distanza live: ${liveMinDist.toFixed(3)}; distanza post-makeup: ${obfMinDist.toFixed(3)}`
         : `distanza live: ${liveMinDist.toFixed(3)}`;
   })();

   // Decisione di stato analoga a findFace: weakDetection o detection totalmente fallita → eluso
   if (!obfuscatedResult) {
      let detectionState = state.db.faces.length === 0 ? 'unknown' : 'eluded';
      const headline = state.db.faces.length === 0
         ? `Risultato: NESSUN VOLTO INDIVIDUATO. Rilevatore ingannato! Salva un volto nel DB per testare il riconoscimento.`
         : `Risultato: ECCELLENTE. Il trucco ha frammentato il volto al punto da distruggere l'algoritmo di rilevamento.`;
      setLog(`${headline} ${distLog}.`);
      ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
         detail: {
            detectionState,
            source: 'efficacy',
            score: liveScore,
            obfuscatedScore: null,
            liveMinDist,
            obfMinDist: null,
            weakDetection: false
         }
      }));
      return;
   }

   if (weakDetection) {
      const detectionState = state.db.faces.length === 0 ? 'unknown' : 'eluded';
      setLog(`Risultato: BUONO. Detection sul composito forzata a confidenza bassa — face-api non vede chiaramente un volto. ${distLog}.`);
      ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
         detail: { detectionState, source: 'efficacy', score: liveScore, obfuscatedScore: obfScore, liveMinDist, obfMinDist, weakDetection: true }
      }));
      return;
   }

   if (state.db.faces.length === 0) {
      const dist = distance(result.descriptor, obfuscatedResult.descriptor);
      const detectionState = dist > state.MATCH_THRESHOLD ? 'eluded' : 'matched';
      const headline = dist > state.MATCH_THRESHOLD
         ? `Risultato: IDENTITÀ NASCOSTA. La tua impronta è irriconoscibile rispetto al volto base. Salva un volto nel DB per testare contro i salvataggi!`
         : `Risultato: INSUFFICIENTE. L'identità biometrica è ancora intatta.`;
      setLog(`${headline} distanza self pre→post: ${dist.toFixed(3)}.`);
      ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
         detail: { detectionState, source: 'efficacy', distance: dist, score: liveScore, obfuscatedScore: obfScore, liveMinDist: null, obfMinDist: null, weakDetection: false }
      }));
   } else {
      const detectionState = obfMinDist > state.MATCH_THRESHOLD ? 'eluded' : 'matched';
      const headline = obfMinDist > state.MATCH_THRESHOLD
         ? `Risultato: BUONO (Spoofed). Volto rilevato ma l'identità è irriconoscibile.`
         : `Risultato: INSUFFICIENTE. Il sistema ti riconosce ancora in archivio. Aggiungi geometrie.`;
      setLog(`${headline} ${distLog}.`);
      ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
         detail: { detectionState, source: 'efficacy', distance: obfMinDist, score: liveScore, obfuscatedScore: obfScore, liveMinDist, obfMinDist, weakDetection: false }
      }));
   }
}

async function init() {
   renderDbStats(state, els);
   updateEffectStats();
   resizeCanvas();
   window.addEventListener('resize', resizeCanvas);

   if (els.logBox) {
      els.logBox.addEventListener('click', () => {
         state.isLogExpanded = !state.isLogExpanded;
         updateLogDisplay();
      });
   }

   els.copyMakeupBtn.addEventListener('click', async () => {
      if (!state.lastCompositedCanvas) return;
      try {
         const exportCanvas = document.createElement('canvas');
         const headerHeight = 44;
         const footerHeight = 50;
         exportCanvas.width = state.lastCompositedCanvas.width;
         exportCanvas.height = state.lastCompositedCanvas.height + headerHeight + footerHeight;
         const ctx = exportCanvas.getContext('2d');

         ctx.fillStyle = '#0f1115';
         ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

         if (state.isMirrored) {
            ctx.save();
            ctx.translate(exportCanvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(state.lastCompositedCanvas, 0, headerHeight);
            ctx.restore();
         } else {
            ctx.drawImage(state.lastCompositedCanvas, 0, headerHeight);
         }

         ctx.fillStyle = '#eef2ff';
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';

         const style = loadedGhostyles.get(state.activeEffect);
         const pluginName = style ? style.name : 'Unknown Plugin';
         ctx.font = 'bold 14px Inter, sans-serif';
         ctx.fillText(`github.com/vecna/antagonistrucco | Modulo: ${pluginName} | URL: https://sindacato.nina.watch/ghostati/`, exportCanvas.width / 2, headerHeight / 2);

         const logText = els.logBox.lastChild ? els.logBox.lastChild.textContent : '';
         ctx.font = '14px Inter, sans-serif';
         if (logText.includes('ECCELLENTE') || logText.includes('BUONO')) ctx.fillStyle = '#3ddc97';
         else if (logText.includes('INSUFFICIENTE')) ctx.fillStyle = '#ff7a7a';
         else ctx.fillStyle = '#eef2ff';

         ctx.fillText(logText, exportCanvas.width / 2, exportCanvas.height - footerHeight / 2);

         exportCanvas.toBlob(blob => {
            const file = new File([blob], "ghostati-makeup.png", { type: "image/png" });
            const attemptShare = () => {
               if (navigator.share) {
                  navigator.share({
                     title: 'Ghostati Makeup',
                     text: 'Il mio camouflage anti-riconoscimento!',
                     files: [file]
                  }).then(() => setLog('Immagine condivisa con successo!'))
                     .catch(err => console.error('Share failed', err));
               } else {
                  setLog('Impossibile copiare l\'immagine (permessi mancanti o Share API non supportata).');
               }
            };

            if (navigator.clipboard && navigator.clipboard.write) {
               try {
                  navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                     .then(() => setLog('Immagine con referto diagnostico copiata negli appunti!'))
                     .catch(err => {
                        console.error('Clipboard write fallito, provo fallback', err);
                        attemptShare();
                     });
               } catch (err) {
                  console.error(err);
                  attemptShare();
               }
            } else {
               attemptShare();
            }
            if (state.nudgeStep === 5) { state.nudgeStep = 6; localStorage.setItem('ghostati-nudge-done', 'true'); updateNudging(); }
         });
      } catch (err) {
         console.error(err);
         setLog('Errore durante la copia. Forse manca il permesso nel browser?');
      }
   });

   els.scanBtn.addEventListener('click', async () => {
      setBusy(true);
      try {
         if (hasActivePlugin()) {
            if (state.nudgeStep === 4) { state.nudgeStep = 5; updateNudging(); }
            await testMakeupEfficacy();
            // Il trucco rimane bloccato sullo schermo, niente fadeout o clear
         } else {
            await scanFace();
         }
      }
      catch (err) { handleError(err, 'Errore durante la scansione o l\'analisi avversaria.'); }
      finally {
         setBusy(false);
         if (state.activeEffect) startEffectLoop();
      }
   });

   els.saveBtn.addEventListener('click', async () => {
      setBusy(true);
      try { await saveFace(); }
      catch (err) { handleError(err, 'Errore durante il salvataggio del volto.'); }
      finally {
         setBusy(false);
         if (state.activeEffect) startEffectLoop();
      }
   });

   els.findBtn.addEventListener('click', async () => {
      setBusy(true);
      try { await findFace(); }
      catch (err) { handleError(err, 'Errore durante la ricerca del volto.'); }
      finally {
         setBusy(false);
         if (state.activeEffect) startEffectLoop();
      }
   });

   els.clearDbBtn.addEventListener('click', () => {
      const svgIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
      if (els.clearDbBtn.textContent === 'Conferma azzeramento?') {
         clearDb();
         els.clearDbBtn.innerHTML = svgIcon;
      } else {
         els.clearDbBtn.textContent = 'Conferma azzeramento?';
         setTimeout(() => {
            if (els.clearDbBtn.textContent === 'Conferma azzeramento?') {
               els.clearDbBtn.innerHTML = svgIcon;
            }
         }, 4000);
      }
   });
   els.clearOverlayBtn.addEventListener('click', () => {
      if (state.activeEffect) deactivateEffect({ silent: true });
      clearOverlay();
      setLog('Overlay pulito.');
   });

   els.loadRemoteGhostyleBtn.addEventListener('click', async () => {
      const url = els.remoteGhostyleUrl.value.trim();
      if (url) {
         els.loadRemoteGhostyleBtn.disabled = true;
         await loadGhostyle(url);
         els.remoteGhostyleUrl.value = '';
         els.loadRemoteGhostyleBtn.disabled = false;
      }
   });

   setBusy(true);
   setLog('Caricamento plugin di makeup in corso...')
   try {
      await loadModels();

      const relurl = window.location.pathname.split('/').slice(0, -1).join('/')
      const ghostListUrl = relurl + '/ghostylist.json'
      const ghostylistRes = await fetch(ghostListUrl);
      if (ghostylistRes.ok) {
         const list = await ghostylistRes.json();
         for (const item of list) {
            let effectiveUrl = relurl + '/' + item.url;
            await loadGhostyle(effectiveUrl, item.name);
         }
      }
      else
         throw new Error(`HTTP ${ghostylistRes.status}`);
   } catch (err) {
      setLog('Errore durante la lettura di ghostylist.json: ' + err.message, 'Sistema');
      return;
   }

   setLog('Inizializzazione completata. Avvio webcam in corso...');
   try {
      await startCamera();
   } catch (err) {
      handleError(err, 'Impossibile inizializzare webcam: verifica i permessi camera per ' + window.location.origin);
      return;
   }

   setLog('Tutto pronto! Inizia scansionando il tuo volto o attivando una guida makeup.');
   setBusy(false);
   updateNudging();
   ghostatiEvents.dispatchEvent(new CustomEvent('ready', { detail: {} }));
}

init();