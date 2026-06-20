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

export function setStatus(kind, text) {
   els.statusDot.className = 'status-dot';
   if (kind === 'live') els.statusDot.classList.add('live');
   if (kind === 'error') els.statusDot.classList.add('error');
   els.statusText.textContent = text;
}

export function clearOverlay() {
   const ctx = els.overlay.getContext('2d');
   ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
   els.overlay.style.transition = 'none';
   els.overlay.style.opacity = '1';
   if (state.overlayFadeTimeout) clearTimeout(state.overlayFadeTimeout);
}

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
