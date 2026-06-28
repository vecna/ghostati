/** @module dom */
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
   ghostylesContainer: document.getElementById('ghostylesContainer'),
   mirrorToggle: document.getElementById('mirrorToggle'), // Left for fallback, but managed by JS via camera direction
   switchCameraBtn: document.getElementById('switchCameraBtn'),
   dbCountBadge: document.getElementById('dbCountBadge'),
   fpsSelect: document.getElementById('fpsSelect'),
   recordBtn: document.getElementById('recordBtn')
};

/**
 * Update the UI status indicator.
 * @param {string} kind - Status kind ('live', 'init', 'error', etc.).
 * @param {string} text - Human‑readable status text.
 * @see camera.js – called after webcam is successfully started (kind 'live').
 * @see main.js – called during model loading initialization (kind 'init').
 * @see main.js – called when an error occurs (kind 'error').
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
 * @see engine.js – called after face detection to clear previous overlay before drawing new results.
 * @see main.js – used when deactivating an effect to ensure the overlay is clean.
 */
export function clearOverlay() {
   const ctx = els.overlay.getContext('2d');
   ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
   els.overlay.style.transition = 'none';
   els.overlay.style.opacity = '1';
   if (state.overlayFadeTimeout) clearTimeout(state.overlayFadeTimeout);
}

/**
 * Creates and registers a UI button for a ghostyle effect.
 * The button is added to the Ghostyles container and stored in state.loadedGhostyles.
 *
 * @param {{id:string, name:string, url:string, module:any}} record - Ghostyle metadata and module.
 * @returns {HTMLButtonElement} The created button element.
 * @see main.js – iterates over fetched ghostyle records and calls this to populate UI.
 * @see tests/unit/dom.test.js – verifies button creation and registration.
 */
export function addGhostyleBtn(record) {
   state.loadedGhostyles.set(record.id, record);

   const btn = document.createElement('button');
   btn.className = 'preview-btn';
   btn.textContent = record.name;
   btn.dataset.effect = record.id;
   els.ghostylesContainer.appendChild(btn);

   return btn;
}

/**
 * Resets the UI and internal state after an effect is cleared.
 * Removes visual active classes from preview buttons, clears scan button styling,
 * resets effect name and tracking UI, clears selected effect state, disables the
 * makeup copy button, and clears the overlay canvas.
 *
 * @see toggleEffect – called when the user toggles off the currently active effect.
 * @see main.js – UI button triggers effect clearing via toggleEffect which uses this.
 */
export function clearActiveEffect() {
   const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');

   previewBtns.forEach(btn => btn.classList.remove('active'));
   els.scanBtn.style.background = '';
   els.scanBtn.style.borderColor = '';
   els.scanBtn.style.color = '';

   els.effectName.textContent = 'N/A';
   els.effectTracking.textContent = 'off';

   state.activeEffect = null;
   state.lastKnownEffectResult = null;
   state.lastCompositedCanvas = null;
   els.copyMakeupBtn.disabled = true;
   clearOverlay();
}

/**
 * Handles UI updates when a ghostyle effect button is selected.
 * Marks the selected button as active, hides any preview image, configures the scan button appearance,
 * resets overlay fade timers, and updates effect name/tracking display based on the newly active effect.
 *
 * @param {HTMLButtonElement} button - The button element that was clicked to select the effect.
 * @see toggleEffect – invoked after changing the active effect.
 * @see main.js – user interaction triggers toggleEffect which calls this function.
 */
export function effectSelected(button) {
   const previewBtns = els.ghostylesContainer.querySelectorAll('.preview-btn');

   previewBtns.forEach(btn => btn.classList.toggle('active', btn === button));
   els.previewImage.style.display = 'none';
   els.previewImage.removeAttribute('src');

   els.scanBtn.style.background = 'linear-gradient(180deg, rgba(159, 122, 234, 0.35), rgba(159, 122, 234, 0.15))';
   els.scanBtn.style.borderColor = 'rgba(159, 122, 234, 0.5)';
   els.scanBtn.style.color = '#fff';

   if (state.overlayFadeTimeout)
      clearTimeout(state.overlayFadeTimeout);
   els.overlay.style.transition = 'none';
   els.overlay.style.opacity = '1';

   const style = state.loadedGhostyles.get(state.activeEffect);
   if(style) {
      els.effectName.textContent = style.name;
      els.effectTracking.textContent = state.activeEffect;
   } else {
      console.warn(`No style found for active when it should -- ${state.activeEffect}`);
      els.effectName.textContent = 'N/A';
      els.effectTracking.textContent = 'off';
   }
}