import { chromium } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // repo root
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const D = '/tmp/vframes4'; rmSync(D, { recursive: true, force: true }); mkdirSync(D);
const SEED = process.argv[2] || 2;
const b = await chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 854, height: 480 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(`file://${ROOT}/dist/decicat.html?manual&record&bot&god&seed=${SEED}&zt=9&zone=5`);
let f = 0; const snap = async () => { await p.screenshot({ path: `${D}/f${String(f++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 }); };
for (let i = 0; i < 30; i++) { await p.evaluate(() => __decicat.advance(2)); await snap(); }
await p.evaluate(() => __decicat.leaveGate());
for (let i = 0; i < 45; i++) { await p.evaluate(() => __decicat.advance(2)); await snap(); }
await p.evaluate(() => __decicat.start());
let boosted = false;
for (let i = 0; i < 820; i++) {
  if (i === 200) await p.evaluate(() => __decicat.pw('mag'));
  if (i === 430) await p.evaluate(() => __decicat.pw('shield'));
  if (i === 640) await p.evaluate(() => __decicat.pw('slow'));
  await p.evaluate(() => __decicat.advance(2));
  if (i % 15 === 0 && await p.evaluate(() => __decicat.boost > 0)) boosted = true;
  await snap();
}
const secs = f / 30; writeFileSync('/tmp/v4rec.json', JSON.stringify(await p.evaluate(() => __decicat.rec)));
const info = await p.evaluate(() => ({ st: __decicat.state, z: __decicat.zone, n: __decicat.rec.length, kinds: [...new Set(__decicat.rec.map(e => e.name || e.k))] }));
console.log('frames', f, 'secs', secs, JSON.stringify(info));
const b64 = await p.evaluate(async (secs) => {
  const A = window.DECICAT.Audio;
  const ev = __decicat.rec.slice();
  const buf = await A.renderOffline(ev, secs + 0.5);
  const wav = new Uint8Array(A.toWav(buf)); let s = '';
  for (let i = 0; i < wav.length; i += 0x8000) s += String.fromCharCode.apply(null, wav.subarray(i, i + 0x8000));
  return btoa(s);
}, secs);
writeFileSync('/tmp/v4audio.wav', Buffer.from(b64, 'base64'));
await b.close();
execSync(`ffmpeg -y -loglevel error -framerate 30 -i ${D}/f%05d.jpg -i /tmp/v4audio.wav -vf scale=854:480:flags=neighbor -c:v libx264 -pix_fmt yuv420p -crf 20 -c:a aac -b:a 160k -shortest <repo>/shots/v4_gameplay.mp4`);
console.log(execSync('ls -la ' + ROOT + '/shots/v4_gameplay.mp4').toString(), 'errors', errs);
