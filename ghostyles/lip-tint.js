/**
 * ==Ghostyle==
 * @name         Lip Tint
 * @version      1.0.0
 * @author       Nina
 * @description  Inverte i contrasti delle labbra per aggirare le feature biometriche.
 * ==/Ghostyle==
 */

export function onDraw(ctx, landmarks, box) {
  const mouth = landmarks.getMouth();
  const mouthCenter = Ghostati.avgPoint(mouth.slice(0, 7));
  const outer = mouth.slice(0, 12);
  const inner = mouth.slice(12);

  Ghostati.drawClosedPath(ctx, outer, 'rgba(232, 81, 116, 0.40)', 'rgba(255, 201, 211, 0.70)', 2.1);
  Ghostati.drawClosedPath(ctx, inner, 'rgba(255,255,255,0.18)', null, 0);
  Ghostati.drawLabel(ctx, 'lip tint', mouthCenter.x + 12, mouthCenter.y - 16);
}
