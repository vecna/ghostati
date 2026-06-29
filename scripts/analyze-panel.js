/** @module analyze-panel */
import { els } from './dom.js';
import { state } from './state.js';
import { setLog } from './utils.js';
import { stopEffectLoop, startEffectLoop } from './camera.js';
import { runEffectPass, hasActivePlugin } from './engine.js';
import { getFaceEmbedding, cosineSimilarity } from './engine-3d.js';
import { ANALYZE_PANEL_MAX_WIDTH_DESKTOP, DETECTOR_OPTIONS } from './config.js';
import {
   ZONE_GROUPS,
   seekFaceInDb,
   decideMatchState,
   computeZoneDeltas,
   classifyZoneDelta,
   distanceToDiversity,
} from './landmark-analysis.js';

const EXPLAINERS = {
   age: 'Eta stimata dal modello - e solo una statistica, puo sbagliare di 5-10 anni.',
   gender: 'Genere predetto dal modello - addestrato su dataset con bias noti.',
   emotion: 'Emozione dominante tra quelle che il modello distingue: happy, sad, angry, fearful, disgusted, surprised, neutral.',
   confidence: 'Quanto il rilevatore e sicuro di vedere un volto nello snapshot. Sotto 50% spesso non viene rilevato nulla.',
   distanceClosest: 'Quanto il tuo volto attuale e diverso dal volto base salvato con questo ID. Piu la percentuale e alta, meno il sistema riesce a riconoscerti.',
   threshold: 'Sopra questa percentuale di diversita il sistema non ti riconosce piu. Sotto, si.',
   zones: 'Per ogni parte del volto, di quanto e diversa rispetto al volto base salvato (allineato per compensare posa e dimensione della testa). Le zone rosse sono dove il tuo trucco sta lavorando di piu.',
   embedder: 'Il motore 3D usa una scala diversa (cosine similarity, 0-1, piu alto = piu simile).',
};

const ZONE_COLORS = {
   stable: 'rgba(61, 220, 151, 0.75)',
   medium: 'rgba(255, 200, 100, 0.75)',
   shifted: 'rgba(255, 122, 122, 0.85)',
};

let modalEls = null;
let activeSnapshot = null;
let latestReportData = null;
let isOpen = false;
let escHandler = null;

function ensureModalEls() {
   if (modalEls) return modalEls;
   modalEls = {
      root: document.getElementById('analyzeModal'),
      backdrop: document.getElementById('analyzeBackdrop'),
      panel: document.getElementById('analyzePanel'),
      canvas: document.getElementById('analyzeCanvas'),
      info: document.getElementById('analyzeInfo'),
      copyBtn: document.getElementById('analyzeCopyBtn'),
      closeBtn: document.getElementById('analyzeCloseBtn'),
   };
   return modalEls;
}

function getDominantEmotion(expressions) {
   if (!expressions) return null;
   let key = null;
   let best = -Infinity;
   for (const [k, v] of Object.entries(expressions)) {
      if (v > best) {
         key = k;
         best = v;
      }
   }
   return key;
}

function pct(score) {
   if (!Number.isFinite(score)) return '-';
   return `${Math.round(score * 100)}%`;
}

function fixed3(v) {
   if (!Number.isFinite(v)) return '-';
   return v.toFixed(3);
}

function clearCanvas() {
   const ui = ensureModalEls();
   const ctx = ui.canvas.getContext('2d');
   ctx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
}

function drawSnapshotToPanelCanvas(snapshotCanvas) {
   const ui = ensureModalEls();
   ui.canvas.width = snapshotCanvas.width;
   ui.canvas.height = snapshotCanvas.height;
   const ctx = ui.canvas.getContext('2d');
   ctx.drawImage(snapshotCanvas, 0, 0, ui.canvas.width, ui.canvas.height);
}

function groupPointIndices(name) {
   const spec = ZONE_GROUPS[name];
   const out = [];
   for (let i = spec.start; i <= spec.end; i += 1) out.push(i);
   return out;
}

