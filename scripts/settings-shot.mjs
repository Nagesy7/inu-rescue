// Settings panel proof: desktop shows sound only (mute + volume, no joystick row); touch shows sound + joystick. Persists across reloads.
// Env: URL (default http://localhost:8137/), OUT (default /workspace/inu-rescue-audit/tidy).
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'fs';
const URL = process.env.URL || 'http://localhost:8137/', OUT = process.env.OUT || '/workspace/inu-rescue-audit/tidy'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch(), fails = [], errs = []; const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails.push(m); };
const audio = (p) => p.evaluate(async () => { const a = await import(new URL('src/audio.js', location.href).href); return { muted: a.isMuted(), vol: a.getVolume() }; });
const stored = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('inu-rescue.settings') || '{}'));
for (const [tag, opts] of [['desktop', { viewport: { width: 1280, height: 800 } }], ['touch-844x390', { ...devices['iPhone 13 landscape'] }]]) {
  const ctx = await b.newContext(opts), p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(tag + ': ' + e.message));
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1500);
  ok(await p.isVisible('#k-set'), `${tag}: ⚙ visible`); await p.click('#k-set'); await p.waitForSelector('#settings:not([hidden])');
  ok(await p.isVisible('#set-mute') && await p.isVisible('#set-vol'), `${tag}: mute + volume shown`);
  const joy = await p.isVisible('#set-joy'); ok(tag === 'desktop' ? !joy : joy, `${tag}: joystick toggle ${tag === 'desktop' ? 'hidden (no touch pad)' : 'shown'}`);
  ok(!(await p.isChecked('#set-mute')) && await p.inputValue('#set-vol') === '100', `${tag}: defaults sound on, 100%`);
  await p.fill('#set-vol', '40'); await p.waitForTimeout(100);
  let a = await audio(p), s = await stored(p); ok(Math.abs(a.vol - 0.4) < 1e-9 && s.volume === 40 && (await p.textContent('#set-vol-v')) === '40%', `${tag}: volume 40 -> master gain ${a.vol}, saved ${s.volume}`);
  await p.check('#set-mute'); a = await audio(p); s = await stored(p); ok(a.muted && s.muted === true && s.volume === 40, `${tag}: mute saved, volume kept`);
  await p.screenshot({ path: `${OUT}/settings-${tag}.png` });
  await p.click('#set-close'); await p.reload(); await p.waitForTimeout(1200);
  a = await audio(p); ok(a.muted && Math.abs(a.vol - 0.4) < 1e-9, `${tag}: muted + 40% survive reload`);
  if (tag === 'desktop') { await p.keyboard.press('KeyM'); await p.waitForTimeout(100); a = await audio(p); s = await stored(p); ok(!a.muted && s.muted === false, `${tag}: M unmutes and persists`);
    await p.click('#k-set'); ok(!(await p.isChecked('#set-mute')) && await p.inputValue('#set-vol') === '40', `${tag}: panel reflects M key`); await p.click('#set-close'); }
  await ctx.close();
}
console.log('errors', JSON.stringify(errs)); await b.close(); if (fails.length || errs.length) process.exit(1); console.log('ALL PASS');
