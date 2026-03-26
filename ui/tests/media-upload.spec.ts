import { test, expect, Page } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

const SCREENSHOT_DIR = path.join(os.homedir(), 'Desktop', 'bitlink-screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const MOCK_USERS = [
  { id: 1, name: 'Alice', handle: 'alice', avatar: null, available_balance: 50000, bio: 'Test user', trust_score: 75, follower_count: 10, following_count: 5, post_count: 3, is_following: false },
  { id: 2, name: 'Bob', handle: 'bob', avatar: null, available_balance: 30000, bio: 'Another user', trust_score: 60, follower_count: 5, following_count: 3, post_count: 2, is_following: false },
];

const MOCK_POSTS = [
  {
    id: 1,
    author: { id: 2, name: 'Bob', handle: 'bob', avatar: null, trust_score: 60 },
    content: 'Check out this awesome photo!', content_format: 'plain', post_type: 'note', status: 'active',
    media_urls: ['https://picsum.photos/seed/test1/400/300', 'https://picsum.photos/seed/test2/400/300'],
    likes_count: 5, comments_count: 0, bounty: 0,
    is_ai: false, created_at: '2026-03-25T10:00:00Z', is_liked: false,
  },
  {
    id: 2,
    author: { id: 1, name: 'Alice', handle: 'alice', avatar: null, trust_score: 75 },
    content: 'Just a text post', content_format: 'plain', post_type: 'note', status: 'active',
    media_urls: [],
    likes_count: 3, comments_count: 0, bounty: 0,
    is_ai: false, created_at: '2026-03-25T09:00:00Z', is_liked: false,
  },
];

const MOCK_UPLOAD_RESPONSE = {
  url: 'https://picsum.photos/seed/uploaded/400/300',
  thumbnail_url: 'https://picsum.photos/seed/uploaded/200/150',
  media_type: 'image',
};

const MOCK_CHAT_SESSIONS = [
  {
    id: 1, name: null, is_group: false, avatar: null, description: null, owner_id: null,
    members: [
      { id: 1, name: 'Alice', handle: 'alice', avatar: null, available_balance: 50000 },
      { id: 2, name: 'Bob', handle: 'bob', avatar: null, available_balance: 30000 },
    ],
    last_message: 'Hey!', last_message_at: '2026-03-25T09:00:00Z',
    unread_count: 0,
  },
];

const MOCK_CHAT_MESSAGES = [
  {
    id: '1', session_id: 1, sender_id: 2, sender_name: 'Bob', sender_handle: 'bob', sender_avatar: null,
    content: 'Hey there!', media_url: null, message_type: 'text', status: 'read',
    reply_to_id: null, created_at: '2026-03-25T09:00:00Z',
  },
];

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
      const newPost = {
        id: 999,
        author: { id: 1, name: 'Alice', handle: 'alice', avatar: null, trust_score: 75 },
        content: body?.content || '', content_format: 'plain', post_type: 'note', status: 'active',
        media_urls: body?.media_urls || [],
        likes_count: 0, comments_count: 0, bounty: 0,
        is_ai: false, created_at: new Date().toISOString(), is_liked: false,
      };
      return route.fulfill({ json: newPost });
    }
    if (url.includes('/api/posts')) {
      return route.fulfill({ json: MOCK_POSTS });
    }

    if (url.includes('/api/media/upload')) {
      return route.fulfill({ json: MOCK_UPLOAD_RESPONSE });
    }

    if (url.includes('/api/chat/sessions') && url.includes('/messages')) {
      if (method === 'POST') {
        const body = route.request().postDataJSON();
        const newMsg = {
          id: '999', session_id: 1, sender_id: 1, sender_name: 'Alice', sender_handle: 'alice', sender_avatar: null,
          content: body?.content || '', media_url: body?.media_url || null,
          message_type: body?.media_url ? 'image' : 'text', status: 'sent',
          reply_to_id: null, created_at: new Date().toISOString(),
        };
        return route.fulfill({ json: [newMsg] });
      }
      return route.fulfill({ json: MOCK_CHAT_MESSAGES });
    }
    if (url.includes('/api/chat/sessions')) {
      return route.fulfill({ json: MOCK_CHAT_SESSIONS });
    }

    if (url.includes('/api/drafts')) {
      return route.fulfill({ json: [] });
    }

    return route.fulfill({ json: {} });
  });
}

async function capture(page: Page, name: string) {
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: false,
  });
  console.log(`Captured: ${name}`);
}

