import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fmt, currentColor, extractBox, extractScore, view, init, onMatchStateChanged, COLORS } from '../../scripts/bbox-overlay.js';

describe('bbox-overlay utilities', () => {
  beforeEach(() => {
    // Reset view state
    view.matchState = 'unknown';
    view.liveMinDist = null;
    view.obfMinDist = null;
    view.liveMinId = null;
    view.obfMinId = null;
  });

  describe('fmt', () => {
    it('formats finite numbers with digits', () => {
      expect(fmt(0.5847, 3)).toBe('0.585');
      expect(fmt(12, 0)).toBe('12');
    });

    it('returns default placeholder for non-finite values', () => {
      expect(fmt(null, 2)).toBe('—');
      expect(fmt(undefined, 2)).toBe('—');
      expect(fmt(Infinity, 2)).toBe('—');
      expect(fmt('not a number', 2)).toBe('—');
    });
  });

  describe('currentColor', () => {
    it('picks the correct color for the match state', () => {
      view.matchState = 'matched';
      expect(currentColor()).toBe(COLORS.matched);

      view.matchState = 'eluded';
      expect(currentColor()).toBe(COLORS.eluded);

      view.matchState = 'unknown';
      expect(currentColor()).toBe(COLORS.unknown);
    });

    it('falls back to unknown color for invalid match state', () => {
      view.matchState = 'invalid-state';
      expect(currentColor()).toBe(COLORS.unknown);
    });
  });

  describe('extractBox', () => {
    it('extracts box from standard result structure', () => {
      const result = { box: { x: 10, y: 20, width: 100, height: 100 } };
      expect(extractBox(result)).toEqual({ x: 10, y: 20, width: 100, height: 100 });
    });

    it('extracts box from landmark-bearing result structure', () => {
      const result = { detection: { box: { x: 30, y: 40, width: 150, height: 150 } } };
      expect(extractBox(result)).toEqual({ x: 30, y: 40, width: 150, height: 150 });
    });
  });

  describe('extractScore', () => {
    it('extracts score from standard result structure', () => {
      const result = { score: 0.92 };
      expect(extractScore(result)).toBe(0.92);
    });

    it('extracts score from landmark-bearing result structure', () => {
      const result = { detection: { score: 0.85 } };
      expect(extractScore(result)).toBe(0.85);
    });

    it('returns null if score is missing or invalid', () => {
      expect(extractScore({})).toBeNull();
      expect(extractScore({ score: 'high' })).toBeNull();
    });
  });

  describe('init', () => {
    it('successfully initializes when DOM elements exist', () => {
      const success = init();
      expect(success).toBe(true);
    });
  });

  describe('onMatchStateChanged', () => {
    it('updates the view state from event detail', () => {
      const event = {
        detail: {
          detectionState: 'eluded',
          liveMinDist: 0.35,
          liveMinId: 2
        }
      };
      onMatchStateChanged(event);
      expect(view.matchState).toBe('eluded');
      expect(view.liveMinDist).toBe(0.35);
      expect(view.liveMinId).toBe(2);
    });
  });
});
