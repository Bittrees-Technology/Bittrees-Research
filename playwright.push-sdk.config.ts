import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/push-sdk', testMatch: '**/*.spec.ts', timeout: 45_000,
  forbidOnly: !!process.env.CI, retries: process.env.CI ? 1 : 0,
  webServer: { command: 'npx vite build --config tests/push-sdk/vite.config.ts && npx vite preview --config tests/push-sdk/vite.config.ts --host 127.0.0.1 --port 4191', url: 'http://127.0.0.1:4191', reuseExistingServer: false, timeout: 120_000 },
  use: { baseURL: 'http://127.0.0.1:4191', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
