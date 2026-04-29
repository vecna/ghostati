const MODEL_URLS = {
   tiny: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights',
   landmarks: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_landmark_68',
   recognition: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_recognition',
   ageGender: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/age_gender_model'
};

const STORAGE_KEY = 'local-face-lab-db-v1';
const MATCH_THRESHOLD = 0.58;
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
   mirrorToggle: document.getElementById('mirrorToggle'),
   fpsSelect: document.getElementById('fpsSelect')
};

let overlayFadeTimeout = null;
function triggerOverlayFadeout() {
   els.overlay.style.transition = 'none';
   els.overlay.style.opacity = '1';
   void els.overlay.offsetHeight; // force reflow
   els.overlay.style.transition = 'opacity 2s ease-in-out';

   if (overlayFadeTimeout) clearTimeout(overlayFadeTimeout);
   overlayFadeTimeout = setTimeout(() => {
      els.overlay.style.opacity = '0';
   }, 5000);
}

let isMirrored = false;
// Mirror toggle logic
els.mirrorToggle.addEventListener('click', () => {
   isMirrored = !isMirrored;
   els.video.style.transform = isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
   els.overlay.style.transform = isMirrored ? 'scaleX(-1)' : 'scaleX(1)';
   els.mirrorToggle.classList.toggle('mirrored', isMirrored);
   els.mirrorToggle.textContent = isMirrored ? 'Webcam speculare: ON' : 'Mirror webcam';
});
// Initialize mirror state on load
els.video.style.transform = 'scaleX(1)';
els.overlay.style.transform = 'scaleX(1)';

let db = loadDb();
let activeEffect = null;
let effectLoopHandle = null;
let effectInferenceInFlight = false;
let lastEffectRun = 0;
let isSystemBusy = false;
let lastKnownEffectResult = null;
let lastCompositedCanvas = null;

function loadDb() {
   try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { nextId: 0, faces: [] };
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.faces) || typeof parsed.nextId !== 'number') {
         return { nextId: 0, faces: [] };
      }
      return parsed;
   } catch {
      return { nextId: 0, faces: [] };
   }
}

function persistDb() {
   localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
   renderDbStats();
}

function renderDbStats() {
   els.dbCount.textContent = String(db.faces.length);
   els.nextId.textContent = String(db.nextId);
   els.thresholdLabel.textContent = MATCH_THRESHOLD.toFixed(2);
}

function updateEffectStats() {
   const style = loadedGhostyles.get(activeEffect);
   els.effectName.textContent = style ? style.name : 'nessuno';
   els.effectTracking.textContent = activeEffect ? 'on' : 'off';
}

function setLog(message, sourcePlugin = null) {
   const line = document.createElement('div');
   line.className = 'log-line';

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

   els.logBox.insertBefore(line, els.logBox.firstChild);

   while (els.logBox.children.length > 5) {
      els.logBox.removeChild(els.logBox.lastChild);
   }
}

function setStatus(kind, text) {
   els.statusDot.className = 'status-dot';
   if (kind === 'live') els.statusDot.classList.add('live');
   if (kind === 'error') els.statusDot.classList.add('error');
   els.statusText.textContent = text;
}

function setBusy(isBusy) {
   isSystemBusy = isBusy;
   [els.scanBtn, els.copyMakeupBtn, els.saveBtn, els.findBtn, els.clearDbBtn, els.clearOverlayBtn, els.loadRemoteGhostyleBtn].forEach(btn => {
      if (btn === els.copyMakeupBtn && !lastCompositedCanvas) btn.disabled = true;
      else btn.disabled = isBusy;
   });
   const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
   previewBtns.forEach(btn => btn.disabled = isBusy);
}

function resizeCanvas() {
   const rect = els.viewer.getBoundingClientRect();
   els.overlay.width = Math.max(1, Math.floor(rect.width));
   els.overlay.height = Math.max(1, Math.floor(rect.height));
}

function clearOverlay() {
   const ctx = els.overlay.getContext('2d');
   ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
   els.overlay.style.transition = 'none';
   els.overlay.style.opacity = '1';
   if (overlayFadeTimeout) clearTimeout(overlayFadeTimeout);
}

function distance(a, b) {
   if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
   let sum = 0;
   for (let i = 0; i < a.length; i += 1) {
      const d = a[i] - b[i];
      sum += d * d;
   }
   return Math.sqrt(sum);
}

function avgPoint(points) {
   const total = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
   return { x: total.x / points.length, y: total.y / points.length };
}

