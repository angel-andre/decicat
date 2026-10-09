// v5.2: score-code box on narrow phones + stage logo-moons on portrait phones
import { chromium } from 'playwright-core';
const URL0 = 'file:///workspace/decicat/game/dist/decicat.html';
const T = '/tmp/v52/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const errs = [];
async function page(q, vp, dpr = 1) { const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: dpr > 1, hasTouch: dpr > 1 }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(URL0 + q); await p.waitForTimeout(250); return p; }
for (const [vp, dpr, n] of [[{ width: 390, height: 844 }, 3, 'iphone'], [{ width: 390, height: 844 }, 1, '390x1'], [{ width: 320, height: 568 }, 2, 'se'], [{ width: 854, height: 480 }, 1, 'desk']]) {
  const p = await page('?manual&nogate&seed=4', vp, dpr);
  await p.evaluate(() => { localStorage.setItem('decicat_hint_v1', '1'); __decicat.start(); __decicat.advance(200); __decicat.kill(); __decicat.advance(30); const R = __decicat.result; R.claim = 'DCAT-7K2Q-XM'; R.rank = 3; R.claimShow = true; R.claimT = 2; __decicat.advance(50); });
  await p.screenshot({ path: T + 'claim_' + n + '.png' });
  console.log(n, await p.evaluate(() => __decicat.size));
  await p.context().close();
}
// stage moons on a portrait phone, early and late in each stage (drift)
for (const z of [1, 3, 4, 6, 7, 8, 9, 11]) {
  const p = await page(`?manual&nogate&god&bot&seed=5&zone=${z}&zt=60`, { width: 390, height: 844 }, 3);
  await p.evaluate(() => { localStorage.setItem('decicat_hint_v1', '1'); __decicat.start(); __decicat.advance(240); });
  await p.screenshot({ path: T + `moon_z${z}_a.png` });
  await p.evaluate(() => __decicat.advance(60 * 30));
  await p.screenshot({ path: T + `moon_z${z}_b.png` });
  await p.context().close();
}
console.log('errors', errs); await b.close();