function drawLandmarksOverlay(landmarks, zoneStates = null) {
   const ui = ensureModalEls();
   if (!landmarks || !landmarks.positions || landmarks.positions.length < 68) return;
   const ctx = ui.canvas.getContext('2d');

   for (const groupName of Object.keys(ZONE_GROUPS)) {
      const points = groupPointIndices(groupName).map((i) => landmarks.positions[i]);
      const klass = zoneStates?.[groupName]?.classification || 'stable';
      const color = zoneStates ? (ZONE_COLORS[klass] || ZONE_COLORS.stable) : 'rgba(200, 220, 255, 0.75)';

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
         ctx.lineTo(points[i].x, points[i].y);
      }
      if (groupName === 'leftEye' || groupName === 'rightEye' || groupName === 'mouth') {
         ctx.closePath();
      }
      ctx.stroke();

      for (const p of points) {
         ctx.beginPath();
         ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
         ctx.fill();
      }
   }
}

function buildZones(zoneDeltas) {
   if (!zoneDeltas) return null;
   const out = {};
   for (const groupName of Object.keys(ZONE_GROUPS)) {
      const delta = zoneDeltas[groupName] || 0;
      const classification = classifyZoneDelta(delta);
      out[groupName] = {
         delta,
         classification,
         color: ZONE_COLORS[classification],
         label: ZONE_GROUPS[groupName].label,
      };
   }
   return out;
}

function computeEmbedderStats(embedding, closestId) {
   if (!embedding || !state.db3d || !Array.isArray(state.db3d.faces) || state.db3d.faces.length === 0) {
      return { bestId: null, bestSimilarity: null, closestIdSimilarity: null };
   }

   let bestId = null;
   let bestSimilarity = -Infinity;
   for (const rec of state.db3d.faces) {
      const sim = cosineSimilarity(embedding, rec.descriptor3d);
      if (sim > bestSimilarity) {
         bestSimilarity = sim;
         bestId = rec.id;
      }
   }

   let closestIdSimilarity = null;
   if (typeof closestId === 'number') {
      const sameId = state.db3d.faces.find((f) => f.id === closestId);
      if (sameId) closestIdSimilarity = cosineSimilarity(embedding, sameId.descriptor3d);
   }

   return {
      bestId,
      bestSimilarity: Number.isFinite(bestSimilarity) ? bestSimilarity : null,
      closestIdSimilarity,
   };
}

function computeZoneSummary(zoneStates) {
   if (!zoneStates) return null;
   const entries = Object.entries(zoneStates).sort((a, b) => b[1].delta - a[1].delta);
   const top2 = entries.slice(0, 2).map(([, v]) => v.label);
   const bottom2 = entries.slice(-2).reverse().map(([, v]) => v.label);
   return {
      most: top2,
      least: bottom2,
      sentence: `Il tuo trucco modifica di piu: ${top2.join(', ')}. Modifica di meno: ${bottom2.join(', ')}.`,
   };
}

function snapshotFromVideo() {
   const canvas = document.createElement('canvas');
   canvas.width = els.video.videoWidth || 1280;
   canvas.height = els.video.videoHeight || 720;
   const ctx = canvas.getContext('2d');
   ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);
   return canvas;
}

function panelStateFromAnalysis(analysis) {
   const closestDiversity = Number.isFinite(analysis.closestDistance)
      ? distanceToDiversity(analysis.closestDistance)
      : null;
   const thresholdDiversity = distanceToDiversity(state.MATCH_THRESHOLD);

   return {
      ...analysis,
      closestDiversity,
      thresholdDiversity,
      zoneSummary: computeZoneSummary(analysis.zoneStates),
   };
}

