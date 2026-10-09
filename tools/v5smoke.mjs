import { chromium } from 'playwright-core';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // repo root
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL0 = 'file://' + ROOT + '/dist/decicat.html';
const b = await chromium.launch({ executablePath: CHROME });
const errs = [];
const ctx = await b.newContext({ viewport: { width: 854, height: 480 } }); const p = await ctx.newPage();
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + e.stack));
const Z = process.env.Z || 8, ZT = process.env.ZT || 12;
await p.goto(URL0 + `?manual&nogate&bot&god&seed=${process.env.SEED || 5}&zt=${ZT}&zone=${Z}`); await p.waitForTimeout(300);
await p.evaluate(() => __decicat.start());
let last = '';
for (let i = 0; i < 400; i++) {
  await p.evaluate(() => __decicat.advance(30));
  const s = await p.evaluate(() => ({ st: __decicat.state, z: __decicat.zone, sc: __decicat.score, v5: __decicat.v5, death: __decicat.death }));
  const k = s.st + ' z' + s.z + ' boss ' + JSON.stringify(s.v5.boss) + ' sh ' + s.v5.shadows + ' pad ' + s.v5.launchPad;
  if (k !== last && (i % 5 === 0 || s.st !== 'play')) { console.log(i, k, s.sc, s.death); last = k; }
  if (s.st === 'play' && s.z >= 12 && i > 50) break;
  if (s.st === 'over') break;
}
console.log('errors', errs.length, errs.slice(0, 5));
await b.close();
