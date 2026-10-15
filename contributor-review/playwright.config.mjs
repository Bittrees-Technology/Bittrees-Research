import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'test/browser',workers:1,timeout:30000,use:{baseURL:'http://127.0.0.1:4349',browserName:'chromium'},webServer:{command:'REVIEW_PORT=4349 REVIEW_STATE_FILE=/tmp/bittrees-contributor-browser-state.json node server/start.mjs',url:'http://127.0.0.1:4349',reuseExistingServer:false},outputDir:'test-results'});
