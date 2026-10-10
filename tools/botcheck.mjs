#!/usr/bin/env node
// DECICAT bot-pattern check (OFFLINE admin tool, read-only). Flags runs that look scripted for HUMAN review; never bans anything.
//   node botcheck.mjs top     [--n 20] [--json out.json]   fetch top entries (read-only admin GET), re-simulate, score 0-100
//   node botcheck.mjs entry   <rank|id>                    one leaderboard entry, with full reasons
//   node botcheck.mjs file    <replay.json ...>            replays saved on disk ({replay:{...}} or a bare replay)
//   node botcheck.mjs genbot  [--seeds 1-10] [--out dir]
//                                                          make calibration runs with the game's own ?bot autoplay (the trailer bot);
//                                                          also writes "humanised" bot runs (random reaction delay, hold length, stray taps)
//   node botcheck.mjs calibrate [--human top20.json] [--bots dir]   score both sets and print the separation
//   node botcheck.mjs video   <rank|id|replay.json> [--from 0] [--secs 40] [--out file.mp4]
//                                                          render the replay to an mp4 with an input overlay (press bar + flags) for review
// Options: --base, --key-file, --game (same as verify.mjs). Nothing here writes to the server: only GET /api/admin/entries and /api/admin/entry.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
const argv = process.argv.slice(2), opt = {}, pos = [];
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i]; else pos.push(argv[i]); }
const BASE = (opt.base || process.env.DECICAT_BASE || 'https://decicat.bitcade.xyz').replace(/\/$/, '');
const GAME = opt.game || '/workspace/decicat/game/dist/decicat.html';
const DATA = '/workspace/decicat/botcheck_data';
const keyFile = opt['key-file'] || '/workspace/decicat/.admin_key';
const key = () => { if (process.env.ADMIN_KEY) return process.env.ADMIN_KEY.trim(); const k = readFileSync(keyFile, 'utf8').trim(); const m = k.match(/^ADMIN_KEY=(.*)$/m); return m ? m[1].trim() : k; };
async function get(path) { // read-only
  const r = await fetch(BASE + path, { headers: { 'x-admin-key': key() } }); const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${j && j.error || ''}`); return j;
}
const target = s => /^\d{1,3}$/.test(s) ? `rank=${s}` : `id=${encodeURIComponent(s)}`;

// ---- instrumented OFFLINE copy of the build: adds a per-frame probe + a stepping replay player. The real game is untouched.
const PROBE = `
  window.__bcLog = null;
  function __bcProbe() {
    if (!window.__bcLog) return;
    const M2 = FM2(), uy = grav > 0 ? cat.y : M2 - cat.y; let hz = 9999;
    for (const pl of plats) { if (pl.k !== 'c' || !pl.red || !!pl.ceil !== (grav < 0)) continue; const top = grav > 0 ? pl.y : M2 - (pl.y + pl.h), dx = pl.x - cat.x; if (dx > -8 && top < uy && top + pl.h > uy - 40 && dx < hz) hz = dx; }
    for (const b of bears) if (!b.dead) { const dx = b.x - cat.x; if (dx > -8 && Math.abs(b.y - cat.y) < 20 && dx < hz) hz = dx; }
    let gap = 9999; for (let x = 0; x < 260; x += 3) { if (!plats.some(pl => { const s = surfG(pl, cat.x + x, 4); return s !== null && Math.abs(s - uy) < 18; })) { gap = x; break; } }
    window.__bcLog[simFrame] = [cat.g ? 1 : 0, cat.air, Math.round(hz), gap, zp(zone).speed, Math.round(cat.vy * grav), cat.coy > 0 ? 1 : 0];
  }
  window.__bcBegin = function (rp) {
    ZONE_T = +rp.zt > 0 ? +rp.zt : ZONE_SECONDS; DBG.god = !!rp.__god; DBG.boost = false;
    replaying = { evs: decodeEv(rp.ev), ri: 0, rs: (rp.rs || []).slice().sort((a, b) => a[0] - b[0]), rsi: 0 };
    applyLogical(rp.w, rp.h); state = 'play'; stateT = 0; paused = false; pressing = false; runRec = null;
    resetRun(rp.seed, rp.z0 || 1); PH = physFor(rp.v);
  };
  window.__bcPack = () => packReplay();
  window.__bcStep = function (n, draw) {
    for (let i = 0; i < n; i++) { if (state === 'ending' || state === 'moonwin') { startMoonMode(); continue; } if (state !== 'play') break; update(FIX); }
    if (draw) render(); return { st: state, f: simFrame, score: score(), zone, pressing, t: runT };
  };
`;
function buildProbe() {
  let h = readFileSync(GAME, 'utf8');
  const a = "update(FIX); }\n    const out = { score: score()", b = 'function score() { return Math.floor(dist / 2) + bonus; }';
  if (!h.includes(a) || !h.includes(b)) throw new Error('build layout changed: cannot instrument ' + GAME);
  h = h.replace(a, "update(FIX); __bcProbe(); }\n    const out = { score: score()").replace(b, PROBE + '\n  ' + b);
  // calibration-only hooks: god-mode re-sim for long bot runs (rp.__god), and a "humanised" bot (random reaction delay, hold length, stray taps)
  h = h.replace('DBG.god = false; DBG.boost = false;', 'DBG.god = !!rp.__god; DBG.boost = false;')
    .replace('guard++ < max)', 'guard++ < max && !(rp.__god && simFrame >= rp.f))')
    .replace('if (DBG.bot && !replaying) bot(dt);', 'if (DBG.bot && !replaying) { if (window.__bcJit) { const J = window.__bcJit; if (botHold <= 0 && J.r() < J.stray) { press(); botHold = J.hold(); } else if (botHold > 0 || J.r() < J.react) bot(dt); } else bot(dt); }')
    .replace(/botHold = (0\.\d+)/g, (m, v) => `botHold = (window.__bcJit ? __bcJit.hold() : ${v})`);
  const p = '/tmp/decicat_botcheck.html'; writeFileSync(p, h); return p;
}
let browser = null, page = null;
async function openPage(vw = 480, vh = 480, q = 'nogate') {
  const { chromium } = await import('playwright-core');
  if (!browser) browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const pg = await (await browser.newContext({ viewport: { width: vw, height: vh } })).newPage();
  await pg.goto('file://' + buildProbe() + '?' + q); await pg.waitForFunction(() => window.__decicat && __decicat.simulate && window.__bcBegin);
  return pg;
}
async function resim(rp) {
  if (!page) page = await openPage();
  return page.evaluate(r => { window.__bcLog = []; const out = __decicat.simulate(r); const log = window.__bcLog; window.__bcLog = null; return { out, log }; }, rp);
}
const decodeEv = s => { const o = []; let f = 0, d = 1; if (s) for (const t of String(s).split('.')) { f += parseInt(t, 36) || 0; o.push([f, d]); d ^= 1; } return o; };

// ---- statistics
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN; };
const iqr = a => quant(a, 0.75) - quant(a, 0.25);
const modeShare = (a, w = 1) => { const c = {}; for (const x of a) c[x] = (c[x] || 0) + 1; let best = 0; for (const k in c) { let n = 0; for (let d = -w; d <= w; d++) n += c[+k + d] || 0; best = Math.max(best, n); } return best / (a.length || 1); };
const entropy = a => { const c = {}; for (const x of a) c[x] = (c[x] || 0) + 1; let h = 0; for (const k in c) { const p = c[k] / a.length; h -= p * Math.log2(p); } return h; };
// map a feature onto 0..1 "bot-ness": 0 at/below `human`, 1 at/beyond `bot` (works for either direction)
const ramp = (x, human, bot) => Number.isFinite(x) ? Math.max(0, Math.min(1, (x - human) / (bot - human))) : 0;

function features(rp, log) {
  const ev = decodeEv(rp.ev), presses = [], holds = [];
  for (let i = 0; i < ev.length; i++) if (ev[i][1] === 1) { presses.push(ev[i][0]); if (ev[i + 1]) holds.push(ev[i + 1][0] - ev[i][0]); }
  const gaps = presses.slice(1).map((f, i) => f - presses[i]);
  let ground = 0, dbl = 0, wasted = 0; const leadGap = [], leadHz = [];
  for (const f of presses) {
    const s = log[f] || log[f - 1]; if (!s) continue; const [g, air, hz, gap, sp, , coy] = s;
    if (g || coy) { ground++; // ground jump: how far ahead was the thing it was jumping for?
      const d = Math.min(hz, gap); if (d < 250) (hz <= gap ? leadHz : leadGap).push(d / sp * 1000); }
    else if (air > 0) dbl++; else wasted++;
  }
  // stretch analysis: longest run of presses with zero wasted taps is implicit; idle = longest stretch with no input at all
  const idle = gaps.length ? Math.max(...gaps) / 60 : 0;
  const leadAll = [...leadGap, ...leadHz];
  return {
    presses: presses.length, secs: (rp.f || 0) / 60,
    holdMed: quant(holds, 0.5), holdIQR: iqr(holds), holdMode: modeShare(holds, 1), holdEnt: entropy(holds), holdSd: sd(holds),
    gapEnt: entropy(gaps.map(g => Math.min(g, 120))),
    wastedPct: 100 * wasted / (presses.length || 1), dblPct: 100 * dbl / (presses.length || 1),
    leadMed: quant(leadAll, 0.5), leadIQR: iqr(leadAll), leadGapIQR: iqr(leadGap), leadHzIQR: iqr(leadHz), leadMin: quant(leadAll, 0.05), nLead: leadAll.length,
    idleMax: idle, ratePerMin: presses.length / ((rp.f || 1) / 3600),
  };
}
// weights and thresholds are calibrated on the live top-20 (human) vs built-in-bot runs: see `calibrate`
const CHECKS = [
  { k: 'holdMode', w: 25, h: 0.35, b: 0.85, say: x => `${(x * 100).toFixed(0)}% of presses are held for the same length (+-1 frame); people vary a lot` },
  { k: 'holdIQR', w: 10, h: 4, b: 0.5, say: x => `press durations barely vary (middle-50% spread ${x} frames)` },
  { k: 'leadGapIQR', w: 25, h: 115, b: 55, say: x => `jumps leave the ledge at an almost fixed distance before gaps (middle-50% spread only ${x.toFixed(0)} ms)` },
  { k: 'leadMed', w: 20, h: 140, b: 85, say: x => `jumps come later than people manage (median ${x.toFixed(0)} ms before the gap/hazard edge; humans 127-302 ms)` },
  { k: 'leadHzIQR', w: 10, h: 110, b: 30, say: x => `reaction to hazards is metronomic (jump-before-hazard spread ${x.toFixed(0)} ms)` },
  { k: 'wastedPct', w: 10, h: 4, b: 0.3, say: x => `almost no wasted/extra taps (${x.toFixed(1)}% of presses did nothing)` },
];
function judge(F) {
  let s = 0; const reasons = [];
  for (const c of CHECKS) {
    if (c.k.startsWith('lead') && F.nLead < 20) continue;
    const v = F[c.k], r = ramp(v, c.h, c.b); s += c.w * r;
    if (r >= 0.5) reasons.push(c.say(v));
  }
  if (F.secs > 240 && s >= 40) reasons.push(`kept that up for ${(F.secs / 60).toFixed(1)} minutes without a single longer break (${F.idleMax.toFixed(1)} s max between presses)`);
  s = Math.round(Math.min(100, s));
  if (!reasons.length) reasons.push('timing looks human: varied press lengths, uneven reaction times, some wasted taps');
  return { score: s, verdict: s >= 60 ? 'FLAG for review' : s >= 35 ? 'borderline' : 'looks human', reasons };
}
async function analyse(rp, claimed) {
  const { out, log } = await resim(rp); const F = features(rp, log), J = judge(F);
  return { ...J, F, sim: { score: out.score, zone: out.zone, death: out.death, match: claimed === undefined ? null : out.score === claimed } };
}
const fmtF = F => `holds med ${F.holdMed}f IQR ${F.holdIQR} same-length ${(F.holdMode * 100).toFixed(0)}% | lead med ${F.leadMed | 0}ms IQR gap ${F.leadGapIQR | 0}/hz ${F.leadHzIQR | 0} p5 ${F.leadMin | 0} | wasted ${F.wastedPct.toFixed(1)}% dbl ${F.dblPct.toFixed(0)}% | ${F.presses} presses ${F.secs.toFixed(0)}s`;
function show(label, a, verbose) {
  console.log(`${String(a.score).padStart(3)}/100 ${a.verdict.padEnd(15)} ${label}${a.sim.match === false ? '  (re-sim score MISMATCH ' + a.sim.score + ')' : ''}`);
  if (verbose) { for (const r of a.reasons) console.log('        - ' + r); console.log('        ' + fmtF(a.F)); }
}

async function genbot(seeds, jitter, dir) {
  mkdirSync(dir, { recursive: true });
  const pg = await openPage(480, 480, `manual&nogate&bot&seed=1`);
  const res = [];
  for (const s of seeds) {
    await pg.goto('file:///tmp/decicat_botcheck.html?manual&nogate&bot&god&seed=' + s);
    const rp = await pg.evaluate(async ({ jitter, s }) => {
      localStorage.setItem('decicat_hint_v1', '1'); const D = __decicat;
      if (jitter) { let x = s * 7919 + 13; const r = () => ((x = (x * 48271) % 2147483647) / 2147483647);
        // decide on ~1 frame in 6 (=> ~100 ms average extra reaction, geometric spread), hold 4-24 frames, ~1 stray tap / 8 s
        window.__bcJit = { r, react: 0.17, stray: 0.002, hold: () => (4 + r() * 20) / 60 }; }
      D.start(); let n = 0;
      while (n < 60 * 400 && D.state !== 'over' && D.stats.runT < 300) {
        if (D.state === 'ending' || D.state === 'moonwin') { D.press(); D.release(); }
        D.advance(30); n += 30;
      }
      return window.__bcPack() || D.replay;
    }, { jitter, s });
    if (!rp) continue;
    rp.dbg = 1; rp.__god = 1; writeFileSync(`${dir}/${jitter ? 'bothuman' : 'bot'}_s${s}.json`, JSON.stringify({ name: (jitter ? 'HUMANISED-BOT' : 'BOT') + ' seed ' + s, replay: rp }));
    res.push(s);
  }
  return res;
}
async function video(rp, info, o) {
  const from = +(o.from || 0), secs = +(o.secs || 40), outF = o.out || `/workspace/decicat/shots/botcheck_${(info.id || 'replay')}.mp4`;
  const D = '/tmp/bcframes'; rmSync(D, { recursive: true, force: true }); mkdirSync(D, { recursive: true });
  const pg = await openPage(540, 675, 'nogate&manual');
  await pg.evaluate(r => { localStorage.setItem('decicat_hint_v1', '1'); __bcBegin(r);
    const d = document.createElement('div'); d.id = 'bco'; d.style.cssText = 'position:fixed;left:0;top:0;right:0;font:bold 14px monospace;color:#fff;background:rgba(0,0,0,.6);padding:4px 8px;z-index:9;white-space:pre';
    document.body.appendChild(d); }, rp);
  const evs = decodeEv(rp.ev), pressAt = evs.filter(e => e[1] === 1).map(e => e[0]);
  await pg.evaluate(n => __bcStep(n, false), Math.round(from * 60));
  let f = 0;
  for (let i = 0; i < secs * 30; i++) {
    const s = await pg.evaluate(n => __bcStep(n, true), 2);
    const recent = pressAt.filter(p => p <= s.f && p > s.f - 120).map(p => s.f - p);
    const bar = Array.from({ length: 40 }, (_, k) => recent.some(r => (r / 3 | 0) === 39 - k) ? '|' : '.').join('');
    await pg.evaluate(t => { document.getElementById('bco').textContent = t; },
      `REVIEW ${info.label}  bot-likelihood ${info.score}/100\nt ${(s.f / 60).toFixed(1)}s  score ${s.score}  stage ${s.zone}  ${s.pressing ? '[HOLD]' : '      '}\ntaps(last 2s) ${bar}`);
    await pg.screenshot({ path: `${D}/f${String(f++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 88 });
    if (s.st !== 'play') break;
  }
  execSync(`ffmpeg -y -loglevel error -framerate 30 -i ${D}/f%05d.jpg -vf "scale=540:-2" -c:v libx264 -pix_fmt yuv420p -crf 22 ${outF}`);
  return outF;
}

