/** @module main */
import { distance, computeMatchState, avgPoint, lerp, scaleFrom, point, drawClosedPath, drawOpenPath, drawLabel, roundRect, expandEyePolygon, drawEyeWing, drawCheekSweep, drawContourBand, setLog, updateLogDisplay } from './utils.js';
import { state } from './state.js';
import { loadDb, renderDbStats, clearDb } from './db.js';
import { scanFace, saveFace, findFace, testMakeupEfficacy, hasActivePlugin, compositeAndDetect } from './engine.js';
import { startCamera, resizeCanvas, startEffectLoop } from './camera.js';
import { MODEL_URLS, DETECTOR_OPTIONS } from './config.js';
import { els, setStatus, clearOverlay, addGhostyleBtn } from './dom.js';
import { fetchGhostyleMetadata, importGhostyleModule, toggleEffect } from './ghostyles-manager.js';

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
   getActiveEffect: () => state.activeEffect,
   getLastResult: () => state.lastKnownEffectResult,
   getMatchThreshold: () => state.MATCH_THRESHOLD,
   computeMatchState: (descriptor) => computeMatchState(descriptor),
   compositeAndDetect: (liveResult) => compositeAndDetect(liveResult),
   detectorOptions: DETECTOR_OPTIONS
};

/* This function is used to load a Ghostyle plugin from a given URL, and optionally check for an expected name.
* It fetches the metadata, imports the module, and calls its onInit function if present. */
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


export function setBusy(isBusy) {
   state.isSystemBusy = isBusy;
   [els.scanBtn, els.copyMakeupBtn, els.saveBtn, els.findBtn, els.clearDbBtn].forEach(btn => {
      if (btn === els.copyMakeupBtn && !state.lastCompositedCanvas) btn.disabled = true;
      else btn.disabled = isBusy;
   });
   const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
   previewBtns.forEach(btn => btn.disabled = isBusy);
}

async function loadModels() {
   setStatus('init', 'caricamento modelli');
   await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URLS.tiny),
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

   setBusy(true);
   setLog('Caricamento sistema di riconoscimento facciale (face-api.js)...')
   try {
      await loadModels();
   } catch (err) {
      setLog('Errore durante il caricamento: ' + err.message);
      return;
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
      return;
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