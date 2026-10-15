import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/contributors',workers:1,use:{baseURL:'http://127.0.0.1:4361'},webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4361 --strictPort',url:'http://127.0.0.1:4361',reuseExistingServer:false},outputDir:'test-results/contributors'});