function lerp(a, b, t) {
   return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function scaleFrom(center, point, scale) {
   return { x: center.x + (point.x - center.x) * scale, y: center.y + (point.y - center.y) * scale };
}

function point(x, y) {
   return { x, y };
}

function drawClosedPath(ctx, points, fillStyle = null, strokeStyle = null, lineWidth = 2) {
   if (!points.length) return;
   ctx.beginPath();
   ctx.moveTo(points[0].x, points[0].y);
   for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
   ctx.closePath();
   if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
   }
   if (strokeStyle) {
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeStyle;
      ctx.stroke();
   }
}

function drawOpenPath(ctx, points, strokeStyle, lineWidth = 2, dashed = false) {
   if (!points.length) return;
   ctx.save();
   ctx.beginPath();
   ctx.moveTo(points[0].x, points[0].y);
   for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
   ctx.lineWidth = lineWidth;
   ctx.strokeStyle = strokeStyle;
   if (dashed) ctx.setLineDash([10, 8]);
   ctx.stroke();
   ctx.restore();
}

function drawLabel(ctx, text, x, y) {
   ctx.save();
   ctx.font = '700 14px Inter, system-ui, sans-serif';
   const padX = 10;
   const padY = 7;
   const width = ctx.measureText(text).width + padX * 2;
   const height = 30;
   ctx.fillStyle = 'rgba(15, 17, 21, 0.78)';
   ctx.strokeStyle = 'rgba(255,255,255,0.10)';
   ctx.lineWidth = 1;
   roundRect(ctx, x, y - height, width, height, 12);
   ctx.fill();
   ctx.stroke();
   ctx.fillStyle = 'rgba(238, 242, 255, 0.96)';
   ctx.fillText(text, x + padX, y - 10);
   ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
   ctx.beginPath();
   ctx.moveTo(x + r, y);
   ctx.arcTo(x + w, y, x + w, y + h, r);
   ctx.arcTo(x + w, y + h, x, y + h, r);
   ctx.arcTo(x, y + h, x, y, r);
   ctx.arcTo(x, y, x + w, y, r);
   ctx.closePath();
}

function expandEyePolygon(eye, eyebrow, scale = 1.22, eyebrowLift = 0.72) {
   const center = avgPoint(eye);
   const topBrow = eyebrow.map((b, idx) => {
      const eyeRef = eye[Math.min(idx + 1, eye.length - 1)] || eye[eye.length - 1];
      return lerp(eyeRef, b, eyebrowLift);
   });
   const expandedEye = eye.map(pt => scaleFrom(center, pt, scale));
   return [...topBrow, expandedEye[3], expandedEye[4], expandedEye[5], expandedEye[0]];
}

function drawEyeWing(ctx, eye, eyebrow, label, tone) {
   const eyeShape = expandEyePolygon(eye, eyebrow, tone.scale, tone.brow);
   drawClosedPath(ctx, eyeShape, tone.fill, tone.stroke, 2.2);
   const outerCorner = tone.side === 'left'
      ? eye.reduce((best, p) => (p.x < best.x ? p : best), eye[0])
      : eye.reduce((best, p) => (p.x > best.x ? p : best), eye[0]);
   const tailTop = point(outerCorner.x + tone.tailX, outerCorner.y - tone.tailY);
   const tailLow = point(outerCorner.x + tone.tailX * 0.7, outerCorner.y + tone.tailY * 0.12);
   drawClosedPath(ctx, [outerCorner, tailTop, tailLow], tone.fill, tone.stroke, 2.2);
   const sorted = [...eye].sort((a, b) => a.x - b.x);
   const linePts = tone.side === 'left' ? [sorted[2], sorted[1], sorted[0], tailTop] : [sorted[sorted.length - 3], sorted[sorted.length - 2], sorted[sorted.length - 1], tailTop];
   drawOpenPath(ctx, linePts, tone.line, 3.2);
   drawLabel(ctx, label, tailTop.x + (tone.side === 'left' ? -52 : 10), tailTop.y - 10);
}

function drawCheekSweep(ctx, anchor, noseSide, mouthCorner, jawPoint, label, fill, stroke) {
   const upper = lerp(anchor, noseSide, 0.42);
   const lower = lerp(mouthCorner, jawPoint, 0.36);
   const side = lerp(anchor, jawPoint, 0.54);
   const cheek = [
      upper,
      lerp(anchor, side, 0.45),
      side,
      lower,
      lerp(lower, mouthCorner, 0.55),
      lerp(mouthCorner, noseSide, 0.42)
   ];
   drawClosedPath(ctx, cheek, fill, stroke, 1.8);
   drawLabel(ctx, label, side.x - 20, side.y - 12);
}

