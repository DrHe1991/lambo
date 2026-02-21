import { test, expect } from '@playwright/test';

test.describe('Challenge System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('can report a post and see AI result', async ({ page }) => {
    // Login as Alice and create a reportable post
    await page.getByTestId('login-user-alice').click();
    await page.getByTestId('new-post-button').click();
    await page.getByTestId('post-content').fill('Normal test post for reporting');
    await page.getByTestId('publish-button').click();
    await expect(page.getByTestId('post-content')).not.toBeVisible();
    
    // Switch to Eve (the challenger)
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId('login-user-eve').click();
    
    // Find the report button on the post
    const reportButton = page.locator('[data-testid^="report-button-"]').first();
    await reportButton.click();
    
    // Challenge modal should appear
    await expect(page.getByTestId('challenge-modal')).toBeVisible();
    
    // Select a reason
    await page.getByTestId('reason-spam').click();
    
    // Submit the report
    await page.getByTestId('submit-report-button').click();
    
    // Should see processing then result
    await expect(page.locator('text=AI Reviewing')).toBeVisible();
    
    // Wait for result (AI decision) - look for verdict text
    await expect(page.locator('text=Report Upheld').or(page.locator('text=Report Rejected'))).toBeVisible({ timeout: 10000 });
  });

  test('spam content gets flagged as guilty', async ({ page }) => {
    // Login as Alice and create a spam post
    await page.getByTestId('login-user-alice').click();
    await page.getByTestId('new-post-button').click();
    // Use spam keywords that trigger the AI
    await page.getByTestId('post-content').fill('Buy now! Free money guaranteed profit! Click here for 10x returns!');
    await page.getByTestId('publish-button').click();
    await expect(page.getByTestId('post-content')).not.toBeVisible();
    
    // Switch to Eve and report
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId('login-user-eve').click();
    
    const reportButton = page.locator('[data-testid^="report-button-"]').first();
    await reportButton.click();
    
    await page.getByTestId('reason-spam').click();
    await page.getByTestId('submit-report-button').click();
    
    // Should see "Report Upheld" for spam content
    await expect(page.locator('text=Report Upheld')).toBeVisible({ timeout: 10000 });
  });

  test('challenger pays fee', async ({ page }) => {
    // Login as Alice and create a post
    await page.getByTestId('login-user-alice').click();
    await page.getByTestId('new-post-button').click();
    await page.getByTestId('post-content').fill('Test post for fee check');
    await page.getByTestId('publish-button').click();
    await expect(page.getByTestId('post-content')).not.toBeVisible();
    
    // Switch to Eve
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId('login-user-eve').click();
    
    // Check Eve's balance before
    await page.getByTestId('nav-profile').click();
    const balanceBefore = await page.getByTestId('balance-amount').textContent();
    const beforeNum = parseInt(balanceBefore?.replace(/[^\d]/g, '') || '0');
    
    // Report the post
    await page.getByTestId('nav-feed').click();
    const reportButton = page.locator('[data-testid^="report-button-"]').first();
    await reportButton.click();
    
    await page.getByTestId('reason-spam').click();
    await page.getByTestId('submit-report-button').click();
    
    // Wait for result - look for verdict text
    await expect(page.locator('text=Report Upheld').or(page.locator('text=Report Rejected'))).toBeVisible({ timeout: 10000 });
    
    // Close modal by clicking the Confirm/Accept button
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Accept"), button:has-text("Got it")');
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }
    
    // Wait for modal to close
    await expect(page.getByTestId('challenge-modal')).not.toBeVisible({ timeout: 5000 });
    
    // Check balance after
    await page.getByTestId('nav-profile').click();
    const balanceAfter = await page.getByTestId('balance-amount').textContent();
    const afterNum = parseInt(balanceAfter?.replace(/[^\d]/g, '') || '0');
    
    // Balance should have changed (fee paid or refunded depending on result)
    expect(afterNum).not.toBe(beforeNum);
  });
});
