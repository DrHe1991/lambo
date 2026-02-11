/**
 * Batch Follow Script
 * 
 * This script will follow all influencers in the config.
 * Run this once with your new scraping account to set up the Following list.
 * 
 * Usage: npm run follow
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { INFLUENCERS } from './config.js';

// Timestamp logger
function log(msg: string): void {
  const now = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${now}] ${msg}`);
}

// Random delay (longer delays to avoid detection)
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

async function main() {
  log('═══════════════════════════════════════════════════════════════');
  log('  🔗 Batch Follow Script - Follow all configured influencers');
  log('═══════════════════════════════════════════════════════════════');
  log(`  📋 Total influencers: ${INFLUENCERS.length}`);
  log('');

  // Launch browser
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

  const results: { handle: string; status: 'followed' | 'already' | 'error' | 'not_found' }[] = [];

  try {
    // Go to X
    log('🏠 Going to X...');
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await randomDelay(3000, 5000);

    // Check login
    log('🔐 Checking login status...');
    const loginBtn = await page.$('a[href="/login"]');
    if (loginBtn) {
      log('❌ Not logged in!');
      log('   Please login manually in the browser window...');
      
      // Wait for login
      const maxWait = 5 * 60 * 1000; // 5 minutes
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWait) {
        await randomDelay(3000, 3000);
        const stillLoginPage = await page.$('a[href="/login"]');
        if (!stillLoginPage) {
          log('✅ Login detected!');
          break;
        }
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        process.stdout.write(`\r[${new Date().toLocaleTimeString('en-US', { hour12: false })}] ⏳ Waiting for login... ${elapsed}s   `);
      }
      console.log('');
    } else {
      log('✅ Already logged in!');
    }

    await randomDelay(2000, 3000);

    log('');
    log('─'.repeat(60));
    log('📋 Starting to follow influencers...');
    log('   (Using random delays to avoid detection)');
    log('─'.repeat(60));
    log('');

    // Follow each influencer
    for (let i = 0; i < INFLUENCERS.length; i++) {
      const influencer = INFLUENCERS[i];
      const progress = `[${i + 1}/${INFLUENCERS.length}]`;

      log(`${progress} 🔍 Checking @${influencer.handle}...`);

      try {
        // Go to user profile
        await page.goto(`https://x.com/${influencer.handle}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        await randomDelay(2000, 3000);

        // Check if account exists
        const notFound = await page.locator('text="This account doesn't exist"').count();
        const suspended = await page.locator('text="Account suspended"').count();
        
        if (notFound > 0 || suspended > 0) {
          log(`   ⚠️ Account not found or suspended`);
          results.push({ handle: influencer.handle, status: 'not_found' });
          continue;
        }

        // Check if already following
        const followingButton = page.locator('[data-testid$="-unfollow"]').first();
        const followButton = page.locator('[data-testid$="-follow"]').first();

        if (await followingButton.count() > 0) {
          log(`   ✅ Already following @${influencer.handle}`);
          results.push({ handle: influencer.handle, status: 'already' });
        } else if (await followButton.count() > 0) {
          // Click follow
          log(`   ➕ Following @${influencer.handle}...`);
          await followButton.click();
          await randomDelay(1000, 2000);

          // Verify
          if (await page.locator('[data-testid$="-unfollow"]').count() > 0) {
            log(`   ✅ Successfully followed @${influencer.handle}`);
            results.push({ handle: influencer.handle, status: 'followed' });
          } else {
            log(`   ⚠️ Follow button clicked but status unclear`);
            results.push({ handle: influencer.handle, status: 'followed' });
          }
        } else {
          log(`   ⚠️ Could not find follow button for @${influencer.handle}`);
          results.push({ handle: influencer.handle, status: 'error' });
        }

        // Random delay between follows (longer to avoid rate limiting)
        if (i < INFLUENCERS.length - 1) {
          const waitTime = Math.floor(Math.random() * 5000) + 3000; // 3-8 seconds
          log(`   ⏳ Waiting ${Math.round(waitTime / 1000)}s before next...`);
          await randomDelay(waitTime, waitTime + 1000);
        }

      } catch (error: any) {
        log(`   ❌ Error: ${error.message?.substring(0, 50) || 'unknown'}`);
        results.push({ handle: influencer.handle, status: 'error' });
      }
    }

    // Summary
    log('');
    log('═'.repeat(60));
    log('📊 SUMMARY');
    log('─'.repeat(40));
    
    const followed = results.filter(r => r.status === 'followed').length;
    const already = results.filter(r => r.status === 'already').length;
    const notFound = results.filter(r => r.status === 'not_found').length;
    const errors = results.filter(r => r.status === 'error').length;

    log(`   ➕ Newly followed: ${followed}`);
    log(`   ✅ Already following: ${already}`);
    log(`   ⚠️ Not found/suspended: ${notFound}`);
    log(`   ❌ Errors: ${errors}`);
    log('═'.repeat(60));

    // Show not found accounts
    if (notFound > 0) {
      log('');
      log('⚠️ These accounts need to be checked:');
      results.filter(r => r.status === 'not_found').forEach(r => {
        log(`   - @${r.handle}`);
      });
    }

    // Save results
    ensureDir('./output');
    const outputPath = './output/follow_results.json';
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    log(`\n📄 Results saved to: ${outputPath}`);

  } catch (error: any) {
    log(`❌ Fatal error: ${error.message}`);
  } finally {
    log('');
    log('🔒 Closing browser...');
    await context.close();
    log('👋 Done!');
  }
}

main();
