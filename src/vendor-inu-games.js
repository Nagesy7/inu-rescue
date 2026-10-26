// Vendored from kibble-pay/public/inu-games.js (feat/siws-wallet-pill). Keep in sync when the shared wallet pill changes.
// inu-games.js: tiny shared glue every Inu game loads from kibble-pay (vanilla ES module, no build).
//   const K = await initKibble({ game: "meme-brawl" });   // K.mode: "demo" | "soon" | "live" | "offline"
//   K.kp is the kibblePay SDK (null in demo/offline). Demo mode ONLY with ?demo=1 in the URL: fake balances, clearly labelled.
//   Without ?demo=1 we never fake balances. $KIBBLE is live (mint 4VE9sy4fEMJdZ6i7MkYPbnqDJd2oqzJQmg44WJ3opump); SOON_MSG only shows if kibble-pay is unreachable.
// Needs the page import map for "@solana/web3.js" (see README) because kibble-pay.js imports it.
export const API = "https://kibble-pay.vercel.app";
export const SOON_MSG = "KIBBLE is live, but the wallet service is unreachable right now. Try again shortly.";
export const DEMO_LABEL = "DEMO MODE: fake KIBBLE, nothing is real (remove ?demo=1 to leave)";
export const TERMS_URL = API + "/terms.html", RULES_URL = API + "/prize-rules.html";
export const isDemo = () => { try { return new URLSearchParams(location.search).get("demo") === "1"; } catch { return false; } };

// ?wallet=<address> passed by Inu Verse doors: public address only (used to load the shared Shiba). Never a session or key;
// buying and score posting still need a Phantom sign-in on this site.
export const walletHint = () => { try { const w = new URLSearchParams(location.search).get("wallet") || ""; return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w) ? w : null; } catch { return null; } };
export async function initKibble({ game, apiBase = API } = {}) {
  const K = { game, mode: "offline", kp: null, cfg: null, reason: "", walletHint: walletHint() };
  if (isDemo()) { K.mode = "demo"; return K; }
  try {
    const { kibblePay } = await import(apiBase + "/kibble-pay.js");
    await kibblePay.init({ apiBase, game });
    K.kp = kibblePay; K.cfg = kibblePay.cfg;
    K.mode = kibblePay.cfg.provisioned ? "live" : "soon"; K.reason = kibblePay.cfg.notProvisionedReason || "";
  } catch (e) { K.mode = "offline"; K.reason = e.message; }
  return K;
}
// count owned of a catalog id (or "burn:<id>") in a /api/inventory result
export const owned = (inv, game, itemId) => Number(inv?.[game]?.[itemId] || 0);
export const fmt = (baseUnits, decimals = 6) => (Number(BigInt(baseUnits)) / 10 ** decimals).toLocaleString("en-US", { maximumFractionDigits: 4 });

// Small fixed footer: Terms, Prize Rules, current mode. Phone-landscape safe (tiny, bottom-left, no layout shift).
export function mountFooter(mode = "soon", { parent = document.body } = {}) {
  if (typeof document === "undefined" || document.getElementById("inu-legal")) return;
  const el = document.createElement("div"); el.id = "inu-legal";
  el.setAttribute("style", "position:fixed;left:4px;bottom:2px;z-index:9999;font:10px/1.4 system-ui,sans-serif;color:#cfd3dc;background:rgba(0,0,0,.45);padding:1px 6px;border-radius:4px;pointer-events:auto;max-width:70vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis");
  const badge = mode === "demo" ? `<b style="color:#ffb84a">DEMO (fake KIBBLE)</b>` : mode === "live" ? `<b style="color:#7ef0a0">KIBBLE live</b>` : `<b style="color:#ffd84a">KIBBLE live · wallet service offline</b>`;
  el.innerHTML = `${badge} · <a href="${TERMS_URL}" target="_blank" rel="noopener" style="color:#9fd8ff">Terms</a> · <a href="${RULES_URL}" target="_blank" rel="noopener" style="color:#9fd8ff">Prize Rules</a> · 18+`;
  parent.appendChild(el);
}
// Shared Shiba: read the wallet's profile (/api/profile) and render it with /inu-avatar.js.
// -> { profile, exists, canvas(scale), draw(ctx, x, feetY, opts) }. Falls back to the default Shiba on any error.
export async function loadShiba(wallet, { apiBase = API } = {}) {
  const [{ drawInuAvatar, avatarCanvas }, { normalizeProfile, defaultProfile }] = await Promise.all([import(apiBase + "/inu-avatar.js"), import(apiBase + "/lib/profile-schema.js")]);
  let profile = defaultProfile(wallet || null), exists = false;
  if (wallet) try { const j = await (await fetch(`${apiBase}/api/profile?wallet=${encodeURIComponent(wallet)}`)).json(); profile = normalizeProfile(j.profile, wallet); exists = !!j.exists; } catch {}
  return { profile, exists, canvas: (scale = 2, opts) => avatarCanvas(profile, scale, opts), draw: (ctx, x, y, opts) => drawInuAvatar(ctx, profile, x, y, opts) };
}

