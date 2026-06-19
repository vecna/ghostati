
async function detectCurrentFace(stateo, elso, drawOverlay) {
   clearOverlay();
   const result = await faceapi.detectSingleFace(elso.video, DETECTOR_OPTIONS)
      .withFaceLandmarks()
      .withAgeAndGender()
      .withFaceDescriptor();

   if (!result) {
      stateo.lastKnownEffectResult = null;
      setLog('Nessun volto rilevato nella webcam.');
      return null;
   }

   if (drawOverlay) drawResult(stateo, elso, result);
   return result;
}

// Costruisce un canvas col compositing video + ghostyle 2D + plugin 3D (via evento)
// e ci esegue una detection face-api con landmarks + descriptor. Ritorna
// {canvas, obfuscatedResult, weakDetection}.
// Se la detection con la soglia normale fallisce (`scoreThreshold: 0.5`), ritenta
// con una rilassata (0.1) per estrarre comunque metriche numeriche dal composito —
// utile come "indicatore di efficacia" del makeup anche oltre la soglia di rilevamento.
// `weakDetection` segnala quando si è dovuto fare il fallback.
async function compositeAndDetect(stateo, liveResult) {
   const canvas = document.createElement('canvas');
   canvas.width = els.overlay.width;
   canvas.height = els.overlay.height;
   const ctx = canvas.getContext('2d');

   ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);

   const style = stateo.loadedGhostyles.get(stateo.activeEffect);
   if (style && style.module.onDraw) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const resized = faceapi.resizeResults(liveResult, { width: canvas.width, height: canvas.height });
      style.module.onDraw(ctx, resized.landmarks, resized.detection.box);
      ctx.restore();
   }

   stateo.ghostatiEvents.dispatchEvent(new CustomEvent('beforeEfficacyComposite', {
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


async function runEffectPass(stateo, elso) {
   if (stateo.isSystemBusy || stateo.effectInferenceInFlight || els.video.readyState < 2) return;
   stateo.effectInferenceInFlight = true;
   try {
      const detector = faceapi.detectSingleFace(els.video, DETECTOR_OPTIONS);
      const result = stateo.activeEffect ? await detector.withFaceLandmarks() : await detector;

      if (!result) {
         stateo.lastKnownEffectResult = null;
         if (stateo.activeEffect) clearOverlay();
      } else if (stateo.activeEffect) {
         drawEffectOverlay(stateo, elso, result, false);
      } else {
         stateo.lastKnownEffectResult = result;
      }

      stateo.ghostatiEvents.dispatchEvent(new CustomEvent('detection', {
         detail: { result: result || null, activeEffect: stateo.activeEffect }
      }));
   } catch (err) {
      console.error(err);
   } finally {
      stateo.effectInferenceInFlight = false;
   }
}

function drawEffectOverlay(stateo, elso, result, includeDetectionScaffold = false) {
   resizeCanvas(elso);
   const ctx = elso.overlay.getContext('2d');
   ctx.clearRect(0, 0, elso.overlay.width, elso.overlay.height);
   const resized = faceapi.resizeResults(result, { width: elso.overlay.width, height: elso.overlay.height });
   if (!resized.detection) {
      console.log("drawEffectOverlay: no detection?", resized);
      // messo questo log perché a volte era undefined?
      return
   } else {
      console.log("drawEffectOverlay: detection OK", resized.detection);
   }
   if (includeDetectionScaffold) drawDetectionScaffold(stateo, ctx, resized);
   if (stateo.activeEffect) {
      const style = stateo.loadedGhostyles.get(stateo.activeEffect);
      if (style && style.module.onDraw) {
         ctx.save();
         ctx.lineCap = 'round';
         ctx.lineJoin = 'round';
         style.module.onDraw(ctx, resized.landmarks, resized.detection.box);
         ctx.restore();
      }
   }
   stateo.lastKnownEffectResult = result;
}

function drawDetectionScaffold(stateo, ctx, resized) {
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

   if (stateo.isMirrored) {
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

function drawResult(stateo, elso, result) {
   resizeCanvas(elso);
   const ctx = elso.overlay.getContext('2d');
   ctx.clearRect(0, 0, elso.overlay.width, elso.overlay.height);
   const resized = faceapi.resizeResults(result, { width: elso.overlay.width, height: elso.overlay.height });
   drawDetectionScaffold(stateo, ctx, resized);
   if (stateo.activeEffect) {
      const style = stateo.loadedGhostyles.get(stateo.activeEffect);
      if (style && style.module.onDraw) {
         ctx.save();
         ctx.lineCap = 'round';
         ctx.lineJoin = 'round';
         style.module.onDraw(ctx, resized.landmarks, resized.detection.box);
         ctx.restore();
      }
   }
   stateo.lastKnownEffectResult = result;
}


async function scanFace(stateo, elso) {
   const result = await detectCurrentFace(stateo, elso, true);
   if (!result) return;
   triggerOverlayFadeout(stateo, elso);
   const age = Math.round(result.age);
   const gender = result.gender || 'n/d';
   const confidence = typeof result.genderProbability === 'number' ? ` (${Math.round(result.genderProbability * 100)}%)` : '';
   const score = result.detection.score;
   setLog(`Volto trovato. Età stimata: ${age}. Genere stimato: ${gender}${confidence}. Detection score: ${score.toFixed(2)}.`);

   stateo.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
      detail: { detectionState: Ghostati._computeMatchState(result.descriptor), source: 'scan', score }
   }));

   if (stateo.nudgeStep === 1) { stateo.nudgeStep = 2; updateNudging(); }
}

async function saveFace(stateo, elso) {
   const result = await detectCurrentFace(stateo, elso, true);
   if (!result) return;
   triggerOverlayFadeout(stateo, elso);
   const id = stateo.db.nextId;
   stateo.db.nextId += 1;
   stateo.db.faces.push({
      id,
      descriptor: Array.from(result.descriptor),
      age: Math.round(result.age),
      gender: result.gender || null,
      savedAt: new Date().toISOString()
   });
   persistDb(stateo);
   renderDbStats(stateo, elso);
   const score = result.detection.score;
   setLog(`Impronta biometrica salvata con ID ${id}. Detection score: ${score.toFixed(2)}.`);

   stateo.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
      detail: { detectionState: window.Ghostati._computeMatchState(result.descriptor), source: 'save', score }
   }));

   if (state.nudgeStep === 2) { state.nudgeStep = 3; updateNudging(); }
}

