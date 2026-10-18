// Layout proof: phone landscape 667x375, 750x342, 844x390, 740x360 (touch), title + in-game, joystick off + on.
// Nothing may overlap the playfield or another control. Saves screenshots as <OUT>/<TAG>-<WxH>-<joy|dpad>.png
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:8191/', OUT = process.env.OUT || '/workspace/inu-rescue-audit/tidy', TAG = process.env.TAG || 'after';
const SIZES = [[667, 375], [750, 342], [844, 390], [740, 360]];
const b = await chromium.launch(); let fail = 0; const ok = (c, m) => { if (!c) console.log('FAIL ' + m); else if (process.env.V) console.log('PASS ' + m); if (!c) fail++; };
const SEL = { canvas: 'canvas', kbar: '#kbar', legal: '#inu-legal', wallet: '#inu-wallet-main', home: '#inu-home', start: '[data-k=start]', pause: '[data-k=pause]', jump: '[data-k=jump]', dpad: '.dpad', stick: '#stick' };
const ov = (a, c) => a.x < c.x + c.w - 0.5 && c.x < a.x + a.w - 0.5 && a.y < c.y + c.h - 0.5 && c.y < a.y + a.h - 0.5;
let checks = 0;
for (const [w, h] of SIZES) for (const joy of [false, true]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); await p.addInitScript(j => { if (j) localStorage.setItem('inu-rescue.settings', '{"joystick":true}'); }, joy);
  await p.goto(URL + '?stage=1'); await p.waitForTimeout(3500); // let the shared wallet pill + home button mount
  for (const scene of ['title', 'game']) {
    if (scene === 'game') { await p.tap('[data-k=jump]'); await p.waitForTimeout(1500); }
    const R = await p.evaluate(S => Object.fromEntries(Object.entries(S).map(([k, s]) => { const e = document.querySelector(s); if (!e) return [k, null];
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return [k, r.width && cs.display !== 'none' && cs.visibility !== 'hidden' ? { x: r.x, y: r.y, w: r.width, h: r.height } : null]; })), SEL);
    const name = `${w}x${h} ${joy ? 'joy' : 'dpad'} ${scene}`, keys = Object.keys(R).filter(k => R[k] && k !== 'canvas');
    for (const k of keys) { const r = R[k]; checks++;
      ok(r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5, `${name}: ${k} on screen`);
      ok(!ov(r, R.canvas), `${name}: ${k} overlaps playfield ${JSON.stringify(r)} vs canvas x${R.canvas.x | 0}..${(R.canvas.x + R.canvas.w) | 0}`); }
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const A = keys[i], B = keys[j]; if (A === 'wallet' && B === 'home' || A === 'home' && B === 'wallet') continue; checks++;
      ok(!ov(R[A], R[B]), `${name}: ${A} overlaps ${B}`); }
    ok(!!R.start && !!R.pause && !!R.jump && (joy ? !!R.stick && !R.dpad : !!R.dpad && !R.stick), `${name}: expected controls visible`);
    if (scene === 'game') await p.screenshot({ path: `${OUT}/${TAG}-${w}x${h}-${joy ? 'joy' : 'dpad'}.png` });
  }
  await ctx.close();
}
await b.close(); console.log(fail ? `${fail} FAILED (${checks} checks)` : `ALL PASS (${checks} checks)`); process.exit(fail ? 1 : 0);
