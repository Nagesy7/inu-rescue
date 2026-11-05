// Live verification (Oct 19): load/start/play/game over, scores+settings persist across reload, NO-WALLET path,
// fake Phantom provider (counts connect/signMessage/signAndSend; never signs, never real keys), shop reaches the Phantom prompt.
// Nov 5: #k-wallet bar button no longer exists -> Connect Wallet is #inu-wallet-btn; Vercel analytics 404s ignored on a local server.
// Env: URL (default live), OUT, ONLY=desktop|touch, V=1 verbose.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'fs';
const URL = process.env.URL || 'https://inu-rescue.vercel.app/', OUT = process.env.OUT || '/workspace/inu-rescue-audit/verify-oct19'; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch(), fails = [], res = {};
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails.push(m); return c; };
const W = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWS = { desktop: { viewport: { width: 1280, height: 800 } }, touch: { ...devices['iPhone 13 landscape'], viewport: { width: 844, height: 390 } } };
// fake injected Phantom: connect resolves with a dummy public key; signMessage / signAndSendTransaction are COUNTED and left pending
// (= the Phantom approval prompt is open and the user has not approved). No keys anywhere.
const FAKE = () => { const calls = { connect: 0, sign: 0, tx: 0, msgs: [] }; window.__ph = calls;
  const pk = { toString: () => 'FakeWa11et1111111111111111111111111111111111', toBase58: () => 'FakeWa11et1111111111111111111111111111111111' };
  const prov = { isPhantom: true, isConnected: false, publicKey: null, on() {}, off() {}, removeListener() {},
    async connect(o) { calls.connect++; if (o?.onlyIfTrusted && !prov.isConnected) throw new Error('not trusted'); prov.isConnected = true; prov.publicKey = pk; return { publicKey: pk }; },
    async disconnect() { prov.isConnected = false; },
    signMessage(m) { calls.sign++; try { calls.msgs.push(new TextDecoder().decode(m).slice(0, 80)); } catch {} return new Promise(() => {}); },
    signAndSendTransaction() { calls.tx++; return new Promise(() => {}); }, signTransaction() { calls.tx++; return new Promise(() => {}); } };
  window.phantom = { solana: prov }; window.solana = prov; };
async function open(tag, { fake = false, block = false } = {}) {
  const ctx = await b.newContext(VIEWS[tag]); if (fake) await ctx.addInitScript(FAKE);
  if (block) await ctx.route(/kibble-pay\.vercel\.app/, (r) => r.abort());
  const p = await ctx.newPage(), errs = [], nav = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !(block && /kibble-pay|ERR_FAILED|Failed to fetch|net::/i.test(m.text())) && !(/^http:\/\/localhost/.test(URL) && /status of 404/.test(m.text()))) errs.push('console: ' + m.text().slice(0, 200)); });
  p.on('framenavigated', (f) => { if (f === p.mainFrame()) nav.push(f.url()); });
  await ctx.route(/^https:\/\/phantom\.(app|com)\/ul\//, (r) => { nav.push('DEEPLINK ' + r.request().url()); r.abort(); });
  return { ctx, p, errs, nav };
}
const st = (p) => p.evaluate(() => { const a = window.__inu, g = a.g; return { scene: a.scene, paused: a.paused, mode: g?.mode, stage: g?.stage, lives: g?.lives, score: g?.score, x: g?.player?.x, y: g?.player?.y }; });
const center = async (p, sel) => { const bb = await p.locator(sel).first().boundingBox(); return bb && { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }; };
async function touch(p, cdp, type, pts) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: q.id ?? i })) }); }
async function tapK(p, cdp, k) { const c = await center(p, `#pad [data-k="${k}"]`); await touch(p, cdp, 'touchStart', [c]); await W(60); await touch(p, cdp, 'touchEnd', []); await W(60); }

