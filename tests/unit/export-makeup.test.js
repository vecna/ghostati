import { describe, it, expect } from 'vitest';
import { collectExportInput, buildHeaderText, makeImageFile, canUseClipboard, canShareFile } from '../../scripts/export-makeup.js';

describe('export-makeup helpers', () => {
  describe('buildHeaderText', () => {
    it('creates header text with plugin name', () => {
      const text = buildHeaderText('MyPlugin');
      expect(text).toContain('MyPlugin');
      expect(text).toContain('github.com/vecna/ghostati');
    });
  });

  describe('collectExportInput', () => {
    it('gathers correct information from appState and domEls', () => {
      const appState = {
        lastCompositedCanvas: 'fake-canvas',
        isMirrored: true,
        activeEffect: 'effect-id',
        loadedGhostyles: {
          get: (id) => ({ name: 'Ghostyle ' + id })
        }
      };

      const domEls = {
        logBox: {
          lastChild: { textContent: 'Latest log message' }
        }
      };

      const input = collectExportInput(appState, domEls);
      expect(input.sourceCanvas).toBe('fake-canvas');
      expect(input.isMirrored).toBe(true);
      expect(input.pluginName).toBe('Ghostyle effect-id');
      expect(input.logText).toBe('Latest log message');
    });
  });

  describe('makeImageFile', () => {
    it('creates a File object with correct filename and mime type', () => {
      const blob = new Blob([''], { type: 'image/png' });
      const copy = { filename: 'test.png', mimeType: 'image/png' };
      const file = makeImageFile(blob, copy);
      expect(file).toBeInstanceOf(File);
      expect(file.name).toBe('test.png');
      expect(file.type).toBe('image/png');
    });
  });

  describe('canUseClipboard', () => {
    it('returns false when browserNavigator clipboard is missing', () => {
      expect(canUseClipboard({})).toBe(false);
    });
  });

  describe('canShareFile', () => {
    it('returns false when navigator.share is missing', () => {
      // Mock global navigator
      const originalNavigator = globalThis.navigator;
      globalThis.navigator = {};
      try {
        expect(canShareFile(new File([], 'test.png'))).toBe(false);
      } finally {
        globalThis.navigator = originalNavigator;
      }
    });
  });
});
