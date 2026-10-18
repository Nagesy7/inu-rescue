// $KIBBLE hooks for Inu Rescue. Real kibble-pay by default ($KIBBLE is live);
// fake balance + local inventory ONLY with ?demo=1. Cosmetics are visual only (no gameplay advantage).
// v2 = remixed stages; kibble-pay keeps v2 scores on their own board (inu-rescue@v2) and rejects untagged/old clients
export const SCORE_VERSION = 2;
export const GAME = 'inu-rescue', API = 'https://kibble-pay.vercel.app';
export const SOON_MSG = 'KIBBLE is live, but the wallet service is unreachable right now. Try again shortly.';
// Catalog source for kibble-pay `npm run catalog`. Prices are FEE-INCLUSIVE (player pays exactly this).
export const COSMETICS = {
  'collar-red':    { name: 'Red Rescue Collar',  price: 50000,  kind: 'collar', color: '#e0383e' },
  'collar-gold':   { name: 'Gold Hero Collar',   price: 150000, kind: 'collar', color: '#f0c840' },
  'collar-neon':   { name: 'Neon Night Collar',  price: 100000, kind: 'collar', color: '#40f0c0' },
  'gear-helmet':   { name: 'Fire Rescue Helmet', price: 200000, kind: 'gear',   color: '#e05a2a' },
  'gear-hivis':    { name: 'Hi-Vis Rescue Vest', price: 120000, kind: 'gear',   color: '#d8f040' },
  'gear-cape':     { name: 'Hero Cape',          price: 250000, kind: 'gear',   color: '#6a3ad8' },
  'van-classic':   { name: 'Classic Rescue Van skin', price: 300000, kind: 'van', color: '#e05a6a' },
  'van-gold':      { name: 'Gold Rescue Van skin',    price: 600000, kind: 'van', color: '#f0c840' },
  'van-midnight':  { name: 'Midnight Rescue Van skin', price: 400000, kind: 'van', color: '#2a3a8a' },
};
const LS = typeof localStorage !== 'undefined' ? localStorage : { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); } };
const load = (k, d) => { try { return JSON.parse(LS.getItem('ir.' + k)) ?? d; } catch { return d; } };
const save = (k, v) => LS.setItem('ir.' + k, JSON.stringify(v));
export const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1';
// pups saved first, in-game points break ties (capped so a pup always outranks points)
export const runScore = (prog) => (prog.saved | 0) * 10000 + Math.min(9999, prog.score | 0);
export const demoWallet = { // ?demo=1 only
  balanceUi: () => String(load('demo.bal', 2000000)),
  owned: (id) => load('demo.inv', []).includes(id),
  async buy(id, price) { const bal = load('demo.bal', 2000000); if (bal < price) return { ok: false, error: 'Not enough demo KIBBLE' };
    save('demo.bal', +(bal - price).toFixed(6)); const inv = load('demo.inv', []); if (!inv.includes(id)) inv.push(id); save('demo.inv', inv); return { ok: true }; },
};
export const K = { mode: DEMO ? 'demo' : 'loading', kp: null, glue: null, owned: {}, shiba: null, address: null };
export const isOwned = (id) => (K.mode === 'demo' ? demoWallet.owned(id) : !!K.owned[id]);
export const equipped = () => load('equip', {});
export function toggleEquip(id) { const c = COSMETICS[id]; if (!c) return; const e = equipped(); e[c.kind] = e[c.kind] === id ? null : id; save('equip', e); }
// active look: only items the wallet (or demo) actually owns
export function look() { const e = equipped(), out = {}; for (const kind of ['collar', 'gear', 'van']) { const id = e[kind]; if (id && isOwned(id)) out[kind] = { id, ...COSMETICS[id] }; } out.shiba = K.shiba?.exists ? K.shiba : null; return out; }
export function initKibble({ onChange = () => {} } = {}) { return (K.ready ||= bootKibble(onChange)); }
async function bootKibble(onChange) {
  try { K.glue = await import(API + '/inu-games.js'); const R = await K.glue.initKibble({ game: GAME }); Object.assign(K, { mode: R.mode, kp: R.kp, hint: R.walletHint }); K.glue.mountFooter(R.mode);
    // Connect Wallet: cloud save (equipped gear + local bests) keyed by wallet; holder tier from on-chain $KIBBLE.
    const lb = (g) => { try { return JSON.parse(g('inu-rescue.leaderboard.v2') || '[]'); } catch { return []; } };
    K.glue.mountHome?.(); // 🏠 Back to Inu Verse (title/pause/results; confirms + saves via globalThis.__inuHome)
    if (R.mode !== 'demo') K.walletUi = K.glue.mountWallet(R, { game: GAME, keys: ['inu-rescue.leaderboard.v2', 'ir.equip', 'inu-rescue.settings', 'inu-rescue.'], position: 'top-right',
      progress: (g) => { const l = lb(g); return l.reduce((m, e) => Math.max(m, Number(e.score) || 0), 0) + l.length; },
      label: (g) => { const l = lb(g); return l.length ? `best ${l.reduce((m, e) => Math.max(m, Number(e.score) || 0), 0)} · ${l.length} runs` : ''; },
      onWallet: ({ tier }) => { K.tier = tier || null; refresh().then(onChange).catch(() => {}); } }); }
  catch (e) { K.mode = DEMO ? 'demo' : 'offline'; }
  await refresh(); onChange(); return K;
}
export async function refresh() {
  if (!K.glue) return;
  K.address = K.kp?.session ? K.kp.address : null;
  if (K.address) K.owned = await K.glue.ownedItems(K, GAME).catch(() => ({}));
  const who = K.address || K.hint; if (who && K.mode !== 'demo') K.shiba = await K.glue.loadShiba(who).catch(() => null);
}
export async function signIn() { if (!K.glue) await K.ready; if (!K.glue) throw new Error('Wallet service offline'); await K.glue.signIn(K); await refresh(); return K.address; }
export async function openShop(onChange) {
  if (!K.glue) await K.ready; if (!K.glue) return null; const e = equipped(), eq = {}; for (const v of Object.values(e)) if (v) eq[v] = true;
  return K.glue.openShop(K, { game: GAME, title: 'Rescue Gear Shop', demo: demoWallet, equipped: eq, onEquip: toggleEquip, onChange: async () => { await refresh(); onChange?.(); } });
}
// wallet-signed score: only when signed in (not demo), at least one pup saved
export async function postRun(prog) {
  if (K.mode === 'demo' || !K.kp?.session || !(prog.saved > 0)) return { ok: false, skipped: true };
  try { return await K.kp.submitScore(GAME, runScore(prog), prog.timeMs, { v: SCORE_VERSION }); } catch (e) { return { ok: false, reason: e.message }; }
}
