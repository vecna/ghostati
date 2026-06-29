/** @module main */
import { distance, avgPoint, lerp, scaleFrom, point, drawClosedPath, drawOpenPath, drawLabel, roundRect, expandEyePolygon, drawEyeWing, drawCheekSweep, drawContourBand, setLog, updateLogDisplay } from './utils.js';
import { state } from './state.js';
import { loadDb, loadDb3d, renderDbStats, clearDb } from './db.js';
import { saveFace, findFace, testMakeupEfficacy, hasActivePlugin, compositeAndDetect } from './engine.js';
import { loadMobileNet, saveFace3d, findFace3d, evaluateMatch3d, compositeAndDetect3d } from './engine-3d.js';
import { startCamera, resizeCanvas, startEffectLoop, recordOneSecond } from './camera.js';
import { MODEL_URLS, DETECTOR_OPTIONS } from './config.js';
import { els, setStatus, clearOverlay, addGhostyleBtn } from './dom.js';
import { fetchGhostyleMetadata, importGhostyleModule, toggleEffect } from './ghostyles-manager.js';
import { exportMakeup } from './export-makeup.js';

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
   getDb3d: () => structuredClone(state.db3d),
   getActiveEffect: () => state.activeEffect,
   getLastResult: () => state.lastKnownEffectResult,
   getMatchThreshold: () => state.MATCH_THRESHOLD,
   getMatchThreshold3d: () => state.MATCH_THRESHOLD_3D,
   get lastLandmarks3d() { return state.lastLandmarks3d; },
   set lastLandmarks3d(v) { state.lastLandmarks3d = v; },
   compositeAndDetect: (liveResult) => compositeAndDetect(liveResult),
   compositeAndDetect3d: () => compositeAndDetect3d(),
   detectorOptions: DETECTOR_OPTIONS
};

/**
 * Loads a Ghostyle plugin from a given URL.
 * Fetches its metadata, imports the module, runs its optional `onInit` hook, and registers
 * a UI button that toggles the effect.
 *
 * @param {string} url - The URL of the Ghostyle script.
 * @param {string} expectedName - Optional expected display name for logging.
 * @see init – called during application startup to load all Ghostyles from `ghostylist.json`.
 * @see fetchGhostyleMetadata – retrieves the plugin metadata.
 * @see importGhostyleModule – imports the actual Ghostyle module.
 */
async function loadGhostyle(url, expectedName) {
   let ghostyle = null;
   try {
      const moduleMetadata = await fetchGhostyleMetadata(url);
      ghostyle = await importGhostyleModule(moduleMetadata);

   } catch (err) {
      throw new Error(`Errore durante l'importazione del modulo: ${err.message}`);
   }

   if (ghostyle.module.onInit) {
      console.log(`Funzione di inizializzazione trovata in '${ghostyle.name}'`);
      try {

         const message = ghostyle.module.onInit();
         if (message) {
            setLog(`${ghostyle.name}: ${message}`);
         }
      } catch (err) {
         throw new Error(`Errore durante l'inizializzazione del modulo: ${err.message}`);
      }
   }

   /* add the changes in the DOM */
   const btn = addGhostyleBtn(ghostyle);
   btn.onclick = () => {
      toggleEffect(ghostyle.id, btn);
      startEffectLoop(state, els);
   }
   setLog(`Caricato con successo ghostyle ${expectedName} da ${url}`);
}


/**
 * Sets the busy flag for the whole UI, disabling/enabling controls during asynchronous operations.
 *
 * @param {boolean} isBusy - When true, UI controls are disabled to prevent concurrent actions.
 * @see init – called during startup to manage UI state while models load.
 * @see loadModels – UI is set busy while models are loading.
 * @see toggleEffect – disables controls while an effect is being applied.
 */
export function setBusy(isBusy) {
   state.isSystemBusy = isBusy;
   [els.copyMakeupBtn, els.saveBtn, els.findBtn, els.clearDbBtn, els.recordBtn].forEach(btn => {
      if (btn) {
         if (btn === els.copyMakeupBtn && !state.lastCompositedCanvas) btn.disabled = true;
         else if (btn === els.recordBtn && state.isRecording) btn.disabled = true;
         else btn.disabled = isBusy;
      }
   });
   const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
   previewBtns.forEach(btn => btn.disabled = isBusy);
}

