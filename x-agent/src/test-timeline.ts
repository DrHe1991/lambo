/**
 * Simple test: Fetch 10 tweets from Following timeline
 * No filtering, no database, just grab whatever is there
 */

import 'dotenv/config';
import * as fs from 'fs';
import { chromium, BrowserContext, Page } from 'playwright';
import * as path from 'path';

// Timestamp logger
function log(msg: string): void {
  const now = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${now}] ${msg}`);
}

// Random delay
function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Ensure directory exists
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

interface SimpleTweet {
  author: string;
  handle: string;
  content: string;
  timestamp: string;
  hasMedia: boolean;
  mediaUrls?: string[];
}

async function main() {
  log('🧪 Simple Timeline Test - Grab 10 tweets\n');

  // Launch real Chrome
  log('🚀 Launching Chrome...');
  const userDataDir = path.resolve('./browser-data');
  ensureDir(userDataDir);

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    slowMo: 50,
    viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
  log('✅ Chrome launched');

  const page = context.pages()[0] || await context.newPage();
  const tweets: SimpleTweet[] = [];

  try {
    // Go to home
    log('🏠 Going to X home...');
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
    log('📄 Page loaded, waiting...');
    await randomDelay(3000, 5000);

    // Check if logged in
    log('🔐 Checking login status...');
    const loginBtn = await page.$('a[href="/login"]');
    if (loginBtn) {
      log('❌ Not logged in! Please login first and run again.');
      await context.close();
      return;
    }
    log('✅ Logged in!\n');

    // Click Following tab and switch to Recent sort
    log('📋 Switching to Following tab...');
    try {
      // Find Following tab
      log('   Looking for Following tab...');
      const followingTab = page.getByRole('tab', { name: 'Following' });
      
      if (await followingTab.count() > 0) {
        // Click to switch to Following
        log('   Clicking Following tab...');
        await followingTab.click();
        await randomDelay(2000, 3000);
        log('✅ On Following tab');
        
        // Check if dropdown appeared (X shows dropdown on click if already on this tab)
        log('   Looking for Recent option...');
        const recentOption = page.getByText('Recent', { exact: true });
        
        if (await recentOption.count() > 0) {
          // Dropdown is open, click Recent
          log('   Clicking Recent...');
          await recentOption.click();
          log('✅ Switched to "Recent" (chronological) sort');
          await randomDelay(2000, 3000);
        } else {
          // Dropdown not open, click tab again to open it
          log('⚙️ Opening Sort menu (clicking tab again)...');
          await followingTab.click({ timeout: 5000 });
          await randomDelay(1500, 2000);
          
          log('   Checking for Recent option again...');
          if (await recentOption.count() > 0) {
            await recentOption.click();
            log('✅ Switched to "Recent" (chronological) sort');
            await randomDelay(2000, 3000);
          } else {
            // Click somewhere else to close any overlay
            log('   Pressing Escape to close overlay...');
            await page.keyboard.press('Escape');
            await randomDelay(500, 1000);
            log('⚠️ Could not find Recent option, continuing with current sort');
          }
        }
      } else {
        log('⚠️ Following tab not found');
      }
    } catch (e: any) {
      // If there's an error, press Escape to close any overlay and continue
      log(`⚠️ Error: ${e.message}`);
      await page.keyboard.press('Escape');
      await randomDelay(500, 1000);
      log('⚠️ Tab switching had issues, continuing anyway');
    }

    // Wait for tweets
    log('📜 Waiting for tweets to load...');
    await page.waitForSelector('[data-testid="tweet"]', { timeout: 30000 });
    log('✅ Tweets visible');

    // Scroll to load more tweets
    log('📜 Scrolling to load more tweets...');
    const targetCount = 10;
    let scrollAttempts = 0;
    const maxScrolls = 5;
    
    while (scrollAttempts < maxScrolls) {
      const currentCount = await page.locator('[data-testid="tweet"]').count();
      if (currentCount >= targetCount + 5) break; // Extra buffer for ads
      
      await page.evaluate(() => window.scrollBy(0, 800));
      await randomDelay(1500, 2500);
      scrollAttempts++;
      log(`   Scroll ${scrollAttempts}/${maxScrolls}: ${currentCount} tweets loaded`);
    }

    // Grab tweets
    const tweetElements = await page.locator('[data-testid="tweet"]').all();
    const toProcess = Math.min(tweetElements.length, 15); // Process more to account for ads

    log(`\n📝 Found ${tweetElements.length} tweets, processing first ${toProcess}...\n`);

    for (let i = 0; i < toProcess; i++) {
      const tweet = tweetElements[i];

      try {
        // Scroll into view
        await tweet.scrollIntoViewIfNeeded();
        await randomDelay(300, 500);

        // Skip ads
        const adLabel = tweet.locator('span:has-text("Ad")');
        const promotedLabel = tweet.locator('span:has-text("Promoted")');
        if (await adLabel.count() > 0 || await promotedLabel.count() > 0) {
          log(`  [${i + 1}] ⚠️ Skipping ad`);
          continue;
        }

        // Get content
        const textEl = tweet.locator('[data-testid="tweetText"]').first();
        const content = await textEl.textContent().catch(() => '') || '';

        // Get author
        const userEl = tweet.locator('[data-testid="User-Name"]').first();
        const userText = await userEl.textContent() || '';
        const handleMatch = userText.match(/@(\w+)/);
        const handle = handleMatch ? handleMatch[1] : 'unknown';
        const displayMatch = userText.match(/^([^@]+)@/);
        const author = displayMatch ? displayMatch[1].trim() : handle;

        // Get timestamp
        const timeEl = tweet.locator('time').first();
        const timestamp = await timeEl.getAttribute('datetime') || '';

        // Check for media
        const hasImages = await tweet.locator('[data-testid="tweetPhoto"]').count() > 0;
        const hasVideo = await tweet.locator('[data-testid="videoPlayer"]').count() > 0;
        const hasMedia = hasImages || hasVideo;

        // Download images if any
        const mediaUrls: string[] = [];
        if (hasImages) {
          const images = tweet.locator('[data-testid="tweetPhoto"] img');
          const imgCount = await images.count();
          for (let j = 0; j < imgCount; j++) {
            try {
              const img = images.nth(j);
              const src = await img.getAttribute('src');
              if (src && !src.includes('emoji')) {
                const highQuality = src.replace(/&name=\w+/, '&name=large');
                const filename = `test_${i + 1}_img${j + 1}.jpg`;
                const filepath = `./media/${filename}`;
                ensureDir('./media');
                
                const response = await page.request.get(highQuality);
                if (response.ok()) {
                  fs.writeFileSync(filepath, await response.body());
                  mediaUrls.push(filepath);
                }
              }
            } catch (e) {}
          }
        }

        tweets.push({
          author,
          handle,
          content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
          timestamp,
          hasMedia,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        });

        const mediaInfo = hasMedia ? ` 📷` : '';
        log(`  [${i + 1}] @${handle}: ${content.substring(0, 40)}...${mediaInfo}`);

      } catch (error: any) {
        log(`  [${i + 1}] ❌ Error: ${error.message?.substring(0, 50) || 'unknown'}`);
      }
    }

    // Save results
    log('─'.repeat(50));
    log(`✅ Extracted ${tweets.length} tweets`);

    ensureDir('./output');
    const outputPath = './output/test_timeline.json';
    fs.writeFileSync(outputPath, JSON.stringify(tweets, null, 2));
    log(`📄 Saved to: ${outputPath}`);

    // Show media
    const mediaFiles = fs.readdirSync('./media').filter(f => f.startsWith('test_'));
    if (mediaFiles.length > 0) {
      log(`📷 Downloaded ${mediaFiles.length} images to ./media/`);
    }

  } catch (error: any) {
    log(`❌ Error: ${error.message}`);
  } finally {
    log('🔒 Closing browser...');
    await context.close();
    log('👋 Done!');
  }
}

main();
