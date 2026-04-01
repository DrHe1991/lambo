import { test, expect, Page } from '@playwright/test';

const MOCK_USERS = [
  { id: 1, name: 'Alice', handle: 'alice', avatar: null, available_balance: 50000, bio: '', trust_score: 75, follower_count: 5, following_count: 3, post_count: 1, is_following: false, free_posts_remaining: 2 },
  { id: 2, name: 'Bob', handle: 'bob', avatar: null, available_balance: 30000, bio: '', trust_score: 60, follower_count: 3, following_count: 2, post_count: 0, is_following: false, free_posts_remaining: 3 },
  { id: 3, name: 'Eve', handle: 'eve', avatar: null, available_balance: 20000, bio: '', trust_score: 50, follower_count: 2, following_count: 1, post_count: 0, is_following: false, free_posts_remaining: 3 },
];

let postIdCounter = 100;

async function setupMocks(page: Page) {
  await page.route('http://localhost:8003/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.match(/\/api\/users\??[^/]*$/) && method === 'GET') {
      return route.fulfill({ json: MOCK_USERS });
    }
    if (url.match(/\/api\/users\/\d+\/balance/)) {
      return route.fulfill({ json: { balance: 50000, available_balance: 50000, locked_balance: 0, change_24h: 0 } });
    }
    if (url.match(/\/api\/users\/\d+\/costs/)) {
      return route.fulfill({ json: { post_cost: 0, like_base_cost: 1, free_posts_remaining: 3 } });
    }
    if (url.match(/\/api\/users\/\d+\/ledger/)) {
      return route.fulfill({ json: [] });
    }
    if (url.match(/\/api\/users\/\d+/)) {
      const match = url.match(/\/api\/users\/(\d+)/);
      const userId = match ? parseInt(match[1]) : 1;
      const user = MOCK_USERS.find(u => u.id === userId) || MOCK_USERS[0];
      return route.fulfill({ json: user });
    }

    if (url.includes('/api/posts') && method === 'POST') {
      const body = route.request().postDataJSON();
      const id = postIdCounter++;
      const newPost = {
        id,
        author: { id: 1, name: 'Alice', handle: 'alice', avatar: null, trust_score: 75 },
        content: body?.content || '', content_format: 'plain', post_type: 'note', status: 'active',
        media_urls: body?.media_urls || [],
        likes_count: 0, comments_count: 0, bounty: 0,
        is_ai: false, created_at: new Date().toISOString(), is_liked: false,
      };
      return route.fulfill({ json: newPost });
    }
    if (url.includes('/api/posts')) {
      return route.fulfill({ json: [] });
    }

    if (url.includes('/api/drafts')) {
      return route.fulfill({ json: [] });
    }

    if (url.includes('/api/chat')) {
      return route.fulfill({ json: [] });
    }

    return route.fulfill({ json: {} });
  });
}

async function loginAs(page: Page, user: 'alice' | 'bob' | 'eve') {
  await setupMocks(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1000);
  await page.getByTestId(`login-user-${user}`).click();
  await expect(page.getByTestId('nav-feed')).toBeVisible({ timeout: 8000 });
}

test.describe('Posting', () => {
  test('can open new post modal', async ({ page }) => {
    await loginAs(page, 'alice');
    await page.getByTestId('new-post-button').click();
    await expect(page.getByTestId('post-content')).toBeVisible();
    await expect(page.getByTestId('publish-button')).toBeVisible();
  });

  test('can create a new post (free post)', async ({ page }) => {
    await loginAs(page, 'alice');
    await page.getByTestId('new-post-button').click();

    const testContent = `Test post ${Date.now()}`;
    await page.getByTestId('post-content').fill(testContent);
    await page.getByTestId('publish-button').click();

    // Modal should close after successful publish
    await expect(page.getByTestId('post-content')).not.toBeVisible({ timeout: 10000 });

    // Feed nav should be visible confirming return to feed
    await expect(page.getByTestId('nav-feed')).toBeVisible();
  });

  test('post type toggle shows Post and Q&A options', async ({ page }) => {
    await loginAs(page, 'alice');
    await page.getByTestId('new-post-button').click();

    // Should see Post and Q&A toggle options
    await expect(page.locator('text=Post').first()).toBeVisible();
    await expect(page.locator('text=Q&A')).toBeVisible();
  });
});
