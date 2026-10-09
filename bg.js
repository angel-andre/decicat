/* DECICAT backgrounds: multi-layer parallax pixel-art skies per zone.
 * Static layers are pre-rendered to offscreen canvases (one 512px tile per layer, repeated);
 * only small animated details (lights, screens, tickers, lightning, eyes, shooting stars) are drawn live.
 * Uses its own PRNG so it never disturbs the level generator. */
(function (D) {
  'use strict';
  // 3x5 tiny font (row bits, MSB = left)
  const TF = {
    '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7], '3': [7, 1, 3, 1, 7], '4': [5, 5, 7, 1, 1], '5': [7, 4, 7, 1, 7], '6': [7, 4, 7, 5, 7], '7': [7, 1, 2, 2, 2], '8': [7, 5, 7, 5, 7], '9': [7, 5, 7, 1, 7],
    'A': [2, 5, 7, 5, 5], 'B': [6, 5, 6, 5, 6], 'C': [3, 4, 4, 4, 3], 'D': [6, 5, 5, 5, 6], 'E': [7, 4, 6, 4, 7], 'F': [7, 4, 6, 4, 4], 'G': [3, 4, 5, 5, 3], 'H': [5, 5, 7, 5, 5], 'I': [7, 2, 2, 2, 7], 'J': [1, 1, 1, 5, 2], 'K': [5, 5, 6, 5, 5], 'L': [4, 4, 4, 4, 7], 'M': [5, 7, 7, 5, 5],
    'N': [6, 5, 5, 5, 5], 'O': [2, 5, 5, 5, 2], 'P': [6, 5, 6, 4, 4], 'Q': [2, 5, 5, 6, 3], 'R': [6, 5, 6, 5, 5], 'S': [3, 4, 2, 1, 6], 'T': [7, 2, 2, 2, 2], 'U': [5, 5, 5, 5, 7], 'V': [5, 5, 5, 5, 2], 'W': [5, 5, 7, 7, 5], 'X': [5, 5, 2, 5, 5], 'Y': [5, 5, 2, 2, 2], 'Z': [7, 1, 2, 4, 7],
    '.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4], '-': [0, 0, 7, 0, 0], '+': [0, 2, 7, 2, 0], '%': [5, 1, 2, 4, 5], '$': [3, 6, 2, 3, 6], ':': [0, 2, 0, 2, 0], '!': [2, 2, 2, 0, 2], '#': [5, 7, 5, 7, 5], '/': [1, 1, 2, 4, 4], '@': [7, 5, 7, 4, 7], ' ': [0, 0, 0, 0, 0], '&': [2, 5, 2, 5, 3], '?': [7, 1, 2, 0, 2], '\'': [2, 2, 0, 0, 0]
  };
  function tinyDraw(g, s, x, y, col) {
    g.fillStyle = col; s = String(s).toUpperCase(); x = Math.round(x); y = Math.round(y);
    for (let i = 0; i < s.length; i++) { const gl = TF[s[i]] || TF['?']; for (let r = 0; r < 5; r++) { const b = gl[r]; if (!b) continue; for (let c = 0; c < 3; c++) if (b & (4 >> c)) g.fillRect(x + i * 4 + c, y + r, 1, 1); } }
  }
  const tinyW = s => String(s).length * 4 - 1;
  D.TINY = { draw: tinyDraw, w: tinyW };

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const TW = 512;
  function mul(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hash = (n) => { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; }
  function mixHex(a, b, t) { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  // ordered-dither fill of a rect at density 0..1 (pixel-art translucency)
  function dith(g, x, y, w, h, col, d) {
    g.fillStyle = col; x = Math.round(x); y = Math.round(y);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const px = x + xx, py = y + yy; if ((BAYER[(py & 3) * 4 + (px & 3)] + 0.5) / 16 < d) g.fillRect(px, py, 1, 1); }
  }
  function dithCircle(g, cx, cy, r, col, dFn, sx) {
    g.fillStyle = col; sx = sx || 1;
    for (let y = -r; y <= r; y++) for (let x = -Math.ceil(r * sx); x <= Math.ceil(r * sx); x++) { const q = Math.sqrt((x / sx) * (x / sx) + y * y) / r; if (q > 1) continue; const px = cx + x, py = cy + y; if ((BAYER[(py & 3) * 4 + (px & 3)] + 0.5) / 16 < dFn(q)) g.fillRect(px, py, 1, 1); }
  }
  function disc(g, cx, cy, r, col) { g.fillStyle = col; for (let y = -r; y <= r; y++) { const hw = Math.floor(Math.sqrt(r * r - y * y + r * 0.6)); g.fillRect(cx - hw, cy + y, hw * 2 + 1, 1); } }
  // hue rotation (loop zones) applied once at pre-render time
  function hueShift(c, deg) {
    if (!deg) return c;
    const g = c.getContext('2d'), im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    const m = [0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928,
      0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283,
      0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072];
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue; const r = d[i], gg = d[i + 1], b = d[i + 2];
      d[i] = r * m[0] + gg * m[1] + b * m[2]; d[i + 1] = r * m[3] + gg * m[4] + b * m[5]; d[i + 2] = r * m[6] + gg * m[7] + b * m[8];
    }
    g.putImageData(im, 0, 0); return c;
  }
  const LOOP_HUE = [0, 60, -60, 120, -150];

  // Decibel mark: faithful pixel trace of the reference (D.LOGO.mark48 / mark40), integer-scaled only, 2 colours
  const markCache = {};
  function markMask(h, col) {
    const A = D.LOGO.mark48, B = D.LOGO.mark40;
    const M = h >= A.length ? A : B, k = Math.max(1, Math.round(h / M.length)), key = M.length + ':' + k + col;
    if (markCache[key]) return markCache[key];
    const [c, g] = mk(M[0].length * k, M.length * k); g.fillStyle = col;
    for (let y = 0; y < M.length; y++) for (let x = 0; x < M[y].length; x++) if (M[y][x] === '#') g.fillRect(x * k, y * k, k, k);
    const mk0 = Object.keys(markCache); if (mk0.length >= 16) delete markCache[mk0[0]];
    return (markCache[key] = c);
  }
  // app-icon style logo: crisp rounded square (pixel-stepped corners, hard 1-px rim) + the pixel mark (1x). No glow.
  function logoIcon(size, body, rim, markCol) {
    const A = D.LOGO.mark48, B = D.LOGO.mark40, M = size - 12 >= A.length ? A : B;
    const mw = M[0].length, mh = M.length;
    size = Math.max(size, mh + 8);
    const [c, g] = mk(size, size), r = Math.round(size * 0.22);
    roundRect(g, 0, 0, size, size, r, rim); roundRect(g, 1, 1, size - 2, size - 2, r - 1, body);
    g.drawImage(markMask(mh, markCol), Math.floor((size - mw) / 2), Math.floor((size - mh) / 2));
    return c;
  }
  // v3.1 pixel moon: crisp stepped disc, hard 1-px rim, one-shade terminator, small craters kept clear of the mark,
  // and the 48-px Decibel mark centred at an integer scale k. All 2D pixel ops, no alpha, no smoothing.
  function logoMoon(Dm, body, rim, shade, markCol, k) {
    k = k || 1;
    const M = D.LOGO.mark48, mw = M[0].length * k, mh = M.length * k, R = Dm / 2;
    const [c, g] = mk(Dm, Dm), mx = Math.floor((Dm - mw) / 2), my = Math.floor((Dm - mh) / 2);
    const inside = (x, y) => { const dx = x + 0.5 - R, dy = y + 0.5 - R; return dx * dx + dy * dy <= R * R; };
    const markAt = (x, y) => { const u = Math.floor((x - mx) / k), v = Math.floor((y - my) / k); return v >= 0 && v < M.length && u >= 0 && u < M[0].length && M[v][u] === '#'; };
    // body, terminator (lower-right crescent), rim
    const lx = R - R * 0.32, ly = R - R * 0.36, LR = R * 1.08;
    for (let y = 0; y < Dm; y++) for (let x = 0; x < Dm; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      const ddx = x + 0.5 - lx, ddy = y + 0.5 - ly;
      g.fillStyle = edge ? rim : (ddx * ddx + ddy * ddy > LR * LR ? shade : body); g.fillRect(x, y, 1, 1);
    }
    // craters: deterministic candidates around the edge band; keep those clear of the mark, the rim and each other
    const cr = Math.max(2, Math.round(R / 13)), placed = [];
    const clearOf = (cx, cy, rr) => {
      for (let y = Math.floor(cy - rr - 2); y <= cy + rr + 2; y++) for (let x = Math.floor(cx - rr - 2); x <= cx + rr + 2; x++) if (markAt(x, y)) return false;
      const dx = cx + 0.5 - R, dy = cy + 0.5 - R; if (Math.sqrt(dx * dx + dy * dy) + rr > R - 3) return false;
      if (Math.hypot(cx + 0.5 - lx, cy + 0.5 - ly) + rr + 1 > LR) return false; // stay on the lit side so craters read clearly
      return placed.every(p => Math.hypot(p[0] - cx, p[1] - cy) > p[2] + rr + 3);
    };
    for (let i = 0; i < 48 && placed.length < 5; i++) {
      const a = i * 2.39996, f = 0.62 + ((i * 37) % 23) / 23 * 0.3, rr = cr - (i % 3 === 2 ? 1 : 0);
      const cx = Math.round(R + Math.cos(a) * R * f - 0.5), cy = Math.round(R + Math.sin(a) * R * f - 0.5);
      if (rr >= 1 && clearOf(cx, cy, rr)) placed.push([cx, cy, rr]);
    }
    for (const [cx, cy, rr] of placed) for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) {
      const q = x * x + y * y; if (q > rr * rr + rr * 0.5) continue;
      const topLeft = (x + y) < 0 && q >= (rr - 1) * (rr - 1); // darker inner lip on the top-left, crater floor in the shade colour
      g.fillStyle = topLeft ? rim : shade; g.fillRect(cx + x, cy + y, 1, 1);
    }
    g.drawImage(markMask(mh, markCol), mx, my);
    return c;
  }
  function roundRect(g, x, y, w, h, r, col) {
    if (col) g.fillStyle = col;
    for (let yy = 0; yy < h; yy++) {
      let inset = 0; const dy = yy < r ? r - yy - 0.5 : yy >= h - r ? yy - (h - r) + 0.5 : 0;
      if (dy > 0) inset = Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy)));
      if (col) g.fillRect(x + inset, y + yy, w - inset * 2, 1);
    }
  }

  D.makeBG = function (E) {
    const ctx = E.ctx;
    let cache = {}, cacheOrder = [];
    function reset() { cache = {}; cacheOrder = []; for (const k in earthCache) delete earthCache[k]; earthOrder.length = 0; }
    const P = { // zone palettes (dark, desaturated so hazards pop)
      1: { far: '#241a44', farWin: ['#3e3266', '#5a4a3a'], mid: '#1a1233', midWin: ['#6b5a2c', '#2f6870', '#4a3c78'], neon: ['#7a3a74', '#2f6e78'], near: '#100a20', ground: '#0e0a1c', icon: ['#9d88c0', '#6b5a92', '#241a44', '#4a3c78'] },
      2: { far: '#1b2348', farWin: ['#2c3766', '#3a4472'], mid: '#131a36', midWin: ['#4a5a8a', '#5a5a3a'], near: '#0b1024', ground: '#0a0e20', cloud: ['#1a2142', '#232b54', '#2e3866', '#3b4678'], icon: ['#8090c8', '#56649c', '#141a36', '#3b4678'] },
      3: { far: '#2c0e20', farWin: ['#4a1a30', '#5a2236'], mid: '#1e0816', midWin: ['#6a2234', '#7a3a2a'], near: '#12040c', ground: '#12040c', glass: '#3a1428', crack: '#5e2a40', icon: ['#b05a6a', '#7a3a4c', '#2a0d22', '#6a2238'] },
      4: { far: '#24140f', mid: '#170c09', near: '#0d0605', ground: '#0d0605', chart: '#5e1e18', chartFill: '#2a110d', fog: '#4a3a34', icon: ['#c08a3a', '#8a6022', '#1e100a', '#6a4a20'] },
      5: { ground: '#05030c', neb: ['#2a1650', '#173a52', '#3a1a48'], icon: ['#fff600', '#ccc300', '#111111', '#7a7400'] },
      6: { ground: '#04142a', sea: ['#061a33', '#0a2644', '#0e3254'], aur: ['#0f5a5a', '#1a7a6a', '#2a8a9a'], far: '#081a30', candle: ['#1e4a3a', '#4a2430'], icon: ['#8fe0e8', '#4a9aa8', '#0a1a2a', '#2e6a78'] },
      7: { ground: '#0e0806', far: '#24160e', mid: '#1a0f09', near: '#0f0905', pipe: '#3a2a1e', pipeHi: '#5a4430', steam: '#7a6a5e', haze: '#5a3418', icon: ['#f0a860', '#a86a30', '#1e120a', '#7a4a20'] },
      8: { ground: '#06040c', far: '#160c28', mid: '#0e0820', near: '#08050f', grid: '#1e1238', screen: '#2a1648', icon: ['#e080f0', '#9a40a8', '#14081e', '#6a2a7a'] },
      9: { ground: '#03070a', far: '#071219', mid: '#0a1820', near: '#04090d', rack: '#0b1a23', rackHi: '#183444', cable: '#06100a', icon: ['#6af0b0', '#2a9a6a', '#06140e', '#1e6a4a'] },
      10: { ground: '#0a0205', far: '#1e070b', mid: '#15040a', near: '#0b0206', stone: '#2a1014', stoneHi: '#3e1a1e', banner: '#6a0c18', gold: '#c89a2a', cloud: ['#2a0a10', '#3a0e16', '#4a141c', '#5a1a22'], icon: ['#ff8a6a', '#b03a2a', '#1a0606', '#7a2a1e'] },
      11: { ground: '#140e1e', far: '#3a2a52', mid: '#251a38', near: '#160f24', steel: '#463a5c', steelHi: '#7a6a90', icon: ['#ffe28a', '#c8a040', '#2a1a10', '#8a6a2a'] },
      12: { ground: '#2a2410', neb: ['#2a1650', '#173a52', '#3a1a48'], rock: ['#4a4220', '#6a5e2a', '#8a7a34', '#b8a448'], icon: ['#fff600', '#ccc300', '#111111', '#7a7400'] }
    };
    function key(zt, L) { return zt + ':' + (L % 5) + ':' + E.W + 'x' + E.H; }
    function get(zt, L) {
      const k = key(zt, L); if (cache[k]) return cache[k];
      const b = build(zt, L % 5); cache[k] = b; cacheOrder.push(k);
      while (cacheOrder.length > 3) delete cache[cacheOrder.shift()]; // LRU: current + previous + next zone
      return b;
    }
    function build(zt, L) {
      const W = E.W, H = E.H, by = E.baseY, top = E.playTop, ph = E.playH;
      const rng = mul(1000 + zt * 77), R = (a, b) => a + rng() * (b - a), RI = (a, b) => Math.floor(R(a, b + 1));
      const out = { layers: [], feats: [], sky: null, skyDeco: null, icon: null, hue: LOOP_HUE[L] };
      const pal = P[zt];
      // sky gradient
      {
        const [c, g] = mk(W, H), img = g.createImageData(W, H), d = img.data, cols = E.zone(zt).sky.map(hex), n = cols.length - 1;
        for (let y = 0; y < H; y++) {
          const t = Math.min(1, Math.max(0, y / Math.max(1, by))) * n, i0 = Math.min(n - 1, Math.floor(t)), f = t - i0;
          for (let x = 0; x < W; x++) {
            const th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16, q = Math.min(3, Math.floor(f * 3) + ((f * 3 % 1) > th ? 1 : 0)) / 3;
            const a = cols[i0], b2 = cols[i0 + 1], o = (y * W + x) * 4;
            d[o] = a[0] + (b2[0] - a[0]) * q; d[o + 1] = a[1] + (b2[1] - a[1]) * q; d[o + 2] = a[2] + (b2[2] - a[2]) * q; d[o + 3] = 255;
          }
        }
        g.putImageData(img, 0, 0); out.sky = hueShift(c, out.hue);
      }
      const layer = (p, fn) => { const [c, g] = mk(TW, H); fn(g); out.layers.push({ c: hueShift(c, out.hue), p }); };
      const feat = (o) => out.feats.push(o);
      const ic = pal.icon; out.icon = hueShift(logoMoon(66, ic[0], ic[1], ic[4] || mixHex(ic[0], ic[1], 0.45), ic[2]), zt === 5 ? 0 : out.hue);
      const windows = (g, x, y, w, h, cols, prob, cw, rh) => { for (let yy = y + 3; yy < y + h - 2; yy += rh) for (let xx = x + 2; xx < x + w - 2; xx += cw) if (rng() < prob) { g.fillStyle = cols[RI(0, cols.length - 1)]; g.fillRect(xx, yy, 1, rh > 3 ? 2 : 1); } };
      if (zt === 1) {
        // far skyline with sparse windows + antennas
        layer(0.05, g => {
          let x = 0; while (x < TW) {
            const w = RI(16, 34), h = RI(Math.round(ph * 0.25), Math.round(ph * 0.48)); g.fillStyle = pal.far; g.fillRect(x, by - h, w, h + 2);
            if (rng() < 0.3) { g.fillRect(x + 3, by - h - 3, w - 6, 3); }
            windows(g, x, by - h, w, h, pal.farWin, 0.16, 3, 4);
            if (h > ph * 0.4 && rng() < 0.7) { const ax = x + RI(4, w - 4); g.fillStyle = pal.far; g.fillRect(ax, by - h - 12, 1, 12); feat({ t: 'blink', x: ax, y: by - h - 13, p: 0.05, c: '#ff4a4a', ph: rng() * 6 }); }
            x += w + RI(0, 3);
          }
        });
        // mid: lit towers, neon strips, a giant order-book screen
        layer(0.12, g => {
          let x = 0, screenDone = false; while (x < TW) {
            const big = !screenDone && x > 120; const w = big ? 48 : RI(18, 36), h = big ? Math.round(ph * 0.5) : RI(Math.round(ph * 0.14), Math.round(ph * 0.34));
            g.fillStyle = pal.mid; g.fillRect(x, by - h, w, h + 2);
            if (big) {
              screenDone = true; const sx = x + 5, sy = by - h + 8, sw = w - 10, sh = Math.min(64, Math.round(h * 0.42));
              g.fillStyle = '#2a2050'; g.fillRect(sx - 2, sy - 2, sw + 4, sh + 4); g.fillStyle = '#07040f'; g.fillRect(sx, sy, sw, sh);
              feat({ t: 'ladder', x: sx, y: sy, w: sw, h: sh, p: 0.12 });
              windows(g, x, sy + sh + 4, w, h - sh - 12, pal.midWin, 0.3, 3, 4);
              g.fillStyle = pal.mid; g.fillRect(x + w / 2 - 1, by - h - 16, 2, 16); feat({ t: 'blink', x: x + w / 2 - 1, y: by - h - 18, p: 0.12, c: '#ff4a4a', ph: 1, w: 2 });
            } else {
              windows(g, x, by - h, w, h, pal.midWin, 0.22, 3, 4);
              if (rng() < 0.35) { g.fillStyle = pal.neon[RI(0, 1)]; g.fillRect(x + 1, by - h + 2, 1, Math.round(h * 0.6)); }
              if (rng() < 0.3) { g.fillStyle = pal.mid; g.fillRect(x + 3, by - h - 4, 6, 4); }
            }
            x += w + RI(1, 6);
          }
        });
        layer(0.24, g => { let x = 0; while (x < TW) { const w = RI(26, 60), h = RI(10, Math.round(ph * 0.12)); g.fillStyle = pal.near; g.fillRect(x, by - h, w, h + 2); if (rng() < 0.5) { g.fillRect(x + 4, by - h - 5, 7, 5); g.fillRect(x + 6, by - h - 7, 3, 2); } windows(g, x, by - h, w, h, ['#2a2048'], 0.15, 4, 4); x += w + RI(4, 20); } });
      } else if (zt === 2) {
        // storm clouds (drawn on a slow drifting layer)
        { const [c, g] = mk(TW, H), cl = pal.cloud;
          for (let i = 0; i < 30; i++) { const cx = RI(0, TW), cy = Math.round(top + R(-6, ph * 0.2)), r = RI(14, 30); for (const dx of [-TW, 0, TW]) { dithCircle(g, cx + dx, cy, Math.round(r * 0.6), cl[0], q => 1.5 - q, 2.6); dithCircle(g, cx + dx + 4, cy - 3, Math.round(r * 0.42), cl[1], q => 1.35 - q, 2.4); dithCircle(g, cx + dx + 8, cy - 5, Math.round(r * 0.24), cl[2], q => 1.1 - q, 2.2); } }
          g.fillStyle = cl[0]; g.fillRect(0, 0, TW, Math.max(0, top - 6)); dith(g, 0, Math.max(0, top - 6), TW, 14, cl[0], 0.5);
          out.skyDeco = { c: hueShift(c, out.hue), p: 0.02, drift: 5 }; }
        layer(0.05, g => { let x = 0; while (x < TW) { const w = RI(14, 30), h = RI(Math.round(ph * 0.2), Math.round(ph * 0.44)); g.fillStyle = pal.far; g.fillRect(x, by - h, w, h + 2); windows(g, x, by - h, w, h, pal.farWin, 0.12, 3, 4); x += w + RI(0, 4); } });
        layer(0.12, g => {
          let x = 0, bb = 0; while (x < TW) {
            const w = RI(20, 38), h = RI(Math.round(ph * 0.14), Math.round(ph * 0.32)); g.fillStyle = pal.mid; g.fillRect(x, by - h, w, h + 2); windows(g, x, by - h, w, h, pal.midWin, 0.18, 3, 4);
            if (bb < 2 && x > 60 + bb * 220 && w >= 26) { // billboard on posts
              bb++; const bw = 54, bh = 21, bx = x + Math.round(w / 2 - bw / 2), byy = by - h - bh - 8;
              g.fillStyle = '#2a3460'; g.fillRect(bx + 8, byy + bh, 2, 8); g.fillRect(bx + bw - 10, byy + bh, 2, 8);
              g.fillStyle = '#3a4678'; g.fillRect(bx - 1, byy - 1, bw + 2, bh + 2); g.fillStyle = '#080b1a'; g.fillRect(bx, byy, bw, bh);
              tinyDraw(g, 'FUNDING', bx + Math.round((bw - tinyW('FUNDING')) / 2), byy + 2, '#6a78b0');
              feat({ t: 'board', x: bx, y: byy, w: bw, h: bh, p: 0.12, k: bb });
            } else if (rng() < 0.6) { feat({ t: rng() < 0.5 ? 'flag' : 'sock', x: x + RI(3, w - 6), y: by - h, p: 0.12, ph: rng() * 6 }); }
            x += w + RI(2, 8);
          }
        });
        layer(0.24, g => { let x = 0; while (x < TW) { const w = RI(26, 60), h = RI(10, Math.round(ph * 0.11)); g.fillStyle = pal.near; g.fillRect(x, by - h, w, h + 2); x += w + RI(4, 24); if (rng() < 0.4) feat({ t: 'flag', x: x - 6, y: by - h, p: 0.24, ph: rng() * 6 }); } });
      } else if (zt === 3) {
        layer(0.05, g => { // cracked glass towers
          let x = 0; while (x < TW) {
            const w = RI(18, 30), h = RI(Math.round(ph * 0.3), Math.round(ph * 0.55)), y0 = by - h;
            g.fillStyle = pal.far; g.fillRect(x, y0, w, h + 2);
            g.fillStyle = pal.glass; for (let yy = y0 + 3; yy < by; yy += 5) g.fillRect(x + 1, yy, w - 2, 1); for (let xx = x + 4; xx < x + w - 1; xx += 5) g.fillRect(xx, y0 + 2, 1, h);
            if (rng() < 0.75) { // crack: jagged line + branches
              g.fillStyle = pal.crack; let cx = x + RI(4, w - 4), cy = y0 + RI(6, Math.round(h * 0.4)); const n = RI(10, 22);
              for (let i = 0; i < n; i++) { g.fillRect(cx, cy, 1, 1); cx += RI(-1, 1); cy += 1; if (rng() < 0.15) { let bx = cx, byy = cy; const dir = rng() < 0.5 ? -1 : 1; for (let j = 0; j < RI(3, 6); j++) { bx += dir; byy += RI(0, 1); g.fillRect(bx, byy, 1, 1); } } }
            }
            g.fillStyle = pal.far; g.fillRect(x + Math.round(w / 2), y0 - 6, 1, 6); feat({ t: 'beacon', x: x + Math.round(w / 2), y: y0 - 8, p: 0.05, ph: rng() * 6 });
            x += w + RI(2, 8);
          }
        });
        layer(0.12, g => { let x = 0; while (x < TW) { const w = RI(20, 40), h = RI(Math.round(ph * 0.14), Math.round(ph * 0.3)); g.fillStyle = pal.mid; g.fillRect(x, by - h, w, h + 2); windows(g, x, by - h, w, h, pal.midWin, 0.14, 3, 4); if (rng() < 0.35) feat({ t: 'siren', x: x + RI(4, w - 4), y: by - h - 2, p: 0.12, ph: rng() * 6 }); x += w + RI(2, 10); } });
        layer(0.24, g => { let x = 0; while (x < TW) { const w = RI(26, 60), h = RI(10, Math.round(ph * 0.1)); g.fillStyle = pal.near; g.fillRect(x, by - h, w, h + 2); x += w + RI(4, 24); } });
      } else if (zt === 4) {
        // giant red downward chart with claw marks (far, slow)
        layer(0.03, g => {
          const y0 = Math.round(top + ph * 0.18), y1 = by - Math.round(ph * 0.12); let px = 0, py = y0 + 10; const pts = [];
          while (px <= TW) { pts.push([px, py]); px += RI(10, 22); py = Math.min(y1, Math.max(y0, py + RI(-10, 22))); if (py >= y1 - 4) py = y0 + RI(0, 24); }
          g.fillStyle = '#1c0d0a'; for (let yy = y0; yy < by; yy += 16) g.fillRect(0, yy, TW, 1);
          for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, byy] = pts[i + 1]; for (let xx = ax; xx < bx; xx++) { const yy = Math.round(ay + (byy - ay) * (xx - ax) / (bx - ax)); dith(g, xx, yy + 2, 1, by - yy - 2, pal.chartFill, 0.6); g.fillStyle = pal.chart; g.fillRect(xx, yy - 1, 1, 3); } }
          for (let k = 0; k < 2; k++) { // claw marks: three diagonal slashes
            const cx = 120 + k * 250, cy = Math.round(top + ph * 0.32);
            for (let s = 0; s < 3; s++) for (let i = 0; i < 26; i++) { const x = cx + s * 7 + Math.round(i * 0.55), y = cy + i; g.fillStyle = '#0a0403'; g.fillRect(x, y, 3, 1); g.fillStyle = '#6e2a20'; if (i > 2 && i < 23) g.fillRect(x + 3, y, 1, 1); }
          }
        });
        const tree = (g, x, h, col) => { g.fillStyle = col; g.fillRect(x, by - h, 1, h); for (let i = 0; i < h - 2; i++) { const hw = Math.round((i / h) * h * 0.32) + (i % 4 === 3 ? -1 : 0); g.fillRect(x - hw, by - h + i, hw * 2 + 1, 1); } };
        layer(0.07, g => { for (let x = 0; x < TW; x += RI(6, 12)) tree(g, x, RI(Math.round(ph * 0.16), Math.round(ph * 0.3)), pal.far); g.fillStyle = pal.far; g.fillRect(0, by - 8, TW, 10); });
        layer(0.13, g => { for (let x = 0; x < TW; x += RI(9, 20)) { tree(g, x, RI(Math.round(ph * 0.12), Math.round(ph * 0.24)), pal.mid); if (rng() < 0.3) feat({ t: 'eyes', x: x + RI(3, 6), y: by - RI(6, Math.round(ph * 0.1)), p: 0.13, ph: rng() * 20 }); } g.fillStyle = pal.mid; g.fillRect(0, by - 5, TW, 7); });
        layer(0.26, g => { for (let x = 0; x < TW; x += RI(30, 70)) { tree(g, x, RI(14, Math.round(ph * 0.14)), pal.near); } g.fillStyle = pal.near; g.fillRect(0, by - 3, TW, 5); });
        { const [c, g] = mk(TW, H); for (let i = 0; i < 3; i++) dith(g, 0, by - Math.round(ph * (0.1 + i * 0.09)), TW, 10, pal.fog, 0.18 - i * 0.04); for (let i = 0; i < 18; i++) dith(g, RI(0, TW - 40), by - RI(8, Math.round(ph * 0.3)), RI(20, 50), 3, pal.fog, 0.2); out.fog = hueShift(c, out.hue); }
      } else if (zt === 6) { // WHALE WATERS: aurora sky, a sea of far candles, breaching whale silhouettes, big swells
        { const [c, g] = mk(TW, H), A = pal.aur; // bioluminescent aurora curtains (slow drift)
          for (let k = 0; k < 3; k++) { let yy = top + ph * (0.12 + k * 0.08); for (let x = 0; x < TW; x++) { yy += Math.sin(x * 0.03 + k * 2) * 0.35; const hgt = 10 + Math.round(8 * Math.sin(x * 0.05 + k)); for (let j = 0; j < hgt; j++) { const px = x, py = Math.round(yy) + j; if ((BAYER[(py & 3) * 4 + (px & 3)] + 0.5) / 16 < (1 - j / hgt) * 0.45) { g.fillStyle = A[k]; g.fillRect(px, py, 1, 1); } } } }
          out.skyDeco = { c: hueShift(c, out.hue), p: 0.01, drift: 3 }; }
        const hz = by - Math.round(ph * 0.3); out.horizon = hz;
        layer(0.03, g => { // far sea + distant candle forest standing in the water
          g.fillStyle = pal.sea[0]; g.fillRect(0, hz, TW, H - hz);
          for (let yy = hz + 2; yy < by; yy += 3) { g.fillStyle = pal.sea[1]; for (let x = (yy * 7) % 11; x < TW; x += RI(6, 14)) g.fillRect(x, yy, RI(2, 5), 1); }
          for (let x = 0; x < TW; x += RI(5, 11)) { const red = rng() < 0.3, h = RI(4, 16), w = RI(2, 4); g.fillStyle = pal.candle[red ? 1 : 0]; g.fillRect(x, hz - h + 2, w, h); g.fillRect(x + (w >> 1), hz - h - 2, 1, 4); }
          g.fillStyle = '#1a4a6a'; g.fillRect(0, hz, TW, 1);
        });
        layer(0.08, g => { // breaching whale silhouettes + spouts
          for (let k = 0; k < 3; k++) {
            const cx = 70 + k * 170 + RI(-20, 20), wy = hz + 8 + RI(0, 6), L = RI(40, 58);
            g.fillStyle = '#0c2238'; for (let i = 0; i < L; i++) { const u = i / L, hgt = Math.round(Math.sin(u * Math.PI) * 9 + (u > 0.8 ? 2 : 0)); g.fillRect(cx + i, wy - hgt, 1, hgt + 1); }
            g.fillRect(cx - 7, wy - 6, 6, 2); g.fillRect(cx - 9, wy - 9, 3, 4); g.fillRect(cx - 9, wy - 4, 3, 3);
            feat({ t: 'spout', x: cx + Math.round(L * 0.75), y: wy - 9, p: 0.08, ph: k * 2.1 });
          }
          g.fillStyle = pal.sea[1]; for (let x = 0; x < TW; x += 2) g.fillRect(x, hz + 14 + Math.round(Math.sin(x * 0.07) * 1.5), 1, 2);
        });
        layer(0.18, g => { // big swells
          for (let x = 0; x < TW; x++) { const yy = by - 26 + Math.round(Math.sin(x * 0.035) * 5 + Math.sin(x * 0.11) * 2); g.fillStyle = pal.sea[2]; g.fillRect(x, yy, 1, by - yy + 2); g.fillStyle = '#2a6a9a'; g.fillRect(x, yy, 1, 1); if (Math.sin(x * 0.035) > 0.9 && x % 3 === 0) { g.fillStyle = '#9ad8ff'; g.fillRect(x, yy - 1, 1, 1); } }
        });
      } else if (zt === 7) { // SHORT SQUEEZE: pressure-gauge industrial city, smokestacks, pipes, red/green meters
        { const [c, g] = mk(TW, H); for (let i = 0; i < 4; i++) dith(g, 0, Math.round(top + ph * (0.15 + i * 0.12)), TW, 16, pal.haze, 0.16 - i * 0.03); out.skyDeco = { c: hueShift(c, out.hue), p: 0.01, drift: 2 }; }
        layer(0.04, g => { // factories + smokestacks (steam is live)
          let x = 0; while (x < TW) {
            const w = RI(24, 46), h = RI(Math.round(ph * 0.18), Math.round(ph * 0.34)); g.fillStyle = pal.far; g.fillRect(x, by - h, w, h + 2);
            for (let k = 0; k < w - 6; k += 8) { g.fillRect(x + k, by - h - 4, 6, 4); g.fillRect(x + k + 6, by - h - 2, 2, 2); } // saw-tooth roof
            if (rng() < 0.6) { const sx2 = x + RI(4, w - 8), sh = RI(18, 34); g.fillRect(sx2, by - h - sh, 5, sh); g.fillStyle = '#5a2a1a'; g.fillRect(sx2, by - h - sh + 3, 5, 1); g.fillStyle = pal.far; feat({ t: 'steam', x: sx2 + 2, y: by - h - sh - 2, p: 0.04, ph: rng() * 6 }); }
            windows(g, x, by - h, w, h, ['#6a3a1a', '#3a2010'], 0.12, 4, 5);
            x += w + RI(2, 8);
          }
        });
        layer(0.1, g => { // buildings with giant pressure gauges + meter towers
          let x = 0, n = 0; while (x < TW) {
            const w = RI(26, 44), h = RI(Math.round(ph * 0.16), Math.round(ph * 0.3)); g.fillStyle = pal.mid; g.fillRect(x, by - h, w, h + 2);
            if (n % 2 === 0 && w >= 30) { const r = 9, gx = x + Math.round(w / 2), gy = by - h + 14; disc(g, gx, gy, r + 1, '#3a2a1e'); disc(g, gx, gy, r, '#d8ccb0'); for (let a = 0; a < 7; a++) { const t = Math.PI * (0.8 + a * 0.233); g.fillStyle = a > 4 ? '#c0382e' : '#3a2a1e'; g.fillRect(gx + Math.round(Math.cos(t) * (r - 2)), gy + Math.round(Math.sin(t) * (r - 2)), 1, 1); } feat({ t: 'gauge', x: gx, y: gy, p: 0.1, r: r - 3, ph: rng() * 6 }); }
            else { feat({ t: 'meter', x: x + 4, y: by - h + 6, w: w - 8, h: Math.min(26, h - 10), p: 0.1, ph: rng() * 6 }); }
            n++; x += w + RI(3, 10);
          }
        });
        layer(0.22, g => { // pipes, valves and catwalk
          const py = by - Math.round(ph * 0.09); g.fillStyle = pal.pipe; g.fillRect(0, py, TW, 5); g.fillStyle = pal.pipeHi; g.fillRect(0, py, TW, 1);
          for (let x = 0; x < TW; x += RI(30, 60)) { g.fillStyle = pal.pipe; g.fillRect(x, py - 2, 4, 9); g.fillRect(x + 1, by - Math.round(ph * 0.2), 3, Math.round(ph * 0.2)); if (rng() < 0.5) { g.fillStyle = '#7a2a20'; g.fillRect(x - 2, py - 5, 8, 2); g.fillRect(x + 1, py - 7, 2, 2); } }
          g.fillStyle = pal.near; for (let x = 0; x < TW; x += RI(20, 50)) { const w = RI(16, 40), h = RI(8, Math.round(ph * 0.08)); g.fillRect(x, by - h, w, h + 2); }
        });
      } else if (zt === 8) { // FLASH CRASH: glitched skyline, crashing chart + price ticker (live), broken screens
        layer(0.03, g => {
          g.fillStyle = pal.grid; for (let yy = top + 8; yy < by; yy += 12) g.fillRect(0, yy, TW, 1); for (let x = 0; x < TW; x += 24) g.fillRect(x, top, 1, by - top);
        });
        layer(0.07, g => { // skyline with scanline gaps and offset (glitched) slices
          let x = 0; while (x < TW) { const w = RI(14, 34), h = RI(Math.round(ph * 0.2), Math.round(ph * 0.45)); g.fillStyle = pal.far; g.fillRect(x, by - h, w, h + 2); windows(g, x, by - h, w, h, ['#5a2a8a', '#2a6a8a', '#8a2a5a'], 0.14, 3, 4); x += w + RI(0, 5); }
          const im = g.getImageData(0, 0, TW, H); const d = im.data, out2 = new Uint8ClampedArray(d);
          for (let k = 0; k < 14; k++) { const y0 = RI(top, by - 4), hh = RI(1, 4), dx = RI(-6, 6); for (let yy = y0; yy < y0 + hh; yy++) for (let xx = 0; xx < TW; xx++) { const sxx = (xx - dx + TW) % TW, o = (yy * TW + xx) * 4, so = (yy * TW + sxx) * 4; for (let c2 = 0; c2 < 4; c2++) out2[o + c2] = d[so + c2]; } }
          im.data.set(out2); g.putImageData(im, 0, 0);
          g.fillStyle = 'rgba(0,0,0,0.35)'; for (let yy = 0; yy < H; yy += 2) g.fillRect(0, yy, TW, 1);
        });
        layer(0.16, g => { // broken trading screens on poles
          let x = 10; while (x < TW) { const w = RI(30, 44), hh = RI(18, 24), y0 = by - Math.round(ph * 0.12) - hh; g.fillStyle = '#1a1030'; g.fillRect(x + Math.round(w / 2) - 1, y0 + hh, 2, by - y0 - hh); g.fillStyle = '#3a2a5a'; g.fillRect(x - 1, y0 - 1, w + 2, hh + 2); g.fillStyle = '#05030a'; g.fillRect(x, y0, w, hh);
            feat({ t: 'crashscreen', x, y: y0, w, h: hh, p: 0.16, ph: rng() * 10 });
            g.fillStyle = '#6a5a8a'; let cx2 = x + RI(4, w - 4), cy2 = y0; for (let i = 0; i < hh; i++) { g.fillRect(cx2, cy2 + i, 1, 1); cx2 += RI(-1, 1); } // crack
            x += w + RI(30, 70); }
          g.fillStyle = pal.near; for (let x2 = 0; x2 < TW; x2 += RI(24, 60)) { const w = RI(20, 50), h = RI(8, Math.round(ph * 0.08)); g.fillRect(x2, by - h, w, h + 2); }
        });
      } else if (zt === 9) { // FRONT-RUNNER ALLEY: late-night server room / dark data alley, blinking racks (live LEDs), scrolling hex (live)
        layer(0.03, g => { // far wall of racks
          g.fillStyle = '#050d12'; g.fillRect(0, top, TW, by - top);
          let x = 0; while (x < TW) { const w = RI(16, 22), h = Math.round(ph * R(0.42, 0.62)); g.fillStyle = pal.far; g.fillRect(x, by - h, w, h + 2); g.fillStyle = '#0c1c26';
            for (let yy = by - h + 3; yy < by - 2; yy += 4) g.fillRect(x + 2, yy, w - 4, 2);
            feat({ t: 'leds', x: x + 3, y: by - h + 3, w: w - 6, n: Math.floor((h - 5) / 4), p: 0.03, ph: rng() * 50, dim: 1 }); x += w + RI(1, 3); }
          g.fillStyle = '#0a1a14'; for (let yy = top + 4; yy < top + 12; yy += 3) g.fillRect(0, yy, TW, 1); // ceiling cable trays
        });
        layer(0.1, g => { // mid racks, hanging cable bundles, alley signs
          let x = 6, n = 0; while (x < TW) {
            const w = RI(24, 32), h = Math.round(ph * R(0.36, 0.5)); g.fillStyle = pal.rack; g.fillRect(x, by - h, w, h + 2); g.fillStyle = pal.rackHi; g.fillRect(x, by - h, w, 1); g.fillRect(x, by - h, 1, h);
            g.fillStyle = '#050b10'; for (let yy = by - h + 4; yy < by - 3; yy += 5) g.fillRect(x + 3, yy, w - 6, 3);
            feat({ t: 'leds', x: x + 4, y: by - h + 5, w: w - 8, n: Math.floor((h - 8) / 5), p: 0.1, ph: rng() * 50, step: 5 });
            if (n % 3 === 1) { const sw = 40, sx2 = x + Math.round(w / 2 - sw / 2), sy2 = by - h - 18; g.fillStyle = '#0e2a20'; g.fillRect(sx2 - 1, sy2 - 1, sw + 2, 11); g.fillStyle = '#020806'; g.fillRect(sx2, sy2, sw, 9);
              const words = ['MEMPOOL', 'NODE 07', 'ORDERS', 'LATENCY']; const wd = words[(n >> 1) % 4]; tinyDraw(g, wd, sx2 + Math.round((sw - tinyW(wd)) / 2), sy2 + 2, '#2a8a5a'); feat({ t: 'neon', x: sx2, y: sy2, w: sw, h: 9, p: 0.1, ph: rng() * 6 }); }
            for (let k = 0; k < 3; k++) { const cx = x + RI(2, w - 2), len = RI(8, 26); g.fillStyle = pal.cable; for (let i = 0; i < len; i++) g.fillRect(cx + Math.round(Math.sin(i * 0.3) * 1.5), top + i, 1, 1); }
            n++; x += w + RI(10, 26);
          }
        });
        layer(0.22, g => { // near: server crates, a fan grille, pipes
          g.fillStyle = pal.near; let x = 0; while (x < TW) { const w = RI(18, 40), h = RI(8, Math.round(ph * 0.1)); g.fillRect(x, by - h, w, h + 2); if (rng() < 0.4) { g.fillStyle = '#0c1a20'; for (let i = 2; i < w - 2; i += 3) g.fillRect(x + i, by - h + 2, 1, Math.max(1, h - 4)); g.fillStyle = pal.near; } x += w + RI(10, 40); }
          g.fillStyle = '#0a1418'; g.fillRect(0, by - Math.round(ph * 0.16), TW, 2);
        });
      } else if (zt === 10) { // BEAR KING: storm castle of red charts (towers are red candles), throne hall with banners + torches
        { const [c, g] = mk(TW, H), cl = pal.cloud; // red storm clouds
          for (let i = 0; i < 26; i++) { const cx = RI(0, TW), cy = Math.round(top + R(-6, ph * 0.18)), r = RI(14, 30); for (const dx of [-TW, 0, TW]) { dithCircle(g, cx + dx, cy, Math.round(r * 0.6), cl[0], q => 1.5 - q, 2.6); dithCircle(g, cx + dx + 4, cy - 3, Math.round(r * 0.42), cl[1], q => 1.35 - q, 2.4); dithCircle(g, cx + dx + 8, cy - 5, Math.round(r * 0.24), cl[2], q => 1.1 - q, 2.2); } }
          g.fillStyle = cl[0]; g.fillRect(0, 0, TW, Math.max(0, top - 6)); dith(g, 0, Math.max(0, top - 6), TW, 14, cl[0], 0.5);
          out.skyDeco = { c: hueShift(c, out.hue), p: 0.02, drift: 4 }; }
        layer(0.03, g => { // castle on a crag: candle-towers with wicks, crenellated walls
          const base = by - Math.round(ph * 0.2); g.fillStyle = pal.far;
          for (let x = 0; x < TW; x++) { const hh = Math.round(ph * 0.06 * (1 + Math.sin(x * 0.02) * 0.5 + Math.sin(x * 0.07) * 0.2)); g.fillRect(x, base - hh, 1, by - base + hh); }
          let x = 8; while (x < TW) { const w = RI(10, 18), h = RI(Math.round(ph * 0.22), Math.round(ph * 0.46)), y0 = base - h;
            g.fillStyle = pal.far; g.fillRect(x, y0, w, h); g.fillRect(x + (w >> 1), y0 - RI(6, 14), 1, 14); // tower + wick
            g.fillStyle = '#3a0c12'; g.fillRect(x + 1, y0 + 1, 1, h - 2); for (let yy = y0 + 6; yy < base - 4; yy += 9) { g.fillStyle = '#05010a'; g.fillRect(x + (w >> 1) - 1, yy, 2, 3); }
            feat({ t: 'win', x: x + (w >> 1) - 1, y: y0 + 6, p: 0.03, ph: rng() * 6 });
            const ww = RI(14, 30); g.fillStyle = pal.far; g.fillRect(x + w, base - RI(10, 18), ww, 30); for (let k = 0; k < ww; k += 4) g.fillRect(x + w + k, base - 22, 2, 4);
            x += w + ww;
          }
        });
        layer(0.1, g => { // throne-hall columns with hanging bear banners + torches
          const ct = top + Math.round(ph * 0.08); g.fillStyle = pal.stone; g.fillRect(0, ct - 6, TW, 6); g.fillStyle = pal.stoneHi; g.fillRect(0, ct - 1, TW, 1);
          for (let x = 0; x < TW; x += 64) {
            g.fillStyle = pal.stone; g.fillRect(x, ct, 12, by - ct); g.fillStyle = pal.stoneHi; g.fillRect(x + 1, ct, 1, by - ct); g.fillRect(x - 2, ct, 16, 3); g.fillRect(x - 2, by - 6, 16, 4);
            const bx = x + 26, bw = 22, bh = Math.round(ph * 0.3); g.fillStyle = pal.banner; g.fillRect(bx, ct, bw, bh); for (let i = 0; i < bw; i += 2) g.fillRect(bx + i, ct + bh, 1, 3 - (i % 4 === 0 ? 0 : 1));
            g.fillStyle = pal.gold; g.fillRect(bx, ct, bw, 1); const ex = bx + 11, ey = ct + Math.round(bh * 0.4); // bear-head emblem
            disc(g, ex, ey, 5, '#2a0a0e'); disc(g, ex - 4, ey - 5, 2, '#2a0a0e'); disc(g, ex + 4, ey - 5, 2, '#2a0a0e'); g.fillStyle = pal.gold; g.fillRect(ex - 3, ey - 9, 7, 2); g.fillRect(ex - 3, ey - 11, 1, 2); g.fillRect(ex, ey - 11, 1, 2); g.fillRect(ex + 3, ey - 11, 1, 2);
            g.fillStyle = '#ff3a2a'; g.fillRect(ex - 2, ey - 1, 1, 1); g.fillRect(ex + 2, ey - 1, 1, 1);
            g.fillStyle = '#3a2a1a'; g.fillRect(x + 50, ct + Math.round(ph * 0.22), 2, 6); feat({ t: 'torch', x: x + 50, y: ct + Math.round(ph * 0.22) - 1, p: 0.1, ph: rng() * 6 });
          }
        });
        layer(0.22, g => { // near: balustrade with red chart candles
          const yb = by - Math.round(ph * 0.07); g.fillStyle = pal.near; g.fillRect(0, yb, TW, by - yb + 2); g.fillRect(0, yb - 3, TW, 2);
          for (let x = 0; x < TW; x += 6) g.fillRect(x, yb - 3, 2, 3);
          for (let x = 4; x < TW; x += RI(18, 34)) { const h = RI(6, 16); g.fillStyle = '#3a0a10'; g.fillRect(x, yb - 3 - h, 4, h); g.fillRect(x + 2, yb - 6 - h, 1, 3); }
        });
      } else if (zt === 11) { // LAUNCH PAD: futuristic launch facility at dawn, gantries, countdown boards (live)
        { const [c, g] = mk(TW, H); const sy = by - Math.round(ph * 0.22); // rising sun + streaky dawn clouds
          dithCircle(g, 330, sy, 46, '#ffb070', q => (1 - q) * 0.5); disc(g, 330, sy, 18, '#ffd890'); disc(g, 330, sy, 15, '#fff0c0');
          for (let i = 0; i < 12; i++) { const cy = Math.round(top + ph * R(0.1, 0.5)), cx = RI(0, TW), w = RI(30, 90); dith(g, cx, cy, w, 2, i % 2 ? '#c07a8a' : '#e0a080', 0.5); dith(g, cx + 8, cy - 1, w - 16, 1, '#f0c0a0', 0.4); }
          out.skyDeco = { c, p: 0.01, drift: 1 }; }
        layer(0.03, g => { // mountains + distant towers
          for (let x = 0; x < TW; x++) { const hh = Math.round(ph * (0.14 + 0.06 * Math.sin(x * 0.013) + 0.03 * Math.sin(x * 0.05))); g.fillStyle = pal.far; g.fillRect(x, by - hh, 1, hh + 2); }
          for (let k = 0; k < 4; k++) { const x = 40 + k * 128 + RI(-10, 10), h = Math.round(ph * R(0.24, 0.34)); g.fillStyle = '#2e2244'; g.fillRect(x, by - h, 3, h); g.fillRect(x - 3, by - h + 6, 9, 1); feat({ t: 'blink', x: x + 1, y: by - h - 2, p: 0.03, c: '#ff4a4a', ph: k * 1.7 }); }
        });
        layer(0.1, g => { // gantries + countdown boards + a far rocket
          let x = 20, n = 0; while (x < TW) {
            const h = Math.round(ph * R(0.36, 0.5)), w = 14; g.fillStyle = pal.mid; g.fillRect(x, by - h, 2, h); g.fillRect(x + w - 2, by - h, 2, h);
            for (let yy = by - h; yy < by; yy += 8) { for (let i = 0; i < w; i++) { g.fillRect(x + i, yy + Math.round(i * 8 / w), 1, 1); } g.fillRect(x, yy, w, 1); }
            g.fillRect(x - 6, by - h, w + 18, 3); feat({ t: 'blink', x: x + w + 10, y: by - h - 2, p: 0.1, c: '#ffcf6a', ph: n });
            if (n % 2 === 0) { const bw = 46, bh = 17, bx = x + w + 8, byy = by - Math.round(h * 0.6); g.fillStyle = pal.steel; g.fillRect(bx - 1, byy - 1, bw + 2, bh + 2); g.fillStyle = '#07040c'; g.fillRect(bx, byy, bw, bh); g.fillStyle = pal.mid; g.fillRect(bx + 20, byy + bh + 1, 3, by - byy - bh); feat({ t: 'count', x: bx, y: byy, w: bw, h: bh, p: 0.1, k: n }); }
            else { const rx = x + w + 14, rh = Math.round(ph * 0.3); g.fillStyle = '#3a2e50'; g.fillRect(rx, by - rh, 8, rh); g.fillRect(rx + 1, by - rh - 4, 6, 4); g.fillRect(rx + 3, by - rh - 7, 2, 3); g.fillRect(rx - 3, by - 8, 3, 8); g.fillRect(rx + 8, by - 8, 3, 8); g.fillStyle = '#5a4a70'; g.fillRect(rx + 1, by - rh, 1, rh - 2); }
            n++; x += RI(110, 150);
          }
        });
        layer(0.22, g => { // near: fuel tanks, fence, hazard stripes
          g.fillStyle = pal.near; let x = 0; while (x < TW) { const r = RI(8, 13); disc(g, x + r, by - r + 2, r, pal.near); g.fillRect(x, by - r, r * 2 + 1, r); g.fillStyle = '#2e2440'; g.fillRect(x + 3, by - 2 * r + 4, r * 2 - 5, 1); g.fillStyle = pal.near; x += r * 2 + RI(30, 70); }
          g.fillStyle = '#20182e'; for (let x2 = 0; x2 < TW; x2 += 5) g.fillRect(x2, by - 10, 1, 10); g.fillRect(0, by - 10, TW, 1);
          for (let x2 = 0; x2 < TW; x2++) { g.fillStyle = ((x2 >> 2) % 2) ? '#c8a020' : '#1a1206'; g.fillRect(x2, by - 3, 1, 3); }
        });
      } else if (zt === 12) { // MOON MODE: on the moon surface - space sky, big Earth, cratered yellow ridges
        { const [c, g] = mk(TW, H); for (let i = 0; i < 8; i++) { const cx = RI(0, TW), cy = Math.round(top + R(0, ph * 0.5)), r = RI(20, 46), col = pal.neb[i % 3]; for (const dx of [-TW, 0, TW]) dithCircle(g, cx + dx, cy, r, col, q => (1 - q) * 0.45); } out.skyDeco = { c, p: 0.01, drift: 0 }; }
        const ridge = (g, col, hi, base, amp, f1, seed2, craters) => {
          for (let x = 0; x < TW; x++) { const hh = Math.round(base + amp * (Math.sin(x * f1 + seed2) * 0.6 + Math.sin(x * f1 * 2.7 + seed2 * 2) * 0.4)); g.fillStyle = col; g.fillRect(x, by - hh, 1, hh + 2); g.fillStyle = hi; g.fillRect(x, by - hh, 1, 1); }
          for (let i = 0; i < craters; i++) { const cx = RI(6, TW - 6), cy = by - RI(2, Math.max(3, Math.round(base * 0.6))), r = RI(2, 6); g.fillStyle = hi; g.fillRect(cx - r, cy, r * 2, 1); g.fillStyle = '#00000044'; for (let yy = 1; yy <= Math.ceil(r / 2); yy++) g.fillRect(cx - r + yy, cy + yy, (r - yy) * 2, 1); }
        };
        layer(0.03, g => ridge(g, pal.rock[0], pal.rock[1], Math.round(ph * 0.22), Math.round(ph * 0.05), 0.012, 1, 10));
        layer(0.1, g => ridge(g, pal.rock[1], pal.rock[2], Math.round(ph * 0.13), Math.round(ph * 0.04), 0.024, 3, 16));
        layer(0.22, g => ridge(g, pal.rock[2], pal.rock[3], Math.round(ph * 0.06), Math.round(ph * 0.02), 0.05, 5, 22));
      } else if (zt === 5) {
        { const [c, g] = mk(TW, H); // nebula + planets
          for (let i = 0; i < 9; i++) { const cx = RI(0, TW), cy = Math.round(top + R(0, ph * 0.7)), r = RI(20, 46), col = pal.neb[i % 3]; for (const dx of [-TW, 0, TW]) dithCircle(g, cx + dx, cy, r, col, q => (1 - q) * 0.5); }
          const pr = 13, px = 150, py = Math.round(top + ph * 0.3); disc(g, px, py, pr, '#3a2d63'); dithCircle(g, px - 3, py - 3, pr - 4, '#5a4a8a', q => 1 - q); g.fillStyle = '#7d70b0'; for (let xx = -pr - 8; xx <= pr + 8; xx++) { const yy = Math.round(xx * 0.25); if (Math.abs(xx) > pr - 2 || yy > 0) g.fillRect(px + xx, py + yy, 1, 1); }
          disc(g, 380, Math.round(top + ph * 0.12), 5, '#6a2a2a'); g.fillStyle = '#8a3a30'; g.fillRect(377, Math.round(top + ph * 0.12) - 3, 3, 2);
          out.skyDeco = { c: hueShift(c, out.hue), p: 0.01, drift: 0 }; }
      }
      return out;
    }
    // ---- live drawing ----
    function tiles(p, fn) { const W = E.W, off = ((E.camX * p) % TW + TW) % TW; for (let rep = 0; rep * TW - off < W; rep++) fn(Math.round(rep * TW - off)); }
    function drawFeat(f, ox, T) {
      const x = Math.round(f.x + ox), y = Math.round(f.y), W = E.W;
      if (x < -70 || x > W + 10) return;
      if (f.t === 'blink') { if (Math.sin(T * 3 + f.ph) > 0.2) { ctx.fillStyle = f.c; ctx.fillRect(x, y, f.w || 1, 2); ctx.fillStyle = 'rgba(255,74,74,0.25)'; ctx.fillRect(x - 1, y - 1, (f.w || 1) + 2, 4); } }
      else if (f.t === 'ladder') ladder(f, x, y, T);
      else if (f.t === 'board') {
        const vals = ['+0.010%', '+0.042%', '-0.031%', '+0.125%', '-0.008%', '+0.067%'], i = Math.floor(T / 1.6 + f.k * 3) % vals.length, v = vals[i];
        const ph = (T / 1.6 + f.k * 3) % 1, col = v[0] === '+' ? '#5fae6a' : '#c0584e';
        if (ph > 0.06) E.text(v, x + Math.round((f.w - E.textW(v)) / 2), y + 10, col);
        else { ctx.fillStyle = '#3a4678'; ctx.fillRect(x + 2, y + 13, f.w - 4, 1); }
      } else if (f.t === 'flag' || f.t === 'sock') {
        const g = E.gust, wind = 1 + Math.abs(g) / 20, dir = g > 0 ? 1 : -1;
        ctx.fillStyle = '#3a4472'; ctx.fillRect(x, y - 11, 1, 11);
        if (f.t === 'flag') { for (let i = 0; i < 6; i++) { const wy = Math.round(Math.sin(T * 8 * wind + i * 0.9 + f.ph) * 0.8); ctx.fillStyle = i % 2 ? '#6a4a7a' : '#7a5a8a'; ctx.fillRect(x + dir * (i + 1) - (dir < 0 ? 0 : 0), y - 11 + wy, 1, 4); } }
        else { const droop = g === 0 ? 2 : 0; for (let i = 0; i < 7; i++) { ctx.fillStyle = (i >> 1) % 2 ? '#c8c8d8' : '#b0503a'; ctx.fillRect(x + dir * (i + 1), y - 11 + Math.round(i * droop / 6) + Math.round(Math.sin(T * 10 + i) * 0.5), 1, Math.max(1, 3 - (i >> 1))); } }
      } else if (f.t === 'beacon') { const on = Math.sin(T * 4 + f.ph) > 0; ctx.fillStyle = on ? '#ff3a3a' : '#5a1820'; ctx.fillRect(x - 1, y, 3, 2); if (on) { ctx.fillStyle = 'rgba(255,58,58,0.22)'; ctx.fillRect(x - 3, y - 2, 7, 6); } }
      else if (f.t === 'siren') {
        const a = T * 3 + f.ph; ctx.fillStyle = '#7a1a22'; ctx.fillRect(x - 1, y, 3, 2);
        const dx = Math.cos(a); ctx.fillStyle = 'rgba(255,70,60,0.10)';
        for (let i = 2; i < 34; i++) { const hw = Math.round(i * 0.3); ctx.fillRect(Math.round(x + dx * i) - hw, y - Math.round(i * 0.55), hw * 2 + 1, 1); }
        if (dx > 0.6) { ctx.fillStyle = '#ff5040'; ctx.fillRect(x - 1, y, 3, 1); }
      } else if (f.t === 'spout') {
        const c = (T * 0.5 + f.ph) % 4; if (c < 0.8) { const k = c / 0.8; for (let i = 0; i < 6; i++) { ctx.fillStyle = i < 2 ? '#bfe8ff' : '#5a9ac0'; ctx.fillRect(x + Math.round((i % 3 - 1) * k * 3), y - Math.round(k * 10) + i, 1, 1); } }
      } else if (f.t === 'steam') {
        for (let i = 0; i < 5; i++) { const k = ((T * 0.6 + f.ph + i * 0.2) % 1), px = x + Math.round(Math.sin(k * 6 + i) * 2 + k * 8), py = y - Math.round(k * 22); ctx.fillStyle = k < 0.5 ? '#8a7a6e' : '#5a4e46'; ctx.fillRect(px - 1, py, k < 0.5 ? 3 : 2, 2); }
      } else if (f.t === 'gauge') {
        const a = Math.PI * (0.8 + 1.4 * (0.5 + 0.5 * Math.sin(T * 1.3 + f.ph)) * (0.85 + 0.15 * Math.sin(T * 9))); ctx.fillStyle = '#c0382e';
        for (let i = 0; i <= f.r; i++) ctx.fillRect(x + Math.round(Math.cos(a) * i), y + Math.round(Math.sin(a) * i), 1, 1);
        ctx.fillStyle = '#1a120a'; ctx.fillRect(x, y, 1, 1);
      } else if (f.t === 'meter') {
        const n = Math.max(2, Math.floor(f.w / 4));
        for (let i = 0; i < n; i++) { const v = 0.5 + 0.5 * Math.sin(T * (1.5 + i * 0.4) + f.ph + i), hh = Math.max(1, Math.round(v * f.h)); ctx.fillStyle = v > 0.6 ? '#4f9a58' : '#a04a48'; ctx.fillRect(x + i * 4, y + f.h - hh, 3, hh); }
      } else if (f.t === 'crashscreen') {
        const c = (T * 0.4 + f.ph) % 3, n = 12, w = f.w - 4, h = f.h - 8;
        let py = 2; ctx.fillStyle = c > 2.6 ? '#ff4a6a' : '#c0384e';
        for (let i = 0; i < n; i++) { const u = i / (n - 1), crash = u > 0.6 ? (u - 0.6) * 2.5 * Math.min(1, c) : 0, yy = Math.round(2 + h * (0.3 + Math.sin(i * 1.7 + f.ph) * 0.08 + crash * 0.65)); ctx.fillRect(x + 2 + Math.round(u * w), y + Math.min(f.h - 3, yy), 2, 1); py = yy; }
        if (Math.floor(T * 3 + f.ph) % 2) E.text('-' + (8 + Math.floor((f.ph * 7) % 30)) + '%', x + 2, y + f.h - 7, '#ff5a6a');
      } else if (f.t === 'leds') {
        const st = f.step || 4, cols = ['#2aff8a', '#2aff8a', '#ffb020', '#3ab0ff', '#ff3a4a'];
        for (let i = 0; i < f.n; i++) for (let j = 0; j < 3; j++) { const h = hash(i * 31 + j * 7 + Math.floor(f.ph) * 101 + Math.floor(T * (2 + (i + j) % 3))); if (h < 0.45) continue; ctx.fillStyle = f.dim ? (h > 0.9 ? '#1a6a4a' : '#0e3a2a') : cols[Math.floor(h * 97) % cols.length]; ctx.fillRect(x + j * Math.max(2, Math.floor(f.w / 3)), y + i * st, 1, 1); }
      } else if (f.t === 'neon') { if (Math.sin(T * 7 + f.ph) > -0.85 || Math.sin(T * 23) > 0) { ctx.fillStyle = 'rgba(42,255,138,0.10)'; ctx.fillRect(x - 2, y - 2, f.w + 4, f.h + 4); } }
      else if (f.t === 'win') { ctx.fillStyle = Math.sin(T * 1.3 + f.ph) > 0.3 ? '#ff5a3a' : '#7a1a14'; ctx.fillRect(x, y, 2, 3); }
      else if (f.t === 'torch') { const k = Math.floor(T * 10 + f.ph * 3); ctx.fillStyle = '#ff7a1a'; ctx.fillRect(x - 1, y - 3 - (k % 2), 4, 3 + (k % 2)); ctx.fillStyle = '#ffd04a'; ctx.fillRect(x, y - 2, 2, 2); ctx.fillStyle = 'rgba(255,120,40,0.12)'; ctx.fillRect(x - 5, y - 8, 12, 12); }
      else if (f.t === 'count') {
        const left = Math.max(0, Math.ceil(E.zoneLeft || 0)), s2 = 'T-00:' + String(Math.min(99, left)).padStart(2, '0');
        D.TINY.draw(ctx, f.k % 4 === 0 ? 'LAUNCH' : 'DECIBEL', x + 3, y + 2, '#ffcf6a');
        D.TINY.draw(ctx, s2, x + 3, y + 9, left <= 10 && Math.floor(T * 4) % 2 ? '#ff5a4a' : '#7cfc9a');
      } else if (f.t === 'eyes') {
        const cyc = (T + f.ph) % 9; if (cyc > 6) return; // hidden part of the time
        const blinkNow = (cyc % 2.7) < 0.12; ctx.fillStyle = cyc < 0.3 || cyc > 5.7 ? '#7a4a1a' : '#ffb347';
        if (!blinkNow) { ctx.fillRect(x, y, 1, 1); ctx.fillRect(x + 3, y, 1, 1); }
      }
    }
    function ladder(f, x, y, T) {
      const rows = Math.floor((f.h - 2) / 6), mid = Math.floor(rows / 2), tick = Math.floor(T * 2.5);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, f.w, f.h); ctx.clip();
      for (let r = 0; r < rows; r++) {
        const ry = y + 1 + r * 6; if (r === mid) { ctx.fillStyle = '#3a3010'; ctx.fillRect(x, ry, f.w, 5); D.TINY.draw(ctx, String(84047 + (tick % 7) - 3), x + 2, ry, '#d8c040'); continue; }
        const ask = r < mid, h = hash(r * 131 + tick * 7 + (ask ? 1 : 9)), depth = Math.round(4 + h * (f.w - 8));
        ctx.fillStyle = ask ? '#3a1416' : '#13301a'; ctx.fillRect(x + f.w - depth, ry, depth, 5);
        const px = 84047 + (ask ? (mid - r) : -(r - mid)) * 3 + (tick % 7) - 3;
        D.TINY.draw(ctx, String(px), x + 2, ry, ask ? '#a04a48' : '#4f9a58');
      }
      ctx.restore();
    }
    let flash = 0, nextFlash = 2, bolt = null;
    function lightning(T, dt) {
      if (T > nextFlash) { flash = 0.18; nextFlash = T + 3 + hash(Math.floor(T)) * 5; const x0 = E.W * (0.2 + hash(Math.floor(T * 7)) * 0.6); bolt = []; let x = x0, y = E.playTop - 4; while (y < E.baseY - E.playH * 0.3) { const nx = x + (hash(y * 13 + Math.floor(T)) - 0.5) * 10, ny = y + 4 + hash(y * 7) * 6; bolt.push([x, y, nx, ny]); x = nx; y = ny; } }
      flash = Math.max(0, flash - dt);
    }
    let lastT = 0;
    function drawZone(z, alpha, opt) {
      if (alpha <= 0) return; opt = opt || {};
      const zt = E.ztype(z), L = E.zloop(z), b = get(zt, L), T = E.bgT, W = E.W, H = E.H, by = E.baseY, top = E.playTop, ph = E.playH;
      const dt = Math.max(0, Math.min(0.1, T - lastT)); lastT = T;
      ctx.globalAlpha = alpha;
      ctx.drawImage(b.sky, 0, 0);
      if (zt === 3) { const a = 0.05 + 0.05 * Math.sin(T * 2.4); ctx.fillStyle = 'rgba(255,40,40,' + a.toFixed(3) + ')'; ctx.fillRect(0, 0, W, Math.round(by * 0.6)); }
      // stars
      const stars = E.stars, dense = zt === 5 || zt === 12 ? 1 : zt === 11 ? 0.25 : zt === 9 || zt === 10 ? 0 : zt === 6 ? 0.8 : zt === 1 ? 0.6 : zt === 8 ? 0.4 : zt === 2 || zt === 7 ? 0 : 0.3;
      for (let i = 0; i < stars.length * dense; i++) {
        const s = stars[i], sx = Math.round(((s.x * W * 2 - E.camX * 0.03) % W + W) % W), sy = Math.round(s.y * by * 0.85), tw = Math.sin(T * 2 + s.tw) > 0.6;
        ctx.fillStyle = s.b > 0.85 ? '#FFE500' : zt === 3 ? '#ffb0b0' : '#ffffff';
        if (s.b > 0.93 && tw) { ctx.fillRect(sx - 1, sy, 3, 1); ctx.fillRect(sx, sy - 1, 1, 3); } else if (s.b > 0.3 || tw) ctx.fillRect(sx, sy, 1, 1);
      }
      if (b.skyDeco && zt === 5) tiles(b.skyDeco.p, ox => ctx.drawImage(b.skyDeco.c, ox, 0));
      if (b.skyDeco && (zt === 11 || zt === 12)) ctx.drawImage(b.skyDeco.c, 0, 0);
      if (zt === 9) { // scrolling hex columns (far, dim)
        const hx = '0123456789ABCDEF';
        for (let i = 0; i < 12; i++) { const sp = 10 + (i % 4) * 5, x = Math.round(((i * 41 - E.camX * 0.04) % (W + 20) + W + 20) % (W + 20) - 10), y0 = (T * sp + i * 37) % (by + 60) - 60;
          for (let j = 0; j < 8; j++) { const y = Math.round(y0 + j * 7); if (y < top || y > by) continue; const h = hash(i * 13 + j + Math.floor(T * 3 + i)); D.TINY.draw(ctx, hx[Math.floor(h * 16)], x, y, j === 7 ? '#3aff9a' : j > 4 ? '#1e7a4a' : '#0e3a26'); } }
      }
      if (b.skyDeco && (zt === 6 || zt === 7)) { const o = ((E.camX * b.skyDeco.p + T * b.skyDeco.drift) % TW + TW) % TW; for (let rep = 0; rep * TW - o < W; rep++) ctx.drawImage(b.skyDeco.c, Math.round(rep * TW - o), 0); }
      const drawIcon = () => {
      if (!opt.noIcon) {
        const ic = b.icon;
        // v5.2: slow drift that ping-pongs inside the visible width (it used to wrap round and leave narrow portrait screens)
        const R = Math.max(0, W - ic.width - 8), f = zt === 5 ? 0.82 : zt === 3 ? 0.3 : 0.74;
        let ix;
        if (zt === 5 || R === 0) ix = Math.round(Math.min(R, Math.max(0, W * f - ic.width / 2 - 4)) + 4);
        else { const u = f * R - E.camX * 0.01, m = ((u % (2 * R)) + 2 * R) % (2 * R); ix = Math.round(4 + (m <= R ? m : 2 * R - m)); }
        const iy = Math.round(top + ph * (zt === 5 ? 0.16 : zt === 4 ? 0.26 : zt === 2 ? 0.3 : zt === 6 ? 0.17 : 0.2) - ic.height / 2 + Math.sin(T * 0.5) * 1.5);
        ctx.drawImage(ic, ix, Math.max(20, iy));
      }
      };
      if (zt !== 2 && zt !== 10 && zt !== 12) drawIcon();
      if (zt === 10 && b.skyDeco) { // red storm + lightning, the moon peeks out in front of the clouds
        lightning(T, dt);
        if (flash > 0) { ctx.fillStyle = 'rgba(255,120,110,' + (flash * 1.4).toFixed(3) + ')'; ctx.fillRect(0, 0, W, by); ctx.fillStyle = '#ffd0c8'; for (const s of bolt) { const n = Math.max(Math.abs(s[2] - s[0]), Math.abs(s[3] - s[1])); for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(s[0] + (s[2] - s[0]) * i / n), Math.round(s[1] + (s[3] - s[1]) * i / n), 1, 1); } }
        const o = (((E.camX * b.skyDeco.p + T * b.skyDeco.drift) % TW) + TW) % TW; for (let rep = 0; rep * TW - o < W; rep++) ctx.drawImage(b.skyDeco.c, Math.round(rep * TW - o), 0);
        drawIcon();
      }
      if (zt === 5) { // shooting stars + distant rocket with trail
        const k = Math.floor(T / 2.3), ph2 = (T / 2.3) % 1;
        if (ph2 < 0.25) { const sx = W * hash(k), sy = top + ph * 0.4 * hash(k + 9), l = ph2 / 0.25; for (let i = 0; i < 8; i++) { ctx.fillStyle = i < 2 ? '#ffffff' : 'rgba(255,255,255,' + (0.5 - i * 0.05).toFixed(2) + ')'; ctx.fillRect(Math.round(sx + l * 60 - i * 2), Math.round(sy + l * 24 - i * 0.8), 1, 1); } }
        const rp = (T % 14) / 14, rx = Math.round(-20 + rp * (W + 40)), ry = Math.round(by - ph * 0.15 - rp * ph * 0.45);
        for (let i = 1; i < 14; i++) { if ((i + Math.floor(T * 12)) % 3 === 0) continue; ctx.fillStyle = i < 4 ? '#ffb040' : '#5a4a7a'; ctx.fillRect(rx - i * 2, ry + i, 1, 1); }
        ctx.fillStyle = '#c8c8e0'; ctx.fillRect(rx, ry - 2, 2, 3); ctx.fillStyle = '#d9584e'; ctx.fillRect(rx, ry - 3, 2, 1);
      }
      if (zt === 2 && b.skyDeco) {
        lightning(T, dt);
        if (flash > 0) { ctx.fillStyle = 'rgba(190,200,255,' + (flash * 1.6).toFixed(3) + ')'; ctx.fillRect(0, 0, W, by); ctx.fillStyle = '#e8ecff'; for (const s of bolt) { const n = Math.max(Math.abs(s[2] - s[0]), Math.abs(s[3] - s[1])); for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(s[0] + (s[2] - s[0]) * i / n), Math.round(s[1] + (s[3] - s[1]) * i / n), 1, 1); } }
        const off = E.camX * b.skyDeco.p + T * b.skyDeco.drift; const o = ((off % TW) + TW) % TW; for (let rep = 0; rep * TW - o < W; rep++) ctx.drawImage(b.skyDeco.c, Math.round(rep * TW - o), 0);
        drawIcon(); // peeks out in front of the storm clouds
      }
      if (zt === 3) { // falling LIQ tickers (far, dim)
        const msgs = ['LIQ $1.2M', 'LIQ 40X', 'LIQ $380K', 'REKT', 'LIQ $2.7M', 'LIQ 25X', 'LIQ $96K'];
        for (let i = 0; i < 7; i++) { const sp = 8 + (i % 3) * 3, y = ((T * sp + i * 53) % (by + 20)) - 10, x = Math.round(((i * 97 - E.camX * 0.06) % (W + 40) + W + 40) % (W + 40) - 30); D.TINY.draw(ctx, msgs[i], x, Math.round(y), i % 2 ? '#6e2234' : '#80303e'); }
      }
      if (zt === 8) { // crashing price ticker across the sky + falling price line
        const k = (T * 0.25) % 1, n = 40; ctx.fillStyle = '#5a1a3a';
        for (let i = 0; i < n; i++) { const u = i / n, x = Math.round(u * W), dip = u > k ? 0 : Math.max(0, (u - k + 0.35)) * 2.2, y = Math.round(top + ph * (0.2 + 0.05 * Math.sin(i * 1.3 + Math.floor(T)) + dip * 0.5)); ctx.fillRect(x, y, Math.ceil(W / n), 1); }
        const msgs = ['BTC -12.4%', 'ETH -18.9%', 'SOL -23.1%', 'LIQ $412M', 'FLASH CRASH', 'VOL 9.8X', 'BID GONE', 'DOGE -31%'];
        const ty = Math.round(top + 6), tw = 64, off = (E.camX * 0.2 + T * 30) % (tw * msgs.length);
        ctx.fillStyle = '#12081e'; ctx.fillRect(0, ty - 2, W, 9);
        for (let i = 0; i * tw - off < W + tw * msgs.length; i++) { const x = Math.round(i * tw - off); if (x > -tw && x < W) D.TINY.draw(ctx, msgs[i % msgs.length], x, ty, i % 3 === 2 ? '#ff7ae0' : '#ff4a6a'); }
      }
      for (let li = 0; li < b.layers.length; li++) {
        const Ly = b.layers[li];
        tiles(Ly.p, ox => { ctx.drawImage(Ly.c, ox, 0); for (const f of b.feats) if (f.p === Ly.p) drawFeat(f, ox, T); });
        if (zt === 4 && li === 1 && b.fog) { const o = ((E.camX * 0.1 + T * 4) % TW + TW) % TW; for (let rep = 0; rep * TW - o < W; rep++) ctx.drawImage(b.fog, Math.round(rep * TW - o), 0); }
      }
      ctx.fillStyle = P[zt].ground; ctx.fillRect(0, by, W, H - by);
      if (zt === 8 && hash(Math.floor(T * 12)) < 0.06) { // rare cheap glitch: shift a few rows of the background
        for (let i = 0; i < 3; i++) { const y = Math.floor(hash(Math.floor(T * 12) * 3 + i) * by), h = 2 + Math.floor(hash(i + Math.floor(T * 5)) * 5); ctx.drawImage(ctx.canvas, 0, y, W, h, Math.round((hash(i * 9 + Math.floor(T * 12)) - 0.5) * 12), y, W, h); }
      }
      if (zt === 5) earth(E.zoneP, by, ph);
      if (zt === 12) earth(0.25, Math.round(top + ph * 0.3), ph, 0.72);
      ctx.globalAlpha = 1;
    }
    const earthCache = {}, earthOrder = [];
    function earth(p, by, ph, fx) {
      const r = Math.max(8, Math.round((ph * 0.2) * (1 - p * 0.8))), k = r;
      let c = earthCache[k];
      if (!c) {
        let g; [c, g] = mk(r * 2 + 3, r * 2 + 3); const cx = r + 1, cy = r + 1;
        disc(g, cx, cy, r + 1, '#4a6aa8'); disc(g, cx, cy, r, '#1a3466');
        const rng = mul(77); for (let i = 0; i < 7; i++) { const a = rng() * 6.28, d = rng() * r * 0.7; dithCircle(g, Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), Math.max(2, Math.round(r * (0.18 + rng() * 0.2))), '#2c5a34', q => 1.4 - q); }
        dithCircle(g, cx + Math.round(r * 0.35), cy + Math.round(r * 0.3), r, '#070818', q => q > 0.55 ? 0.7 : 0); // night side
        const im = g.getImageData(0, 0, c.width, c.height), d = im.data; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy > (r + 1.2) * (r + 1.2)) d[(y * c.width + x) * 4 + 3] = 0; } g.putImageData(im, 0, 0);
        earthCache[k] = c; earthOrder.push(k); while (earthOrder.length > 8) delete earthCache[earthOrder.shift()];
      }
      ctx.drawImage(c, Math.round(E.W * (fx || 0.22) - r), Math.round(by - r * 0.55));
    }
    return { stats: () => ({ zones: cacheOrder.length, earth: earthOrder.length, marks: Object.keys(markCache).length }), drawZone, reset, prewarm: (z) => get(E.ztype(z), E.zloop(z)), icon: logoIcon, moon: logoMoon, mark: markMask, tiny: D.TINY };
  };
})(window.DECICAT = window.DECICAT || {});
