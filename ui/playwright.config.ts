import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import os from 'os';

const SCREENSHOT_DIR = path.join(os.homedir(), 'Desktop', 'bitlink-screenshots');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  timeout: 60000,
  
  use: {
    baseURL: 'http://localhost:3003',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 5000,
  },

  projects: [
    {
      name: 'Mobile',
      use: { 
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 2.75,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],

  outputDir: path.join(SCREENSHOT_DIR, 'test-results'),

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3003',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
