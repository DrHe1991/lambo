/**
 * Copy X cookies from your real Chrome to Playwright
 * 
 * This script exports your X login cookies so Playwright can use them.
 * 
 * Usage:
 * 1. Make sure you're logged into X in Chrome
 * 2. Close Chrome completely (Command+Q)
 * 3. Run: npm run copy-cookies
 * 4. Then run: npm run fetch
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';

const CHROME_COOKIES_PATH = `${process.env.HOME}/Library/Application Support/Google/Chrome/Default/Cookies`;
const OUTPUT_PATH = './cookies/x-cookies.json';

async function main() {
  console.log('🍪 Copying X cookies from Chrome...\n');

  // Check if Chrome cookies database exists
  if (!fs.existsSync(CHROME_COOKIES_PATH)) {
    console.error('❌ Chrome cookies database not found at:', CHROME_COOKIES_PATH);
    console.log('\nMake sure you have Google Chrome installed and have used it to login to X.');
    return;
  }

  console.log('📁 Chrome cookies path:', CHROME_COOKIES_PATH);
  console.log('⚠️  Make sure Chrome is completely closed!\n');

  try {
    // Copy the database to a temp location (Chrome locks it while running)
    const tempDbPath = '/tmp/chrome_cookies_copy.db';
    execSync(`cp "${CHROME_COOKIES_PATH}" "${tempDbPath}"`);

    // Open the copied database
    const db = new Database(tempDbPath, { readonly: true });

    // Query for X/Twitter cookies
    const cookies = db.prepare(`
      SELECT 
        name,
        value,
        host_key as domain,
        path,
        expires_utc,
        is_secure as secure,
        is_httponly as httpOnly,
        samesite
      FROM cookies 
      WHERE host_key LIKE '%twitter.com%' 
         OR host_key LIKE '%x.com%'
    `).all();

    db.close();

    if (cookies.length === 0) {
      console.log('❌ No X/Twitter cookies found in Chrome.');
      console.log('   Make sure you are logged into X in Chrome, then try again.');
      return;
    }

    console.log(`✅ Found ${cookies.length} cookies for X/Twitter`);

    // Convert to Playwright format
    const playwrightCookies = cookies.map((c: any) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      expires: c.expires_utc ? Math.floor(c.expires_utc / 1000000 - 11644473600) : -1,
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
      sameSite: c.samesite === 1 ? 'Lax' : c.samesite === 2 ? 'Strict' : 'None',
    }));

    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save cookies
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(playwrightCookies, null, 2));

    console.log(`\n✅ Cookies saved to: ${OUTPUT_PATH}`);
    console.log(`\n📝 Next step: Run "npm run fetch" to use these cookies`);

    // Clean up temp file
    fs.unlinkSync(tempDbPath);

  } catch (error: any) {
    if (error.message?.includes('database is locked')) {
      console.error('\n❌ Chrome database is locked!');
      console.log('   Please close Chrome completely (Command+Q) and try again.');
    } else if (error.message?.includes('SQLITE_NOTADB')) {
      console.error('\n❌ Could not read Chrome cookies database.');
      console.log('   Chrome may be encrypting cookies. Try the manual login method instead.');
    } else {
      console.error('\n❌ Error:', error.message);
    }
  }
}

main();
