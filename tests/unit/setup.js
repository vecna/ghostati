import { vi } from 'vitest';

// Mock the HTML needed by ghostati.js
document.body.innerHTML = `
  <div class="viewer fullscreen" id="viewer">
    <span id="statusDot"></span><span id="statusText"></span>
    <div id="placeholder"></div>
    <video id="video"></video>
    <img id="previewImage" />
    <canvas id="overlay"></canvas>
    <canvas id="mesh3dOverlay"></canvas>
    <canvas id="bboxOverlay"></canvas>
  </div>
  <button id="scanBtn"></button>
  <button id="copyMakeupBtn"></button>
  <button id="fullscreenBtn"></button>
  <button id="toggleSettingsBtn"></button>
  <button id="saveBtn"></button>
  <button id="findBtn"></button>
  <span id="dbCountBadge"></span>
  <button id="clearDbBtn"></button>
  <button id="clearOverlayBtn"></button>
  <button id="switchCameraBtn"></button>
  <div id="logBox"></div>
  <div id="dbCount"></div>
  <div id="nextId"></div>
  <div id="thresholdLabel"></div>
  <div id="effectName"></div>
  <div id="effectTracking"></div>
  <div id="ghostylesContainer"></div>
  <input id="remoteGhostyleUrl" />
  <button id="loadRemoteGhostyleBtn"></button>
  <button id="mirrorToggle"></button>
  <select id="fpsSelect"><option value="120" selected></option></select>
`;

// Define missing properties on canvas for jsdom
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
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
  measureText: vi.fn(() => ({ width: 10 })),
  fillText: vi.fn(),
  arc: vi.fn(),
  setLineDash: vi.fn()
}));

// Mock faceapi
window.faceapi = {
  TinyFaceDetectorOptions: vi.fn(),
  detectSingleFace: vi.fn(() => ({
    withFaceLandmarks: vi.fn(() => ({
      withAgeAndGender: vi.fn(() => ({
        withFaceDescriptor: vi.fn()
      }))
    }))
  })),
  resizeResults: vi.fn((res) => res),
};

// Mock localStorage
const localStorageMock = (function() {
  let store = {};
  return {
    getItem(key) { return store[key] || null; },
    setItem(key, value) { store[key] = value.toString(); },
    clear() { store = {}; },
    removeItem(key) { delete store[key]; }
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });
