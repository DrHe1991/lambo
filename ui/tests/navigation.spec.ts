import { test, expect, Page } from '@playwright/test';

const MOCK_USERS = [
  { id: 1, name: 'Alice', handle: 'alice', avatar: null, available_balance: 50000, bio: '', trust_score: 75, follower_count: 5, following_count: 3, post_count: 1, is_following: false, free_posts_remaining: 2 },
  { id: 2, name: 'Bob', handle: 'bob', avatar: null, available_balance: 30000, bio: '', trust_score: 60, follower_count: 3, following_count: 2, post_count: 0, is_following: false, free_posts_remaining: 3 },
  { id: 3, name: 'Eve', handle: 'eve', avatar: null, available_balance: 20000, bio: '', trust_score: 50, follower_count: 2, following_count: 1, post_count: 0, is_following: false, free_posts_remaining: 3 },
];

const MOCK_POST = {
  id: 42,
  author: { id: 1, name: 'Alice', handle: 'alice', avatar: null, trust_score: 75 },
  content: 'Swipe back target post',
  content_format: 'plain',
  post_type: 'note',
  status: 'active',
  media_urls: [],
  likes_count: 0,
  comments_count: 0,
  bounty: 0,
  cost_paid: 0,
  is_ai: false,
  created_at: new Date().toISOString(),
  is_liked: false,
};

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
      return route.fulfill({ json: { post_cost: 0, like_base_cost: 1, free_posts_remaining: 2 } });
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
    if (url.match(/\/api\/posts\/\d+\/comments/) && method === 'GET') {
      return route.fulfill({ json: [] });
    }
    if (url.match(/\/api\/posts\/\d+/) && method === 'GET') {
      return route.fulfill({ json: MOCK_POST });
    }
    if (url.includes('/api/posts')) {
      return route.fulfill({ json: [MOCK_POST] });
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

async function loginAs(page: Page) {
  await setupMocks(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1000);
  await page.getByTestId('login-user-alice').click();
  await expect(page.getByTestId('nav-feed')).toBeVisible({ timeout: 8000 });
}

test.describe('Navigation', () => {
  test('can navigate to all tabs', async ({ page }) => {
    await loginAs(page);

    // Feed tab
    await page.getByTestId('nav-feed').click();

    // Following tab
    await page.getByTestId('nav-following').click();
    await expect(page.getByTestId('nav-following')).toBeVisible();

    // Chat tab
    await page.getByTestId('nav-chat').click();
    await expect(page.getByTestId('nav-chat')).toBeVisible();

    // Profile tab
    await page.getByTestId('nav-profile').click();
    await expect(page.getByTestId('balance-card')).toBeVisible();
  });

  test('profile shows user info', async ({ page }) => {
    await loginAs(page);
    await page.getByTestId('nav-profile').click();

    // Should see Alice's info
    await expect(page.getByRole('heading', { name: 'Alice' })).toBeVisible();
    await expect(page.getByText('@alice')).toBeVisible();

    // Should see balance
    await expect(page.getByTestId('balance-card')).toBeVisible();

    // Should see transactions option (trust score was removed)
    await expect(page.locator('text=Transactions')).toBeVisible();
  });

  test('new post button opens editor', async ({ page }) => {
    await loginAs(page);
    await page.getByTestId('new-post-button').click();

    // Editor should be visible
    await expect(page.getByTestId('post-content')).toBeVisible();
    await expect(page.getByTestId('publish-button')).toBeVisible();

    // Should see Post/Q&A toggle (not Note/Inquiry)
    await expect(page.locator('text=Post').first()).toBeVisible();
    await expect(page.locator('text=Q&A')).toBeVisible();
  });

  test('left-edge swipe navigates back from post detail in PWA', async ({ page }) => {
    await loginAs(page);

    await page.getByTestId(`post-card-${MOCK_POST.id}`).click();
    await expect(page.getByPlaceholder('Add your insight...')).toBeVisible();

    await page.evaluate(() => {
      const target = document.body;
      const makeTouch = (clientX: number, clientY: number) => new Touch({
        identifier: 1,
        target,
        clientX,
        clientY,
        screenX: clientX,
        screenY: clientY,
        pageX: clientX,
        pageY: clientY,
      });

      const start = makeTouch(8, 420);
      target.dispatchEvent(new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [start],
        targetTouches: [start],
        changedTouches: [start],
      }));

      const move = makeTouch(96, 424);
      target.dispatchEvent(new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [move],
        targetTouches: [move],
        changedTouches: [move],
      }));

      target.dispatchEvent(new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: [],
        targetTouches: [],
        changedTouches: [move],
      }));
    });

    await expect(page.getByPlaceholder('Add your insight...')).not.toBeVisible();
    await expect(page.getByTestId('nav-feed')).toBeVisible();
  });
});
