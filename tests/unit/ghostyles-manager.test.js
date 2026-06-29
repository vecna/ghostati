import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../scripts/dom.js', () => ({
  els: {
    overlay: {
      getContext: vi.fn(() => ({
        clearRect: vi.fn()
      }))
    },
    ghostylesContainer: { appendChild: vi.fn() }
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

vi.mock('https://example.com/effects/init-effect.js', () => ({
  onInit: vi.fn(() => 'init ok'),
  onClear: vi.fn()
}), { virtual: true });

vi.mock('https://example.com/effects/init-fail.js', () => ({
  onInit: vi.fn(() => { throw new Error('init boom'); })
}), { virtual: true });

import { state } from '../../scripts/state.js';
import { setLog } from '../../scripts/utils.js';
import { clearActiveEffect, effectSelected, els } from '../../scripts/dom.js';
import { fetchGhostyleMetadata, importGhostyleModule, loadGhostyle, toggleEffect } from '../../scripts/ghostyles-manager.js';

describe('ghostyles-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.activeEffect = null;
    state.loadedGhostyles = new Map();
    state.ghostatiEvents = new EventTarget();
    els.ghostylesContainer.appendChild.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchGhostyleMetadata', () => {
    it('successfully fetches and extracts name + release_date metadata', async () => {
      const mockText = `
        // @name Eye Liner Style
        // @release_date 2026-01-20
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
        url: 'https://example.com/effects/graphic-liner.js',
        version: null,
        author: null,
        description: null,
        releaseDate: '2026-01-20'
      });
    });

    it('uses id as name if @name metadata is missing and releaseDate null if absent', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'export default function() {}'
      });

      const meta = await fetchGhostyleMetadata('https://example.com/effects/mystyle.js');
      expect(meta).toEqual({
        id: 'mystyle',
        name: 'mystyle',
        url: 'https://example.com/effects/mystyle.js',
        version: null,
        author: null,
        description: null,
        releaseDate: null
      });
    });

    it('throws error when response is not ok', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 });

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

  describe('loadGhostyle', () => {
    it('loads a ghostyle, runs onInit, appends a button and wires toggle callback', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '// @name Init Effect\n// @release_date 2026-06-01'
      });
      const onFaceapiToggle = vi.fn();

      const ghostyle = await loadGhostyle('https://example.com/effects/init-effect.js', null, { onFaceapiToggle });

      expect(ghostyle).toMatchObject({
        id: 'init-effect',
        name: 'Init Effect',
        url: 'https://example.com/effects/init-effect.js',
        releaseDate: '2026-06-01'
      });
      expect(state.loadedGhostyles.get('init-effect')).toBe(ghostyle);
      expect(els.ghostylesContainer.appendChild).toHaveBeenCalledTimes(1);

      const button = els.ghostylesContainer.appendChild.mock.calls[0][0];
      expect(button.className).toBe('preview-btn');
      expect(button.textContent).toContain('Init Effect');
      expect(button.querySelector('.preview-btn__title')?.textContent).toBe('Init Effect');
      expect(button.dataset.effect).toBe('init-effect');

      expect(setLog).toHaveBeenCalledWith('Init Effect: init ok');
      expect(setLog).toHaveBeenCalledWith(expect.stringContaining('Caricato con successo ghostyle Init Effect'));

      button.onclick();
      expect(state.activeEffect).toBe('init-effect');
      expect(onFaceapiToggle).toHaveBeenCalledTimes(1);
    });

    it('wraps metadata fetch errors with the requested plugin name', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 });

      await expect(loadGhostyle('https://example.com/effects/broken.js', 'Broken Style'))
        .rejects.toThrow('Errore metadata plugin (Broken Style): HTTP 500');
    });

    it('wraps dynamic import errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '// @name Missing Effect\n// @release_date 2025-01-01'
      });

      await expect(loadGhostyle('https://example.com/effects/missing.js', 'Missing Effect'))
        .rejects.toThrow("Errore durante l'importazione del modulo:");
    });

    it('wraps onInit errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '// @name Init Fail\n// @release_date 2025-01-01'
      });

      await expect(loadGhostyle('https://example.com/effects/init-fail.js', 'Init Fail'))
        .rejects.toThrow("Errore durante l'inizializzazione del modulo: init boom");
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
