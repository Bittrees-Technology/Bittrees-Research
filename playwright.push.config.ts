import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/push', testMatch: '*.spec.ts', fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4188', browserName: 'chromium' },
  webServer: { command: 'npx vite --config tests/push/vite.config.ts', url: 'http://127.0.0.1:4188', reuseExistingServer: false },
});