// ---- shared buy button + shop modal (same look in every game) ----
// openShop(K, { game, title, demo, equipped, onEquip, onChange })
//   K: initKibble() result. demo (only when K.mode === "demo"): { owned(id) -> bool, buy(id, priceUi) -> {ok, error}, balanceUi() -> string }.
//   Items come from the server catalog (/api/config, fee-inclusive prices); ids "<game>:<item>", the game sees "<item>".
//   Never shows a balance outside demo mode unless $KIBBLE is live (it is). If kibble-pay is unreachable every Buy says SOON_MSG.
let catalogCache = null;
export async function catalog(K, apiBase = API) {
  if (K?.cfg?.items) return K.cfg.items;
  if (!catalogCache) catalogCache = fetch(apiBase + "/api/config").then((r) => r.json()).then((j) => j.items || {}).catch(() => ({}));
  return catalogCache;
}
export async function ownedItems(K, game) {
  if (!K?.kp?.session) return {};
  const inv = (await K.kp.inventory(game).catch(() => ({})))?.[game] || {}, out = {};
  for (const [k, n] of Object.entries(inv)) if (n > 0 && k.startsWith(game + ":")) out[k.slice(game.length + 1)] = n;
  return out;
}
export async function openShop(K, { game, title = "KIBBLE Shop", demo, equipped = {}, onEquip, onChange, apiBase = API } = {}) {
  if (typeof document === "undefined") return null;
  document.getElementById("inu-shop")?.remove();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wrap = document.createElement("div"); wrap.id = "inu-shop";
  wrap.setAttribute("style", "position:fixed;inset:0;z-index:10000;background:rgba(5,6,16,.78);display:flex;align-items:center;justify-content:center;font:13px/1.35 system-ui,sans-serif;color:#eef;touch-action:auto");
  wrap.innerHTML = `<div style="background:#1b1f33;border:2px solid #ffd84a;border-radius:10px;max-width:min(560px,94vw);max-height:90vh;max-height:90dvh;overflow:auto;padding:10px 12px;box-sizing:border-box;width:100%">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:15px;color:#ffd84a">${esc(title)}</b><button data-x style="background:#333;color:#fff;border:0;border-radius:6px;padding:4px 10px;font-size:14px">✕</button></div>
    <div data-head style="margin:4px 0 8px;color:#cfd3dc"></div><div data-list style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px"></div>
    <div style="margin-top:8px;font-size:11px;color:#9aa">Cosmetic only, no gameplay advantage. Prices include the 2% split (1% President's Vault treasury, 1% prize pools). <a href="${TERMS_URL}" target="_blank" rel="noopener" style="color:#9fd8ff">Terms</a> · <a href="${RULES_URL}" target="_blank" rel="noopener" style="color:#9fd8ff">Prize Rules</a></div></div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove(); wrap.querySelector("[data-x]").onclick = close; wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  for (const t of ["touchstart", "touchmove", "touchend", "pointerdown", "keydown"]) wrap.addEventListener(t, (e) => e.stopPropagation());
  const head = wrap.querySelector("[data-head]"), list = wrap.querySelector("[data-list]"), mode = K?.mode || "offline";
  const render = async (msg = "") => {
    const cat = await catalog(K, apiBase), own = mode === "demo" ? null : await ownedItems(K, game);
    const items = Object.entries(cat).filter(([id, it]) => it.game === game && id.startsWith(game + ":")).map(([id, it]) => ({ id: id.slice(game.length + 1), ...it }));
    const isOwned = (id) => (mode === "demo" ? !!demo?.owned(id) : !!own?.[id]);
    head.innerHTML = (mode === "demo" ? `<b style="color:#ffb84a">DEMO: fake KIBBLE</b> · balance ${esc(demo?.balanceUi?.() ?? "0")}` : mode === "live" ? (K.kp?.session ? `Signed in ${esc(K.kp.address.slice(0, 4))}…${esc(K.kp.address.slice(-4))}` : "Sign in with Phantom to buy.") : `<b style="color:#ffd84a">${SOON_MSG}</b>`) + (msg ? `<div style="color:#7ef0a0;margin-top:3px">${esc(msg)}</div>` : "");
    list.innerHTML = items.length ? items.map((it) => { const o = isOwned(it.id), eq = equipped[it.id];
      return `<div style="background:#262b45;border-radius:8px;padding:6px 8px"><b>${esc(it.name)}</b><div style="color:#ffd84a">${esc(it.price)} KIBBLE</div>
        ${o ? `<button data-eq="${esc(it.id)}" style="margin-top:4px;background:${eq ? "#2f9a5a" : "#3a4166"};color:#fff;border:0;border-radius:6px;padding:4px 8px">${eq ? "Equipped" : "Equip"}</button>`
            : `<button data-buy="${esc(it.id)}" data-price="${esc(it.price)}" style="margin-top:4px;background:${mode === "demo" || mode === "live" ? "#c8282e" : "#555"};color:#fff;border:0;border-radius:6px;padding:4px 8px">Buy</button>`}</div>`; }).join("")
      : `<div style="color:#9aa">No items for ${esc(game)} yet.</div>`;
  };
  list.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.eq) { onEquip?.(b.dataset.eq); equipped[b.dataset.eq] = !equipped[b.dataset.eq]; onChange?.(); return render(); }
    const id = b.dataset.buy; if (!id) return;
    if (mode === "demo") { const r = await demo.buy(id, Number(b.dataset.price)); onChange?.(); return render(r.ok ? "Bought (demo)." : r.error); }
    if (mode !== "live") return render(SOON_MSG);
    b.disabled = true; b.textContent = "Confirm in Phantom…";
    try { if (!K.kp.session) { await K.kp.connect(); await K.kp.signIn(); } const r = await K.kp.buy({ itemId: game + ":" + id, game });
      onChange?.(); render(r.ok ? "Payment confirmed: item added to your wallet inventory." : r.error || r.reason || "Payment failed"); }
    catch (err) { render(err.message); }
  });
  await render(); return { close, render };
}
// Sign in with Phantom (connect + SIWS). Returns the address or throws. Demo mode never touches a wallet.
export async function signIn(K) { if (!K?.kp) throw new Error(K?.mode === "demo" ? "Demo mode: no wallet" : "Wallet service offline"); await K.kp.connect(); await K.kp.signIn(); return K.kp.address; }

// ---- shared Connect Wallet button + cloud save (same in every game) ----
// const W = mountWallet(K, { game, keys: ["inuquest."], progress: (get) => number, label: (get) => "Act 2", position: "top-right", onWallet })
//   keys: localStorage key prefixes (or exact keys) that make up this game's save. Guests keep the plain local save.
//   On connect (Phantom SIWS: you sign a message, never a seed phrase): reads on-chain $KIBBLE -> holder tier, loads the cloud save
//   for this wallet and, if the two differ, offers to keep the further-along one. Then autosaves to the wallet every 15s + on exit.
//   onWallet({ address, units, ui, tier }) lets the game apply holder perks / reload inventory. W.connect() for in-game menu entries.
export const PUMP_TIP = "Bought on pump.fun? Connect the same wallet. If you used pump.fun's email login, send your $KIBBLE to Phantom first (or export that wallet to Phantom).";
export const shortAddr = (a) => (a ? a.slice(0, 4) + "…" + a.slice(-4) : "");
export const HIDE_ADDR_KEY = "kibblePay.walletUi.hideAddress";
// Pill identity: prefer username; with hide-address on, username-only or a neutral "Connected" (never the address).
export function walletPillIdentity({ address, userName = "", hideAddress = false } = {}) {
  const name = String(userName || "").trim();
  if (hideAddress) return name || "Connected";
  return name || shortAddr(address) || "Connected";
}
// const W = mountWallet(K, { game, keys: ["inuquest."], progress: (get) => number, label: (get) => "Act 2", playerName: () => "Kabosu", position: "top-right", onWallet })
//   keys: localStorage key prefixes (or exact keys) that make up this game's save. Guests keep the plain local save.
//   On connect (Phantom SIWS: you sign a message, never a seed phrase): reads on-chain $KIBBLE -> holder tier, loads the cloud save
//   for this wallet and, if the two differ, offers to keep the further-along one. Then autosaves to the wallet every 15s + on exit.
//   onWallet({ address, units, ui, tier }) lets the game apply holder perks / reload inventory. W.connect() for in-game menu entries.
//   playerName: optional string | () => string. Else mountWallet loads /api/profile name when signed in. Hide-address toggle in the dropdown.
export function mountWallet(K, { game, keys = [], progress = () => 0, label = () => "", playerName = null, position = "top-right", onWallet, onRestore, storage, autosaveMs = 15000 } = {}) {
  if (typeof document === "undefined") return null;
  const LS = storage || (() => { try { return localStorage; } catch { return null; } })();
  const mine = (k) => k && !k.startsWith("kibblePay.") && keys.some((p) => k === p || k.startsWith(p));
  const snapshot = () => { const d = {}; if (!LS) return d; for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (mine(k)) d[k] = LS.getItem(k); } return d; };
  const getter = (d) => (k) => (k in d ? d[k] : null);
  const prog = (d) => { try { return Number(progress(getter(d))) || 0; } catch { return 0; } };
  const lab = (d) => { try { return String(label(getter(d)) || ""); } catch { return ""; } };
  const apply = (d) => { for (const k of Object.keys(snapshot())) if (!(k in d)) LS.removeItem(k); for (const [k, v] of Object.entries(d)) LS.setItem(k, v); };
  const getHide = () => { try { return LS?.getItem(HIDE_ADDR_KEY) === "1"; } catch { return false; } };
  const setHide = (v) => { try { LS?.setItem(HIDE_ADDR_KEY, v ? "1" : "0"); } catch {} };
  const W = { address: null, holder: null, lastSaved: 0, status: "", el: null, userName: "" };
  document.getElementById("inu-wallet")?.remove();
  const pos = { "top-right": "top:max(6px,env(safe-area-inset-top));right:max(6px,env(safe-area-inset-right))", "top-left": "top:max(6px,env(safe-area-inset-top));left:max(6px,env(safe-area-inset-left))", "top-center": "top:max(6px,env(safe-area-inset-top));left:50%;transform:translateX(-50%)", "bottom-right": "bottom:max(18px,env(safe-area-inset-bottom));right:max(6px,env(safe-area-inset-right))" }[position] || position;
  const el = document.createElement("div"); el.id = "inu-wallet"; W.el = el; const main = document.createElement("div"); main.id = "inu-wallet-main"; el.appendChild(main);
  el.setAttribute("style", `position:fixed;${pos};z-index:10001;font:600 12px/1.2 system-ui,sans-serif;color:#fff;user-select:none;-webkit-user-select:none;touch-action:manipulation`);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const btnCss = "background:linear-gradient(#7b4dff,#5a2fd6);color:#fff;border:2px solid #ffd84a;border-radius:18px;padding:6px 12px;font:inherit;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.5);min-height:44px;white-space:nowrap";
  let open = false;
  const readPlayerName = () => { try { const v = typeof playerName === "function" ? playerName() : playerName; return String(v || "").trim(); } catch { return ""; } };
  const resolveUserName = async () => {
    let n = readPlayerName();
    // Only use /api/profile name when the player has actually saved a profile (exists). Default "Shiba" is not a username.
    if (!n && K?.kp?.api && (W.address || K.kp.address)) {
      try {
        const wallet = W.address || K.kp.address;
        const j = await (await fetch(`${K.kp.api}/api/profile?wallet=${encodeURIComponent(wallet)}`)).json();
        if (j?.exists) n = String(j.profile?.name || "").trim();
      } catch {}
    }
    W.userName = n;
  };
  // Prefer SIWS session, then pill-owned address, then a just-connected Phantom pubkey (swap off Connect Wallet immediately).
  const sessionAddr = () => (K?.kp?.signedIn && K.kp.address) || W.address || K?.kp?.address || null;
  const connected = () => !!sessionAddr();
  const render = () => {
    if (K?.mode === "demo") { main.innerHTML = `<button id="inu-wallet-btn" data-w style="${btnCss};background:#7a5a20">Demo mode (no wallet)</button>`; return; }
    // Once a wallet pubkey or SIWS session exists, never show "Connect Wallet" (no refresh needed).
    const addr = sessionAddr();
    if (!addr) {
      const busy = !!W.status;
      const label = busy ? "⏳ Connecting…" : "🔗 Connect Wallet";
      main.innerHTML = `<button id="inu-wallet-btn" data-w data-connect ${busy ? "disabled" : ""} title="${esc(PUMP_TIP)}" style="${btnCss}${busy ? ";opacity:.85;cursor:wait" : ""}">${label}</button>${W.status ? `<div style="margin-top:3px;max-width:260px;background:rgba(0,0,0,.75);padding:3px 6px;border-radius:6px;font-weight:400;font-size:11px">${esc(PUMP_TIP)}</div>` : ""}${W.status ? `<div style="margin-top:3px;max-width:240px;background:rgba(0,0,0,.75);padding:3px 6px;border-radius:6px;font-weight:400">${esc(W.status)}</div>` : ""}`;
      return;
    }
    const hide = getHide(), ident = walletPillIdentity({ address: addr, userName: W.userName || readPlayerName(), hideAddress: hide });
    const h = W.holder, bal = h ? `${Number(h.ui).toLocaleString("en-US", { maximumFractionDigits: 2 })} KIBBLE` : "…";
    main.innerHTML = `<button id="inu-wallet-btn" data-w style="${btnCss};background:linear-gradient(#2f9a5a,#1f6a3e)">● ${esc(ident)} · ${esc(bal)} · ${esc(h?.tier?.name || "…")}</button>` + (open ? `<div style="margin-top:4px;background:#1b1f33;border:1px solid #ffd84a;border-radius:8px;padding:6px 8px;font-weight:400;min-width:200px;max-width:260px">
      <div>${W.userName || readPlayerName() ? `Player <b>${esc(W.userName || readPlayerName())}</b> · ` : ""}Wallet <code>${esc(hide ? "••••" : shortAddr(addr))}</code> · holder tier <b>${esc(h?.tier?.name || "-")}</b></div>
      <div style="color:#9fd8ff;margin:3px 0">${W.lastSaved ? "Saved to wallet " + new Date(W.lastSaved).toLocaleTimeString() : "Not saved to wallet yet"}${W.status ? " · " + esc(W.status) : ""}</div>
      <button data-hide style="${btnCss};padding:3px 8px;min-height:26px;font-size:11px;background:#3a4166">${hide ? "Show address" : "Hide address"}</button>
      <button data-save style="${btnCss};padding:3px 8px;min-height:26px;font-size:11px">Save now</button> <button data-load style="${btnCss};padding:3px 8px;min-height:26px;font-size:11px">Load wallet save</button> <button data-out style="${btnCss};padding:3px 8px;min-height:26px;font-size:11px;background:#444">Disconnect</button></div>` : "");
  };
  for (const t of ["touchstart", "touchend", "pointerdown", "mousedown", "keydown"]) el.addEventListener(t, (e) => e.stopPropagation());
  main.addEventListener("click", async (e) => { e.stopPropagation(); const b = e.target.closest("button"); if (!b) return;
    // NB: these are valueless attributes (data-connect etc.), so dataset.x === "" (falsy): test presence, not truthiness.
    if (b.hasAttribute("data-connect")) return W.connect();
    if (b.hasAttribute("data-hide")) { setHide(!getHide()); render(); return; }
    if (b.hasAttribute("data-save")) return W.save(true);
    if (b.hasAttribute("data-load")) return W.sync({ preferCloud: true });
    if (b.hasAttribute("data-out")) { await K.kp.disconnect(); W.address = null; W.holder = null; W.userName = ""; open = false; W.status = "Disconnected. Your local save stays on this device."; render(); onWallet?.({ address: null }); return; }
    if (b.hasAttribute("data-w") && connected()) { open = !open; render(); } });
  (document.body || document.documentElement).appendChild(el); dockHome();
  let lastJson = "", timer = null;
  // W.held: the player closed "Two saves found" with Not now -> no autosave until they choose (Save now / Load wallet save),
  // so neither save is overwritten behind their back. backup: the server copies the old wallet save to its backup slot first.
  W.held = false;
  // which wallet save this device last loaded or wrote (its updatedAt): if the wallet save is still that one, this device's save
  // simply continues it (no prompt). The prompt only shows when the wallet save changed somewhere else (or never synced here).
  const syncKey = () => `kibblePay.synced.${game}.${W.address}`, synced = () => { try { return Number(LS.getItem(syncKey())) || 0; } catch { return 0; } };
  const markSynced = (at) => { try { if (at) LS.setItem(syncKey(), String(at)); } catch {} };
  W.save = async (force = false, { backup = false } = {}) => { if (!W.address || !K?.kp?.signedIn) return; if (W.held && !force) return; const d = snapshot(), j = JSON.stringify(d); if (!force && j === lastJson) return;
    const bk = backup || W.held; W.held = false;
    try { const r = await K.kp.cloudSave(game, { data: d, progress: prog(d), label: lab(d), ...(bk ? { backup: true } : {}) }); markSynced(r?.save?.updatedAt); lastJson = j; W.lastSaved = Date.now(); W.status = ""; } catch (err) { W.status = "Cloud save failed: " + err.message; } render(); };
  const ask = (cloud, local) => new Promise((res) => { const m = document.createElement("div"); m.id = "inu-save-pick";
    m.setAttribute("style", "position:fixed;inset:0;z-index:10002;background:rgba(5,6,16,.8);display:flex;align-items:center;justify-content:center;font:13px/1.4 system-ui,sans-serif;color:#eef");
    m.innerHTML = `<div style="background:#1b1f33;border:2px solid #ffd84a;border-radius:10px;padding:12px;max-width:min(420px,94vw)"><b style="color:#ffd84a">Two saves found</b>
      <p style="margin:6px 0">Wallet save: <b>${esc(cloud.label || "progress " + cloud.progress)}</b> (${new Date(cloud.updatedAt).toLocaleString()})<br>This device: <b>${esc(lab(local) || "progress " + prog(local))}</b></p>
      <p style="margin:6px 0;color:#9fd8ff">${cloud.progress > prog(local) ? "The wallet save is further along." : prog(local) > cloud.progress ? "This device is further along." : "Both are at the same point."}</p>
      <button data-c style="${btnCss}">Keep wallet save</button> <button data-l style="${btnCss};background:#3a4166">Keep this device</button> <button data-n style="${btnCss};background:#444">Not now</button>
      <p style="margin:6px 0 0;font-size:11px;color:#9aa">The save you don't keep is backed up, never deleted. Not now changes nothing.</p></div>`;
    for (const t of ["touchstart", "touchend", "pointerdown", "mousedown", "keydown"]) m.addEventListener(t, (e) => e.stopPropagation());
    m.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; m.remove(); res(b.hasAttribute("data-c") ? "cloud" : b.hasAttribute("data-l") ? "local" : "cancel"); }); document.body.appendChild(m); });
  W.sync = async ({ preferCloud = false } = {}) => {
    let r; try { r = await K.kp.cloudLoad(game); } catch (err) { W.status = "Cloud save unavailable: " + err.message; render(); return; }
    const local = snapshot(), cloud = r.exists ? r.save : null;
    if (!cloud) return W.save(true);
    if (JSON.stringify(cloud.data) === JSON.stringify(local)) { markSynced(cloud.updatedAt); lastJson = JSON.stringify(local); W.lastSaved = cloud.updatedAt; render(); return; }
    if (!preferCloud && cloud.updatedAt && synced() === cloud.updatedAt) return W.save(true); // same lineage: this device is just further along
    const localEmpty = !Object.keys(local).length || prog(local) <= 0 && cloud.progress > 0;
    const pick = localEmpty && !preferCloud ? "cloud" : await ask(cloud, local);
    if (pick === "cancel") { W.held = true; W.status = "Not synced: both saves kept. Save now or Load wallet save when you're ready."; render(); return; }
    // keep a copy of this device's save on the device before the wallet save replaces it (kibblePay.* keys are never synced or cleared)
    if (pick === "cloud" && Object.keys(local).length) try { LS.setItem(`kibblePay.backup.${game}.device`, JSON.stringify({ at: Date.now(), progress: prog(local), label: lab(local), data: local })); } catch {}
    if (pick === "cloud") { W.held = false; markSynced(cloud.updatedAt); apply(cloud.data); lastJson = JSON.stringify(cloud.data); W.lastSaved = cloud.updatedAt; W.status = "Loaded wallet save"; render(); if (onRestore) onRestore(cloud); else { // block the running game from overwriting the restored save before the reload
      try { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (this === LS && mine(k)) return; return orig.call(this, k, v); }; } catch {} location.reload(); } }
    else await W.save(true, { backup: true });
  };
  let connecting = null;
  W.afterConnect = () => connecting ||= (async () => { W.address = K.kp.address; W.status = ""; render();
    await resolveUserName(); render();
    W.holder = await K.kp.holder().catch(() => null); render();
    try { onWallet?.({ address: W.address, ...(W.holder || {}) }); } catch {}
    await W.sync(); clearInterval(timer); timer = setInterval(() => W.save(), autosaveMs); })().finally(() => { connecting = null; });
  // Adopt a SIWS session that appeared after mount (Phantom btn elsewhere, tab focus, visibility) without a second manual Connect.
  W.resync = () => {
    try { K?.kp?.reviveSession?.(); } catch {}
    if (K?.kp?.signedIn) {
      if (!W.address || W.address !== K.kp.address) return W.afterConnect();
      render(); return;
    }
    if (W.address && !K?.kp?.signedIn) { W.address = null; W.holder = null; W.userName = ""; open = false; render(); }
  };
  W.connect = async () => { if (!K?.kp) { W.status = K?.mode === "demo" ? "Demo mode: no wallet" : "Wallet service offline, try again later"; render(); return null; }
    if (W.address && K.kp.signedIn) return W.address;
    try {
      W.status = "Approve in Phantom (sign-in message only, no seed phrase)…"; render();
      await K.kp.connect();
      // Immediate Connect Wallet → pill swap (pubkey known); SIWS finishes next.
      W.address = K.kp.address; W.status = "Sign-in message…"; render();
      await K.kp.signIn();
      await W.afterConnect();
      return W.address;
    } catch (err) {
      // If SIWS failed after connect, keep the connected pill (not Connect Wallet) when a pubkey remains.
      if (K?.kp?.address) { W.address = K.kp.address; W.status = err.message; render(); return W.address; }
      W.status = err.message; render(); return null;
    } };
  addEventListener("pagehide", () => W.save());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") W.save(); else W.resync(); });
  addEventListener("focus", () => W.resync());
  addEventListener("kibble:wallet", (e) => {
    const a = e.detail?.address;
    if (a) { if (a !== W.address || !K?.kp?.signedIn) W.afterConnect(); else { render(); } }
    else W.resync();
  });
  render();
  if (K?.kp?.signedIn) W.afterConnect(); // remembered session: no new signature needed
  else { try { K?.kp?.reviveSession?.(); if (K?.kp?.signedIn) W.afterConnect(); } catch {} }
  return W;
}

