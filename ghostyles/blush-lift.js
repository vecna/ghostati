/**
 * ==Ghostyle==
 * @name         Blush Lift
 * @version      1.0.0
 * @author       Nina
 * @description  Aggiunge blocchi speculari rosa che sfumano il rilevamento termico e della mascella.
 * ==/Ghostyle==
 */

export function onDraw(ctx, landmarks, box) {
  const jaw = landmarks.getJawOutline();
  const mouth = landmarks.getMouth();
  const nose = landmarks.getNose();

  Ghostati.drawCheekSweep(
    ctx,
    jaw[2],
    nose[2],
    mouth[0],
    jaw[4],
    'blush',
    'rgba(255, 138, 176, 0.22)',
    'rgba(255, 187, 208, 0.55)'
  );
  Ghostati.drawCheekSweep(
    ctx,
    jaw[14],
    nose[6],
    mouth[6],
    jaw[12],
    'blush',
    'rgba(255, 138, 176, 0.22)',
    'rgba(255, 187, 208, 0.55)'
  );
}
