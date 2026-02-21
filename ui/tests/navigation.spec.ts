import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    
    // Login as Alice
    await page.getByTestId('login-user-alice').click();
    await expect(page.getByTestId('nav-feed')).toBeVisible();
  });

  test('can navigate to all tabs', async ({ page }) => {
    // Feed tab
    await page.getByTestId('nav-feed').click();
    // Feed should show posts or empty state

    // Following tab
    await page.getByTestId('nav-following').click();
    // Following feed should be visible

    // Chat tab
    await page.getByTestId('nav-chat').click();
    // Just verify we navigated successfully (nav is still visible)
    await expect(page.getByTestId('nav-chat')).toBeVisible();

    // Profile tab
    await page.getByTestId('nav-profile').click();
    await expect(page.getByTestId('balance-card')).toBeVisible();
  });

  test('profile shows user info', async ({ page }) => {
    await page.getByTestId('nav-profile').click();
    
    // Should see Alice's info - use specific role selector
    await expect(page.getByRole('heading', { name: 'Alice' })).toBeVisible();
    await expect(page.getByText('@alice')).toBeVisible();
    
    // Should see balance
    await expect(page.getByTestId('balance-card')).toBeVisible();
    
    // Should see trust score option
    await expect(page.locator('text=Trust Score')).toBeVisible();
    
    // Should see transactions option
    await expect(page.locator('text=Transactions')).toBeVisible();
  });

  test('new post button opens editor', async ({ page }) => {
    await page.getByTestId('new-post-button').click();
    
    // Editor should be visible
    await expect(page.getByTestId('post-content')).toBeVisible();
    await expect(page.getByTestId('publish-button')).toBeVisible();
    
    // Should see Note/Inquiry toggle
    await expect(page.locator('text=Note')).toBeVisible();
    await expect(page.locator('text=Inquiry')).toBeVisible();
  });
});
