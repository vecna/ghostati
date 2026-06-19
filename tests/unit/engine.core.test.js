import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../scripts/main.js', () => ({
  els: {
    video: { readyState: 4 },
    overlay: {
      width: 320,
      height: 240,
      getContext: vi.fn()
    },
    copyMakeupBtn: { disabled: true }
  },
  clearOverlay: vi.fn(),
  updateNudging: vi.fn(),
  DETECTOR_OPTIONS: { detector: 'opts' }
}));

vi.mock('../../scripts/utils.js', () => ({
  distance: vi.fn(() => 0.12),
  avgPoint: vi.fn(() => ({ x: 10, y: 20 })),
  drawClosedPath: vi.fn(),
  drawOpenPath: vi.fn(),
  roundRect: vi.fn(),
  setLog: vi.fn()
}));

vi.mock('../../scripts/camera.js', () => ({
  triggerOverlayFadeout: vi.fn(),
  resizeCanvas: vi.fn()
}));

vi.mock('../../scripts/db.js', () => ({
  persistDb: vi.fn(),
  renderDbStats: vi.fn()
}));

import { state } from '../../scripts/state.js';
import { els, clearOverlay, updateNudging } from '../../scripts/main.js';
import { setLog, drawClosedPath, drawOpenPath, roundRect } from '../../scripts/utils.js';
import { triggerOverlayFadeout, resizeCanvas } from '../../scripts/camera.js';
import { persistDb, renderDbStats } from '../../scripts/db.js';
import {
  detectCurrentFace,
  compositeAndDetect,
  runEffectPass,
  drawEffectOverlay,
  drawDetectionScaffold,
  drawResult,
  scanFace,
  saveFace
} from '../../scripts/engine.js';

function createCtx() {
  return {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    measureText: vi.fn(() => ({ width: 24 })),
    fillText: vi.fn(),
    arc: vi.fn(),
    setLineDash: vi.fn(),
    drawImage: vi.fn(),
    arcTo: vi.fn(),
    lineCap: '',
    lineJoin: '',
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    translate: vi.fn(),
    scale: vi.fn()
  };
}

function makeAgeGenderDescriptorChain(result) {
  return {
    withFaceLandmarks: vi.fn(() => ({
      withAgeAndGender: vi.fn(() => ({
        withFaceDescriptor: vi.fn(async () => result)
      }))
    }))
  };
}

function makeLandmarksDescriptorChain(result) {
  return {
    withFaceLandmarks: vi.fn(() => ({
      withFaceDescriptor: vi.fn(async () => result)
    }))
  };
}

function createLandmarksFixture() {
  return {
    getLeftEye: () => [{ x: 1, y: 1 }],
    getRightEye: () => [{ x: 2, y: 2 }],
    getNose: () => [{ x: 3, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 3 }],
    getJawOutline: () => [{ x: 4, y: 4 }],
    getMouth: () => [{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }]
  };
}

