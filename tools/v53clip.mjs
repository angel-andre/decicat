// v5.3 game-feel clip: portrait phone (390x844) and landscape (854x480) bot runs captured at 30 fps,
// advancing like the real loop (advanceReal: hit-stop freezes the sim), composited side by side.
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
const HTML = process.env.HTML || '/workspace/decicat/game/dist/decicat.html';
const SECS = +(process.env.SECS || 13), Q = process.env.Q || 'zt=5';
const runs = [{ name: 'port', w: 390, h: 844, seed: +(process.env.SP || 7) }, { name: 'land', w: 854, h: 480, seed: +(process.env.SL || 3) }];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const errs = [];
for (const r of runs) {
  const D = `/tmp/v53f_${r.name}`; rmSync(D, { recursive: true, force: true }); mkdirSync(D);
  const p = await b.newPage({ viewport: { width: r.w, height: r.h } });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`file://${HTML}?manual&bot&god&seed=${r.seed}&${Q}`);
  await p.evaluate(() => __decicat.leaveGate());
  await p.evaluate(() => __decicat.advance(20));
  await p.evaluate(() => __decicat.start());
  let f = 0, ev = { stop: 0, flash: 0, maxVfx: 0 }, lastStop = 0;
  for (; f < SECS * 30; f++) {
    await p.evaluate(() => __decicat.advanceReal(2));
    const j = await p.evaluate(() => Object.assign(__decicat.juice, { st: __decicat.state }));
    if (j.hitStop > 0 && lastStop <= 0) ev.stop++; lastStop = j.hitStop; if (j.flashT > 0.18) ev.flash++; ev.maxVfx = Math.max(ev.maxVfx, j.vfx);
    await p.screenshot({ path: `${D}/f${String(f).padStart(5, '0')}.png` });
    if (j.st === 'over') break;
  }
  r.frames = f; console.log(r.name, 'frames', f, JSON.stringify(ev), await p.evaluate(() => [__decicat.state, __decicat.zone]));
  await p.close();
}
await b.close();
const n = Math.min(...runs.map(r => r.frames));
execSync(`ffmpeg -y -loglevel error -framerate 30 -i /tmp/v53f_port/f%05d.png -framerate 30 -i /tmp/v53f_land/f%05d.png -frames:v ${n} -filter_complex "[0]scale=-2:720:flags=neighbor[a];[1]scale=946:-2:flags=neighbor,pad=946:720:0:(oh-ih)/2:color=0x0b0716[b];[a][b]hstack" -c:v libx264 -pix_fmt yuv420p -crf 20 /workspace/decicat/shots/v53_feel.mp4`);
console.log(execSync('ffprobe -v error -show_entries format=duration:stream=width,height -of csv=p=0 /workspace/decicat/shots/v53_feel.mp4').toString(), 'errors', errs);
