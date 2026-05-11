/**
 * Instagram Login Helper
 *
 * Opens a browser window so you can log into Instagram manually.
 * Once logged in and you see the home feed, the session auto-saves
 * and the browser closes itself.
 *
 * Usage: node scraper/ig-login.js
 */

import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SESSION_PATH = join(__dirname, 'ig-session.json');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('Opening browser — please log into Instagram...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle' });

  console.log('='.repeat(50));
  console.log('1. Log into Instagram in the browser window');
  console.log('2. Wait until you see the home feed');
  console.log('3. Session saves automatically — browser will close');
  console.log('='.repeat(50));
  console.log('\nWaiting for login...');

  // Poll until we detect the user is logged in (home feed URL or logged-in cookie)
  let loggedIn = false;
  for (let i = 0; i < 120; i++) { // 2 min timeout
    await sleep(2000);
    try {
      const url = page.url();
      const cookies = await context.cookies('https://www.instagram.com');
      const hasSession = cookies.some(c => c.name === 'sessionid' && c.value);

      if (hasSession) {
        console.log('✓ Login detected!');
        loggedIn = true;
        break;
      }

      // Print progress dot
      if (i % 5 === 0 && i > 0) process.stdout.write('.');
    } catch {
      // Page might be navigating — ignore
    }
  }

  if (loggedIn) {
    // Wait a moment for cookies to stabilise
    await sleep(3000);
    await context.storageState({ path: SESSION_PATH });
    console.log(`\n✅ Session saved to ${SESSION_PATH}`);
    console.log('The scraper will now use these cookies to bypass the login wall.');
  } else {
    console.log('\n⚠️  Timed out waiting for login. Please try again.');
  }

  await browser.close();
}

main().catch(console.error);
