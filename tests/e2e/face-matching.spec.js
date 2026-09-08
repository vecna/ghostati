import { test, expect } from '@playwright/test';

test.describe('Ghostmaxxing Face Matching E2E', () => {
  test('recognizes a saved face and reports a non-match when distance is above threshold', async ({ page }) => {
    test.setTimeout(90000);

    await page.addInitScript(() => {
      localStorage.removeItem('local-face-lab-db-v1');
      localStorage.removeItem('local-face-lab-db-3d-v1');
      localStorage.removeItem('ghostati-overlay-mode-v1');
    });

    await page.goto('/lab.html');

    await expect(page.locator('#logBox')).toContainText('MediaPipe FaceLandmarker ready', { timeout: 45000 });
    await expect(page.locator('#logBox')).toContainText('Webcam active', { timeout: 45000 });

    await expect(page.locator('#dbCount')).toHaveText('0');
    await expect(page.locator('#gm-num')).toHaveText('—');
    await expect(page.locator('#gm-state')).toHaveText('Save your face');

    await page.locator('#saveBtn').click();

    await expect(page.locator('#dbCount')).toHaveText('1', { timeout: 45000 });
    await expect(page.locator('#nextId')).toHaveText('1');
    await expect(page.locator('#logBox')).toContainText('Biometric faceprint saved with ID 0', { timeout: 45000 });
    // The fake camera is a moving Y4M clip: later frames need not have the
    // saved frame's exact descriptor. Check identity and threshold together.
    await expect.poll(() => page.evaluate(() => {
      const distance = Number(document.getElementById('gm-num').textContent);
      const threshold = Number(document.getElementById('gm-thr-input').value);
      const state = document.getElementById('gm-state').textContent;
      return Number.isFinite(distance) && distance >= 0 && distance < threshold
        && /Recognised\s+·\s+#0/.test(state);
    }), { timeout: 45000 }).toBe(true);

    const nonMatchReadout = await page.evaluate(() => {
      window.gstmxx.events.dispatchEvent(new CustomEvent('matchStateChanged', {
        detail: {
          source: 'auto',
          overall: 'eluded',
          faceapi: {
            detectionState: 'eluded',
            distance: 0.91,
            matchedId: null,
            liveMinDist: 0.91,
            liveMinId: 0,
            obfMinDist: null,
            obfMinId: null,
          },
          mediapipe: null,
        },
      }));

      return {
        number: document.getElementById('gm-num').textContent,
        state: document.getElementById('gm-state').textContent,
        broke: document.getElementById('readout').classList.contains('broke'),
      };
    });

    expect(nonMatchReadout).toEqual({
      number: '0.91',
      state: 'Escaped · #0',
      broke: true,
    });
  });
});
