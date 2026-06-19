/**
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

window.addEventListener('ghostatiReady', autoFindLoop, { once: true });

function autoFindLoop() {
   const INTERVAL_MS = 2000;

   const G = window.Ghostati;
   if (!G || !G.events || typeof G._compositeAndDetect !== 'function' || !G.detectorOptions) {
      console.warn('[auto-find-loop] dipendenze mancanti, skip init');
      return;
   }
   if (typeof faceapi === 'undefined') {
      console.warn('[auto-find-loop] faceapi non disponibile, skip init');
      return;
   }
   const video = document.getElementById('video');
   if (!video) {
      console.warn('[auto-find-loop] elemento #video mancante, skip init');
      return;
   }

   let inFlight = false;

   function minDistanceTo(descriptor, faces) {
      let bestDist = Infinity;
      let bestId = null;
      for (const f of faces) {
         const d = G.distance(descriptor, f.descriptor);
         if (d < bestDist) {
            bestDist = d;
            bestId = f.id;
         }
      }
      return { distance: bestDist, id: bestId };
   }

   async function tick() {
      if (inFlight) return;
      if (!video || video.readyState < 2) return;
      const db = G.getDb();
      if (!db || !Array.isArray(db.faces) || db.faces.length === 0) return;

      inFlight = true;
      try {
         const liveResult = await faceapi
            .detectSingleFace(video, G.detectorOptions)
            .withFaceLandmarks()
            .withFaceDescriptor();
         if (!liveResult) return;

         const liveScore = liveResult.detection.score;
         const live = minDistanceTo(liveResult.descriptor, db.faces);

         let obfMinDist = null;
         let obfMinId = null;
         let obfScore = null;
         let weakDetection = false;
         let detectionTotallyFailed = false;

         if (hasActivePlugin(state)) {
            const composite = await G._compositeAndDetect(liveResult);
            if (composite && composite.obfuscatedResult) {
               obfScore = composite.obfuscatedResult.detection.score;
               const obf = minDistanceTo(composite.obfuscatedResult.descriptor, db.faces);
               obfMinDist = obf.distance;
               obfMinId = obf.id;
               weakDetection = !!composite.weakDetection;
            } else {
               detectionTotallyFailed = true;
            }
         }

         const threshold = G.getMatchThreshold();
         let detectionState;
         if (detectionTotallyFailed || weakDetection) {
            detectionState = 'eluded';
         } else {
            const useDist = obfMinDist != null ? obfMinDist : live.distance;
            detectionState = useDist <= threshold ? 'matched' : 'eluded';
         }
         const matchedId = detectionState === 'matched'
            ? (obfMinDist != null ? obfMinId : live.id)
            : null;

         G.events.dispatchEvent(new CustomEvent('matchStateChanged', {
            detail: {
               detectionState,
               source: 'auto',
               distance: obfMinDist != null ? obfMinDist : live.distance,
               matchedId,
               score: liveScore,
               obfuscatedScore: obfScore,
               liveMinDist: live.distance,
               obfMinDist,
               weakDetection
            }
         }));
      } catch (err) {
         console.error('[auto-find-loop]', err);
      } finally {
         inFlight = false;
      }
   }

   setInterval(tick, INTERVAL_MS);
}

