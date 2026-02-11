/**
 * X (Twitter) Browser Automation Module
 * Uses REAL Chrome browser (not Playwright's Chromium) to avoid detection
 * 
 * New approach: Read from Following timeline instead of visiting individual profiles
 * This is faster and more natural user behavior
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { BROWSER_CONFIG, FETCH_CONFIG, type Influencer } from '../config.js';
import { isContentFetched } from '../db/tweets.js';

// Random delay function
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

export class TwitterBrowser {
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  /**
   * Launch REAL Chrome browser (not Chromium) to avoid detection
   */
  async launch(): Promise<void> {
    console.log('🚀 Launching REAL Chrome browser...');
    console.log('   (Using your installed Chrome, not Playwright Chromium)\n');
    
    // Use separate browser data folder
    const userDataDir = path.resolve('./browser-data');
    ensureDir(userDataDir);
    
    // KEY: Use channel: 'chrome' to use the real Chrome browser!
    // This is much harder for X to detect as automation
    this.context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',  // <-- Uses your REAL Chrome installation!
      headless: false,
      slowMo: 50,
      viewport: null, // Use default viewport
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
      ],
      ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=AutomationControlled'],
    });

    this.page = this.context.pages()[0] || await this.context.newPage();

    console.log('✅ Real Chrome launched!\n');
  }


  /**
   * Wait for user to login manually
   */
  async waitForManualLogin(): Promise<boolean> {
    if (!this.page) throw new Error('Browser not launched');

    console.log('🔐 Navigating to X...');
    
    try {
      // Go to X home page
      await this.page.goto('https://x.com/home', { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
    } catch (e) {
      console.log('⚠️ Initial navigation timeout, continuing...');
    }

    await randomDelay(3000, 5000);

    // Check if already logged in
    const loggedIn = await this.checkIfLoggedIn();
    if (loggedIn) {
      console.log('✅ Already logged in from saved data!');
      return true;
    }

    // Not logged in - show instructions
    console.log('\n' + '='.repeat(50));
    console.log('📱 Please login to X manually in the browser window');
    console.log('='.repeat(50));
    console.log('\n⏳ Waiting for you to login...');
    console.log('   (Script will auto-continue when login is detected)\n');

    // Poll every 3 seconds for up to 5 minutes
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes
    const checkInterval = 3000; // 3 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Check if logged in
        const isLoggedIn = await this.checkIfLoggedIn();
        if (isLoggedIn) {
          console.log('\n\n✅ Login detected! Continuing...\n');
          return true;
        }
      } catch (e) {
        // Page might be navigating, ignore errors
      }

      // Show progress
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.floor((maxWaitTime - (Date.now() - startTime)) / 1000);
      process.stdout.write(`\r⏳ Waiting for login... ${elapsed}s elapsed, ${remaining}s remaining   `);
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.log('\n\n❌ Login timeout after 5 minutes');
    return false;
  }

  /**
   * Check if user is logged in
   */
  private async checkIfLoggedIn(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const url = this.page.url();
      
      // If redirected to login page, not logged in
      if (url.includes('/login') || url.includes('/i/flow/login')) {
        return false;
      }
      
      // If on home or profile page, check for logged-in elements
      if (url.includes('x.com')) {
        const selectors = [
          '[data-testid="SideNav_AccountSwitcher_Button"]',
          '[data-testid="AppTabBar_Home_Link"]',
          '[data-testid="SideNav_NewTweet_Button"]',
          'a[href="/compose/tweet"]',
          '[aria-label="Profile"]',
        ];

        for (const selector of selectors) {
          try {
            const element = await this.page.$(selector);
            if (element) {
              return true;
            }
          } catch {
            continue;
          }
        }
        
        // Also check if we can see tweets (another sign of being logged in)
        const tweet = await this.page.$('[data-testid="tweet"]');
        const timeline = await this.page.$('[data-testid="primaryColumn"]');
        if (tweet || timeline) {
          // But make sure there's no login button
          const loginBtn = await this.page.$('a[href="/login"]');
          if (!loginBtn) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Visit user profile and screenshot latest tweets
   */
  async fetchUserTweets(influencer: Influencer): Promise<string[]> {
    if (!this.page) throw new Error('Browser not launched');

    const screenshots: string[] = [];
    const { handle, name } = influencer;
    
    console.log(`📱 Visiting @${handle} (${name})'s profile...`);

    try {
      // Visit user profile
      await this.page.goto(`https://x.com/${handle}`, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      
      console.log('⏳ Waiting for page to load...');
      await randomDelay(5000, 8000);

      // Wait for tweets to load
      console.log('⏳ Looking for tweets...');
      try {
        await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 30000 });
      } catch {
        console.log('⚠️ Tweet selector timeout, checking page content...');
      }

      // Get tweet elements - filter out ads
      const allTweets = await this.page.locator('[data-testid="tweet"]').all();
      
      // Filter function to check if a tweet is an ad
      const isAdTweet = async (tweet: typeof allTweets[0]): Promise<boolean> => {
        try {
          // Check for "Ad" label
          const adLabel = tweet.locator('span:has-text("Ad")');
          if (await adLabel.count() > 0) return true;
          
          // Check for "Promoted" label
          const promotedLabel = tweet.locator('span:has-text("Promoted")');
          if (await promotedLabel.count() > 0) return true;
          
          // Check for external links (often ads show "From xyz.com")
          const fromLink = tweet.locator('a[href*="From "]');
          if (await fromLink.count() > 0) return true;
          
          // Check if tweet is from a different user (not the profile owner)
          const tweetAuthor = tweet.locator('[data-testid="User-Name"]').first();
          const authorText = await tweetAuthor.textContent();
          if (authorText && !authorText.toLowerCase().includes(handle.toLowerCase())) {
            // This might be a retweet or ad - check if it has the "From" indicator
            const externalSource = tweet.locator('a[href*=".com"]');
            const sourceText = await externalSource.textContent().catch(() => '');
            if (sourceText?.includes('From ')) return true;
          }
          
          return false;
        } catch {
          return false;
        }
      };
      
      // Filter tweets
      const tweets: typeof allTweets = [];
      for (const tweet of allTweets) {
        const isAd = await isAdTweet(tweet);
        if (!isAd) {
          tweets.push(tweet);
        } else {
          console.log('  ⚠️ Skipping ad tweet');
        }
      }
      
      const tweetsToCapture = Math.min(tweets.length, FETCH_CONFIG.tweetsPerAccount);

      if (tweets.length === 0) {
        console.log('❌ No tweets found on page. The page might need more time to load.');
        // Take a full page screenshot for debugging
        const debugPath = './screenshots/debug_page.png';
        ensureDir('./screenshots');
        await this.page.screenshot({ path: debugPath, fullPage: true });
        console.log(`📸 Debug screenshot saved: ${debugPath}`);
        return screenshots;
      }

      console.log(`📸 Found ${tweets.length} valid tweets (after filtering ads), capturing first ${tweetsToCapture}`);

      // Ensure screenshot directory exists
      ensureDir(FETCH_CONFIG.screenshotDir);

      // Capture each tweet by clicking into detail view for full content
      for (let i = 0; i < tweetsToCapture; i++) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${handle}_${timestamp}_${i + 1}.png`;
        const filepath = path.join(FETCH_CONFIG.screenshotDir, filename);

        try {
          // Re-fetch tweets each time (page might have changed)
          const currentTweets = await this.page.locator('[data-testid="tweet"]').all();
          if (i >= currentTweets.length) {
            console.log(`  ⚠️ Tweet ${i + 1} no longer available, skipping`);
            continue;
          }
          
          const tweet = currentTweets[i];
          
          // Scroll to tweet
          await tweet.scrollIntoViewIfNeeded();
          await randomDelay(500, 1000);

          // Check if this tweet has "Show more" (truncated content)
          const showMoreButton = tweet.locator('[data-testid="tweet-text-show-more-link"]');
          const showMoreText = tweet.locator('span:has-text("Show more")');
          const hasShowMore = await showMoreButton.count() > 0 || await showMoreText.count() > 0;
          
          if (hasShowMore) {
            // Click on the tweet to open detail view (full content)
            console.log(`  📖 Tweet ${i + 1} is truncated, opening full view...`);
            
            // Find and click the tweet's timestamp/link to open detail
            const tweetLink = tweet.locator('a[href*="/status/"]').first();
            if (await tweetLink.count() > 0) {
              await tweetLink.click();
              await randomDelay(2000, 3000);
              
              // Wait for detail view to load
              await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });
              await randomDelay(1000, 1500);
              
              // Take screenshot of the main tweet in detail view
              const detailTweet = await this.page.$('article[data-testid="tweet"]');
              if (detailTweet) {
                await detailTweet.screenshot({ path: filepath });
                screenshots.push(filepath);
                console.log(`  ✅ Screenshot ${i + 1}/${tweetsToCapture}: ${filename} (full view)`);
              }
              
              // Go back to profile
              await this.page.goBack();
              await randomDelay(2000, 3000);
              await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });
            } else {
              // Fallback: just screenshot the tweet as-is
              await tweet.screenshot({ path: filepath });
              screenshots.push(filepath);
              console.log(`  ✅ Screenshot ${i + 1}/${tweetsToCapture}: ${filename}`);
            }
          } else {
            // Tweet is not truncated, screenshot directly
            await tweet.screenshot({ path: filepath });
            screenshots.push(filepath);
            console.log(`  ✅ Screenshot ${i + 1}/${tweetsToCapture}: ${filename}`);
          }

          await randomDelay(1000, 2000);
          
        } catch (error) {
          console.log(`  ⚠️ Failed to capture tweet ${i + 1}:`, error);
        }
      }

    } catch (error) {
      console.error(`❌ Failed to fetch @${handle}:`, error);
    }

    return screenshots;
  }

  /**
   * Extract tweet text directly (much faster than screenshots!)
   * Returns structured tweet data without needing AI vision
   */
  async extractUserTweetsText(influencer: Influencer): Promise<ExtractedTweetData[]> {
    if (!this.page) throw new Error('Browser not launched');

    const results: ExtractedTweetData[] = [];
    const { handle, name } = influencer;
    
    console.log(`📱 Visiting @${handle} (${name})'s profile...`);

    try {
      // Visit user profile
      await this.page.goto(`https://x.com/${handle}`, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      
      console.log('⏳ Waiting for page to load...');
      await randomDelay(3000, 5000);

      // Wait for tweets to load
      await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 30000 });

      // Get all tweets
      const allTweets = await this.page.locator('[data-testid="tweet"]').all();
      console.log(`📝 Found ${allTweets.length} tweets, extracting text...`);

      const tweetsToExtract = Math.min(allTweets.length, FETCH_CONFIG.tweetsPerAccount);

      for (let i = 0; i < tweetsToExtract; i++) {
        try {
          const tweet = allTweets[i];
          
          // Check if it's an ad
          const adLabel = tweet.locator('span:has-text("Ad")');
          const promotedLabel = tweet.locator('span:has-text("Promoted")');
          if (await adLabel.count() > 0 || await promotedLabel.count() > 0) {
            console.log(`  ⚠️ Skipping ad tweet`);
            continue;
          }

          // Scroll to tweet
          await tweet.scrollIntoViewIfNeeded();
          await randomDelay(300, 500);

          // Check if truncated - if so, click to expand
          const showMoreButton = tweet.locator('[data-testid="tweet-text-show-more-link"]');
          let fullContent = '';
          
          if (await showMoreButton.count() > 0) {
            // Click into detail view to get full text
            console.log(`  📖 Tweet ${i + 1} is truncated, opening full view...`);
            const tweetLink = tweet.locator('a[href*="/status/"]').first();
            
            if (await tweetLink.count() > 0) {
              await tweetLink.click();
              await randomDelay(2000, 3000);
              await this.page.waitForSelector('[data-testid="tweetText"]', { timeout: 10000 });
              
              // Get full text from detail view
              const detailTweetText = this.page.locator('[data-testid="tweetText"]').first();
              fullContent = await detailTweetText.textContent() || '';
              
              // Go back
              await this.page.goBack();
              await randomDelay(1500, 2500);
              await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });
              
              // Re-fetch tweets after navigation
              const refreshedTweets = await this.page.locator('[data-testid="tweet"]').all();
              if (i < refreshedTweets.length) {
                allTweets[i] = refreshedTweets[i];
              }
            }
          } else {
            // Get text directly
            const tweetTextElement = tweet.locator('[data-testid="tweetText"]').first();
            fullContent = await tweetTextElement.textContent() || '';
          }

          // Get author info
          const userNameElement = tweet.locator('[data-testid="User-Name"]').first();
          const userNameText = await userNameElement.textContent() || '';
          
          // Get engagement stats
          const likeButton = tweet.locator('[data-testid="like"]').first();
          const retweetButton = tweet.locator('[data-testid="retweet"]').first();
          const replyButton = tweet.locator('[data-testid="reply"]').first();
          
          const likes = await likeButton.textContent().catch(() => '0') || '0';
          const retweets = await retweetButton.textContent().catch(() => '0') || '0';
          const replies = await replyButton.textContent().catch(() => '0') || '0';

          // Get timestamp
          const timeElement = tweet.locator('time').first();
          const timestamp = await timeElement.getAttribute('datetime') || '';

          // Extract media (images, videos, GIFs)
          const mediaData = await this.extractMediaFromTweet(tweet, handle, results.length + 1);

          if (fullContent.trim()) {
            results.push({
              author: name,
              handle: handle,
              content: fullContent.trim(),
              timestamp,
              likes: likes.trim(),
              retweets: retweets.trim(),
              replies: replies.trim(),
              hasMedia: mediaData.hasMedia,
              mediaType: mediaData.mediaType,
              mediaUrls: mediaData.mediaUrls,
              videoUrl: mediaData.videoUrl,
              videoThumbnail: mediaData.videoThumbnail,
            });
            const mediaInfo = mediaData.hasMedia ? ` [${mediaData.mediaType}: ${mediaData.mediaUrls?.length || 0} files]` : '';
            console.log(`  ✅ Extracted tweet ${results.length}: ${fullContent.substring(0, 50)}...${mediaInfo}`);
          }

          await randomDelay(500, 1000);
          
        } catch (error) {
          console.log(`  ⚠️ Failed to extract tweet ${i + 1}:`, error);
        }
      }

    } catch (error) {
      console.error(`❌ Failed to fetch @${handle}:`, error);
    }

    return results;
  }

  /**
   * Extract media (images, videos, GIFs) from a tweet
   */
  private async extractMediaFromTweet(
    tweet: any, 
    handle: string, 
    tweetIndex: number
  ): Promise<{
    hasMedia: boolean;
    mediaType?: 'image' | 'video' | 'gif' | 'mixed';
    mediaUrls?: string[];
    videoUrl?: string;
    videoThumbnail?: string;
  }> {
    const mediaDir = './media';
    ensureDir(mediaDir);
    
    const downloadedUrls: string[] = [];
    let mediaType: 'image' | 'video' | 'gif' | 'mixed' | undefined;
    let videoUrl: string | undefined;
    let videoThumbnail: string | undefined;

    try {
      // Check for images
      const images = tweet.locator('[data-testid="tweetPhoto"] img');
      const imageCount = await images.count();
      
      if (imageCount > 0) {
        mediaType = 'image';
        
        for (let i = 0; i < imageCount; i++) {
          try {
            const img = images.nth(i);
            const src = await img.getAttribute('src');
            
            if (src && !src.includes('emoji') && !src.includes('profile')) {
              // Get highest quality version
              let highQualitySrc = src;
              if (src.includes('?')) {
                // Twitter images: replace format params for higher quality
                highQualitySrc = src.replace(/&name=\w+/, '&name=large');
              }
              
              // Download the image
              const timestamp = Date.now();
              const filename = `${handle}_${tweetIndex}_img${i + 1}_${timestamp}.jpg`;
              const filepath = path.join(mediaDir, filename);
              
              // Use page to download
              const response = await this.page!.request.get(highQualitySrc);
              if (response.ok()) {
                const buffer = await response.body();
                fs.writeFileSync(filepath, buffer);
                downloadedUrls.push(filepath);
              }
            }
          } catch (e) {
            // Continue with other images
          }
        }
      }

      // Check for video
      const videoPlayer = tweet.locator('[data-testid="videoPlayer"]');
      if (await videoPlayer.count() > 0) {
        mediaType = imageCount > 0 ? 'mixed' : 'video';
        
        try {
          // Get video poster (thumbnail)
          const videoPoster = tweet.locator('video').first();
          const posterSrc = await videoPoster.getAttribute('poster');
          
          if (posterSrc) {
            const timestamp = Date.now();
            const thumbFilename = `${handle}_${tweetIndex}_video_thumb_${timestamp}.jpg`;
            const thumbPath = path.join(mediaDir, thumbFilename);
            
            const response = await this.page!.request.get(posterSrc);
            if (response.ok()) {
              const buffer = await response.body();
              fs.writeFileSync(thumbPath, buffer);
              videoThumbnail = thumbPath;
            }
          }

          // Try to get video source URL (this might not always work due to streaming)
          const videoSrc = await videoPoster.getAttribute('src');
          if (videoSrc) {
            videoUrl = videoSrc;
          }
          
          // Alternative: get the tweet URL for video reference
          const tweetLink = tweet.locator('a[href*="/status/"]').first();
          if (await tweetLink.count() > 0) {
            const href = await tweetLink.getAttribute('href');
            if (href && !videoUrl) {
              videoUrl = `https://x.com${href}`;
            }
          }
        } catch (e) {
          // Video extraction failed, continue
        }
      }

      // Check for GIF
      const gifPlayer = tweet.locator('[data-testid="gifPlayer"]');
      if (await gifPlayer.count() > 0) {
        mediaType = 'gif';
        
        try {
          const gifVideo = tweet.locator('[data-testid="gifPlayer"] video').first();
          const gifSrc = await gifVideo.getAttribute('src');
          
          if (gifSrc) {
            const timestamp = Date.now();
            const gifFilename = `${handle}_${tweetIndex}_gif_${timestamp}.mp4`;
            const gifPath = path.join(mediaDir, gifFilename);
            
            const response = await this.page!.request.get(gifSrc);
            if (response.ok()) {
              const buffer = await response.body();
              fs.writeFileSync(gifPath, buffer);
              downloadedUrls.push(gifPath);
            }
          }
        } catch (e) {
          // GIF extraction failed
        }
      }

    } catch (error) {
      // Media extraction failed, return empty
    }

    return {
      hasMedia: downloadedUrls.length > 0 || !!videoThumbnail,
      mediaType,
      mediaUrls: downloadedUrls.length > 0 ? downloadedUrls : undefined,
      videoUrl,
      videoThumbnail,
    };
  }

  /**
   * NEW: Read tweets from Following timeline
   * Much faster than visiting individual profiles!
   * Stops when we hit a tweet older than lastSyncTimestamp
   */
  async readFollowingTimeline(
    lastSyncTimestamp: string | null,
    targetHandles: Set<string>,  // Only extract tweets from these handles
    maxTweets: number = 50
  ): Promise<ExtractedTweetData[]> {
    if (!this.page) throw new Error('Browser not launched');

    const results: ExtractedTweetData[] = [];
    let reachedOldTweets = false;
    let scrollAttempts = 0;
    const maxScrollAttempts = 20;

    console.log('📜 Reading Following timeline...');
    console.log(`   Target handles: ${targetHandles.size}`);
    if (lastSyncTimestamp) {
      console.log(`   Stop at: ${new Date(lastSyncTimestamp).toLocaleString()}`);
    }

    try {
      // Go to Following timeline (not For You)
      await this.page.goto('https://x.com/home', { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      await randomDelay(2000, 3000);

      // Click on "Following" tab if available
      try {
        const followingTab = this.page.locator('a[href="/home"][role="tab"]:has-text("Following")');
        if (await followingTab.count() > 0) {
          await followingTab.click();
          await randomDelay(2000, 3000);
          console.log('✅ Switched to Following timeline');
          
          // Click Following tab again to open Sort dropdown
          await followingTab.click();
          await randomDelay(1000, 1500);
          
          // Select "Recent" to get chronological order
          const recentOption = this.page.locator('text="Recent"').first();
          if (await recentOption.count() > 0) {
            await recentOption.click();
            console.log('✅ Switched to "Recent" sort (chronological)');
            await randomDelay(1500, 2500);
          }
        }
      } catch (e) {
        console.log('⚠️ Could not find Following tab, using default timeline');
      }

      // Wait for tweets to load
      await this.page.waitForSelector('[data-testid="tweet"]', { timeout: 30000 });

      const processedContents = new Set<string>();

      while (!reachedOldTweets && scrollAttempts < maxScrollAttempts && results.length < maxTweets) {
        scrollAttempts++;
        
        // Get all visible tweets
        const tweets = await this.page.locator('[data-testid="tweet"]').all();
        
        for (const tweet of tweets) {
          try {
            // Get tweet content first (for dedup)
            const tweetTextElement = tweet.locator('[data-testid="tweetText"]').first();
            const content = await tweetTextElement.textContent().catch(() => '') || '';
            
            if (!content.trim()) continue;
            
            // Skip if we already processed this content in this session
            const contentKey = content.substring(0, 100);
            if (processedContents.has(contentKey)) continue;
            processedContents.add(contentKey);

            // Get author handle
            const userNameElement = tweet.locator('[data-testid="User-Name"]').first();
            const userNameText = await userNameElement.textContent() || '';
            
            // Extract handle from username text (format: "Display Name@handle·time")
            const handleMatch = userNameText.match(/@(\w+)/);
            const handle = handleMatch ? handleMatch[1] : '';
            
            if (!handle) continue;

            // Check if this is from a target handle
            const isTargetHandle = targetHandles.has(handle) || targetHandles.has(handle.toLowerCase());
            
            // Skip ads
            const adLabel = tweet.locator('span:has-text("Ad")');
            const promotedLabel = tweet.locator('span:has-text("Promoted")');
            if (await adLabel.count() > 0 || await promotedLabel.count() > 0) {
              continue;
            }

            // Get timestamp
            const timeElement = tweet.locator('time').first();
            const timestamp = await timeElement.getAttribute('datetime') || '';

            // Check if we've reached old tweets (stop condition)
            if (lastSyncTimestamp && timestamp && timestamp <= lastSyncTimestamp) {
              console.log(`\n⏹️ Reached previously synced tweet (${new Date(timestamp).toLocaleString()})`);
              reachedOldTweets = true;
              break;
            }

            // Only process tweets from target handles
            if (!isTargetHandle) continue;

            // Check if already in database
            if (isContentFetched(handle, content)) {
              console.log(`  ⏭️ Already fetched: @${handle}`);
              continue;
            }

            // Get full content if truncated
            let fullContent = content;
            const showMoreButton = tweet.locator('[data-testid="tweet-text-show-more-link"]');
            if (await showMoreButton.count() > 0) {
              // Click to expand
              try {
                const tweetLink = tweet.locator('a[href*="/status/"]').first();
                if (await tweetLink.count() > 0) {
                  await tweetLink.click();
                  await randomDelay(2000, 3000);
                  
                  const detailText = this.page.locator('[data-testid="tweetText"]').first();
                  fullContent = await detailText.textContent() || content;
                  
                  await this.page.goBack();
                  await randomDelay(1500, 2500);
                }
              } catch (e) {
                // Keep original content
              }
            }

            // Get engagement stats
            const likeButton = tweet.locator('[data-testid="like"]').first();
            const retweetButton = tweet.locator('[data-testid="retweet"]').first();
            const replyButton = tweet.locator('[data-testid="reply"]').first();
            
            const likes = await likeButton.textContent().catch(() => '0') || '0';
            const retweets = await retweetButton.textContent().catch(() => '0') || '0';
            const replies = await replyButton.textContent().catch(() => '0') || '0';

            // Extract display name
            const displayNameMatch = userNameText.match(/^([^@]+)@/);
            const displayName = displayNameMatch ? displayNameMatch[1].trim() : handle;

            // Extract media
            const mediaData = await this.extractMediaFromTweet(tweet, handle, results.length + 1);

            results.push({
              author: displayName,
              handle: handle,
              content: fullContent.trim(),
              timestamp,
              likes: likes.trim(),
              retweets: retweets.trim(),
              replies: replies.trim(),
              hasMedia: mediaData.hasMedia,
              mediaType: mediaData.mediaType,
              mediaUrls: mediaData.mediaUrls,
              videoUrl: mediaData.videoUrl,
              videoThumbnail: mediaData.videoThumbnail,
            });

            const mediaInfo = mediaData.hasMedia ? ` [${mediaData.mediaType}]` : '';
            console.log(`  ✅ @${handle}: ${fullContent.substring(0, 40)}...${mediaInfo}`);

          } catch (error) {
            // Skip this tweet
          }
        }

        if (reachedOldTweets) break;

        // Scroll down to load more tweets
        await this.page.evaluate(() => window.scrollBy(0, 800));
        await randomDelay(1500, 2500);
        
        process.stdout.write(`\r   Scrolling... (${scrollAttempts}/${maxScrollAttempts}, found ${results.length} new tweets)   `);
      }

      console.log(`\n\n📊 Found ${results.length} new tweets from Following timeline`);

    } catch (error) {
      console.error('❌ Error reading timeline:', error);
    }

    return results;
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      console.log('👋 Browser closed');
    }
  }
}

// Type for extracted tweet data
export interface ExtractedTweetData {
  author: string;
  handle: string;
  content: string;
  timestamp: string;
  likes: string;
  retweets: string;
  replies: string;
  hasMedia: boolean;
  mediaType?: 'image' | 'video' | 'gif' | 'mixed';
  mediaUrls?: string[];           // Downloaded local paths for images
  videoUrl?: string;              // Original video URL (for reference)
  videoThumbnail?: string;        // Downloaded thumbnail for video
  mediaDescription?: string;      // AI-generated description if needed
}
