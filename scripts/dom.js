/**
 * @module dom
 * @description
 * DOM glue layer: collects every DOM element the app interacts with into a
 * single `els` object, and provides a handful of small utilities for status
 * indicators, overlay clearing, and effect-button state.
 *
 * Why a dedicated module: separating element lookup from feature code keeps
 * the rest of the app free of `document.getElementById` calls scattered
 * everywhere, makes the set of touched DOM nodes auditable in one place, and
 * lets tests replace `els` with a stub for unit testing.
 *
 * Element resolution happens at module-load time, so this module must be
 * imported after the corresponding DOM nodes exist (i.e. after the HTML
 * `<script type="module">` defer ordering has parsed them).
 */
import { state } from './state.js';

/**
 * Single source of truth for the DOM nodes touched by the app. Populated once
 * at module load. Some entries may be `null` if the markup omits them (e.g.
 * `mirrorToggle` is kept as a fallback for non-mobile builds).
 */
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
   overlayModeBtn: document.getElementById('overlayModeBtn'),
   clearDbBtn: document.getElementById('clearDbBtn'),
   ghostylesContainer: document.getElementById('ghostylesContainer'),
   // Fallback toggle: kept for builds without auto-mirroring. Normally the
   // mirror state is driven by camera facingMode (see camera.js).
   mirrorToggle: document.getElementById('mirrorToggle'),
   switchCameraBtn: document.getElementById('switchCameraBtn'),
   dbCountBadge: document.getElementById('dbCountBadge'),
   fpsSelect: document.getElementById('fpsSelect'),
   recordBtn: document.getElementById('recordBtn')
};

/**
 * Update the status indicator in the header. The `kind` argument selects the
 * dot colour class (`live` = green, `error` = red, anything else = default
 * grey) and `text` populates the adjacent label. Centralising the logic here
 * keeps the indicator visually consistent regardless of which module
 * triggered the change.
 *
 * @param {string} kind  One of 'live', 'init', 'error', or any other string
 *   (defaults to neutral styling). Only 'live' and 'error' apply a CSS class.
 * @param {string} text  Human-readable status text shown to the right of the
 *   dot.
 * @see scripts/camera.js – sets `('live', …)` once the webcam stream starts.
 * @see scripts/main.js – sets `('init', …)` while models load, `('error', …)`
 *   on failure.
 */
export function setStatus(kind, text) {
   els.statusDot.className = 'status-dot';
   if (kind === 'live') els.statusDot.classList.add('live');
   if (kind === 'error') els.statusDot.classList.add('error');
   els.statusText.textContent = text;
}

/**
 * Clear the main overlay canvas and reset its visual state. Also cancels any
 * pending fade-out timer set by `engine.triggerOverlayFadeout` so a stale
 * timer doesn't fade out a freshly drawn frame. Called between detection
 * passes and on effect changes.
 *
 * @see scripts/engine.js – `detectFaceInCam()` clears the overlay before
 *   drawing the new detection result.
 * @see scripts/ghostyles-manager.js – `toggleEffect()` uses this indirectly
 *   via `clearActiveEffect()` when switching off an effect.
 */
export function clearOverlay() {
   const ctx = els.overlay.getContext('2d');
   ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
   els.overlay.style.transition = 'none';
   els.overlay.style.opacity = '1';
   if (state.overlayFadeTimeout) clearTimeout(state.overlayFadeTimeout);
}

/**
 * Create a UI button for a freshly loaded ghostyle and register the record
 * in `state.loadedGhostyles`. The button has no click handler attached here:
 * the caller (the loader) attaches one so it can decide whether to delegate
 * to `toggleEffect`, run a custom callback, or both.
 *
 * NOTE: a near-identical helper currently lives inside
 * `ghostyles-manager.js` and is the one actually wired up in the loader
 * path. This exported version is a vestige from an earlier architecture and
 * is scheduled for removal during the upcoming loader unification.
 *
 * @param {{id:string, name:string, url:string, module:any}} record
 *   Ghostyle metadata and the imported module.
 * @returns {HTMLButtonElement} The created button (not yet appended click
 *   listeners — that's the caller's job).
 * @see tests/unit/dom.test.js – verifies registration and button creation.
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
 * Reset UI and runtime state after an effect is deactivated: drop the active
 * class from every preview button, undo the scan-button styling, blank the
 * "effect name" / "tracking" labels, null out the cached detection result
 * and last composited canvas, disable the copy-makeup button, and clear the
 * overlay canvas. Side-effect only — no event is dispatched.
 *
 * @see scripts/ghostyles-manager.js – `toggleEffect()` calls this when the
 *   user deactivates the currently active effect.
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
 * Apply UI styling after a ghostyle button is selected: mark the chosen
 * button active and clear the others, hide any preview image still on
 * screen, restyle the scan button to the "armed" appearance, cancel any
 * pending overlay fade, and update the "effect name" / "tracking" labels
 * from the active ghostyle record. Reads `state.activeEffect` directly, so
 * callers must set it before invoking this.
 *
 * @param {HTMLButtonElement} button  The button that was just clicked.
 * @see scripts/ghostyles-manager.js – `toggleEffect()` calls this after
 *   setting `state.activeEffect`.
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
