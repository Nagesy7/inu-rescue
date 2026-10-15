// Screenshot every stage in phone landscape (844x390, touch). Usage: node scripts/stages-shot.mjs <tag> [outdir]
import { chromium } from 'playwright';
const tag = process.argv[2] || 'shot', out = process.argv[3] || 'proof', URL = process.env.URL || 'http://localhost:8191/';
const b = await chromium.launch(); let errs = [];
for (let s = 1; s <= 4; s++) {
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL + '?stage=' + s); await p.waitForTimeout(500); await p.tap('[data-k=jump]');
  await p.waitForTimeout(4500); await p.screenshot({ path: `${out}/${tag}-stage${s}-844x390.png` }); await ctx.close();
}
await b.close(); console.log(errs.length ? 'ERRORS ' + errs : 'ok');
