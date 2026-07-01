import { state } from './state.js';
import { els } from './dom.js';
import { setLog } from './utils.js';

const EXPORT_LAYOUT = {
   headerHeight: 44,
   footerHeight: 50,
   backgroundColor: '#0f1115',
   defaultTextColor: '#eef2ff',
   successTextColor: '#3ddc97',
   errorTextColor: '#ff7a7a'
};

const EXPORT_COPY = {
   filename: 'ghostati-makeup.png',
   mimeType: 'image/png',
   shareTitle: 'Ghostmaxxing Makeup',
   shareText: 'Il mio camouflage anti-riconoscimento!',
   headerPrefix: 'github.com/vecna/ghostati | Report diagnostico makeup',
   reportUrl: 'https://vecna.eu/ghostmaxxing//'
};

/**
 * exportMakeup is intentionally the only exported function and the only place
 * where this module touches application-level global state.
 *
 * The previous implementation mixed five responsibilities in a single block:
 *
 * 1. Reading app state:
 *    - state.lastCompositedCanvas
 *    - state.isMirrored
 *    - state.loadedGhostyles
 *    - state.activeEffect
 *    - els.logBox
 *
 * 2. Building the export model:
 *    - plugin name
 *    - diagnostic log text
 *    - header/footer copy
 *    - footer color
 *
 * 3. Rendering:
 *    - canvas allocation
 *    - background painting
 *    - mirrored or non-mirrored image drawing
 *    - header text drawing
 *    - footer text drawing
 *
 * 4. Binary conversion:
 *    - canvas.toBlob callback handling
 *    - null blob failure handling
 *    - File creation
 *
 * 5. Delivery:
 *    - Clipboard API attempt
 *    - Share API fallback
 *    - logging user-visible outcomes
 *
 * This made the function difficult to test because most of the interesting
 * decisions were hidden inside nested browser callbacks and if/else branches.
 *
 * The new structure keeps exportMakeup as the imperative coordinator, while
 * moving deterministic decisions into small helpers that each take one or two
 * parameters. Those helpers do not read or mutate `state`, `els`, or any other
 * application globals. Most helpers are pure data transformations. The canvas
 * helpers only mutate the canvas/context passed to them, which is local to a
 * single export operation and not shared application state.
 *
 * This makes the code easier to test in layers:
 *
 * - collectExportInput can be tested with mocked state/els objects.
 * - buildHeaderText, getFooterColor, createExportCanvas, and makeImageFile
 *   can be tested without touching app state.
 * - renderExportCanvas can be tested with a fake/local canvas.
 * - copyBlobToClipboard and shareImageFile are thin browser-bound edges.
 *
 * The important boundary is:
 *
 * - Helpers can receive data.
 * - Helpers can return data.
 * - Helpers must not reach into `state` or `els`.
 * - Only exportMakeup decides when to call setLog.
 */
export async function exportMakeup() {
   const imgInfo = collectExportInput(state, els);
   if (!imgInfo.sourceCanvas) return;

   try {
      const exportCanvas = renderExportCanvas(imgInfo, EXPORT_LAYOUT);
      const blob = await canvasToBlob(exportCanvas);

      try {
         await copyBlobToClipboard(blob);
         setLog('Immagine con referto diagnostico copiata negli appunti!');
         return;
      } catch (err) {
         console.error('Clipboard write fallito, provo fallback', err);
      }

      const file = makeImageFile(blob, EXPORT_COPY);

      try {
         await shareImageFile(file, EXPORT_COPY);
         setLog('Immagine condivisa con successo!');
      } catch (err) {
         console.error('Share failed', err);
         setLog('Impossibile copiare l\'immagine (permessi mancanti o Share API non supportata).');
      }
   } catch (err) {
      console.error(err);
      setLog('Errore durante la copia. Forse manca il permesso nel browser?');
   }
}

export function collectExportInput(appState, domEls) {
   const style = appState.loadedGhostyles.get(appState.activeEffect);

   return {
      sourceCanvas: appState.lastCompositedCanvas,
      isMirrored: appState.isMirrored,
      pluginName: style ? style.name : 'Unknown Plugin',
      logText: getLatestLogText(domEls.logBox)
   };
}

