import { test, expect } from '@playwright/test';

/**
 * End-to-End test for Ghostati face matching workflow (new UX).
 *
 * The current UX no longer relies on an explicit scan click in this journey:
 * save/find trigger the detection pipeline directly.
 */

test.describe('Ghostati Face Matching E2E', () => {
  test('should detect, save, and match a face', async ({ page }) => {
    // Capture console output from the page for debugging.
    page.on('console', msg => console.log(`BROWSER: ${msg.text()}`));
    page.on('pageerror', err => console.log(`BROWSER ERROR: ${err.message}`));

    // Track app-level events to assert integration between UI and engines.
    await page.addInitScript(() => {
      window.__ghostatiMatchEvents = [];
      window.addEventListener('ghostatiReady', () => {
        if (window.Ghostati && window.Ghostati.events) {
          window.Ghostati.events.addEventListener('matchStateChanged', (e) => {
            window.__ghostatiMatchEvents.push(e.detail);
          });
        }
      }, { once: true });
    });

    // 1. Navigate to the main application page.
    await page.goto('/ghostati.html');

    // 2. Wait for complete initialization of webcam + mediapipe pipeline.
    await expect(page.locator('#logBox')).toContainText('MediaPipe FaceLandmarker pronto', { timeout: 45000 });
    await expect(page.locator('#logBox')).toContainText('Webcam attiva', { timeout: 45000 });

    // New UX: scan button is hidden in init.
    await expect(page.locator('#scanBtn')).toBeHidden();
    await expect(page.locator('#saveBtn')).toBeEnabled();
    await expect(page.locator('#findBtn')).toBeEnabled();

    // 3. Save one face sample.
    await page.click('#saveBtn');

    // 4. Confirm DB update and save log.
    await expect(page.locator('#dbCount')).toHaveText('1');
    await expect(page.locator('#logBox')).toContainText('salvata con ID 0');

    // 5. Run find flow and verify match output.
    await page.click('#findBtn');
    await expect(page.locator('#logBox')).toContainText('Corrispondenza trovata');

    // 6. Verify unified event payloads from both actions.
    await expect.poll(async () => {
      return page.evaluate(() => window.__ghostatiMatchEvents.length);
    }).toBeGreaterThanOrEqual(2);

    const payloads = await page.evaluate(() => window.__ghostatiMatchEvents);
    const savePayload = payloads.find(p => p && p.source === 'save');
    const findPayload = payloads.find(p => p && p.source === 'find');

    expect(savePayload).toBeTruthy();
    expect(findPayload).toBeTruthy();
    expect(findPayload.overall).toBeTruthy();
  });
});
