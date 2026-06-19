import { distance, computeMatchState, avgPoint, lerp, scaleFrom, point, drawClosedPath, drawOpenPath, drawLabel, roundRect, expandEyePolygon, drawEyeWing, drawCheekSweep, drawContourBand, setLog } from './utils.js';
import { state } from './state.js';
import { loadDb, renderDbStats, clearDb } from './db.js';
import { scanFace, saveFace, findFace, testMakeupEfficacy, hasActivePlugin, compositeAndDetect } from './engine.js';
import { startCamera, resizeCanvas, startEffectLoop, triggerOverlayFadeout } from './camera.js';

const MODEL_URLS = {
   tiny: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights',
   landmarks: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_landmark_68',
   recognition: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/face_recognition',
   ageGender: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js-models@master/age_gender_model'
};

export const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
   inputSize: 416,
   scoreThreshold: 0.5
});

export const els = {
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
         await startCamera(state, els);
      } catch (err) {
         handleError(err, 'Errore nel cambio fotocamera.');
      }
   });
}

function updateEffectStats() {
   const style = state.loadedGhostyles.get(state.activeEffect);
   els.effectName.textContent = style ? style.name : 'nessuno';
   els.effectTracking.textContent = state.activeEffect ? 'on' : 'off';
}


export function setStatus(kind, text) {
   els.statusDot.className = 'status-dot';
   if (kind === 'live') els.statusDot.classList.add('live');
   if (kind === 'error') els.statusDot.classList.add('error');
   els.statusText.textContent = text;
}

export function setBusy(isBusy) {
   state.isSystemBusy = isBusy;
   [els.scanBtn, els.copyMakeupBtn, els.saveBtn, els.findBtn, els.clearDbBtn, els.clearOverlayBtn, els.loadRemoteGhostyleBtn].forEach(btn => {
      if (btn === els.copyMakeupBtn && !state.lastCompositedCanvas) btn.disabled = true;
      else btn.disabled = isBusy;
   });
   const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
   previewBtns.forEach(btn => btn.disabled = isBusy);
}



export function clearOverlay() {
   const ctx = els.overlay.getContext('2d');
   ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
   els.overlay.style.transition = 'none';
   els.overlay.style.opacity = '1';
   if (state.overlayFadeTimeout) clearTimeout(state.overlayFadeTimeout);
}

export function updateNudging() {
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
   events: state.ghostatiEvents,
   getDb: () => structuredClone(state.db),
   getActiveEffect: () => state.activeEffect,
   getLastResult: () => state.lastKnownEffectResult,
   getMatchThreshold: () => state.MATCH_THRESHOLD,
   _computeMatchState: (descriptor) => computeMatchState(state, descriptor),
   _compositeAndDetect: (liveResult) => compositeAndDetect(state, liveResult),
   detectorOptions: DETECTOR_OPTIONS
};

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
         state.loadedGhostyles.set(id, { id, name, module, url });

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



