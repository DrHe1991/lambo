/**
 * Complete Pipeline: Fetch + Recognize + Rewrite
 * 
 * Run the entire process with one command:
 * npm run run
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { TwitterBrowser } from './browser/twitter.js';
import { extractMultipleTweets } from './ai/vision.js';
import { rewriteMultipleTweets } from './ai/rewriter.js';
import { INFLUENCERS, FETCH_CONFIG } from './config.js';
import type { RewrittenContent } from './ai/rewriter.js';

async function main() {
  console.log('🚀 BitLink X Agent Starting\n');
  console.log('=' .repeat(60));
  console.log('📋 Task: Fetch Vitalik\'s latest tweets → AI Recognition → Rewrite');
  console.log('=' .repeat(60));

  // Check environment variables
  const { X_USERNAME, X_PASSWORD, GROQ_API_KEY } = process.env;
  
  if (!X_USERNAME || !X_PASSWORD) {
    console.error('❌ Please configure X_USERNAME and X_PASSWORD in .env file');
    return;
  }

  if (!GROQ_API_KEY) {
    console.error('❌ Please configure GROQ_API_KEY in .env file');
    return;
  }

  const browser = new TwitterBrowser();
  let allRewrittenContent: RewrittenContent[] = [];

  try {
    // ============ Phase 1: Fetch ============
    console.log('\n📸 Phase 1: Fetching tweet screenshots\n');
    
    await browser.launch();

    const loginSuccess = await browser.login(X_USERNAME, X_PASSWORD);
    if (!loginSuccess) {
      console.error('❌ Login failed');
      return;
    }

    // Only fetch Vitalik
    const vitalik = INFLUENCERS[0];
    const screenshots = await browser.fetchUserTweets(vitalik);

    await browser.close();

    if (screenshots.length === 0) {
      console.error('❌ No screenshots captured');
      return;
    }

    console.log(`\n✅ Captured ${screenshots.length} screenshots`);

    // ============ Phase 2: Recognize ============
    console.log('\n' + '=' .repeat(60));
    console.log('🔍 Phase 2: AI recognizing screenshot content\n');

    const extractedTweets = await extractMultipleTweets(screenshots);

    if (extractedTweets.length === 0) {
      console.error('❌ Failed to recognize any tweets');
      return;
    }

    console.log(`\n✅ Successfully recognized ${extractedTweets.length} tweets`);

    // ============ Phase 3: Rewrite ============
    console.log('\n' + '=' .repeat(60));
    console.log('✍️ Phase 3: AI rewriting content\n');

    allRewrittenContent = await rewriteMultipleTweets(extractedTweets);

    // ============ Save Results ============
    const outputDir = './output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDir, `content_${timestamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(allRewrittenContent, null, 2), 'utf-8');

    // ============ Completion Report ============
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 Task Complete!');
    console.log('=' .repeat(60));
    console.log(`\n📊 Statistics:`);
    console.log(`   - Screenshots captured: ${screenshots.length}`);
    console.log(`   - Tweets recognized: ${extractedTweets.length}`);
    console.log(`   - Content rewritten: ${allRewrittenContent.length}`);
    console.log(`   - Output file: ${outputPath}`);

    // Print preview
    console.log('\n📋 Rewritten Content Preview:\n');
    allRewrittenContent.forEach((content, index) => {
      console.log(`┌─ Item ${index + 1} ─────────────────────────────────`);
      if (content.title) {
        console.log(`│ Title: ${content.title}`);
      }
      console.log(`│ Content: ${content.content.substring(0, 100)}...`);
      console.log(`│ Tags: ${content.tags.join(', ')}`);
      console.log(`└─ Source: @${content.originalHandle}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error occurred:', error);
    await browser.close();
  }
}

main();
