import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workspace = mkdtempSync(join(tmpdir(), 'lamset-browser-'));
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/browser.spec.mjs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
    reducedMotion: 'no-preference',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } } },
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'], browserName: 'webkit' } },
    { name: 'android', use: { ...devices['Pixel 5'], browserName: 'chromium' } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm start',
    url: baseURL + '/healthz',
    timeout: 60000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'test',
      PORT: '4173',
      DATABASE_PATH: join(workspace, 'site.db'),
      UPLOADS_DIR: join(workspace, 'uploads'),
      SITE_URL: baseURL,
      ADMIN_EMAIL: 'browser-test@example.test',
      ADMIN_PASSWORD: 'Browser-Only-Temporary!Password-478',
      SESSION_SECRET: 'browser-tests-only-session-secret-with-at-least-32-characters',
    },
  },
});
