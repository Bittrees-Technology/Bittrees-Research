import {defineConfig} from '@playwright/test';
export default defineConfig({outputDir:'test-results/membership',testDir:'./tests/membership',testMatch:'*.browser.ts',workers:1,retries:0,use:{baseURL:'http://127.0.0.1:4215',browserName:'chromium'},webServer:{command:'yarn vite --config tests/membership/vite.config.ts',url:'http://127.0.0.1:4215',reuseExistingServer:false}});
