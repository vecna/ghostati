import { test, expect } from '@playwright/test';

/**
 * End-to-End test for Ghostati face matching workflow.
 * This test runs in a headless Chromium browser with a fake video feed.
 * It verifies that the application can initialize, detect a face, save it,
 * and later find a matching face using the mocked webcam video.
 *
 * The steps are:
 * 1. Load the application page.
 * 2. Wait for webcam initialization (we expect "Webcam attiva").
 * 3. Trigger a face scan.
 * 4. Verify the log reports a successful detection ("Volto trovato").
 * 5. Save the scanned face and confirm the DB count increments.
 * 6. Find the saved face and ensure a match is reported.
 */

test.describe('Ghostati Face Matching E2E', () => {
  test('should detect, save, and match a face', async ({ page }) => {
    // Capture console output from the page for debugging.
    page.on('console', msg => console.log(`BROWSER: ${msg.text()}`));
    page.on('pageerror', err => console.log(`BROWSER ERROR: ${err.message}`));

    // 1. Navigate to the main application page.
    await page.goto('/ghostati.html');

    // 2. Wait for the application to initialize the (fake) webcam.
    // The logBox should contain "Webcam attiva" once initialization completes.
    await expect(page.locator('#logBox')).toContainText('Webcam attiva', { timeout: 45000 });

    // 3. Trigger a face scan by clicking the Scan button.
    await page.click('#scanBtn');

    // 4. Verify that the log reports a successful face detection.
    // The expected substring is "Volto trovato".
    await expect(page.locator('#logBox')).toContainText('Volto trovato');

    // 5. Save the detected face by clicking the Save button.
    await page.click('#saveBtn');

    // 6. Confirm that the DB count increments to 1 and the log reports the saved ID.
    await expect(page.locator('#dbCount')).toHaveText('1');
    await expect(page.locator('#logBox')).toContainText('salvata con ID 0');

    // 7. Find the saved face by clicking the Find button.
    await page.click('#findBtn');

    // 8. Verify that a match is reported in the log.
    await expect(page.locator('#logBox')).toContainText('TROVATO MATCH');
  });
});
