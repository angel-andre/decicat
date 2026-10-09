// v5.4 anonymous player counter, end-to-end against `wrangler dev` (port 8787, DEV=1):
// - /embed load sends exactly one 'load' ping, the first run one 'run' ping, later runs none; payload = {id, ev} only
// - the id is 32 hex chars in localStorage decicat_pid_v1, reused across reloads
// - no ping in bot / poster / manual / record / seed / zone / zt / ?noping modes
// - endpoint offline (aborted), 500 and 404: no exception, game keeps running, no page errors
import { chromium } from 'playwright-core';
const B = process.env.B || 'http://127.0.0.1:8787';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function open(q, mode, ctx) {
  ctx = ctx || await b.newContext({ viewport: { width: 480, height: 480 } });
  const p = await ctx.newPage(), pings = [], pageErr = [], consoleErr = [];
  p.on('pageerror', e => pageErr.push(e.message)); p.on('console', m => m.type() === 'error' && consoleErr.push(m.text()));
  await p.route('**/api/ping', async route => {
    const r = route.request(); pings.push({ body: r.postData(), headers: r.headers() });
    if (mode === 'offline') return route.abort('internetdisconnected');
    if (mode === '500') return route.fulfill({ status: 500, body: 'boom' });
    if (mode === '404') return route.fulfill({ status: 404, body: 'Not found' });
    if (mode === 'hang') return; // never answers
    return route.continue();
  });
  await p.goto(B + '/embed' + q); await p.waitForTimeout(1800);
  return { p, ctx, pings, pageErr, consoleErr };
}
async function play(p) { // real start (tap), a short real-time run, die
  await p.evaluate(() => { __decicat.start(); }); await p.waitForTimeout(400); await p.evaluate(() => __decicat.kill()); await p.waitForTimeout(300);
}
// 1. normal
{
  const o = await open('', 'live');
  ok(o.pings.length === 1, `load: 1 ping after load (${o.pings.length})`);
  const j = JSON.parse(o.pings[0].body);
  ok(Object.keys(j).sort().join() === 'ev,id' && j.ev === 'load' && /^[0-9a-f]{32}$/.test(j.id), 'payload is only {id, ev:"load"} with a 32-hex id: ' + o.pings[0].body);
  ok(!o.pings[0].headers.cookie, 'no cookie header');
  const pid = await o.p.evaluate(() => localStorage.getItem('decicat_pid_v1'));
  ok(pid === j.id, 'id stored in localStorage decicat_pid_v1');
  await play(o.p); await o.p.waitForTimeout(300);
  ok(o.pings.length === 2 && JSON.parse(o.pings[1].body).ev === 'run' && JSON.parse(o.pings[1].body).id === pid, 'first run: 1 run ping with the same id');
  await play(o.p); await play(o.p);
  ok(o.pings.length === 2, 'later runs: no more pings');
  await o.p.reload(); await o.p.waitForTimeout(1800);
  ok(o.pings.length === 3 && JSON.parse(o.pings[2].body).id === pid, 'reload: same id reused');
  ok(!o.pageErr.length && !o.consoleErr.length, 'no page/console errors ' + JSON.stringify(o.pageErr.concat(o.consoleErr)));
  await o.ctx.close();
}
// 2. modes that must never ping
for (const q of ['?bot', '?poster', '?manual', '?record', '?seed=3', '?zone=2', '?zt=10', '?noping', '?nogate&bot&god']) {
  const o = await open(q, 'live');
  if (!q.includes('poster')) { try { await o.p.evaluate(() => __decicat.start()); await o.p.waitForTimeout(300); } catch (e) { } }
  ok(o.pings.length === 0, `no ping with ${q}`);
  await o.ctx.close();
}
// 3. failures: offline / 500 / 404 / hanging endpoint
for (const mode of ['offline', '500', '404', 'hang']) {
  const o = await open('', mode);
  await play(o.p); await o.p.waitForTimeout(300);
  const st = await o.p.evaluate(() => __decicat.state);
  ok(o.pings.length === 2 && !o.pageErr.length, `${mode}: pings attempted (${o.pings.length}), no exception, game state ${st}`);
  ok(st === 'over' || st === 'dying', `${mode}: game unaffected`);
  console.log(`   ${mode} console errors (browser network log lines only):`, JSON.stringify(o.consoleErr));
  await o.ctx.close();
}
// 4. localStorage blocked (private mode style): still no exception
{
  const ctx = await b.newContext({ viewport: { width: 480, height: 480 } });
  await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); });
  const o = await open('', 'live', ctx); await play(o.p);
  ok(!o.pageErr.length && o.pings.length === 2, 'localStorage unavailable: no exception, pings still sent ' + JSON.stringify(o.pageErr));
  await ctx.close();
}
await b.close();
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
