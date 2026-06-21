/** @module utils */
import { state } from './state.js';

/**
 * Compute Euclidean distance between two equal-length numeric arrays.
 * @param {number[]} a - First coordinate array.
 * @param {number[]} b - Second coordinate array.
 * @returns {number} Euclidean distance, or Infinity if inputs are invalid.
 * @see computeMatchState – uses distance to compare descriptors.
 */
export function distance(a, b) {
   if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
   let sum = 0;
   for (let i = 0; i < a.length; i += 1) {
      const d = a[i] - b[i];
      sum += d * d;
   }
   return Math.sqrt(sum);
}

/**
 * Compute match state for a face descriptor against the database.
 * @param {Object} descriptor - Face descriptor to compare.
 * @returns {string} 'unknown', 'matched', or 'eluded' based on distance threshold.
 * @see distance – called internally for each face.
 */
export function computeMatchState(descriptor) {
   if (!descriptor || state.db.faces.length === 0) return 'unknown';
   const minDist = Math.min(...state.db.faces.map(e => distance(descriptor, e.descriptor)));
   return minDist <= state.MATCH_THRESHOLD ? 'matched' : 'eluded';
}

/**
 * Compute the average point from an array of points.
 * @param {Object[]} points - Array of points with x and y properties.
 * @returns {Object} Average point with x and y.
 * @see expandEyePolygon – uses avgPoint to find eye center.
 */
export function avgPoint(points) {
   const total = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
   return { x: total.x / points.length, y: total.y / points.length };
}

/**
 * Linear interpolation between two points.
 * @param {Object} a - Start point.
 * @param {Object} b - End point.
 * @param {number} t - Interpolation factor [0,1].
 * @returns {Object} Interpolated point.
 * @see expandEyePolygon – uses lerp for eyebrow lift.
 * @see drawEyeWing – uses lerp for geometry.
 * @see drawCheekSweep – uses lerp for segment points.
 */
