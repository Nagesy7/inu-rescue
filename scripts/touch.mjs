// Mobile touch proof: real CDP touch events (multi-touch, sliding) on iPhone 13 + Pixel 7 emulation.
import { chromium, devices } from 'playwright';
const URL = process.env.URL || 'http://localhost:8137/';
const browser = await chromium.launch(); let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
for (const [name, dev, tag] of [['iPhone 13', devices['iPhone 13'], 'iphone'], ['Pixel 7', devices['Pixel 7'], 'pixel'], ['iPhone 13 landscape', devices['iPhone 13 landscape'], 'iphone-landscape']]) {
  const ctx = await browser.newContext({ ...dev }); const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL + '?stage=1'); await p.waitForTimeout(400);
  const c = async k => { const b = await p.locator(`[data-k="${k}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: q.id ?? i })) });
  const st = () => p.evaluate(() => { const g = window.__inu.g; return { scene: window.__inu.scene, mode: g?.mode, x: g?.player.x, y: g?.player.y, ps: g?.player.state, sel: String(getSelection()), vy: g?.player.vy }; });
  const vp = p.viewportSize(); const cv = await p.locator('canvas').boundingBox();
  ok(cv.x >= 0 && cv.y >= 0 && cv.x + cv.width <= vp.width + 1 && cv.y + cv.height <= vp.height + 1 && cv.width > 200, `${name}: canvas fits ${Math.round(cv.width)}x${Math.round(cv.height)} in ${vp.width}x${vp.height}`);
  for (const k of ['left', 'right', 'up', 'jump', 'start']) { const q = await c(k); ok(q.y < vp.height && q.x < vp.width, `${name}: ${k} on screen`); }
  const s0 = await c('start'); await touch('touchStart', [s0]); await p.waitForTimeout(80); await touch('touchEnd', []);
  for (let i = 0; i < 40 && (await st()).mode !== 'play'; i++) await p.waitForTimeout(100);
  // long hold right
  let a = await st(); const R = await c('right'); await touch('touchStart', [R]); await p.waitForTimeout(900);
  const pressedVis = await p.locator('[data-k="right"]').evaluate(e => e.classList.contains('on'));
  let b = await st(); ok(b.x > a.x + 20, `${name}: hold right moves hero ${a.x.toFixed(1)} -> ${b.x.toFixed(1)}`); ok(pressedVis, `${name}: pressed state visible`);
  // multi-touch: keep right held, tap jump with second finger
  const J = await c('jump'); await touch('touchMove', [R, { ...J, id: 1 }]);
  let maxUp = 0; for (let i = 0; i < 6; i++) { await p.waitForTimeout(50); const s = await st(); maxUp = Math.max(maxUp, b.y - s.y); }
  await touch('touchEnd', [{ ...J, id: 1 }]); await p.waitForTimeout(400); const c2 = await st();
  ok(maxUp > 3, `${name}: jump while holding right (rose ${maxUp.toFixed(1)}px)`); ok(c2.x > b.x + 5, `${name}: still moving right during/after jump`);
  // slide finger right -> left
  const L = await c('left'); await touch('touchMove', [{ x: (R.x + L.x) / 2, y: R.y }]); await touch('touchMove', [L]);
  await p.waitForTimeout(150); const d0 = await st();  await p.waitForTimeout(500); const d1 = await st();
  ok(d1.x < d0.x - 10, `${name}: slide right->left reverses hero ${d0.x.toFixed(1)} -> ${d1.x.toFixed(1)}`);
  await touch('touchEnd', []); await p.waitForTimeout(100); const e0 = await st(); await p.waitForTimeout(300); const e1 = await st();
  ok(Math.abs(e1.x - e0.x) < 0.5, `${name}: release stops hero`);
  // walk to ladder x=110 and climb with up
  for (let i = 0; i < 60; i++) { const s = await st(); if (Math.abs(s.x - 110) < 2.5) break; const q = await c(s.x < 110 ? 'right' : 'left');
    await touch('touchStart', [q]); await p.waitForTimeout(Math.max(17, Math.min(120, Math.abs(s.x - 110) / 54 * 1000))); await touch('touchEnd', []); }
  const f0 = await st(); const U = await c('up'); await touch('touchStart', [U]); await p.waitForTimeout(700); const f1 = await st(); await touch('touchEnd', []);
  await p.screenshot({ path: `proof/rescue-touch-${tag}.png` });
  ok(f1.ps === 'climb' && f1.y < f0.y - 10, `${name}: up climbs ladder (${f1.ps}, y ${f0.y.toFixed(0)} -> ${f1.y.toFixed(0)})`);
  // long press on jump: no selection / context menu
  await touch('touchStart', [J]); await p.waitForTimeout(1200); await touch('touchEnd', []);
  const sel = await p.evaluate(() => String(getSelection())); ok(sel === '', `${name}: no text selection ("${sel}")`);
  const scroll = await p.evaluate(() => [scrollX, scrollY, visualViewport.scale]); ok(scroll.join() === '0,0,1', `${name}: no scroll/zoom ${scroll}`);
  ok(errs.length === 0, `${name}: no page errors ${errs}`);
  await ctx.close();
}
await browser.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
