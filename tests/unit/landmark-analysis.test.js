import { describe, it, expect } from 'vitest';
import { ZONE_DELTA_STABLE, ZONE_DELTA_MEDIUM } from '../../scripts/config.js';
import {
  alignLandmarks,
  computeZoneDeltas,
  classifyZoneDelta,
  distanceToDiversity,
  seekFaceInDb,
  computeCompositeMetrics,
  decideMatchState,
} from '../../scripts/landmark-analysis.js';

function buildLandmarks() {
  const pts = [];
  for (let i = 0; i < 68; i += 1) {
    pts.push({ x: i * 2 + (i % 3), y: i * 1.5 + ((i + 1) % 4) });
  }
  pts[36] = { x: 80, y: 90 };
  pts[45] = { x: 140, y: 92 };
  return pts;
}

function mapPoints(points, mapper) {
  return points.map((p) => mapper(p));
}

function rotateAround(points, degrees, center = { x: 0, y: 0 }) {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return points.map((p) => {
    const x = p.x - center.x;
    const y = p.y - center.y;
    return {
      x: x * c - y * s + center.x,
      y: x * s + y * c + center.y,
    };
  });
}

function meanPointError(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const dx = a[i].x - b[i].x;
    const dy = a[i].y - b[i].y;
    sum += Math.sqrt(dx * dx + dy * dy);
  }
  return sum / a.length;
}

describe('landmark-analysis', () => {
  it('alignLandmarks aligns identical sets', () => {
    const base = buildLandmarks();
    const { aligned_A, aligned_B } = alignLandmarks(base, base);
    expect(aligned_A).toHaveLength(68);
    expect(aligned_B).toHaveLength(68);
    expect(meanPointError(aligned_A, aligned_B)).toBeLessThan(1e-9);
  });

  it('alignLandmarks removes pure translation', () => {
    const base = buildLandmarks();
    const shifted = mapPoints(base, (p) => ({ x: p.x + 50, y: p.y + 50 }));
    const { aligned_A, aligned_B } = alignLandmarks(shifted, base);
    expect(meanPointError(aligned_A, aligned_B)).toBeLessThan(1e-6);
  });

  it('alignLandmarks removes 15deg rotation', () => {
    const base = buildLandmarks();
    const rotated = rotateAround(base, 15, base[36]);
    const { aligned_A, aligned_B } = alignLandmarks(rotated, base);
    expect(meanPointError(aligned_A, aligned_B)).toBeLessThan(0.2);
  });

  it('alignLandmarks removes 1.5x scale', () => {
    const base = buildLandmarks();
    const scaled = mapPoints(base, (p) => ({ x: p.x * 1.5, y: p.y * 1.5 }));
    const { aligned_A, aligned_B } = alignLandmarks(scaled, base);
    expect(meanPointError(aligned_A, aligned_B)).toBeLessThan(1e-6);
  });

  it('computeZoneDeltas returns zeros for identical landmarks', () => {
    const base = buildLandmarks();
    const deltas = computeZoneDeltas(base, base);
    Object.values(deltas).forEach((v) => expect(v).toBeLessThan(1e-9));
  });

  it('computeZoneDeltas isolates a nose-only shift', () => {
    const base = buildLandmarks();
    const current = base.map((p, i) => {
      if (i >= 27 && i <= 35) return { x: p.x + 8, y: p.y + 6 };
      return { x: p.x, y: p.y };
    });

    const deltas = computeZoneDeltas(current, base);
    expect(deltas.nose).toBeGreaterThan(0.01);
    expect(deltas.nose).toBeGreaterThan(deltas.leftEye);
    expect(deltas.nose).toBeGreaterThan(deltas.rightEye);
    expect(deltas.nose).toBeGreaterThan(deltas.mouth);
  });

  it('classifyZoneDelta respects configured thresholds', () => {
    expect(classifyZoneDelta(ZONE_DELTA_STABLE - 0.0001)).toBe('stable');
    expect(classifyZoneDelta(ZONE_DELTA_STABLE + 0.0001)).toBe('medium');
    expect(classifyZoneDelta(ZONE_DELTA_MEDIUM + 0.0001)).toBe('shifted');
  });

  it('distanceToDiversity maps expected values', () => {
    expect(distanceToDiversity(0.0)).toBe(0);
    expect(distanceToDiversity(1.0)).toBe(100);
    expect(distanceToDiversity(0.58)).toBe(58);
  });

  it('seekFaceInDb returns closest match id and distance', () => {
    const liveResult = { detection: { score: 0.88 }, descriptor: [0, 0] };
    const dbFaces = [
      { id: 7, descriptor: [0.1, 0.1] },
      { id: 9, descriptor: [0.7, 0.7] },
    ];

    const found = seekFaceInDb(liveResult, dbFaces);
    expect(found.liveScore).toBe(0.88);
    expect(found.liveMinId).toBe(7);
    expect(found.liveMinDist).toBeLessThan(0.2);
  });

  it('computeCompositeMetrics computes nearest obfuscated match', () => {
    const composite = {
      obfuscatedResult: {
        detection: { score: 0.66 },
        descriptor: [0.1, 0.1],
      },
      weakDetection: false,
    };
    const dbFaces = [
      { id: 1, descriptor: [0.1, 0.1] },
      { id: 2, descriptor: [0.9, 0.9] },
    ];

    const metrics = computeCompositeMetrics(composite, dbFaces);
    expect(metrics.obfScore).toBe(0.66);
    expect(metrics.obfMinId).toBe(1);
    expect(metrics.weakDetection).toBe(false);
    expect(metrics.detectionTotallyFailed).toBe(false);
  });

  it('decideMatchState returns expected headline/state variants', () => {
    const matched = decideMatchState({
      liveMinDist: 0.2,
      liveMinId: 3,
      obfMinDist: null,
      obfMinId: null,
      weakDetection: false,
      detectionTotallyFailed: false,
      matchThreshold: 0.58,
    });
    expect(matched.detectionState).toBe('matched');

    const eludedByGhostyle = decideMatchState({
      liveMinDist: 0.2,
      liveMinId: 3,
      obfMinDist: null,
      obfMinId: null,
      weakDetection: false,
      detectionTotallyFailed: true,
      matchThreshold: 0.58,
    });
    expect(eludedByGhostyle.detectionState).toBe('eluded');
    expect(eludedByGhostyle.headline).toContain('Rilevatore ingannato dal Ghostyle');
  });
});
