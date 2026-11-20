import { defineConfig } from '@playwright/test';

export default defineConfig({
 testDir:'./e2e',timeout:30000,workers:1,retries:0,
 use:{viewport:{width:390,height:844},headless:true,launchOptions:{executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'}},
 reporter:'list'
});