function renderInfo(analysis) {
   const ui = ensureModalEls();
   const hasFace = !!analysis.faceResult;

   if (!hasFace) {
      ui.info.innerHTML = `
         <section class="analyze-section">
            <h3>Volto rilevato</h3>
            <p class="analyze-empty">Nessun volto rilevato nello snapshot.</p>
         </section>
         <section class="analyze-section">
            <h3>Riconoscimento</h3>
            <p>${analysis.matchHeadline || 'Nessun dato di riconoscimento disponibile.'}</p>
         </section>
      `;
      return;
   }

   const zoneRows = analysis.zoneStates
      ? Object.entries(analysis.zoneStates).map(([name, z]) => `
         <div class="analyze-zone-row">
            <span class="analyze-zone-left"><span class="analyze-dot" style="background:${z.color}"></span>${ZONE_GROUPS[name].label}</span>
            <span class="analyze-zone-mid">${z.classification}</span>
            <span class="analyze-zone-val">(${fixed3(z.delta)})</span>
         </div>
      `).join('')
      : '<p class="analyze-empty">Salva un volto base per vedere l\'analisi delle zone.</p>';

   const closestLine = typeof analysis.closestId === 'number'
      ? `ID ${analysis.closestId}`
      : 'Nessun ID trovato';
   const diversityLine = analysis.closestDiversity != null
      ? `${analysis.closestDiversity}%`
      : '-';

   const section3dId = typeof analysis.closestId === 'number' ? analysis.closestId : analysis.embedderBestId;
   const section3dValue = Number.isFinite(analysis.embedderClosestSimilarity)
      ? analysis.embedderClosestSimilarity
      : analysis.embedderBestSimilarity;

   ui.info.innerHTML = `
      <section class="analyze-section">
         <h3>Volto rilevato</h3>
         <div class="analyze-metric"><strong>Eta stimata:</strong> ${Math.round(analysis.faceResult.age || 0)}</div>
         <p>${EXPLAINERS.age}</p>
         <div class="analyze-metric"><strong>Genere predetto:</strong> ${analysis.faceResult.gender || '-'}</div>
         <p>${EXPLAINERS.gender}</p>
         <div class="analyze-metric"><strong>Emozione dominante:</strong> ${analysis.dominantEmotion || '-'}</div>
         <p>${EXPLAINERS.emotion}</p>
         <div class="analyze-metric"><strong>Confidence detection:</strong> ${pct(analysis.faceResult.detection?.score)}</div>
         <p>${EXPLAINERS.confidence}</p>
      </section>

      <section class="analyze-section">
         <h3>Riconoscimento</h3>
         <div class="analyze-metric"><strong>Stato:</strong> ${analysis.matchHeadline || '-'}</div>
         <div class="analyze-metric"><strong>Match con ID:</strong> ${closestLine}</div>
         <div class="analyze-metric"><strong>Diversita dal volto base:</strong> ${diversityLine}</div>
         <p>${EXPLAINERS.distanceClosest}</p>
         <div class="analyze-metric"><strong>Soglia di riconoscimento:</strong> ${analysis.thresholdDiversity}%</div>
         <p>${EXPLAINERS.threshold}</p>
         <div class="analyze-metric"><strong>Interpretazione:</strong> il tuo volto attuale e ${diversityLine} diverso dal volto base ${typeof analysis.closestId === 'number' ? `ID ${analysis.closestId}` : ''}; sopra ${analysis.thresholdDiversity}% di diversita il sistema non ti riconosce.</div>
         <div class="analyze-metric"><strong>Embedder 3D:</strong> similarity con ${section3dId != null ? `ID ${section3dId}` : 'closest match'}: ${Number.isFinite(section3dValue) ? section3dValue.toFixed(3) : '-'}</div>
         <p>${EXPLAINERS.embedder}</p>
      </section>

      <section class="analyze-section">
         <h3>Analisi del trucco per zona</h3>
         <p>${EXPLAINERS.zones}</p>
         <div class="analyze-zones">${zoneRows}</div>
         ${analysis.zoneSummary ? `<p class="analyze-summary">${analysis.zoneSummary.sentence}</p>` : ''}
      </section>
   `;
}

function wireModalEvents() {
   const ui = ensureModalEls();
   ui.copyBtn.onclick = async () => {
      const text = generateReportText();
      try {
         await navigator.clipboard.writeText(text);
         setLog('Report copiato negli appunti');
      } catch {
         setLog('Impossibile copiare il report negli appunti');
      }
   };

   ui.closeBtn.onclick = () => closeAnalyzePanel();
   ui.backdrop.onclick = (ev) => {
      if (ev.target === ui.backdrop) closeAnalyzePanel();
   };
}

