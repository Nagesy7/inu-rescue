// Landscape touch proof: iPhone 13 + Pixel 7 landscape, real CDP touch: move, jump, climb; layout + rotation.
import { chromium, devices } from 'playwright';
const URL = process.env.URL || 'http://localhost:8137/';
const browser = await chromium.launch(); let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const inter = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
for (const [name, tag] of [['iPhone 13 landscape', 'iphone'], ['Pixel 7 landscape', 'pixel']]) {
  const dev = devices[name]; const ctx = await browser.newContext({ ...dev }); const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL + '?stage=1'); await p.waitForTimeout(400);
  const box = k => p.locator(`[data-k="${k}"]`).boundingBox();
  const c = async k => { const b = await box(k); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: q.id ?? i })) });
  const st = () => p.evaluate(() => { const g = window.__inu.g; return { mode: g?.mode, x: g?.player.x, y: g?.player.y, ps: g?.player.state }; });
  const vp = p.viewportSize(); const cv = await p.locator('canvas').boundingBox();
  ok(Math.abs(cv.height - vp.height) < 2 && Math.abs(cv.width / cv.height - 256 / 240) < 0.01, `${name}: canvas fills height, aspect kept ${Math.round(cv.width)}x${Math.round(cv.height)} in ${vp.width}x${vp.height}`);
  const L = await box('left'), J = await box('jump');
  ok(L.x + L.width < cv.x + 1 && L.x < vp.width / 3, `${name}: D-pad on left, beside game`); ok(J.x > cv.x + cv.width - 1, `${name}: jump on right, beside game`);
  for (const k of ['up', 'down', 'left', 'right', 'jump', 'start', 'pause']) { const b = await box(k); ok(!inter(b, cv) && b.y + b.height <= vp.height && b.x + b.width <= vp.width, `${name}: ${k} on screen, not over play`); }
  await touch('touchStart', [await c('start')]); await p.waitForTimeout(80); await touch('touchEnd', []);
  for (let i = 0; i < 40 && (await st()).mode !== 'play'; i++) await p.waitForTimeout(100);
  const a = await st(); const R = await c('right'); await touch('touchStart', [R]); await p.waitForTimeout(800); const b = await st();
  ok(b.x > a.x + 20, `${name}: hold right moves ${a.x.toFixed(1)} -> ${b.x.toFixed(1)}`);
  await touch('touchMove', [R, { ...(await c('jump')), id: 1 }]); let up = 0;
  for (let i = 0; i < 6; i++) { await p.waitForTimeout(50); up = Math.max(up, b.y - (await st()).y); }
  await touch('touchEnd', []); await p.waitForTimeout(500); ok(up > 3, `${name}: jump while running (rose ${up.toFixed(1)}px)`);
  for (let i = 0; i < 60; i++) { const s = await st(); if (Math.abs(s.x - 110) < 2.5) break; const q = await c(s.x < 110 ? 'right' : 'left');
    await touch('touchStart', [q]); await p.waitForTimeout(Math.max(17, Math.min(120, Math.abs(s.x - 110) / 54 * 1000))); await touch('touchEnd', []); }
  const f0 = await st(); await touch('touchStart', [await c('up')]); await p.waitForTimeout(700); const f1 = await st(); await touch('touchEnd', []);
  ok(f1.ps === 'climb' && f1.y < f0.y - 10, `${name}: up climbs ladder (${f1.ps}, y ${f0.y.toFixed(0)} -> ${f1.y.toFixed(0)})`);
  await p.screenshot({ path: `proof/landscape-${tag}.png` });
  const sc = await p.evaluate(() => [scrollX, scrollY, document.scrollingElement.scrollHeight <= innerHeight]); ok(sc.join() === '0,0,true', `${name}: page does not scroll ${sc}`);
  // live rotation to portrait and back
  await p.setViewportSize({ width: vp.height, height: vp.width }); await p.waitForTimeout(200);
  const pc = await p.locator('canvas').boundingBox(), pj = await box('jump');
  ok(pc.width <= vp.height + 1 && pj.y >= pc.y + pc.height - 1, `${name}: rotated to portrait, pads below game`);
  await p.setViewportSize(vp); await p.waitForTimeout(200); const lc = await p.locator('canvas').boundingBox();
  ok(Math.abs(lc.height - vp.height) < 2, `${name}: rotated back to landscape, canvas refills height`);
  ok(errs.length === 0, `${name}: no page errors ${errs}`); await ctx.close();
}
await browser.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