async function loginWithMocks(page: Page): Promise<boolean> {
  try {
    await setupMocks(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(2000);

    const userButton = page.locator('[data-testid="login-user-alice"]');
    await userButton.waitFor({ state: 'visible', timeout: 5000 });
    await userButton.click();
    await page.waitForTimeout(2000);

    const navFeed = page.locator('[data-testid="nav-feed"]');
    await navFeed.waitFor({ state: 'visible', timeout: 8000 });
    console.log('Login successful');
    return true;
  } catch (e) {
    console.log('Login failed:', String(e).slice(0, 200));
    return false;
  }
}

function createTestPng(): string {
  const filepath = path.join(os.tmpdir(), 'bitlink-test.png');
  if (fs.existsSync(filepath)) return filepath;
  const buf = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0xf8, 0x0f, 0x00, 0x00,
    0x01, 0x01, 0x00, 0x05, 0x18, 0xd8, 0x4e, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
  fs.writeFileSync(filepath, buf);
  return filepath;
}

test.describe('Media Upload Feature', () => {
  test.setTimeout(120000);

  // Mocks are set up inside loginWithMocks

  test('01 - post editor shows Add photo button', async ({ page }) => {
    expect(await loginWithMocks(page)).toBeTruthy();

    await page.locator('[data-testid="new-post-button"]').click();
    await page.waitForTimeout(500);

    const addPhotoBtn = page.locator('button:has-text("Add photo")');
    await expect(addPhotoBtn).toBeVisible({ timeout: 5000 });
    console.log('PASS: "Add photo" button visible in post editor');

    await capture(page, 'media-01-post-editor-image-btn');
  });

  test('02 - upload image in post shows preview', async ({ page }) => {
    expect(await loginWithMocks(page)).toBeTruthy();

    await page.locator('[data-testid="new-post-button"]').click();
    await page.waitForTimeout(500);

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('button:has-text("Add photo")').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(createTestPng());

    await page.waitForTimeout(2000);

    const previewImages = page.locator('img[src*="picsum"]');
    const count = await previewImages.count();
    console.log(`Image previews rendered: ${count}`);
    expect(count).toBeGreaterThan(0);

    await capture(page, 'media-02-post-image-preview');
  });

  test('03 - publish post includes media_urls', async ({ page }) => {
    expect(await loginWithMocks(page)).toBeTruthy();

    await page.locator('[data-testid="new-post-button"]').click();
    await page.waitForTimeout(500);

    // Upload image
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('button:has-text("Add photo")').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(createTestPng());
    await page.waitForTimeout(2000);

    // Type content
    await page.locator('[data-testid="post-content"]').fill('Testing image upload!');
    await page.waitForTimeout(300);

    // Track API call
    let mediaUrls: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/api/posts') && req.method() === 'POST') {
        const body = req.postDataJSON();
        mediaUrls = body?.media_urls || [];
      }
    });

    await page.locator('[data-testid="publish-button"]').click();
    await page.waitForTimeout(2000);

    console.log(`Post created with media_urls: ${JSON.stringify(mediaUrls)}`);
    expect(mediaUrls.length).toBeGreaterThan(0);
    console.log('PASS: Post creation includes media_urls');

    await capture(page, 'media-03-post-published');
  });

  test('04 - feed renders image grid in PostCard', async ({ page }) => {
    expect(await loginWithMocks(page)).toBeTruthy();

    await page.waitForTimeout(1500);

    // Mock feed has Bob's post with 2 picsum image URLs
    const postImages = page.locator('img[src*="picsum"]');
    const imgCount = await postImages.count();
    console.log(`Images rendered in feed: ${imgCount}`);
    expect(imgCount).toBeGreaterThan(0);
    console.log('PASS: ImageGrid renders images in PostCard');

    await capture(page, 'media-04-feed-image-grid');
  });

  test('05 - article editor has image insert button', async ({ page }) => {
    expect(await loginWithMocks(page)).toBeTruthy();

    await page.locator('[data-testid="new-post-button"]').click();
    await page.waitForTimeout(500);

    const addTitleBtn = page.locator('button:has-text("Add title")');
    await expect(addTitleBtn).toBeVisible({ timeout: 5000 });
    await addTitleBtn.click();
    await page.waitForTimeout(500);

    const imageBtn = page.locator('button[title="Insert Image"]');
    await expect(imageBtn).toBeVisible({ timeout: 5000 });
    console.log('PASS: "Insert Image" button visible in article toolbar');

    await capture(page, 'media-05-article-editor-image-btn');
  });

  test('06 - chat attachment menu shows Camera and Album', async ({ page }) => {
    expect(await loginWithMocks(page)).toBeTruthy();

    await page.locator('[data-testid="nav-chat"]').click();
    await page.waitForTimeout(800);

    const chatSession = page.locator('text=Bob').first();
    await chatSession.waitFor({ state: 'visible', timeout: 5000 });
    await chatSession.click();
    await page.waitForTimeout(800);

    // The "+" button in chat input area (not the FAB)
    const plusButton = page.locator('button.p-2.text-stone-400').filter({ has: page.locator('svg.lucide-plus') });
    await plusButton.waitFor({ state: 'visible', timeout: 5000 });
    await plusButton.click();
    await page.waitForTimeout(500);

    await expect(page.locator('button:has-text("Camera")')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('button:has-text("Album")')).toBeVisible({ timeout: 3000 });
    console.log('PASS: Camera and Album buttons visible in chat');

    await capture(page, 'media-06-chat-attachment-menu');
  });

  test('07 - send image in chat via Album', async ({ page }) => {
    expect(await loginWithMocks(page)).toBeTruthy();

    await page.locator('[data-testid="nav-chat"]').click();
    await page.waitForTimeout(800);

    const chatSession = page.locator('text=Bob').first();
    await chatSession.waitFor({ state: 'visible', timeout: 5000 });
    await chatSession.click();
    await page.waitForTimeout(800);

    const plusButton = page.locator('button.p-2.text-stone-400').filter({ has: page.locator('svg.lucide-plus') });
    await plusButton.waitFor({ state: 'visible', timeout: 5000 });
    await plusButton.click();
    await page.waitForTimeout(500);

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('button:has-text("Album")').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(createTestPng());

    let imageSent = false;
    page.on('request', req => {
      if (req.url().includes('/messages') && req.method() === 'POST') {
        const body = req.postDataJSON();
        if (body?.media_url) {
          imageSent = true;
        }
      }
    });

    await page.waitForTimeout(3000);
    console.log(`Image sent in chat: ${imageSent}`);
    expect(imageSent).toBeTruthy();
    console.log('PASS: Chat image message sent with media_url');

    await capture(page, 'media-07-chat-image-sent');
  });
});
