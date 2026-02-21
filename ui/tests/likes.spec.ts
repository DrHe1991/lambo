import { test, expect } from '@playwright/test';

test.describe('Likes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('can like another user\'s post', async ({ page }) => {
    // First, login as Alice and create a post
    await page.getByTestId('login-user-alice').click();
    await page.getByTestId('new-post-button').click();
    const postContent = `Likeable post ${Date.now()}`;
    await page.getByTestId('post-content').fill(postContent);
    await page.getByTestId('publish-button').click();
    await expect(page.getByTestId('post-content')).not.toBeVisible();
    
    // Logout (clear storage and reload)
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    
    // Login as Bob
    await page.getByTestId('login-user-bob').click();
    await expect(page.getByTestId('nav-feed')).toBeVisible();
    
    // Find Alice's post and like it
    const postCard = page.locator(`text=${postContent}`).locator('..');
    const likeButton = postCard.locator('[data-testid^="like-button-"]');
    
    // Get initial like count
    const initialText = await likeButton.textContent();
    
    // Click like
    await likeButton.click();
    
    // Like button should now show liked state (filled heart / pink color)
    await expect(likeButton).toHaveClass(/text-pink-500/);
  });

  test('liking costs sat', async ({ page }) => {
    // Login as Alice and create a post
    await page.getByTestId('login-user-alice').click();
    await page.getByTestId('new-post-button').click();
    await page.getByTestId('post-content').fill('Post for like test');
    await page.getByTestId('publish-button').click();
    await expect(page.getByTestId('post-content')).not.toBeVisible();
    
    // Switch to Bob
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId('login-user-bob').click();
    
    // Check Bob's balance before
    await page.getByTestId('nav-profile').click();
    const balanceBefore = await page.getByTestId('balance-amount').textContent();
    const beforeNum = parseInt(balanceBefore?.replace(/[^\d]/g, '') || '0');
    
    // Go back to feed and like the post
    await page.getByTestId('nav-feed').click();
    const likeButton = page.locator('[data-testid^="like-button-"]').first();
    await likeButton.click();
    
    // Wait a moment for balance to update
    await page.waitForTimeout(500);
    
    // Check balance after
    await page.getByTestId('nav-profile').click();
    
    // Wait for balance to reflect the change (poll until different or timeout)
    await expect(async () => {
      const balanceAfter = await page.getByTestId('balance-amount').textContent();
      const afterNum = parseInt(balanceAfter?.replace(/[^\d]/g, '') || '0');
      expect(afterNum).toBeLessThan(beforeNum);
    }).toPass({ timeout: 5000 });
  });
});
