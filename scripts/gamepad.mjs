// Fake-gamepad proof: injects navigator.getGamepads + gamepadconnected, then drives start / move / jump / pause / menus / unplug.
// Usage: URL=http://localhost:8191/ node scripts/gamepad.mjs [outdir]. Screens: PS toast, Xbox toast, title + pause + settings focus, gameplay.
import { chromium } from 'playwright'; import { mkdirSync } from 'node:fs';
const URL = process.env.URL || 'http://localhost:8191/', OUT = process.argv[2] || '/workspace/inu-rescue-audit/gamepad', local = /localhost/.test(URL);
mkdirSync(OUT, { recursive: true }); const b = await chromium.launch(), errs = [], fails = []; let n = 0;
const ok = (v, m) => { n++; if (!v) { fails.push(m); console.log('FAIL', m); } else console.log('PASS', m); };
const INIT = () => {
  const pads = []; window.__fakePads = pads;
  const mk = (index, id, mapping = 'standard') => ({ index, id, mapping, connected: true, timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
  navigator.getGamepads = () => pads.slice();
  window.__pad = {
    plug(index, id, mapping) { const gp = mk(index, id, mapping); pads[index] = gp; const e = new Event('gamepadconnected'); e.gamepad = gp; dispatchEvent(e); return true; },
    unplug(index) { const gp = pads[index]; pads[index] = null; const e = new Event('gamepaddisconnected'); e.gamepad = gp; dispatchEvent(e); return true; },
    btn(index, i, v) { pads[index].buttons[i] = { pressed: v, touched: v, value: v ? 1 : 0 }; },
    axes(index, x, y) { pads[index].axes[0] = x; pads[index].axes[1] = y; },
  };
};
const PS = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', XB = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
async function open(opts, tag) { const ctx = await b.newContext(opts), p = await ctx.newPage(); await p.addInitScript(INIT);
  p.on('pageerror', e => errs.push(`${tag}: ${e}`)); p.on('console', m => { if (m.type() === 'error' && !(local && /404/.test(m.text()))) errs.push(`${tag}: ${m.text()}`); });
  await p.goto(URL); await p.waitForTimeout(2500); return { ctx, p }; }
const tap = async (p, i, ms = 120) => { await p.evaluate(i => __pad.btn(0, i, true), i); await p.waitForTimeout(ms); await p.evaluate(i => __pad.btn(0, i, false), i); await p.waitForTimeout(ms); };
const S = p => p.evaluate(() => ({ scene: __inu.scene, paused: __inu.paused, menu: __inu.padMenuI, mode: __inu.g?.mode, x: __inu.g?.player.x, y: __inu.g?.player.y, st: __inu.g?.player.state, jid: __inu.g?.player.jumpId, toast: __inu.padToast && { type: __inu.padToast.type, brand: __inu.padToast.brand }, set: !document.getElementById('settings').hidden, focus: document.querySelector('#settings .padfocus')?.textContent?.trim() || document.querySelector('#settings .padfocus input, #settings button.padfocus')?.id }));
const toastClear = p => p.evaluate(() => { const t = document.getElementById('pad-toast'); if (!t || t.hidden) return 'hidden';
  const r = t.getBoundingClientRect(), hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const obs = [document.getElementById('screen'), ...document.querySelectorAll('#pad [data-k], #stick, #kbar')].filter(e => e.getBoundingClientRect().width && getComputedStyle(e).display !== 'none');
  const bad = obs.filter(e => hit(r, e.getBoundingClientRect())).map(e => e.id || e.dataset.k);
  t.style.pointerEvents = 'auto'; const pts = [[r.left + 12, r.top + 6], [r.right - 12, r.top + 6], [r.left + 12, r.bottom - 6], [r.right - 12, r.bottom - 6], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]];
  for (const [x, y] of pts) { const top = document.elementFromPoint(x, y); if (top !== t && !t.contains(top)) bad.push('covered-by ' + (top?.id || top?.tagName)); } t.style.pointerEvents = '';
  return bad.length ? bad.join(',') : `clear ${r.left | 0},${r.top | 0} ${r.width | 0}x${r.height | 0}`; });
for (const [tag, opts] of [['844x390', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }], ['1280x800', { viewport: { width: 1280, height: 800 } }]]) {
  const { ctx, p } = await open(opts, tag);
  // PS connect toast + title menu with glyphs
  await p.evaluate(id => __pad.plug(0, id), PS); await p.waitForTimeout(500); let s = await S(p);
  ok(s.toast?.type === 'connected' && s.toast.brand === 'ps', `${tag}: PS toast (${JSON.stringify(s.toast)})`);
  { const tc = await toastClear(p); ok(/^clear/.test(tc), `${tag}: PS toast pill clear of canvas/HUD/controls (${tc})`); }
  await p.screenshot({ path: `${OUT}/toast-ps-${tag}.png` });
  // title focus: D-pad right moves to SETTINGS, Cross opens the panel, D-pad walks it, Circle closes
  await p.waitForTimeout(2900); ok(await p.evaluate(() => document.getElementById('pad-toast').hidden), `${tag}: toast gone after ~2.8s`); await tap(p, 15); s = await S(p); ok(s.menu === 1, `${tag}: title focus -> SETTINGS`);
  await p.screenshot({ path: `${OUT}/menu-title-focus-${tag}.png` });
  await tap(p, 0); s = await S(p); ok(s.set, `${tag}: Cross on SETTINGS opens panel`);
  const muted0 = await p.evaluate(() => __inu.settings().muted);
  ok(/Mute/.test(s.focus || ''), `${tag}: panel focus starts on Mute (${s.focus})`);
  await tap(p, 13); s = await S(p); ok(/Volume/.test(s.focus || ''), `${tag}: D-pad down -> Volume (${s.focus})`);
  const v0 = await p.evaluate(() => __inu.settings().volume); await tap(p, 14); ok(await p.evaluate(() => __inu.settings().volume) === v0 - 5, `${tag}: D-pad left lowers volume 5`);
  await tap(p, 15); ok(await p.evaluate(() => __inu.settings().volume) === v0, `${tag}: D-pad right restores volume`);
  await tap(p, 13); await tap(p, 13); s = await S(p); await p.screenshot({ path: `${OUT}/menu-settings-focus-${tag}.png` });
  await tap(p, 12); await tap(p, 12); await tap(p, 12); ok(/Mute/.test((await S(p)).focus || ''), `${tag}: D-pad up back to Mute`); await tap(p, 0); ok(await p.evaluate(() => __inu.settings().muted) === !muted0, `${tag}: Cross toggles focused checkbox (mute)`);
  await tap(p, 0); ok(await p.evaluate(() => __inu.settings().muted) === muted0, `${tag}: and back`);
  await tap(p, 1); s = await S(p); ok(!s.set && s.scene === 'title', `${tag}: Circle closes settings`);
  // start with OPTIONS-free path: focus START, Cross
  await tap(p, 14); s = await S(p); ok(s.menu === 0, `${tag}: focus back to START`);
  await tap(p, 0); s = await S(p); ok(s.scene === 'game', `${tag}: Cross starts the run`);
  await p.waitForFunction(() => __inu.g.mode === 'play', null, { timeout: 8000 }).catch(() => {});
  s = await S(p); const x0 = s.x;
  await p.evaluate(() => __pad.axes(0, 0.95, 0.05)); await p.waitForTimeout(500); await p.evaluate(() => __pad.axes(0, 0, 0)); s = await S(p);
  ok(s.x > x0 + 5, `${tag}: left stick moves right (${x0} -> ${s.x})`);
  await p.evaluate(() => __pad.axes(0, 0.15, -0.1)); await p.waitForTimeout(300); const s2 = await S(p); ok(Math.abs(s2.x - s.x) < 0.5, `${tag}: stick drift in dead zone = no move`); await p.evaluate(() => __pad.axes(0, 0, 0));
  await p.evaluate(() => __pad.btn(0, 15, true)); await p.waitForTimeout(300); await p.evaluate(() => __pad.btn(0, 15, false)); const s3 = await S(p); ok(s3.x > s2.x + 3, `${tag}: D-pad right moves`);
  const j0 = s3.jid; await p.evaluate(() => __pad.btn(0, 0, true)); await p.waitForTimeout(60); const sj = await S(p); await p.evaluate(() => __pad.btn(0, 0, false));
  ok(sj.jid === j0 + 1 && sj.st === 'air', `${tag}: Cross jumps (jumpId ${j0} -> ${sj.jid}, ${sj.st})`);
  await p.waitForTimeout(250); await p.screenshot({ path: `${OUT}/gameplay-${tag}.png` }); await p.waitForTimeout(700);
  await tap(p, 9); s = await S(p); ok(s.paused === true, `${tag}: OPTIONS pauses`);
  await tap(p, 13); s = await S(p); ok(s.menu === 1, `${tag}: pause menu focus -> SETTINGS`); await p.screenshot({ path: `${OUT}/menu-pause-focus-${tag}.png` });
  await tap(p, 12); await tap(p, 9); s = await S(p); ok(s.paused === false, `${tag}: OPTIONS resumes`);
  // keyboard still works alongside the pad
  const xk = (await S(p)).x; await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(300); await p.keyboard.up('ArrowLeft'); ok((await S(p)).x < xk - 3 || (await S(p)).mode !== 'play', `${tag}: keyboard still moves`);
  // unplug mid-run -> auto-pause + disconnected toast; any button resumes after replug
  await p.evaluate(() => __pad.unplug(0)); await p.waitForTimeout(200); s = await S(p);
  ok(s.paused === 'pad' && s.toast?.type === 'disconnected', `${tag}: unplug auto-pauses (${s.paused}, ${JSON.stringify(s.toast)})`);
  { const tc = await toastClear(p); ok(/^clear/.test(tc), `${tag}: disconnect pill clear (${tc})`); }
  await p.screenshot({ path: `${OUT}/disconnect-pause-${tag}.png` });
  // Xbox plugs in: toast with A/B, any button resumes
  await p.evaluate(id => __pad.plug(0, id), XB); await p.waitForTimeout(400); s = await S(p);
  ok(s.toast?.brand === 'xbox' && s.toast.type === 'connected', `${tag}: Xbox toast`); { const tc = await toastClear(p); ok(/^clear/.test(tc), `${tag}: Xbox toast pill clear (${tc})`); } await p.screenshot({ path: `${OUT}/toast-xbox-${tag}.png` });
  await tap(p, 1); s = await S(p); ok(s.paused === false, `${tag}: any button resumes after replug`);
  // hidden tab: polling stops (no input applied)
  await ctx.close();
}
// non-standard pad (fallback mapping) starts + moves
{ const { ctx, p } = await open({ viewport: { width: 1280, height: 800 } }, 'generic');
  await p.evaluate(() => __pad.plug(0, 'USB Gamepad (Vendor: 0079 Product: 0011)', '')); await p.waitForTimeout(300);
  ok((await S(p)).toast?.brand === 'generic', 'generic: toast'); await tap(p, 0); ok((await S(p)).scene === 'game', 'generic: button 0 starts'); await ctx.close(); }
await b.close();
console.log(errs.length ? 'ERRORS ' + JSON.stringify(errs) : 'no console errors'); console.log(fails.length ? `${fails.length} FAIL of ${n}` : `ALL PASS (${n} checks)`);
process.exit(fails.length || errs.length ? 1 : 0);
