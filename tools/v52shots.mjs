// v5.2 review shots: gate moon (desktop/480/phone), title (white CAT), first-run hint in play, sprite before/after + skins
import { chromium } from 'playwright-core';
const URL0 = 'file:///workspace/decicat/game/dist/decicat.html';
const T = '/tmp/v52/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const errs = [];
async function page(q, vp, url) { const ctx = await b.newContext({ viewport: vp || { width: 854, height: 480 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); await p.goto((url || URL0) + q); await p.waitForTimeout(250); return p; }
for (const [vp, n] of [[{ width: 854, height: 480 }, 'desk'], [{ width: 480, height: 480 }, '480'], [{ width: 390, height: 844 }, 'phone'], [{ width: 844, height: 390 }, 'land']]) {
  let p = await page('?manual', vp); await p.evaluate(() => __decicat.advance(40)); await p.screenshot({ path: T + 'gate_' + n + '.png' }); await p.context().close();
  p = await page('?manual&nogate', vp); await p.evaluate(() => __decicat.advance(130)); await p.screenshot({ path: T + 'title_' + n + '.png' }); await p.context().close();
  // first run: no hint flag yet -> start, show the hint ~1 s in
  p = await page('?manual&nogate&seed=4', vp);
  await p.evaluate(() => { localStorage.removeItem('decicat_hint_v1'); __decicat.advance(60); __decicat.start(); __decicat.advance(60); });
  await p.screenshot({ path: T + 'hint_' + n + '.png' });
  const after = await p.evaluate(() => { __decicat.advance(150); return localStorage.getItem('decicat_hint_v1'); });
  await p.screenshot({ path: T + 'hint_gone_' + n + '.png' });
  console.log(n, 'hint flag after first run:', after);
  await p.context().close();
}
// second run on the same profile: no hint
{ const ctx = await b.newContext({ viewport: { width: 854, height: 480 } }); const p = await ctx.newPage(); await p.goto(URL0 + '?manual&nogate&seed=4');
  await p.evaluate(() => { localStorage.removeItem('decicat_hint_v1'); __decicat.start(); __decicat.advance(60); }); await p.screenshot({ path: T + 'run1.png' });
  await p.reload(); await p.evaluate(() => { __decicat.start(); __decicat.advance(60); }); await p.screenshot({ path: T + 'run2.png' }); await ctx.close(); }
// sprite frames for every skin, before (v5.1 build) vs after, native pixels
async function frames(url, file) {
  const p = await page('?manual&nogate', { width: 600, height: 400 }, url);
  const data = await p.evaluate(() => {
    const skins = ['classic', 'night', 'gold', 'hoodie', 'laser', 'astro'], fr = ['idle', 'idle2', 'run1', 'run3', 'jump', 'dead'];
    const c = document.createElement('canvas'); c.width = fr.length * 42; c.height = skins.length * 50; const g = c.getContext('2d');
    g.fillStyle = '#2a1d4a'; g.fillRect(0, 0, c.width, c.height);
    skins.forEach((s, j) => { const F = __decicat.skin(s); fr.forEach((f, i) => g.drawImage(F[f], i * 42 + 2, j * 50 + 2)); });
    return c.toDataURL();
  });
  const fs = await import('fs'); fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64')); await p.context().close();
}
await frames('file:///tmp/decicat_before.html', T + 'frames_before.png');
await frames(URL0, T + 'frames_after.png');
console.log('errors', errs);
await b.close();