// ---- shared "Back to Inu Verse" home button (title, pause/in-game and results screens: it floats over all of them) ----
// mountHome({ isBusy: () => bool|string, save: () => void })  isBusy = mid-match / unsaved progress -> confirm first; save() runs before leaving.
// Opened from Inu Verse (?from=inu-verse / ?from=verse, ?spawn=<building>, ?return=<inu-verse url>, or an Inu Verse referrer): returns to that spot.
// Inside the Inu Verse arcade overlay (iframe) it asks Inu Verse to close the overlay instead of reloading.
export const VERSE = "https://inu-verse-tawny.vercel.app";
export function verseReturnUrl(loc = typeof location !== "undefined" ? location : null, referrer = typeof document !== "undefined" ? document.referrer : "") {
  let q; try { q = new URLSearchParams(loc?.search || ""); } catch { q = new URLSearchParams(); }
  const ret = q.get("return") || "";
  if (ret.startsWith(VERSE + "/") || ret === VERSE) return ret;
  const spawn = (q.get("spawn") || "").replace(/[^\w-]/g, "").slice(0, 32);
  const fromVerse = /^(inu-)?verse$/.test(q.get("from") || "") || String(referrer || "").startsWith(VERSE);
  return VERSE + "/" + (fromVerse && spawn ? "?spawn=" + encodeURIComponent(spawn) : "");
}
// homeUrl(candidate): a game-supplied 🏠 target is used only when it is the Inu Verse origin or the page's own origin (never an open redirect).
export function homeUrl(candidate, origin = typeof location !== "undefined" ? location.origin : "") {
  let u; try { u = new URL(String(candidate || ""), VERSE + "/"); } catch { return null; }
  if (u.username || u.password) return null;
  if (u.origin === VERSE && u.protocol === "https:") return u.href;
  if (origin && u.origin === origin && /^https?:$/.test(u.protocol)) return u.href;
  return null;
}
// Options (all optional): url = string | () => string (allowlisted by homeUrl, else verseReturnUrl()); onLeave(url) runs right before leaving
// (e.g. the arcade's framed "inu-arcade:exit" postMessage). Older callers that pass neither behave exactly as before.
export function mountHome({ isBusy = () => globalThis.__inuHome?.busy?.(), save = () => globalThis.__inuHome?.save?.(), label = "Back to Inu Verse", url: urlOpt = null, onLeave = null } = {}) {
  if (typeof document === "undefined") return null;
  document.getElementById("inu-home")?.remove();
  const b = document.createElement("button"); b.id = "inu-home"; b.type = "button"; b.title = label; b.setAttribute("aria-label", label); b.textContent = "🏠";
  const css = "width:44px;height:44px;border-radius:50%;border:2px solid #ffd84a;background:#1b1f33;color:#fff;font-size:20px;line-height:1;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.5);padding:0;touch-action:manipulation";
  b.dataset.css = css; b.setAttribute("style", css + ";position:fixed;z-index:10001;top:max(6px,env(safe-area-inset-top));left:max(6px,env(safe-area-inset-left))"); document.body.appendChild(b); dockHome();
  for (const t of ["touchstart", "touchend", "pointerdown", "mousedown", "keydown"]) b.addEventListener(t, (e) => e.stopPropagation());
  b.addEventListener("click", (e) => { e.stopPropagation(); let busy = false; try { busy = isBusy(); } catch {}
    if (busy && !confirm(typeof busy === "string" ? busy : "Leave this game and go back to Inu Verse? Your progress is saved first.")) return;
    try { save?.(); } catch {}
    let url = null; try { url = urlOpt ? homeUrl(typeof urlOpt === "function" ? urlOpt() : urlOpt) : null; } catch {} url = url || verseReturnUrl();
    try { onLeave?.(url); } catch {}
    if (window.top !== window) { let done = false; const on = (m) => { if (m.origin === VERSE && m.data?.type === "inu:verse-closed") { done = true; removeEventListener("message", on); } };
      addEventListener("message", on); try { window.parent.postMessage({ type: "inu:back-to-verse", url }, VERSE); } catch {}
      setTimeout(() => { if (done) return; try { window.top.location.href = url; } catch { window.open(url, "_top"); } }, 500); return; }
    location.href = url; });
  return b;
}
function dockHome() { const b = document.getElementById("inu-home"), host = document.getElementById("inu-wallet"); if (!b || !host) return;
  host.style.display = "flex"; host.style.gap = "6px"; host.style.alignItems = "flex-start"; b.setAttribute("style", b.dataset.css); host.prepend(b); }
