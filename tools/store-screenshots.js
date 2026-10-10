// Store screenshots from the interactive preview (or any web build of the app).
// Run on a computer with internet:  npx -y puppeteer browsers install chrome && node tools/store-screenshots.js <url>
// Output: screenshots/play-1080x1920-*.png and screenshots/ios-1242x2688-*.png (App Store 6.5")
const puppeteer = require('puppeteer');
const fs = require('fs');
const url = process.argv[2];
if (!url) { console.error('Usage: node tools/store-screenshots.js <preview-url>'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync('screenshots', { recursive: true });
  const browser = await puppeteer.launch();
  for (const [name, vp] of [['play-1080x1920', { width: 360, height: 640, deviceScaleFactor: 3 }], ['ios-1242x2688', { width: 414, height: 896, deviceScaleFactor: 3 }]]) {
    const p = await browser.newPage();
    await p.setViewport(vp);
    await p.goto(url, { waitUntil: 'networkidle0' });
    await p.addStyleTag({ content: '.strip{display:none!important}' });
    const click = async (sel) => { await p.click(sel); await sleep(400); };
    const shot = async (n) => { await sleep(600); await p.screenshot({ path: `screenshots/${name}-${n}.png` }); };
    await click('[data-a=introNext]'); await click('[data-a=introNext]'); await shot('0-intro');
    await click('[data-a=toLogin]'); await click('[data-a=login]'); await shot('1-categories');
    await click('.cat-tile[data-v="3"]'); await shot('2-category');
    await click('.act[data-a=open][data-v=p1]'); await shot('3-answers');
    await click('[data-a=back]'); await click('[data-a=askIn]'); await shot('4-ask');
    await click('[data-a=back]'); await click('[data-a=back]'); await click('.cat-tile[data-v="12"]'); await shot('5-reviews');
    await click('[data-a=back]'); await click('.cat-tile[data-v="11"]'); await shot('6-lost-found');
    await p.close();
  }
  await browser.close();
  console.log('Saved to ./screenshots');
})();
