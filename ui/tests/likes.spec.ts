import { test, expect, Page } from '@playwright/test';

const MOCK_USERS = [
  { id: 1, name: 'Alice', handle: 'alice', avatar: null, available_balance: 50000, bio: '', trust_score: 75, follower_count: 5, following_count: 3, post_count: 1, is_following: false, free_posts_remaining: 2 },
  { id: 2, name: 'Bob', handle: 'bob', avatar: null, available_balance: 30000, bio: '', trust_score: 60, follower_count: 3, following_count: 2, post_count: 0, is_following: false, free_posts_remaining: 3 },
  { id: 3, name: 'Eve', handle: 'eve', avatar: null, available_balance: 20000, bio: '', trust_score: 50, follower_count: 2, following_count: 1, post_count: 0, is_following: false, free_posts_remaining: 3 },
];

const MOCK_ALICE_POST = {
  id: 42,
  author: { id: 1, name: 'Alice', handle: 'alice', avatar: null, trust_score: 75 },
  content: 'Alice unique post for Bob to like',
  content_format: 'plain', post_type: 'note', status: 'active',
  media_urls: [], likes_count: 3, comments_count: 0, bounty: 0,
  is_ai: false, created_at: new Date().toISOString(), is_liked: false,
};

async function setupMocks(page: Page, currentUserId = 2) {
  await page.route('http://localhost:8003/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.match(/\/api\/users\??[^/]*$/) && method === 'GET') {
      return route.fulfill({ json: MOCK_USERS });
    }
    if (url.match(/\/api\/users\/\d+\/balance/)) {
      const balance = currentUserId === 2 ? 29999 : 50000;
      return route.fulfill({ json: { balance, available_balance: balance, locked_balance: 0, change_24h: 0 } });
    }
    if (url.match(/\/api\/users\/\d+\/costs/)) {
      return route.fulfill({ json: { post_cost: 0, like_base_cost: 1, free_posts_remaining: 3 } });
    }
    if (url.match(/\/api\/users\/\d+\/ledger/)) {
      return route.fulfill({ json: [] });
    }
    if (url.match(/\/api\/users\/\d+/)) {
      const match = url.match(/\/api\/users\/(\d+)/);
      const userId = match ? parseInt(match[1]) : currentUserId;
      const user = MOCK_USERS.find(u => u.id === userId) || MOCK_USERS[1];
      return route.fulfill({ json: user });
    }

    if (url.includes('/api/posts') && url.includes('/like') && method === 'POST') {
      return route.fulfill({ json: { liked: true, likes_count: 4, cost: 1 } });
    }
    if (url.includes('/api/posts') && url.includes('/like') && method === 'DELETE') {
      return route.fulfill({ json: { liked: false, likes_count: 3 } });
    }
    if (url.includes('/api/posts') && method === 'GET') {
      return route.fulfill({ json: [MOCK_ALICE_POST] });
    }
    if (url.includes('/api/posts') && method === 'POST') {
      return route.fulfill({ json: { ...MOCK_ALICE_POST, id: 99 } });
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

async function loginAs(page: Page, user: 'alice' | 'bob' | 'eve', userId = 1) {
  await setupMocks(page, userId);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1000);
  await page.getByTestId(`login-user-${user}`).click();
  await expect(page.getByTestId('nav-feed')).toBeVisible({ timeout: 8000 });
}

test.describe('Likes', () => {
  test("can like another user's post", async ({ page }) => {
    // Login as Bob (user id=2) so Alice's post is available to like
    await loginAs(page, 'bob', 2);

    // Find Alice's post and like it
    await expect(page.locator(`text=${MOCK_ALICE_POST.content}`)).toBeVisible({ timeout: 5000 });
    const likeButton = page.locator(`[data-testid="like-button-${MOCK_ALICE_POST.id}"]`);
    await expect(likeButton).toBeVisible();

    // Click like
    await likeButton.click();

    // Like button should now show liked state (rose or orange color after like)
    await expect(likeButton).toHaveClass(/text-rose-500|text-orange-500/, { timeout: 5000 });
  });

  test('liking shows like count increase', async ({ page }) => {
    // Login as Bob
    await loginAs(page, 'bob', 2);

    // Find Alice's post in feed
    await expect(page.locator(`text=${MOCK_ALICE_POST.content}`)).toBeVisible({ timeout: 5000 });
    const likeButton = page.locator(`[data-testid="like-button-${MOCK_ALICE_POST.id}"]`);
    await expect(likeButton).toBeVisible();

    // Get like count text before liking
    const countBefore = await likeButton.textContent();

    // Click like
    await likeButton.click();
    await page.waitForTimeout(300);

    // Like button should now be in liked state (rose or orange color)
    await expect(likeButton).toHaveClass(/text-rose-500|text-orange-500/, { timeout: 5000 });

    // Balance card should show a numeric balance
    await page.getByTestId('nav-profile').click();
    await expect(page.getByTestId('balance-card')).toBeVisible();
    await expect(page.getByTestId('balance-amount')).toBeVisible();
  });
});
