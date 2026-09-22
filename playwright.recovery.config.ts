import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/recovery', testMatch: '*.browser.ts', fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4187', browserName: 'chromium' },
  webServer: { command: 'npx vite --config tests/recovery/vite.config.ts', url: 'http://127.0.0.1:4187', reuseExistingServer: false },
});
