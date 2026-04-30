document.addEventListener('DOMContentLoaded', () => {
  // --- SETTINGS DRAWER TOGGLE ---
  const toggleSettingsBtn = document.getElementById('toggleSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const settingsDrawer = document.getElementById('settingsDrawer');

  function toggleDrawer() {
    if (settingsDrawer) {
      settingsDrawer.classList.toggle('hidden');
    }
  }

  if (toggleSettingsBtn) toggleSettingsBtn.addEventListener('click', toggleDrawer);
  if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', toggleDrawer);

  // --- FULLSCREEN TOGGLE ---
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  
  function toggleFullScreen() {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) { /* Safari */
        document.documentElement.webkitRequestFullscreen();
      } else if (document.documentElement.msRequestFullscreen) { /* IE11 */
        document.documentElement.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) { /* Safari */
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) { /* IE11 */
        document.msExitFullscreen();
      }
    }
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleFullScreen);
  }

  // --- GESTURES: SWIPE AND SCROLL TO CLEAR OVERLAY ---
  let touchStartY = 0;
  let touchEndY = 0;
  
  // Threshold to consider a swipe
  const SWIPE_THRESHOLD = 50;

  function handleGesture() {
    const distanceY = Math.abs(touchEndY - touchStartY);
    if (distanceY > SWIPE_THRESHOLD) {
      // Swipe up or down detected
      clearOverlayAndLogs();
    }
  }

  // Avoid triggering on elements that actually need to scroll (like the settings drawer)
  const isScrollableElement = (el) => {
    return el.closest('.scrollable') || el.closest('#settingsDrawer');
  };

  document.addEventListener('touchstart', (e) => {
    if (isScrollableElement(e.target)) return;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (isScrollableElement(e.target)) return;
    touchEndY = e.changedTouches[0].screenY;
    handleGesture();
  }, { passive: true });

  // Scroll wheel for desktop
  document.addEventListener('wheel', (e) => {
    if (isScrollableElement(e.target)) return;
    // Debounce or just trigger on any significant scroll
    if (Math.abs(e.deltaY) > 20) {
      clearOverlayAndLogs();
    }
  }, { passive: true });

  function clearOverlayAndLogs() {
    // 1. Trigger the logic to clear the face/overlay if it exists
    const clearOverlayBtn = document.getElementById('clearOverlayBtn');
    if (clearOverlayBtn) {
      clearOverlayBtn.click(); // Trigger the logic bound in face-api.js
    }

    // 2. Clear the logbox (keep only the first waiting line, or clear entirely based on preference)
    const logBox = document.getElementById('logBox');
    if (logBox) {
      // Clear all except the first line which we can reset to "Pronto"
      logBox.innerHTML = '<div class="log-line">Schermo pulito. Pronto.</div>';
    }
  }

});
