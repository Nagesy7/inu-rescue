// Ambient-life screenshots: each stage at 844x390 (touch) + time/weather variants + title (daily event) + feed + desktop 1280x800.
// Usage: URL=http://localhost:8191/ node scripts/alive-shots.mjs [outdir]. Fails on page errors / console errors (except local /_vercel 404s).
import { chromium } from 'playwright'; import { mkdirSync } from 'node:fs';
const URL = process.env.URL || 'http://localhost:8191/', OUT = process.argv[2] || '/workspace/inu-rescue-audit/alive', local = /localhost/.test(URL);
mkdirSync(OUT, { recursive: true }); const b = await chromium.launch(), errs = [];
const phone = { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
async function page(opts, q, tag) { const ctx = await b.newContext(opts), p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`${tag}: ${e}`)); p.on('console', m => { if (m.type() === 'error' && !(local && /404/.test(m.text()))) errs.push(`${tag}: ${m.text()}`); });
  await p.goto(URL + q); await p.waitForTimeout(2500); return { ctx, p }; }
const shots = [];
for (const [s, name, q] of [[1, 'treehouse', 'time=day'], [2, 'rooftops', 'time=night'], [3, 'delivery', 'time=dusk'], [4, 'dogpark', 'time=day']]) {
  const { ctx, p } = await page(phone, `?stage=${s}&${q}`, name); await p.tap('[data-k=jump]'); await p.waitForTimeout(4500);
  const f = `${OUT}/stage${s}-${name}-844x390.png`; await p.screenshot({ path: f }); shots.push(f);
  console.log(name, JSON.stringify(await p.evaluate(() => ({ counts: __inu.counts(), cond: __inu.cond })))); await ctx.close(); }
for (const [s, name, q] of [[2, 'rooftops-rain-dusk', 'time=dusk&weather=rain'], [1, 'treehouse-night', 'time=night'], [4, 'dogpark-leaves-dawn', 'time=dawn&weather=leaves'], [3, 'delivery-rain-night', 'time=night&weather=rain'], [2, 'rooftops-day', 'time=day']]) {
  const { ctx, p } = await page(phone, `?stage=${s}&${q}`, name); await p.tap('[data-k=jump]'); await p.waitForTimeout(4500);
  const f = `${OUT}/variant-${name}-844x390.png`; await p.screenshot({ path: f }); shots.push(f); await ctx.close(); }
{ const { ctx, p } = await page(phone, '', 'title'); await p.waitForTimeout(1500); const f = `${OUT}/title-daily-event-844x390.png`; await p.screenshot({ path: f }); shots.push(f);
  console.log('title', JSON.stringify(await p.evaluate(() => ({ event: __inu.event, feed: __inu.feed, board: __inu.board }))));
  await p.evaluate(() => { __inu.feedPage = (__inu.feed.find(x => x.id !== 'empty') || __inu.feed[0]).id; }); await p.waitForTimeout(300);
  const g = `${OUT}/title-activity-feed-844x390.png`; await p.screenshot({ path: g }); shots.push(g);
  await p.click('#k-set'); await p.waitForTimeout(300); const h = `${OUT}/settings-panel-844x390.png`; await p.screenshot({ path: h }); shots.push(h); await ctx.close(); }
{ const { ctx, p } = await page({ viewport: { width: 1280, height: 800 } }, '', 'desktop'); const f = `${OUT}/desktop-title-1280x800.png`; await p.screenshot({ path: f }); shots.push(f);
  await p.keyboard.press('Enter'); await p.waitForTimeout(4000); const g = `${OUT}/desktop-game-1280x800.png`; await p.screenshot({ path: g }); shots.push(g); await ctx.close(); }
await b.close(); console.log(shots.join('\n')); console.log(errs.length ? 'ERRORS ' + JSON.stringify(errs) : 'no console errors'); process.exit(errs.length ? 1 : 0);
