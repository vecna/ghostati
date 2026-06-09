import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../scripts/ghostati.js';

describe('Ghostati Utils & Core Logic', () => {
  let Ghostati;

  beforeEach(() => {
    // Reset localStorage before each test
    window.localStorage.clear();
    // Re-initialize DB by calling the internal functions if possible, 
    // or we can test purely state-independent functions first.
    Ghostati = window.Ghostati;
    // Mock CustomEvent
    window.CustomEvent = class CustomEvent {
      constructor(type, detail) {
        this.type = type;
        this.detail = detail;
      }
    };
  });

  describe('Math Utils', () => {
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

  describe('State and DB', () => {
    it('should initialize empty DB', () => {
      const db = Ghostati.getDb();
      expect(db).toBeDefined();
    });

    it('should compute match state as unknown when DB is empty', () => {
      const state = Ghostati.computeMatchState([0.1, 0.2]);
      expect(state).toBe('unknown');
    });

    // To properly test saveFace and findFace, we'd need to mock the button clicks or call internal functions
    // Since we exported some helpers in Ghostati, let's test what's exposed.
    it('should expose the current match threshold', () => {
      expect(Ghostati.getMatchThreshold()).toBe(0.58);
    });
  });
});