function getLatestLogText(logBox) {
   return logBox.lastChild ? logBox.lastChild.textContent : '';
}

function renderExportCanvas(input, layout) {
   const canvas = document.createElement('canvas');

   // The exported image includes the source canvas plus a header and footer, so total height is source height + header + footer.
   canvas.width = input.sourceCanvas.width;
   canvas.height = input.sourceCanvas.height + layout.headerHeight + layout.footerHeight;

   const ctx = canvas.getContext('2d');
   if (!ctx) {
      throw new Error('Could not create 2D canvas context.');
   }

   // paint background first to ensure exported image is fully opaque, which is important
   ctx.fillStyle = EXPORT_LAYOUT.backgroundColor;
   ctx.fillRect(0, 0, canvas.width, canvas.height);

   drawSourceImage(ctx, { canvas, input, layout });
   drawHeader(ctx, { canvas, input, layout });
   drawFooter(ctx, { canvas, input, layout });

   return canvas;
}


function drawSourceImage(ctx, data) {
   const { canvas, input, layout } = data;

   if (!input.isMirrored) {
      ctx.drawImage(input.sourceCanvas, 0, layout.headerHeight);
      return;
   }

   ctx.save();
   ctx.translate(canvas.width, 0);
   ctx.scale(-1, 1);
   ctx.drawImage(input.sourceCanvas, 0, layout.headerHeight);
   ctx.restore();
}

function drawHeader(ctx, data) {
   const { canvas, input, layout } = data;

   ctx.fillStyle = layout.defaultTextColor;
   ctx.textAlign = 'center';
   ctx.textBaseline = 'middle';
   ctx.font = 'bold 14px Inter, sans-serif';

   ctx.fillText(
      buildHeaderText(input.pluginName),
      canvas.width / 2,
      layout.headerHeight / 2
   );
}

export function buildHeaderText(pluginName) {
   return `${EXPORT_COPY.headerPrefix} | Modulo: ${pluginName} | URL: ${EXPORT_COPY.reportUrl}`;
}

function drawFooter(ctx, data) {
   const { canvas, input, layout } = data;
   
   ctx.fillStyle = state.lastKnownEffectResult && state.lastKnownEffectResult.detection ? EXPORT_LAYOUT.successTextColor : EXPORT_LAYOUT.errorTextColor;
   // exists also EXPORT_LAYOUT.defaultTextColor but I need to look better into the effectResults values and meaning.
   ctx.textAlign = 'center';
   ctx.textBaseline = 'middle';
   ctx.font = '14px Inter, sans-serif';

   ctx.fillText(
      input.logText,
      canvas.width / 2,
      canvas.height - layout.footerHeight / 2
   );
}

function canvasToBlob(canvas) {
   return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
         if (blob) {
            resolve(blob);
            return;
         }

         reject(new Error('Canvas export returned an empty blob.'));
      }, EXPORT_COPY.mimeType);
   });
}

export function makeImageFile(blob, copy) {
   return new File([blob], copy.filename, { type: copy.mimeType });
}

function copyBlobToClipboard(blob) {
   if (!canUseClipboard(navigator)) {
      return Promise.reject(new Error('Clipboard API not available.'));
   }

   const item = new ClipboardItem({ [EXPORT_COPY.mimeType]: blob });
   return navigator.clipboard.write([item]);
}

export function canUseClipboard(browserNavigator) {
   return Boolean(
      browserNavigator.clipboard &&
      browserNavigator.clipboard.write &&
      window.ClipboardItem
   );
}

function shareImageFile(file, copy) {
   if (!canShareFile(file)) {
      return Promise.reject(new Error('Share API not available for this file.'));
   }

   return navigator.share({
      title: copy.shareTitle,
      text: copy.shareText,
      files: [file]
   });
}

export function canShareFile(file) {
   if (!navigator.share) return false;

   if (!navigator.canShare) return true;

   return navigator.canShare({ files: [file] });
}