function deactivateEffect({ silent = false } = {}) {
   const previousEffect = state.activeEffect;
   if (state.activeEffect) {
      const style = state.loadedGhostyles.get(state.activeEffect);
      if (style && style.module.onClear) {
         style.module.onClear(els.overlay.getContext('2d'));
      }
   }
   state.activeEffect = null;
   if (previousEffect) {
      state.ghostatiEvents.dispatchEvent(new CustomEvent('effectChanged', {
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
   state.ghostatiEvents.dispatchEvent(new CustomEvent('effectChanged', {
      detail: { activeEffect: effect, previous: previousEffect }
   }));
   const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
   previewBtns.forEach(btn => btn.classList.toggle('active', btn === button));
   els.previewImage.style.display = 'none';
   els.previewImage.removeAttribute('src');
   updateEffectStats();

   console.log('Loading Ghostyles', effect);
   const style = state.loadedGhostyles.get(effect);
   setLog(`Guida makeup attiva: ${style ? style.name : effect}. Cerca un volto nella webcam per vedere dove applicarlo.`);

   els.scanBtn.style.background = 'linear-gradient(180deg, rgba(159, 122, 234, 0.35), rgba(159, 122, 234, 0.15))';
   els.scanBtn.style.borderColor = 'rgba(159, 122, 234, 0.5)';
   els.scanBtn.style.color = '#fff';

   if (state.nudgeStep === 3) { state.nudgeStep = 4; updateNudging(); }

   if (state.overlayFadeTimeout) clearTimeout(state.overlayFadeTimeout);
   els.overlay.style.transition = 'none';
   els.overlay.style.opacity = '1';

   startEffectLoop(state, els);
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

function handleError(err, fallbackMessage) {
   console.log('Errore:', fallbackMessage);
   console.error(err);
   setStatus('error', 'errore');
   els.placeholder.style.display = 'grid';
   const detail = err && err.message ? ` (${err.message})` : '';
   setLog(fallbackMessage + detail);
}

async function init() {
   state.db = loadDb();
   renderDbStats(state, els);
   updateEffectStats();
   resizeCanvas(els);

   window.addEventListener('resize', function () {
      resizeCanvas(els);
   });

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

         const style = state.loadedGhostyles.get(state.activeEffect);
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
         if (hasActivePlugin(state)) {
            if (state.nudgeStep === 4) { state.nudgeStep = 5; updateNudging(); }
            await testMakeupEfficacy(state, els);
            // Il trucco rimane bloccato sullo schermo, niente fadeout o clear
         } else {
            await scanFace(state, els);
         }
      }
      catch (err) { handleError(err, 'Errore durante la scansione o l\'analisi avversaria.'); }
      finally {
         setBusy(false);
         if (state.activeEffect) startEffectLoop(state, els);
      }
   });

   els.saveBtn.addEventListener('click', async () => {
      setBusy(true);
      try { await saveFace(state, els); }
      catch (err) { handleError(err, 'Errore durante il salvataggio del volto.'); }
      finally {
         setBusy(false);
         if (state.activeEffect) startEffectLoop(state, els);
      }
   });

   els.findBtn.addEventListener('click', async () => {
      setBusy(true);
      try { await findFace(state, els); }
      catch (err) { handleError(err, 'Errore durante la ricerca del volto.'); }
      finally {
         setBusy(false);
         if (state.activeEffect) startEffectLoop(state, els);
      }
   });

   els.clearDbBtn.addEventListener('click', () => {
      const svgIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
      if (els.clearDbBtn.textContent === 'Conferma?') {
         clearDb(state, els);
         els.clearDbBtn.innerHTML = svgIcon;
      } else {
         els.clearDbBtn.textContent = 'Conferma?';
         setTimeout(() => {
            if (els.clearDbBtn.textContent === 'Conferma?') {
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
      await startCamera(state, els);
   } catch (err) {
      handleError(err, 'Impossibile inizializzare webcam: verifica i permessi camera per ' + window.location.origin);
      return;
   }

   // DEBUG: intercetta tutti gli errori non catturati nei listener
   window.addEventListener('unhandledrejection', e => {
      console.error('[unhandledrejection]', e.reason);
   });

   // DEBUG: log di tutti gli eventi del bus
   const _origDispatch = state.ghostatiEvents.dispatchEvent.bind(state.ghostatiEvents);
   state.ghostatiEvents.dispatchEvent = function (event) {
      if (!(event.type === "landmarks3d" ||
         event.type === "detection" ||
         event.type === "matchStateChanged"))
         console.debug(`[event:${event.type}]`, event.detail);
      return _origDispatch(event);
   };

   setLog('Tutto pronto! Inizia scansionando il tuo volto o attivando una guida makeup.');
   setBusy(false);
   updateNudging();
   state.ghostatiEvents.dispatchEvent(new CustomEvent('ready', { detail: {} }));
}

init();