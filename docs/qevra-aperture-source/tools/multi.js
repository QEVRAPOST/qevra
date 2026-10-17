// usage: node multi.js <abs path to html> <scenarios.json>   scenario: {name,w,h,hash,js,wait0,wait,full,reduce,dpr}
// Needs: npm i playwright @fontsource/instrument-serif @fontsource/geist-sans @fontsource/geist-mono (or set PLAYWRIGHT_MODULE and FONTS_DIR).
// Replaces the Google Fonts requests with local @fontsource files so renders are repeatable. Run from the source folder so names resolve.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs'), path = require('path');
const FONTS = process.env.FONTS_DIR || path.join(__dirname, 'node_modules', '@fontsource');
const MAP = { 'instrument serif': 'instrument-serif', 'geist': 'geist-sans', 'geist mono': 'geist-mono', 'newsreader': 'newsreader', 'ibm plex sans': 'ibm-plex-sans', 'ibm plex mono': 'ibm-plex-mono', 'schibsted grotesk': 'schibsted-grotesk', 'martian mono': 'martian-mono' };
(async () => {
  const file = process.argv[2];
  const list = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  for (const sc of list) {
    const ctx = await browser.newContext({ viewport: { width: sc.w || 1360, height: sc.h || 900 }, deviceScaleFactor: sc.dpr || 1, reducedMotion: sc.reduce ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push('[' + m.type() + '] ' + m.text()); });
    page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
    await page.route(/fonts\.googleapis\.com/, async route => {
      const u = decodeURIComponent(route.request().url());
      const fam = (u.match(/family=([^:&]+)/) || [])[1].replace(/\+/g, ' ').toLowerCase();
      const dir = MAP[fam]; let css = '';
      if (dir) {
        const files = fs.readdirSync(path.join(FONTS, dir, 'files')).filter(f => /latin-\d+-(normal|italic)\.woff2$/.test(f));
        for (const f of files) {
          const m = f.match(/latin-(\d+)-(normal|italic)/);
          const b64 = fs.readFileSync(path.join(FONTS, dir, 'files', f)).toString('base64');
          css += `@font-face{font-family:'${fam.replace(/\b\w/g, c => c.toUpperCase())}';font-style:${m[2]};font-weight:${m[1]};src:url(data:font/woff2;base64,${b64}) format('woff2');}\n`;
        }
      }
      await route.fulfill({ status: 200, contentType: 'text/css', body: css });
    });
    await page.route(/fonts\.gstatic\.com/, r => r.abort());
    await page.goto('file://' + file + (sc.hash ? '#' + sc.hash : ''), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(sc.wait0 || 500);
    if (sc.js) { try { const r = await page.evaluate(sc.js); if (r !== undefined) console.log(sc.name, 'EVAL:', JSON.stringify(r)); } catch (e) { logs.push('[evalerr] ' + e.message); } }
    await page.waitForTimeout(sc.wait || 900);
    await page.screenshot({ path: sc.name + '.png', fullPage: !!sc.full });
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight }));
    console.log(sc.name, JSON.stringify(ov), logs.join(' | ') || '(clean)');
    await ctx.close();
  }
  await browser.close();
})();
