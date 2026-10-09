// Determinism test: play real-time runs in Chrome (human-like key input, the bot, and a mid-run resize),
// then re-simulate each recorded replay headlessly in a different page/viewport and compare scores.
import { chromium } from 'playwright-core';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // repo root
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL0 = process.env.URL0 || 'file://' + ROOT + '/dist/decicat.html';
const ZT = process.env.ZT || '8';
const ZQ = process.env.Z0 ? '&zone=' + process.env.Z0 : '';
const b = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const errs = [];
async function mk(q, vp) { const ctx = await b.newContext({ viewport: vp || { width: 900, height: 500 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); await p.goto(URL0 + q); await p.waitForTimeout(300); return p; }
const verifier = await mk('?nogate&zt=' + ZT, { width: 390, height: 700 });
async function check(label, p) {
  const live = await p.evaluate(() => ({ score: __decicat.score, death: __decicat.death, zone: __decicat.zone, rp: __decicat.replay }));
  if (!live.rp) { ok(false, label + ': no replay recorded'); return; }
  const sim = await verifier.evaluate(rp => __decicat.simulate(rp), live.rp);
  const sim2 = await verifier.evaluate(rp => __decicat.simulate(rp), live.rp);
  ok(sim.score === live.score && sim2.score === sim.score, `${label}: live ${live.score} (zone ${live.zone}, ${live.death}) vs re-sim ${sim.score} (zone ${sim.zone}, ${sim.death}, ${sim.frames} frames, ${live.rp.ev.split('.').length} inputs, ${JSON.stringify(live.rp).length} B)`);
  return live;
}
async function waitDeath(p, ms) { try { await p.waitForFunction(() => __decicat.state !== 'play', null, { timeout: ms, polling: 100 }); return true; } catch (e) { return false; } }
// 1. human-like random keyboard play (variable real frame timing, held jumps of random length)
for (let k = 0; k < 3; k++) {
  const p = await mk('?nogate&zt=' + ZT + ZQ);
  await p.evaluate(() => __decicat.start());
  const t0 = Date.now();
  while (Date.now() - t0 < 60000 && await p.evaluate(() => __decicat.state) === 'play') {
    await p.keyboard.down('Space'); await p.waitForTimeout(40 + Math.random() * 250); await p.keyboard.up('Space');
    await p.waitForTimeout(150 + Math.random() * 600);
  }
  await waitDeath(p, 30000); await check('keyboard run ' + (k + 1), p); await p.context().close();
}
// 2. the bot (long runs through several zones), with a mid-run window resize on the second one
for (let k = 0; k < 2; k++) {
  const p = await mk('?nogate&bot&zt=' + ZT + ZQ);
  await p.evaluate(() => __decicat.start());
  if (k === 1) { await p.waitForTimeout(5000); await p.setViewportSize({ width: 700, height: 600 }); await p.waitForTimeout(4000); await p.setViewportSize({ width: 1200, height: 520 }); }
  const died = await waitDeath(p, 100000);
  if (!died) { console.log('note: bot survived 100 s, forcing a real death by stopping input'); await p.evaluate(() => { __decicat.press(); }); }
  await waitDeath(p, 30000);
  await check('bot run ' + (k + 1) + (k === 1 ? ' (resized twice mid-run)' : ''), p); await p.context().close();
}
// 3. tamper: changing one input must change the outcome (or the score claimed would not match)
{
  const p = await mk('?nogate&zt=' + ZT + ZQ); await p.evaluate(() => __decicat.start());
  for (let i = 0; i < 12 && await p.evaluate(() => __decicat.state) === 'play'; i++) { await p.keyboard.down('Space'); await p.waitForTimeout(120); await p.keyboard.up('Space'); await p.waitForTimeout(500); }
  await waitDeath(p, 60000);
  const live = await check('tamper base run', p);
  if (live) { const rp = Object.assign({}, live.rp); rp.seed = (rp.seed ^ 12345) | 0; const s = await verifier.evaluate(rp => __decicat.simulate(rp), rp); ok(s.score !== live.score || s.frames !== live.rp.f, 'different seed -> different result (' + s.score + ' vs ' + live.score + ')'); }
  await p.context().close();
}
ok(errs.length === 0, 'no console/page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
