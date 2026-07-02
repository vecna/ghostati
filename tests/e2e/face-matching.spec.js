import { test, expect } from '@playwright/test';

/**
 * End-to-End smoke test for analyze-panel entry point.
 */

test.describe('Ghostmaxxing Analyze E2E', () => {
  test('should open and close analyze panel', async ({ page }) => {
    // Capture console output from the page for debugging.
    page.on('console', msg => console.log(`BROWSER: ${msg.text()}`));
    page.on('pageerror', err => console.log(`BROWSER ERROR: ${err.message}`));

    // 1. Navigate to the main application page.
    await page.goto('/ghostati.html');

    // 2. Wait for complete initialization of webcam + mediapipe pipeline.
    await expect(page.locator('#logBox')).toContainText('MediaPipe FaceLandmarker pronto', { timeout: 45000 });
    await expect(page.locator('#logBox')).toContainText('Webcam attiva', { timeout: 45000 });

    // New UX: scan button is hidden in init.
    await expect(page.locator('#scanBtn')).toBeHidden();
    await expect(page.locator('#analyzeBtn')).toBeEnabled();

    await page.click('#analyzeBtn');
    await expect(page.locator('#analyzeModal')).toBeVisible();

    await page.click('#analyzeCloseBtn');
    await expect(page.locator('#analyzeModal')).toBeHidden();
  });
});
