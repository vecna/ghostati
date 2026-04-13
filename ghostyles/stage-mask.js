/**
 * ==Ghostyle==
 * @name         Stage Mask
 * @version      1.0.0
 * @author       Nina
 * @description  Una maschera ad alto contrasto che unisce la regione degli occhi bloccando l'intero set.
 * ==/Ghostyle==
 */

export function onDraw(ctx, landmarks, box) {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const leftBrow = landmarks.getLeftEyeBrow();
  const rightBrow = landmarks.getRightEyeBrow();
  const leftEyeCenter = Ghostati.avgPoint(leftEye);
  const rightEyeCenter = Ghostati.avgPoint(rightEye);

  const leftMask = Ghostati.expandEyePolygon(leftEye, leftBrow, 1.46, 0.92).map((p, i) => i < 5 ? Ghostati.point(p.x - 18, p.y - 10) : Ghostati.point(p.x - 12, p.y + 10));
  const rightMask = Ghostati.expandEyePolygon(rightEye, rightBrow, 1.46, 0.92).map((p, i) => i < 5 ? Ghostati.point(p.x + 18, p.y - 10) : Ghostati.point(p.x + 12, p.y + 10));
  const bridge = [leftMask[0], Ghostati.point((leftEyeCenter.x + rightEyeCenter.x) / 2, box.y + box.height * 0.34), rightMask[4], rightMask[5], Ghostati.point((leftEyeCenter.x + rightEyeCenter.x) / 2, box.y + box.height * 0.52), leftMask[leftMask.length - 1]];
  
  Ghostati.drawClosedPath(ctx, [...leftMask, ...bridge], 'rgba(92, 176, 255, 0.22)', 'rgba(176, 226, 255, 0.70)', 2.2);
  Ghostati.drawClosedPath(ctx, [...rightMask, bridge[1], bridge[0]], 'rgba(92, 176, 255, 0.22)', 'rgba(176, 226, 255, 0.70)', 2.2);
  Ghostati.drawLabel(ctx, 'stage mask', (leftEyeCenter.x + rightEyeCenter.x) / 2 - 24, box.y + 42);
}
