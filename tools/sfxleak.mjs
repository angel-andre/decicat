// SFX graph-leak probe: fire N jingles that use reverb/delay sends (coin, power, trophy...), force GC, compare renderer memory.
// node sfxleak.mjs <file> <label> [n=3000]
import { chromium } from 'playwright-core';
const [file, label, N = 3000] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false, args: ['--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'] });
const p = await b.newPage({ viewport: { width: 900, height: 500 } });
const bc = await b.newBrowserCDPSession();
await p.goto('file://' + file + '?manual&nogate'); await p.mouse.click(450, 250); await p.waitForTimeout(800);
console.log(label, 'audio', JSON.stringify(await p.evaluate(() => { const A = DECICAT.Audio; return { st: A.ctx && A.ctx.state, t: A.ctx && A.ctx.currentTime, tag: String(A._tag && A._tag.tagName || A._tag) }; })));
let lastParts = {};
const hx = s => parseInt(s, 16);
async function dump() {
  const chunks = []; bc.on('Tracing.dataCollected', e => chunks.push(...e.value)); const done = new Promise(r => bc.once('Tracing.tracingComplete', r));
  await bc.send('Tracing.start', { traceConfig: { includedCategories: ['disabled-by-default-memory-infra'], excludedCategories: ['*'], memoryDumpConfig: { triggers: [] } }, transferMode: 'ReportEvents' });
  await new Promise(r => setTimeout(r, 300)); await bc.send('Tracing.requestMemoryDump', { levelOfDetail: 'detailed' }); await bc.send('Tracing.end'); await done; bc.removeAllListeners('Tracing.dataCollected');
  const names = {}; for (const e of chunks) if (e.ph === 'M' && e.name === 'process_name') names[e.pid] = e.args.name;
  let best = null; lastParts = {};
  for (const e of chunks) { if (e.ph !== 'v' || !e.args || !e.args.dumps || names[e.pid] !== 'Renderer') continue; const A = e.args.dumps.allocators || {}; const g = k => A[k] && A[k].attrs.size ? hx(A[k].attrs.size.value) / 1048576 : 0; const o = { malloc: g('malloc'), pa: g('partition_alloc'), blinkgc: g('blink_gc'), v8: g('v8') }; o.sum = o.malloc + o.pa + o.blinkgc + o.v8; if (!best || o.sum > best.sum) { best = o; lastParts = {}; for (const k in A) if (/^partition_alloc\/partitions\/[a-z_]+$/.test(k) && A[k].attrs.size) lastParts[k.split('/').pop()] = +(hx(A[k].attrs.size.value) / 1048576).toFixed(1); } }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, +v.toFixed(1)]));
}
await p.evaluate(() => { DECICAT.Audio.music(null); gc(); }); await p.waitForTimeout(1500); await p.evaluate(() => gc());
const m0 = await dump();
const t0 = Date.now(); const rounds = [];
for (let round = 0; round < 3; round++) {
const names = ['coin', 'coin', 'coin', 'trophy', 'power', 'pw_dia', 'best', 'top10', 'go', 'growl', 'roar', 'jump', 'djump', 'land'];
for (let i = 0; i < +N; i += 50) { await p.evaluate(([i, names]) => { for (let k = 0; k < 50; k++) DECICAT.Audio.sfx(names[(i + k) % names.length]); }, [i, names]); await p.waitForTimeout(400); }
const busy = await p.evaluate(async () => { const A = DECICAT.Audio.ctx; const t = A.currentTime; await new Promise(r => setTimeout(r, 2000)); return +(A.currentTime - t).toFixed(2); });
await p.waitForTimeout(4000); for (let i = 0; i < 3; i++) { await p.evaluate(() => gc()); await p.waitForTimeout(700); }
rounds.push(await dump()); console.log(label, 'round', round + 1, JSON.stringify(rounds[round]), 'pa parts', JSON.stringify(lastParts)); }
const m1 = rounds[rounds.length - 1];

console.log(label, 'fired', N, 'sfx in', ((Date.now() - t0) / 1000).toFixed(0), 's; audio clock advanced', busy, 's per 2 s wall');
console.log(label, 'renderer MB before', JSON.stringify(m0), '\n' + label, 'renderer MB after GC', JSON.stringify(m1), '\n' + label, 'delta sum', (m1.sum - m0.sum).toFixed(1), 'MB');
await b.close();
