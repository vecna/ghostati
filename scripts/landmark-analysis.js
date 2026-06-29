/** @module landmark-analysis */
import { state } from './state.js';
import { distance } from './utils.js';
import { ZONE_DELTA_STABLE, ZONE_DELTA_MEDIUM } from './config.js';

export const ZONE_GROUPS = {
   jawOutline: { start: 0, end: 16, label: 'Mascella' },
   leftEyeBrow: { start: 17, end: 21, label: 'Sopracciglio sinistro' },
   rightEyeBrow: { start: 22, end: 26, label: 'Sopracciglio destro' },
   nose: { start: 27, end: 35, label: 'Naso' },
   leftEye: { start: 36, end: 41, label: 'Occhio sinistro' },
   rightEye: { start: 42, end: 47, label: 'Occhio destro' },
   mouth: { start: 48, end: 67, label: 'Bocca' },
};

const LEFT_EYE_OUTER_INDEX = 36;
const RIGHT_EYE_OUTER_INDEX = 45;

function toPointArray(landmarksLike) {
   if (!landmarksLike) return [];
   if (Array.isArray(landmarksLike)) {
      return landmarksLike.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
   }
   if (typeof landmarksLike.positions === 'object' && Array.isArray(landmarksLike.positions)) {
      return landmarksLike.positions.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
   }
   return [];
}

function centroid(points) {
   if (!points.length) return { x: 0, y: 0 };
   let sx = 0;
   let sy = 0;
   for (const p of points) {
      sx += p.x;
      sy += p.y;
   }
   return { x: sx / points.length, y: sy / points.length };
}

function rotatePoint(point, radians) {
   const c = Math.cos(radians);
   const s = Math.sin(radians);
   return {
      x: point.x * c - point.y * s,
      y: point.x * s + point.y * c,
   };
}

function eyeAngle(points) {
   const left = points[LEFT_EYE_OUTER_INDEX];
   const right = points[RIGHT_EYE_OUTER_INDEX];
   if (!left || !right) return 0;
   return Math.atan2(right.y - left.y, right.x - left.x);
}

function eyeDistance(points) {
   const left = points[LEFT_EYE_OUTER_INDEX];
   const right = points[RIGHT_EYE_OUTER_INDEX];
   if (!left || !right) return 1;
   const dx = right.x - left.x;
   const dy = right.y - left.y;
   const d = Math.sqrt(dx * dx + dy * dy);
   return d > 0 ? d : 1;
}

