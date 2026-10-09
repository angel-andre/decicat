// client <-> worker E2E against `wrangler dev` on 127.0.0.1:8787: normal save, server down -> queue, recovery -> resubmit
import { chromium } from 'playwright-core';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // repo root
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const B = 'http://127.0.0.1:8787';
const b = await chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 480, height: 480 } });
const errs = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
async function run(p, secs) {
  await p.evaluate(() => __decicat.start());
  await p.waitForTimeout(secs * 1000);
  await p.evaluate(() => { if (__decicat.state === 'play') __decicat.kill(); });
  for (let i = 0; i < 40 && await p.evaluate(() => __decicat.state) !== 'over'; i++) await p.waitForTimeout(100);
}
const res = p => p.evaluate(() => { const r = __decicat.result; return !r ? { pending: true } : { status: r.status, pending: r.pending, rank: r.rank, ranked: r.ranked, total: r.total, n: r.top.length, board: r.board, score: r.score }; });
const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errs.push(m.text()); });
await p.goto(B + '/embed?bot&seed=4&nogate');
ok(await p.evaluate(() => __decicat.Scores.online), 'embed page uses the online board');
const before = (await (await fetch(B + '/api/top')).json()).total;
// A. normal save
await run(p, 3.5);
for (let i = 0; i < 50 && (await res(p)).pending; i++) await p.waitForTimeout(100);
let r = await res(p); console.log(JSON.stringify(r));
ok(r.status === 'ok' && r.ranked && r.rank > 0 && r.n === 20, 'normal save: status ok, rank #' + r.rank + ' of ' + r.total + ', 20 rows');
await p.waitForTimeout(800); await p.screenshot({ path: ROOT + '/shots/v3_gameover_top20_online.png' });
// B. server down (all /api/* requests fail) -> retries then queue
await p.route('**/api/**', route => route.abort('connectionrefused'));
await p.evaluate(() => __decicat.start()); await p.waitForTimeout(3200); await p.evaluate(() => { if (__decicat.state === 'play') __decicat.kill(); });
await p.waitForTimeout(1800); await p.screenshot({ path: '/tmp/v3/saving.png' });
const t0 = Date.now(); for (let i = 0; i < 150 && (await res(p)).pending; i++) await p.waitForTimeout(100);
r = await res(p); console.log(JSON.stringify(r), 'gave up after ~' + ((Date.now() - t0) / 1000 + 1.8).toFixed(1) + 's');
ok(r.status === 'queued', 'server down: score queued (not "saved locally")');
ok(await p.evaluate(() => __decicat.Scores.queued) === 1, 'queue holds 1 score in localStorage');
await p.waitForTimeout(600); await p.screenshot({ path: ROOT + '/shots/v3_gameover_queued.png' });
// C. second failure while down, then server back + reload -> automatic resubmit of both
await p.evaluate(() => __decicat.start()); await p.waitForTimeout(3000); await p.evaluate(() => { if (__decicat.state === 'play') __decicat.kill(); });
for (let i = 0; i < 150 && (await res(p)).pending; i++) await p.waitForTimeout(100);
ok(await p.evaluate(() => __decicat.Scores.queued) === 2, 'two scores queued while down');
await p.unroute('**/api/**');
await p.reload(); await p.waitForTimeout(4000);
ok(await p.evaluate(() => __decicat.Scores.queued) === 0, 'after reload with server back: queue flushed automatically');
const after = (await (await fetch(B + '/api/top')).json()).total;
ok(after === before + 3, 'server now has all 3 runs (before ' + before + ', after ' + after + ')');
// D. queued -> TAP TO RETRY path
await p.route('**/api/**', route => route.abort('connectionrefused'));
await run(p, 3.2);
for (let i = 0; i < 150 && (await res(p)).pending; i++) await p.waitForTimeout(100);
ok((await res(p)).status === 'queued', 'queued again while down');
await p.unroute('**/api/**');
const rr = await p.evaluate(() => __decicat.ui.retry); const cb = await p.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return [c.left, c.top, c.width / __decicat.size[0]]; });
await p.waitForTimeout(800);
await p.mouse.click(cb[0] + (rr.x + rr.w / 2) * cb[2], cb[1] + (rr.y + 6) * cb[2]);
for (let i = 0; i < 50 && (await res(p)).status !== 'ok'; i++) await p.waitForTimeout(100);
r = await res(p); ok(r.status === 'ok' && r.n === 20 && await p.evaluate(() => __decicat.Scores.queued) === 0, 'tap to retry: saved, rank #' + r.rank + ', queue empty');
// E. board load failure -> TAP TO RETRY state (top fetch fails, score queued, no cached board)
const p2 = await ctx.newPage(); await p2.route('**/api/**', route => route.abort('connectionrefused'));
await p2.goto(B + '/embed?bot&seed=5&nogate'); await p2.evaluate(() => localStorage.removeItem('decicat_queue_v1'));
await run(p2, 3);
for (let i = 0; i < 200 && (await res(p2)).board !== 'error'; i++) await p2.waitForTimeout(100);
r = await res(p2); ok(r.board === 'error' && r.status === 'queued', 'no board + no server: shows TAP TO RETRY state');
await p2.waitForTimeout(400); await p2.screenshot({ path: ROOT + '/shots/v3_gameover_retry.png' });
await p2.unroute('**/api/**'); await p2.evaluate(() => __decicat.Scores.flush());
ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
await b.close();
