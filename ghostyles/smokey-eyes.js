/**
 * ==Ghostyle==
 * @name         Smokey Eyes
 * @version      1.0.0
 * @author       Nina
 * @description  Genera forme asimmetriche scure attorno all'area oculare per confondere l'estrazione.
 * ==/Ghostyle==
 */

export function onDraw(ctx, landmarks, box) {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const leftBrow = landmarks.getLeftEyeBrow();
  const rightBrow = landmarks.getRightEyeBrow();
  const leftEyeCenter = Ghostati.avgPoint(leftEye);
  const rightEyeCenter = Ghostati.avgPoint(rightEye);

  const leftShape = Ghostati.expandEyePolygon(leftEye, leftBrow, 1.32, 0.8).map(p => Ghostati.point(p.x - 8, p.y + 4));
  const rightShape = Ghostati.expandEyePolygon(rightEye, rightBrow, 1.32, 0.8).map(p => Ghostati.point(p.x + 8, p.y + 4));
  
  Ghostati.drawClosedPath(ctx, leftShape, 'rgba(125, 86, 172, 0.32)', 'rgba(194, 157, 255, 0.44)', 2);
  Ghostati.drawClosedPath(ctx, rightShape, 'rgba(125, 86, 172, 0.32)', 'rgba(194, 157, 255, 0.44)', 2);
  
  Ghostati.drawOpenPath(ctx, [leftEye[0], leftEye[1], leftEye[2], leftEye[3]], 'rgba(244, 236, 255, 0.92)', 2.6);
  Ghostati.drawOpenPath(ctx, [rightEye[0], rightEye[1], rightEye[2], rightEye[3]], 'rgba(244, 236, 255, 0.92)', 2.6);
  
  Ghostati.drawLabel(ctx, 'ombretto', leftEyeCenter.x - 20, leftEyeCenter.y - 40);
  Ghostati.drawLabel(ctx, 'ombretto', rightEyeCenter.x + 18, rightEyeCenter.y - 40);
}