const loadFile = p => { const j = JSON.parse(readFileSync(p, 'utf8')); return Array.isArray(j) ? j : [j]; };
const cmd = pos[0]; let code = 0;
try {
  if (cmd === 'top' || cmd === 'entry') {
    const list = cmd === 'entry' ? [await get('/api/admin/entry?' + target(pos[1]))] : await Promise.all((await get('/api/admin/entries?n=' + (opt.n || 20))).entries.map(e => get('/api/admin/entry?id=' + e.id)));
    const rows = [];
    for (const e of list) {
      const lbl = `#${e.rank} ${e.name} ${e.score} (${e.id})`;
      if (!e.replay) { console.log(`  -     no replay       ${lbl}`); continue; }
      const a = await analyse(e.replay, e.score); show(lbl, a, cmd === 'entry' || opt.v || a.score >= 35); rows.push({ rank: e.rank, name: e.name, id: e.id, claimed: e.score, ...a });
    }
    if (opt.json) writeFileSync(opt.json, JSON.stringify(rows, null, 1));
  } else if (cmd === 'file') {
    for (const p of pos.slice(1)) for (const e of loadFile(p)) { const rp = e.replay || e; const a = await analyse(rp, e.score); show(`${e.name || p}${e.score ? ' ' + e.score : ''}`, a, true); }
  } else if (cmd === 'genbot') {
    const [a, b] = String(opt.seeds || '1-12').split('-').map(Number), seeds = []; for (let s = a; s <= (b || a); s++) seeds.push(s);
    const dir = opt.out || DATA + '/bots'; const a1 = await genbot(seeds, 0, dir), a2 = await genbot(seeds, 1, dir);
    console.log(`wrote ${a1.length} built-in-bot + ${a2.length} humanised-bot replays (god mode, ~5 min each) to ${dir}`);
  } else if (cmd === 'calibrate') {
    const human = loadFile(opt.human || DATA + '/top20.json'), bdir = opt.bots || DATA + '/bots';
    const sets = { human: human.filter(e => e.replay), bot: [], 'humanised-bot': [] };
    for (const f of readdirSync(bdir).sort()) { const e = JSON.parse(readFileSync(`${bdir}/${f}`, 'utf8')); (f.startsWith('bothuman') ? sets['humanised-bot'] : sets.bot).push(e); }
    const summ = {};
    for (const [k, list] of Object.entries(sets)) {
      console.log(`\n== ${k} (${list.length})`); const sc = [];
      for (const e of list) { const a = await analyse(e.replay); sc.push(a.score); show(`${e.rank ? '#' + e.rank + ' ' : ''}${e.name} ${e.score || ''}`, a, opt.v); console.log('        ' + fmtF(a.F)); }
      summ[k] = { n: sc.length, min: Math.min(...sc), med: quant(sc, 0.5), max: Math.max(...sc), flagged: sc.filter(s => s >= 60).length };
    }
    console.log('\nsummary (score 0-100, flag >= 60):'); for (const [k, v] of Object.entries(summ)) console.log(`  ${k.padEnd(14)} n=${v.n} min ${v.min} median ${v.med} max ${v.max}  flagged ${v.flagged}/${v.n}`);
  } else if (cmd === 'video') {
    let rp, info;
    if (existsSync(pos[1] || '')) { const e = loadFile(pos[1])[0]; rp = e.replay || e; info = { label: e.name || pos[1], id: (e.name || 'file').replace(/\W+/g, '_') }; }
    else { const e = await get('/api/admin/entry?' + target(pos[1])); rp = e.replay; info = { label: `#${e.rank} ${e.name} ${e.score}`, id: e.id }; }
    info.score = (await analyse(rp)).score;
    console.log('wrote ' + await video(rp, info, opt));
  } else console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 12).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
} catch (e) { console.error('error: ' + e.stack); code = 3; }
if (browser) await browser.close();
process.exit(code);
