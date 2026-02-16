import { test, expect } from '@playwright/test';

test.describe('Posting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    
    // Login as Alice
    await page.getByTestId('login-user-alice').click();
    await expect(page.getByTestId('nav-feed')).toBeVisible();
  });

  test('can open new post modal', async ({ page }) => {
    await page.getByTestId('new-post-button').click();
    
    // Should see post editor
    await expect(page.getByTestId('post-content')).toBeVisible();
    await expect(page.getByTestId('publish-button')).toBeVisible();
  });

  test('can create a new post (free post)', async ({ page }) => {
    await page.getByTestId('new-post-button').click();
    
    const testContent = `Test post ${Date.now()}`;
    await page.getByTestId('post-content').fill(testContent);
    await page.getByTestId('publish-button').click();
    
    // Should close modal and show the post in feed
    await expect(page.getByTestId('post-content')).not.toBeVisible();
    
    // Navigate to feed to see the post
    await page.getByTestId('nav-feed').click();
    await expect(page.locator(`text=${testContent}`)).toBeVisible();
  });

  test('post costs sat after free post is used', async ({ page }) => {
    // Navigate to profile to check balance
    await page.getByTestId('nav-profile').click();
    const balanceBefore = await page.getByTestId('balance-amount').textContent();
    
    // Go back and create first free post
    await page.getByTestId('nav-feed').click();
    await page.getByTestId('new-post-button').click();
    await page.getByTestId('post-content').fill('First free post');
    await page.getByTestId('publish-button').click();
    
    // Wait for modal to close
    await expect(page.getByTestId('post-content')).not.toBeVisible();
    
    // Create second post (should cost sat)
    await page.getByTestId('new-post-button').click();
    await page.getByTestId('post-content').fill('Second paid post');
    await page.getByTestId('publish-button').click();
    
    // Wait for modal to close
    await expect(page.getByTestId('post-content')).not.toBeVisible();
    
    // Check balance decreased
    await page.getByTestId('nav-profile').click();
    const balanceAfter = await page.getByTestId('balance-amount').textContent();
    
    // Balance should have decreased
    expect(balanceAfter).not.toBe(balanceBefore);
  });
});
