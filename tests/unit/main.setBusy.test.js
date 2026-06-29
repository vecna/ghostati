import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../scripts/utils.js', () => ({
  distance: vi.fn(),
  computeMatchState: vi.fn(() => 'unknown'),
  avgPoint: vi.fn(() => ({ x: 0, y: 0 })),
  lerp: vi.fn(),
  scaleFrom: vi.fn(),
  point: vi.fn(),
  drawClosedPath: vi.fn(),
  drawOpenPath: vi.fn(),
  drawLabel: vi.fn(),
  roundRect: vi.fn(),
  expandEyePolygon: vi.fn(),
  drawEyeWing: vi.fn(),
  drawCheekSweep: vi.fn(),
  drawContourBand: vi.fn(),
  setLog: vi.fn(),
  updateLogDisplay: vi.fn()
}));

vi.mock('../../scripts/db.js', () => ({
  loadDb: vi.fn(() => ({ nextId: 0, faces: [] })),
  loadDb3d: vi.fn(() => ({ nextId: 0, faces: [] })),
  renderDbStats: vi.fn(),
  clearDb: vi.fn()
}));

vi.mock('../../scripts/engine.js', () => ({
  scanFace: vi.fn(async () => {}),
  saveFace: vi.fn(async () => {}),
  findFace: vi.fn(async () => {}),
  hasActivePlugin: vi.fn(() => false),
  compositeAndDetect: vi.fn(async () => null)
}));

vi.mock('../../scripts/camera.js', () => ({
  startCamera: vi.fn(async () => {}),
  resizeCanvas: vi.fn(),
  startEffectLoop: vi.fn(),
  recordOneSecond: vi.fn()
}));

vi.mock('../../scripts/engine-3d.js', () => ({
  loadMobileNet: vi.fn(async () => {}),
  saveFace3d: vi.fn(async () => null),
  findFace3d: vi.fn(async () => null),
  evaluateMatch3d: vi.fn(() => null),
  compositeAndDetect3d: vi.fn(async () => null)
}));

vi.mock('../../scripts/config.js', () => ({
  MODEL_URLS: {
    tiny: '/tiny',
    landmarks: '/landmarks',
    recognition: '/recognition',
    ageGender: '/age-gender'
  },
  DETECTOR_OPTIONS: {}
}));

vi.mock('../../scripts/ghostyles-manager.js', () => ({
  loadGhostyle: vi.fn(async () => {})
}));

vi.mock('../../scripts/plugins3d-loader.js', () => ({
  initPlugins3dLoader: vi.fn(),
  getActiveEffect3d: vi.fn(() => null),
  activateEffect3d: vi.fn(),
  deactivateEffect3d: vi.fn(),
  toggleEffect3d: vi.fn(),
  reloadPlugins3d: vi.fn()
}));

vi.mock('../../scripts/export-makeup.js', () => ({
  exportMakeup: vi.fn()
}));

import { state } from '../../scripts/state.js';
import { setBusy } from '../../scripts/main.js';
import { els } from '../../scripts/dom.js';

describe('main.setBusy', () => {
  beforeEach(() => {
    state.lastCompositedCanvas = null;

    if (els.ghostylesContainer) {
      els.ghostylesContainer.innerHTML = '';
      const p1 = document.createElement('button');
      p1.className = 'preview-btn';
      const p2 = document.createElement('button');
      p2.className = 'preview-btn';
      els.ghostylesContainer.appendChild(p1);
      els.ghostylesContainer.appendChild(p2);
    }

    [
      els.scanBtn,
      els.copyMakeupBtn,
      els.saveBtn,
      els.findBtn,
      els.overlayModeBtn,
      els.clearDbBtn,
    ].forEach(btn => {
      if (btn) btn.disabled = false;
    });
  });

  it('disables action buttons and preview buttons when busy', () => {
    setBusy(true);

    expect(els.saveBtn.disabled).toBe(true);
    expect(els.findBtn.disabled).toBe(true);
    expect(els.overlayModeBtn.disabled).toBe(true);
    expect(els.clearDbBtn.disabled).toBe(true);
    expect(els.copyMakeupBtn.disabled).toBe(true);

    const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
    expect(previewBtns[0].disabled).toBe(true);
    expect(previewBtns[1].disabled).toBe(true);
  });

  it('keeps copy button disabled when no composited canvas exists', () => {
    state.lastCompositedCanvas = null;

    setBusy(false);

    expect(els.saveBtn.disabled).toBe(false);
    expect(els.findBtn.disabled).toBe(false);
    expect(els.overlayModeBtn.disabled).toBe(false);
    expect(els.copyMakeupBtn.disabled).toBe(true);

    const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');
    expect(previewBtns[0].disabled).toBe(false);
    expect(previewBtns[1].disabled).toBe(false);
  });

  it('enables copy button when not busy and composited canvas exists', () => {
    state.lastCompositedCanvas = document.createElement('canvas');

    setBusy(false);

    expect(els.copyMakeupBtn.disabled).toBe(false);
  });
});
