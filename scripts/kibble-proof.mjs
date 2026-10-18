// $KIBBLE proof: real mode ($KIBBLE is live: sign-in to buy, no fake balance, Buy without a wallet never pays, shared shop, legal footer) + ?demo=1 (buy/equip) on desktop + iPhone landscape.
import { chromium, devices } from 'playwright';
const URL = process.env.URL || 'http://localhost:8137/', b = await chromium.launch(), errs = [], fails = [];
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails.push(m); };
const inter = (a, c) => a && c && a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height;
for (const [tag, opts] of [['desktop', { viewport: { width: 1280, height: 800 } }], ['iphone', devices['iPhone 13 landscape']]]) {
  const ctx = await b.newContext(opts), p = await ctx.newPage(), posts = []; p.on('pageerror', (e) => errs.push(tag + ': ' + e.message));
  const deep = []; await p.route(/^https:\/\/phantom\.(app|com)\/ul\//, (r) => { deep.push(r.request().url()); r.abort(); }); // phone: Buy without a wallet deep-links into the Phantom app (aborted here; the demo step reloads the game)
  p.on('request', (r) => { if (r.method() !== 'GET' && r.method() !== 'HEAD' && r.method() !== 'OPTIONS') posts.push(r.method() + ' ' + r.url()); });
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => ['soon', 'live', 'offline'].includes(document.documentElement.dataset.kibble), null, { timeout: 20000 }).catch(() => {});
  const mode = await p.evaluate(() => document.documentElement.dataset.kibble); ok(mode === 'live', `${tag}: real mode = ${mode} ($KIBBLE is live)`);
  ok(/KIBBLE live/.test(await p.textContent('#inu-legal')) && !/soon|wallet service/i.test(await p.textContent('#inu-legal')), `${tag}: footer says KIBBLE live`);
  ok(await p.locator('#inu-legal a[href*="terms.html"]').count() === 1 && await p.locator('#inu-legal a[href*="prize-rules.html"]').count() === 1, `${tag}: footer Terms + Prize Rules`);
  if (tag === 'iphone') { const cv = await p.locator('canvas').boundingBox();
    for (const sel of ['#kbar', '#inu-legal']) { const bb = await p.locator(sel).boundingBox(); ok(!inter(bb, cv), `${tag}: ${sel} beside the game, not over it`);
      for (const k of ['up', 'left', 'jump', 'start', 'pause']) ok(!inter(bb, await p.locator(`[data-k="${k}"]`).boundingBox()), `${tag}: ${sel} clear of ${k}`); } }
  await p.screenshot({ path: `proof/kibble-${tag}-title-live.png` });
  await p.click('#k-shop'); await p.waitForSelector('#inu-shop [data-buy]');
  const head0 = await p.textContent('#inu-shop [data-head]');
  ok(/Sign in with Phantom to buy/i.test(head0) && !/DEMO|soon|\d[\d,]* KIBBLE/i.test(head0), `${tag}: live shop asks to sign in, no fake balance (${head0.trim()})`);
  ok(await p.locator('#inu-shop [data-buy]').count() === 9, `${tag}: shop lists 9 rescue cosmetics from server catalog`);
  await p.screenshot({ path: `proof/kibble-${tag}-shop-live.png` });
  await p.click('#inu-shop [data-buy="collar-gold"]', { noWaitAfter: true }); await p.waitForTimeout(1200); const head1 = deep.length ? '' : await p.textContent('#inu-shop [data-head]');
  ok((/Phantom not found/i.test(head1) || deep.some((u) => u.includes('/ul/browse/'))) && await p.locator('#inu-shop [data-eq]').count() === 0 && !posts.length, `${tag}: Buy without a wallet -> ${deep.length ? 'Phantom app deep link' : 'install-Phantom prompt'}, nothing owned, no payment request (${posts.join(', ') || 'no POST'})`);
  if (!deep.length) await p.click('#inu-shop [data-x]');
  // demo
  await p.goto(URL + '?demo=1'); await p.waitForFunction(() => document.documentElement.dataset.kibble === 'demo', null, { timeout: 20000 }).catch(() => {});
  ok(await p.evaluate(() => document.documentElement.dataset.kibble) === 'demo', `${tag}: ?demo=1 = demo`);
  await p.click('#k-shop'); await p.waitForSelector('#inu-shop [data-buy]');
  for (const id of ['collar-gold', 'gear-helmet', 'van-gold']) { await p.click(`#inu-shop [data-buy="${id}"]`); await p.waitForSelector(`#inu-shop [data-eq="${id}"]`); await p.click(`#inu-shop [data-eq="${id}"]`); await p.waitForTimeout(150); }
  ok(/DEMO/.test(await p.textContent('#inu-shop [data-head]')), `${tag}: demo shop labelled fake`);
  await p.click('#inu-shop [data-x]'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !!(window.__inu.look?.collar && window.__inu.look?.gear && window.__inu.look?.van)), `${tag}: equipped look applied`);
  await p.screenshot({ path: `proof/kibble-${tag}-demo-title-gear.png` });
  await p.keyboard.press('Enter'); await p.waitForTimeout(2500); await p.screenshot({ path: `proof/kibble-${tag}-demo-ingame-gear.png` });
  // shared Shiba via an Inu Verse door (?wallet=<address>); profile response stubbed locally (test fixture, no real wallet)
  await p.route('**/api/profile?*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ exists: true, profile: { name: 'Mochi', look: { coat: '#3a2a22', pattern: 'socks', ears: 'floppy', tail: 'fluffy', accent: '#f4e3c8' } } }) }));
  await p.goto(URL + '?wallet=BzLYTFAfUsjzQ5x8bx5BbPK4DFtaHrLCuferkvkxTNGJ');
  await p.waitForFunction(() => window.__inu.look?.shiba, null, { timeout: 20000 }).catch(() => {});
  ok(await p.evaluate(() => window.__inu.look?.shiba?.profile?.name) === 'Mochi', `${tag}: rescuer = shared Shiba from /api/profile (wallet passed by Verse door)`);
  ok(await p.evaluate(() => document.documentElement.dataset.kibble) === 'live' && /Sign in/.test(await p.textContent('#k-wallet').catch(() => '')) && !/Bz/.test(await p.textContent('#inu-wallet').catch(() => '')), `${tag}: door wallet is not a session: still live/sign-in`);
  await p.waitForTimeout(400); await p.screenshot({ path: `proof/kibble-${tag}-shiba-title.png` });
  await p.keyboard.press('Enter'); await p.waitForTimeout(2600); await p.screenshot({ path: `proof/kibble-${tag}-shiba-ingame.png` });
  await ctx.close();
}
console.log('errors', JSON.stringify(errs)); await b.close(); if (fails.length || errs.length) process.exit(1); console.log('ALL PASS');
