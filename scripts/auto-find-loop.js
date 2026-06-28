/**
 * @module auto-find-loop
 * @description
 * Auto-find loop — add-on per ghostati.html
 *
 * Ogni N secondi rifà la pipeline di "trova faccia" in modo silenzioso:
 * - detection live con descrittore
 * - se c'è un plugin attivo (2D o 3D), compositing + ri-detection per ottenere
 *   il descrittore post-makeup
 * - calcolo distanze min vs DB e dispatch di `matchStateChanged`
 *
 * Non scrive log testuali (lo fa solo il pulsante "trova faccia"). Si appoggia
 * a `bbox-overlay.js` per la visualizzazione delle metriche live accanto al box.
 *
 * Auto-pause: se il video non è pronto, il DB è vuoto, o non viene rilevato un
 * volto, il tick viene saltato. Lock: se un pass è ancora in volo (composite +
 * detection può richiedere ~100-200ms), il tick successivo viene saltato.
 */

import { compositeAndDetect, evaluateMatch, detectFaceInCam, hasActivePlugin, seekFaceInDb } from './engine.js';
import { state } from './state.js';

window.addEventListener('ghostatiReady', autoFindLoop, { once: true });

function autoFindLoop() {

   const INTERVAL_MS = 2000;

   setInterval(tick, INTERVAL_MS);
}

async function tick() {
   const liveResult = await detectFaceInCam(false);
   if (!liveResult)
      return;

   let liveInfo = {};
   if(state.db.faces.length > 0) {
      liveInfo = seekFaceInDb(liveResult);
      // liveInfo has liveScore, liveMinDist, liveMinId
   }

   const composite = hasActivePlugin() ? await compositeAndDetect(liveResult) : null;
   // composite might have 'canvas', 'obfuscatedResult', and 'weakDetection' properties
   const { detail } = evaluateMatch(liveInfo, composite);
   state.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
      detail: {
         ...detail,
         ...liveInfo,
         source: 'auto'
      }
   }));
}