function drawContourBand(ctx, pts, label) {
   drawOpenPath(ctx, pts, 'rgba(193, 154, 107, 0.95)', 7, true);
   drawOpenPath(ctx, pts, 'rgba(90, 54, 33, 0.22)', 16);
   const mid = pts[Math.floor(pts.length / 2)];
   drawLabel(ctx, label, mid.x + 10, mid.y - 6);
}

window.Ghostati = {
   log: (message, sourcePlugin) => setLog(message, sourcePlugin),
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
   drawContourBand
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
   new faceapi.draw.DrawTextField(lines, { x: box.x, y: Math.max(16, box.y - 8) }).draw(els.overlay);
   ctx.restore();
}

function drawEffectOverlay(result, includeDetectionScaffold = false) {
   resizeCanvas();
   const ctx = els.overlay.getContext('2d');
   ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
   const resized = faceapi.resizeResults(result, { width: els.overlay.width, height: els.overlay.height });
   if (includeDetectionScaffold) drawDetectionScaffold(ctx, resized);
   if (activeEffect) {
      const style = loadedGhostyles.get(activeEffect);
      if (style && style.module.onDraw) {
         ctx.save();
         ctx.lineCap = 'round';
         ctx.lineJoin = 'round';
         style.module.onDraw(ctx, resized.landmarks, resized.detection.box);
         ctx.restore();
      }
   }
   lastKnownEffectResult = result;
}

