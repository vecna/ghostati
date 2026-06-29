/** @module landmark-analysis */
import { state } from './state.js';
import { distance } from './utils.js';

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
   const thresholdDiversity = distanceToDiversity(matchThreshold);

   if (obfMinDist != null || weakDetection || detectionTotallyFailed) {
      if (typeof obfMinId === 'number' && obfMinDist <= matchThreshold) {
         const obfDiversity = distanceToDiversity(obfMinDist);
         return {
            detectionState: 'unclear',
            headline: `Il rilevatore con il Ghostyle vede il volto con ID ${obfMinId} - diversita ${obfDiversity}%.`,
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

      const obfDiversity = distanceToDiversity(obfMinDist);
      return {
         detectionState: 'eluded',
         headline: `Ghostyle attivo: volto rilevato ma diversita ${obfDiversity}% sopra soglia ${thresholdDiversity}%.`,
         distance: obfMinDist,
         matchedId: null,
      };
   }

   if (typeof liveMinDist === 'number' && liveMinDist <= matchThreshold) {
      const liveDiversity = distanceToDiversity(liveMinDist);
      return {
         detectionState: 'matched',
         headline: `Corrispondenza trovata: ID ${liveMinId} (diversita ${liveDiversity}% sotto soglia ${thresholdDiversity}%).`,
         distance: liveMinDist,
         matchedId: liveMinId,
      };
   }

   const liveDiversity = distanceToDiversity(liveMinDist);
   return {
      detectionState: 'eluded',
      headline: `Nessuna corrispondenza: diversita ${liveDiversity}% sopra soglia ${thresholdDiversity}%.`,
      distance: liveMinDist,
      matchedId: null,
   };
}
