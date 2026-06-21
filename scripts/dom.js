import { state } from './state.js';

export const els = {
   video: document.getElementById('video'),
   overlay: document.getElementById('overlay'),
   viewer: document.getElementById('viewer'),
   placeholder: document.getElementById('placeholder'),
   previewImage: document.getElementById('previewImage'),
   logBox: document.getElementById('logBox'),
   statusDot: document.getElementById('statusDot'),
   statusText: document.getElementById('statusText'),
   dbCount: document.getElementById('dbCount'),
   nextId: document.getElementById('nextId'),
   thresholdLabel: document.getElementById('thresholdLabel'),
   effectName: document.getElementById('effectName'),
   effectTracking: document.getElementById('effectTracking'),
   scanBtn: document.getElementById('scanBtn'),
   copyMakeupBtn: document.getElementById('copyMakeupBtn'),
   saveBtn: document.getElementById('saveBtn'),
   findBtn: document.getElementById('findBtn'),
   clearDbBtn: document.getElementById('clearDbBtn'),
   clearOverlayBtn: document.getElementById('clearOverlayBtn'),
   ghostylesContainer: document.getElementById('ghostylesContainer'),
   remoteGhostyleUrl: document.getElementById('remoteGhostyleUrl'),
   loadRemoteGhostyleBtn: document.getElementById('loadRemoteGhostyleBtn'),
   mirrorToggle: document.getElementById('mirrorToggle'), // Left for fallback, but managed by JS via camera direction
   switchCameraBtn: document.getElementById('switchCameraBtn'),
   dbCountBadge: document.getElementById('dbCountBadge'),
   fpsSelect: document.getElementById('fpsSelect')
};

/**
 * Update the UI status indicator.
 * @param {string} kind - Status kind ('live', 'init', 'error', etc.).
 * @param {string} text - Human‑readable status text.
 * @see camera.js:36 – called after webcam is successfully started (kind 'live').
 * @see main.js:203 – called during model loading initialization (kind 'init').
 * @see main.js:215 – called when an error occurs (kind 'error').
 */
export function setStatus(kind, text) {
   els.statusDot.className = 'status-dot';
   if (kind === 'live') els.statusDot.classList.add('live');
   if (kind === 'error') els.statusDot.classList.add('error');
   els.statusText.textContent = text;
}

/**
 * Clear the overlay canvas and reset its visual state.
 * Removes all drawings and disables any fade-out transition.
 * @see engine.js:20 – called after face detection to clear previous overlay before drawing new results.
 * @see main.js:371 – invoked when the user clicks the "Clear Overlay" button.
 * @see main.js:156 – used when deactivating an effect to ensure the overlay is clean.
 */
export function clearOverlay() {
   const ctx = els.overlay.getContext('2d');
   ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
   els.overlay.style.transition = 'none';
   els.overlay.style.opacity = '1';
   if (state.overlayFadeTimeout) clearTimeout(state.overlayFadeTimeout);
}

/**
 * Update the UI nudging flow.
 *
 * Shows a contextual hint on a specific UI element based on the current
 * `state.nudgeStep`.  The function increments the step, stores progress in
 * `localStorage`, and visually highlights the next target element.
 *
 * @see main.js:316 – called after a successful scan to advance the nudging step.
 * @see main.js:335 – called after a successful save to advance the nudging step.
 * @see main.js:345 – called after the “copy makeup” button is enabled.
 */
export function updateNudging(currentStep) {

   // there was the if condition before, now is checked here so I can remove all the 'if'
   if(currentStep !== state.nudgeStep || state.nudgeStep > 5)
      return;

   if(currentStep === 5) {
    localStorage.setItem('ghostati-nudge-done', 'true'); 
   }
   
   state.nudgeStep += 1;
   document.querySelectorAll('.nudge-target').forEach(el => el.classList.remove('nudge-target'));
   
   if (state.nudgeStep === 1) els.scanBtn.classList.add('nudge-target');
   if (state.nudgeStep === 2) els.saveBtn.classList.add('nudge-target');
   if (state.nudgeStep === 3) {
      const toggleBtn = document.getElementById('toggleSettingsBtn');
      if (toggleBtn) toggleBtn.classList.add('nudge-target');
      els.ghostylesContainer.querySelectorAll('.preview-btn').forEach(btn => btn.classList.add('nudge-target'));
   }
   if (state.nudgeStep === 4) els.scanBtn.classList.add('nudge-target');
   if (state.nudgeStep === 5 && !els.copyMakeupBtn.disabled) els.copyMakeupBtn.classList.add('nudge-target');

} 
