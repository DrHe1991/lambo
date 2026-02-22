/**
 * Fetch Vitalik's (@VitalikButerin) latest tweets
 * 
 * Usage:
 * 1. Run: npm run fetch
 * 2. Login manually in browser if needed
 * 3. Script will auto-detect login and continue
 */

import 'dotenv/config';
import { TwitterBrowser } from './browser/twitter.js';
import { INFLUENCERS } from './config.js';

async function main() {
  console.log('🚀 BitLink X Agent - Fetch Vitalik\'s Tweets\n');
  console.log('='.repeat(50));

  const browser = new TwitterBrowser();

  try {
    // Launch browser
    await browser.launch();

    // Wait for login (manual if needed)
    const loggedIn = await browser.waitForManualLogin();
    
    if (!loggedIn) {
      console.error('❌ Could not login. Please try again.');
      await browser.close();
      return;
    }

    // Fetch Vitalik's tweets
    const vitalik = INFLUENCERS[0];
    console.log(`\n📋 Target: @${vitalik.handle} (${vitalik.name})`);
    
    const screenshots = await browser.fetchUserTweets(vitalik);

    // Summary
    console.log('\n' + '='.repeat(50));
    if (screenshots.length > 0) {
      console.log(`✅ Success! Captured ${screenshots.length} screenshots:`);
      screenshots.forEach(s => console.log(`   📸 ${s}`));
      console.log('\n📝 Next step: Run "npm run rewrite" to process with AI');
    } else {
      console.log('❌ No screenshots captured. Please check the browser.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

main();