function normalizeAroundCentroid(points) {
   const c = centroid(points);
   return points.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

export function alignLandmarks(landmarksA, landmarksB) {
   const pointsA = toPointArray(landmarksA);
   const pointsB = toPointArray(landmarksB);
   if (pointsA.length !== 68 || pointsB.length !== 68) {
      return { aligned_A: [], aligned_B: [] };
   }

   const centeredA = normalizeAroundCentroid(pointsA);
   const centeredB = normalizeAroundCentroid(pointsB);

   const angleA = eyeAngle(centeredA);
   const angleB = eyeAngle(centeredB);
   const rot = angleB - angleA;
   const rotatedA = centeredA.map((p) => rotatePoint(p, rot));

   const distA = eyeDistance(rotatedA);
   const distB = eyeDistance(centeredB);
   const scale = distA > 0 ? distB / distA : 1;
   const scaledA = rotatedA.map((p) => ({ x: p.x * scale, y: p.y * scale }));

   return {
      aligned_A: scaledA,
      aligned_B: centeredB,
   };
}

function groupIndices(groupName) {
   const spec = ZONE_GROUPS[groupName];
   const idx = [];
   if (!spec) return idx;
   for (let i = spec.start; i <= spec.end; i += 1) idx.push(i);
   return idx;
}

function euclidean(p1, p2) {
   const dx = p1.x - p2.x;
   const dy = p1.y - p2.y;
   return Math.sqrt(dx * dx + dy * dy);
}

export function computeZoneDeltas(landmarksCurrent, landmarksBase) {
   const { aligned_A, aligned_B } = alignLandmarks(landmarksCurrent, landmarksBase);
   const out = {};

   for (const groupName of Object.keys(ZONE_GROUPS)) {
      const indices = groupIndices(groupName);
      if (!indices.length || aligned_A.length !== 68 || aligned_B.length !== 68) {
         out[groupName] = 0;
         continue;
      }

      let sum = 0;
      for (const i of indices) {
         sum += euclidean(aligned_A[i], aligned_B[i]);
      }
      out[groupName] = sum / indices.length;
   }

   return out;
}

export function classifyZoneDelta(delta) {
   if (delta < ZONE_DELTA_STABLE) return 'stable';
   if (delta <= ZONE_DELTA_MEDIUM) return 'medium';
   return 'shifted';
}

export function distanceToDiversity(dist) {
   if (!Number.isFinite(dist) || dist <= 0) return 0;
   return Math.min(100, Math.round(dist * 100));
}

export function seekFaceInDb(liveResult, dbFaces = state.db?.faces || []) {
   const liveScore = liveResult?.detection?.score ?? null;
   const descriptor = liveResult?.descriptor;
   if (!descriptor || !Array.isArray(dbFaces) || dbFaces.length === 0) {
      return { liveScore, liveMinDist: null, liveMinId: null };
   }

   const distances = dbFaces.map((e) => ({
      id: e.id,
      distance: distance(descriptor, e.descriptor),
   })).sort((a, b) => a.distance - b.distance);

   const liveMinDist = distances.length ? distances[0].distance : null;
   const liveMinId = distances.length ? distances[0].id : null;
   return { liveScore, liveMinDist, liveMinId };
}

export function computeCompositeMetrics(composite, dbFaces = state.db?.faces || []) {
   if (!composite || !composite.obfuscatedResult) {
      return {
         obfScore: null,
         obfMinDist: null,
         obfMinId: null,
         weakDetection: !!composite?.weakDetection,
         detectionTotallyFailed: true,
      };
   }

   const obfScore = composite.obfuscatedResult?.detection?.score ?? null;
   const descriptor = composite.obfuscatedResult?.descriptor;
   const distances = Array.isArray(dbFaces)
      ? dbFaces.map((e) => ({ id: e.id, distance: distance(descriptor, e.descriptor) })).sort((a, b) => a.distance - b.distance)
      : [];

   const obfMinDist = distances.length ? distances[0].distance : null;
   const obfMinId = distances.length ? distances[0].id : null;

   return {
      obfScore,
      obfMinDist,
      obfMinId,
      weakDetection: !!composite.weakDetection,
      detectionTotallyFailed: false,
   };
}

export function decideMatchState({
   liveMinDist,
   liveMinId,
   obfMinDist,
   obfMinId,
   weakDetection,
   detectionTotallyFailed,
   matchThreshold = state.MATCH_THRESHOLD,
}) {
   if (obfMinDist != null || weakDetection || detectionTotallyFailed) {
      if (typeof obfMinId === 'number' && obfMinDist <= matchThreshold) {
         return {
            detectionState: 'unclear',
            headline: `Il rilevatore con il Ghostyle vede il volto con ID ${obfMinId} - confidenza ${obfMinDist.toFixed(3)}.`,
            distance: obfMinDist,
            matchedId: obfMinId,
         };
      }
      if (detectionTotallyFailed) {
         return {
            detectionState: 'eluded',
            headline: 'Rilevatore ingannato dal Ghostyle! face-api non trova un volto nel disegno composito.',
            distance: obfMinDist,
            matchedId: null,
         };
      }
      if (weakDetection) {
         return {
            detectionState: 'eluded',
            headline: 'Individuazione sul Ghostyle con bassa confidenza (face-api non vede chiaramente un volto).',
            distance: obfMinDist,
            matchedId: null,
         };
      }

      return {
         detectionState: 'eluded',
         headline: `Ghostyle attivo: volto rilevato ma nessun ID sotto la soglia di ${matchThreshold.toFixed(2)} (distanza ${obfMinDist.toFixed(3)}).`,
         distance: obfMinDist,
         matchedId: null,
      };
   }

   if (typeof liveMinDist === 'number' && liveMinDist <= matchThreshold) {
      return {
         detectionState: 'matched',
         headline: `Corrispondenza trovata: ID ${liveMinId} (distanza ${liveMinDist.toFixed(3)} <= ${matchThreshold.toFixed(2)}).`,
         distance: liveMinDist,
         matchedId: liveMinId,
      };
   }

   return {
      detectionState: 'eluded',
      headline: `Nessuna corrispondenza sotto la soglia di ${matchThreshold.toFixed(2)}.`,
      distance: liveMinDist,
      matchedId: null,
   };
}
