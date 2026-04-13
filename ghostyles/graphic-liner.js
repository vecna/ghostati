/**
 * ==Ghostyle==
 * @name         Graphic Liner
 * @version      1.0.0
 * @author       Nina
 * @description  Un eyeliner marcato che estende e altera le proporzioni dell'occhio.
 * ==/Ghostyle==
 */

export function onDraw(ctx, landmarks, box) {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const leftBrow = landmarks.getLeftEyeBrow();
  const rightBrow = landmarks.getRightEyeBrow();

  Ghostati.drawEyeWing(ctx, leftEye, leftBrow, 'liner', {
    fill: 'rgba(32, 32, 38, 0.28)',
    stroke: 'rgba(248, 248, 255, 0.80)',
    line: 'rgba(255, 255, 255, 0.96)',
    tailX: -34,
    tailY: 30,
    scale: 1.08,
    brow: 0.56,
    side: 'left'
  });
  Ghostati.drawEyeWing(ctx, rightEye, rightBrow, 'liner', {
    fill: 'rgba(32, 32, 38, 0.28)',
    stroke: 'rgba(248, 248, 255, 0.80)',
    line: 'rgba(255, 255, 255, 0.96)',
    tailX: 34,
    tailY: 30,
    scale: 1.08,
    brow: 0.56,
    side: 'right'
  });
}
