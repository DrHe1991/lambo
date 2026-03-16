import { test } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

const SCREENSHOT_DIR = path.join(os.homedir(), 'Desktop', 'bitlink-screenshots');

// Ensure screenshot directory exists
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Helper to take screenshot with consistent settings
async function capture(page: any, name: string) {
  await page.waitForTimeout(300);
  await page.screenshot({ 
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: true 
  });
  console.log(`Captured: ${name}`);
}

// Helper to safely click if visible
async function clickIfVisible(page: any, selector: string, timeout = 5000): Promise<boolean> {
  try {
    const element = page.locator(selector).first();
    await element.waitFor({ state: 'visible', timeout });
    await element.click();
    await page.waitForTimeout(200);
    return true;
  } catch {
    console.log(`Not found: ${selector}`);
    return false;
  }
}

// Login helper
async function login(page: any): Promise<boolean> {
  try {
    await page.waitForTimeout(1000);
    const userButton = page.locator('[data-testid^="login-user-"]').first();
    await userButton.waitFor({ state: 'visible', timeout: 5000 });
    await userButton.click();
    await page.waitForTimeout(1000);
    const navFeed = page.locator('[data-testid="nav-feed"]');
    await navFeed.waitFor({ state: 'visible', timeout: 5000 });
    console.log('Login successful');
    return true;
  } catch (e) {
    console.log('Login failed');
    return false;
  }
}

// Navigate back to main view
async function backToMain(page: any) {
  // Simply navigate to feed tab
  try {
    await page.locator('[data-testid="nav-feed"]').click({ timeout: 2000 });
    await page.waitForTimeout(300);
  } catch {
    // If nav not visible, try going back
    await page.goBack();
    await page.waitForTimeout(500);
  }
}

test.describe('UI Screenshot Capture', () => {
  test.setTimeout(180000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(500);
  });

  test('01 - login page', async ({ page }) => {
    await capture(page, '01-login-page');
  });

  test('02 - main tabs', async ({ page }) => {
    if (!await login(page)) return;

    await clickIfVisible(page, '[data-testid="nav-feed"]');
    await page.waitForTimeout(500);
    await capture(page, '02-feed');

    await clickIfVisible(page, '[data-testid="nav-following"]');
    await page.waitForTimeout(500);
    await capture(page, '03-following');

    await clickIfVisible(page, '[data-testid="nav-chat"]');
    await page.waitForTimeout(500);
    await capture(page, '04-chat-list');

    await clickIfVisible(page, '[data-testid="nav-profile"]');
    await page.waitForTimeout(500);
    await capture(page, '05-profile');
  });

  test('03 - trust score', async ({ page }) => {
    if (!await login(page)) return;
    await clickIfVisible(page, '[data-testid="nav-profile"]');
    await page.waitForTimeout(300);
    
    if (await clickIfVisible(page, 'button:has-text("Trust Score")')) {
      await page.waitForTimeout(500);
      await capture(page, '06-trust-score');
    }
  });

  test('04 - transactions', async ({ page }) => {
    if (!await login(page)) return;
    await clickIfVisible(page, '[data-testid="nav-profile"]');
    await page.waitForTimeout(300);
    
    if (await clickIfVisible(page, 'button:has-text("Transactions")')) {
      await page.waitForTimeout(500);
      await capture(page, '07-transactions');
    }
  });

  test('05 - settings', async ({ page }) => {
    if (!await login(page)) return;
    await clickIfVisible(page, '[data-testid="nav-profile"]');
    await page.waitForTimeout(300);
    
    if (await clickIfVisible(page, 'button:has-text("Settings")')) {
      await page.waitForTimeout(500);
      await capture(page, '08-settings');
    }
  });

  test('06 - new post editor', async ({ page }) => {
    if (!await login(page)) return;
    await clickIfVisible(page, '[data-testid="nav-feed"]');
    await page.waitForTimeout(300);
    
    if (await clickIfVisible(page, '[data-testid="new-post-button"]')) {
      await page.waitForTimeout(500);
      await capture(page, '09-new-post-editor');
    }
  });

  test('07 - post detail', async ({ page }) => {
    if (!await login(page)) return;
    await clickIfVisible(page, '[data-testid="nav-feed"]');
    await page.waitForTimeout(500);
    
    if (await clickIfVisible(page, '[data-testid^="post-card-"]')) {
      await page.waitForTimeout(500);
      await capture(page, '10-post-detail');
    }
  });

  test('08 - followers and following lists', async ({ page }) => {
    if (!await login(page)) return;
    await clickIfVisible(page, '[data-testid="nav-profile"]');
    await page.waitForTimeout(500);

    // Click on followers count
    const followersBtn = page.locator('button:has-text("FOLLOWERS")').first();
    try {
      await followersBtn.click({ timeout: 3000 });
      await page.waitForTimeout(500);
      await capture(page, '11-followers-list');
    } catch {
      console.log('Followers not found');
    }

    // Go back and click following
    await backToMain(page);
    await clickIfVisible(page, '[data-testid="nav-profile"]');
    await page.waitForTimeout(500);

    const followingBtn = page.locator('button:has-text("FOLLOWING")').first();
    try {
      await followingBtn.click({ timeout: 3000 });
      await page.waitForTimeout(500);
      await capture(page, '12-following-list');
    } catch {
      console.log('Following not found');
    }
  });

  test('09 - crypto deposit', async ({ page }) => {
    if (!await login(page)) return;
    await clickIfVisible(page, '[data-testid="nav-profile"]');
    await page.waitForTimeout(500);

    if (await clickIfVisible(page, 'button:has-text("Deposit")')) {
      await page.waitForTimeout(1500);
      await capture(page, '13-crypto-deposit');
    }
  });

  test('10 - crypto withdraw', async ({ page }) => {
    if (!await login(page)) return;
    await clickIfVisible(page, '[data-testid="nav-profile"]');
    await page.waitForTimeout(500);

    if (await clickIfVisible(page, 'button:has-text("Withdraw")')) {
      await page.waitForTimeout(1000);
      await capture(page, '14-crypto-withdraw');
    }
  });
});
