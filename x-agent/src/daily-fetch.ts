/**
 * Daily Tweet Fetcher - Timeline Mode
 * 
 * NEW APPROACH: Read from Following timeline instead of visiting individual profiles
 * 
 * Features:
 * - Reads your Following timeline (much faster!)
 * - Only extracts tweets from configured target handles
 * - Stops when reaching tweets older than last sync
 * - Saves all new tweets to SQLite database
 * - Optionally rewrites content with AI
 * 
 * PREREQUISITE: Your X account must follow all the target influencers!
 * 
 * Usage: npm run daily
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { TwitterBrowser, ExtractedTweetData } from './browser/twitter.js';
import { INFLUENCERS } from './config.js';
import { 
  generateTweetId, 
  saveTweet, 
  getStats,
  getLastSyncTimestamp,
  updateLastSyncTimestamp,
  closeDb,
} from './db/tweets.js';
import { rewriteMultipleTweets } from './ai/rewriter.js';
import type { ExtractedTweet } from './ai/vision.js';

// Timestamp logger
function log(msg: string): void {
  const now = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${now}] ${msg}`);
}

async function main() {
  const startTime = Date.now();
  
  log('═══════════════════════════════════════════════════════════════');
  log('  🚀 SatLine X Agent - Daily Fetch (Timeline Mode)');
  log('═══════════════════════════════════════════════════════════════');
  log(`  📅 Date: ${new Date().toLocaleString()}`);
  log(`  👥 Target influencers: ${INFLUENCERS.length}`);
  log('═══════════════════════════════════════════════════════════════');

  // Build set of target handles (lowercase for comparison)
  const targetHandles = new Set<string>();
  for (const inf of INFLUENCERS) {
    targetHandles.add(inf.handle);
    targetHandles.add(inf.handle.toLowerCase());
  }
  
  log(`📋 Targets: ${INFLUENCERS.slice(0, 5).map(i => `@${i.handle}`).join(', ')}${INFLUENCERS.length > 5 ? ` +${INFLUENCERS.length - 5} more` : ''}`);

  // Get last sync timestamp
  const lastSync = getLastSyncTimestamp();
  if (lastSync) {
    log(`⏰ Last sync: ${new Date(lastSync).toLocaleString()}`);
  } else {
    log('⏰ First run - will fetch recent tweets');
  }

  // Show current stats
  const statsBefore = getStats();
  log(`📊 Database: ${statsBefore.total} total tweets`);

  const browser = new TwitterBrowser();

  try {
    // Launch browser
    log('🚀 Launching browser...');
    await browser.launch();
    log('✅ Browser launched');

    // Check login
    log('🔐 Checking login...');
    const loggedIn = await browser.waitForManualLogin();
    if (!loggedIn) {
      log('❌ Could not login. Please try again.');
      return;
    }
    log('✅ Logged in');

    log('─'.repeat(60));

    // Read from Following timeline
    log('📜 Reading Following timeline...');
    const tweets = await browser.readFollowingTimeline(lastSync, targetHandles, 100);

    log('─'.repeat(60));

    if (tweets.length === 0) {
      log('📭 No new tweets from target influencers.');
    } else {
      log(`✅ Found ${tweets.length} new tweets`);

      // Track newest timestamp for next sync
      let newestTimestamp: string | null = null;

      // Save all tweets to database
      log('💾 Saving to database...');
      let savedCount = 0;
      for (const tweet of tweets) {
        const tweetId = generateTweetId(tweet.handle, tweet.content, tweet.timestamp);
        
        const saved = saveTweet({
          tweet_id: tweetId,
          handle: tweet.handle,
          content: tweet.content,
          timestamp: tweet.timestamp,
          likes: tweet.likes,
          retweets: tweet.retweets,
          replies: tweet.replies,
          has_media: tweet.hasMedia,
          media_type: tweet.mediaType,
          media_urls: tweet.mediaUrls,
          video_url: tweet.videoUrl,
          video_thumbnail: tweet.videoThumbnail,
          fetched_at: new Date().toISOString(),
        });

        if (saved) {
          savedCount++;
          if (tweet.timestamp && (!newestTimestamp || tweet.timestamp > newestTimestamp)) {
            newestTimestamp = tweet.timestamp;
          }
        }
      }

      log(`💾 Saved ${savedCount} new tweets`);

      // Update last sync timestamp
      if (newestTimestamp) {
        updateLastSyncTimestamp(newestTimestamp);
        log(`⏰ Updated sync timestamp: ${new Date(newestTimestamp).toLocaleString()}`);
      }

      // Save to output file
      const outputDir = './output';
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rawPath = path.join(outputDir, `daily_${timestamp}.json`);
      fs.writeFileSync(rawPath, JSON.stringify(tweets, null, 2));
      log(`📄 Raw data: ${rawPath}`);

      // Rewrite with AI if API key is available
      if (process.env.GROQ_API_KEY && tweets.length > 0) {
        log('✍️ Rewriting with AI...');

        const tweetsForRewrite: ExtractedTweet[] = tweets.map(t => ({
          author: t.author,
          handle: t.handle,
          content: t.content,
          timestamp: t.timestamp,
          likes: t.likes,
          retweets: t.retweets,
          replies: t.replies,
          hasMedia: t.hasMedia,
          mediaDescription: t.mediaType ? `Contains ${t.mediaType}` : undefined,
        }));

        const rewritten = await rewriteMultipleTweets(tweetsForRewrite);

        const rewrittenPath = path.join(outputDir, `daily_rewritten_${timestamp}.json`);
        fs.writeFileSync(rewrittenPath, JSON.stringify(rewritten, null, 2));
        log(`📄 Rewritten: ${rewrittenPath}`);
      } else if (!process.env.GROQ_API_KEY) {
        log('⚠️ GROQ_API_KEY not set - skipping AI rewrite');
      }
    }

    // Summary
    const statsAfter = getStats();
    const duration = Math.round((Date.now() - startTime) / 1000);

    log('═'.repeat(60));
    log('📊 SUMMARY');
    log(`   ✅ New tweets: ${tweets.length}`);
    log(`   💾 Database: ${statsAfter.total} total (+${statsAfter.total - statsBefore.total})`);
    log(`   ⏱️ Duration: ${duration}s`);
    log('═'.repeat(60));

  } catch (error: any) {
    log(`❌ Fatal error: ${error.message}`);
  } finally {
    log('🔒 Closing browser...');
    await browser.close();
    closeDb();
    log('👋 Done!');
  }
}

main();
