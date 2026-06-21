import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../scripts/dom.js', () => ({
  setStatus: vi.fn(),
  els: {
    video: {
      srcObject: null,
      style: {},
      onloadedmetadata: null,
      play: vi.fn(async () => {}),
      videoWidth: 1920,
      videoHeight: 1080
    },
    overlay: {
      style: {},
      width: 0,
      height: 0,
      offsetHeight: 20
    },
    viewer: {
      getBoundingClientRect: vi.fn(() => ({ width: 640, height: 480 }))
    },
    placeholder: {
      style: { display: 'grid' }
    },
    mirrorToggle: {
      classList: { toggle: vi.fn() },
      textContent: ''
    },
    fpsSelect: {
      value: '120'
    }
  }
}));

vi.mock('../../scripts/utils.js', () => ({
  setLog: vi.fn()
}));

vi.mock('../../scripts/engine.js', () => ({
  runEffectPass: vi.fn()
}));

import { state } from '../../scripts/state.js';
import { setStatus, els } from '../../scripts/dom.js';
import { setLog } from '../../scripts/utils.js';
import { runEffectPass } from '../../scripts/engine.js';
import {
  startCamera,
  resizeCanvas,
  effectLoop,
  startEffectLoop,
  stopEffectLoop
} from '../../scripts/camera.js';

describe('camera module', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    state.currentFacingMode = 'user';
    state.isMirrored = false;
    state.lastEffectRun = 0;
    state.effectLoopHandle = null;
    state.effectInferenceInFlight = true;
    state.overlayFadeTimeout = null;

    els.video.srcObject = null;
    els.video.style.transform = '';
    els.video.videoWidth = 1920;
    els.video.videoHeight = 1080;
    els.overlay.style.transform = '';
    els.overlay.style.transition = '';
    els.overlay.style.opacity = '';
    els.overlay.width = 0;
    els.overlay.height = 0;
    els.placeholder.style.display = 'grid';
    els.mirrorToggle.textContent = '';
    els.fpsSelect.value = '120';

    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(async () => ({ id: 'stream' }))
      },
      configurable: true
    });

    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 321));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('startCamera throws and logs when mediaDevices API is unavailable', async () => {
    Object.defineProperty(window, 'isSecureContext', {
      value: false,
      configurable: true
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true
    });

    await expect(startCamera()).rejects.toThrow('mediaDevices unavailable (insecure context?)');
    expect(setLog).toHaveBeenCalledWith(expect.stringContaining('Webcam non disponibile in questo contesto.'));
  });

  it('startCamera initializes stream, UI state and starts effect loop', async () => {
    const startPromise = startCamera();
    await Promise.resolve();

    expect(typeof els.video.onloadedmetadata).toBe('function');
    els.video.onloadedmetadata();
    await startPromise;

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        facingMode: 'user'
      },
      audio: false
    });
    expect(els.video.srcObject).toEqual({ id: 'stream' });
    expect(state.isMirrored).toBe(true);
    expect(els.video.style.transform).toBe('scaleX(-1)');
    expect(els.overlay.style.transform).toBe('scaleX(-1)');
    expect(els.placeholder.style.display).toBe('none');
    expect(setStatus).toHaveBeenCalledWith('live', 'webcam attiva');
    expect(setLog).toHaveBeenCalledWith(expect.stringContaining('Webcam attiva.'));
    expect(els.overlay.width).toBe(1920);
    expect(els.overlay.height).toBe(1080);
    expect(requestAnimationFrame).toHaveBeenCalled();
  });

  it('resizeCanvas falls back to viewer rect before video dimensions are available', () => {
    els.video.videoWidth = 0;
    els.video.videoHeight = 0;

    resizeCanvas();

    expect(els.overlay.width).toBe(640);
    expect(els.overlay.height).toBe(480);
  });



  it('effectLoop triggers inference based on selected delay and re-schedules itself',  async () => {
    state.lastEffectRun = 0;
    els.fpsSelect.value = '100';

    await effectLoop(150);

    expect(runEffectPass).toHaveBeenCalledTimes(1);
    expect(state.lastEffectRun).toBe(150);
    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(state.effectLoopHandle).toBe(321);
  });

  it('startEffectLoop cancels previous frame and schedules a new one', () => {
    state.effectLoopHandle = 999;

    startEffectLoop();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(999);
    expect(requestAnimationFrame).toHaveBeenCalled();
    expect(state.effectLoopHandle).toBe(321);
  });

  it('stopEffectLoop cancels frame and resets loop state flags', () => {
    state.effectLoopHandle = 888;
    state.effectInferenceInFlight = true;

    stopEffectLoop();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(888);
    expect(state.effectLoopHandle).toBe(null);
    expect(state.effectInferenceInFlight).toBe(false);
  });
});