describe('engine core exports', () => {
  let overlayCtx;

  beforeEach(() => {
    vi.clearAllMocks();
    overlayCtx = createCtx();
    els.overlay.getContext.mockReturnValue(overlayCtx);

    state.db = { nextId: 0, faces: [] };
    state.MATCH_THRESHOLD = 0.58;
    state.activeEffect = null;
    state.loadedGhostyles = new Map();
    state.lastKnownEffectResult = null;
    state.isSystemBusy = false;
    state.effectInferenceInFlight = false;
    state.nudgeStep = 1;
    state.ghostatiEvents = new EventTarget();

    window.Ghostati = {
      _computeMatchState: vi.fn(() => 'matched')
    };
    globalThis.Ghostati = window.Ghostati;

    const TinyFaceDetectorOptions = vi.fn(function TinyFaceDetectorOptions(opts) {
      Object.assign(this, opts);
    });
    globalThis.faceapi = {
      TinyFaceDetectorOptions,
      resizeResults: vi.fn((result) => result),
      detectSingleFace: vi.fn()
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detectCurrentFace returns null and logs when no face is detected', async () => {
    faceapi.detectSingleFace.mockReturnValue(makeAgeGenderDescriptorChain(null));

    const result = await detectCurrentFace(false);

    expect(clearOverlay).toHaveBeenCalledTimes(1);
    expect(result).toBe(null);
    expect(state.lastKnownEffectResult).toBe(null);
    expect(setLog).toHaveBeenCalledWith('Nessun volto rilevato nella webcam.');
  });

  it('detectCurrentFace returns detection result when available', async () => {
    const detected = { detection: { score: 0.9 }, descriptor: [0.1] };
    faceapi.detectSingleFace.mockReturnValue(makeAgeGenderDescriptorChain(detected));

    const result = await detectCurrentFace(false);

    expect(result).toBe(detected);
    expect(setLog).not.toHaveBeenCalledWith('Nessun volto rilevato nella webcam.');
  });

  it('compositeAndDetect returns weakDetection=true when strict detection fails then weak succeeds', async () => {
    const compositedCtx = createCtx();
    const canvasGetContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(compositedCtx);

    const liveResult = {
      detection: { box: { x: 1, y: 2, width: 3, height: 4 } },
      landmarks: { any: true }
    };
    const obfuscated = { detection: { score: 0.41 }, descriptor: [0.2, 0.3] };

    state.activeEffect = 'graphic-liner';
    const onDraw = vi.fn();
    state.loadedGhostyles.set('graphic-liner', { module: { onDraw } });

    faceapi.detectSingleFace
      .mockReturnValueOnce(makeLandmarksDescriptorChain(null))
      .mockReturnValueOnce(makeLandmarksDescriptorChain(obfuscated));

    const result = await compositeAndDetect(liveResult);

    expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(result.obfuscatedResult).toBe(obfuscated);
    expect(result.weakDetection).toBe(true);
    expect(onDraw).toHaveBeenCalled();
    expect(faceapi.detectSingleFace).toHaveBeenCalledTimes(2);

    canvasGetContextSpy.mockRestore();
  });

  it('runEffectPass early-returns when system is busy', async () => {
    state.isSystemBusy = true;

    await runEffectPass();

    expect(faceapi.detectSingleFace).not.toHaveBeenCalled();
  });

  it('runEffectPass stores latest result and emits detection event when no active effect', async () => {
    const result = { detection: { score: 0.8 }, descriptor: [0.3] };
    faceapi.detectSingleFace.mockResolvedValue(result);

    const onDetection = vi.fn();
    state.ghostatiEvents.addEventListener('detection', onDetection);

    await runEffectPass();

    expect(state.lastKnownEffectResult).toBe(result);
    expect(state.effectInferenceInFlight).toBe(false);
    expect(onDetection).toHaveBeenCalledTimes(1);
    expect(onDetection.mock.calls[0][0].detail.activeEffect).toBe(null);
  });

  it('drawEffectOverlay applies active effect draw and updates lastKnownEffectResult', () => {
    const result = {
      detection: { box: { x: 1, y: 2, width: 3, height: 4 } },
      landmarks: { points: [] }
    };
    const styleDraw = vi.fn();
    state.activeEffect = 'soft-contour';
    state.loadedGhostyles.set('soft-contour', { module: { onDraw: styleDraw } });
    faceapi.resizeResults.mockReturnValue(result);

    drawEffectOverlay(result, false);

    expect(resizeCanvas).toHaveBeenCalled();
    expect(overlayCtx.clearRect).toHaveBeenCalled();
    expect(styleDraw).toHaveBeenCalledWith(overlayCtx, result.landmarks, result.detection.box);
    expect(state.lastKnownEffectResult).toBe(result);
  });

  it('drawDetectionScaffold draws scaffold primitives and label box', () => {
    const resized = {
      detection: { box: { x: 10, y: 20, width: 50, height: 60 } },
      landmarks: createLandmarksFixture(),
      age: 28,
      gender: 'female'
    };

    drawDetectionScaffold(overlayCtx, resized);

    expect(overlayCtx.strokeRect).toHaveBeenCalledWith(10, 20, 50, 60);
    expect(drawClosedPath).toHaveBeenCalled();
    expect(drawOpenPath).toHaveBeenCalled();
    expect(roundRect).toHaveBeenCalled();
    expect(overlayCtx.fillText).toHaveBeenCalled();
  });

  it('drawResult draws scaffold and stores result', () => {
    const result = {
      detection: { box: { x: 1, y: 2, width: 3, height: 4 } },
      landmarks: createLandmarksFixture()
    };
    faceapi.resizeResults.mockReturnValue(result);

    drawResult(result);

    expect(resizeCanvas).toHaveBeenCalled();
    expect(overlayCtx.clearRect).toHaveBeenCalled();
    expect(state.lastKnownEffectResult).toBe(result);
  });

  it('scanFace logs result, triggers fade and dispatches matchStateChanged', async () => {
    const result = {
      age: 31,
      gender: 'male',
      genderProbability: 0.87,
      detection: { score: 0.78, box: { x: 10, y: 20, width: 40, height: 50 } },
      landmarks: createLandmarksFixture(),
      descriptor: [0.1, 0.2]
    };
    faceapi.detectSingleFace.mockReturnValue(makeAgeGenderDescriptorChain(result));

    const onMatch = vi.fn();
    state.ghostatiEvents.addEventListener('matchStateChanged', onMatch);

    await scanFace();

    expect(triggerOverlayFadeout).toHaveBeenCalled();
    expect(setLog).toHaveBeenCalledWith(expect.stringContaining('Volto trovato. Età stimata: 31.'));
    expect(onMatch).toHaveBeenCalledTimes(1);
    expect(onMatch.mock.calls[0][0].detail).toMatchObject({ source: 'scan', detectionState: 'matched', score: 0.78 });
    expect(updateNudging).toHaveBeenCalled();
    expect(state.nudgeStep).toBe(2);
  });

  it('saveFace adds record, persists DB, logs and dispatches matchStateChanged', async () => {
    state.db = { nextId: 7, faces: [] };
    state.nudgeStep = 2;

    const result = {
      age: 29,
      gender: 'female',
      detection: { score: 0.91, box: { x: 11, y: 21, width: 41, height: 51 } },
      landmarks: createLandmarksFixture(),
      descriptor: [0.7, 0.8]
    };
    faceapi.detectSingleFace.mockReturnValue(makeAgeGenderDescriptorChain(result));

    const onMatch = vi.fn();
    state.ghostatiEvents.addEventListener('matchStateChanged', onMatch);

    await saveFace();

    expect(state.db.nextId).toBe(8);
    expect(state.db.faces).toHaveLength(1);
    expect(state.db.faces[0]).toMatchObject({
      id: 7,
      descriptor: [0.7, 0.8],
      age: 29,
      gender: 'female'
    });
    expect(typeof state.db.faces[0].savedAt).toBe('string');
    expect(persistDb).toHaveBeenCalled();
    expect(renderDbStats).toHaveBeenCalled();
    expect(triggerOverlayFadeout).toHaveBeenCalled();
    expect(setLog).toHaveBeenCalledWith(expect.stringContaining('Impronta biometrica salvata con ID 7.'));
    expect(onMatch).toHaveBeenCalledTimes(1);
    expect(onMatch.mock.calls[0][0].detail).toMatchObject({ source: 'save', detectionState: 'matched', score: 0.91 });
    expect(updateNudging).toHaveBeenCalled();
    expect(state.nudgeStep).toBe(3);
  });
});
