/** @module ghostati-mobile-ui */
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
    // 1. Trigger the logic to clear the Ghostaoverlay if it exists

    // Removed at the moment, should be renamed OR we should clean the Ghostyle effect.

    // 2. Clear the visible logs
    if (window.Ghostati && window.Ghostati.clearVisibleLogs) {
       window.Ghostati.clearVisibleLogs();
    }
  }

});