function showModal(snapshot) {
   const ui = ensureModalEls();
   const dataUrl = snapshot.toDataURL('image/png');
   ui.backdrop.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url('${dataUrl}')`;
   ui.panel.style.maxWidth = `${ANALYZE_PANEL_MAX_WIDTH_DESKTOP}px`;
   ui.root.hidden = false;
   requestAnimationFrame(() => ui.root.classList.add('open'));
   isOpen = true;

   escHandler = (ev) => {
      if (ev.key === 'Escape') closeAnalyzePanel();
   };
   window.addEventListener('keydown', escHandler);
}

async function detectOnSnapshot(snapshotCanvas) {
   if (!faceapi || !faceapi.detectSingleFace) return null;
   try {
      return await faceapi
         .detectSingleFace(snapshotCanvas, DETECTOR_OPTIONS)
         .withFaceLandmarks()
         .withFaceDescriptor()
         .withAgeAndGender()
         .withFaceExpressions();
   } catch (err) {
      setLog(`[ERRORE analyze] ${err.message || String(err)}`);
      return null;
   }
}

function findBaseRecordById(id) {
   return state.db?.faces?.find((f) => f.id === id) || null;
}

function composeAnalysisData(snapshot, faceResult, embedding) {
   const dbHasFaces = !!(state.db && Array.isArray(state.db.faces) && state.db.faces.length > 0);
   const dominantEmotion = faceResult ? getDominantEmotion(faceResult.expressions) : null;

   let closestId = null;
   let closestDistance = null;
   let matchHeadline = null;
   let zoneStates = null;

   if (!faceResult) {
      if (hasActivePlugin()) {
         matchHeadline = decideMatchState({
            liveMinDist: null,
            liveMinId: null,
            obfMinDist: null,
            obfMinId: null,
            weakDetection: false,
            detectionTotallyFailed: true,
         }).headline;
      }
   } else if (dbHasFaces) {
      const nearest = seekFaceInDb(faceResult);
      closestId = nearest.liveMinId;
      closestDistance = nearest.liveMinDist;
      matchHeadline = decideMatchState({
         liveMinDist: nearest.liveMinDist,
         liveMinId: nearest.liveMinId,
         obfMinDist: null,
         obfMinId: null,
         weakDetection: false,
         detectionTotallyFailed: false,
      }).headline;

      const baseRecord = findBaseRecordById(closestId);
      const baseLandmarks = baseRecord?.landmarks;
      if (Array.isArray(baseLandmarks) && baseLandmarks.length === 68) {
         const zoneDeltas = computeZoneDeltas(faceResult.landmarks.positions, baseLandmarks);
         zoneStates = buildZones(zoneDeltas);
      }
   }

   const embedderStats = computeEmbedderStats(embedding, closestId);

   return panelStateFromAnalysis({
      snapshot,
      faceResult,
      dominantEmotion,
      dbHasFaces,
      closestId,
      closestDistance,
      matchHeadline,
      zoneStates,
      embedderBestId: embedderStats.bestId,
      embedderBestSimilarity: embedderStats.bestSimilarity,
      embedderClosestSimilarity: embedderStats.closestIdSimilarity,
   });
}

export async function openAnalyzePanel() {
   const ui = ensureModalEls();
   if (!ui.root) return;

   wireModalEvents();
   stopEffectLoop();

   activeSnapshot = snapshotFromVideo();
   showModal(activeSnapshot);
   drawSnapshotToPanelCanvas(activeSnapshot);

   const [faceResult, embedding] = await Promise.all([
      detectOnSnapshot(activeSnapshot),
      getFaceEmbedding(activeSnapshot).catch(() => null),
   ]);

   latestReportData = composeAnalysisData(activeSnapshot, faceResult, embedding);

   if (faceResult) {
      drawLandmarksOverlay(faceResult.landmarks, latestReportData.zoneStates);
   } else {
      clearCanvas();
      drawSnapshotToPanelCanvas(activeSnapshot);
   }

   renderInfo(latestReportData);
}

export function closeAnalyzePanel() {
   const ui = ensureModalEls();
   if (!ui.root || !isOpen) return;

   ui.root.classList.remove('open');
   window.setTimeout(() => {
      ui.root.hidden = true;
   }, 150);

   isOpen = false;
   if (escHandler) {
      window.removeEventListener('keydown', escHandler);
      escHandler = null;
   }

   startEffectLoop();
   runEffectPass();
}

export function generateReportText() {
   const data = latestReportData;
   if (!data) {
      return [
         'Ghostati - Analisi del trucco',
         '-----------------------------',
         'Volto rilevato: no',
         '',
         'Riconoscimento (face-api 2D)',
         'Nessun dato disponibile.',
      ].join('\n');
   }

   const lines = [];
   lines.push('Ghostati - Analisi del trucco');
   lines.push('-----------------------------');
   lines.push(`Volto rilevato: ${data.faceResult ? 'si' : 'no'}`);

   if (data.faceResult) {
      lines.push(`Eta stimata: ${Math.round(data.faceResult.age || 0)}`);
      lines.push(`Genere predetto: ${data.faceResult.gender || '-'}`);
      lines.push(`Emozione dominante: ${data.dominantEmotion || '-'}`);
      lines.push(`Confidence detection: ${pct(data.faceResult.detection?.score)}`);
   }

   lines.push('');
   lines.push('Riconoscimento (face-api 2D)');
   if (!data.faceResult) {
      lines.push('Nessun volto rilevato nello snapshot.');
   } else if (!data.dbHasFaces) {
      lines.push('Salva un volto base per vedere l\'analisi delle zone.');
   } else {
      lines.push(`Match con ID: ${data.closestId ?? '-'}`);
      lines.push(`Diversita dal volto base: ${data.closestDiversity != null ? `${data.closestDiversity}%` : '-'}`);
      lines.push(`Soglia di riconoscimento: ${data.thresholdDiversity}%`);
      lines.push(`Stato: ${data.matchHeadline || '-'}`);
   }

   lines.push('');
   lines.push('Analisi per zona (allineata)');
   if (!data.zoneStates) {
      lines.push('Sezione non disponibile.');
   } else {
      for (const groupName of Object.keys(ZONE_GROUPS)) {
         const row = data.zoneStates[groupName];
         lines.push(`${ZONE_GROUPS[groupName].label}: ${row.classification} (${fixed3(row.delta)})`);
      }
      if (data.zoneSummary) {
         lines.push('');
         lines.push(`Trucco piu efficace su: ${data.zoneSummary.most.join(', ')}`);
         lines.push(`Trucco meno efficace su: ${data.zoneSummary.least.join(', ')}`);
      }
   }

   lines.push('');
   lines.push('Embedder 3D (MediaPipe)');
   if (Number.isFinite(data.embedderClosestSimilarity) && typeof data.closestId === 'number') {
      lines.push(`Cosine similarity con ID ${data.closestId}: ${data.embedderClosestSimilarity.toFixed(3)}`);
   } else if (Number.isFinite(data.embedderBestSimilarity)) {
      lines.push(`Cosine similarity con ID ${data.embedderBestId}: ${data.embedderBestSimilarity.toFixed(3)}`);
   } else {
      lines.push('Nessun dato embedding disponibile.');
   }

   return lines.join('\n');
}

export function _renderForTests(snapshot, faceapiResult, extra = {}) {
   latestReportData = panelStateFromAnalysis({
      snapshot,
      faceResult: faceapiResult,
      dominantEmotion: faceapiResult ? getDominantEmotion(faceapiResult.expressions) : null,
      dbHasFaces: !!extra.dbHasFaces,
      closestId: extra.closestId ?? null,
      closestDistance: extra.closestDistance ?? null,
      matchHeadline: extra.matchHeadline || null,
      zoneStates: extra.zoneStates || null,
      embedderBestId: extra.embedderBestId ?? null,
      embedderBestSimilarity: extra.embedderBestSimilarity ?? null,
      embedderClosestSimilarity: extra.embedderClosestSimilarity ?? null,
   });
   return latestReportData;
}
