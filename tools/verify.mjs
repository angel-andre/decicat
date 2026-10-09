#!/usr/bin/env node
// DECICAT contest verifier.
//   node verify.mjs list   [--n 50]                 top entries (verifiable / unverified, has claim code)
//   node verify.mjs entry  <rank|id>                fetch the stored replay, re-simulate headlessly, print computed vs claimed
//   node verify.mjs all    [--n 20]                 re-simulate every top entry that has a replay
//   node verify.mjs claim  <DCAT-XXXX-XX> [rank|id] check a claim code against the stored hash (searches the top 50 if no entry given)
//   node verify.mjs file   <replay.json> [claimed]  re-simulate a replay saved to disk (offline)
// Options: --base https://decicat.decicat.workers.dev (default)   --key-file <repo>/.admin_key (default; or env ADMIN_KEY)
//          --game <repo>/dist/decicat.html (the build to simulate with; must match the replay's version)
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // repo root
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const argv = process.argv.slice(2), opt = {}, pos = [];
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i]; else pos.push(argv[i]); }
const BASE = (opt.base || process.env.DECICAT_BASE || 'https://decicat.decicat.workers.dev').replace(/\/$/, '');
const GAME = opt.game || ROOT + '/dist/decicat.html';
const keyFile = opt['key-file'] || ROOT + '/.admin_key';
const key = () => { if (process.env.ADMIN_KEY) return process.env.ADMIN_KEY.trim(); let k = readFileSync(keyFile, 'utf8').trim(); const m = k.match(/^ADMIN_KEY=(.*)$/m); return m ? m[1].trim() : k; };
async function admin(path) {
  const r = await fetch(BASE + path, { headers: { 'x-admin-key': key() } });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${j && j.error || ''}`);
  return j;
}
const sha = s => createHash('sha256').update(s).digest('hex');
const when = t => new Date(t).toLocaleString('en-CA', { timeZone: 'America/Toronto', hour12: false }) + ' ET';
const target = s => /^\d{1,3}$/.test(s) ? `rank=${s}` : `id=${encodeURIComponent(s)}`;
let browser = null, page = null;
async function sim(rp) {
  if (!page) {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: process.env.CHROME || CHROME });
    page = await (await browser.newContext({ viewport: { width: 480, height: 480 } })).newPage();
    await page.goto('file://' + GAME + '?nogate'); await page.waitForFunction(() => window.__decicat && __decicat.simulate);
  }
  const ver = await page.evaluate(() => __decicat.version);
  const t0 = Date.now(), out = await page.evaluate(r => __decicat.simulate(r), rp);
  return Object.assign(out, { simVersion: ver, ms: Date.now() - t0 });
}
function report(e, out) {
  const okScore = out.score === e.score, okFrames = !e.replay || !e.replay.f || out.frames === e.replay.f;
  console.log(`  claimed   ${e.score}   run ${(e.runMs / 1000).toFixed(1)} s`);
  console.log(`  computed  ${out.score}   run ${(out.runMs / 1000).toFixed(1)} s, ${out.frames} frames, reached zone ${out.zone}, death: ${out.death}  (sim ${out.ms} ms, game ${out.simVersion}${e.replay && e.replay.v && e.replay.v !== out.simVersion ? ' != replay ' + e.replay.v + ' - VERSION MISMATCH' : ''})`);
  if (e.replay && e.replay.dbg) console.log('  NOTE: recorded with debug flags (bot/god/zt/seed) - not a real run');
  const verdict = okScore && okFrames ? 'VERIFIED' : 'MISMATCH';
  console.log('  => ' + verdict);
  return verdict === 'VERIFIED';
}
const cmd = pos[0];
let code = 0;
try {
  if (cmd === 'list') {
    const j = await admin('/api/admin/entries?n=' + (opt.n || 50));
    console.log(`top ${j.entries.length} of ${j.total} ranked (${BASE})`);
    for (const e of j.entries) console.log(`${String(e.rank).padStart(3)}. ${e.name.padEnd(16)} ${String(e.score).padStart(7)}  ${(e.runMs / 1000).toFixed(0).padStart(4)}s  ${when(e.at)}  ${e.unverified ? 'UNVERIFIED (no replay, pre-v4)' : e.hasReplay ? 'replay' : 'replay dropped'}${e.claimHash ? '  claim-code' : ''}  ${e.id}`);
  } else if (cmd === 'entry' || cmd === 'all') {
    const list = cmd === 'entry' ? [await admin('/api/admin/entry?' + target(pos[1]))] : await Promise.all((await admin('/api/admin/entries?n=' + (opt.n || 20))).entries.map(e => admin('/api/admin/entry?id=' + e.id)));
    for (const e of list) {
      console.log(`#${e.rank} ${e.name} (${e.id}, ${when(e.at)}, client ${e.ver || '?'})`);
      if (!e.replay) { console.log('  ' + (e.unverified ? 'UNVERIFIED: submitted without a replay (older client)' : 'no replay stored (it left the top 50)')); if (cmd === 'entry') code = 2; continue; }
      if (!report(e, await sim(e.replay))) code = 1;
    }
  } else if (cmd === 'claim') {
    const c = String(pos[1] || '').toUpperCase().trim(), h = sha(c);
    if (!/^DCAT-[2-9A-Z]{4}-[2-9A-Z]{2}$/.test(c)) console.log('warning: code does not look like DCAT-XXXX-XX');
    const cands = pos[2] ? [await admin('/api/admin/entry?' + target(pos[2]))] : (await admin('/api/admin/entries?n=50')).entries;
    const hit = cands.find(e => e.claimHash === h);
    if (hit) console.log(`MATCH: ${c} belongs to #${hit.rank} ${hit.name} - ${hit.score} pts (${hit.id}, ${when(hit.at)}). Now run: node verify.mjs entry ${hit.id}`);
    else { console.log(`NO MATCH for ${c}` + (pos[2] ? ' on that entry' : ' in the top 50')); code = 1; }
  } else if (cmd === 'file') {
    const rp = JSON.parse(readFileSync(pos[1], 'utf8')), r = rp.replay || rp;
    const e = { score: pos[2] !== undefined ? +pos[2] : (rp.score ?? NaN), runMs: rp.runMs || 0, replay: r };
    if (!report(e, await sim(r))) code = 1;
  } else { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 10).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); }
} catch (e) { console.error('error: ' + e.message); code = 3; }
if (browser) await browser.close();
process.exit(code);