// ---- 1. NO WALLET: play, game over, scores/settings persist (no window.phantom at all) ----
async function noWallet(tag) {
  const { ctx, p, errs, nav } = await open(tag); const cdp = tag === 'touch' ? await ctx.newCDPSession(p) : null;
  await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => ['live', 'offline', 'soon', 'demo'].includes(document.documentElement.dataset.kibble), null, { timeout: 20000 }).catch(() => {});
  await W(1200); ok(await p.evaluate(() => !window.phantom && !window.solana), `${tag} no-wallet: no window.phantom / window.solana`);
  ok((await st(p)).scene === 'title', `${tag} no-wallet: loads to title`);
  await p.screenshot({ path: `${OUT}/no-wallet-${tag}-title.png` });
  // settings saved locally with no wallet (mute + volume [+ joystick on touch])
  await p.click('#k-set'); await p.fill('#set-vol', '60'); await p.check('#set-mute'); if (tag === 'touch') await p.check('#set-joy'); await p.click('#set-close'); await W(200);
  // start with the real input
  if (cdp) { await tapK(p, cdp, 'start'); } else await p.keyboard.press('Enter');
  for (let i = 0; i < 100 && (await st(p)).mode !== 'play'; i++) await W(50);
  let s = await st(p); ok(s.scene === 'game' && s.mode === 'play', `${tag} no-wallet: START begins a run (${s.scene}/${s.mode})`);
  // play: bot drives the real keyboard (desktop) or real touch (joystick on touch -> use jump + stick)
  const x0 = s.x; const t0 = Date.now(); let deaths = 0, lastMode = '', down = {}, maxScore = 0;
  const KEY = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp' };
  const stick = cdp && await center(p, '#stick');
  while (Date.now() - t0 < 25000) {
    const r = await p.evaluate(async () => { const { botInput } = await import('./src/bot.js'); const g = window.__inu.g; return { inp: botInput(g), mode: g.mode, score: g.score, scene: window.__inu.scene }; });
    if (r.scene !== 'game') break; maxScore = Math.max(maxScore, r.score | 0);
    if (r.mode === 'dying' && lastMode !== 'dying') deaths++; lastMode = r.mode;
    if (!cdp) { for (const k of ['left', 'right', 'up']) { const want = !!r.inp[k]; if (want !== !!down[k]) { down[k] = want; want ? await p.keyboard.down(KEY[k]) : await p.keyboard.up(KEY[k]); } } if (r.inp.jump) await p.keyboard.press('Space'); }
    else { const dx = (r.inp.right ? 45 : 0) - (r.inp.left ? 45 : 0), dy = r.inp.up ? -45 : 0; const pts = (dx || dy) ? [{ x: stick.x + dx, y: stick.y + dy, id: 1 }] : [];
      if (r.inp.jump) { const j = await center(p, '#pad [data-k="jump"]'); await touch(p, cdp, pts.length ? 'touchMove' : 'touchStart', [...pts, { ...j, id: 2 }]); await W(50); }
      if (down.pts !== JSON.stringify(pts) || r.inp.jump) { await touch(p, cdp, pts.length ? (down.pts && down.pts !== '[]' ? 'touchMove' : 'touchStart') : 'touchEnd', pts); down.pts = JSON.stringify(pts); } }
    await W(30);
  }
  if (!cdp) for (const k in down) if (down[k] && KEY[k]) await p.keyboard.up(KEY[k]); else if (cdp) await touch(p, cdp, 'touchEnd', []);
  s = await st(p); ok(s.scene !== 'game' || s.x !== x0 || deaths > 0, `${tag} no-wallet: hero moves under real input (x ${x0}->${s.x}, score ${maxScore}, deaths ${deaths})`);
  await p.screenshot({ path: `${OUT}/no-wallet-${tag}-playing.png` });
  // game over: stop input and let the hazards finish the remaining lives (natural death); hard cap 150 s
  const t1 = Date.now(); while ((await st(p)).scene === 'game' && Date.now() - t1 < 150000) await W(500);
  s = await st(p); let natural = s.scene !== 'game';
  if (!natural) { await p.evaluate(async () => { const E = await import('./src/engine.js'); const g = window.__inu.g; g.lives = 1; E.killPlayer(g, 'yarn'); }); for (let i = 0; i < 200 && (await st(p)).scene === 'game'; i++) await W(50); s = await st(p); }
  ok(s.scene === 'entry' || s.scene === 'over', `${tag} no-wallet: run ends in GAME OVER (${s.scene}, ${natural ? 'natural deaths' : 'forced last death'}, ${Math.round((Date.now() - t1) / 1000)}s idle)`);
  await W(400); await p.screenshot({ path: `${OUT}/no-wallet-${tag}-gameover.png` });
  if (s.scene === 'entry') { if (cdp) for (let i = 0; i < 4; i++) await tapK(p, cdp, 'start'); else { for (const ch of 'NOWAL') await p.keyboard.press('Key' + ch); await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); } await W(300); }
  s = await st(p); ok(s.scene === 'over', `${tag} no-wallet: name entry finishes to results (${s.scene})`);
  await W(1300); if (cdp) await tapK(p, cdp, 'start'); else await p.keyboard.press('Enter'); await W(400);
  ok((await st(p)).scene === 'title', `${tag} no-wallet: results -> title (no stuck state)`);
  const posted = await p.evaluate(() => window.__inu.posted); ok(!posted || !/NOT POSTED/i.test(posted), `${tag} no-wallet: no failed-post nag without a wallet (${posted})`);
  const before = await p.evaluate(() => ({ lb: localStorage.getItem('inu-rescue.leaderboard.v2'), set: localStorage.getItem('inu-rescue.settings') }));
  ok(before.lb && JSON.parse(before.lb).length >= 1, `${tag} no-wallet: score saved locally ${before.lb}`);
  await p.reload(); await W(2500);
  const after = await p.evaluate(() => ({ lb: localStorage.getItem('inu-rescue.leaderboard.v2'), set: JSON.parse(localStorage.getItem('inu-rescue.settings') || '{}'), joy: document.documentElement.classList.contains('joy'), mute: document.getElementById('set-mute').checked, vol: document.getElementById('set-vol').value }));
  ok(after.lb === before.lb, `${tag} no-wallet: scores persist across reload`);
  ok(after.mute && after.vol === '60' && (tag !== 'touch' || after.joy), `${tag} no-wallet: settings persist across reload (${JSON.stringify(after.set)})`);
  await W(3500); await p.screenshot({ path: `${OUT}/no-wallet-${tag}-scores-after-reload.png` }); // title cycles to the leaderboard
  // wallet features without a wallet: clear prompt, no crash/stuck
  const navBefore = nav.length;
  await p.click('#k-shop'); await p.waitForSelector('#inu-shop [data-buy]', { timeout: 15000 }).catch(() => {});
  const head = await p.textContent('#inu-shop [data-head]').catch(() => null); ok(/Sign in with Phantom/i.test(head || ''), `${tag} no-wallet: shop opens with a sign-in prompt (${head})`);
  await p.screenshot({ path: `${OUT}/no-wallet-${tag}-shop.png` });
  await p.click('#inu-shop [data-buy="collar-red"]', { noWaitAfter: true }); await W(1500);
  const deep = nav.slice(navBefore).find((u) => u.startsWith('DEEPLINK'));
  const head2 = deep ? '' : await p.textContent('#inu-shop [data-head]').catch(() => '');
  ok(deep || /Phantom not found/i.test(head2), `${tag} no-wallet: Buy -> ${deep ? 'opens the Phantom app (universal link)' : 'clear prompt: ' + head2.trim().slice(0, 90)}`);
  if (!deep) { await p.screenshot({ path: `${OUT}/no-wallet-${tag}-buy-prompt.png` }); await p.click('#inu-shop [data-x]');
    await p.click('#inu-wallet-btn'); await W(1200); const wtxt = await p.textContent('#inu-wallet'); ok(/Phantom not found|Install/i.test(wtxt) || /Phantom not found/.test(await p.textContent('#k-msg')), `${tag} no-wallet: Connect Wallet -> clear prompt (${wtxt.slice(0, 120)})`);
    await p.screenshot({ path: `${OUT}/no-wallet-${tag}-connect-prompt.png` });
    s = await st(p); ok(s.scene === 'title', `${tag} no-wallet: still usable after wallet prompts`); await p.keyboard.press('Enter'); await W(400); ok((await st(p)).scene === 'game', `${tag} no-wallet: can start a new run after the prompts`); }
  ok(!errs.length, `${tag} no-wallet: no console errors ${errs.join(' | ')}`);
  await ctx.close();
}
// ---- 2. kibble-pay unreachable: game must still fully work; wallet features say so ----
async function offline(tag) {
  const { ctx, p, errs } = await open(tag, { block: true }); await p.goto(URL); await W(3000);
  ok((await st(p)).scene === 'title', `${tag} offline: loads with kibble-pay blocked (mode ${await p.evaluate(() => document.documentElement.dataset.kibble)})`);
  await p.click('#k-shop'); await W(800); const msg = (await p.textContent('#k-msg')) + ' ' + ((await p.textContent('#inu-shop').catch(() => '')) || '');
  ok(/offline|unreachable|try again/i.test(msg), `${tag} offline: Shop shows a clear message (${msg.trim().slice(0, 100)})`);
  await p.click('#inu-shop [data-x]').catch(() => {}); await p.click('#inu-wallet-btn'); await W(800); const m2 = (await p.textContent('#k-msg')) + ' ' + (await p.textContent('#inu-wallet').catch(() => '')); ok(/offline|unreachable|try again/i.test(m2), `${tag} offline: Sign in shows a clear message (${m2})`);
  await p.screenshot({ path: `${OUT}/no-wallet-${tag}-kibble-offline.png` });
  await p.keyboard.press('Enter'); await W(800); ok((await st(p)).scene === 'game', `${tag} offline: game still starts`);
  ok(!errs.length, `${tag} offline: no page errors ${errs.join(' | ')}`); await ctx.close();
}
// ---- 3. fake Phantom: Connect Wallet = exactly ONE sign request; shop reaches the Phantom prompt ----
async function wallet(tag) {
  let { ctx, p, errs } = await open(tag, { fake: true }); await p.goto(URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForSelector('#inu-wallet-btn', { timeout: 20000 }); await W(800);
  const c0 = await p.evaluate(() => ({ ...window.__ph })); ok(c0.sign === 0 && c0.tx === 0, `${tag} wallet: no sign request on page load (connect ${c0.connect})`);
  await p.click('#inu-wallet-btn'); await W(600); await p.click('#inu-wallet-btn').catch(() => {}); await W(3500); // impatient double tap while the prompt is open (the old #k-wallet bar button was removed in 6bbf7cc)
  const c1 = await p.evaluate(() => ({ ...window.__ph })); res[tag + '-connect'] = c1;
  ok(c1.sign === 1 && c1.tx === 0, `${tag} wallet: Connect Wallet -> exactly ONE signMessage (got ${c1.sign}; connect ${c1.connect}; msg "${c1.msgs[0] || ''}")`);
  await p.screenshot({ path: `${OUT}/phantom-prompt-${tag}-connect.png` });
  ok(!errs.length, `${tag} wallet: no console errors ${errs.join(' | ')}`); await ctx.close();
  ({ ctx, p, errs } = await open(tag, { fake: true })); await p.goto(URL); await W(3500);
  await p.click('#k-shop'); await p.waitForSelector('#inu-shop [data-buy]', { timeout: 15000 });
  await p.click('#inu-shop [data-buy="collar-red"]'); await W(3500);
  const c2 = await p.evaluate(() => ({ ...window.__ph })); res[tag + '-shop'] = c2; const head = await p.textContent('#inu-shop [data-head]').catch(() => '');
  ok(c2.sign + c2.tx >= 1, `${tag} wallet: shop Buy reaches the Phantom prompt (signMessage ${c2.sign}, tx ${c2.tx}; not approved) — "${head.trim().slice(0, 80)}"`);
  ok(c2.sign <= 1, `${tag} wallet: shop Buy asks for at most one sign-in`);
  await p.screenshot({ path: `${OUT}/phantom-prompt-${tag}-shop.png` });
  ok(!errs.length, `${tag} wallet: no console errors ${errs.join(' | ')}`); await ctx.close();
}
for (const tag of (process.env.ONLY ? [process.env.ONLY] : ['desktop', 'touch'])) {
  for (const f of [noWallet, offline, wallet]) { try { await f(tag); } catch (e) { ok(false, `${tag} ${f.name}: threw ${e.message.split('\n')[0]}`); } }
}
console.log(JSON.stringify(res)); await b.close(); console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
