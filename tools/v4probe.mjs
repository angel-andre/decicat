// quick sim probe: bot survival per new zone (fast, manual stepping) + periodic screenshots
import { chromium } from 'playwright-core';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // repo root
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL0 = 'file://' + ROOT + '/dist/decicat.html';
const b = await chromium.launch({ executablePath: CHROME });
const zones = (process.env.ZONES || '5,6,7').split(',').map(Number), seeds = +(process.env.SEEDS || 6), shots = process.env.SHOTS;
for (const z of zones) {
  const res = [];
  for (let sd = 1; sd <= seeds; sd++) {
    const p = await (await b.newContext({ viewport: { width: 854, height: 480 } })).newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(URL0 + `?nogate&manual&bot&zone=${z}&seed=${sd * 7}`); await p.waitForTimeout(200);
    await p.evaluate(() => __decicat.start());
    let t = 0;
    for (; t < 46 * 60; t += 30) {
      await p.evaluate(() => __decicat.advance(30));
      if (shots && sd === +(process.env.SD || 1) && t % +(process.env.EVERY || 300) === 0) await p.screenshot({ path: `/tmp/v4/probe_z${z}_${t}.png` });
      if (await p.evaluate(() => __decicat.state) !== 'play') break;
    }
    const r = await p.evaluate(() => ({ st: __decicat.state, death: __decicat.death, zone: __decicat.zone, score: __decicat.score }));
    res.push(`${r.st === 'play' ? 'ALIVE' : r.death}@${(t / 60).toFixed(0)}s`);
    if (errs.length) console.log('ERR', z, errs.slice(0, 3));
    await p.context().close();
  }
  console.log('zone', z, res.join(' '));
}
await b.close();
