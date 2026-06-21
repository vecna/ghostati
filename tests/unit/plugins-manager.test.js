import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../scripts/dom.js', () => ({
  els: {
    overlay: {
      getContext: vi.fn(() => ({
        clearRect: vi.fn()
      }))
    }
  },
  clearActiveEffect: vi.fn(),
  effectSelected: vi.fn()
}));

vi.mock('../../scripts/utils.js', () => ({
  setLog: vi.fn()
}));

vi.mock('https://example.com/effects/graphic-liner.js', () => ({
  onClear: 'mock-on-clear'
}), { virtual: true });

import { state } from '../../scripts/state.js';
import { setLog } from '../../scripts/utils.js';
import { clearActiveEffect, effectSelected } from '../../scripts/dom.js';
import { fetchGhostyleMetadata, importGhostyleModule, toggleEffect } from '../../scripts/plugins-manager.js';

describe('plugins-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.activeEffect = null;
    state.loadedGhostyles = new Map();
    state.ghostatiEvents = new EventTarget();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchGhostyleMetadata', () => {
    it('successfully fetches and extracts metadata', async () => {
      const mockText = `
        // @name Eye Liner Style
        export default function() {}
      `;
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => mockText
      };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const meta = await fetchGhostyleMetadata('https://example.com/effects/graphic-liner.js');
      expect(fetchSpy).toHaveBeenCalledWith('https://example.com/effects/graphic-liner.js');
      expect(meta).toEqual({
        id: 'graphic-liner',
        name: 'Eye Liner Style',
        url: 'https://example.com/effects/graphic-liner.js'
      });
    });

    it('uses id as name if @name metadata is missing', async () => {
      const mockText = `
        export default function() {}
      `;
      const mockResponse = {
        ok: true,
        status: 200,
        text: async () => mockText
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const meta = await fetchGhostyleMetadata('https://example.com/effects/mystyle.js');
      expect(meta.name).toBe('mystyle');
    });

    it('throws error when response is not ok', async () => {
      const mockResponse = {
        ok: false,
        status: 404
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      await expect(fetchGhostyleMetadata('https://example.com/effects/notfound.js'))
        .rejects.toThrow('HTTP 404');
    });
  });

  describe('importGhostyleModule', () => {
    it('dynamically imports the module url', async () => {
      const meta = { id: 'graphic-liner', name: 'Eye Liner Style', url: 'https://example.com/effects/graphic-liner.js' };
      const res = await importGhostyleModule(meta);
      expect(res.id).toBe('graphic-liner');
      expect(res.name).toBe('Eye Liner Style');
      expect(res.module.onClear).toBe('mock-on-clear');
    });
  });

  describe('toggleEffect', () => {
    it('deactivates and clears current effect if called with the active effect', () => {
      const onClearMock = vi.fn();
      const mockEffect = {
        id: 'graphic-liner',
        name: 'Eye Liner Style',
        module: { onClear: onClearMock }
      };
      state.activeEffect = 'graphic-liner';
      state.loadedGhostyles.set('graphic-liner', mockEffect);

      const eventListener = vi.fn();
      state.ghostatiEvents.addEventListener('effectChanged', eventListener);

      toggleEffect('graphic-liner', null);

      expect(onClearMock).toHaveBeenCalled();
      expect(clearActiveEffect).toHaveBeenCalled();
      expect(eventListener).toHaveBeenCalledTimes(1);
      expect(eventListener.mock.calls[0][0].detail).toEqual({
        activeEffect: null,
        previous: 'graphic-liner'
      });
      expect(setLog).toHaveBeenCalledWith(expect.stringContaining('Disattivazione in corso'));
    });

    it('activates a new effect and dispatches effectChanged', () => {
      const mockEffect = {
        id: 'graphic-liner',
        name: 'Eye Liner Style',
        module: {}
      };
      state.loadedGhostyles.set('graphic-liner', mockEffect);

      const eventListener = vi.fn();
      state.ghostatiEvents.addEventListener('effectChanged', eventListener);

      const dummyButton = {};
      toggleEffect('graphic-liner', dummyButton);

      expect(state.activeEffect).toBe('graphic-liner');
      expect(eventListener).toHaveBeenCalledTimes(1);
      expect(eventListener.mock.calls[0][0].detail).toEqual({
        activeEffect: 'graphic-liner',
        previous: null
      });
      expect(effectSelected).toHaveBeenCalledWith(dummyButton);
      expect(setLog).toHaveBeenCalledWith(expect.stringContaining('attivato'));
    });

    it('deactivates previous effect when switching to a new effect', () => {
      const oldClearMock = vi.fn();
      const oldEffect = {
        id: 'old-effect',
        name: 'Old Effect',
        module: { onClear: oldClearMock }
      };
      const newEffect = {
        id: 'new-effect',
        name: 'New Effect',
        module: {}
      };
      state.activeEffect = 'old-effect';
      state.loadedGhostyles.set('old-effect', oldEffect);
      state.loadedGhostyles.set('new-effect', newEffect);

      const eventListener = vi.fn();
      state.ghostatiEvents.addEventListener('effectChanged', eventListener);

      toggleEffect('new-effect', null);

      expect(oldClearMock).toHaveBeenCalled();
      expect(state.activeEffect).toBe('new-effect');
      expect(eventListener).toHaveBeenCalledTimes(1);
      expect(eventListener.mock.calls[0][0].detail).toEqual({
        activeEffect: 'new-effect',
        previous: 'old-effect'
      });
      expect(setLog).toHaveBeenCalledWith(expect.stringContaining('disattivato, abiliato New Effect'));
    });
  });
});
