import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { state } from '../../scripts/state.js';
import {
  els,
  setStatus,
  clearOverlay,
  addGhostyleBtn,
  clearActiveEffect,
  effectSelected
} from '../../scripts/dom.js';

describe('dom.js functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Clear and restore DOM elements before each test
    els.statusDot.className = '';
    els.statusText.textContent = '';
    els.ghostylesContainer.innerHTML = '';
    els.scanBtn.style.background = '';
    els.scanBtn.style.borderColor = '';
    els.scanBtn.style.color = '';
    els.effectName.textContent = '';
    els.effectTracking.textContent = '';
    els.copyMakeupBtn.disabled = false;
    els.previewImage.style.display = 'block';
    els.previewImage.setAttribute('src', 'test.jpg');

    // Reset state
    state.activeEffect = 'some-effect';
    state.loadedGhostyles = new Map();
    state.lastKnownEffectResult = {};
    state.lastCompositedCanvas = {};
    state.overlayFadeTimeout = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setStatus', () => {
    it('sets status dot class and status text for live status', () => {
      setStatus('live', 'Webcam attiva');
      expect(els.statusDot.classList.contains('status-dot')).toBe(true);
      expect(els.statusDot.classList.contains('live')).toBe(true);
      expect(els.statusText.textContent).toBe('Webcam attiva');
    });

    it('sets status dot class and status text for error status', () => {
      setStatus('error', 'Errore fotocamera');
      expect(els.statusDot.classList.contains('status-dot')).toBe(true);
      expect(els.statusDot.classList.contains('error')).toBe(true);
      expect(els.statusText.textContent).toBe('Errore fotocamera');
    });
  });

  describe('clearOverlay', () => {
    it('clears canvas context and resets style/timeouts', () => {
      const mockCtx = {
        clearRect: vi.fn()
      };
      vi.spyOn(els.overlay, 'getContext').mockReturnValue(mockCtx);
      
      const dummyTimeout = setTimeout(() => {}, 1000);
      state.overlayFadeTimeout = dummyTimeout;

      clearOverlay();

      expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, els.overlay.width, els.overlay.height);
      expect(els.overlay.style.transition).toBe('none');
      expect(els.overlay.style.opacity).toBe('1');
    });
  });

  describe('addGhostyleBtn', () => {
    it('creates and appends a button, and registers in loadedGhostyles', () => {
      const record = { id: 'effect123', name: 'Effect 123' };
      const btn = addGhostyleBtn(record);

      expect(state.loadedGhostyles.get('effect123')).toBe(record);
      expect(btn.className).toBe('preview-btn');
      expect(btn.textContent).toBe('Effect 123');
      expect(btn.dataset.effect).toBe('effect123');
      expect(els.ghostylesContainer.contains(btn)).toBe(true);
    });
  });

  describe('clearActiveEffect', () => {
    it('resets active state and UI elements', () => {
      const record = { id: 'effect123', name: 'Effect 123' };
      const btn = addGhostyleBtn(record);
      btn.classList.add('active');

      clearActiveEffect();

      expect(btn.classList.contains('active')).toBe(false);
      expect(els.scanBtn.style.background).toBe('');
      expect(els.scanBtn.style.borderColor).toBe('');
      expect(els.scanBtn.style.color).toBe('');
      expect(els.effectName.textContent).toBe('N/A');
      expect(els.effectTracking.textContent).toBe('off');
      expect(state.activeEffect).toBeNull();
      expect(state.lastKnownEffectResult).toBeNull();
      expect(state.lastCompositedCanvas).toBeNull();
      expect(els.copyMakeupBtn.disabled).toBe(true);
    });
  });

  describe('effectSelected', () => {
    it('toggles active class and sets style for active effect', () => {
      const record = { id: 'effect123', name: 'Effect 123' };
      const btn = addGhostyleBtn(record);
      state.activeEffect = 'effect123';
      state.loadedGhostyles.set('effect123', record);

      effectSelected(btn);

      expect(btn.classList.contains('active')).toBe(true);
      expect(els.previewImage.style.display).toBe('none');
      expect(els.previewImage.getAttribute('src')).toBeNull();
      expect(els.scanBtn.style.background).toContain('linear-gradient');
      expect(els.effectName.textContent).toBe('Effect 123');
      expect(els.effectTracking.textContent).toBe('effect123');
    });

    it('logs warning and defaults UI if style is not loaded', () => {
      const record = { id: 'effect123', name: 'Effect 123' };
      const btn = addGhostyleBtn(record);
      state.activeEffect = 'unknown-effect';

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      effectSelected(btn);

      expect(warnSpy).toHaveBeenCalled();
      expect(els.effectName.textContent).toBe('N/A');
      expect(els.effectTracking.textContent).toBe('off');
    });
  });
});
