import { WebcamSource, createMirrorController } from './webcam.js';
import { FileSource, createPhaseController, formatBytes, startMemoryMonitor } from './video.js';

const faceapi = window.faceapi;

if (!faceapi) {
  throw new Error('face-api.js non disponibile.');
}

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
  fpsSelect: document.getElementById('fpsSelect'),
  videoSourceIndicator: document.getElementById('videoSourceIndicator'),
  srcWebcamBtn: document.getElementById('srcWebcamBtn'),
  srcFileInput: document.getElementById('srcFileInput'),
  fileInfoBox: document.getElementById('fileInfoBox'),
  fileSizeLabel: document.getElementById('fileSizeLabel'),
  memoryLabel: document.getElementById('memoryLabel'),
  phaseTransitionBox: document.getElementById('phaseTransitionBox'),
  phaseStartBtn: document.getElementById('phaseStartBtn'),
  phaseStopBtn: document.getElementById('phaseStopBtn'),
  workflowSourceBadge: document.getElementById('workflowSourceBadge'),
  workflowPhaseBadge: document.getElementById('workflowPhaseBadge'),
  workflowHintTitle: document.getElementById('workflowHintTitle'),
  workflowHintText: document.getElementById('workflowHintText'),
  workflowWebcamCard: document.getElementById('workflowWebcamCard'),
  workflowFileCard: document.getElementById('workflowFileCard')
};

let overlayFadeTimeout = null;
let db = loadDb();
let activeEffect = null;
let effectLoopHandle = null;
let effectLoopUsesVideoFrames = false;
let effectInferenceInFlight = false;
let lastEffectRun = 0;
let isSystemBusy = false;
let lastKnownEffectResult = null;
let lastCompositedCanvas = null;
let phaseController = null;

const stopMemoryMonitor = startMemoryMonitor(els.memoryLabel);

createMirrorController({
  buttonEl: els.mirrorToggle,
  videoEl: els.video,
  overlayEl: els.overlay
});

function triggerOverlayFadeout() {
  els.overlay.style.transition = 'none';
  els.overlay.style.opacity = '1';
  void els.overlay.offsetHeight;
  els.overlay.style.transition = 'opacity 2s ease-in-out';

  if (overlayFadeTimeout) clearTimeout(overlayFadeTimeout);
  overlayFadeTimeout = setTimeout(() => {
    els.overlay.style.opacity = '0';
  }, 5000);
}

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

function updateWorkflowGuide(source = null, phase = null) {
  const sourceKind = source && source.kind ? source.kind : null;
  const phaseKey = phase ? phase.toLowerCase() : 'idle';

  els.workflowSourceBadge.textContent = sourceKind === 'webcam'
    ? 'webcam'
    : sourceKind === 'file'
      ? 'file locale'
      : 'nessuna sorgente';

  els.workflowPhaseBadge.textContent = phaseKey === 'selection'
    ? 'selezione'
    : phaseKey === 'overlay'
      ? 'overlay'
      : 'in attesa';

  els.workflowPhaseBadge.classList.toggle('is-selection', phaseKey === 'selection');
  els.workflowPhaseBadge.classList.toggle('is-overlay', phaseKey === 'overlay');

  els.workflowWebcamCard.classList.toggle('is-active', sourceKind === 'webcam');
  els.workflowFileCard.classList.toggle('is-active', sourceKind === 'file');
  els.workflowWebcamCard.classList.toggle('is-dimmed', Boolean(sourceKind) && sourceKind !== 'webcam');
  els.workflowFileCard.classList.toggle('is-dimmed', Boolean(sourceKind) && sourceKind !== 'file');

  if (!sourceKind) {
    els.workflowHintTitle.textContent = 'Seleziona da dove partire';
    els.workflowHintText.textContent = 'Con la webcam puoi iniziare subito. Con un file locale puoi prima scorrere il video, scegliere il punto utile e poi attivare l\'overlay.';
    return;
  }

  if (sourceKind === 'webcam' && phaseKey === 'selection') {
    els.workflowHintTitle.textContent = 'Webcam pronta per il feed live';
    els.workflowHintText.textContent = 'Puoi usare subito mirror, scansione, salvataggio e ricerca. Se attivi un Ghostyle, l\'overlay seguirà il volto in diretta.';
    return;
  }

  if (sourceKind === 'webcam' && phaseKey === 'overlay') {
    els.workflowHintTitle.textContent = 'Overlay attivo sulla webcam';
    els.workflowHintText.textContent = 'Il rendering AR è in tempo reale sul feed live. Le azioni diagnostiche lavorano direttamente sull\'inquadratura corrente.';
    return;
  }

  if (sourceKind === 'file' && phaseKey === 'selection') {
    els.workflowHintTitle.textContent = 'File caricato, fase di selezione';
    els.workflowHintText.textContent = 'Usa i controlli nativi del video per scegliere il frame o il punto di partenza. Quando sei pronto, premi AVVIA OVERLAY.';
    return;
  }

  els.workflowHintTitle.textContent = 'Overlay attivo sul file locale';
  els.workflowHintText.textContent = 'Il video è in riproduzione con tracking attivo. Se devi cambiare punto o clip, ferma l\'overlay e torna alla selezione.';
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
    if (btn === els.copyMakeupBtn && !lastCompositedCanvas) {
      btn.disabled = true;
      return;
    }

    btn.disabled = isBusy;
  });

  const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
  previewBtns.forEach(btn => {
    btn.disabled = isBusy;
  });
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
    const delta = a[i] - b[i];
    sum += delta * delta;
  }

  return Math.sqrt(sum);
}

