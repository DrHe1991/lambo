/**
 * Fetch tweets by extracting text directly (no screenshots, no AI vision needed!)
 * Much faster and more efficient than the screenshot approach
 * 
 * Usage: npm run fetch:text
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { TwitterBrowser, ExtractedTweetData } from './browser/twitter.js';
import { INFLUENCERS } from './config.js';
import { rewriteMultipleTweets } from './ai/rewriter.js';
import type { ExtractedTweet } from './ai/vision.js';

async function main() {
  console.log('🚀 SatLine X Agent - Direct Text Extraction Mode');
  console.log('   (No screenshots, no AI vision - much faster!)\n');
  console.log('='.repeat(50));

  const browser = new TwitterBrowser();

  try {
    // Launch browser
    await browser.launch();

    // Check login
    const loggedIn = await browser.waitForManualLogin();
    if (!loggedIn) {
      console.log('❌ Could not login. Please try again.');
      return;
    }

    // Extract tweets from all influencers
    const allTweets: ExtractedTweetData[] = [];
    
    for (const influencer of INFLUENCERS) {
      console.log(`\n📋 Target: @${influencer.handle} (${influencer.name})`);
      const tweets = await browser.extractUserTweetsText(influencer);
      allTweets.push(...tweets);
    }

    if (allTweets.length === 0) {
      console.log('\n❌ No tweets extracted. Please check the browser.');
      return;
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Extracted ${allTweets.length} tweets total\n`);

    // Save raw extracted data
    const outputDir = './output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rawPath = path.join(outputDir, `extracted_${timestamp}.json`);
    fs.writeFileSync(rawPath, JSON.stringify(allTweets, null, 2));
    console.log(`📄 Raw data saved to: ${rawPath}`);

    // Check if we should rewrite
    if (!process.env.GROQ_API_KEY) {
      console.log('\n⚠️ GROQ_API_KEY not set - skipping AI rewrite');
      console.log('   To enable rewriting, add GROQ_API_KEY to .env');
      return;
    }

    // Convert to the format expected by rewriter
    const tweetsForRewrite: ExtractedTweet[] = allTweets.map(t => ({
      author: t.author,
      handle: t.handle,
      content: t.content,
      timestamp: t.timestamp,
      likes: t.likes,
      retweets: t.retweets,
      replies: t.replies,
      hasMedia: t.hasMedia,
      mediaDescription: t.mediaDescription,
    }));

    // Rewrite content
    console.log('\n✍️ Rewriting content with AI...\n');
    const rewritten = await rewriteMultipleTweets(tweetsForRewrite);

    // Save rewritten content
    const rewrittenPath = path.join(outputDir, `rewritten_${timestamp}.json`);
    fs.writeFileSync(rewrittenPath, JSON.stringify(rewritten, null, 2));

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Done! Processed ${rewritten.length} tweets`);
    console.log(`📄 Results saved to: ${rewrittenPath}`);

    // Print preview
    console.log('\n📋 Content Preview:\n');
    rewritten.forEach((content, index) => {
      console.log(`--- Item ${index + 1} ---`);
      if (content.title) {
        console.log(`Title: ${content.title}`);
      }
      console.log(`Content: ${content.content.substring(0, 100)}...`);
      console.log(`Tags: ${content.tags.join(', ')}`);
      console.log(`Source: @${content.originalHandle}\n`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

main();
