import { describe, it, expect, beforeEach } from 'vitest';
import '../../scripts/main.js';
import { state } from '../../scripts/state.js';

describe('Ghostati utils and state logic', () => {
  let Ghostati;

  beforeEach(() => {
    window.localStorage.clear();
    state.db = { nextId: 0, faces: [] };
    state.MATCH_THRESHOLD = 0.58;
    Ghostati = window.Ghostati;
  });

  describe('Math utilities', () => {
    it('should correctly calculate distance between two descriptors', () => {
      const a = [0.1, 0.2, 0.3];
      const b = [0.1, 0.5, 0.3];
      // distance = sqrt((0.1-0.1)^2 + (0.2-0.5)^2 + (0.3-0.3)^2) = sqrt(0 + 0.09 + 0) = 0.3
      const dist = Ghostati.distance(a, b);
      expect(dist).toBeCloseTo(0.3);
    });

    it('should return infinity for invalid descriptors', () => {
      expect(Ghostati.distance(null, [0.1])).toBe(Number.POSITIVE_INFINITY);
      expect(Ghostati.distance([0.1], [0.1, 0.2])).toBe(Number.POSITIVE_INFINITY);
    });

    it('should correctly calculate avgPoint', () => {
      const points = [{ x: 10, y: 20 }, { x: 30, y: 40 }];
      const avg = Ghostati.avgPoint(points);
      expect(avg).toEqual({ x: 20, y: 30 });
    });

    it('should correctly calculate lerp', () => {
      const a = { x: 0, y: 0 };
      const b = { x: 100, y: 100 };
      const result = Ghostati.lerp(a, b, 0.5);
      expect(result).toEqual({ x: 50, y: 50 });
    });

    it('should correctly scale a point from center', () => {
      const center = { x: 50, y: 50 };
      const pt = { x: 60, y: 60 };
      const scaled = Ghostati.scaleFrom(center, pt, 2);
      // distance from center is 10,10. Scaled by 2 is 20,20. So 50+20=70
      expect(scaled).toEqual({ x: 70, y: 70 });
    });
  });

  describe('State and API accessors', () => {
    it('should expose threshold through the public API', () => {
      expect(Ghostati.getMatchThreshold()).toBeCloseTo(0.58);
    });

    it('should return a cloned DB snapshot', () => {
      state.db.faces = [{ id: 1, descriptor: [0.1, 0.2] }];
      const copy = Ghostati.getDb();
      expect(copy.faces.length).toBe(1);
      copy.faces.push({ id: 2, descriptor: [0.4, 0.5] });
      expect(Ghostati.getDb().faces.length).toBe(1);
    });
  });
});