async function detectCurrentFace(drawOverlay = true) {
   clearOverlay();
   const result = await faceapi.detectSingleFace(els.video, DETECTOR_OPTIONS)
      .withFaceLandmarks()
      .withAgeAndGender()
      .withFaceDescriptor();

   if (!result) {
      lastKnownEffectResult = null;
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
   if (activeEffect) {
      const style = loadedGhostyles.get(activeEffect);
      if (style && style.module.onDraw) {
         ctx.save();
         ctx.lineCap = 'round';
         ctx.lineJoin = 'round';
         style.module.onDraw(ctx, resized.landmarks, resized.detection.box);
         ctx.restore();
      }
   }
   lastKnownEffectResult = result;
}

async function runEffectPass() {
   if (!activeEffect || isSystemBusy || effectInferenceInFlight || els.video.readyState < 2) return;
   effectInferenceInFlight = true;
   try {
      const result = await faceapi.detectSingleFace(els.video, DETECTOR_OPTIONS).withFaceLandmarks();
      if (!result) {
         lastKnownEffectResult = null;
         clearOverlay();
         return;
      }
      drawEffectOverlay(result, false);
   } catch (err) {
      console.error(err);
   } finally {
      effectInferenceInFlight = false;
   }
}

function effectLoop(ts = 0) {
   if (!activeEffect) {
      effectLoopHandle = null;
      return;
   }
   const currentDelay = parseInt(els.fpsSelect.value, 10) || 120;
   if (ts - lastEffectRun > currentDelay) {
      lastEffectRun = ts;
      runEffectPass();
   }
   effectLoopHandle = requestAnimationFrame(effectLoop);
}

function startEffectLoop() {
   if (effectLoopHandle) cancelAnimationFrame(effectLoopHandle);
   effectLoopHandle = requestAnimationFrame(effectLoop);
}

function stopEffectLoop() {
   if (effectLoopHandle) cancelAnimationFrame(effectLoopHandle);
   effectLoopHandle = null;
   effectInferenceInFlight = false;
}

function deactivateEffect({ silent = false } = {}) {
   if (activeEffect) {
      const style = loadedGhostyles.get(activeEffect);
      if (style && style.module.onClear) {
         style.module.onClear(els.overlay.getContext('2d'));
      }
   }
   activeEffect = null;
   stopEffectLoop();
   const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
   previewBtns.forEach(btn => btn.classList.remove('active'));
   els.scanBtn.textContent = 'Scansiona faccia';
   els.scanBtn.style.background = '';
   els.scanBtn.style.borderColor = '';
   els.scanBtn.style.color = '';

   updateEffectStats();
   lastKnownEffectResult = null;
   lastCompositedCanvas = null;
   els.copyMakeupBtn.disabled = true;
   clearOverlay();
   if (!silent) setLog('Guida makeup disattivata. Webcam ripristinata senza overlay.');
}

function toggleEffect(effect, button) {
   if (activeEffect === effect) {
      deactivateEffect();
      return;
   }

   if (activeEffect) {
      const styleId = activeEffect;
      deactivateEffect({ silent: true });
      // wait for complete removal then continue
   }

   activeEffect = effect;
   const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
   previewBtns.forEach(btn => btn.classList.toggle('active', btn === button));
   els.previewImage.style.display = 'none';
   els.previewImage.removeAttribute('src');
   updateEffectStats();

   const style = loadedGhostyles.get(effect);
   setLog(`Guida makeup attiva: ${style ? style.name : effect}. Cerca un volto nella webcam per vedere dove applicarlo.`);

   els.scanBtn.textContent = 'Scansiona trucco';
   els.scanBtn.style.background = 'linear-gradient(180deg, rgba(159, 122, 234, 0.35), rgba(159, 122, 234, 0.15))';
   els.scanBtn.style.borderColor = 'rgba(159, 122, 234, 0.5)';
   els.scanBtn.style.color = '#fff';

   if (overlayFadeTimeout) clearTimeout(overlayFadeTimeout);
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
   setLog(`Volto trovato. Età stimata: ${age}. Genere stimato: ${gender}${confidence}. Overlay biometrico aggiornato.`);
}

async function saveFace() {
   const result = await detectCurrentFace(true);
   if (!result) return;
   triggerOverlayFadeout();
   const id = db.nextId;
   db.nextId += 1;
   db.faces.push({
      id,
      descriptor: Array.from(result.descriptor),
      age: Math.round(result.age),
      gender: result.gender || null,
      savedAt: new Date().toISOString()
   });
   persistDb();
   setLog(`Impronta biometrica salvata con ID ${id}. Archivio locale aggiornato.`);
}

async function findFace() {
   if (db.faces.length === 0) {
      setLog('Archivio locale vuoto. Salva almeno un volto prima della ricerca.');
      clearOverlay();
      return;
   }

   const result = await detectCurrentFace(true);
   if (!result) return;
   triggerOverlayFadeout();

   const matches = db.faces
      .map(entry => ({ id: entry.id, distance: distance(result.descriptor, entry.descriptor) }))
      .filter(entry => entry.distance <= MATCH_THRESHOLD)
      .sort((a, b) => a.distance - b.distance);

   if (!matches.length) {
      setLog(`Nessuna corrispondenza trovata sotto soglia ${MATCH_THRESHOLD.toFixed(2)}.`);
      return;
   }

   const summary = matches.map(m => `${m.id} (${m.distance.toFixed(3)})`).join(', ');
   setLog(`Corrispondenze trovate: ${summary}.`);
}

async function startCamera() {
   const stream = await navigator.mediaDevices.getUserMedia({
      video: {
         width: { ideal: 1920 },
         height: { ideal: 1080 },
         facingMode: 'user'
      },
      audio: false
   });
   els.video.srcObject = stream;
   await new Promise(resolve => {
      els.video.onloadedmetadata = () => resolve();
   });
   await els.video.play();
   els.placeholder.style.display = 'none';
   setStatus('live', 'webcam attiva');
   setLog('Webcam attiva. Premi “Scansiona faccia” o attiva una guida makeup AR dalla colonna destra.');
   resizeCanvas();
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
   db = { nextId: 0, faces: [] };
   persistDb();
   setLog('Archivio locale cancellato. Il contatore ID riparte da 0.');
}

function handleError(err, fallbackMessage) {
   console.log('Errore:', fallbackMessage);
   console.error(err);
   setStatus('error', 'errore');
   els.placeholder.style.display = 'grid';
   const detail = err && err.message ? ` (${err.message})` : '';
   setLog(fallbackMessage + detail);
}

async function testMakeupEfficacy() {
   const result = await detectCurrentFace(false);
   if (!result) {
      setLog('Nessun volto di base trovato. Avvicinati alla webcam.');
      return;
   }

   const canvas = document.createElement('canvas');
   canvas.width = els.overlay.width;
   canvas.height = els.overlay.height;
   const ctx = canvas.getContext('2d');

   ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);

   const style = loadedGhostyles.get(activeEffect);
   if (style && style.module.onDraw) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const resized = faceapi.resizeResults(result, { width: canvas.width, height: canvas.height });
      style.module.onDraw(ctx, resized.landmarks, resized.detection.box);
      ctx.restore();
   }

   lastCompositedCanvas = canvas;
   els.copyMakeupBtn.disabled = false;

   setLog('Analisi in corso... sottopongo il compositing a face-api');

   const obfuscatedResult = await faceapi.detectSingleFace(canvas, DETECTOR_OPTIONS)
      .withFaceLandmarks()
      .withFaceDescriptor();

   if (!obfuscatedResult) {
      setLog('Risultato: ECCELLENTE. Il trucco ha frammentato il volto al punto da distruggere l\'algoritmo (nessun volto rilevato).');
      return;
   }

   const dist = distance(result.descriptor, obfuscatedResult.descriptor);
   if (dist > MATCH_THRESHOLD) {
      setLog(`Risultato: BUONO (Spoofed). Volto individuato, ma l'identità biometrica è irriconoscibile (distanza: ${dist.toFixed(3)}).`);
   } else {
      setLog(`Risultato: INSUFFICIENTE. Il sistema ti riconosce ancora perfettamente (distanza: ${dist.toFixed(3)} <= ${MATCH_THRESHOLD.toFixed(2)}). Aggiungi geometrie.`);
   }
}

