// v4 screenshots: new zones with their mechanics on screen, zones grid, power-ups sheet
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // repo root
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL0 = 'file://' + ROOT + '/dist/decicat.html';
const OUT = ROOT + '/shots/';
const b = await chromium.launch({ executablePath: CHROME });
const errs = [];
async function page(q, vp) { const ctx = await b.newContext({ viewport: vp || { width: 854, height: 480 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL0 + q); await p.waitForTimeout(250); return p; }
async function hunt(z, cond, file, seeds) {
  for (const seed of seeds) {
    const p = await page(`?manual&autostart&bot&god&seed=${seed}&zone=${z}`);
    for (let f = 0; f < 44 * 60; f += 2) {
      await p.evaluate(() => __decicat.advance(2));
      const s = await p.evaluate(() => __decicat.dbgStage);
      if (f > 240 && await p.evaluate(cond, s)) { await p.evaluate(() => __decicat.advance(1)); await p.screenshot({ path: OUT + file }); console.log('shot', file, 'seed', seed, 'frame', f); await p.context().close(); return true; }
    }
    await p.context().close();
  }
  console.log('NOT FOUND', file); return false;
}
await hunt(5, s => s.onWhale, 'v4_zone5.png', [3, 5, 8, 13]);
await hunt(6, s => s.inPress, 'v4_zone6.png', [3, 5, 8, 13]);
await hunt(7, s => s.grav < 0 && s.cat.g, 'v4_zone7.png', [3, 5, 8, 13]);
await hunt(7, s => s.flipWarn, 'v4_zone7_warning.png', [5, 8]);
// zones grid: all 7 stages + first loop zone
for (const z of [1, 2, 3, 4, 5, 6, 7, 8]) { const p = await page(`?manual&autostart&bot&god&seed=11&zone=${z}`); await p.evaluate(() => __decicat.advance(420)); await p.screenshot({ path: `/tmp/v4/grid_${z}.png` }); await p.context().close(); }
execSync(`cd /tmp/v4 && ffmpeg -y -loglevel error ${[1, 2, 3, 4, 5, 6, 7, 8].map(z => '-i grid_' + z + '.png').join(' ')} -filter_complex "[0][1][2][3]hstack=4[a];[4][5][6][7]hstack=4[b];[a][b]vstack,scale=iw/2:ih/2:flags=neighbor" ${OUT}v4_zones_grid.png`);
// power-ups: the four pickups in the world + each one active (HUD timer + effect)
{
  const frames = [];
  for (const [k, z] of [['shield', 1], ['mag', 5], ['slow', 6], ['dia', 7]]) {
    const p = await page(`?manual&autostart&bot&god&seed=9&zone=${z}`);
    await p.evaluate(() => __decicat.advance(300));
    await p.evaluate(k => { __decicat.pw(k); __decicat.advance(k === 'slow' ? 12 : 70); }, k);
    await p.screenshot({ path: `/tmp/v4/pw_${k}.png` }); frames.push(`/tmp/v4/pw_${k}.png`); await p.context().close();
  }
  // the four pickup tokens in the world (STOP-LOSS, MAGNET, LIMIT ORDER, DIAMOND PAWS)
  { const p = await page('?manual&autostart&bot&god&seed=9&zone=1'); await p.evaluate(() => { __decicat.advance(200); __decicat.showItems(); __decicat.advance(2); });
    const y = await p.evaluate(() => { const c = document.querySelector('canvas').getBoundingClientRect(); return Math.round(c.top + (__decicat.dbgStage.cat.y - 40) * c.height / __decicat.size[1]); });
    await p.screenshot({ path: '/tmp/v4/pw_tokens.png', clip: { x: 0, y: Math.min(340, Math.max(0, (y || 200) - 70)), width: 854, height: 140 } }); await p.context().close(); }
  execSync(`cd /tmp/v4 && ffmpeg -y -loglevel error ${frames.map(f => '-i ' + f).join(' ')} -i pw_tokens.png -filter_complex "[0][1]hstack[a];[2][3]hstack[b];[a][b]vstack,scale=iw/2:ih/2:flags=neighbor[g];[4][g]vstack" ${OUT}v4_powerups.png`);
}
console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
await b.close();
