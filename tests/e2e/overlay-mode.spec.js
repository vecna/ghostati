import { test, expect } from '@playwright/test';

function makeLandmarks478() {
  return Array.from({ length: 478 }, (_, index) => ({
    x: (index % 20) / 20,
    y: (index % 24) / 24,
    z: index / 478,
  }));
}

test.describe('Ghostati Overlay Mode E2E', () => {
  test('cycles overlay modes, persists selection, renders mesh/bbox, and suppresses after save', async ({ page }) => {
    await page.addInitScript(() => {
      window.__captureBboxOverlay = false;
      window.__bboxOverlayCounters = { strokeRect: 0, arc: 0, clearRect: 0 };
      window.__resetBboxOverlayCounters = () => {
        window.__bboxOverlayCounters.strokeRect = 0;
        window.__bboxOverlayCounters.arc = 0;
        window.__bboxOverlayCounters.clearRect = 0;
      };

      const counters = window.__bboxOverlayCounters;
      const originalStrokeRect = CanvasRenderingContext2D.prototype.strokeRect;
      const originalArc = CanvasRenderingContext2D.prototype.arc;
      const originalClearRect = CanvasRenderingContext2D.prototype.clearRect;

      CanvasRenderingContext2D.prototype.strokeRect = function (...args) {
        if (window.__captureBboxOverlay && this.canvas && this.canvas.id === 'bboxOverlay') counters.strokeRect += 1;
        return originalStrokeRect.apply(this, args);
      };
      CanvasRenderingContext2D.prototype.arc = function (...args) {
        if (window.__captureBboxOverlay && this.canvas && this.canvas.id === 'bboxOverlay') counters.arc += 1;
        return originalArc.apply(this, args);
      };
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (window.__captureBboxOverlay && this.canvas && this.canvas.id === 'bboxOverlay') counters.clearRect += 1;
        return originalClearRect.apply(this, args);
      };
    });

    await page.goto('/ghostati.html');

    await expect(page.locator('#logBox')).toContainText('MediaPipe FaceLandmarker pronto', { timeout: 45000 });
    await expect(page.locator('#logBox')).toContainText('Webcam attiva', { timeout: 45000 });

    const overlayModeBtn = page.locator('#overlayModeBtn');
    await expect(overlayModeBtn).toHaveText('Vista: bbox');

    await overlayModeBtn.click();
    await expect(overlayModeBtn).toHaveText('Vista: mesh');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ghostati-overlay-mode-v1'))).toBe('mesh');

    await overlayModeBtn.click();
    await expect(overlayModeBtn).toHaveText('Vista: entrambi');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ghostati-overlay-mode-v1'))).toBe('entrambi');

    await page.reload();
    await expect(page.locator('#logBox')).toContainText('MediaPipe FaceLandmarker pronto', { timeout: 45000 });
    await expect(overlayModeBtn).toHaveText('Vista: entrambi');

    await overlayModeBtn.click();
    await expect(overlayModeBtn).toHaveText('Vista: bbox');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ghostati-overlay-mode-v1'))).toBe('bbox');

    const dispatchSyntheticOverlayData = async (source = 'auto') => {
      return page.evaluate(({ landmarks, source }) => {
        const detection = {
          detection: {
            score: 0.91,
            box: { x: 10, y: 20, width: 100, height: 120 }
          }
        };

        window.Ghostati.events.dispatchEvent(new CustomEvent('detection', {
          detail: { result: null }
        }));
        window.Ghostati.events.dispatchEvent(new CustomEvent('landmarks3d', {
          detail: { landmarks: null }
        }));
        window.__resetBboxOverlayCounters();
        window.__captureBboxOverlay = true;

        window.Ghostati.events.dispatchEvent(new CustomEvent('matchStateChanged', {
          detail: {
            source,
            overall: 'matched',
            faceapi: {
              detectionState: 'matched',
              liveMinDist: 0.12,
              liveMinId: 0
            }
          }
        }));

        window.Ghostati.events.dispatchEvent(new CustomEvent('detection', {
          detail: { result: detection }
        }));
        window.Ghostati.events.dispatchEvent(new CustomEvent('landmarks3d', {
          detail: { landmarks }
        }));
        window.__captureBboxOverlay = false;
        return { ...window.__bboxOverlayCounters };
      }, { landmarks, source });
    };

    const landmarks = makeLandmarks478();

    await expect(await dispatchSyntheticOverlayData()).toEqual({
      strokeRect: 2,
      arc: 0,
      clearRect: 3,
    });

    await overlayModeBtn.click();
    await expect(overlayModeBtn).toHaveText('Vista: mesh');
    await expect(await dispatchSyntheticOverlayData()).toEqual({
      strokeRect: 0,
      arc: 478,
      clearRect: 3,
    });

    await overlayModeBtn.click();
    await expect(overlayModeBtn).toHaveText('Vista: entrambi');
    await expect(await dispatchSyntheticOverlayData()).toEqual({
      strokeRect: 2,
      arc: 478,
      clearRect: 3,
    });

    await expect(await dispatchSyntheticOverlayData('save')).toEqual({
      strokeRect: 0,
      arc: 0,
      clearRect: 3,
    });
  });
});