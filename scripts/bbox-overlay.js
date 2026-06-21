/**
 * @module bbox-overlay
 * @description
 * Bbox match-state overlay — add-on per ghostati.html
 *
 * Disegna una bounding box attorno al volto rilevato, colorata in base
 * all'ultimo stato di match calcolato dall'engine (matched/eluded/unknown).
 * Affianca le metriche correnti: detection score (live), distanza live e
 * distanza post-makeup dall'ultimo trigger ("trova faccia"/"verifica efficacia").
 * Reagisce a Ghostati.events. Non modifica l'engine.
 *
 * Convenzione cromatica: rosso = identificato, verde = eluso, grigio = ignoto.
 */

window.addEventListener('ghostatiReady', boxOverlayLoop, { once: true });

function boxOverlayLoop() {
   const COLORS = {
      matched: 'rgba(255, 122, 122, 0.95)',
      eluded:  'rgba(61, 220, 151, 0.95)',
      unknown: 'rgba(170, 180, 195, 0.85)'
   };
   const LINE_WIDTH_CSS = 2.6;
   // Stesso font del logger UI (vedi .log-line in styles/ghostati.css). I valori
   // sono in pixel CSS: vengono moltiplicati per la scala canvas/CSS in drawLabels
   // così il rendering risulta della stessa dimensione visiva su qualsiasi
   // risoluzione webcam (su mobile il canvas è 1920×1080 ma visualizzato a ~350px:
   // 12px canvas-pixel sarebbero illeggibili senza la scala).
   const LABEL_FONT_FAMILY = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
   const LABEL_FONT_SIZE_CSS = 12;
   const LABEL_LINE_HEIGHT_CSS = 16;
   const LABEL_PADDING_CSS = 6;
   const LABEL_GAP_CSS = 8;

   const canvas = document.getElementById('bboxOverlay');
   const overlayEl = document.getElementById('overlay');
   if (!canvas || !overlayEl || !window.Ghostati || !window.Ghostati.events) {
      console.warn('[bbox-overlay] dipendenze mancanti, skip init');
      return;
   }
   const ctx = canvas.getContext('2d');
   let lastMatchState = 'unknown';
   let lastLiveMinDist = null;
   let lastObfMinDist = null;

   function syncSize() {
      if (canvas.width !== overlayEl.width || canvas.height !== overlayEl.height) {
         canvas.width = overlayEl.width;
         canvas.height = overlayEl.height;
      }
   }

   function syncMirror() {
      const t = overlayEl.style.transform;
      if (canvas.style.transform !== t) canvas.style.transform = t;
   }

   function clearBbox() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
   }

   function extractBox(resized) {
      // detectSingleFace() solo: result.box
      // detectSingleFace().withFaceLandmarks(): result.detection.box
      return (resized.detection && resized.detection.box) || resized.box;
   }

   function extractScore(result) {
      // Stessa dualità di extractBox: con landmarks lo score sta in result.detection.
      if (result.detection && typeof result.detection.score === 'number') return result.detection.score;
      if (typeof result.score === 'number') return result.score;
      return null;
   }

   function fmt(value, digits) {
      return (typeof value === 'number' && Number.isFinite(value)) ? value.toFixed(digits) : '—';
   }

   // Le label vengono "smirrorate" (lo specchio è applicato all'intero canvas via
   // CSS), così leggono dritte anche con webcam in modalità mirror.
   function drawLabels(box, score) {
      const lines = [
         `score ${fmt(score, 2)}`,
         `live  ${fmt(lastLiveMinDist, 3)}`,
         `post  ${fmt(lastObfMinDist, 3)}`
      ];

      // Scala canvas→CSS: moltiplico tutte le dimensioni in CSS-px per ottenere
      // canvas-px coerenti col rendering visivo.
      const cssW = canvas.clientWidth || canvas.width;
      const scale = canvas.width / cssW;
      const fontSize = LABEL_FONT_SIZE_CSS * scale;
      const lineHeight = LABEL_LINE_HEIGHT_CSS * scale;
      const padding = LABEL_PADDING_CSS * scale;
      const gap = LABEL_GAP_CSS * scale;

      ctx.save();
      ctx.font = `${fontSize}px ${LABEL_FONT_FAMILY}`;
      ctx.textBaseline = 'top';
      const widths = lines.map(t => ctx.measureText(t).width);
      const blockW = Math.max(...widths) + padding * 2;
      const blockH = lineHeight * lines.length + padding * 2;

      const aboveY = box.y - blockH - gap;
      const belowY = box.y + box.height + gap;
      const top = aboveY >= 0 ? aboveY : belowY;
      let left = box.x;
      if (left + blockW > canvas.width) left = canvas.width - blockW;
      if (left < 0) left = 0;

      // Smirror del solo blocco label se il canvas è specchiato.
      const mirrored = (canvas.style.transform || '').includes('scaleX(-1)');
      if (mirrored) {
         ctx.translate(canvas.width, 0);
         ctx.scale(-1, 1);
         left = canvas.width - left - blockW;
      }

      ctx.fillStyle = 'rgba(12, 14, 22, 0.78)';
      ctx.fillRect(left, top, blockW, blockH);

      ctx.fillStyle = COLORS[lastMatchState] || COLORS.unknown;
      lines.forEach((t, i) => {
         ctx.fillText(t, left + padding, top + padding + i * lineHeight);
      });
      ctx.restore();
   }

   Ghostati.events.addEventListener('detection', (e) => {
      const result = e.detail && e.detail.result;
      syncSize();
      syncMirror();
      clearBbox();
      if (!result) return;

      const resized = faceapi.resizeResults(result, {
         width: canvas.width,
         height: canvas.height
      });
      const box = extractBox(resized);
      if (!box) return;

      const cssW = canvas.clientWidth || canvas.width;
      const scale = canvas.width / cssW;
      ctx.save();
      ctx.lineWidth = LINE_WIDTH_CSS * scale;
      ctx.strokeStyle = COLORS[lastMatchState] || COLORS.unknown;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.restore();

      drawLabels(box, extractScore(result));
   });

   Ghostati.events.addEventListener('matchStateChanged', (e) => {
      if (!e.detail) return;
      if (e.detail.detectionState) lastMatchState = e.detail.detectionState;
      // scan/save non portano distanze: aggiorno solo quando le chiavi sono presenti.
      if ('liveMinDist' in e.detail) lastLiveMinDist = e.detail.liveMinDist;
      if ('obfMinDist' in e.detail) lastObfMinDist = e.detail.obfMinDist;
   });

   Ghostati.events.addEventListener('dbChanged', (e) => {
      if (e.detail && e.detail.count === 0) {
         lastMatchState = 'unknown';
         lastLiveMinDist = null;
         lastObfMinDist = null;
      }
   });
}