export function lerp(a, b, t) {
   return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Scale a point away from a center point.
 * @param {Object} center - Center point.
 * @param {Object} point - Point to scale.
 * @param {number} scale - Scale factor.
 * @returns {Object} Scaled point.
 * @see expandEyePolygon – uses scaleFrom to enlarge eye shape.
 */
export function scaleFrom(center, point, scale) {
   return { x: center.x + (point.x - center.x) * scale, y: center.y + (point.y - center.y) * scale };
}

/**
 * Create a point object.
 * @param {number} x - X coordinate.
 * @param {number} y - Y coordinate.
 * @returns {Object} Point with x and y.
 * @see expandEyePolygon – uses point for constructing extra points.
 */
export function point(x, y) {
   return { x, y };
}

/**
 * Draw a closed path on a canvas, optionally filling and stroking.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {Object[]} points - Array of points defining the path.
 * @param {string|null} [fillStyle=null] - Fill color/style.
 * @param {string|null} [strokeStyle=null] - Stroke color/style.
 * @param {number} [lineWidth=2] - Width of the stroke.
 * @see drawEyeWing – uses to render eye shape.
 * @see drawCheekSweep – uses to render cheek area.
 * @see drawContourBand – uses to render contour outlines.
 */
export function drawClosedPath(ctx, points, fillStyle = null, strokeStyle = null, lineWidth = 2) {
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

/**
 * Draw an open path on a canvas.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {Object[]} points - Array of points defining the path.
 * @param {string} strokeStyle - Stroke color/style.
 * @param {number} [lineWidth=2] - Width of the stroke.
 * @param {boolean} [dashed=false] - Whether to use dashed line.
 * @see drawEyeWing – draws eye outline with dashed optional.
 * @see drawContourBand – draws multiple layered bands.
 * @see drawCheekSweep – draws cheek lines.
 */
export function drawOpenPath(ctx, points, strokeStyle, lineWidth = 2, dashed = false) {
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

/**
 * Draw a labeled box with text on a canvas.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {string} text - Text to display.
 * @param {number} x - X coordinate of the label.
 * @param {number} y - Y coordinate of the label.
 * @see drawEyeWing – adds label to eye wing.
 * @see drawCheekSweep – adds label to cheek sweep.
 * @see drawContourBand – adds label to contour band.
 */
export function drawLabel(ctx, text, x, y) {
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

/**
 * Draw a rounded rectangle path.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {number} x - X coordinate of the rectangle.
 * @param {number} y - Y coordinate of the rectangle.
 * @param {number} w - Width of the rectangle.
 * @param {number} h - Height of the rectangle.
 * @param {number} r - Corner radius.
 * @see drawLabel – used within to render background of label.
 */
export function roundRect(ctx, x, y, w, h, r) {
   ctx.beginPath();
   ctx.moveTo(x + r, y);
   ctx.arcTo(x + w, y, x + w, y + h, r);
   ctx.arcTo(x + w, y + h, x, y + h, r);
   ctx.arcTo(x, y + h, x, y, r);
   ctx.arcTo(x, y, x + w, y, r);
   ctx.closePath();
}

/**
 * Expand an eye polygon based on eyebrow and scaling factors.
 * @param {Object[]} eye - Array of eye points.
 * @param {Object[]} eyebrow - Array of eyebrow points.
 * @param {number} [scale=1.22] - Scale factor for eye.
 * @param {number} [eyebrowLift=0.72] - Lift factor for eyebrows.
 * @returns {Object[]} Expanded eye polygon points.
 * @see drawEyeWing – primary consumer of this function.
 */
export function expandEyePolygon(eye, eyebrow, scale = 1.22, eyebrowLift = 0.72) {
   const center = avgPoint(eye);
   const topBrow = eyebrow.map((b, idx) => {
      const eyeRef = eye[Math.min(idx + 1, eye.length - 1)] || eye[eye.length - 1];
      return lerp(eyeRef, b, eyebrowLift);
   });
   const expandedEye = eye.map(pt => scaleFrom(center, pt, scale));
   return [...topBrow, expandedEye[3], expandedEye[4], expandedEye[5], expandedEye[0]];
}

/**
 * Draw an eye wing with label and styling.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {Object[]} eye - Eye points.
 * @param {Object[]} eyebrow - Eyebrow points.
 * @param {string} label - Text label.
 * @param {Object} tone - Styling parameters.
 * @see expandEyePolygon – called to compute shape.
 */
export function drawEyeWing(ctx, eye, eyebrow, label, tone) {
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

/**
 * Draw a cheek sweep with label.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {Object} anchor - Anchor point.
 * @param {Object} noseSide - Nose side point.
 * @param {Object} mouthCorner - Mouth corner point.
 * @param {Object} jawPoint - Jaw point.
 * @param {string} label - Text label.
 * @param {string} fill - Fill style.
 * @param {string} stroke - Stroke style.
 * @see lerp – used for point interpolation.
 */
export function drawCheekSweep(ctx, anchor, noseSide, mouthCorner, jawPoint, label, fill, stroke) {
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

/**
 * Draw a contour band with label.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {Object[]} pts - Points defining the band.
 * @param {string} label - Text label.
 * @see drawOpenPath – used twice for layered strokes.
 */
export function drawContourBand(ctx, pts, label) {
   drawOpenPath(ctx, pts, 'rgba(193, 154, 107, 0.95)', 7, true);
   drawOpenPath(ctx, pts, 'rgba(90, 54, 33, 0.22)', 16);
   const mid = pts[Math.floor(pts.length / 2)];
   drawLabel(ctx, label, mid.x + 10, mid.y - 6);
}

/**
 * Return the current time as a HH:MM:SS string.
 * @returns {string} Formatted time.
 * @see setLog – prefixes log messages with this timestamp.
 */
export function formatTime() {
   const now = new Date();
   return now.toTimeString().split(' ')[0]; // Returns HH:MM:SS
}

/**
 * Update the on‑screen log display based on the current state.
 * Handles both expanded and collapsed views.
 * @see setLog – called after pushing a new log entry.
 */
export function updateLogDisplay() {
   const logBox = document.getElementById('logBox');
   if (!logBox) return;
   logBox.innerHTML = '';

   if (state.isLogExpanded) {
      logBox.classList.add('expanded');
      const startIdx = Math.max(0, state.logsArchive.length - 100);
      for (let i = startIdx; i < state.logsArchive.length; i++) {
         const clone = state.logsArchive[i].cloneNode(true);
         logBox.appendChild(clone);
      }
      logBox.scrollTop = logBox.scrollHeight;
   } else {
      logBox.classList.remove('expanded');
      let renderedCount = 0;
      for (let i = state.logsArchive.length - 1; i >= state.visibleLogStartIndex && renderedCount < 4; i--) {
         const clone = state.logsArchive[i].cloneNode(true);
         logBox.insertBefore(clone, logBox.firstChild);
         renderedCount++;
      }
   }
}


/**
 * Append a new log line to the log archive and refresh the display.
 * @param {string} message - Log message.
 * @param {string|null} [sourcePlugin=null] - Optional source identifier.
 * @see formatTime – adds timestamp to each log line.
 * @see updateLogDisplay – refreshes UI after adding entry.
 */
export function setLog(message, sourcePlugin = null) {
   const line = document.createElement('div');
   line.className = 'log-line';

   const timeSpan = document.createElement('span');
   timeSpan.style.color = 'var(--muted)';
   timeSpan.style.marginRight = '8px';
   timeSpan.textContent = `[${formatTime()}]`;
   line.appendChild(timeSpan);

   if (sourcePlugin) {
      const span = document.createElement('span');
      span.style.color = 'var(--accent-2)';
      span.style.fontWeight = '800';
      span.style.marginRight = '8px';
      span.textContent = `[${sourcePlugin.toUpperCase()}]`;
      line.appendChild(span);
   }
   const textSpan = document.createElement('span');
   textSpan.textContent = message;
   line.appendChild(textSpan);

   state.logsArchive.push(line);
   if (state.logsArchive.length > 100) {
      state.logsArchive.shift();
      if (state.visibleLogStartIndex > 0) state.visibleLogStartIndex--;
   }

   updateLogDisplay();
}