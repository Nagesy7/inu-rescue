// Proof: a prize-score POST from the game carries "v": 2 (request intercepted, never sent to the server).
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:8191/';
const b = await chromium.launch(); const p = await b.newPage(); let body = null;
await p.route('**/api/game?action=score', r => { body = r.request().postDataJSON(); r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
await p.goto(URL); await p.waitForTimeout(3000);
const res = await p.evaluate(async () => { const KB = await import('./src/kibble.js'); await KB.K.ready; if (!KB.K.kp) return 'no kp (' + KB.K.mode + ')';
  KB.K.kp.session = 'proof'; return KB.postRun({ saved: 1, score: 500, timeMs: 60000 }); });
console.log(JSON.stringify(res), JSON.stringify(body)); await b.close(); process.exit(body?.v === 2 ? 0 : 1);
