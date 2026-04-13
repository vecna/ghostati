// @name Splash

export function onInit() {
  Ghostati.log('Caricato Ghostyle: SPLASH. Modulo tribale asimmetrico attivato!', 'SPLASH');
}

export function onDraw(ctx, landmarks, box) {
  // Estrazione coordinate di base da face-api
  const nose = landmarks.getNose();
  const jaw = landmarks.getJawOutline();
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const leftBrow = landmarks.getLeftEyeBrow();
  
  // 1. MACCHIA DI FONDO (Magenta neon) - Copre massicciamente parte sx dal naso a scendere
  const baseMask = [
    Ghostati.lerp(jaw[0], leftBrow[0], 1.2), // Oltre la fronte sinistra
    nose[0], // Radice alta del naso
    nose[5], // Punta / Narice destra
    jaw[7], // Mento (centro-destra)
    jaw[4], // Mascella sinistra bassa
    jaw[1], // Orecchio sinistro basso
    jaw[0]  // Orecchio sinistro alto (chiusura)
  ];
  Ghostati.drawClosedPath(ctx, baseMask, 'rgba(255, 20, 147, 0.55)', 'rgba(255, 20, 147, 0.95)', 4);
  
  // 2. LINEA DI FORZA CIANO - Taglio dritto diagonale per rompere la simmetria del naso
  const taglioCyan = [
    jaw[7], // Da mento
    nose[6], // Passando sotto la punta del naso
    nose[2], // Incrociando al centro del ponte
    leftBrow[4], // Fino all'inizio del sopracciglio sx
    Ghostati.lerp(leftBrow[4], jaw[0], -0.6) // Proiettato fuori verso l'alto
  ];
  Ghostati.drawOpenPath(ctx, taglioCyan, 'rgba(0, 255, 255, 0.9)', 16);

  // 3. TAGLIO ACIDO GIALLO - Curve a zig-zag laterale che sbordano a destra
  const taglioYellow = [
    jaw[2], // Sotto orecchio sx
    leftEye[3], // Esterno occhio sx
    nose[1], // Ponte naso alto
    rightEye[0], // Interno occhio dx
    Ghostati.lerp(rightEye[0], jaw[15], 0.3) // Prosegue verso guancia dx spaccando la simmetria
  ];
  Ghostati.drawOpenPath(ctx, taglioYellow, 'rgba(240, 255, 0, 0.95)', 8);

  // 4. BARRICATE BLACKOUT - Linee solide e spesse per oscurare feature chiave (Naso, Zigomo)
  // Questo contribuisce pesantemente contro il riconoscimento CV Dazzle
  const contrastoNero1 = [ jaw[5], Ghostati.lerp(jaw[5], nose[4], 0.6), leftEye[0] ];
  Ghostati.drawOpenPath(ctx, contrastoNero1, 'rgba(15, 17, 21, 1)', 24);
  
  const contrastoNero2 = [ nose[5], nose[3], rightEye[3], Ghostati.lerp(rightEye[3], jaw[14], 0.5) ];
  Ghostati.drawOpenPath(ctx, contrastoNero2, 'rgba(15, 17, 21, 1)', 18);

  // 5. ACCENTO OCCHIO - Aggiungiamo il macro-widget sull'occhio invaso
  Ghostati.drawEyeWing(ctx, leftEye, leftBrow, 'S-P-L-A-S-H', {
    scale: 1.8,
    brow: 0.8,
    fill: 'rgba(57, 255, 20, 0.35)', // Verde tossico semitrasparente
    stroke: 'rgba(57, 255, 20, 0.95)',
    line: 'rgba(255, 255, 255, 0.9)',
    side: 'left',
    tailX: -45,
    tailY: 20
  });

  // Etichetta cybernetica posizionata asimmetricamente sulla macchia
  Ghostati.drawLabel(ctx, 'SECTOR-01-ANOMALY', nose[4].x - 85, nose[4].y + 35);
}

export function onClear(ctx) {
  Ghostati.log('Modulo Splash svuotato.', 'SPLASH');
}
