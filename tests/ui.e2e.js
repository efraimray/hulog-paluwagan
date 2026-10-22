// Browser test (optional): NODE_PATH=$(npm root -g) node tests/ui.e2e.js
// Needs Playwright + Chromium. Serves the repo on a local port and checks
// both builds (index.html and demo/index.html) at desktop and phone width,
// in light and dark, then runs the main flows.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const results = [];
  const ok = (name, pass, info) => { results.push({ name, pass, info: info || '' }); };

  for (const url of ['/index.html', '/demo/index.html']) {
    for (const [w, h] of [[1280, 900], [390, 844]]) {
      for (const scheme of ['light', 'dark']) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
        await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(base + url);
        await page.waitForSelector('#summary .card');
        const tag = url + ' ' + w + ' ' + scheme;
        for (const tab of ['schedule', 'tracker', 'members', 'settings', 'share']) {
          await page.click('[data-tab="' + tab + '"]');
          const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
          if (sw[0] > sw[1]) ok(tag + ' no h-scroll on ' + tab, false, sw.join('>'));
        }
        ok(tag + ' no horizontal scroll (5 tabs)', !results.some(r => r.name.startsWith(tag + ' no h-scroll')));
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        ok(tag + ' body background ' + bg, scheme === 'dark' ? bg === 'rgb(13, 19, 27)' : bg === 'rgb(238, 242, 238)');
        ok(tag + ' no page errors', errors.length === 0, errors.join(' | '));
        if (w === 1280 && scheme === 'light') {
          // Flow 1: mark a hulog in the tracker and see the summary change.
          await page.click('[data-tab="tracker"]');
          const before = await page.textContent('.next-card .meter-row');
          await page.click('.col-current .tick[aria-pressed="false"]');
          const after = await page.textContent('.next-card .meter-row');
          ok(tag + ' tick updates collection', before !== after, before + ' -> ' + after);
          // Flow 2: add a member -> 11 ulo -> 11 rounds
          await page.click('[data-tab="members"]');
          await page.fill('#newMember', 'Tita Nena');
          await page.click('[data-form="add-member"] button[type="submit"]');
          const rounds = await page.$$eval('#orderList li', l => l.length);
          ok(tag + ' add member adds a round', rounds === 11, String(rounds));
          // Flow 3: seeded draw is repeatable
          await page.fill('#seed', 'test-seed-1');
          await page.click('[data-act="draw"]');
          await page.waitForTimeout(900);
          const o1 = await page.$$eval('#orderList .slot-name', l => l.map(x => x.textContent).join(','));
          await page.click('[data-act="sort-az"]');
          await page.fill('#seed', 'test-seed-1');
          await page.click('[data-act="draw"]');
          await page.waitForTimeout(900);
          const o2 = await page.$$eval('#orderList .slot-name', l => l.map(x => x.textContent).join(','));
          ok(tag + ' same seed gives same order', o1 === o2 && o1.length > 0);
          // Flow 4: settings -> monthly changes the dates
          await page.click('[data-tab="settings"]');
          await page.check('input[name="frequency"][value="monthly"]');
          await page.fill('#s-amount', '2500');
          const pot = await page.textContent('#summary .stat .stat-val');
          ok(tag + ' amount 2500 x 11 ulo = 27,500 pot', pot.trim() === '₱27,500', pot);
          await page.fill('#s-amount', '-5');
          ok(tag + ' rejects negative amount', (await page.textContent('#err-amount')).length > 0);
          // Flow 5: backup -> restore round-trip
          const backup = await page.evaluate(() => window.HulogCore.exportJson([JSON.parse(localStorage.getItem('hulog-paluwagan:v1')).groups[0]]));
          await page.click('[data-tab="share"]');
          await page.fill('#importText', backup);
          await page.click('[data-act="import"]');
          const count = await page.$$eval('#groupSelect option', o => o.length);
          ok(tag + ' restore adds a group', count === 2, String(count));
          await page.fill('#importText', '{bad');
          await page.click('[data-act="import"]');
          ok(tag + ' bad backup shows error', (await page.textContent('#importErr')).includes('valid JSON'));
          // Flow 6: reload keeps data (localStorage)
          await page.reload();
          await page.waitForSelector('#summary .card');
          ok(tag + ' data survives reload', (await page.$$eval('#groupSelect option', o => o.length)) === 2);
          // Theme toggle
          await page.click('[data-act="theme"]');
          ok(tag + ' theme toggle sets dark', (await page.getAttribute('html', 'data-theme')) === 'dark');
          ok(tag + ' no page errors after flows', errors.length === 0, errors.join(' | '));
        }
        if (w === 390 && scheme === 'dark' && url === '/index.html' && process.env.SHOT) {
          await page.click('[data-tab="schedule"]');
          await page.screenshot({ path: process.env.SHOT + '-390.png', fullPage: false });
        }
        if (w === 1280 && scheme === 'light' && url === '/demo/index.html' && process.env.SHOT) {
          await page.reload(); await page.waitForSelector('#summary .card');
          await page.click('[data-tab="schedule"]');
          await page.screenshot({ path: process.env.SHOT + '-1280.png', fullPage: false });
        }
        await ctx.close();
      }
    }
  }
  await browser.close();
  server.close();
  const failed = results.filter(r => !r.pass);
  results.forEach(r => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.info && !r.pass ? '  [' + r.info + ']' : '')));
  console.log(results.length - failed.length + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})();
