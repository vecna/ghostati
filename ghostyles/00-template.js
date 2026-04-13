/**
 * ==Ghostyle==
 * @name         Template Didattico
 * @version      1.0.0
 * @author       NINA
 * @description  Plugin di esempio commentato per facilitare lo sviluppo di nuovi effetti.
 * ==/Ghostyle==
 */

// NOTA: Puoi definire variabili globali locali per il tuo modulo qui.
let initialized = false;

/**
 * [OPZIONALE] onInit
 * Chiamata una sola volta quando il plugin viene caricato con successo.
 * Utile per pre-caricare immagini (es. loghi NINA asincroni) o inizializzare variabili.
 */
export function onInit() {
  Ghostati.log("Inizializzazione del modulo didattico completata.", "Template Didattico");
  initialized = true;
}

/**
 * [OPZIONALE] onClear
 * Chiamata quando l'utente disattiva il tuo plugin.
 * Utile se devi pulire la memoria o loggare lo spegnimento.
 */
export function onClear(ctx) {
  Ghostati.log("Effetto disattivato.", "Template Didattico");
}

/**
 * [OBBLIGATORIO] onDraw
 * Questa funzione viene chiamata per ogni frame della webcam dove viene riconosciuto un volto.
 * 
 * @param {CanvasRenderingContext2D} ctx - Il contesto 2D nativo dell'overlay JS.
 * @param {FaceLandmarks68} landmarks - Oggetto di face-api.js con 68 punti bidimensionali (x,y).
 * @param {BoundingBox} box - Oggetto {x, y, width, height} che incornicia l'intera testa.
 */
export function onDraw(ctx, landmarks, box) {
  /*
  --- 1. LA STRUTTURA DEI LANDMARKS ---
  I landmarks di face-api presentano 68 punti estraibili tramite getters:
  - getJawOutline()   : 17 punti (0-16) per il perimetro inferiore (mascella)
  - getLeftEyeBrow()  : 5 punti per il sopracciglio sx
  - getRightEyeBrow() : 5 punti per il sopracciglio dx
  - getNose()         : 9 punti (dal ponte centrale alle narici)
  - getLeftEye()      : 6 punti per il contorno palpebrale sx
  - getRightEye()     : 6 punti per il contorno palpebrale dx
  - getMouth()        : 20 punti (esterno e interno labbra)
  
  Ogni punto restituito possiede coordinate piane { x: numero, y: numero }.
  */

  // Esempio: Estraiamo il naso
  const nose = landmarks.getNose();
  const centroNaso = Ghostati.avgPoint(nose); // avgPoint calcola il baricentro esatto di n punti

  /*
  --- 2. LA API GLOBALE: window.Ghostati ---
  Il core della dashboard espone le funzioni geometriche più usate in `window.Ghostati`:

  CALCOLI:
  - Ghostati.distance(p1, p2)      -> distanza euclidea tra due punti
  - Ghostati.avgPoint(pointsArray) -> calcola il punto centrale
  - Ghostati.lerp(p1, p2, t)       -> interpolazione lineare spaziale
  - Ghostati.scaleFrom(center, p, scale) -> allontana e scala un punto 
  
  FUNZIONI DI DISEGNO NATIVE (sui Context Canvas):
  - Ghostati.drawClosedPath(ctx, puntiArray, coloreRiempimento, coloreBordo, spessoreRiga)
  - Ghostati.drawOpenPath(ctx, puntiArray, coloreBordo, spessoreRiga, lineaTratteggiataBool)
  - Ghostati.drawLabel(ctx, stringaDiTesto, x, y) -> Disegna un piccolo tooltip ancorato
  
  FUNZIONI COMPOSTE (Makeup Presets):
  - Ghostati.drawEyeWing(ctx, occhio, sopracciglio, label, options)
  - Ghostati.drawCheekSweep(ctx, anchor, noseSide, ...)
  - Ghostati.drawContourBand(ctx, puntiArray, label)
  */

  // ----------------------------------------------------
  // Esempio Pratico: Disegniamo un rettangolo sul naso
  // ----------------------------------------------------
  const radius = 25;
  
  // Utilizziamo direttamente le API esposte dal Canvas contestuale
  ctx.fillStyle = 'rgba(159, 122, 234, 0.4)'; // Colore Viola NINA con opacità
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;

  // ctx.fillRect accetta (x, y, larghezza, altezza)
  ctx.fillRect(centroNaso.x - radius, centroNaso.y - radius, radius*2, radius*2);
  ctx.strokeRect(centroNaso.x - radius, centroNaso.y - radius, radius*2, radius*2);

  // Usiamo un helper di Ghostati per mettere un label a lato
  Ghostati.drawLabel(ctx, "Centro Naso", centroNaso.x + radius + 15, centroNaso.y);

  // Per inviare log dalla tua estensione:
  if (initialized) {
     Ghostati.log(`Tracking iniziato al pixel (${Math.round(centroNaso.x)}, ${Math.round(centroNaso.y)})`, "Template Didattico");
     initialized = false; // Prevengo di spammare a ogni singolo frame (30fps)
  }
}
