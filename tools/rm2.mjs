import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // repo root
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const OUT = process.env.OUT || ROOT + '/shots/music/';
mkdirSync(OUT, { recursive: true }); mkdirSync('/tmp/wav', { recursive: true });
const b = await chromium.launch({ executablePath: CHROME });
const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto((process.env.SRC || 'file://' + ROOT + '/index.html') + '?manual');
const tracks = (process.argv[2] || 'title,z1,z2,z3,z4,z5,boost,gameover,results,sfx').split(',');
const NAMES = { z9: 'z8_frontrun', z10: 'z9_bearking', z11: 'z10_launch', mm: 'moonmode', sfx5: 'v5_sfx' };
for (const tr of tracks) {
  const b64 = await p.evaluate(async (tr) => {
    const A = window.DECICAT.Audio;
    let ev, secs;
    if (tr === 'sfx') { // SFX showcase
      const list = ['jump', 'djump', 'land', 'coin', 'coin', 'stomp', 'growl', 'warn', 'impact', 'gust', 'power', 'boostEnd', 'zone', 'near', 'smash', 'death', 'click', 'confirm', 'best', 'top10'];
      ev = list.map((n, i) => ({ t: 0.3 + i * 1.1, k: 'sfx', name: n }));
      ev.push({ t: 26, k: 'amb', name: 'rain', level: 0.12 }, { t: 29, k: 'amb', name: 'rain', level: 0 }, { t: 29.5, k: 'amb', name: 'rocket', level: 0.12 }, { t: 32, k: 'amb', name: 'rocket', level: 0 });
      secs = 33;
    } else if (tr === 'sfx4') { // v4 stage + power-up SFX
      const list = ['whale', 'splash', 'pressWarn', 'slam', 'flipWarn', 'flip', 'pw_shield', 'shieldBreak', 'pw_mag', 'pw_slow', 'pw_dia', 'pwEnd'];
      ev = list.map((n, i) => ({ t: 0.3 + i * 1.2, k: 'sfx', name: n })); secs = 15.5;
    } else if (tr === 'sfx5') { // v5 stage SFX
      const list = ['ghostWarn', 'ghostPass', 'roar', 'throwC', 'shock', 'kingHit', 'kingDown', 'meteor', 'beep', 'go', 'liftoff', 'firework', 'touchdown', 'trophy'];
      ev = list.map((n, i) => ({ t: 0.3 + i * 1.2, k: 'sfx', name: n })); secs = 18;
    } else if (tr === 'ending') { // the rocket cutscene exactly as cued in game.js (12.6 s) then the YOU MADE IT screen music
      ev = [{ t: 0, k: 'music', name: 'z5' }, { t: 0.4, k: 'sfx', name: 'trophy' }];
      [1.5, 2.5, 3.5].forEach(t => ev.push({ t, k: 'sfx', name: 'beep' }));
      ev.push({ t: 4.5, k: 'sfx', name: 'go' }, { t: 4.5, k: 'sfx', name: 'liftoff' }, { t: 4.5, k: 'amb', name: 'rocket', level: 0.1 }, { t: 9, k: 'amb', name: 'rocket', level: 0.04 }, { t: 10.7, k: 'amb', name: 'rocket', level: 0 }, { t: 10.7, k: 'sfx', name: 'touchdown' }, { t: 11, k: 'sfx', name: 'zone' });
      [11.2, 11.6, 11.9, 12.2].forEach(t => ev.push({ t, k: 'sfx', name: 'firework' }));
      ev.push({ t: 12.6, k: 'music', name: 'results' }); secs = 21;
    } else if (tr === 'gameover') { ev = [{ t: 0, k: 'music', name: 'gameover', opt: { then: 'results' } }]; secs = 30; }
    else { ev = [{ t: 0, k: 'music', name: tr }]; const c = A.compile(tr); secs = Math.min(45, Math.max(30, c.len * 60 / c.bpm / 4 + (c.loop ? 0 : 0))); if (c.len * 60 / c.bpm / 4 < 30) secs = 30; }
    const buf = await A.renderOffline(ev, secs);
    const wav = new Uint8Array(A.toWav(buf));
    let s = ''; for (let i = 0; i < wav.length; i += 0x8000) s += String.fromCharCode.apply(null, wav.subarray(i, i + 0x8000));
    return btoa(s);
  }, tr);
  writeFileSync(`/tmp/wav/${tr}.wav`, Buffer.from(b64, 'base64'));
  execSync(`ffmpeg -y -loglevel error -i /tmp/wav/${tr}.wav -codec:a libmp3lame -b:a 160k ${OUT}${NAMES[tr] || tr}.mp3`);
  const st = execSync(`ffmpeg -hide_banner -nostats -i /tmp/wav/${tr}.wav -af ebur128=peak=true,astats=metadata=0 -f null - 2>&1 | grep -E "^\\s+(I:|Peak:|LRA:)|Peak level dB|RMS level dB" | head -8`).toString().replace(/\s+/g, ' ');
  console.log(tr, st);
}
console.log('errors', errs);
await b.close();
