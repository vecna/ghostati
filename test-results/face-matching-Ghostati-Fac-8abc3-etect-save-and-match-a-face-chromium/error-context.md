# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: face-matching.spec.js >> Ghostati Face Matching E2E >> should detect, save, and match a face
- Location: tests/e2e/face-matching.spec.js:4:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#logBox')
Expected substring: "Volto trovato"
Received string:    "[20:45:02]Webcam attiva. Premi l'icona bersaglio per la scansione o scegli un effetto.[20:45:02]Tutto pronto! Inizia scansionando il tuo volto o attivando una guida makeup.[20:45:06][MEDIAPIPE]MediaPipe FaceLandmarker pronto (478 landmark 3D)[20:45:16]Nessun volto rilevato nella webcam."
Timeout: 5000ms

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('#logBox')
    5 × locator resolved to <div id="logBox" class="logbox floating-logbox">…</div>
      - unexpected value "[20:45:02]Webcam attiva. Premi l'icona bersaglio per la scansione o scegli un effetto.[20:45:02]Tutto pronto! Inizia scansionando il tuo volto o attivando una guida makeup.[20:45:06][MEDIAPIPE]MediaPipe FaceLandmarker pronto (478 landmark 3D)[20:45:16]Nessun volto rilevato nella webcam."

```

```yaml
- text: "[20:45:02]Webcam attiva. Premi l'icona bersaglio per la scansione o scegli un effetto. [20:45:02]Tutto pronto! Inizia scansionando il tuo volto o attivando una guida makeup. [20:45:06][MEDIAPIPE]MediaPipe FaceLandmarker pronto (478 landmark 3D) [20:45:16]Nessun volto rilevato nella webcam."
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Ghostati Face Matching E2E', () => {
  4  |   test('should detect, save, and match a face', async ({ page }) => {
  5  |     // Debug logging
  6  |     page.on('console', msg => console.log(`BROWSER: ${msg.text()}`));
  7  |     page.on('pageerror', err => console.log(`BROWSER ERROR: ${err.message}`));
  8  | 
  9  | 
  10 |     // Go to the main application page
  11 |     await page.goto('/ghostati.html');
  12 | 
  13 |     // Wait for the application to initialize
  14 |     await expect(page.locator('#logBox')).toContainText('Webcam attiva', { timeout: 45000 });
  15 | 
  16 |     // 1. Scan Face
  17 |     await page.click('#scanBtn');
  18 |     
  19 |     // Check log output for successful scan
  20 |     // We expect "Volto trovato" to appear in the log
> 21 |     await expect(page.locator('#logBox')).toContainText('Volto trovato');
     |                                           ^ Error: expect(locator).toContainText(expected) failed
  22 | 
  23 |     // 2. Save Face
  24 |     await page.click('#saveBtn');
  25 |     
  26 |     // Check if the face was saved and ID is incremented
  27 |     await expect(page.locator('#dbCount')).toHaveText('1');
  28 |     await expect(page.locator('#logBox')).toContainText('salvata con ID 0');
  29 | 
  30 |     // 3. Find Face
  31 |     await page.click('#findBtn');
  32 | 
  33 |     // Check log output for match
  34 |     await expect(page.locator('#logBox')).toContainText('TROVATO MATCH');
  35 |   });
  36 | });
  37 | 
```