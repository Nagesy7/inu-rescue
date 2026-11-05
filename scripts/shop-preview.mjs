// Shop link + results nudge preview (local only). Usage: URL=http://localhost:8137/ node scripts/shop-preview.mjs [outdir]
import { chromium } from 'playwright'; import { mkdirSync } from 'node:fs';
const URL = process.env.URL || 'http://localhost:8137/', OUT = process.argv[2] || '/workspace/inu-rescue-audit/shop-preview'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch(); let fail = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const inter = (a, q) => a && q && a.x < q.x + q.width && q.x < a.x + a.width && a.y < q.y + q.height && q.y < a.y + a.height;
async function gameOver(p) {
  await p.evaluate(() => { const a = window.__inu; if (a.scene !== 'game') document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })); });
  await p.keyboard.press('Enter'); await p.waitForFunction(() => window.__inu.g?.mode === 'play', null, { timeout: 8000 });
  await p.evaluate(async () => { const E = await import(new URL('src/engine.js', location.href).href); const g = window.__inu.g; g.lives = 1; E.killPlayer(g, 'test'); });
  await p.waitForFunction(() => ['entry', 'over'].includes(window.__inu.scene), null, { timeout: 8000 });
  for (let i = 0; i < 12 && await p.evaluate(() => window.__inu.scene) === 'entry'; i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(60); }
  await p.waitForTimeout(1400);
}
for (const [tag, opt] of [['phone-844x390', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }], ['desktop-1280x800', { viewport: { width: 1280, height: 800 } }]]) {
  const ctx = await b.newContext(opt), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(String(e))); p.on('popup', pp => pp.close().catch(() => {}));
  await p.addInitScript(() => { window.__va = []; window.va = (...a) => window.__va.push(a); });
  await p.goto(URL + '?stage=1'); await p.waitForTimeout(3500);
  // 1) settings panel: Shop link as the last row
  await p.click('#k-set'); await p.waitForTimeout(200);
  const L = p.locator('#set-shop'); ok(await L.isVisible(), `${tag}: Shop link visible in settings`);
  ok((await L.textContent()) === '🛍️ Shop' && (await L.getAttribute('title')) === 'Optional cosmetics. $KIBBLE is never needed to play.', `${tag}: exact copy + tooltip`);
  ok((await L.getAttribute('href')) === 'https://kibbleinu.com/pay?utm_source=inu-rescue&utm_medium=menu#shop-h' && (await L.getAttribute('target')) === '_blank' && /noopener/.test(await L.getAttribute('rel')), `${tag}: href, new tab, noopener`);
  const lb = await L.boundingBox(), vp = p.viewportSize(); ok(lb.y + lb.height <= vp.height && lb.x >= 0 && lb.x + lb.width <= vp.width, `${tag}: Shop link on screen ${Math.round(lb.x)},${Math.round(lb.y)}`);
  await p.screenshot({ path: `${OUT}/${tag}-1-settings-shop-link.png` });
  await L.click(); await p.waitForTimeout(300);
  ok(JSON.stringify(await p.evaluate(() => window.__va.filter(a => a[0] === 'event'))) === JSON.stringify([['event', { name: 'paid_link_click', data: { product: 'shop', from: 'inu-rescue-menu', site: 'inu-rescue' } }]]), `${tag}: menu click event props product/from/site only`);
  await p.click('#set-close'); await p.waitForTimeout(150);
  // 2) results nudge on the run-end screen
  await gameOver(p);
  const N = p.locator('#shop-nudge'); ok(await N.isVisible(), `${tag}: nudge shown on GAME OVER`);
  ok((await p.locator('#shop-nudge p').textContent()) === 'Like your look? Outfits, pets and cars for every Inu game are in the Kibble Pay shop. Optional, and never needed to play.', `${tag}: nudge copy exact`);
  ok((await p.locator('#nudge-visit').textContent()) === 'Visit the shop →' && (await p.locator('#nudge-close').textContent()) === 'Not now', `${tag}: button copy exact`);
  ok((await p.locator('#nudge-visit').getAttribute('href')) === 'https://kibbleinu.com/pay?utm_source=inu-rescue&utm_medium=results#shop-h', `${tag}: results utm`);
  ok(await p.evaluate(() => sessionStorage.getItem('inu.shopNudge')) === '1', `${tag}: sessionStorage inu.shopNudge set`);
  const nb = await N.boundingBox(), cb = await p.locator('canvas').boundingBox();
  ok(nb.y >= cb.y && nb.y + nb.height <= cb.y + cb.height + 1 && nb.x >= cb.x && nb.x + nb.width <= cb.x + cb.width + 1, `${tag}: nudge inside the canvas bottom strip ${Math.round(nb.x)},${Math.round(nb.y)} ${Math.round(nb.width)}x${Math.round(nb.height)}`);
  const sel = ['#kbar', '#inu-wallet', '#inu-home', '#inu-legal', '#pad [data-k]', '#stick'];
  for (const s of sel) for (const el of await p.locator(s).all()) { const bb = await el.boundingBox().catch(() => null); if (bb && bb.width) ok(!inter(nb, bb), `${tag}: nudge clear of ${s}${s.includes('data-k') ? '=' + await el.getAttribute('data-k') : ''}`); }
  // PRESS ENTER row (canvas y=186) stays visible above the nudge
  ok(nb.y >= cb.y + (190 / 240) * cb.height, `${tag}: nudge sits below the PRESS ENTER row`);
  await p.screenshot({ path: `${OUT}/${tag}-2-results-nudge.png` });
  const gBefore = await p.evaluate(() => ({ score: window.__inu.lastProg.score, saved: window.__inu.lastProg.saved, bones: window.__inu.bonesGained }));
  // 3) Not now -> hidden, game state untouched, then a second run in the same session shows no nudge
  await p.click('#nudge-close'); await p.waitForTimeout(200); ok(!(await N.isVisible()), `${tag}: Not now dismisses`);
  ok(await p.evaluate(() => window.__inu.scene) === 'over', `${tag}: still on results (Not now does not skip the screen)`);
  ok(JSON.stringify(gBefore) === JSON.stringify(await p.evaluate(() => ({ score: window.__inu.lastProg.score, saved: window.__inu.lastProg.saved, bones: window.__inu.bonesGained }))), `${tag}: results/score/Bones unchanged`);
  await p.screenshot({ path: `${OUT}/${tag}-3-after-not-now.png` });
  await p.keyboard.press('Enter'); await p.waitForFunction(() => window.__inu.scene === 'title'); await p.waitForTimeout(300);
  await gameOver(p); ok(!(await N.isVisible()), `${tag}: second GAME OVER same session: no nudge`);
  await p.screenshot({ path: `${OUT}/${tag}-4-second-run-no-nudge.png` });
  ok(errs.length === 0, `${tag}: no page errors ${errs}`); await ctx.close();
}
// keyboard: Esc dismisses; Visit click fires the results event; fresh session shows it again
{ const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }), p = await ctx.newPage(); p.on('popup', pp => pp.close().catch(() => {}));
  await p.addInitScript(() => { window.__va = []; window.va = (...a) => window.__va.push(a); });
  await p.goto(URL + '?stage=1'); await p.waitForTimeout(1500); await gameOver(p);
  ok(await p.locator('#shop-nudge').isVisible(), 'fresh session: nudge shows'); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok(!(await p.locator('#shop-nudge').isVisible()) && await p.evaluate(() => window.__inu.scene) === 'over', 'Esc dismisses, stays on results');
  await ctx.close();
  const c2 = await b.newContext({ viewport: { width: 1280, height: 800 } }), q = await c2.newPage(); q.on('popup', pp => pp.close().catch(() => {}));
  await q.addInitScript(() => { window.__va = []; window.va = (...a) => window.__va.push(a); });
  await q.goto(URL + '?stage=1'); await q.waitForTimeout(1500); await gameOver(q); await q.click('#nudge-visit'); await q.waitForTimeout(300);
  ok(JSON.stringify(await q.evaluate(() => window.__va.filter(a => a[0] === 'event'))) === JSON.stringify([['event', { name: 'paid_link_click', data: { product: 'shop', from: 'inu-rescue-results', site: 'inu-rescue' } }]]), 'Visit the shop: results event, product/from/site only');
  ok(!(await q.locator('#shop-nudge').isVisible()), 'Visit hides the nudge'); await c2.close();
  // no va at all: clicks still work, no errors
  const c3 = await b.newContext({ viewport: { width: 1280, height: 800 } }), r = await c3.newPage(), e3 = []; r.on('pageerror', e => e3.push(String(e))); r.on('popup', pp => pp.close().catch(() => {}));
  await r.goto(URL + '?stage=1'); await r.evaluate(() => { delete window.va; }); await r.waitForTimeout(1200); await gameOver(r); await r.click('#nudge-visit'); await r.waitForTimeout(200);
  ok(e3.length === 0, `va absent: no page errors ${e3}`); await c3.close(); }
console.log(fail ? `FAILED ${fail}/${n}` : `ALL PASS (${n} checks)`); await b.close(); process.exit(fail ? 1 : 0);
