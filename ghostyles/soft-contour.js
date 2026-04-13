/**
 * ==Ghostyle==
 * @name         Soft Contour
 * @version      1.0.0
 * @author       Nina
 * @description  Aggiunge strati asimmetrici alla geometria della cavità nasale.
 * ==/Ghostyle==
 */

export function onDraw(ctx, landmarks, box) {
  const jaw = landmarks.getJawOutline();
  const nose = landmarks.getNose();

  Ghostati.drawContourBand(ctx, [jaw[1], jaw[2], jaw[3], jaw[4], jaw[5]], 'contour');
  Ghostati.drawContourBand(ctx, [jaw[15], jaw[14], jaw[13], jaw[12], jaw[11]], 'contour');
  Ghostati.drawContourBand(ctx, [nose[0], nose[1], nose[2]], 'nose contour');
  Ghostati.drawContourBand(ctx, [nose[4], nose[5], nose[6]], 'nose contour');
}
