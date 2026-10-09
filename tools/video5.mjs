// v5 gameplay video (~44 s, with the game's own audio rendered offline from the recorded audio events):
// stage 8 front-runners -> stage 9 Bear King -> stage 10 launch pad -> the full rocket cutscene -> YOU MADE IT -> Moon Mode
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // repo root
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const D = '/tmp/vframes5'; rmSync(D, { recursive: true, force: true }); mkdirSync(D);
const SEED = process.argv[2] || 3;
const b = await chromium.launch({ executablePath: CHROME });
const p = await b.newPage({ viewport: { width: 854, height: 480 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`file://${ROOT}/dist/decicat.html?manual&record&bot&god&seed=${SEED}&zt=9&zone=8`);
let f = 0; const snap = async () => { await p.screenshot({ path: `${D}/f${String(f++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 }); };
await p.evaluate(() => __decicat.leaveGate());
for (let i = 0; i < 30; i++) { await p.evaluate(() => __decicat.advance(2)); await snap(); }
await p.evaluate(() => __decicat.start());
let mwT = -1, mmT = -1;
for (let i = 0; i < 1500; i++) {
  await p.evaluate(() => __decicat.advance(2)); await snap();
  const st = await p.evaluate(() => __decicat.state);
  if (st === 'moonwin' && mwT < 0) mwT = i;
  if (st === 'moonwin' && i - mwT === 75) await p.evaluate(() => __decicat.press());
  if (st === 'play' && mwT >= 0 && mmT < 0) mmT = i;
  if (mmT >= 0 && i - mmT > 120) break;
  if (st === 'over' || st === 'dying') break;
}
const secs = f / 30;
const info = await p.evaluate(() => ({ st: __decicat.state, z: __decicat.zone, n: __decicat.rec.length, kinds: [...new Set(__decicat.rec.map(e => e.name || e.k))] }));
console.log('frames', f, 'secs', secs, JSON.stringify(info));
const b64 = await p.evaluate(async (secs) => {
  const A = window.DECICAT.Audio;
  const buf = await A.renderOffline(__decicat.rec.slice(), secs + 0.5);
  const wav = new Uint8Array(A.toWav(buf)); let s = '';
  for (let i = 0; i < wav.length; i += 0x8000) s += String.fromCharCode.apply(null, wav.subarray(i, i + 0x8000));
  return btoa(s);
}, secs);
writeFileSync('/tmp/v5audio.wav', Buffer.from(b64, 'base64'));
await b.close();
execSync(`ffmpeg -y -loglevel error -framerate 30 -i ${D}/f%05d.jpg -i /tmp/v5audio.wav -vf scale=854:480:flags=neighbor -c:v libx264 -pix_fmt yuv420p -crf 20 -c:a aac -b:a 160k -shortest <repo>/shots/v5_gameplay.mp4`);
console.log(execSync('ls -la ' + ROOT + '/shots/v5_gameplay.mp4').toString(), 'errors', errs);