/**
 * Loads all required face-api.js models for facial detection, landmarks, recognition, and age/gender.
 * This is called during application startup to ensure the models are cached before any webcam processing.
 *
 * @see init – the main initialization routine that invokes `loadModels` before starting the camera.
 * @see setStatus – updates UI status while models are being loaded.
 */
async function loadModels() {
   setStatus('init', 'caricamento modelli');
   await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URLS.tiny),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URLS.landmarks),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URLS.recognition),
      faceapi.nets.ageGenderNet.loadFromUri(MODEL_URLS.ageGender)
   ]);
}

/**
 * Centralized error handling for UI actions.
 * Logs the fallback message, the error details, updates the status UI, shows the placeholder, and records the full message in the log.
 *
 * @param {Error} err - The caught error object.
 * @param {string} fallbackMessage - User‑friendly message describing the context of the error.
 * @see init – uses handleError for camera initialization failures.
 * @see toggleEffect – uses handleError when scanning or applying effects fails.
 */
function handleError(err, fallbackMessage) {
   console.log('Errore:', fallbackMessage);
   console.error(err);
   setStatus('error', 'errore');
   els.placeholder.style.display = 'grid';
   const detail = err && err.message ? ` (${err.message})` : '';
   setLog(fallbackMessage + detail);
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified payload helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the `overall` field of a matchStateChanged payload.
 * @param {object|null} faceapiSection
 * @param {object|null} mediapipeSection
 * @returns {'matched'|'eluded'|'partial-elusion'|'unknown'}
 */
function computeOverall(faceapiSection, mediapipeSection) {
   if (!faceapiSection && !mediapipeSection) return 'unknown';
   const f = faceapiSection?.detectionState;
   const m = mediapipeSection?.detectionState;
   if (!f || !m) return 'unknown';
   if (f === m) return f; // both 'matched' or both 'eluded'
   return 'partial-elusion';
}

/**
 * Build the `faceapi` section from a findFace() result.
 * Returns null when the 2D DB was empty (result.detail === null).
 * @param {{ liveInfo, detail }} result2d
 * @returns {object|null}
 */
function buildFaceapiSection(result2d) {
   if (!result2d?.detail) return null;
   const { detail, liveInfo } = result2d;
   return {
      detectionState: detail.detectionState,
      distance:       detail.distance,
      matchedId:      detail.matchedId,
      liveMinDist:    liveInfo?.liveMinDist ?? null,
      liveMinId:      liveInfo?.liveMinId   ?? null,
      obfMinDist:     detail.obfMinDist     ?? null,
      obfMinId:       detail.obfMinId       ?? null,
   };
}

/**
 * Build the `faceapi` section for a save action.
 * After saving, the best match IS the saved face (dist ≈ 0), so we report
 * detectionState: 'matched' unconditionally.
 * @param {{ id, result }} saved2d
 * @returns {object}
 */
function buildFaceapiSaveSection(saved2d) {
   return {
      detectionState: 'matched',
      distance: 0,
      matchedId: saved2d.id,
      liveMinDist: 0,
      liveMinId: saved2d.id,
      obfMinDist: null,
      obfMinId: null,
   };
}

/**
 * Build the `mediapipe` section for a save action.
 * @param {{ id, liveInfo3d }} saved3d
 * @param {number} id
 * @returns {object}
 */
function buildMediapipeSaveSection(saved3d, id) {
   return {
      detectionState: 'matched',
      similarity: 1.0, // just saved — perfect self-match
      matchedId: id,
      liveMaxSim: saved3d.liveInfo3d?.liveMaxSim ?? 1.0,
      liveMaxId:  id,
      obfMaxSim: null,
      obfMaxId: null,
   };
}

/**
 * Initializes the application: loads the database, renders statistics, sets up the canvas,
 * registers UI event listeners, loads models, ghostyle plugins, and starts the webcam.
 * This is the entry point called at the end of the script.
 *
 * @see loadModels – called within init to load face-api.js models before webcam activation.
 * @see init(); – the function is invoked at the bottom of the script to start the app.
 */
async function init() {
   state.db   = loadDb();
   state.db3d = loadDb3d();
   renderDbStats(state, els);
   resizeCanvas(els);

   // Hide scanBtn: scanFace is deprecated; testMakeupEfficacy is accessible via
   // the plugin-active branch if needed in future, but the button is not shown.
   if (els.scanBtn) els.scanBtn.style.display = 'none';

   window.addEventListener('resize', function () {
      resizeCanvas(els);
   });

   if (els.logBox) {
      els.logBox.addEventListener('click', () => {
         state.isLogExpanded = !state.isLogExpanded;
         updateLogDisplay();
      });
   }

   els.copyMakeupBtn.addEventListener('click', exportMakeup);

   if (els.recordBtn) {
      els.recordBtn.addEventListener('click', recordOneSecond);
   }

   els.scanBtn.addEventListener('click', async () => {
      setBusy(true);
      try {
         if (hasActivePlugin(state)) {
            await testMakeupEfficacy(state, els);
            // Il trucco rimane bloccato sullo schermo, niente fadeout o clear
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
      try {
         // 1. 2D engine: detect + save; returns { id, result } or null
         const saved2d = await saveFace();
         if (!saved2d) return;
         const { id } = saved2d;

         // 2. 3D engine: extract MobileNet embedding + save under the same ID
         const saved3d = await saveFace3d(id);

         // 3. Build unified payload
         const faceapiSection = buildFaceapiSaveSection(saved2d);
         const mediapipeSection = saved3d
            ? buildMediapipeSaveSection(saved3d, id)
            : null;

         state.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
            detail: {
               source: 'save',
               ghostylePresent: false,
               faceapi: faceapiSection,
               mediapipe: mediapipeSection,
               overall: computeOverall(faceapiSection, mediapipeSection),
            }
         }));
      }
      catch (err) { handleError(err, 'Errore durante il salvataggio del volto.'); }
      finally {
         setBusy(false);
         if (state.activeEffect) startEffectLoop(state, els);
      }
   });

   els.findBtn.addEventListener('click', async () => {
      setBusy(true);
      try {
         if (state.db.faces.length === 0 && (!state.db3d || state.db3d.faces.length === 0)) {
            setLog('Archivio locale vuoto. Salva almeno un volto prima della ricerca.');
            return;
         }

         // 1. 2D engine pipeline
         const result2d = await findFace();
         if (!result2d) return; // no face detected (already logged)

         // 2. 3D engine pipeline
         const result3d = await findFace3d();

         // 3. Build sections
         const faceapiSection   = buildFaceapiSection(result2d);
         const mediapipeSection = evaluateMatch3d(result3d);

         const payload = {
            source: 'find',
            ghostylePresent: hasActivePlugin(),
            faceapi:    faceapiSection,
            mediapipe:  mediapipeSection,
            overall:    computeOverall(faceapiSection, mediapipeSection),
         };
         state.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', { detail: payload }));
      }
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

   setBusy(true);
   setLog('Caricamento sistema di riconoscimento facciale (face-api.js)...')
   try {
      await loadModels();
   } catch (err) {
      setLog('Errore durante il caricamento: ' + err.message);
      return;
   }

   setLog('Caricamento MobileNetV2 per il motore di riconoscimento 3D...');
   try {
      await loadMobileNet();
   } catch (err) {
      setLog('MobileNetV2 non disponibile: ' + err.message + ' — solo face-api attivo.');
   }

   setLog('Caricamento plugin di makeup in corso...')
   try {
      /* This is still supporting remote loading assuming it might be useful in the future,
       * but for now we load a static list of Ghostyles from ghostylist.json */
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
      setLog('Errore durante la lettura di ghostylist.json: ' + err.message);
   }

   setLog('Inizializzazione completata. Avvio webcam in corso...');
   try {
      await startCamera(state, els);
   } catch (err) {
      handleError(err, 'Impossibile inizializzare webcam: verifica i permessi camera per ' + window.location.origin);
      return;
   }

   /*
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
   */

   setLog('Tutto pronto! Inizia scansionando il tuo volto o attivando una guida makeup.');
   setBusy(false);
   state.ghostatiEvents.dispatchEvent(new CustomEvent('ready', { detail: {} }));

   // Questo evento segnala ai file con i loop, che l'ambiente è pronto, e troveranno
   // state, els, e window.Ghostati pronti.
   window.dispatchEvent(new CustomEvent('ghostatiReady'));
}

init();