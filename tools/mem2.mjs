// memory soak at large sizes. node mem2.mjs <url> <secs> <label> <vw> <vh> <dpr> [resize=0|1] [fs=0|1]
// url containing /play is driven through the iframe (manual taps); otherwise ?bot&god is expected in the url.
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';
import fs from 'fs';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // repo root
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const [url, secs = 120, label = 'run', vw = 1280, vh = 800, dpr = 2, doResize = '0', doFs = '0'] = process.argv.slice(2);
const TAG = 'memtag' + process.pid;
const b = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--' + TAG, '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', `--window-size=${+vw + 20},${+vh + 140}`] });
const ctx = await b.newContext({ viewport: { width: +vw, height: +vh }, deviceScaleFactor: +dpr });
await ctx.addInitScript(() => {
  const st = window.__memStats = { aCreated: 0, aLive: 0, cvCreated: 0 };
  const fr = new FinalizationRegistry(() => { st.aLive--; });
  const P = (window.BaseAudioContext || window.AudioContext).prototype;
  for (const k of Object.getOwnPropertyNames(P)) {
    if (!/^create/.test(k) || k === 'createBuffer' || k === 'createPeriodicWave') continue;
    const f = P[k]; if (typeof f !== 'function') continue;
    P[k] = function (...a) { const n = f.apply(this, a); st.aCreated++; st.aLive++; fr.register(n, 1); return n; };
  }
  const AC = window.AudioContext; let acs = 0; window.AudioContext = function (...a) { acs++; st.audioContexts = acs; return new AC(...a); }; window.AudioContext.prototype = AC.prototype;
  const refs = []; const ce = Document.prototype.createElement;
  Document.prototype.createElement = function (t, ...r) { const e = ce.call(this, t, ...r); if (String(t).toLowerCase() === 'canvas') { st.cvCreated++; refs.push(new WeakRef(e)); } return e; };
  st.canvasArea = () => { let n = 0, a = 0, big = 0; for (const r of refs) { const c = r.deref(); if (c) { n++; a += c.width * c.height; big = Math.max(big, c.width * c.height); } } const m = document.getElementById('c'); return { n, mpx: +(a / 1e6).toFixed(2), bigK: Math.round(big / 1000), main: m ? m.width + 'x' + m.height : '-' }; };
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const cdp = await ctx.newCDPSession(p);
await cdp.send('Performance.enable');
const isPlay = url.includes('/play');
await p.goto(url); await p.waitForTimeout(2500);
const F = () => isPlay ? p.frames().find(f => f.url().includes('/embed')) : p.mainFrame();
await p.mouse.click(+vw / 2, +vh / 2); await p.waitForTimeout(900);
await p.mouse.click(+vw / 2, +vh * 0.8); await p.waitForTimeout(500);
if (doFs === '1') { await F().evaluate(() => document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => { })); }
function rss() {
  const lines = execSync('ps -eo pid,ppid,rss,args --no-headers').toString().trim().split('\n').map(l => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l)).filter(Boolean).map(m => ({ pid: +m[1], ppid: +m[2], kb: +m[3], a: m[4] }));
  const root = lines.find(x => x.a.includes('--' + TAG) && !/--type=/.test(x.a)); if (!root) return {};
  const set = new Set([root.pid]); let grew = true; while (grew) { grew = false; for (const x of lines) if (!set.has(x.pid) && set.has(x.ppid)) { set.add(x.pid); grew = true; } }
  let r = 0, rn = 0, g = 0, all = 0;
  for (const x of lines) { if (!set.has(x.pid)) continue; all += x.kb; if (/--type=renderer/.test(x.a) && !/extension/.test(x.a)) { r += x.kb; rn++; } if (/--type=gpu-process/.test(x.a)) g += x.kb; }
  return { r: Math.round(r / 1024), rn, g: Math.round(g / 1024), all: Math.round(all / 1024) };
}
const hdr = 't  state zone heapMB renderersRSS(n) gpuRSS totalRSS audioCtx audioCreated canvasLive canvasMpx biggestKpx mainCanvas';
const rows = []; const t0 = Date.now(); let tick = 0;
const sizes = [[+vw, +vh], [Math.round(vw * 0.6), Math.round(vh * 0.7)], [+vw, Math.round(vh * 0.5)], [Math.round(vw * 0.8), +vh]];
console.log(label + '\n' + hdr);
while ((Date.now() - t0) / 1000 < +secs + 1) {
  const f = F();
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  let s = { st: '?', z: 0, ms: {} };
  try { s = await f.evaluate(() => ({ st: __decicat.state, z: __decicat.zone, ms: window.__memStats, ca: window.__memStats.canvasArea(), heap: performance.memory ? performance.memory.usedJSHeapSize : 0 })); } catch (e) { }
  if (isPlay) { if (s.st === 'over' || s.st === 'title') await p.mouse.click(+vw / 2, +vh * 0.8); }
  const R = rss();
  const heap = isPlay ? (s.heap / 1048576) : (m.JSHeapUsedSize / 1048576);
  const row = [Math.round((Date.now() - t0) / 1000), s.st, s.z, heap.toFixed(1), R.r + '(' + R.rn + ')', R.g, R.all, s.ms.audioContexts || 0, s.ms.aCreated, s.ca && s.ca.n, s.ca && s.ca.mpx, s.ca && s.ca.bigK, s.ca && s.ca.main];
  rows.push(row); console.log(row.join('  '));
  // taps for manual play (/play): jump a few times per tick
  for (let i = 0; i < 20; i++) { if (isPlay) { await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up(); await p.waitForTimeout(420); } else await p.waitForTimeout(500); }
  tick++;
  if (doResize === '1') { const [w, h] = sizes[tick % sizes.length]; await p.setViewportSize({ width: w, height: h }); }
}
console.log('errors:', errs.slice(0, 5));
fs.writeFileSync(`/tmp/mem2_${label}.txt`, label + '\n' + hdr + '\n' + rows.map(r => r.join('  ')).join('\n') + '\n');
await b.close();
