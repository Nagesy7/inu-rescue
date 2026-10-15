// Playtest-fix proof: a real-keyboard bot clears stage 1 in a desktop browser; desktop has no touch pad and stray clicks
// never pause; focus loss shows a PAUSED overlay; favicon loads; 8-char leaderboard name; touch pad still on a phone.
import { chromium, devices } from 'playwright'; import { spawn } from 'node:child_process'; import fs from 'node:fs';
let URL = process.env.URL, server = null;
if (!URL) { server = spawn('python3', ['-m', 'http.server', '8139'], { cwd: new globalThis.URL('..', import.meta.url).pathname, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 800)); URL = 'http://localhost:8139/'; }
fs.mkdirSync('proof', { recursive: true });
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 760 } }); const errs = []; p.on('pageerror', e => errs.push(String(e)));
let fav = 0; p.on('response', r => { if (/favicon\.(png|ico)/.test(r.url())) fav = r.status(); });
const W = ms => p.waitForTimeout(ms);
await p.goto(URL); await W(800);
fav = await p.evaluate(async () => { const l = document.querySelector('link[rel=icon]'); const r = await fetch(l.href); return l && r.ok && (r.headers.get('content-type') || '').includes('image') ? 200 : r.status; });
ok(fav === 200 && (await p.evaluate(() => fetch('favicon.ico').then(r => r.status))) === 200, 'favicon linked + served (png and /favicon.ico)');
ok(!(await p.locator('#pad').isVisible()), 'desktop: touch pad hidden');
await p.keyboard.press('Enter'); await W(200);
const st = () => p.evaluate(() => { const a = window.__inu, g = a.g; return { scene: a.scene, paused: a.paused, mode: g.mode, stage: g.stage, lives: g.lives, cp: g.cp, x: g.player.x, y: g.player.y }; });
// stray desktop clicks all over the bottom of the page during play must not pause or end the run
for (let i = 0; i < 300 && (await st()).mode !== 'play'; i++) await W(20);
const vp = p.viewportSize(); for (const fx of [0.3, 0.5, 0.7]) for (const fy of [0.75, 0.9, 0.98]) await p.mouse.click(vp.width * fx, vp.height * fy);
let s = await st(); ok(s.scene === 'game' && !s.paused && s.mode === 'play', 'desktop: 9 clicks over the lower play area did not pause/end the run');
// bot drives the real keyboard
const KEY = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp' }; const down = {};
let shotCp = false, deaths = 0, lastMode = '';
const t0 = Date.now();
while (Date.now() - t0 < 120000) {
  const r = await p.evaluate(async () => { const { botInput } = await import('./src/bot.js'); const g = window.__inu.g; return { inp: botInput(g), mode: g.mode, stage: g.stage, cp: g.cp, lives: g.lives }; });
  if (r.mode === 'dying' && lastMode !== 'dying') deaths++; lastMode = r.mode;
  if (r.stage >= 1 || r.mode === 'clear') break;
  for (const k of ['left', 'right', 'up']) { const want = !!r.inp[k]; if (want !== !!down[k]) { down[k] = want; want ? await p.keyboard.down(KEY[k]) : await p.keyboard.up(KEY[k]); } }
  if (r.inp.jump) await p.keyboard.press('Space');
  if (r.cp && !shotCp) { shotCp = true; await p.locator('#screen').screenshot({ path: 'proof/fix-01-checkpoint.png' }); }
}
for (const k in down) if (down[k]) await p.keyboard.up(KEY[k]);
await W(300); await p.locator('#screen').screenshot({ path: 'proof/fix-02-stage1-cleared.png' });
s = await st(); ok(s.stage >= 1 || s.mode === 'clear', `bot cleared stage 1 with the real keyboard (deaths ${deaths}, lives left ${s.lives}, ${Math.round((Date.now() - t0) / 1000)}s)`);
ok(shotCp, 'mid-tower checkpoint reached');
// focus loss -> PAUSED overlay; any key resumes
for (let i = 0; i < 200 && (await st()).mode !== 'play'; i++) await W(20);
await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await W(200);
s = await st(); ok(s.paused === 'blur', 'window blur shows PAUSED'); await p.locator('#screen').screenshot({ path: 'proof/fix-03-blur-paused.png' });
await p.keyboard.press('KeyQ'); await W(150); s = await st(); ok(!s.paused, 'any key resumes');
await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await W(100); await p.locator('#screen').click(); await W(150); s = await st(); ok(!s.paused, 'click on the game resumes');
// 8-char leaderboard name
await p.evaluate(() => { const g = window.__inu.g; g.lives = 1; g.hazards = []; const { killPlayer } = window.__inuE || {}; });
await p.evaluate(async () => { const E = await import('./src/engine.js'); E.killPlayer(window.__inu.g, 'yarn'); });
for (let i = 0; i < 200 && (await st()).scene === 'game'; i++) await W(20);
ok((await st()).scene === 'entry', 'game over -> name entry');
for (const ch of 'PLAYTEST') await p.keyboard.press('Key' + ch); await W(100);
await p.locator('#screen').screenshot({ path: 'proof/fix-04-name-entry.png' }); await p.keyboard.press('Enter'); await W(300);
const lb = await p.evaluate(() => JSON.parse(localStorage.getItem('inu-rescue.leaderboard.v2'))); ok(lb.some(e => e.name === 'PLAYTEST'), 'leaderboard stores PLAYTEST (8 chars)');
await W(1200); await p.locator('#screen').screenshot({ path: 'proof/fix-05-leaderboard.png' });
await p.screenshot({ path: 'proof/fix-06-desktop-nopad.png' });
ok(!errs.length, 'no page errors ' + errs.join('; '));
// phone: pad still there
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const q = await ctx.newPage(); await q.goto(URL); await q.waitForTimeout(800);
ok(await q.locator('#pad').isVisible(), 'iPhone: touch pad visible'); await q.screenshot({ path: 'proof/fix-07-iphone-pad.png' });
await b.close(); server?.kill(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