function avgPoint(points) {
  const total = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
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
  const topBrow = eyebrow.map((browPoint, index) => {
    const eyeRef = eye[Math.min(index + 1, eye.length - 1)] || eye[eye.length - 1];
    return lerp(eyeRef, browPoint, eyebrowLift);
  });
  const expandedEye = eye.map(eyePoint => scaleFrom(center, eyePoint, scale));
  return [...topBrow, expandedEye[3], expandedEye[4], expandedEye[5], expandedEye[0]];
}

function drawEyeWing(ctx, eye, eyebrow, label, tone) {
  const eyeShape = expandEyePolygon(eye, eyebrow, tone.scale, tone.brow);
  drawClosedPath(ctx, eyeShape, tone.fill, tone.stroke, 2.2);

  const outerCorner = tone.side === 'left'
    ? eye.reduce((best, eyePoint) => (eyePoint.x < best.x ? eyePoint : best), eye[0])
    : eye.reduce((best, eyePoint) => (eyePoint.x > best.x ? eyePoint : best), eye[0]);
  const tailTop = point(outerCorner.x + tone.tailX, outerCorner.y - tone.tailY);
  const tailLow = point(outerCorner.x + tone.tailX * 0.7, outerCorner.y + tone.tailY * 0.12);

  drawClosedPath(ctx, [outerCorner, tailTop, tailLow], tone.fill, tone.stroke, 2.2);

  const sorted = [...eye].sort((a, b) => a.x - b.x);
  const linePoints = tone.side === 'left'
    ? [sorted[2], sorted[1], sorted[0], tailTop]
    : [sorted[sorted.length - 3], sorted[sorted.length - 2], sorted[sorted.length - 1], tailTop];

  drawOpenPath(ctx, linePoints, tone.line, 3.2);
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

function resolveGhostyleUrl(url) {
  return new URL(url, window.location.href).href;
}

async function loadGhostyle(url, expectedName = null) {
  const resolvedUrl = resolveGhostyleUrl(url);
  const id = resolvedUrl.split('/').pop().replace('.js', '');

  try {
    setLog(`Caricamento ghostyle da ${resolvedUrl}...`);

    const response = await fetch(resolvedUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    const matchName = text.match(/@name\s+(.+)/);
    const name = matchName ? matchName[1].trim() : (expectedName || id);
    const module = await import(resolvedUrl);

    loadedGhostyles.set(id, { id, name, module, url: resolvedUrl });

    const button = document.createElement('button');
    button.className = 'preview-btn';
    button.textContent = name;
    button.dataset.effect = id;
    button.onclick = () => toggleEffect(id, button);

    els.ghostylesContainer.appendChild(button);
    setLog(`Ghostyle '${name}' pronto all'uso.`);

    if (module.onInit) {
      module.onInit();
    }
  } catch (err) {
    console.error(err);

    const button = document.createElement('button');
    button.className = 'preview-btn';
    button.textContent = expectedName || id;
    button.disabled = true;
    button.classList.add('preview-btn-error');
    button.title = `Errore di caricamento: ${err.message}`;

    els.ghostylesContainer.appendChild(button);
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
  [leftCenter, rightCenter, avgPoint(nose.slice(3)), avgPoint(mouth.slice(0, 7))].forEach(marker => {
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 3.4, 0, Math.PI * 2);
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
    setLog('Nessun volto rilevato nella sorgente attiva.');
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

function scheduleEffectLoop() {
  if ('requestVideoFrameCallback' in els.video && phaseController && phaseController.source && phaseController.source.kind === 'file') {
    effectLoopUsesVideoFrames = true;
    effectLoopHandle = els.video.requestVideoFrameCallback(effectLoop);
    return;
  }

  effectLoopUsesVideoFrames = false;
  effectLoopHandle = requestAnimationFrame(effectLoop);
}

function effectLoop(now) {
  if (!activeEffect || !phaseController || phaseController.phase !== 'OVERLAY') {
    effectLoopHandle = null;
    effectLoopUsesVideoFrames = false;
    return;
  }

  const currentDelay = parseInt(els.fpsSelect.value, 10) || 120;
  const timestamp = typeof now === 'number' ? now : performance.now();

  if (timestamp - lastEffectRun > currentDelay) {
    lastEffectRun = timestamp;
    runEffectPass();
  }

  scheduleEffectLoop();
}

function startEffectLoop() {
  if (effectLoopHandle) stopEffectLoop();
  scheduleEffectLoop();
}

function stopEffectLoop() {
  if (effectLoopHandle) {
    if (effectLoopUsesVideoFrames && els.video.cancelVideoFrameCallback) {
      els.video.cancelVideoFrameCallback(effectLoopHandle);
    } else {
      cancelAnimationFrame(effectLoopHandle);
    }
  }

  effectLoopHandle = null;
  effectLoopUsesVideoFrames = false;
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
  els.scanBtn.classList.remove('is-effect-active');

  updateEffectStats();
  lastKnownEffectResult = null;
  lastCompositedCanvas = null;
  els.copyMakeupBtn.disabled = true;
  clearOverlay();

  if (!silent) {
    setLog('Guida makeup disattivata. Sorgente video ripristinata senza overlay.');
  }
}

function toggleEffect(effect, button) {
  if (activeEffect === effect) {
    deactivateEffect();
    return;
  }

  if (activeEffect) {
    deactivateEffect({ silent: true });
  }

  activeEffect = effect;
  const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
  previewBtns.forEach(previewBtn => previewBtn.classList.toggle('active', previewBtn === button));
  els.previewImage.style.display = 'none';
  els.previewImage.removeAttribute('src');
  updateEffectStats();

  const style = loadedGhostyles.get(effect);
  setLog(`Guida makeup attiva: ${style ? style.name : effect}. Cerca un volto nel feed attivo per vedere dove applicarlo.`);

  els.scanBtn.textContent = 'Scansiona trucco';
  els.scanBtn.classList.add('is-effect-active');

  if (overlayFadeTimeout) clearTimeout(overlayFadeTimeout);
  els.overlay.style.transition = 'none';
  els.overlay.style.opacity = '1';

  if (phaseController && phaseController.phase === 'OVERLAY') {
    startEffectLoop();
  }
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

  const summary = matches.map(match => `${match.id} (${match.distance.toFixed(3)})`).join(', ');
  setLog(`Corrispondenze trovate: ${summary}.`);
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
  console.error(err);
  setStatus('error', 'errore');
  els.placeholder.style.display = 'grid';
  const detail = err && err.message ? ` (${err.message})` : '';
  setLog(fallbackMessage + detail);
}

async function testMakeupEfficacy() {
  const result = await detectCurrentFace(false);
  if (!result) {
    setLog('Nessun volto di base trovato nella sorgente attiva.');
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

  phaseController = createPhaseController({
    els,
    resizeCanvas,
    stopEffectLoop,
    startEffectLoop,
    hasActiveEffect: () => Boolean(activeEffect),
    setLog,
    onStateChange: ({ source, phase }) => updateWorkflowGuide(source, phase)
  });

  updateWorkflowGuide();

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('beforeunload', stopMemoryMonitor);

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
      } else {
        await scanFace();
      }
    } catch (err) {
      handleError(err, 'Errore durante la scansione o l\'analisi avversaria.');
    } finally {
      setBusy(false);
      if (activeEffect && phaseController && phaseController.phase === 'OVERLAY') startEffectLoop();
    }
  });

  els.saveBtn.addEventListener('click', async () => {
    setBusy(true);
    try {
      await saveFace();
    } catch (err) {
      handleError(err, 'Errore durante il salvataggio del volto.');
    } finally {
      setBusy(false);
      if (activeEffect && phaseController && phaseController.phase === 'OVERLAY') startEffectLoop();
    }
  });

  els.findBtn.addEventListener('click', async () => {
    setBusy(true);
    try {
      await findFace();
    } catch (err) {
      handleError(err, 'Errore durante la ricerca del volto.');
    } finally {
      setBusy(false);
      if (activeEffect && phaseController && phaseController.phase === 'OVERLAY') startEffectLoop();
    }
  });

  els.clearDbBtn.addEventListener('click', () => {
    if (els.clearDbBtn.textContent === 'Conferma azzeramento?') {
      clearDb();
      els.clearDbBtn.textContent = 'Azzera archivio locale';
      return;
    }

    els.clearDbBtn.textContent = 'Conferma azzeramento?';
    setTimeout(() => {
      if (els.clearDbBtn.textContent === 'Conferma azzeramento?') {
        els.clearDbBtn.textContent = 'Azzera archivio locale';
      }
    }, 4000);
  });

  els.clearOverlayBtn.addEventListener('click', () => {
    if (activeEffect) deactivateEffect({ silent: true });
    clearOverlay();
    setLog('Overlay pulito.');
  });

  els.loadRemoteGhostyleBtn.addEventListener('click', async () => {
    const url = els.remoteGhostyleUrl.value.trim();
    if (!url) return;

    els.loadRemoteGhostyleBtn.disabled = true;
    await loadGhostyle(url);
    els.remoteGhostyleUrl.value = '';
    els.loadRemoteGhostyleBtn.disabled = false;
  });

  els.srcWebcamBtn.addEventListener('click', async () => {
    els.fileInfoBox.style.display = 'none';
    try {
      await phaseController.enterSelection(new WebcamSource());
    } catch (err) {
      handleError(err, 'Impossibile accedere alla webcam.');
    }
  });

  els.srcFileInput.addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;

    els.fileInfoBox.style.display = 'block';
    els.fileSizeLabel.textContent = `File in uso: ${file.name} (${formatBytes(file.size)})`;

    try {
      await phaseController.enterSelection(new FileSource(file));
    } catch (err) {
      handleError(err, `Errore nel caricamento del file video: ${err.message}`);
    }

    els.srcFileInput.value = '';
  });

  els.phaseStartBtn.addEventListener('click', () => {
    phaseController.enterOverlay();
  });

  els.phaseStopBtn.addEventListener('click', () => {
    if (phaseController.source) {
      phaseController.enterSelection(phaseController.source);
    }
  });

  setBusy(true);
  try {
    await loadModels();
    setStatus('init', 'In attesa sorgente');
    setLog('Modelli pronti. Seleziona la webcam o carica un file per iniziare.');

    try {
      const ghostylistRes = await fetch('ghostylist.json');
      if (ghostylistRes.ok) {
        const list = await ghostylistRes.json();
        for (const item of list) {
          await loadGhostyle(item.url, item.name);
        }
      } else {
        setLog('File ghostylist.json non trovato, caricamento plugin saltato.', 'Sistema');
      }
    } catch (err) {
      setLog(`Errore durante la lettura di ghostylist.json: ${err.message}`, 'Sistema');
    }
  } catch (err) {
    handleError(err, 'Impossibile inizializzare i modelli.');
    return;
  } finally {
    setBusy(false);
  }
}

init();