async function findFace(stateo, elso) {
   if (stateo.db.faces.length === 0) {
      setLog('Archivio locale vuoto. Salva almeno un volto prima della ricerca.');
      clearOverlay();
      return;
   }

   console.log("Faccie nel DB:", stateo.db.faces);
   const liveResult = await detectCurrentFace(stateo, elso, true);
   if (!liveResult) return;
   triggerOverlayFadeout(stateo, elso);

   const liveScore = liveResult.detection.score;
   const liveDistances = stateo.db.faces
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
   if (hasActivePlugin(stateo)) {
      const composite = await compositeAndDetect(stateo, liveResult);
      if (composite.obfuscatedResult) {
         obfScore = composite.obfuscatedResult.detection.score;
         const obfDistances = stateo.db.faces
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
      if (useDist <= stateo.MATCH_THRESHOLD) {
         detectionState = 'matched';
         headline = `Corrispondenza trovata: ID ${useId} (distanza ${useDist.toFixed(3)} ≤ ${stateo.MATCH_THRESHOLD.toFixed(2)}).`;
      } else {
         detectionState = 'eluded';
         headline = `Nessuna corrispondenza sotto soglia ${stateo.MATCH_THRESHOLD.toFixed(2)}.`;
      }
   }

   const distLog = obfMinDist != null
      ? `distanza live: ${liveMinDist.toFixed(3)}; distanza post-makeup: ${obfMinDist.toFixed(3)}`
      : `distanza live: ${liveMinDist.toFixed(3)}`;
   setLog(`${headline} ${distLog}.`);

   stateo.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
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

async function testMakeupEfficacy(stateo, elso) {
   const result = await detectCurrentFace(stateo, elso, false);
   if (!result) {
      setLog('Nessun volto di base trovato. Avvicinati alla webcam.');
      return;
   }

   const { canvas, obfuscatedResult, weakDetection } = await compositeAndDetect(stateo, elso, result);

   stateo.lastCompositedCanvas = canvas;
   elso.copyMakeupBtn.disabled = false;

   setLog('Analisi in corso... sottopongo il compositing a face-api');

   const liveScore = result.detection.score;
   const liveMinDist = stateo.db.faces.length > 0
      ? Math.min(...stateo.db.faces.map(e => distance(result.descriptor, e.descriptor)))
      : null;
   const obfScore = obfuscatedResult ? obfuscatedResult.detection.score : null;
   const obfMinDist = obfuscatedResult && stateo.db.faces.length > 0
      ? Math.min(...stateo.db.faces.map(e => distance(obfuscatedResult.descriptor, e.descriptor)))
      : null;

   // Suffix metriche da appendere ai messaggi
   const distLog = (() => {
      if (stateo.db.faces.length === 0) {
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
      let detectionState = stateo.db.faces.length === 0 ? 'unknown' : 'eluded';
      const headline = stateo.db.faces.length === 0
         ? `Risultato: NESSUN VOLTO INDIVIDUATO. Rilevatore ingannato! Salva un volto nel DB per testare il riconoscimento.`
         : `Risultato: ECCELLENTE. Il trucco ha frammentato il volto al punto da distruggere l'algoritmo di rilevamento.`;
      setLog(`${headline} ${distLog}.`);
      stateo.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
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
      const detectionState = stateo.db.faces.length === 0 ? 'unknown' : 'eluded';
      setLog(`Risultato: BUONO. Detection sul composito forzata a confidenza bassa — face-api non vede chiaramente un volto. ${distLog}.`);
      stateo.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
         detail: { detectionState, source: 'efficacy', score: liveScore, obfuscatedScore: obfScore, liveMinDist, obfMinDist, weakDetection: true }
      }));
      return;
   }

   if (stateo.db.faces.length === 0) {
      const dist = distance(result.descriptor, obfuscatedResult.descriptor);
      const detectionState = dist > stateo.MATCH_THRESHOLD ? 'eluded' : 'matched';
      const headline = dist > stateo.MATCH_THRESHOLD
         ? `Risultato: IDENTITÀ NASCOSTA. La tua impronta è irriconoscibile rispetto al volto base. Salva un volto nel DB per testare contro i salvataggi!`
         : `Risultato: INSUFFICIENTE. L'identità biometrica è ancora intatta.`;
      setLog(`${headline} distanza self pre→post: ${dist.toFixed(3)}.`);
      stateo.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
         detail: { detectionState, source: 'efficacy', distance: dist, score: liveScore, obfuscatedScore: obfScore, liveMinDist: null, obfMinDist: null, weakDetection: false }
      }));
   } else {
      const detectionState = obfMinDist > stateo.MATCH_THRESHOLD ? 'eluded' : 'matched';
      const headline = obfMinDist > stateo.MATCH_THRESHOLD
         ? `Risultato: BUONO (Spoofed). Volto rilevato ma l'identità è irriconoscibile.`
         : `Risultato: INSUFFICIENTE. Il sistema ti riconosce ancora in archivio. Aggiungi geometrie.`;
      setLog(`${headline} ${distLog}.`);
      stateo.ghostatiEvents.dispatchEvent(new CustomEvent('matchStateChanged', {
         detail: { detectionState, source: 'efficacy', distance: obfMinDist, score: liveScore, obfuscatedScore: obfScore, liveMinDist, obfMinDist, weakDetection: false }
      }));
   }
}

function hasActivePlugin(stateo) {
   const G = window.Ghostati;
   const a2d = typeof G.getActiveEffect === 'function' && G.getActiveEffect();
   const a3d = typeof G.getActiveEffect3d === 'function' && G.getActiveEffect3d();
   let retv = !!(a2d || a3d);
   console.log("btw hasActivePlugin debug:", retv, stateo.activeEffect);
   return retv;
}