async function init() {
   renderDbStats();
   updateEffectStats();
   resizeCanvas();
   window.addEventListener('resize', resizeCanvas);

   els.copyMakeupBtn.addEventListener('click', async () => {
      if (!lastCompositedCanvas) return;
      try {
         const exportCanvas = document.createElement('canvas');
         const headerHeight = 44;
         const footerHeight = 50;
         exportCanvas.width = lastCompositedCanvas.width;
         exportCanvas.height = lastCompositedCanvas.height + headerHeight + footerHeight;
         const ctx = exportCanvas.getContext('2d');

         ctx.fillStyle = '#0f1115';
         ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

         ctx.drawImage(lastCompositedCanvas, 0, headerHeight);

         ctx.fillStyle = '#eef2ff';
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';

         const style = loadedGhostyles.get(activeEffect);
         const pluginName = style ? style.name : 'Unknown Plugin';
         ctx.font = 'bold 14px Inter, sans-serif';
         ctx.fillText(`github.com/vecna/antagonistrucco | Modulo attivo: ${pluginName}`, exportCanvas.width / 2, headerHeight / 2);

         const logText = els.logBox.firstChild ? els.logBox.firstChild.textContent : '';
         ctx.font = '14px Inter, sans-serif';
         ctx.fillStyle = '#3ddc97'; // default verde o bianco, usiamo un bianco leggero
         if (logText.includes('ECCELLENTE') || logText.includes('BUONO')) ctx.fillStyle = '#3ddc97';
         else if (logText.includes('INSUFFICIENTE')) ctx.fillStyle = '#ff7a7a';
         else ctx.fillStyle = '#eef2ff';

         ctx.fillText(logText, exportCanvas.width / 2, exportCanvas.height - footerHeight / 2);

         exportCanvas.toBlob(blob => {
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
               setLog('Immagine con referto diagnostico copiata negli appunti!');
            });
         });
      } catch (err) {
         console.error(err);
         setLog('Errore durante la copia. Forse manca il permesso nel browser?');
      }
   });

   els.scanBtn.addEventListener('click', async () => {
      setBusy(true);
      try {
         if (activeEffect) {
            await testMakeupEfficacy();
            // Il trucco rimane bloccato sullo schermo, niente fadeout o clear
         } else {
            await scanFace();
         }
      }
      catch (err) { handleError(err, 'Errore durante la scansione o l\'analisi avversaria.'); }
      finally {
         setBusy(false);
         if (activeEffect) startEffectLoop();
      }
   });

   els.saveBtn.addEventListener('click', async () => {
      setBusy(true);
      try { await saveFace(); }
      catch (err) { handleError(err, 'Errore durante il salvataggio del volto.'); }
      finally {
         setBusy(false);
         if (activeEffect) startEffectLoop();
      }
   });

   els.findBtn.addEventListener('click', async () => {
      setBusy(true);
      try { await findFace(); }
      catch (err) { handleError(err, 'Errore durante la ricerca del volto.'); }
      finally {
         setBusy(false);
         if (activeEffect) startEffectLoop();
      }
   });

   els.clearDbBtn.addEventListener('click', () => {
      if (els.clearDbBtn.textContent === 'Conferma azzeramento?') {
         clearDb();
         els.clearDbBtn.textContent = 'Azzera archivio locale';
      } else {
         els.clearDbBtn.textContent = 'Conferma azzeramento?';
         setTimeout(() => {
            if (els.clearDbBtn.textContent === 'Conferma azzeramento?') {
               els.clearDbBtn.textContent = 'Azzera archivio locale';
            }
         }, 4000);
      }
   });
   els.clearOverlayBtn.addEventListener('click', () => {
      if (activeEffect) deactivateEffect({ silent: true });
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

}

init();