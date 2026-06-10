import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-video-capture=${require('path').join(__dirname, 'tests/fixtures/mock-face.mjpeg')}`,
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
        permissions: ['camera', 'microphone'],
      },
    },
  ],
  webServer: {
    command: 'npx http-server -p 8080',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
  },
});
