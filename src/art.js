// Inu Verse-style sprite art (art/*.png, see art/manifest.json). Visual only; procedural art is the fallback until images load.
const BASE = typeof document !== 'undefined' ? new URL('../art/', import.meta.url) : null;
const I = {};
const NAMES = ['background', 'bone', 'cat_sheet', 'hazard_tin', 'hazard_yarn', 'hero_sheet', 'pup_sheet'];
if (BASE && typeof Image !== 'undefined') for (const n of NAMES) { const i = new Image(); i.src = new URL(n + '.png', BASE).href; I[n] = i; }
export const has = n => { const i = I[n]; return !!(i && i.complete && i.naturalWidth); };
// draw frame f (fw x fh) of sheet n at (x, y), optionally mirrored (all art faces right)
export function frame(c, n, f, fw, fh, x, y, flip = false) {
  if (!has(n)) return false; x = Math.round(x); y = Math.round(y);
  if (flip) { c.save(); c.translate(x + fw, y); c.scale(-1, 1); c.drawImage(I[n], f * fw, 0, fw, fh, 0, 0, fw, fh); c.restore(); }
  else c.drawImage(I[n], f * fw, 0, fw, fh, x, y, fw, fh);
  return true; }
export const HERO = { idle: 0, run: [1, 2, 3, 4], jump: 5, climb: 6, hurt: 7, win: 8 };
