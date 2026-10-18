// Joystick proof (phone landscape 667x375 + 750x342, real CDP multi-touch): OFF by default (D-pad), toggle ON in Settings,
// stick + JUMP at once, stick up climbs a ladder, setting persists across reload, toggle OFF brings the D-pad back.
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:8191/', OUT = process.env.OUT || '/workspace/inu-rescue-audit/joystick';
const b = await chromium.launch(); let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const inter = (a, c) => a && c && a.x < c.x + c.width - 0.5 && c.x < a.x + a.width - 0.5 && a.y < c.y + c.height - 0.5 && c.y < a.y + a.height - 0.5;
for (const [w, h] of [[667, 375], [750, 342]]) {
  const tag = `${w}x${h}`, ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p), errs = []; p.on('pageerror', e => errs.push(String(e)));
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const tapAt = async (q) => { await touch('touchStart', [{ x: q.x, y: q.y, id: 9 }]); await p.waitForTimeout(60); await touch('touchEnd', []); await p.waitForTimeout(150); };
  const ctr = async s => { const r = await p.locator(s).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, r }; };
  const vis = s => p.locator(s).isVisible();
  const st = () => p.evaluate(() => { const g = window.__inu.g; return { mode: g?.mode, x: g?.player.x, y: g?.player.y, ps: g?.player.state }; });
  await p.goto(URL + '?stage=1'); await p.waitForTimeout(700);
  ok(!(await vis('#stick')) && await vis('.dpad'), `${tag}: default OFF -> classic D-pad shown, no stick`);
  ok(await p.evaluate(() => localStorage.getItem('inu-rescue.settings')) === null, `${tag}: nothing written until the player changes it`);
  await p.screenshot({ path: `${OUT}/${tag}-off-default.png` });
  // toggle ON via Settings
  await tapAt(await ctr('#k-set')); ok(await vis('#settings'), `${tag}: settings panel opens`);
  await p.screenshot({ path: `${OUT}/${tag}-toggle-panel.png` });
  await tapAt(await ctr('#set-joy')); await tapAt(await ctr('#set-close'));
  ok(await vis('#stick') && !(await vis('.dpad')), `${tag}: ON -> stick shown, D-pad hidden`);
  ok(JSON.parse(await p.evaluate(() => localStorage.getItem('inu-rescue.settings'))).joystick === true, `${tag}: saved to localStorage (cloud-synced key)`);
  const cv = await p.locator('canvas').boundingBox(), S = await ctr('#stick'), J = await ctr('[data-k=jump]');
  for (const [n, r] of [['stick', S.r], ['jump', J.r], ['start', (await ctr('[data-k=start]')).r], ['pause', (await ctr('[data-k=pause]')).r]])
    ok(!inter(r, cv) && r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= h, `${tag}: ${n} on screen, never over the playfield (${r.x | 0},${r.y | 0} ${r.width | 0}x${r.height | 0} vs canvas ${cv.x | 0}..${(cv.x + cv.width) | 0})`);
  ok(S.x < cv.x && J.x > cv.x + cv.width, `${tag}: stick on the left, action buttons on the right`);
  // start a run
  await tapAt(J); for (let i = 0; i < 40 && (await st()).mode !== 'play'; i++) await p.waitForTimeout(100);
  // multi-touch: hold stick right, then press JUMP with a second finger while still steering
  const a = await st(), R = { x: S.x + S.r.width * 0.42, y: S.y, id: 0 };
  await touch('touchStart', [{ x: S.x + 2, y: S.y + 1, id: 0 }]); await p.waitForTimeout(80); await touch('touchMove', [R]); await p.waitForTimeout(400);
  const b1 = await st(); ok(b1.x > a.x + 10, `${tag}: stick right walks ${a.x.toFixed(1)} -> ${b1.x.toFixed(1)}`);
  await touch('touchStart', [R, { x: J.x, y: J.y, id: 1 }]); let rose = 0, airX = [];
  for (let i = 0; i < 8; i++) { await p.waitForTimeout(40); const s = await st(); rose = Math.max(rose, b1.y - s.y); if (s.ps === 'air') airX.push(s.x); }
  await p.screenshot({ path: `${OUT}/${tag}-on-stick-plus-jump.png` });
  await touch('touchEnd', [R]); await p.waitForTimeout(500);
  ok(rose > 3 && airX.length >= 2 && airX[airX.length - 1] > airX[0] + 3, `${tag}: moving + jumping together (rose ${rose.toFixed(1)}px, air x ${airX[0]?.toFixed(1)} -> ${airX.at(-1)?.toFixed(1)})`);
  await touch('touchEnd', []); await p.waitForTimeout(200);
  // dead zone: a resting thumb near the centre does nothing
  const d0 = await st(); await touch('touchStart', [{ x: S.x + 6, y: S.y - 5, id: 0 }]); await p.waitForTimeout(400); const d1 = await st(); await touch('touchEnd', []);
  ok(Math.abs(d1.x - d0.x) < 0.5 && d1.ps === 'walk', `${tag}: dead zone ignores a resting thumb`);
  // ladder: steer to x=110 then push up
  for (let i = 0; i < 60; i++) { const s = await st(); if (Math.abs(s.x - 110) < 2.5) break; const dir = s.x < 110 ? 1 : -1;
    await touch('touchStart', [{ x: S.x + dir * S.r.width * 0.42, y: S.y, id: 0 }]); await p.waitForTimeout(Math.max(17, Math.min(120, Math.abs(s.x - 110) / 54 * 1000))); await touch('touchEnd', []); }
  const f0 = await st(); await touch('touchStart', [{ x: S.x, y: S.y - S.r.height * 0.42, id: 0 }]); await p.waitForTimeout(700); const f1 = await st();
  await p.screenshot({ path: `${OUT}/${tag}-on-climb.png` }); await touch('touchEnd', []);
  ok(f1.ps === 'climb' && f1.y < f0.y - 10, `${tag}: stick up climbs the ladder (${f1.ps}, y ${f0.y.toFixed(0)} -> ${f1.y.toFixed(0)})`);
  // persists across reload
  await p.reload(); await p.waitForTimeout(700); ok(await vis('#stick') && !(await vis('.dpad')), `${tag}: setting survives reload`);
  await p.screenshot({ path: `${OUT}/${tag}-on-title.png` });
  // toggle OFF -> old buttons back
  await tapAt(await ctr('#k-set')); await tapAt(await ctr('#set-joy')); await tapAt(await ctr('#set-close'));
  ok(!(await vis('#stick')) && await vis('.dpad'), `${tag}: toggled OFF -> D-pad back`);
  ok(JSON.parse(await p.evaluate(() => localStorage.getItem('inu-rescue.settings'))).joystick === false, `${tag}: OFF saved`);
  await tapAt(await ctr('[data-k=jump]')); for (let i = 0; i < 40 && (await st()).mode !== 'play'; i++) await p.waitForTimeout(100);
  const o0 = await st(), RB = await ctr('[data-k=right]'); await touch('touchStart', [{ x: RB.x, y: RB.y, id: 0 }]); await p.waitForTimeout(500); const o1 = await st(); await touch('touchEnd', []);
  ok(o1.x > o0.x + 10, `${tag}: D-pad right works again after OFF`);
  await p.screenshot({ path: `${OUT}/${tag}-off-again.png` });
  ok(!errs.length, `${tag}: no page errors ${errs}`); await ctx.close();
}
await b.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
