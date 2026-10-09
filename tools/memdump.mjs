// memory-infra breakdown per process (what Chrome's own memory dumps attribute: canvas/skia, cc, gpu, partition_alloc, v8, web audio, media...)
// node memdump.mjs <url> <secs> <label> [vw vh dpr] [gpu=0|1] [dumpEvery=30]
import { chromium } from 'playwright-core';
import fs from 'fs';
const [url, secs = 60, label = 'run', vw = 1440, vh = 900, dpr = 2, gpu = '0', every = 30] = process.argv.slice(2);
const args = ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'];
if (gpu === '1') args.push('--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: false, args: [...args, `--window-size=${+vw + 20},${+vh + 140}`] });
const ctx = await b.newContext({ viewport: { width: +vw, height: +vh }, deviceScaleFactor: +dpr });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const bc = await b.newBrowserCDPSession();
await p.goto(url); await p.waitForTimeout(2000);
await p.mouse.click(+vw / 2, +vh / 2); await p.waitForTimeout(900);
if (!/[?&]title/.test(url)) { await p.mouse.click(+vw / 2, +vh * 0.8); await p.waitForTimeout(500); }
const hx = s => parseInt(s, 16);
async function dump() {
  const chunks = [];
  bc.on('Tracing.dataCollected', e => chunks.push(...e.value));
  const done = new Promise(r => bc.once('Tracing.tracingComplete', r));
  await bc.send('Tracing.start', { traceConfig: { includedCategories: ['disabled-by-default-memory-infra'], excludedCategories: ['*'], memoryDumpConfig: { triggers: [] } }, transferMode: 'ReportEvents' });
  await new Promise(r => setTimeout(r, 300));
  const rr = await bc.send('Tracing.requestMemoryDump', { levelOfDetail: 'detailed' });
  await bc.send('Tracing.end'); await done; bc.removeAllListeners('Tracing.dataCollected');
  const names = {}; for (const e of chunks) if (e.ph === 'M' && e.name === 'process_name') names[e.pid] = e.args.name;
  const labels = {}; for (const e of chunks) if (e.ph === 'M' && e.name === 'process_labels') labels[e.pid] = e.args.labels;
  const out = {};
  for (const e of chunks) {
    if (e.ph !== 'v' || !e.args || !e.args.dumps) continue;
    const d = e.args.dumps, A = d.allocators || {}, pt = d.process_totals || {};
    const top = {};
    for (const k in A) { if (k.includes('/')) continue; const s = A[k].attrs && (A[k].attrs.effective_size || A[k].attrs.size); if (s) top[k] = +(hx(s.value) / 1048576).toFixed(1); }
    // a few useful sub-allocators
    for (const k in A) if (/^(canvas|skia\/sk_glyph|cc\/tile_memory|gpu\/gl|gpu\/shared_images|blink_gc|web_audio|media|partition_alloc\/partitions\/[a-z_]+$|malloc\/allocated_objects$|v8\/main\/heap$|v8\/main$|shared_memory$|discardable$|canvas\/ResourceProvider)/.test(k)) { const s = A[k].attrs && (A[k].attrs.effective_size || A[k].attrs.size); if (s) top[k] = +(hx(s.value) / 1048576).toFixed(1); }
    const pf = pt.private_footprint_bytes ? +(hx(pt.private_footprint_bytes) / 1048576).toFixed(1) : null;
    out[(names[e.pid] || e.pid) + (labels[e.pid] ? ' [' + labels[e.pid] + ']' : '') + ' #' + e.pid] = { footprintMB: pf, rssMB: pt.resident_set_bytes ? +(hx(pt.resident_set_bytes) / 1048576).toFixed(1) : null, top };
  }
  return { ok: rr.success, out };
}
const res = []; const t0 = Date.now();
let next = 0;
while (true) {
  const t = (Date.now() - t0) / 1000;
  if (t >= next) {
    let st = {}; try { st = await p.evaluate(() => ({ s: __decicat.state, z: __decicat.zone, heap: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), cnv: (() => { let n = 0, a = 0; return null; })() })); } catch (e) { }
    const d = await dump(); res.push({ t: Math.round(t), st, d }); console.log('t=' + Math.round(t), JSON.stringify(st));
    for (const [k, v] of Object.entries(d.out)) if (/Renderer|GPU/i.test(k)) console.log('  ', k, 'footprint', v.footprintMB, 'rss', v.rssMB, JSON.stringify(v.top));
    next += +every;
  }
  if (t > +secs) break;
  await p.waitForTimeout(1000);
}
fs.writeFileSync(`/tmp/memdump_${label}.json`, JSON.stringify(res, null, 1));
console.log('errors', errs.slice(0, 5));
await b.close();
