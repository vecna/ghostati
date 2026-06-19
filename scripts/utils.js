
function distance(a, b) {
   if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
   let sum = 0;
   for (let i = 0; i < a.length; i += 1) {
      const d = a[i] - b[i];
      sum += d * d;
   }
   return Math.sqrt(sum);
}

function computeMatchState(stateo, descriptor) {
   if (!descriptor || stateo.db.faces.length === 0) return 'unknown';
   const minDist = Math.min(...stateo.db.faces.map(e => distance(descriptor, e.descriptor)));
   console.log("utils.computeMatchState:", minDist <= stateo.MATCH_THRESHOLD ? 'matched' : 'eluded');
   return minDist <= stateo.MATCH_THRESHOLD ? 'matched' : 'eluded';
}

function avgPoint(points) {
   const total = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
   return { x: total.x / points.length, y: total.y / points.length };
}

function lerp(a, b, t) {
   return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function scaleFrom(center, point, scale) {
   return { x: center.x + (point.x - center.x) * scale, y: center.y + (point.y - center.y) * scale };
}

function point(x, y) {
   return { x, y };
}

function drawClosedPath(ctx, points, fillStyle = null, strokeStyle = null, lineWidth = 2) {
   if (!points.length) return;
   ctx.beginPath();
   ctx.moveTo(points[0].x, points[0].y);
   for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
   ctx.closePath();
   if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
   }
   if (strokeStyle) {
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeStyle;
      ctx.stroke();
   }
}

function drawOpenPath(ctx, points, strokeStyle, lineWidth = 2, dashed = false) {
   if (!points.length) return;
   ctx.save();
   ctx.beginPath();
   ctx.moveTo(points[0].x, points[0].y);
   for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
   ctx.lineWidth = lineWidth;
   ctx.strokeStyle = strokeStyle;
   if (dashed) ctx.setLineDash([10, 8]);
   ctx.stroke();
   ctx.restore();
}

function drawLabel(ctx, text, x, y) {
   ctx.save();
   ctx.font = '700 14px Inter, system-ui, sans-serif';
   const padX = 10;
   const padY = 7;
   const width = ctx.measureText(text).width + padX * 2;
   const height = 30;

   if (state.isMirrored) {
      ctx.translate(x + width / 2, y - height / 2);
      ctx.scale(-1, 1);
      ctx.translate(-(x + width / 2), -(y - height / 2));
   }

   ctx.fillStyle = 'rgba(15, 17, 21, 0.78)';
   ctx.strokeStyle = 'rgba(255,255,255,0.10)';
   ctx.lineWidth = 1;
   roundRect(ctx, x, y - height, width, height, 12);
   ctx.fill();
   ctx.stroke();
   ctx.fillStyle = 'rgba(238, 242, 255, 0.96)';
   ctx.fillText(text, x + padX, y - 10);
   ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
   ctx.beginPath();
   ctx.moveTo(x + r, y);
   ctx.arcTo(x + w, y, x + w, y + h, r);
   ctx.arcTo(x + w, y + h, x, y + h, r);
   ctx.arcTo(x, y + h, x, y, r);
   ctx.arcTo(x, y, x + w, y, r);
   ctx.closePath();
}

function expandEyePolygon(eye, eyebrow, scale = 1.22, eyebrowLift = 0.72) {
   const center = avgPoint(eye);
   const topBrow = eyebrow.map((b, idx) => {
      const eyeRef = eye[Math.min(idx + 1, eye.length - 1)] || eye[eye.length - 1];
      return lerp(eyeRef, b, eyebrowLift);
   });
   const expandedEye = eye.map(pt => scaleFrom(center, pt, scale));
   return [...topBrow, expandedEye[3], expandedEye[4], expandedEye[5], expandedEye[0]];
}

function drawEyeWing(ctx, eye, eyebrow, label, tone) {
   const eyeShape = expandEyePolygon(eye, eyebrow, tone.scale, tone.brow);
   drawClosedPath(ctx, eyeShape, tone.fill, tone.stroke, 2.2);
   const outerCorner = tone.side === 'left'
      ? eye.reduce((best, p) => (p.x < best.x ? p : best), eye[0])
      : eye.reduce((best, p) => (p.x > best.x ? p : best), eye[0]);
   const tailTop = point(outerCorner.x + tone.tailX, outerCorner.y - tone.tailY);
   const tailLow = point(outerCorner.x + tone.tailX * 0.7, outerCorner.y + tone.tailY * 0.12);
   drawClosedPath(ctx, [outerCorner, tailTop, tailLow], tone.fill, tone.stroke, 2.2);
   const sorted = [...eye].sort((a, b) => a.x - b.x);
   const linePts = tone.side === 'left' ? [sorted[2], sorted[1], sorted[0], tailTop] : [sorted[sorted.length - 3], sorted[sorted.length - 2], sorted[sorted.length - 1], tailTop];
   drawOpenPath(ctx, linePts, tone.line, 3.2);
   drawLabel(ctx, label, tailTop.x + (tone.side === 'left' ? -52 : 10), tailTop.y - 10);
}

function drawCheekSweep(ctx, anchor, noseSide, mouthCorner, jawPoint, label, fill, stroke) {
   const upper = lerp(anchor, noseSide, 0.42);
   const lower = lerp(mouthCorner, jawPoint, 0.36);
   const side = lerp(anchor, jawPoint, 0.54);
   const cheek = [
      upper,
      lerp(anchor, side, 0.45),
      side,
      lower,
      lerp(lower, mouthCorner, 0.55),
      lerp(mouthCorner, noseSide, 0.42)
   ];
   drawClosedPath(ctx, cheek, fill, stroke, 1.8);
   drawLabel(ctx, label, side.x - 20, side.y - 12);
}

function drawContourBand(ctx, pts, label) {
   drawOpenPath(ctx, pts, 'rgba(193, 154, 107, 0.95)', 7, true);
   drawOpenPath(ctx, pts, 'rgba(90, 54, 33, 0.22)', 16);
   const mid = pts[Math.floor(pts.length / 2)];
   drawLabel(ctx, label, mid.x + 10, mid.y - 6);
}

function formatTime() {
   const now = new Date();
   return now.toTimeString().split(' ')[0]; // Returns HH:MM:SS
}
