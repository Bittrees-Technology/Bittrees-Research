import {defineConfig} from '@playwright/test';
const live=process.env.RESEARCH_RECOVERY_LIVE==='1';
const baseURL=live?'https://research.bittrees.org':'http://127.0.0.1:4213';
export default defineConfig({
 outputDir:'test-results/app-recovery',testDir:'./tests/app-recovery',fullyParallel:false,workers:1,retries:0,timeout:60000,
 use:{baseURL,actionTimeout:10000,browserName:'chromium',trace:'off',video:'off'},
 webServer:live?undefined:{command:'yarn preview -- --host 127.0.0.1 --port 4213',url:baseURL,reuseExistingServer:false},
});
