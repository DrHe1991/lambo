/**
 * Test Script: Recognize and rewrite captured screenshots
 * 
 * Usage:
 * 1. First run npm run fetch to get screenshots
 * 2. Make sure GROQ_API_KEY is configured in .env
 * 3. Run npm run rewrite
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { extractMultipleTweets } from './ai/vision.js';
import { rewriteMultipleTweets } from './ai/rewriter.js';
import { FETCH_CONFIG } from './config.js';

async function main() {
  console.log('🔍 Starting tweet recognition and rewriting\n');
  console.log('=' .repeat(50));

  // Check API Key
  if (!process.env.GROQ_API_KEY) {
    console.error('❌ Please configure GROQ_API_KEY in .env file');
    return;
  }

  // Find screenshot files
  const screenshotDir = FETCH_CONFIG.screenshotDir;
  if (!fs.existsSync(screenshotDir)) {
    console.error(`❌ Screenshot directory does not exist: ${screenshotDir}`);
    console.error('   Please run npm run fetch first to get screenshots');
    return;
  }

  const files = fs.readdirSync(screenshotDir)
    .filter(f => f.endsWith('.png'))
    .map(f => path.join(screenshotDir, f));

  if (files.length === 0) {
    console.error('❌ No screenshot files found');
    return;
  }

  console.log(`📸 Found ${files.length} screenshots\n`);

  // Step 1: Recognize screenshot content
  console.log('📝 Step 1: Recognizing tweet content from screenshots...\n');
  const extractedTweets = await extractMultipleTweets(files);

  if (extractedTweets.length === 0) {
    console.error('❌ Failed to recognize any tweets');
    return;
  }

  console.log(`\n✅ Successfully recognized ${extractedTweets.length} tweets\n`);
  console.log('=' .repeat(50));

  // Step 2: Rewrite content
  console.log('\n✍️ Step 2: Rewriting tweet content...\n');
  const rewrittenContents = await rewriteMultipleTweets(extractedTweets);

  // Save results
  const outputDir = './output';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `rewritten_${timestamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(rewrittenContents, null, 2), 'utf-8');

  console.log('\n' + '=' .repeat(50));
  console.log(`✅ Rewrite complete! Processed ${rewrittenContents.length} items`);
  console.log(`📄 Results saved to: ${outputPath}`);

  // Print preview
  console.log('\n📋 Content Preview:\n');
  rewrittenContents.forEach((content, index) => {
    console.log(`--- Item ${index + 1} ---`);
    if (content.title) {
      console.log(`Title: ${content.title}`);
    }
    console.log(`Content: ${content.content}`);
    console.log(`Tags: ${content.tags.join(', ')}`);
    console.log(`Source: @${content.originalHandle}\n`);
  });
}

main();
