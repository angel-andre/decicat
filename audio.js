/* DECICAT audio: tiny WebAudio synth + step sequencer + original soundtrack + SFX.
 * All music is composed here as note data (original material) and synthesized live,
 * so the whole soundtrack costs a few KB. The same code renders offline previews.
 */
(function (D) {
  'use strict';
  const LSget = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const LSset = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

  // ---------------- music theory helpers ----------------
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function noteNum(s) { // "C#5" -> midi
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(s); if (!m) throw new Error('bad note ' + s);
    return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  const QUAL = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], '5': [0, 7] };
  function chord(sym) {
    const m = /^([A-G])([#b]?)(.*)$/.exec(sym);
    const root = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    return { root, iv: QUAL[m[3]] || QUAL[''] };
  }
  function parseMel(str) { // "C5/4 r/2 E5/2" (durations in 16ths)
    const out = []; let pos = 0;
    for (const tok of str.trim().split(/\s+/)) {
      const [n, d] = tok.split('/'); const dur = +d;
      if (n !== 'r') out.push([pos, noteNum(n), dur]);
      pos += dur;
    }
    return { notes: out, len: pos };
  }

  // ---------------- songs (original compositions) ----------------
  // section: { n: bars, ch: 'chords per bar', d: drum style, b: bass pattern, a: arp pattern, p: pad, l: melody, dbl: octave double, lo: lead octave shift }
  const DR = {
    four: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.' },
    fourB: { k: 'x...x...x...x.x.', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.', c: '....x.......x...' },
    light: { k: 'x.......x.......', s: '', h: '..x...x...x...x.', o: '' },
    pop: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '' },
    brk: { k: 'x.....x...x..x..', s: '....x..x.x..x..x', h: 'xxxxxxxxxxxxxxxx', o: '......x.......x.' },
    brkB: { k: 'x.x...x...x.....', s: '....x.......x.xx', h: 'xxxxxxxxxxxxxxxx', o: '..x.......x.....', c: '....x.......x...' },
    half: { k: 'x.........x.....', s: '........x.......', h: 'x.x.x.x.x.x.x.x.', o: '' },
    halfB: { k: 'x..x......x..x..', s: '........x.......', h: 'xxxxxxxxxxxxxxxx', o: '......x.......x.', c: '........x.......' },
    euro: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.', c: '....x.......x...' },
    none: { k: '', s: '', h: '', o: '' },
    hats: { k: '', s: '', h: 'x.x.x.x.x.x.x.x.', o: '' },
    kick: { k: 'x...x...x...x...', s: '', h: '..x...x...x...x.', o: '' }
  };
  const SONGS = {
    title: {
      bpm: 112, gain: 1.1, lead: 'square', bass: 'saw', arp: 'pulse',
      mel: {
        A: 'C5/2 F5/2 A5/4 G5/2 F5/2 C5/4 E5/2 F5/2 E5/2 C5/2 A4/8 D5/2 F5/2 Bb5/4 A5/2 G5/2 F5/4 G5/6 E5/2 C5/4 r/4 ' +
           'C5/2 F5/2 A5/4 G5/2 F5/2 C6/4 A5/4 G5/2 E5/2 C5/8 D5/2 F5/2 Bb5/2 D6/2 C6/4 Bb5/4 A5/2 G5/2 E5/4 C5/4 r/4',
        B: 'F5/6 E5/2 D5/4 A4/4 Bb4/4 D5/4 F5/8 A5/6 G5/2 F5/4 C5/4 E5/8 G5/8 ' +
           'F5/6 E5/2 D5/4 F5/4 Bb5/6 A5/2 G5/4 F5/4 G5/4 Bb5/4 D6/4 C6/4 C6/8 r/4 E5/2 G5/2'
      },
      sec: [
        { n: 4, ch: 'F Am Bb C', d: 'none', b: 'R.......R.......', a: '0.1.2.3.2.1.0.1.', p: 1 },
        { n: 8, ch: 'F Am Bb C F Am Bb C', d: 'pop', b: 'R..R..R.R..R.O..', a: '0.1.2.3.2.1.0.1.', p: 1, l: 'A' },
        { n: 8, ch: 'Dm Bb F C Dm Bb Gm C', d: 'pop', b: 'R.R.R.R.R.R.R.O.', a: '01230123', p: 1, l: 'B' },
        { n: 8, ch: 'F Am Bb C F Am Bb C', d: 'four', b: 'R..R..R.R..R.O..', a: '0123210123210123', p: 1, l: 'A', dbl: -12 }
      ], loop: 1
    },
    z1: { // Order Book: bouncy major, 130
      bpm: 130, gain: 1.0, lead: 'square', bass: 'saw', arp: 'pulse',
      mel: {
        A: 'G4/2 C5/2 E5/1 r/1 G5/2 r/2 E5/2 G5/2 A5/2 G5/3 D5/3 B4/2 D5/2 G5/2 F5/2 r/2 E5/2 A5/2 C6/1 r/1 A5/2 r/2 G5/2 E5/2 C5/2 D5/3 C5/3 A4/2 C5/4 r/4 ' +
           'G4/2 C5/2 E5/1 r/1 G5/2 r/2 E5/2 G5/2 A5/2 G5/3 D5/3 B4/2 D5/2 G5/2 B5/2 D6/2 C6/3 B5/3 A5/2 E5/2 A5/2 C6/2 B5/2 A5/4 G5/4 F5/2 E5/2 D5/2 C5/2',
        B: 'A5/4 r/2 A5/2 C6/4 A5/4 B5/4 r/2 B5/2 D6/4 B5/4 G5/4 r/2 G5/2 B5/4 G5/4 A5/6 G5/2 E5/8 ' +
           'F5/2 A5/2 C6/2 A5/2 F5/2 A5/2 C6/2 F6/2 D6/4 B5/4 G5/4 D6/4 E6/6 D6/2 C6/4 G5/4 B5/4 D6/4 G6/8'
      },
      sec: [
        { n: 4, ch: 'C G Am F', d: 'kick', b: 'R.R.R.R.R.R.R.R.', a: '0120', p: 1 },
        { n: 8, ch: 'C G Am F C G Am F', d: 'four', b: 'R.RO.RRO', a: '0120', p: 0, l: 'A' },
        { n: 8, ch: 'F G Em Am F G C G', d: 'fourB', b: 'R.R.R.R.R.R.R.O.', a: '01230123', p: 1, l: 'B' },
        { n: 8, ch: 'C G Am F C G Am F', d: 'fourB', b: 'R.RO.RRO', a: '0123210123210123', p: 1, l: 'A', dbl: 12 }
      ], loop: 1
    },
    z2: { // Funding Storm: driving minor, swirling arps, 138
      bpm: 138, gain: 1.0, lead: 'saw', bass: 'saw', arp: 'pulse',
      mel: {
        A: 'E5/4 A5/4 B5/2 C6/2 B5/2 A5/2 C6/6 B5/2 A5/4 F5/4 G5/4 C6/4 D6/2 E6/2 D6/2 C6/2 D6/6 B5/2 G5/8 ' +
           'E5/4 A5/4 B5/2 C6/2 E6/2 D6/2 C6/6 D6/2 C6/2 B5/2 A5/4 G5/2 A5/2 G5/2 E5/2 G5/4 C6/4 B5/8 G#5/8',
        B: 'D6/4 C6/4 A5/4 F5/4 A5/6 G5/2 F5/4 C6/4 B5/6 A5/2 G#5/4 E5/4 E6/12 r/4 ' +
           'C6/4 B5/4 A5/4 E5/4 F5/4 A5/4 C6/4 F6/4 E6/4 D6/4 B5/4 G5/4 G#5/4 B5/4 E6/8'
      },
      sec: [
        { n: 4, ch: 'Am F C G', d: 'hats', b: 'RRRRRRRRRRRRRRRR', a: '0123432101234321', p: 1 },
        { n: 8, ch: 'Am F C G Am F C E', d: 'four', b: 'R.ROR.RO', a: '0123432101234321', p: 0, l: 'A' },
        { n: 8, ch: 'Dm F E E Am F G E', d: 'fourB', b: 'RRRRRRRRRRRRRRRR', a: '0246420246420246', p: 1, l: 'B' },
        { n: 8, ch: 'Am F C G Am F C E', d: 'fourB', b: 'R.ROR.RO', a: '0123432101234321', p: 1, l: 'A', dbl: -12 }
      ], loop: 1
    },
    z3: { // Liquidation Rain: tense syncopated, 150
      bpm: 150, gain: 1.0, lead: 'square', bass: 'square', arp: 'pulse',
      mel: {
        A: 'D5/3 F5/3 A5/2 r/2 G5/2 F5/2 E5/2 D5/3 F5/3 A5/2 D6/4 C6/2 A5/2 Bb5/3 A5/3 F5/2 r/2 D5/2 F5/2 A5/2 C#6/3 A5/3 E5/2 C#5/4 E5/4 ' +
           'D5/3 F5/3 A5/2 r/2 G5/2 F5/2 E5/2 D5/3 F5/3 A5/2 F6/4 E6/2 D6/2 D6/3 Bb5/3 G5/2 r/2 Bb5/2 A5/2 G5/2 A5/3 C#6/3 E6/2 r/2 C#6/2 E6/2 A6/2',
        B: 'G5/8 Bb5/4 D6/4 F6/8 D6/4 Bb5/4 E6/6 C6/2 G5/4 E6/4 C#6/12 r/4 ' +
           'G5/4 A5/4 Bb5/4 D6/4 F6/4 E6/4 D6/4 F6/4 E6/6 C#6/2 A5/4 E6/4 A6/8 G6/2 F6/2 E6/2 C#6/2'
      },
      sec: [
        { n: 4, ch: 'Dm Dm Bb A', d: 'brk', b: 'R..R..R...R..R..', a: '0.2.1.3.0.2.1.3.', p: 0 },
        { n: 8, ch: 'Dm Dm Bb A Dm Dm Gm A', d: 'brk', b: 'R..R..R...R..RO.', a: '0.2.1.3.0.2.1.3.', p: 0, l: 'A' },
        { n: 8, ch: 'Gm Bb C A Gm Bb A A', d: 'brkB', b: 'RRO.RRO.RRO.RRO.', a: '0123012301230123', p: 1, l: 'B' },
        { n: 8, ch: 'Dm Dm Bb A Dm Dm Gm A', d: 'brkB', b: 'R..R..R...R..RO.', a: '0213021302130213', p: 1, l: 'A', dbl: -12 }
      ], loop: 1
    },
    z4: { // Bear Market: heavy, dark bass, half-time, 140
      bpm: 140, gain: 1.12, lead: 'saw', bass: 'dist', arp: 'pulse',
      mel: {
        A: 'E4/4 G4/2 B4/2 r/2 A4/2 G4/2 F#4/2 E4/4 B4/4 C5/2 B4/2 G4/4 C5/4 E5/2 G5/2 r/2 F#5/2 E5/2 C5/2 D#5/4 F#5/4 B5/8 ' +
           'E5/4 G5/2 B5/2 r/2 A5/2 G5/2 F#5/2 E5/4 B5/4 C6/2 B5/2 G5/4 G5/4 E5/2 C5/2 r/2 E5/2 G5/2 C6/2 B5/6 A5/2 F#5/4 D#5/4',
        B: 'A4/8 C5/8 E5/8 G5/8 B5/12 r/4 A5/4 F#5/4 D#5/8 A5/8 C6/8 E6/8 D6/4 C6/4 B5/8 D#6/8 F#6/8 r/8'
      },
      sec: [
        { n: 4, ch: 'Em Em C B', d: 'half', b: 'R.......R.......', a: '', p: 1 },
        { n: 8, ch: 'Em Em C B Em Em C B', d: 'half', b: 'R.RRR.R.R.RRO.R.', a: '0...1...2...1...', p: 1, l: 'A' },
        { n: 8, ch: 'Am C Em B Am C B B', d: 'halfB', b: 'ROROROROROROROR.', a: '0.1.2.0.1.2.0.1.', p: 1, l: 'B', lo: 0 },
        { n: 8, ch: 'Em Em C B Em Em C B', d: 'halfB', b: 'R.RRR.R.R.RRO.R.', a: '0.1.2.0.1.2.0.1.', p: 1, l: 'A', dbl: 12 }
      ], loop: 1
    },
    z5: { // To The Moon: euphoric, soaring, 158
      bpm: 158, gain: 1.0, lead: 'super', bass: 'saw', arp: 'pulse',
      mel: {
        A: 'E5/2 G#5/2 B5/2 E6/4 D#6/2 B5/2 G#5/2 F#5/2 B5/2 D#6/2 F#6/4 E6/2 D#6/2 B5/2 G#5/2 C#6/2 E6/2 G#6/4 F#6/2 E6/2 C#6/2 E6/6 C#6/2 A5/4 B5/4 ' +
           'E5/2 G#5/2 B5/2 E6/4 D#6/2 B5/2 G#5/2 F#5/2 B5/2 D#6/2 F#6/4 G#6/2 F#6/2 D#6/2 C#6/4 E6/4 A6/4 G#6/2 F#6/2 F#6/8 D#6/4 B5/4',
        B: 'E6/12 C#6/2 E6/2 F#6/12 D#6/2 F#6/2 G#6/8 F#6/4 D#6/4 E6/12 r/4 A6/8 G#6/4 F#6/4 F#6/8 E6/4 D#6/4 E6/16 B5/4 C#6/4 D#6/4 F#6/4'
      },
      sec: [
        { n: 4, ch: 'E B C#m A', d: 'kick', b: 'R.R.R.R.R.R.R.R.', a: '0123456765432101', p: 1 },
        { n: 8, ch: 'E B C#m A E B A B', d: 'euro', b: '.R.R.R.R.R.R.R.R', a: '0123456765432101', p: 1, l: 'A' },
        { n: 8, ch: 'A B G#m C#m A B E E', d: 'euro', b: 'RRRRRRRRRRRRRRRR', a: '0246024602460246', p: 1, l: 'B', dbl: -12 },
        { n: 8, ch: 'E B C#m A E B A B', d: 'euro', b: '.R.R.R.R.R.R.R.R', a: '0123456765432101', p: 1, l: 'A', dbl: 12 }
      ], loop: 1
    },
    boost: { // 40x: rising, intense, 172
      bpm: 172, gain: 1.0, lead: 'super', bass: 'saw', arp: 'pulse',
      mel: {
        A: 'B5/2 D6/2 F#6/2 B6/2 A6/2 F#6/2 D6/2 F#6/2 G5/2 B5/2 D6/2 G6/2 F#6/2 D6/2 B5/2 D6/2 A5/2 D6/2 F#6/2 A6/2 G6/2 F#6/2 E6/2 D6/2 C#6/4 E6/4 A6/8 ' +
           'B5/2 D6/2 F#6/2 B6/2 A6/2 F#6/2 D6/2 F#6/2 G5/2 B5/2 D6/2 G6/2 F#6/2 D6/2 B5/2 D6/2 A5/2 D6/2 F#6/2 A6/2 B6/2 A6/2 F#6/2 D6/2 E6/4 F#6/4 A6/8'
      },
      sec: [{ n: 8, ch: 'Bm G D A Bm G D A', d: 'euro', b: 'RORORORORORORORO', a: '0123012301230123', p: 1, l: 'A' }], loop: 0
    },
    results: { // leaderboard: mellow loop, 92
      bpm: 92, gain: 1.2, lead: 'tri', bass: 'tri', arp: 'pulse',
      mel: { A: 'E5/8 C5/4 A4/4 D5/8 B4/4 G4/4 C5/8 A4/4 F4/4 G4/16 E5/8 G5/4 E5/4 D5/8 F5/4 D5/4 C5/6 B4/2 A4/8 B4/16' },
      sec: [{ n: 8, ch: 'Fmaj7 Em7 Dm7 Cmaj7 Fmaj7 Em7 Dm7 G', d: 'light', b: 'R.......R...5...', a: '0.1.2.3.', p: 1, l: 'A' }], loop: 0
    },
    gameover: { // "liquidated" descending jingle, no loop
      bpm: 100, gain: 1.25, lead: 'square', bass: 'saw', arp: 'pulse', once: true,
      mel: { A: 'G5/3 F#5/3 F5/3 E5/3 D#5/2 D5/2 C#5/4 C5/4 r/8' },
      sec: [{ n: 2, ch: 'C Fm', d: 'none', b: 'R...............', a: '', p: 1, l: 'A' }]
    }
  };

  // compile a song into a step list
  function compile(name, tr) {
    const S = SONGS[name]; tr = tr || 0;
    const steps = []; let pos = 0, loopStep = 0;
    const mels = {}; for (const k in S.mel) mels[k] = parseMel(S.mel[k]);
    S.sec.forEach((sec, si) => {
      if (si === (S.loop || 0)) loopStep = pos;
      const chords = sec.ch.split(' ').map(chord);
      const st = DR[sec.d] || DR.none;
      const len = sec.n * 16;
      for (let i = 0; i < len; i++) steps[pos + i] = [];
      for (let bar = 0; bar < sec.n; bar++) {
        const c = chords[bar % chords.length], base = pos + bar * 16;
        const lastBar = bar === sec.n - 1;
        // drums
        for (let s = 0; s < 16; s++) {
          const ev = steps[base + s];
          const fill = lastBar && s >= 12 && sec.d !== 'none' && sec.d !== 'hats' && si > 0;
          if (st.k && st.k[s] === 'x' && !(fill && s > 12)) ev.push(['kick', 0, 1, 1]);
          if (st.s && st.s[s] === 'x' && !fill) ev.push(['snare', 0, 1, 1]);
          if (st.c && st.c[s] === 'x') ev.push(['clap', 0, 1, 0.8]);
          if (st.h && st.h[s] === 'x') ev.push(['hat', 0, 1, s % 4 === 2 ? 0.9 : s % 2 ? 0.45 : 0.65]);
          if (st.o && st.o[s] === 'x') ev.push(['ohat', 0, 2, 0.6]);
          if (fill) ev.push(['snare', 0, 1, 0.5 + (s - 12) * 0.15]);
        }
        if (bar === 0 && si > 0 && sec.d !== 'none') steps[base].push(['crash', 0, 8, 0.7]);
        // bass
        const bp = sec.b || '';
        const broot = 36 + ((c.root + tr) % 12 + 12) % 12; const br = broot > 43 ? broot - 12 : broot;
        for (let s = 0; s < 16; s++) {
          const ch = bp[s % bp.length]; if (!ch || ch === '.' || ch === '-') continue;
          let n = br; if (ch === 'O') n = br + 12; if (ch === '5') n = br + 7;
          let d = 1; while (bp[(s + d) % bp.length] === '-' && s + d < 16) d++;
          if (bp.length <= 8) d = 1;
          steps[base + s].push(['bass', n, d === 1 ? 1.6 : d, 1]);
        }
        // pad (whole bar chord)
        if (sec.p) steps[base].push(['pad', c.iv.map(iv => { let n = 48 + ((c.root + tr + iv) % 12 + 12) % 12; if (n < 53) n += 12; return n; }), 16, 1]);
        // arp
        const ap = sec.a || '';
        if (ap) {
          const tones = []; for (let o = 0; o < 3; o++) for (const iv of c.iv) tones.push(60 + ((c.root + tr) % 12 + 12) % 12 + iv + 12 * o);
          tones.sort((a, b) => a - b);
          for (let s = 0; s < 16; s++) { const ch = ap[s % ap.length]; if (ch === '.' || ch === undefined) continue; const t = tones[+ch % tones.length]; if (t !== undefined) steps[base + s].push(['arp', t > 88 ? t - 12 : t, 1, s % 4 === 0 ? 1 : 0.7]); }
        }
      }
      // lead melody
      if (sec.l) {
        const m = mels[sec.l];
        for (let rep = 0; rep * m.len < len; rep++) for (const [p0, n, d] of m.notes) {
          const at = rep * m.len + p0; if (at >= len) continue;
          steps[pos + at].push(['lead', n + tr + (sec.lo || 0), d, 1]);
          if (sec.dbl) steps[pos + at].push(['lead2', n + tr + sec.dbl, d, 0.55]);
        }
      }
      pos += len;
    });
    return { name, steps, loopStep, len: pos, bpm: S.bpm, once: !!S.once, gain: S.gain || 1, inst: S, loop: S.loop };
  }

  // ---------------- engine ----------------
  const E = { ctx: null, musicOn: LSget('decicat_music') !== '0', sfxOn: LSget('decicat_sfx') !== '0', cur: null, timer: null };
  let noiseBuf = null, pulseW = {}, distCurve = null;
  function makeNoise(ctx) { const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); let s = 12345; for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = s / 0x3fffffff - 1; } return b; }
  function pulse(ctx, duty) {
    const key = duty; if (pulseW[key]) return pulseW[key];
    const N = 48, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) { re[n] = (2 / (n * Math.PI)) * Math.sin(2 * Math.PI * n * duty); im[n] = (2 / (n * Math.PI)) * (1 - Math.cos(2 * Math.PI * n * duty)); }
    return (pulseW[key] = ctx.createPeriodicWave(re, im));
  }
  function makeIR(ctx, secs, decay) {
    const n = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let s = 777 + ch * 99; for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff - 1) * Math.pow(1 - i / n, decay); } }
    return b;
  }
  function build(ctx) {
    pulseW = {}; noiseBuf = makeNoise(ctx);
    distCurve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; distCurve[i] = Math.tanh(x * 3.2); }
    const g = {};
    g.out = ctx.createGain(); g.out.gain.value = 0.8; g.out.connect(ctx.destination);
    g.lim = ctx.createDynamicsCompressor(); g.lim.threshold.value = -3; g.lim.knee.value = 0; g.lim.ratio.value = 20; g.lim.attack.value = 0.002; g.lim.release.value = 0.12; g.lim.connect(g.out);
    g.comp = ctx.createDynamicsCompressor(); g.comp.threshold.value = -16; g.comp.knee.value = 10; g.comp.ratio.value = 3.5; g.comp.attack.value = 0.006; g.comp.release.value = 0.2;
    g.makeup = ctx.createGain(); g.makeup.gain.value = 0.62; g.comp.connect(g.makeup); g.makeup.connect(g.lim);
    g.music = ctx.createGain(); g.music.gain.value = E.musicOn ? 1 : 0;
    g.duck = ctx.createGain(); g.music.connect(g.duck); g.duck.connect(g.comp);
    g.sfx = ctx.createGain(); g.sfx.gain.value = E.sfxOn ? 1.6 : 0; g.sfx.connect(g.comp);
    g.pump = ctx.createGain(); g.pump.connect(g.music);
    g.drums = ctx.createGain(); g.drums.connect(g.music);
    g.rev = ctx.createConvolver(); g.rev.buffer = makeIR(ctx, 2.2, 3); g.revOut = ctx.createGain(); g.revOut.gain.value = 0.55; g.rev.connect(g.revOut); g.revOut.connect(g.pump);
    g.dly = ctx.createDelay(1.5); g.dlyFb = ctx.createGain(); g.dlyFb.gain.value = 0.38; g.dlyLp = ctx.createBiquadFilter(); g.dlyLp.type = 'lowpass'; g.dlyLp.frequency.value = 3200;
    g.dly.connect(g.dlyLp); g.dlyLp.connect(g.dlyFb); g.dlyFb.connect(g.dly); g.dlyOut = ctx.createGain(); g.dlyOut.gain.value = 0.5; g.dlyLp.connect(g.dlyOut); g.dlyOut.connect(g.pump); g.dlyOut.connect(g.rev);
    g.sfxRev = ctx.createGain(); g.sfxRev.gain.value = 1; g.sfxRev.connect(g.rev);
    return g;
  }
  E.init = function (ctx) {
    if (ctx) { E.ctx = ctx; E.g = build(ctx); E.offline = true; E.cur = null; E.amb = {}; return; }
    if (E.ctx) { if (E.ctx.state !== 'running') E.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { }
      E.ctx = new AC({ latencyHint: 'interactive' }); E.g = build(E.ctx); E.amb = {};
      // iOS unlock: play a silent buffer inside the gesture
      const s = E.ctx.createBufferSource(); s.buffer = E.ctx.createBuffer(1, 1, 22050); s.connect(E.ctx.destination); s.start(0);
      if (E.ctx.state !== 'running') E.ctx.resume();
      E.timer = setInterval(() => E.pump(E.ctx.currentTime + 0.25), 40);
    } catch (e) { E.ctx = null; }
  };
  // 0.5 s of 8-bit silence at 8 kHz as a data: URI (built once)
  let _silent = null;
  function silentWavURI() {
    if (_silent) return _silent;
    const n = 4000, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer), W = (o, t) => { for (let i = 0; i < t.length; i++) buf[o + i] = t.charCodeAt(i); };
    W(0, 'RIFF'); dv.setUint32(4, 36 + n, true); W(8, 'WAVE'); W(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); W(36, 'data'); dv.setUint32(40, n, true);
    buf.fill(128, 44); let s = ''; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return (_silent = 'data:audio/wav;base64,' + btoa(s));
  }
  E.unlock = function () {
    if (E.offline) return;
    if (!E.ctx) E.init();
    if (E.ctx && E.ctx.state !== 'running') { try { E.ctx.resume(); } catch (e) { } }
    if (!E._tag) {
      try {
        // tiny silent WAV played through an <audio> tag: lets iOS route Web Audio even with the ringer switch on silent
        const a = document.createElement('audio'); a.setAttribute('playsinline', ''); a.loop = true; a.volume = 0.01;
        a.src = silentWavURI(); // NOTE: must contain real samples; a looping zero-length WAV makes Chrome spin and freeze the page
        const pr = a.play(); if (pr && pr.catch) pr.catch(() => { }); E._tag = a;
      } catch (e) { E._tag = true; }
    }
  };
  E.now = () => E.ctx ? E.ctx.currentTime : 0;

  // ----- voices -----
  function envGain(t, a, peak, dur, rel, sustain) {
    const ctx = E.ctx, g = ctx.createGain(), p = g.gain;
    p.setValueAtTime(0.0001, t); p.linearRampToValueAtTime(peak, t + a);
    if (sustain !== undefined) p.setTargetAtTime(peak * sustain, t + a, dur * 0.25 + 0.02);
    p.setValueAtTime(p.value, t + dur); // placeholder (ignored if automated)
    p.cancelScheduledValues(t + dur); p.setTargetAtTime(0.0001, t + dur, rel / 3);
    return g;
  }
  function mkOsc(type, f, t, end, detune) {
    const o = E.ctx.createOscillator();
    if (type === 'p25') o.setPeriodicWave(pulse(E.ctx, 0.25)); else if (type === 'p12') o.setPeriodicWave(pulse(E.ctx, 0.125)); else if (type === 'p50') o.type = 'square'; else o.type = type;
    o.frequency.setValueAtTime(f, t); if (detune) o.detune.setValueAtTime(detune, t); o.start(t); o.stop(end); return o;
  }
  const mf = n => 440 * Math.pow(2, (n - 69) / 12);
  function send(node, rev, dly) {
    if (rev) { const s = E.ctx.createGain(); s.gain.value = rev; node.connect(s); s.connect(E.g.rev); }
    if (dly) { const s = E.ctx.createGain(); s.gain.value = dly; node.connect(s); s.connect(E.g.dly); }
  }
  const V = {
    kick(t, v, out) {
      const ctx = E.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.09); o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
      g.gain.setValueAtTime(0.8 * v, t); g.gain.setTargetAtTime(0.0001, t + 0.05, 0.08);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.5);
      const c = ctx.createBufferSource(), cg = ctx.createGain(), hp = ctx.createBiquadFilter(); c.buffer = noiseBuf; hp.type = 'highpass'; hp.frequency.value = 3000;
      cg.gain.setValueAtTime(0.25 * v, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.012); c.connect(hp); hp.connect(cg); cg.connect(out); c.start(t, Math.random()); c.stop(t + 0.02);
      // sidechain pump on synths
      const p = E.g.pump.gain; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(0.5, t + 0.012); p.setTargetAtTime(1, t + 0.03, 0.07);
    },
    snare(t, v, out) {
      const ctx = E.ctx, n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = noiseBuf; bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.7;
      g.gain.setValueAtTime(0.55 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      n.connect(bp); bp.connect(g); g.connect(out); n.start(t, Math.random() * 1.5); n.stop(t + 0.22);
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
      og.gain.setValueAtTime(0.5 * v, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.11); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.12);
      send(g, 0.18);
    },
    clap(t, v, out) {
      const ctx = E.ctx, n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = noiseBuf; bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 1.2;
      [0, 0.011, 0.022].forEach(d => { g.gain.setValueAtTime(0.45 * v, t + d); g.gain.exponentialRampToValueAtTime(0.05, t + d + 0.01); });
      g.gain.setValueAtTime(0.4 * v, t + 0.033); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      n.connect(bp); bp.connect(g); g.connect(out); n.start(t, Math.random()); n.stop(t + 0.22); send(g, 0.3);
    },
    hat(t, v, out, open) {
      const ctx = E.ctx, n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = noiseBuf; hp.type = 'highpass'; hp.frequency.value = open ? 7000 : 8500;
      const d = open ? 0.22 : 0.035;
      g.gain.setValueAtTime(0.32 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      n.connect(hp); hp.connect(g); g.connect(out); n.start(t, Math.random() * 1.5); n.stop(t + d + 0.01);
    },
    crash(t, v, out) {
      const ctx = E.ctx, n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = noiseBuf; hp.type = 'highpass'; hp.frequency.value = 4500;
      g.gain.setValueAtTime(0.22 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      n.connect(hp); hp.connect(g); g.connect(out); n.start(t); n.stop(t + 1.45); send(g, 0.3);
    },
    bass(t, n, dur, v, out, kind) {
      const ctx = E.ctx, f = mf(n), end = t + dur + 0.08;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5;
      const base = kind === 'tri' ? 900 : 380;
      lp.frequency.setValueAtTime(base * 6, t); lp.frequency.exponentialRampToValueAtTime(base, t + 0.14);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3 * v, t + 0.004); g.gain.setTargetAtTime(0.23 * v, t + 0.02, 0.05); g.gain.setTargetAtTime(0.0001, t + dur, 0.02);
      const types = kind === 'tri' ? ['triangle'] : kind === 'square' ? ['p50', 'p25'] : ['sawtooth', 'sawtooth'];
      types.forEach((ty, i) => mkOsc(ty, f, t, end, i ? 9 : -9).connect(lp));
      const sub = mkOsc('sine', f / 2, t, end); const sg = ctx.createGain(); sg.gain.value = 0.55; sub.connect(sg); sg.connect(g);
      if (kind === 'dist') { const ws = ctx.createWaveShaper(); ws.curve = distCurve; lp.connect(ws); const wg = ctx.createGain(); wg.gain.value = 0.32; ws.connect(wg); wg.connect(g); } else lp.connect(g);
      g.connect(out);
    },
    lead(t, n, dur, v, out, kind, sendAmt) {
      const ctx = E.ctx, f = mf(n), len = dur, end = t + len + 0.3;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2 * v, t + 0.008); g.gain.setTargetAtTime(0.15 * v, t + 0.03, 0.1); g.gain.setTargetAtTime(0.0001, t + len, 0.05);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'tri' ? 3500 : 7000; lp.Q.value = 1;
      const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.6; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(len > 0.25 ? 14 : 0, t + Math.min(0.35, len)); vib.connect(vg); vib.start(t); vib.stop(end);
      const set = kind === 'super' ? [['sawtooth', -14], ['sawtooth', 0], ['sawtooth', 14], ['p25', 1200]] : kind === 'saw' ? [['sawtooth', -8], ['sawtooth', 8], ['p25', -1200]] : kind === 'tri' ? [['triangle', 0], ['sine', 1200]] : [['p25', -6], ['p50', 6]];
      set.forEach(([ty, dt]) => { const o = mkOsc(ty, f, t, end, dt); vg.connect(o.detune); const og = ctx.createGain(); og.gain.value = ty === 'sine' ? 0.3 : ty === 'p25' && kind !== 'square' ? 0.45 : kind === 'super' ? 0.55 : 0.8; o.connect(og); og.connect(lp); });
      lp.connect(g); g.connect(out); send(g, 0.3, sendAmt === undefined ? 0.28 : sendAmt);
    },
    arp(t, n, v, out) {
      const ctx = E.ctx, f = mf(n), g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11 * v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      const o = mkOsc('p12', f, t, t + 0.16); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
      o.connect(lp); lp.connect(g); g.connect(out); send(g, 0.15, 0.45);
    },
    pad(t, notes, dur, v, out) {
      const ctx = E.ctx, end = t + dur + 0.6, g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045 * v, t + 0.12); g.gain.setTargetAtTime(0.0001, t + dur, 0.15);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(1800, t + dur * 0.7); lp.Q.value = 2;
      notes.forEach(n => { [-11, 11].forEach(dt => mkOsc('sawtooth', mf(n), t, end, dt).connect(lp)); });
      lp.connect(g); g.connect(out); send(g, 0.6);
    }
  };

  // ----- music player -----
  // instance: { song, t0 (time of step 0), step, nextT, endT, out nodes }
  function stepDur(song, tm) { return 60 / (song.bpm * (tm || 1)) / 4; }
  function startInst(name, at, opt) {
    opt = opt || {};
    const song = compile(name, opt.tr || 0);
    const ctx = E.ctx, out = ctx.createGain(); out.gain.value = song.gain;
    const dr = ctx.createGain(); dr.gain.value = song.gain;
    out.connect(E.g.pump); dr.connect(E.g.drums);
    const startStep = opt.from === 'A' ? song.loopStep : 0;
    return { song, name, tm: opt.tm || 1, step: startStep, nextT: at, endT: Infinity, out, dr, then: opt.then, opt };
  }
  function playStep(inst, ev, t) {
    const sd = stepDur(inst.song, inst.tm), S = inst.song.inst;
    for (const [k, n, d, v] of ev) {
      const dur = d * sd;
      if (k === 'kick') V.kick(t, v, inst.dr); else if (k === 'snare') V.snare(t, v, inst.dr); else if (k === 'clap') V.clap(t, v, inst.dr);
      else if (k === 'hat') V.hat(t, v, inst.dr, false); else if (k === 'ohat') V.hat(t, v, inst.dr, true); else if (k === 'crash') V.crash(t, v, inst.dr);
      else if (k === 'bass') V.bass(t, n, dur * 0.9, v, inst.out, S.bass);
      else if (k === 'lead') V.lead(t, n, dur * 0.92, v, inst.out, S.lead);
      else if (k === 'lead2') V.lead(t, n, dur * 0.9, v, inst.out, S.lead === 'super' ? 'saw' : 'square', 0.15);
      else if (k === 'arp') V.arp(t, n, v, inst.out);
      else if (k === 'pad') V.pad(t, n, dur, v, inst.out);
    }
  }
  E.pump = function (horizon) {
    const inst = E.cur; if (!inst || !E.ctx) return;
    while (inst.nextT < horizon && inst.nextT < inst.endT) {
      if (inst.step >= inst.song.len) {
        if (inst.song.once) { inst.endT = inst.nextT; if (inst.then) { const t = inst.nextT; E.cur = startInst(inst.then, t, {}); E.pump(horizon); } return; }
        inst.step = inst.song.loopStep;
      }
      playStep(inst, inst.song.steps[inst.step], inst.nextT);
      inst.step++; inst.nextT += stepDur(inst.song, inst.tm);
    }
  };
  // switch track. q: 'bar' | 'beat' | 'now'
  E.music = function (name, opt, at) {
    if (!E.ctx) return;
    opt = opt || {};
    const now = at !== undefined ? at : E.ctx.currentTime;
    const cur = E.cur;
    if (cur && cur.name === name && (cur.opt.tr || 0) === (opt.tr || 0) && !opt.restart) return;
    let t = now + 0.03;
    if (cur && name !== null) {
      const q = opt.q || 'bar', unit = (q === 'beat' ? 4 : q === 'bar' ? 16 : 0) * stepDur(cur.song, cur.tm);
      if (unit) { const k = Math.ceil((cur.nextT - now) / stepDur(cur.song, cur.tm)); const stepAtNow = cur.step - k; const stepsInto = ((stepAtNow % (q === 'beat' ? 4 : 16)) + (q === 'beat' ? 4 : 16)) % (q === 'beat' ? 4 : 16); t = Math.max(now + 0.02, now + (((q === 'beat' ? 4 : 16) - stepsInto) % (q === 'beat' ? 4 : 16)) * stepDur(cur.song, cur.tm)); if (t - now < 0.02) t += unit; if (t - now > unit + 0.01) t = now + 0.02; }
    }
    if (cur) { cur.endT = t - 0.001; E.pump(t); const fade = opt.fade || 0.12; [cur.out, cur.dr].forEach(g => { g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + fade); }); const o = cur; if (!E.offline) setTimeout(() => { try { o.out.disconnect(); o.dr.disconnect(); } catch (e) { } }, (t - E.ctx.currentTime + 2) * 1000); }
    E.cur = name ? startInst(name, t, opt) : null;
  };
  E.stopMusic = function (at, fade) { if (!E.ctx || !E.cur) return; const t = at !== undefined ? at : E.ctx.currentTime; const c = E.cur; c.endT = t; [c.out, c.dr].forEach(g => { g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + (fade || 0.3)); }); E.cur = null; };
  E.setMusic = function (on) { E.musicOn = on; LSset('decicat_music', on ? '1' : '0'); if (E.g) E.g.music.gain.setTargetAtTime(on ? 1 : 0, E.ctx.currentTime, 0.05); };
  E.setSfx = function (on) { E.sfxOn = on; LSset('decicat_sfx', on ? '1' : '0'); if (E.g) E.g.sfx.gain.setTargetAtTime(on ? 1.6 : 0, E.ctx.currentTime, 0.05); };
  E.duck = function (t, amt, len) { if (!E.g) return; const p = E.g.duck.gain; p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(amt, t + 0.02); p.setTargetAtTime(1, t + (len || 0.2), 0.15); };

  // ---------------- SFX ----------------
  function sOsc(type, f0, f1, t, dur, vol, out, curve) {
    const ctx = E.ctx, o = (type === 'p25' || type === 'p12') ? mkOsc(type, f0, t, t + dur + 0.05) : mkOsc(type, f0, t, t + dur + 0.05);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur * (curve || 1));
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || E.g.sfx); return g;
  }
  function sNoise(t, dur, vol, type, f0, f1, q, out) {
    const ctx = E.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuf; n.loop = true; f.type = type || 'bandpass'; f.frequency.setValueAtTime(f0 || 1000, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q || 1;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(out || E.g.sfx); n.start(t, Math.random()); n.stop(t + dur + 0.05); return g;
  }
  const SFX = {
    jump(t) { sOsc('p25', 260, 620, t, 0.13, 0.22); sNoise(t, 0.06, 0.06, 'highpass', 4000); },
    djump(t) { sOsc('p25', 480, 1100, t, 0.12, 0.2); sOsc('triangle', 1400, 2200, t + 0.04, 0.1, 0.1); },
    land(t) { sNoise(t, 0.07, 0.18, 'lowpass', 600, 120); sOsc('sine', 120, 60, t, 0.08, 0.25); },
    coin(t) { const g = sOsc('p25', 1319, 0, t, 0.07, 0.16); const g2 = sOsc('p25', 1976, 0, t + 0.055, 0.2, 0.16); send(g2, 0.1, 0.25); },
    stomp(t) { sOsc('square', 300, 70, t, 0.16, 0.3); sNoise(t, 0.12, 0.3, 'lowpass', 1800, 300); sOsc('p25', 700, 1400, t + 0.06, 0.1, 0.12); E.duck(t, 0.6, 0.15); },
    growl(t) { // bear charge warning
      const ctx = E.ctx, o = mkOsc('sawtooth', 70, t, t + 0.6), o2 = mkOsc('sawtooth', 73, t, t + 0.6), lp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(900, t + 0.3); lp.frequency.linearRampToValueAtTime(300, t + 0.55); lp.Q.value = 6;
      lfo.frequency.value = 22; lg.gain.value = 0.12; lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t + 0.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28, t + 0.05); g.gain.setTargetAtTime(0.0001, t + 0.4, 0.06);
      o.frequency.linearRampToValueAtTime(95, t + 0.3); o2.frequency.linearRampToValueAtTime(90, t + 0.3);
      const ws = ctx.createWaveShaper(); ws.curve = distCurve; o.connect(ws); o2.connect(ws); ws.connect(lp); lp.connect(g); g.connect(E.g.sfx); E.duck(t, 0.7, 0.3);
    },
    warn(t) { [0, 0.16, 0.32].forEach((d, i) => sOsc('p25', i % 2 ? 660 : 880, 0, t + d, 0.11, 0.13)); },
    impact(t) { sOsc('sine', 110, 35, t, 0.35, 0.5); sNoise(t, 0.3, 0.3, 'lowpass', 1200, 150); E.duck(t, 0.65, 0.2); },
    gust(t) { sNoise(t, 1.4, 0.16, 'bandpass', 300, 1600, 1.5); sNoise(t + 0.3, 1.0, 0.1, 'bandpass', 1400, 400, 2); },
    power(t) {
      [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => { const g = sOsc('p25', f, 0, t + i * 0.045, 0.14, 0.15); send(g, 0.2, 0.3); });
      sOsc('sawtooth', 110, 880, t, 0.7, 0.14); sNoise(t, 0.8, 0.12, 'bandpass', 400, 6000, 2); E.duck(t, 0.45, 0.5);
    },
    boostEnd(t) { sOsc('sawtooth', 600, 120, t, 0.45, 0.12); sNoise(t, 0.4, 0.08, 'bandpass', 3000, 300, 1.5); },
    zone(t) {
      const ch = [[523, 659, 784], [587, 740, 880], [659, 831, 988]];
      ch.forEach((c, i) => c.forEach(f => { const g = sOsc('sawtooth', f, 0, t + i * 0.13, i === 2 ? 0.5 : 0.12, 0.07); send(g, 0.35); }));
      sNoise(t, 0.5, 0.06, 'highpass', 6000);
      E.duck(t, 0.55, 0.6);
    },
    near(t) { sNoise(t, 0.22, 0.14, 'bandpass', 900, 3500, 3); },
    smash(t) { sNoise(t, 0.25, 0.3, 'bandpass', 2500, 400, 1); sOsc('square', 200, 60, t, 0.15, 0.2); },
    death(t) {
      sOsc('square', 660, 330, t, 0.15, 0.25);
      [0, 7, -7].forEach(dt => { const g = sOsc('sawtooth', 330 * Math.pow(2, dt / 1200), 40, t + 0.12, 1.1, 0.16); send(g, 0.4); });
      sNoise(t + 0.1, 1.0, 0.3, 'lowpass', 3000, 100); sOsc('sine', 90, 30, t + 0.1, 0.8, 0.5);
      E.duck(t, 0.2, 1.0);
    },
    click(t) { sOsc('p25', 1200, 0, t, 0.04, 0.12); },
    confirm(t) { sOsc('p25', 880, 0, t, 0.07, 0.14); sOsc('p25', 1320, 0, t + 0.07, 0.14, 0.14); },
    best(t) { [784, 988, 1175, 1568, 1319, 1568].forEach((f, i) => { const g = sOsc('p25', f, 0, t + i * 0.09, i === 5 ? 0.5 : 0.12, 0.16); send(g, 0.3, 0.2); }); E.duck(t, 0.4, 0.7); },
    top10(t) { [1319, 1568, 1976, 2637].forEach((f, i) => { const g = sOsc('triangle', f, 0, t + i * 0.06, 0.25, 0.14); send(g, 0.3, 0.3); }); }
  };
  E.sfx = function (name, at) { if (!E.ctx || !SFX[name]) return; SFX[name](at !== undefined ? at : E.ctx.currentTime + 0.005); };

  // looped ambiences: rain + rocket (level 0 = off)
  E.ambience = function (kind, level, at) {
    if (!E.ctx) return; const t = at !== undefined ? at : E.ctx.currentTime;
    let a = E.amb[kind];
    if (!a && level > 0) {
      const ctx = E.ctx, g = ctx.createGain(); g.gain.value = 0.0001; g.connect(E.g.sfx);
      if (kind === 'rain') {
        const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.4;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; n.connect(bp); bp.connect(hp); hp.connect(g); n.start(t);
        a = { g, nodes: [n] };
      } else {
        const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 3;
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 9; lg.gain.value = 400; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 58; const og = ctx.createGain(); og.gain.value = 0.25; o.connect(og); og.connect(lp); o.start(t);
        n.connect(lp); lp.connect(g); n.start(t); a = { g, nodes: [n, lfo, o] };
      }
      E.amb[kind] = a;
    }
    if (!a) return;
    a.g.gain.cancelScheduledValues(t); a.g.gain.setValueAtTime(Math.max(0.0001, a.g.gain.value), t); a.g.gain.linearRampToValueAtTime(Math.max(0.0001, level), t + (level > 0 ? 0.4 : 0.35));
    if (level <= 0) { const nodes = a.nodes; nodes.forEach(n => { try { n.stop(t + 0.5); } catch (e) { } }); delete E.amb[kind]; }
  };
  E.suspend = function () { if (E.ctx && !E.offline && E.ctx.state === 'running') E.ctx.suspend(); };
  E.resume = function () { if (E.ctx && !E.offline && E.ctx.state !== 'running') E.ctx.resume(); };

  // ---------------- offline rendering (previews / video) ----------------
  // events: [{t, k:'music'|'sfx'|'amb'|'stop', name, opt, level}] with t in seconds
  E.renderOffline = async function (events, secs, sr) {
    sr = sr || 44100;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OAC(2, Math.ceil(sr * secs), sr);
    const saved = { ctx: E.ctx, g: E.g, cur: E.cur, amb: E.amb, offline: E.offline, m: E.musicOn, s: E.sfxOn };
    E.musicOn = true; E.sfxOn = true; E.init(ctx);
    events = events.slice().sort((a, b) => a.t - b.t);
    for (const ev of events) {
      E.pump(ev.t);
      if (ev.k === 'music') E.music(ev.name, ev.opt || {}, ev.t);
      else if (ev.k === 'stop') E.stopMusic(ev.t, ev.fade);
      else if (ev.k === 'sfx') E.sfx(ev.name, ev.t);
      else if (ev.k === 'amb') E.ambience(ev.name, ev.level, ev.t);
    }
    E.pump(secs);
    const buf = await ctx.startRendering();
    Object.assign(E, { ctx: saved.ctx, g: saved.g, cur: saved.cur, amb: saved.amb, offline: saved.offline, musicOn: saved.m, sfxOn: saved.s });
    return buf;
  };
  E.toWav = function (buf) {
    const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const W = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    W(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); W(8, 'WAVE'); W(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); W(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
    return out.buffer;
  };
  E.SONGS = SONGS; E.compile = compile; E.SFX = Object.keys(SFX);
  D.Audio = E;
})(window.DECICAT = window.DECICAT || {});
