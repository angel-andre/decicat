// Contest protection end-to-end against `wrangler dev` (port 8787, .dev.vars ADMIN_KEY):
// real-time run on /embed -> server stores replay + claim hash -> claim code shown once + saved in localStorage
// -> tools/verify.mjs re-simulates the stored replay (computed == claimed) and checks the claim code.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // repo root
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const B = process.env.B || 'http://127.0.0.1:8787';
const OUT = ROOT + '/shots/';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const b = await chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(B + '/embed?nogate'); await p.waitForTimeout(500);
let res = null;
for (let tries = 0; tries < 6; tries++) {
  await p.evaluate(() => __decicat.start());
  const t0 = Date.now();
  while (Date.now() - t0 < 25000 && await p.evaluate(() => __decicat.state) === 'play') { await p.keyboard.down('Space'); await p.waitForTimeout(60 + Math.random() * 200); await p.keyboard.up('Space'); await p.waitForTimeout(250 + Math.random() * 500); }
  await p.waitForFunction(() => __decicat.state === 'over' && __decicat.result && !__decicat.result.pending, null, { timeout: 30000 });
  res = await p.evaluate(() => __decicat.result);
  if (res.ranked && res.rank > 0) break;
  await p.waitForTimeout(800);
}
ok(res.status === 'ok' && res.rank > 0 && res.rank <= 5, `run placed #${res.rank} (${res.score} pts)`);
ok(/^DCAT-[2-9A-Z]{4}-[2-9A-Z]{2}$/.test(res.claim || ''), 'claim code shown: ' + res.claim);
await p.waitForTimeout(1600); await p.screenshot({ path: OUT + 'v4_claimcode.png' });
const hist = await p.evaluate(() => JSON.parse(localStorage.getItem('decicat_claims_v1') || '[]'));
ok(hist.some(h => h.code === res.claim && h.score === res.score), 'claim code saved in localStorage history');
// tap dismisses the overlay (shown once)
await p.mouse.click(195, 420); await p.waitForTimeout(300);
ok(await p.evaluate(() => !__decicat.result.claimShow), 'tap dismisses the claim overlay');
const keyFile = ROOT + '/server/.dev.vars';
const run = (...a) => { try { return { code: 0, out: execFileSync('node', [ROOT + '/tools/verify.mjs', ...a, '--base', B, '--key-file', keyFile], { encoding: 'utf8' }) }; } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; } };
let v = run('entry', res.id); console.log(v.out.trim());
ok(v.code === 0 && /VERIFIED/.test(v.out) && v.out.includes('computed  ' + res.score), 'verify.mjs: headless re-sim of the stored replay == claimed score');
v = run('claim', res.claim); console.log(v.out.trim());
ok(v.code === 0 && /MATCH/.test(v.out), 'verify.mjs claim: code matches the stored hash');
v = run('claim', 'DCAT-2222-22'); ok(v.code === 1 && /NO MATCH/.test(v.out), 'wrong claim code -> NO MATCH');
// tampered score with a real replay -> verifier catches it
const ent = await (await fetch(B + '/api/admin/entry?id=' + res.id, { headers: { 'x-admin-key': (await import('node:fs')).readFileSync(keyFile, 'utf8').split('=')[1].trim() } })).json();
const nonce = 'tamper' + Date.now().toString(36);
const fake = await (await fetch(B + '/api/score', { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-ip': '9.9.9.9' }, body: JSON.stringify({ name: 'Cheater', score: res.score + 900, runMs: ent.runMs + 3000, nonce, replay: ent.replay, v: 'v4.0' }) })).json();
v = run('entry', fake.id); console.log(v.out.trim());
ok(v.code === 1 && /MISMATCH/.test(v.out), 'forged score with a copied replay -> MISMATCH');
// idempotent resend returns the same claim code
const again = await (await fetch(B + '/api/score', { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-ip': '9.9.9.9' }, body: JSON.stringify({ name: 'Cheater', score: res.score + 900, runMs: ent.runMs + 3000, nonce, replay: ent.replay }) })).json();
ok(again.id === fake.id && again.claim === fake.claim && !!fake.claim, 'same nonce -> same entry and same claim code');
ok(!JSON.stringify(await (await fetch(B + '/api/top')).json()).includes('DCAT-'), '/api/top never exposes claim codes');
const noKey = await fetch(B + '/api/admin/entries'); ok(noKey.status === 403, 'admin endpoint without key -> 403');
v = run('list'); console.log(v.out.trim().split('\n').slice(0, 6).join('\n'));
ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
