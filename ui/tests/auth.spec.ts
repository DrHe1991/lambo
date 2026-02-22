import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure fresh state
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('shows login page with available users', async ({ page }) => {
    await page.goto('/');
    
    // Should see the BitLink logo/title
    await expect(page.locator('text=BITLINK')).toBeVisible();
    
    // Should see test users (Alice, Bob, Eve)
    await expect(page.getByTestId('login-user-alice')).toBeVisible();
    await expect(page.getByTestId('login-user-bob')).toBeVisible();
    await expect(page.getByTestId('login-user-eve')).toBeVisible();
  });

  test('can log in as Alice', async ({ page }) => {
    await page.goto('/');
    
    // Click on Alice's login button
    await page.getByTestId('login-user-alice').click();
    
    // Should see the main feed with navigation
    await expect(page.getByTestId('nav-feed')).toBeVisible();
    await expect(page.getByTestId('nav-profile')).toBeVisible();
  });

  test('shows user balance after login', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-user-alice').click();
    
    // Navigate to profile
    await page.getByTestId('nav-profile').click();
    
    // Should see balance card with amount
    await expect(page.getByTestId('balance-card')).toBeVisible();
    await expect(page.getByTestId('balance-amount')).toContainText('sat');
  });
});
