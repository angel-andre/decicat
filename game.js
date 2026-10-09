/* DECICAT - A Decibel Adventure
 * Endless one-touch pixel runner. Vanilla JS + canvas, no deps.
 * Decicat art & idea by @doncastro.
 */
(function (D) {
  'use strict';

  // ---------- config & url params ----------
  const CONFIG = Object.assign({
    scores: 'local',          // 'local' | 'remote'
    apiBase: ''               // e.g. 'https://decicat.example.workers.dev' ('' = same origin)
  }, window.DECICAT_CONFIG || {});
  const Q = new URLSearchParams(location.search);
  const DBG = {
    zone: Math.max(1, parseInt(Q.get('zone') || '1', 10) || 1),
    boost: Q.has('boost'), god: Q.has('god'), bot: Q.has('bot'),
    manual: Q.has('manual'), poster: Q.has('poster'), autostart: Q.has('autostart'),
    seed: Q.has('seed') ? (parseInt(Q.get('seed'), 10) || 1) : 0
  };

  // ---------- utils ----------
  let seed = DBG.seed || ((Math.random() * 1e9) | 0);
  function rnd() { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const rand = (a, b) => a + rnd() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  };
  const pad6 = n => String(Math.max(0, Math.floor(n))).padStart(6, '0');
  const commas = n => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // ---------- canvas ----------
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d', { alpha: false });
  let W = 240, H = 240, SCALE = 2, baseY = 240, playH = 240, playTop = 0;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cw = window.innerWidth || 480, ch = window.innerHeight || 480;
    const dw = Math.round(cw * dpr), dh = Math.round(ch * dpr);
    const base = Math.min(cw, ch) >= 450 ? 240 : 200; // keep text >= ~10 css px on small phones
    let s = Math.min(dw, dh) / base;
    if (s >= 2) s = Math.floor(s);
    W = Math.ceil(dw / s); H = Math.ceil(dh / s);
    if (W > H * 2.6) W = Math.ceil(H * 2.6);
    SCALE = s;
    cv.width = W; cv.height = H;
    const sw = W * s / dpr, sh = H * s / dpr;
    cv.style.width = sw + 'px'; cv.style.height = sh + 'px';
    cv.style.left = Math.floor((cw - sw) / 2) + 'px'; cv.style.top = Math.floor((ch - sh) / 2) + 'px';
    ctx.imageSmoothingEnabled = false;
    playH = H <= 300 ? H : Math.min(H - 20, 400);
    baseY = H - Math.round(Math.max(0, H - playH) * 0.3);
    playTop = baseY - playH;
    bgCache = {};
    buildSkyline();
  }

  // ---------- font ----------
  const glyphCache = {};
  function glyphAtlas(color) {
    if (glyphCache[color]) return glyphCache[color];
    const keys = Object.keys(D.FONT);
    const c = document.createElement('canvas'); c.width = keys.length * 6; c.height = 7;
    const g = c.getContext('2d'); g.fillStyle = color;
    const map = {};
    keys.forEach((k, i) => {
      map[k] = i * 6;
      D.FONT[k].forEach((row, y) => { for (let x = 0; x < 5; x++) if (row & (16 >> x)) g.fillRect(i * 6 + x, y, 1, 1); });
    });
    return (glyphCache[color] = { c, map });
  }
  function textW(s, sc = 1, bold = false) { return s.length * (bold ? 7 : 6) * sc - sc; }
  function text(s, x, y, color, o = {}) {
    s = String(s); const sc = o.scale || 1, bold = !!o.bold;
    const adv = (bold ? 7 : 6) * sc;
    if (o.align === 'center') x = Math.round(x - textW(s, sc, bold) / 2);
    else if (o.align === 'right') x = Math.round(x - textW(s, sc, bold));
    if (o.shadow) text(s, x + (o.sx || sc), y + (o.sy || sc), o.shadow, { scale: sc, bold });
    const A = glyphAtlas(color);
    for (let i = 0; i < s.length; i++) {
      let ch = s[i]; if (ch !== 'x') ch = ch.toUpperCase();
      let gx = A.map[ch]; if (gx === undefined) gx = A.map['?'];
      if (ch === ' ') continue;
      const px = x + i * adv;
      ctx.drawImage(A.c, gx, 0, 5, 7, px, y, 5 * sc, 7 * sc);
      if (bold) ctx.drawImage(A.c, gx, 0, 5, 7, px + sc, y, 5 * sc, 7 * sc);
    }
  }

  // ---------- sprites ----------
  function makeSprite(rows, pal) {
    const w = Math.max(...rows.map(r => r.length)), h = rows.length;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { let p = pal[r[x]]; if (typeof p === 'function') p = p(y); if (p) { g.fillStyle = p; g.fillRect(x, y, 1, 1); } } });
    return c;
  }
  const S = {};
  for (const k in D.SPR) { S[k] = {}; for (const f in D.SPR[k].frames) S[k][f] = makeSprite(D.SPR[k].frames[f], D.SPR[k].pal); }
  // white flash version of the cat (for boost glow)
  S.catWhite = makeSprite(D.SPR.cat.frames.jump, { K: '#fff', Y: '#fff', L: '#fff', D: '#fff', G: '#fff', g: '#fff' });

  function drawSpr(img, x, y, flip, sc) {
    sc = sc || 1;
    if (flip) { ctx.save(); ctx.translate(Math.round(x) + img.width * sc, Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, img.width * sc, img.height * sc); ctx.restore(); }
    else ctx.drawImage(img, Math.round(x), Math.round(y), img.width * sc, img.height * sc);
  }

  // ---------- audio (music + sfx engine lives in audio.js) ----------
  const AU = D.Audio;
  let gameClock = 0; const REC = Q.has('record') ? [] : null;
  const Snd = {
    init() { if (!REC && AU) AU.init(); },
    get musicOn() { return AU ? AU.musicOn : false; }, get sfxOn() { return AU ? AU.sfxOn : false; },
    sfx(name) { if (REC) { REC.push({ t: gameClock, k: 'sfx', name }); return; } if (AU) AU.sfx(name); },
    music(name, opt) { if (REC) { REC.push({ t: gameClock, k: 'music', name, opt }); return; } if (AU) AU.music(name, opt); },
    stop(fade) { if (REC) { REC.push({ t: gameClock, k: 'stop', fade }); return; } if (AU) AU.stopMusic(undefined, fade); },
    amb(name, level) { if (REC) { REC.push({ t: gameClock, k: 'amb', name, level }); return; } if (AU) AU.ambience(name, level); },
    toggleMusic() { if (AU) AU.setMusic(!AU.musicOn); }, toggleSfx() { if (AU) AU.setSfx(!AU.sfxOn); },
    toggleAll() { if (!AU) return; const on = !(AU.musicOn || AU.sfxOn); AU.setMusic(on); AU.setSfx(on); },
    suspend() { if (!REC && AU) AU.suspend(); }, resume() { if (!REC && AU) AU.resume(); }
  };
  let rainLvl = 0;
  function setRain(l) { if (l !== rainLvl) { rainLvl = l; Snd.amb('rain', l); } }
  function zoneRain(z) { const t = ztype(z); return t === 2 ? 0.09 : t === 3 ? 0.06 : 0; }
  function zoneTrack(z) { const L = Math.floor((z - 1) / 5); return ['z' + ztype(z), { tr: L * 2, tm: 1 + 0.04 * L }]; }
  function playZoneMusic(q, from) { const [n, o] = zoneTrack(zone); Snd.music(n, Object.assign({ q, from }, o)); }

  // ---------- names ----------
  const ADJ = ['Neon', 'Lunar', 'Turbo', 'Pixel', 'Cosmic', 'Laser', 'Golden', 'Rocket', 'Hyper', 'Mellow', 'Sneaky', 'Lucky', 'Fuzzy', 'Velvet', 'Retro', 'Comet', 'Sonic', 'Disco', 'Funky', 'Jolly'];
  const ANI = ['Whale', 'Bull', 'Otter', 'Fox', 'Panda', 'Owl', 'Falcon', 'Tiger', 'Koala', 'Llama', 'Shark', 'Gecko', 'Moth', 'Badger', 'Lynx', 'Yak', 'Crab', 'Frog', 'Mole', 'Raven'];
  function randomName() {
    for (let i = 0; i < 50; i++) {
      const n = ADJ[(Math.random() * ADJ.length) | 0] + ' ' + ANI[(Math.random() * ANI.length) | 0] + ' ' + (100 + ((Math.random() * 900) | 0));
      if (n.length <= 16) return n;
    }
    return 'Neon Whale ' + (100 + ((Math.random() * 900) | 0));
  }
  const BAD = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'nigga', 'fag', 'rape', 'nazi', 'hitler', 'whore', 'slut', 'dick', 'cock', 'pussy', 'asshole', 'retard', 'kike', 'spic', 'chink', 'twat', 'wank', 'porn', 'cum', 'tits'];
  function sanitizeName(s) {
    s = String(s || '').replace(/[^A-Za-z0-9 _.\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
    if (!s) return '';
    const norm = s.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
    for (const w of BAD) if (norm.includes(w)) return null; // rejected
    return s;
  }
  let anonName = LS.get('decicat_anon');
  if (!anonName || !sanitizeName(anonName)) { anonName = randomName(); LS.set('decicat_anon', anonName); }
  function playerName() { const n = sanitizeName(LS.get('decicat_name')); return n || anonName; }

  // ---------- scores ----------
  class LocalScores {
    constructor(key) { this.key = key || 'decicat_top10_v1'; }
    _load() { try { const a = JSON.parse(LS.get(this.key) || '[]'); return Array.isArray(a) ? a.filter(e => e && typeof e.name === 'string' && isFinite(e.score)) : []; } catch (e) { return []; } }
    async top() { return this._load().slice(0, 10); }
    async submit(r) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const list = this._load(); list.push({ id, name: r.name, score: Math.floor(r.score), runMs: r.runMs, at: Date.now() });
      list.sort((a, b) => b.score - a.score || a.at - b.at);
      const top = list.slice(0, 10); LS.set(this.key, JSON.stringify(top));
      return { id, rank: top.findIndex(e => e.id === id) + 1, top };
    }
  }
  class RemoteScores {
    constructor(base) { this.base = String(base || '').replace(/\/$/, ''); }
    async top() { const r = await fetch(this.base + '/api/top', { cache: 'no-store' }); if (!r.ok) throw new Error('top ' + r.status); return (await r.json()).top || []; }
    async submit(r) {
      const nonce = (crypto && crypto.getRandomValues) ? Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('') : String(Math.random()).slice(2);
      const res = await fetch(this.base + '/api/score', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: r.name, score: Math.floor(r.score), runMs: Math.floor(r.runMs), nonce }) });
      if (!res.ok) throw new Error('score ' + res.status);
      const j = await res.json(); return { id: j.id, rank: j.rank || 0, top: j.top || [] };
    }
  }
  const local = new LocalScores();
  const Scores = {
    backend: CONFIG.scores === 'remote' ? new RemoteScores(CONFIG.apiBase) : local,
    async submit(r) {
      if (this.backend !== local) { try { return await this.backend.submit(r); } catch (e) { this.offline = true; } }
      return local.submit(r);
    }
  };
  let best = parseInt(LS.get('decicat_best') || '0', 10) || 0;

  // ---------- zones ----------
  const ZONES = [null,
    { name: 'ORDER BOOK', sky: ['#120b24', '#1f1438', '#2a1d4a', '#36265e', '#4a3577'], city: ['#2b1f4f', '#1c1336'], tint: null },
    { name: 'FUNDING STORM', sky: ['#0b0f22', '#141a36', '#1e2650', '#2b3466', '#3d4680'], city: ['#232a52', '#141a36'], tint: null },
    { name: 'LIQUIDATION RAIN', sky: ['#1a0814', '#2a0d22', '#3e1530', '#561d3c', '#74304a'], city: ['#3a1428', '#220a18'], tint: null },
    { name: 'BEAR MARKET', sky: ['#120a0a', '#1e1012', '#2c1618', '#3c201c', '#523026'], city: ['#2e1a16', '#1a0d0b'], tint: null },
    { name: 'TO THE MOON', sky: ['#03020a', '#080614', '#100b24', '#1b1438', '#2a1f50'], city: null, tint: null }
  ];
  function ztype(z) { return ((z - 1) % 5) + 1; }
  function zoneName(z) { const L = Math.floor((z - 1) / 5); return ZONES[ztype(z)].name + (L ? ' ' + ['II', 'III', 'IV', 'V'][Math.min(3, L - 1)] + (L > 4 ? '+' : '') : ''); }
  function zp(z) {
    const t = ztype(z), L = Math.floor((z - 1) / 5);
    const base = [null,
      { speed: 98, gap: [0.16, 0.36], cl: [3, 6], red: 0.07, gapRed: 0, bear: 0, fall: 0, wind: false },
      { speed: 108, gap: [0.18, 0.4], cl: [3, 5], red: 0.14, gapRed: 0.15, bear: 0, fall: 0, wind: true },
      { speed: 118, gap: [0.18, 0.42], cl: [3, 5], red: 0.12, gapRed: 0.1, bear: 0, fall: [1.5, 2.4], wind: false },
      { speed: 126, gap: [0.2, 0.42], cl: [3, 6], red: 0.06, gapRed: 0.06, bear: 0.5, fall: 0, wind: false },
      { speed: 138, gap: [0.2, 0.42], cl: [3, 5], red: 0.16, gapRed: 0.12, bear: 0.2, fall: [2.6, 3.8], wind: false }
    ][t];
    const p = Object.assign({}, base, { t, L });
    if (L > 0) {
      p.speed += 12 * L; p.red = Math.min(0.35, p.red + 0.05 * L); p.gap = [p.gap[0] + 0.02 * L, Math.min(0.56, p.gap[1] + 0.03 * L)];
      p.bear = Math.max(p.bear, 0.25); if (!p.fall) p.fall = [3.2, 4.5]; else p.fall = [p.fall[0] * 0.8, p.fall[1] * 0.8];
      p.wind = p.wind || t === 1;
    }
    return p;
  }

  // ---------- physics constants ----------
  const GRAV = 1000, JUMP = 390, DJUMP = 340, MAXFALL = 560, BOOST_T = 4.0, BOOST_MUL = 1.9, ZONE_T = Q.has('zt') ? Math.max(3, +Q.get('zt') || 25) : 25;

  // ---------- state ----------
  let state = 'title', stateT = 0, paused = false;
  let camX = 0, dist = 0, bonus = 0, coinsN = 0, runT = 0, zone = 1, zoneT = 0, prevZone = 1, zoneFade = 1;
  let plats = [], coins = [], powers = [], bears = [], fallers = [], parts = [], floats = [];
  let nextX = 0, lastTop = 0, moonPending = false, moonSeen = false, padMade = false;
  let powerTimer = 0, fallTimer = 0, gustTimer = 0, gust = 0, gustT = 0, banner = null, shake = 0;
  let result = null, lev = 1, btcWob = 0, lastDeath = '';
  const cat = { x: 0, y: 0, vy: 0, g: false, coy: 0, buf: 0, air: 1, holdT: 0, rising: false, dead: false, inv: 0, boost: 0, anim: 0, sx: 0, rot: 0 };
  let pressing = false;

  function score() { return Math.floor(dist / 2) + bonus; }

  function resetRun() {
    seed = DBG.seed || ((Math.random() * 1e9) | 0);
    plats = []; coins = []; powers = []; bears = []; fallers = []; parts = []; floats = [];
    camX = 0; dist = 0; bonus = 0; coinsN = 0; runT = 0; zone = DBG.zone; prevZone = zone; zoneFade = 1; zoneT = 0;
    moonPending = ztype(zone) === 5; moonSeen = false; padMade = false;
    powerTimer = rand(10, 16); fallTimer = 2; gustTimer = rand(2, 4); gust = 0; gustT = 0; shake = 0; result = null; lev = 1;
    cat.sx = Math.round(W * 0.27);
    cat.x = camX + cat.sx; cat.vy = 0; cat.g = true; cat.air = 1; cat.dead = false; cat.inv = 0; cat.boost = 0; cat.rot = 0; cat.coy = 0; cat.buf = 0;
    // starting runway
    lastTop = baseY - 64;
    let x = -20;
    while (x < cat.sx + 120) { const w = randi(17, 21); plats.push(candle(x, lastTop, w, randi(18, 34), false)); x += w + randi(3, 4); }
    nextX = x; cat.y = lastTop;
    while (nextX < camX + W + 100) genCluster();
    banner = { big: zoneName(zone), small: 'ZONE ' + zone, t: 0, dur: 2.2 };
    if (DBG.boost) startBoost();
  }

  function candle(x, y, w, h, red) { return { k: 'c', x, y, w, h, red, wt: randi(2, 6), wb: randi(3, 9) }; }
  const topMin = () => Math.max(playTop + 84, 78), topMax = () => baseY - 34;

  // ---------- generation ----------
  function genCluster() {
    const p = zp(zone);
    if (moonPending && cat.boost <= 0) { genMoon(p); return; }
    let gap = rand(p.gap[0], p.gap[1]) * p.speed;
    let x = nextX + gap;
    let n = randi(p.cl[0], p.cl[1]);
    let dy = rand(-30, 30); if (p.t === 1 && p.L === 0) dy = rand(-24, 26);
    dy += ((topMin() + topMax()) / 2 - lastTop) * 0.18; // drift back toward the middle of the play band
    let top = clamp(lastTop + dy, topMin(), topMax());
    const boosting = cat.boost > 0;
    let safe = boosting || runT < 3;
    if (boosting) {
      const xEnd = cat.x + cat.boost * p.speed * BOOST_MUL;
      if (x > xEnd - 170 && !padMade) {
        padMade = true; x = Math.min(x, xEnd - 60); top = clamp(baseY - 70, topMin(), topMax());
        n = Math.ceil((xEnd + 170 - x) / 24);
      }
    }
    const cs = [];
    let prevGreenTop = top;
    for (let i = 0; i < n; i++) {
      const w = randi(17, 22);
      let red = !safe && i > 1 && i < n - 1 && rnd() < p.red && !(cs[i - 1] && cs[i - 1].red);
      let t;
      if (red) t = prevGreenTop - randi(12, 20);
      else { t = (cs[i - 1] && cs[i - 1].red) ? prevGreenTop + randi(-4, 6) : (i === 0 ? top : clamp(prevGreenTop + randi(-10, 10), topMin(), topMax())); prevGreenTop = t; }
      const c = candle(x, t, w, red ? randi(30, 46) : randi(18, 52), red);
      cs.push(c); plats.push(c);
      x += w + randi(3, red ? 5 : 6);
      if (red) x += 2;
    }
    const x0 = cs[0].x, x1 = cs[cs.length - 1].x + cs[cs.length - 1].w;
    // gap red candle (floating in the gap before this cluster)
    if (!safe && rnd() < p.gapRed && gap > 44) {
      const gx = nextX + gap / 2 - 7;
      plats.push(candle(gx, clamp(Math.max(lastTop, top) + randi(0, 20), topMin(), baseY - 20), 14, randi(24, 36), true));
    }
    // coins
    if (rnd() < 0.24) {
      const m = Math.min(4, Math.max(3, Math.floor((x1 - x0) / 20)));
      const greens = cs.filter(c => !c.red);
      const cy = Math.min(...cs.map(c => c.y)) - randi(30, 44);
      for (let i = 0; i < m; i++) coins.push({ x: x0 + 8 + i * ((x1 - x0 - 16) / Math.max(1, m - 1)), y: cy - Math.sin(i / Math.max(1, m - 1) * Math.PI) * 8 });
      void greens;
    } else if (gap > 30 && rnd() < 0.18) {
      const gx0 = nextX, gm = gap;
      for (let i = 0; i < 3; i++) { const f = (i + 1) / 4; coins.push({ x: gx0 + gm * f, y: Math.min(lastTop, top) - 40 - Math.sin(f * Math.PI) * 18 }); }
    }
    if (boosting) {
      const by = boostY();
      for (let xx = x0 + 10; xx < x1; xx += 60) coins.push({ x: xx, y: by - 20 + Math.sin(xx * 0.05) * 6 });
    }
    // power-up
    if (!boosting && powerTimer <= 0 && runT > 4) {
      powerTimer = rand(16, 24);
      const c = cs[Math.floor(cs.length / 2)];
      powers.push({ x: c.x + c.w / 2, y: Math.min(...cs.map(q => q.y)) - 64, t: 0 });
    }
    // bears
    if (!safe && cs.length >= 3 && rnd() < p.bear) {
      const c = cs[cs.length - 1];
      const roll = rnd();
      const type = (p.t === 4 || p.L > 0) ? (roll < 0.35 ? 'charge' : roll < 0.6 ? 'leap' : 'walk') : 'walk';
      bears.push({ x: c.x + c.w / 2, y: c.y, vy: 0, vx: -randi(16, 26), type, g: true, t: rand(0, 1), dead: false, flip: false, charged: false, alive: true });
      if (p.t === 4 && cs.length >= 5 && rnd() < 0.45) bears.push({ x: cs[cs.length - 3].x + 4, y: cs[cs.length - 3].y, vy: 0, vx: -randi(14, 22), type: 'walk', g: true, t: rand(0, 1), dead: false, flip: false, alive: true });
    }
    nextX = x1; lastTop = prevGreenTop;
  }
  function genMoon(p) {
    moonPending = false;
    const r = clamp(Math.round(W * 0.46), 100, 150);
    const T = lastTop;
    const gap = 0.28 * p.speed;
    const cx = nextX + gap + r * 0.85;
    const cy = Math.max(T + 10 + 0.527 * r, baseY - r + 70);
    plats.push({ k: 'm', cx, cy, r, landed: false });
    // a few coins arcing over the moon
    for (let i = -3; i <= 3; i++) coins.push({ x: cx + i * 14, y: cy - Math.sqrt(r * r - (i * 14) * (i * 14)) - 22 });
    nextX = cx + r * 0.85; lastTop = clamp(cy - 0.527 * r, topMin(), topMax());
  }
  function boostY() { return Math.max(72, Math.round(playTop + playH * 0.5)); }

  // surface height of platform under x within tolerance; returns top or null
  function surf(pl, x, hw) {
    if (pl.k === 'c') { if (pl.red) return null; return (x + hw > pl.x && x - hw < pl.x + pl.w) ? pl.y : null; }
    const dx = x - pl.cx; if (Math.abs(dx) > pl.r * 0.88) return null;
    return pl.cy - Math.sqrt(pl.r * pl.r - dx * dx);
  }

  // ---------- run control ----------
  function startGame() {
    Snd.init();
    state = 'play'; stateT = 0; paused = false; pressing = false;
    resetRun();
    playZoneMusic('bar'); setRain(zoneRain(zone));
  }
  function startBoost() {
    cat.boost = BOOST_T; padMade = false; lev = 40; cat.g = false;
    // purge un-seen generated stuff so we can lay a landing pad & sky coins
    const edge = camX + W + 10;
    plats = plats.filter(p => p.k === 'm' || p.x < edge); coins = coins.filter(c => c.x < edge); bears = bears.filter(b => b.x < edge); powers = powers.filter(p => p.x < edge);
    const lastC = plats.filter(p => p.k === 'c' && !p.red).reduce((m, p) => Math.max(m, p.x + p.w), camX + W * 0.6);
    nextX = Math.min(nextX, Math.max(lastC, edge));
    banner = { big: '40x POWER!', small: '', t: 0, dur: 1.6, yellow: true };
    Snd.sfx('power'); Snd.music('boost', { q: 'beat' }); Snd.amb('rocket', 0.09); shake = 0.15;
  }
  function die(why) {
    if (cat.dead) return;
    lastDeath = why;
    if (DBG.god) { if (why === 'fell') { cat.y = boostY() + 40; cat.vy = 0; cat.inv = 1; } return; }
    cat.dead = true; cat.vy = why === 'fell' ? -120 : -260; cat.g = false; state = 'dying'; stateT = 0; shake = 0.35; lev = 1;
    Snd.stop(0.15); Snd.sfx('death'); Snd.amb('rocket', 0); setRain(0);
    for (let i = 0; i < 18; i++) parts.push({ x: cat.x, y: cat.y - 22, vx: rand(-90, 90), vy: rand(-140, 20), l: rand(0.4, 0.9), c: ['#FFCC00', '#ffffff', '#D9584E'][i % 3], s: 2 });
  }
  async function finishRun() {
    const sc = score(), runMs = Math.round(runT * 1000);
    const isBest = sc > best; if (isBest) { best = sc; LS.set('decicat_best', String(best)); }
    result = { score: sc, best, isBest, pending: true, rank: 0, top: [], id: null, zone };
    Snd.music('gameover', { q: 'now', then: 'results', restart: true });
    if (isBest && sc > 0) Snd.sfx('best');
    try { const r = await Scores.submit({ name: playerName(), score: sc, runMs }); Object.assign(result, r, { pending: false }); if (r.rank > 0 && !isBest) Snd.sfx('top10'); }
    catch (e) { result.pending = false; result.top = await local.top(); }
  }

  // ---------- input ----------
  const UI = { name: null, music: null, sfx: null, again: null, menu: null };
  const inRect = (r, x, y) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  function toLogical(e) { const b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * W, y: (e.clientY - b.top) / b.height * H }; }
  function press(lx, ly) {
    const hadAudio = !!(AU && AU.ctx && AU.ctx.state === 'running');
    Snd.init();
    if (lx !== undefined && inRect(UI.music, lx, ly) && !hadAudio && !Snd.musicOn) { AU.setMusic(true); AU.setSfx(true); Snd.sfx('click'); if (state === 'title') Snd.music('title', { q: 'now' }); return; }
    if (lx !== undefined && inRect(UI.music, lx, ly)) { Snd.toggleMusic(); Snd.sfx('click'); if (state === 'title') Snd.music('title', { q: 'now' }); return; }
    if (lx !== undefined && inRect(UI.sfx, lx, ly)) { Snd.toggleSfx(); Snd.sfx('click'); return; }
    if (state === 'title') {
      if (stateT < 0.25 || performance.now() - nameClosedAt < 350) return;
      if (lx !== undefined && inRect(UI.name, lx, ly)) { Snd.sfx('click'); Snd.music('title', { q: 'now' }); openNameEditor(); return; }
      Snd.sfx('click'); startGame(); return;
    }
    if (paused) { paused = false; Snd.resume(); return; }
    if (state === 'play') { pressing = true; jumpPress(); return; }
    if (state === 'over' && stateT > 0.7) {
      if (lx === undefined || inRect(UI.again, lx, ly)) { Snd.sfx('click'); startGame(); return; }
      if (inRect(UI.menu, lx, ly)) { Snd.sfx('click'); state = 'title'; stateT = 0.3; Snd.music('title', { q: 'now' }); return; }
    }
  }
  function release() { pressing = false; if (state === 'play') jumpRelease(); }
  function jumpPress() {
    if (cat.dead || cat.boost > 0) return;
    if (cat.g || cat.coy > 0) { doJump(JUMP); Snd.sfx('jump'); }
    else if (cat.air > 0) { cat.air--; doJump(DJUMP); Snd.sfx('djump'); for (let i = 0; i < 6; i++) parts.push({ x: cat.x + rand(-6, 6), y: cat.y, vx: rand(-30, 30), vy: rand(10, 50), l: 0.3, c: '#d8ccff', s: 1 }); }
    else cat.buf = 0.12;
  }
  function doJump(v) { cat.vy = -v; cat.g = false; cat.coy = 0; cat.holdT = 0; cat.rising = true; cat.buf = 0; }
  function jumpRelease() { if (cat.rising && cat.vy < -120 && cat.holdT > 0.07) cat.vy *= 0.5; cat.rising = false; }

  // Audio unlock: iOS/Safari only treats touchend / pointerup / click / keydown as user activation (not touchstart / touch pointerdown)
  const unlockAudio = () => { if (!REC && AU && AU.unlock) AU.unlock(); };
  ['pointerup', 'touchend', 'click', 'keydown', 'mousedown'].forEach(ev => document.addEventListener(ev, unlockAudio, { capture: true, passive: true }));
  cv.addEventListener('pointerdown', e => { e.preventDefault(); const p = toLogical(e); press(p.x, p.y); }, { passive: false });
  window.addEventListener('pointerup', e => { release(); });
  window.addEventListener('pointercancel', () => release());
  ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'dblclick', 'contextmenu'].forEach(ev => cv.addEventListener(ev, e => { if (e.cancelable) e.preventDefault(); }, { passive: false }));
  window.addEventListener('keydown', e => {
    if (nameOpen) return;
    const k = e.code;
    if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW' || k === 'Enter') { e.preventDefault(); if (!e.repeat) press(); }
    else if (k === 'KeyM') Snd.toggleAll();
    else if ((k === 'KeyP' || k === 'Escape') && state === 'play') { paused = !paused; if (paused) Snd.suspend(); else Snd.resume(); }
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') release(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (state === 'play') paused = true; Snd.suspend(); } else if (!paused) Snd.resume(); });
  window.addEventListener('blur', () => { if (state === 'play') { paused = true; Snd.suspend(); } });
  window.addEventListener('resize', () => { resize(); if (state === 'play' || state === 'dying') { cat.sx = Math.round(W * 0.27); } });

  // ---------- name editor (DOM overlay) ----------
  let nameOpen = false;
  const nameBox = document.getElementById('namebox'), nameIn = document.getElementById('namein'), nameMsg = document.getElementById('namemsg');
  function openNameEditor() {
    if (!nameBox) return;
    nameOpen = true; nameBox.style.display = 'flex'; nameIn.value = sanitizeName(LS.get('decicat_name')) || ''; nameIn.placeholder = anonName; nameMsg.textContent = 'Max 16 letters/numbers. Leave empty to stay anonymous.';
    setTimeout(() => nameIn.focus(), 30);
  }
  let nameClosedAt = 0;
  function closeNameEditor() { nameOpen = false; nameBox.style.display = 'none'; nameIn.blur(); nameClosedAt = performance.now(); }
  if (nameBox) {
    document.getElementById('namesave').onclick = () => {
      const v = nameIn.value.trim();
      if (!v) { LS.set('decicat_name', ''); closeNameEditor(); return; }
      const s = sanitizeName(v);
      if (s === null) { nameMsg.textContent = 'Please pick a friendlier name.'; return; }
      if (!s) { nameMsg.textContent = 'Use letters and numbers.'; return; }
      LS.set('decicat_name', s); Snd.sfx('confirm'); closeNameEditor();
    };
    document.getElementById('nameskip').onclick = () => { LS.set('decicat_name', ''); Snd.sfx('click'); closeNameEditor(); };
    nameIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') document.getElementById('namesave').click(); if (e.key === 'Escape') closeNameEditor(); });
    nameBox.addEventListener('pointerdown', e => e.stopPropagation());
  }

  // ---------- update ----------
  function update(dt) {
    gameClock += dt;
    stateT += dt;
    if (state === 'title' || state === 'over') { animBg(dt); updParts(dt); return; }
    if (paused) return;
    if (state === 'dying') {
      cat.vy = Math.min(cat.vy + GRAV * dt, MAXFALL); cat.y += cat.vy * dt; cat.rot += dt * 8;
      updParts(dt); shake = Math.max(0, shake - dt);
      if (stateT > 1.25) { state = 'over'; stateT = 0; finishRun(); }
      return;
    }
    // play
    if (DBG.bot) bot(dt);
    const p = zp(zone);
    runT += dt; zoneT += dt; powerTimer -= dt; zoneFade = Math.min(1, zoneFade + dt / 1.5);
    if (zoneT >= ZONE_T) {
      prevZone = zone; zone++; zoneT = 0; zoneFade = 0;
      banner = { big: zoneName(zone), small: 'ZONE ' + zone, t: 0, dur: 2.4 };
      if (ztype(zone) === 5) moonPending = true;
      Snd.sfx('zone'); if (cat.boost <= 0) playZoneMusic('bar', 'A'); setRain(zoneRain(zone));
    }
    const mul = cat.boost > 0 ? BOOST_MUL : 1;
    const v = p.speed * mul;
    // wind gusts
    if (p.wind) {
      gustTimer -= dt;
      if (gustT > 0) { gustT -= dt; if (gustT <= 0) gust = 0; }
      else if (gustTimer <= 0) { gust = rnd() < 0.75 ? -40 : 32; gustT = 1.6; Snd.sfx('gust'); gustTimer = rand(2.6, 4.6); }
    } else { gust = 0; gustT = 0; }
    // falling red candles
    if (p.fall && cat.boost <= 0 && runT > 2) {
      fallTimer -= dt;
      if (fallTimer <= 0) {
        fallTimer = rand(p.fall[0], p.fall[1]);
        // aim ahead of the cat so it lands (and sticks) before the cat arrives: dodge by jumping over
        const lead = p.speed * rand(1.75, 2.3);
        fallers.push({ x: cat.x + lead, y: playTop - 50, w: 15, h: randi(28, 36), vy: 0, warn: 0.6 }); Snd.sfx('warn');
      }
    }
    // sub-steps for robust collisions
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps && state === 'play'; i++) step(h, v, p);
    // generation / cleanup
    while (nextX < camX + W + 100) genCluster();
    const cut = camX - 60;
    plats = plats.filter(q => q.k === 'm' ? q.cx + q.r > cut : q.x + q.w > cut);
    coins = coins.filter(c => !c.taken && c.x > cut);
    powers = powers.filter(q => !q.taken && q.x > cut);
    bears = bears.filter(b => b.x > cut - 20 && b.y < baseY + 200 && b.alive);
    fallers = fallers.filter(f => f.y < H + 60 && !f.gone);
    updParts(dt); animBg(dt);
    shake = Math.max(0, shake - dt);
    if (banner) { banner.t += dt; if (banner.t > banner.dur) banner = null; }
    // cosmetic BTC wobble
    btcWob += dt;
  }

  function step(dt, v, p) {
    camX += v * dt; dist += v * dt;
    // horizontal: cat drifts with wind, then recovers toward its home screen x
    const sxNow = cat.x - camX;
    const rec = (cat.sx - sxNow) * 1.6;
    cat.x += (v + gust + rec) * dt;
    const sxc = cat.x - camX;
    if (sxc < W * 0.1) cat.x = camX + W * 0.1;
    if (sxc > W * 0.45) cat.x = camX + W * 0.45;
    cat.coy = Math.max(0, cat.coy - dt); cat.buf = Math.max(0, cat.buf - dt); cat.inv = Math.max(0, cat.inv - dt);
    cat.anim += dt * (cat.g ? v / 11 : 0);
    if (cat.boost > 0) {
      cat.boost -= dt;
      const ty = boostY() + Math.sin(runT * 5) * 4;
      cat.vy = clamp((ty - cat.y) * 5, -260, 260); cat.y += cat.vy * dt; cat.g = false;
      if (rnd() < 0.9) parts.push({ x: cat.x - 2 + rand(-4, 4), y: cat.y + rand(-2, 2), vx: rand(-60, -20) - v * 0.3, vy: rand(60, 150), l: rand(0.25, 0.5), c: ['#ffffff', '#FFE500', '#FFB000', '#ff6a2a', '#D9584E'][randi(0, 4)], s: rnd() < 0.3 ? 2 : 1 });
      // magnet
      for (const c of coins) { const dx = cat.x - c.x, dy = cat.y - 22 - c.y; const d = Math.hypot(dx, dy); if (d < 70 && d > 1) { c.x += dx / d * 220 * dt; c.y += dy / d * 220 * dt; } }
      if (cat.boost <= 0) { cat.boost = 0; cat.inv = 1.4; cat.vy = -40; cat.air = 1; lev = 1; Snd.sfx('boostEnd'); Snd.amb('rocket', 0); playZoneMusic('beat', 'A'); }
    } else {
      const prevY = cat.y;
      if (!cat.g) {
        let g = GRAV * (ztype(zone) === 5 ? 0.88 : 1);
        if (cat.rising && pressing && cat.vy < 0) g *= 0.62;
        if (cat.vy >= 0) cat.rising = false;
        cat.holdT += dt;
        cat.vy = Math.min(cat.vy + g * dt, MAXFALL);
        cat.y += cat.vy * dt;
        // landing
        if (cat.vy >= 0) {
          let best = null; const vyIn = cat.vy;
          for (const pl of plats) { const s = surf(pl, cat.x, 10); if (s !== null && prevY <= s + 2 && cat.y >= s) { if (best === null || s < best.s) best = { s, pl }; } }
          if (best) { land(best.s, best.pl); if (vyIn > 230) Snd.sfx('land'); }
        }
      } else {
        // stay grounded: find support (allows small step-ups and walking down slopes)
        let s0 = null, plg = null;
        for (const pl of plats) {
          const s = surf(pl, cat.x, 10);
          const up = pl.k === 'm' ? 20 : 16, down = pl.k === 'm' ? 8 : 3;
          if (s !== null && s >= cat.y - up && s <= cat.y + down) { if (s0 === null || s < s0) { s0 = s; plg = pl; } }
        }
        if (s0 === null) { cat.g = false; cat.coy = 0.1; cat.vy = 0; }
        else { cat.y = s0; if (plg.k === 'm') moonLand(plg); }
      }
    }
    // coins
    for (const c of coins) {
      if (c.taken) continue;
      if (Math.abs(c.x - cat.x) < 17 && Math.abs(c.y - (cat.y - 22)) < 26) {
        c.taken = true; bonus += 100; coinsN++; Snd.sfx('coin');
        const recent = floats.find(f => f.coin && f.t < 0.35);
        if (recent) { recent.n += 100; recent.s = '+' + recent.n; recent.t = 0; recent.x = cat.x; recent.y = cat.y - 36; }
        else floats.push({ x: cat.x + 4, y: cat.y - 36, t: 0, s: '+100', c: '#FFE500', coin: true, n: 100 });
        for (let i = 0; i < 5; i++) parts.push({ x: c.x, y: c.y, vx: rand(-40, 40), vy: rand(-60, 0), l: 0.3, c: '#FFF3A0', s: 1 });
      }
    }
    for (const pw of powers) {
      if (pw.taken) continue;
      if (Math.abs(pw.x - cat.x) < 21 && Math.abs(pw.y - (cat.y - 22)) < 28) { pw.taken = true; bonus += 400; floats.push({ x: pw.x, y: pw.y - 8, t: 0, s: '+400', c: '#FFE500' }); startBoost(); }
    }
    const hb = { x: cat.x - 10, y: cat.y - 38, w: 20, h: 35 };
    const hit = r => hb.x < r.x + r.w && hb.x + hb.w > r.x && hb.y < r.y + r.h && hb.y + hb.h > r.y;
    const invuln = cat.boost > 0 || cat.inv > 0 || DBG.god;
    // red candles
    for (const pl of plats) {
      if (pl.k !== 'c' || !pl.red || pl.gone) continue;
      if (hit({ x: pl.x + 2, y: pl.y + 2, w: pl.w - 4, h: pl.h - 3 })) {
        if (cat.boost > 0) { smash(pl.x + pl.w / 2, pl.y + pl.h / 2, '#D9584E'); pl.gone = true; bonus += 50; floats.push({ x: pl.x, y: pl.y, t: 0, s: '+50', c: '#ffffff' }); }
        else if (!invuln) { die('red'); return; }
      }
    }
    plats = plats.filter(q => !q.gone);
    // near miss: clearing a red candle by a hair
    if (cat.boost <= 0) for (const pl of plats) {
      if (pl.k !== 'c' || !pl.red || pl.nm) continue;
      const cx = pl.x + pl.w / 2;
      if (cat.x >= cx && cat.x - cx < 8 && cat.y <= pl.y && pl.y - cat.y < 12) { pl.nm = true; bonus += 50; Snd.sfx('near'); floats.push({ x: cat.x, y: cat.y - 56, t: 0, s: 'CLOSE! +50', c: '#ff9a8a' }); }
    }
    // fallers
    for (const f of fallers) {
      if (f.warn > 0) { f.warn -= dt; continue; }
      const fy0 = f.y;
      f.vy = Math.min(f.vy + 700 * dt, 420); f.y += f.vy * dt;
      for (const pl of plats) {
        if (pl.k !== 'c' || pl.red) continue;
        const s = surf(pl, f.x, 0);
        if (s !== null && fy0 + f.h * 0.7 <= s && f.y + f.h * 0.7 >= s) {
          const c = candle(f.x - f.w / 2, s - Math.round(f.h * 0.7), f.w, f.h, true); c.wt = 3; plats.push(c); f.gone = true;
          shake = Math.max(shake, 0.06); Snd.sfx('impact');
          for (let k = 0; k < 6; k++) parts.push({ x: f.x, y: s, vx: rand(-60, 60), vy: rand(-90, -20), l: 0.35, c: '#a8d8a2', s: 1 });
          break;
        }
      }
      if (f.gone) continue;
      if (hit({ x: f.x - f.w / 2 + 1, y: f.y, w: f.w - 2, h: f.h })) {
        if (cat.boost > 0) { smash(f.x, f.y + f.h / 2, '#D9584E'); f.gone = true; bonus += 50; }
        else if (!invuln) { die('fall'); return; }
      }
    }
    // bears
    for (const b of bears) {
      if (!b.alive) continue;
      updBear(b, dt);
      if (b.dead) continue;
      const br = { x: b.x - 11, y: b.y - 16, w: 22, h: 15 };
      if (hit(br)) {
        if (cat.boost > 0) { b.dead = true; b.vy = -200; Snd.sfx('smash'); bonus += 200; floats.push({ x: b.x, y: b.y - 20, t: 0, s: '+200', c: '#ffffff' }); }
        else if (!cat.g && cat.vy > 40 && cat.y - (b.y - 16) < 13) {
          b.dead = true; b.vy = -120; cat.vy = -280; cat.rising = true; cat.holdT = 0; cat.air = 1; bonus += 200; Snd.sfx('stomp');
          floats.push({ x: b.x, y: b.y - 22, t: 0, s: 'STOMP +200', c: '#ffffff' });
        }
        else if (!invuln) { die('bear'); return; }
      }
    }
    // fell off
    if (cat.y - 44 > baseY + 4) die('fell');
  }
  function land(s, pl) {
    cat.y = s; cat.vy = 0; cat.g = true; cat.air = 1; cat.rising = false;
    for (let i = 0; i < 3; i++) parts.push({ x: cat.x + rand(-6, 6), y: s, vx: rand(-30, 30), vy: rand(-30, -5), l: 0.25, c: '#cfc3ff', s: 1 });
    if (pl.k === 'm') moonLand(pl);
    if (cat.buf > 0) { doJump(JUMP); Snd.sfx('jump'); if (!pressing) jumpRelease(); }
  }
  function moonLand(pl) { if (!pl.landed) { pl.landed = true; moonSeen = true; banner = { big: 'TRADE LOUD.', small: '', t: 0, dur: 2.2, yellow: true }; bonus += 500; floats.push({ x: cat.x, y: cat.y - 54, t: 0, s: '+500', c: '#FFE500' }); Snd.sfx('zone'); } }
  function smash(x, y, c) { Snd.sfx('smash'); shake = Math.max(shake, 0.08); for (let i = 0; i < 10; i++) parts.push({ x, y, vx: rand(-120, 120), vy: rand(-120, 60), l: rand(0.3, 0.6), c, s: 2 }); }
  function updBear(b, dt) {
    b.t += dt;
    if (b.dead) { b.vy += GRAV * dt; b.y += b.vy * dt; b.x += 30 * dt; if (b.y > H + 40) b.alive = false; return; }
    const dx = b.x - cat.x;
    if (b.type === 'charge' && !b.charged && dx > 0 && dx < 120) { b.charged = true; b.vx = -88; Snd.sfx('growl'); floats.push({ x: b.x, y: b.y - 22, t: 0, s: '!', c: '#ff5a4a' }); }
    if (b.g) {
      // patrol: turn around at edges (chargers leap off edges instead)
      const ahead = b.x + Math.sign(b.vx) * 14;
      let sup = false; for (const pl of plats) { const s = surf(pl, ahead, 1); if (s !== null && Math.abs(s - b.y) < 12) { sup = true; break; } }
      if (!sup) { if (b.type === 'charge' && b.charged) { b.g = false; b.vy = -210; } else b.vx = -b.vx; }
      if (b.type === 'leap' && b.t > 1.3 && dx > -10 && dx < 140) { b.t = 0; b.g = false; b.vy = -230; }
    }
    b.flip = b.vx > 0;
    const prevY = b.y;
    b.x += b.vx * dt;
    if (!b.g) {
      b.vy = Math.min(b.vy + GRAV * dt, MAXFALL); b.y += b.vy * dt;
      if (b.vy > 0) for (const pl of plats) { const s = surf(pl, b.x, 8); if (s !== null && prevY <= s + 2 && b.y >= s) { b.y = s; b.vy = 0; b.g = true; break; } }
    } else {
      let s0 = null; for (const pl of plats) { const s = surf(pl, b.x, 8); if (s !== null && s >= b.y - 12 && s <= b.y + 3) { if (s0 === null || s < s0) s0 = s; } }
      if (s0 === null) { b.g = false; b.vy = 0; } else b.y = s0;
    }
  }
  function updParts(dt) {
    for (const q of parts) { q.l -= dt; q.vy += 300 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    parts = parts.filter(q => q.l > 0);
    for (const f of floats) f.t += dt;
    floats = floats.filter(f => f.t < 0.9);
  }

  // ---------- simple autoplay bot (debug/video only: ?bot) ----------
  let botHold = 0;
  function bot(dt) {
    if (botHold > 0) { botHold -= dt; if (botHold <= 0) release(); return; }
    if (cat.dead || cat.boost > 0) return;
    const p = zp(zone), look = p.speed * 0.16;
    const supAt = (x) => plats.some(pl => { const s = surf(pl, x, 1); return s !== null && Math.abs(s - cat.y) < 18; });
    const danger = () => {
      for (const pl of plats) if (pl.k === 'c' && pl.red && pl.x - cat.x > 0 && pl.x - cat.x < look + 10 && pl.y < cat.y && pl.y + pl.h > cat.y - 40) return true;
      for (const b of bears) if (!b.dead && b.x - cat.x > 0 && b.x - cat.x < look + 34 + (b.charged ? 30 : 0) && Math.abs(b.y - cat.y) < 20) return true;
      for (const f of fallers) if (Math.abs(f.x - (cat.x + 20)) < 16 && f.warn <= 0 && f.y < cat.y && f.y > cat.y - 120) return true;
      return false;
    };
    const pw = powers.find(q => !q.taken && q.x - cat.x > 0 && q.x - cat.x < look + 12);
    if (cat.g) {
      if (!supAt(cat.x + 13) || danger() || pw) { press(); botHold = 0.22; }
    } else if (cat.vy > 60 && cat.air > 0) {
      let below = false;
      for (const pl of plats) { for (let k = 0; k < 6; k++) { const s = surf(pl, cat.x + k * 10, 10); if (s !== null && s >= cat.y - 2 && s < baseY) below = true; } }
      if (!below) { press(); botHold = 0.2; }
    }
  }

  // ---------- background ----------
  let bgCache = {}, skyline = [];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function skyFor(zt) {
    if (bgCache[zt]) return bgCache[zt];
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const cols = ZONES[zt].sky.map(hex), n = cols.length - 1;
    for (let y = 0; y < H; y++) {
      const t = clamp(y / Math.max(1, baseY), 0, 1) * n;
      const i0 = Math.min(n - 1, Math.floor(t)); const f = t - i0;
      // quantise into 4 steps per band, dither between them
      for (let x = 0; x < W; x++) {
        const th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
        const ci = (f * 3 % 1) > th ? 1 : 0;
        const q = Math.min(3, Math.floor(f * 3) + ci) / 3;
        const a = cols[i0], b = cols[i0 + 1];
        const o = (y * W + x) * 4;
        d[o] = a[0] + (b[0] - a[0]) * q; d[o + 1] = a[1] + (b[1] - a[1]) * q; d[o + 2] = a[2] + (b[2] - a[2]) * q; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return (bgCache[zt] = c);
  }
  let stars = [];
  function buildSkyline() {
    const s0 = seed; seed = 4242;
    skyline = [[], []];
    for (let L = 0; L < 2; L++) { let x = 0; while (x < 512) { const w = randi(14, 34), h = L ? randi(14, 46) : randi(26, 70); skyline[L].push({ x, w, h, win: [] }); if (L) for (let k = 0; k < 3; k++) if (rnd() < 0.5) skyline[L][skyline[L].length - 1].win.push([randi(2, w - 3), randi(4, h - 3)]); x += w; } }
    stars = []; for (let i = 0; i < 90; i++) stars.push({ x: rand(0, 1), y: rand(0, 1), b: rnd(), tw: rand(0, 6) });
    seed = s0;
  }
  let bgT = 0, rain = [];
  function animBg(dt) { bgT += dt; }
  function drawBgZone(zt, alpha) {
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(skyFor(zt), 0, 0);
    // stars
    const dense = zt === 5 ? 1 : 0.6;
    for (let i = 0; i < stars.length * dense; i++) {
      const s = stars[i]; const sx = ((s.x * W * 2 - camX * 0.03) % W + W) % W; const sy = s.y * baseY * 0.85;
      const tw = Math.sin(bgT * 2 + s.tw) > 0.6;
      ctx.fillStyle = s.b > 0.85 ? '#FFE500' : '#ffffff';
      if (s.b > 0.93 && tw) { ctx.fillRect(sx - 1, sy, 3, 1); ctx.fillRect(sx, sy - 1, 1, 3); }
      else if (s.b > 0.3 || tw) ctx.fillRect(sx, sy, 1, 1);
    }
    const Z = ZONES[zt];
    if (zt === 5) {
      // distant decibel moon
      drawMoon(W - 30, Math.round(playTop + playH * 0.22), 12, true);
    }
    if (Z.city) {
      for (let L = 0; L < 2; L++) {
        const par = L ? 0.22 : 0.08; ctx.fillStyle = Z.city[L];
        const off = (camX * par) % 512;
        for (let rep = -1; rep < Math.ceil(W / 512) + 1; rep++) for (const b of skyline[L]) {
          const x = Math.floor(b.x - off + rep * 512); if (x > W || x + b.w < 0) continue;
          ctx.fillRect(x, baseY - b.h - (L ? 0 : 14), b.w, b.h + (L ? 0 : 14)); 
          if (L) { ctx.fillStyle = 'rgba(255,229,0,0.35)'; for (const w of b.win) ctx.fillRect(x + w[0], baseY - b.h + w[1], 1, 1); ctx.fillStyle = Z.city[L]; }
        }
      }
      ctx.fillStyle = Z.city[1]; ctx.fillRect(0, baseY, W, H - baseY);
    } else {
      ctx.fillStyle = '#05030c'; ctx.fillRect(0, baseY, W, H - baseY);
    }
    ctx.globalAlpha = 1;
  }
  function drawBackground() {
    const zt = ztype(zone);
    if (zoneFade < 1) drawBgZone(ztype(prevZone), 1);
    drawBgZone(zt, zoneFade < 1 ? zoneFade : 1);
    // weather
    if (zt === 2 && state !== 'title') {
      ctx.fillStyle = 'rgba(190,200,255,0.55)';
      const slant = 1 + (gust < 0 ? 3 : 0);
      for (let i = 0; i < 60; i++) {
        const x = ((i * 53.7 + bgT * (60 + slant * 40) * (i % 3 + 1) - camX * 0.6) % (W + 20) + W + 20) % (W + 20) - 10;
        const y = ((i * 97.3 + bgT * 260 * (1 + (i % 2) * 0.5)) % (baseY + 10));
        ctx.fillRect(x, y, 1, 4); if (slant > 1) ctx.fillRect(x - 1, y + 3, 1, 3);
      }
    }
    if (zt === 3 && state !== 'title') {
      ctx.fillStyle = 'rgba(255,110,90,0.35)';
      for (let i = 0; i < 30; i++) { const x = ((i * 71.3 - camX * 0.3) % W + W) % W; const y = (i * 37.7 + bgT * 40 * (1 + i % 3)) % baseY; ctx.fillRect(x, y, 1, 2); }
    }
    if (zt === 2) drawCloud(((W * 0.7 - bgT * 6) % (W + 60) + W + 60) % (W + 60) - 30, playTop + 52, '#5a5f8f', '#43477a');
    else if (zt === 1) drawCloud(((W * 0.15 - camX * 0.05) % (W + 60) + W + 60) % (W + 60) - 30, playTop + 46, '#6a5aa8', '#54468c');
  }
  function drawCloud(x, y, c1, c2) {
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = c2; ctx.fillRect(x, y + 4, 34, 7); ctx.fillRect(x + 4, y + 2, 26, 11);
    ctx.fillStyle = c1; ctx.fillRect(x + 6, y, 10, 8); ctx.fillRect(x + 14, y - 2, 12, 9); ctx.fillRect(x + 2, y + 4, 28, 5);
  }
  function drawMoon(cx, cy, r, small) {
    cx = Math.round(cx); cy = Math.round(cy);
    // filled circle via spans, with rim shading + logo blobs
    for (let y = -r; y <= r; y++) {
      const hw = Math.floor(Math.sqrt(r * r - y * y));
      if (cy + y < -2 || cy + y > H + 2) continue;
      ctx.fillStyle = '#FFE500'; ctx.fillRect(cx - hw, cy + y, hw * 2 + 1, 1);
      ctx.fillStyle = '#D9A800'; ctx.fillRect(cx + hw - Math.max(1, Math.round(r * 0.06)), cy + y, Math.max(1, Math.round(r * 0.06)), 1); ctx.fillRect(cx - hw, cy + y, 1, 1);
    }
    // Decibel-style blobs (left tall blob + two tilted blobs on the right)
    const blob = (bx, by, rx, ry, rot) => {
      ctx.fillStyle = '#111111';
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const R = Math.ceil(Math.max(rx, ry));
      for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) {
        const u = (xx * cs + yy * sn) / rx, v = (-xx * sn + yy * cs) / ry;
        if (u * u + v * v <= 1) ctx.fillRect(Math.round(cx + bx * r + xx), Math.round(cy + by * r + yy), 1, 1);
      }
    };
    if (small) { blob(-0.42, 0, 0.12 * r, 0.26 * r, 0); blob(0.2, -0.35, 0.26 * r, 0.14 * r, 0.5); blob(0.2, 0.35, 0.26 * r, 0.14 * r, -0.5); return; }
    // big moon: cache blobs to an offscreen canvas for speed
    const key = 'm' + r;
    if (!bgCache[key]) {
      const c = document.createElement('canvas'); c.width = c.height = r * 2 + 2; const g = c.getContext('2d'); g.fillStyle = '#111';
      const B = (bx, by, rx, ry, rot) => { const cs = Math.cos(rot), sn = Math.sin(rot), R = Math.ceil(Math.max(rx, ry)); for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) { const u = (xx * cs + yy * sn) / rx, v = (-xx * sn + yy * cs) / ry; const wob = 1 + 0.12 * Math.sin(xx * 0.7 + yy * 0.5); if (u * u + v * v <= wob) g.fillRect(Math.round(r + bx * r + xx), Math.round(r + by * r + yy), 1, 1); } };
      B(-0.42, 0.02, 0.13 * r, 0.27 * r, 0.05); B(0.2, -0.36, 0.27 * r, 0.14 * r, 0.5); B(0.22, 0.36, 0.27 * r, 0.14 * r, -0.5);
      bgCache[key] = c;
    }
    ctx.drawImage(bgCache[key], cx - r, cy - r);
  }

  // ---------- draw world ----------
  function drawCandle(c, sx) {
    const x = Math.round(c.x - sx), y = Math.round(c.y);
    if (x > W + 4 || x + c.w < -4) return;
    const red = c.red;
    const fill = red ? '#D9584E' : '#7FB77E', hi = red ? '#ee8070' : '#a8d8a2', lo = red ? '#9b3a33' : '#4f8a52', out = red ? '#5a1f1c' : '#2c5a33';
    const mx = x + Math.floor(c.w / 2);
    ctx.fillStyle = out; ctx.fillRect(mx, y - c.wt, 1, c.wt); ctx.fillRect(mx, y + c.h, 1, c.wb);
    ctx.fillRect(x, y, c.w, c.h);
    ctx.fillStyle = fill; ctx.fillRect(x + 1, y + 1, c.w - 2, c.h - 2);
    ctx.fillStyle = hi; ctx.fillRect(x + 1, y + 1, c.w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, c.h - 2);
    ctx.fillStyle = lo; ctx.fillRect(x + c.w - 2, y + 2, 1, c.h - 3);
  }
  function drawWorld() {
    const sx = camX;
    for (const pl of plats) {
      if (pl.k === 'm') { if (pl.cx - sx + pl.r > -4 && pl.cx - sx - pl.r < W + 4) drawMoon(pl.cx - sx, pl.cy, pl.r, false); }
      else drawCandle(pl, sx);
    }
    // coins
    const cf = ['c1', 'c2', 'c3', 'c2'][Math.floor(bgT * 8) % 4];
    for (const c of coins) { if (c.taken) continue; const x = c.x - sx; if (x < -8 || x > W + 8) continue; const im = S.coin[cf]; drawSpr(im, Math.round(x) - (im.width >> 1), c.y - 4); }
    // power boxes
    for (const pw of powers) {
      if (pw.taken) continue; const x = Math.round(pw.x - sx - 13), y = Math.round(pw.y - 8 + Math.sin(bgT * 4) * 2);
      if (x < -30 || x > W + 4) continue;
      ctx.fillStyle = '#3a2500'; ctx.fillRect(x - 1, y - 1, 28, 18);
      ctx.fillStyle = (Math.floor(bgT * 6) % 2) ? '#FFD21F' : '#E8B000'; ctx.fillRect(x, y, 26, 16);
      ctx.fillStyle = '#FFF3A0'; ctx.fillRect(x, y, 26, 1); ctx.fillRect(x, y, 1, 16);
      ctx.fillStyle = '#b07800'; ctx.fillRect(x + 1, y + 15, 25, 1); ctx.fillRect(x + 25, y + 1, 1, 15);
      text('40x', x + 5, y + 5, '#3a2500');
    }
    // bears
    for (const b of bears) {
      if (!b.alive) continue; const x = b.x - sx; if (x < -34 || x > W + 34) continue;
      const fr = b.g ? (Math.floor(b.t * 7) % 2 ? S.bear.walk1 : S.bear.walk2) : S.bear.walk1;
      if (b.dead) { ctx.save(); ctx.translate(Math.round(x), Math.round(b.y - 10)); ctx.scale(1, -1); ctx.drawImage(fr, -15, -10); ctx.restore(); }
      else drawSpr(fr, x - 15, b.y - 19, b.flip);
    }
    // falling candles + warnings
    for (const f of fallers) {
      const x = f.x - sx;
      if (f.warn > 0) {
        if (Math.floor(f.warn * 10) % 2 === 0) { const wy = Math.max(playTop + 26, 26); ctx.fillStyle = '#D9584E'; ctx.fillRect(Math.round(x) - 4, wy, 9, 11); text('!', Math.round(x) - 2, wy + 2, '#ffffff'); }
      } else drawCandle({ x: f.x - f.w / 2, y: f.y, w: f.w, h: f.h, red: true, wt: 4, wb: 5 }, sx);
    }
    // cat
    drawCat(cat.x - sx, cat.y);
    // particles
    for (const q of parts) { ctx.globalAlpha = clamp(q.l * 3, 0, 1); ctx.fillStyle = q.c; ctx.fillRect(Math.round(q.x - sx), Math.round(q.y), q.s, q.s); }
    ctx.globalAlpha = 1;
    for (const f of floats) text(f.s, Math.round(f.x - sx), Math.round(f.y - f.t * 22), f.c, { align: 'center', shadow: '#1a0f30' });
  }
  function drawCat(x, y) {
    if (y < 20 && !cat.dead && state === 'play') { ctx.fillStyle = '#ffcc00'; const ax = Math.round(x); for (let i = 0; i < 4; i++) ctx.fillRect(ax - i, 2 + i, 1 + 2 * i, 1); } // off-top marker
    let fr;
    const runF = [S.cat.run1, S.cat.run2, S.cat.run3, S.cat.run4];
    if (cat.dead) fr = S.cat.dead;
    else if (cat.boost > 0 || !cat.g) fr = S.cat.jump;
    else fr = runF[Math.floor(cat.anim) % 4];
    if (cat.inv > 0 && cat.boost <= 0 && Math.floor(cat.inv * 12) % 2 === 0) return;
    if (cat.dead) { ctx.save(); ctx.translate(Math.round(x), Math.round(y - 23)); ctx.rotate(Math.round(cat.rot * 4) / 4 * Math.PI / 2); ctx.drawImage(fr, -19, -23); ctx.restore(); return; }
    const X = Math.round(x), Y = Math.round(y);
    if (cat.boost > 0) { // twin rocket flames
      const fl = Math.floor(bgT * 20) % 2;
      for (const ox of [-11, 6]) {
        ctx.fillStyle = '#D9584E'; ctx.fillRect(X + ox, Y - 2, 6, 9 + fl * 3);
        ctx.fillStyle = '#ff8a2a'; ctx.fillRect(X + ox + 1, Y - 2, 4, 7 + fl * 2);
        ctx.fillStyle = '#FFE500'; ctx.fillRect(X + ox + 1, Y - 2, 4, 4 + fl);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(X + ox + 2, Y - 2, 2, 2);
      }
    }
    if (cat.boost > 0 && Math.floor(bgT * 10) % 4 === 0) { ctx.globalAlpha = 0.5; drawSpr(S.catWhite, X - 19, Y - 46); ctx.globalAlpha = 1; }
    drawSpr(fr, X - 19, Y - 46);
  }

  // ---------- HUD & screens ----------
  function drawToggles() {
    const y = state === 'play' || state === 'dying' ? 14 : 4;
    // speaker (sfx)
    let x = W - 13;
    UI.sfx = { x: x - 3, y: y - 4, w: 15, h: 16 };
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y + 2, 2, 3); ctx.fillRect(x + 2, y + 1, 1, 5); ctx.fillRect(x + 3, y, 1, 7);
    if (!Snd.sfxOn) { ctx.fillStyle = '#ff5a4a'; for (let i = 0; i < 5; i++) { ctx.fillRect(x + 5 + i, y + 1 + i, 1, 1); ctx.fillRect(x + 9 - i, y + 1 + i, 1, 1); } }
    else { ctx.fillRect(x + 5, y + 2, 1, 3); ctx.fillRect(x + 7, y + 1, 1, 5); }
    // music note
    x = W - 30;
    UI.music = { x: x - 3, y: y - 4, w: 15, h: 16 };
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 3, y, 1, 6); ctx.fillRect(x + 7, y - 1, 1, 6); ctx.fillRect(x + 3, y - 1, 5, 1); ctx.fillRect(x + 3, y, 5, 1);
    ctx.fillRect(x + 1, y + 5, 3, 2); ctx.fillRect(x + 5, y + 4, 3, 2);
    if (!Snd.musicOn) { ctx.fillStyle = '#ff5a4a'; for (let i = 0; i < 9; i++) ctx.fillRect(x + i, y - 1 + i, 1, 1); }
  }
  function drawHUD() {
    const sc = score();
    text('SCORE ' + pad6(sc), 4, 4, '#ffffff', { shadow: '#140b26' });
    text('LEV ' + (lev >= 40 ? '40x' : ' 1x'), 4, 14, lev >= 40 ? '#FFE500' : '#FFE500', { shadow: '#140b26' });
    const btc = 84047 + sc * 4.1 + Math.sin(btcWob * 1.7) * 12 + Math.sin(btcWob * 4.3) * 5;
    text('BTC $' + commas(btc), W - 4, 4, '#a8e6a1', { align: 'right', shadow: '#140b26' });
    drawToggles();
    if (cat.boost > 0) { // boost meter
      const w = 40, x = Math.round(W / 2 - w / 2);
      ctx.fillStyle = '#3a2500'; ctx.fillRect(x - 1, 5, w + 2, 5); ctx.fillStyle = '#FFE500'; ctx.fillRect(x, 6, Math.round(w * cat.boost / BOOST_T), 3);
    }
    if (gustT > 0 && Math.floor(bgT * 6) % 2 === 0) text(gust < 0 ? '<< GUST' : 'GUST >>', W / 2, playTop + 30, '#cfd6ff', { align: 'center', shadow: '#0b0f22' });
  }
  function drawBanner() {
    if (!banner) return;
    const t = banner.t, a = t < 0.2 ? t / 0.2 : t > banner.dur - 0.3 ? (banner.dur - t) / 0.3 : 1;
    const y = Math.round(Math.max(playTop + 48, 44) + (1 - Math.min(1, t / 0.2)) * -10);
    ctx.globalAlpha = clamp(a, 0, 1);
    if (banner.small) text(banner.small, W / 2, y - 11, '#FFE500', { align: 'center', shadow: '#140b26' });
    const sc = textW(banner.big, 2, true) > W - 8 ? 1 : 2;
    text(banner.big, W / 2, y, banner.yellow ? '#FFE500' : '#ffffff', { align: 'center', scale: sc, bold: true, shadow: banner.yellow ? '#8a3fb0' : '#2a1d4a' });
    ctx.globalAlpha = 1;
  }
  function easeBounce(t) { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; }
  function drawTitle() {
    const T = DBG.poster ? 99 : stateT;
    const word = 'DECICAT', sc = W >= 300 && H >= 300 ? 4 : 3, adv = 7 * sc;
    const tw = word.length * adv - sc, x0 = Math.round(W / 2 - tw / 2);
    const ty = Math.round(playTop + Math.max(26, playH * 0.13));
    for (let i = 0; i < word.length; i++) {
      const lt = clamp((T - 0.15 - i * 0.13) / 0.55, 0, 1); if (lt <= 0) continue;
      const y = Math.round(-30 + (ty + 30) * easeBounce(lt));
      text(word[i], x0 + i * adv, y, i === 4 || i === 5 ? '#ffffff' : '#FFE500', { scale: sc, bold: true, shadow: '#8a2fb8', sx: 0, sy: sc });
    }
    const subY = ty + 7 * sc + 10;
    if (T > 1.2) {
      const n = DBG.poster ? 99 : Math.floor((T - 1.2) * 30);
      text('A DECIBEL ADVENTURE'.slice(0, n), W / 2 - textW('A DECIBEL ADVENTURE') / 2, subY, '#d9d0ff', { shadow: '#2a1d4a' });
    }
    // ground line + cat
    const gy = baseY - 30;
    ctx.fillStyle = '#5b4596'; ctx.fillRect(0, gy, W, 1);
    ctx.fillStyle = '#1a1030'; ctx.fillRect(0, gy + 1, W, H - gy - 1);
    const csc = 2;
    drawSpr((Math.floor(T * 1.6) % 2 && !DBG.poster) ? S.cat.idle2 : S.cat.idle, Math.round(W / 2 - 19 * csc), gy - 46 * csc, false, csc);
    if (DBG.poster) { text('HOW LONG CAN YOU LAST?', W / 2, subY + 22, '#FFE500', { align: 'center', shadow: '#2a1d4a' }); text('TAP TO PLAY', W / 2, gy + 9, '#ffffff', { align: 'center', bold: true, shadow: '#2a1d4a' }); text('ART & IDEA BY @DONCASTRO', W / 2, H - 10, '#9a8ccc', { align: 'center' }); return; }
    if (T > 1.6) {
      // name pill
      const nm = 'PLAYER: ' + playerName().toUpperCase();
      const nw = textW(nm) + 26, nx = Math.round(W / 2 - nw / 2), ny = subY + 16;
      UI.name = { x: nx - 2, y: ny - 4, w: nw + 4, h: 17 };
      ctx.fillStyle = '#1a1030'; ctx.fillRect(nx, ny - 2, nw, 13);
      ctx.fillStyle = '#6b55b0'; ctx.fillRect(nx, ny - 2, nw, 1); ctx.fillRect(nx, ny + 10, nw, 1); ctx.fillRect(nx, ny - 2, 1, 13); ctx.fillRect(nx + nw - 1, ny - 2, 1, 13);
      text(nm, nx + 4, ny + 1, '#ffffff');
      // pencil icon
      const px = nx + nw - 13, py = ny + 1; ctx.fillStyle = '#FFE500'; for (let i = 0; i < 6; i++) ctx.fillRect(px + i, py + 6 - i, 2, 1); ctx.fillStyle = '#ff9ab0'; ctx.fillRect(px + 6, py, 2, 1);
      if (best > 0) text('BEST ' + pad6(best), W / 2, ny + 16, '#a8e6a1', { align: 'center' });
      if (Math.floor(T * 2.2) % 2 === 0) text('TAP TO START', W / 2, gy + 9, '#ffffff', { align: 'center', bold: true, shadow: '#2a1d4a' });
    }
    text('ART & IDEA BY @DONCASTRO', W / 2, H - 10, '#9a8ccc', { align: 'center' });
  }
  function drawOver() {
    ctx.fillStyle = 'rgba(8,4,18,0.82)'; ctx.fillRect(0, 0, W, H);
    const top = Math.max(0, Math.round((H - 240) / 2));
    let y = top + 8;
    const lsc = textW('LIQUIDATED', 2, true) <= W - 8 ? 2 : 1;
    text('LIQUIDATED', W / 2, y, '#ff5a4a', { align: 'center', scale: lsc, bold: true, shadow: '#3a0a0a' });
    y += 20;
    if (!result) return;
    text('SCORE ' + pad6(result.score) + (result.isBest ? '  NEW BEST!' : ''), W / 2, y, result.isBest ? '#FFE500' : '#ffffff', { align: 'center' });
    y += 11;
    let msg = result.pending ? 'SAVING...' : result.rank > 0 ? 'YOU PLACED #' + result.rank + '!' : 'NOT TOP 10 - BEST: ' + pad6(result.best);
    text(msg, W / 2, y, result.rank > 0 ? '#a8e6a1' : '#d9d0ff', { align: 'center' });
    if (Scores.offline) text('(OFFLINE - SAVED ON THIS DEVICE)', W / 2, y + 8, '#7d70b0', { align: 'center' }), y += 4;
    y += 13;
    // table
    const rowW = 27 * 6, tx = Math.round(W / 2 - rowW / 2);
    text('- TOP 10 -', W / 2, y, '#FFE500', { align: 'center' }); y += 10;
    for (let i = 0; i < 10; i++) {
      const e = result.top[i];
      const mine = e && result.id && e.id === result.id;
      if (mine) { ctx.fillStyle = (Math.floor(bgT * 3) % 2) ? '#6b4b00' : '#553c00'; ctx.fillRect(tx - 3, y - 1, rowW + 6, 9); }
      const col = mine ? '#FFE500' : (i < 3 ? '#ffffff' : '#bdb3e6');
      const rank = String(i + 1).padStart(2, ' ') + '.';
      text(rank, tx, y, col);
      text(e ? String(e.name).toUpperCase().slice(0, 16) : '---', tx + 21, y, e ? col : '#5b4f8a');
      text(e ? pad6(e.score) : '', tx + rowW, y, col, { align: 'right' });
      y += 9;
    }
    y += 6;
    // buttons
    const bw = 96, bx = Math.round(W / 2 - bw / 2);
    UI.again = { x: bx - 4, y: y - 4, w: bw + 8, h: 24 };
    const blink = stateT > 0.7;
    ctx.fillStyle = '#5a3a00'; ctx.fillRect(bx - 1, y - 1, bw + 2, 18);
    ctx.fillStyle = blink ? '#FFE500' : '#8a7a30'; ctx.fillRect(bx, y, bw, 16);
    ctx.fillStyle = '#FFF3A0'; ctx.fillRect(bx, y, bw, 1);
    text('PLAY AGAIN', W / 2, y + 5, '#2a1a00', { align: 'center', bold: true });
    y += 21;
    UI.menu = { x: W / 2 - 24, y: y - 3, w: 48, h: 13 };
    text('MENU', W / 2, y, '#9a8ccc', { align: 'center' });
    if (H - y > 30) { text('TRADE LOUD ON DECIBEL', W / 2, y + 14, '#FFE500', { align: 'center' }); }
    text('DECICAT ART & IDEA BY @DONCASTRO', W / 2, Math.min(H - 9, top + 232), '#7d70b0', { align: 'center' });
  }
  function drawPause() {
    ctx.fillStyle = 'rgba(8,4,18,0.7)'; ctx.fillRect(0, 0, W, H);
    text('PAUSED', W / 2, H / 2 - 14, '#FFE500', { align: 'center', scale: 2, bold: true, shadow: '#2a1d4a' });
    text('TAP TO RESUME', W / 2, H / 2 + 8, '#ffffff', { align: 'center' });
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sh = shake > 0 ? Math.round(rand(-2, 2) * shake * 6) : 0;
    ctx.translate(sh, Math.round(sh * 0.5));
    drawBackground();
    if (state === 'title') { drawTitle(); if (!DBG.poster) drawToggles(); return; }
    drawWorld();
    if (state === 'play' || state === 'dying') { drawBanner(); drawHUD(); }
    if (state === 'over') { drawOver(); drawToggles(); }
    if (paused && state === 'play') drawPause();
  }

  // ---------- loop ----------
  let last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (DBG.manual) return;
    const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016); last = ts;
    update(dt); render();
  }
  resize();
  if (DBG.autostart) startGame();
  requestAnimationFrame(frame);

  // test / debug hooks
  window.__decicat = {
    get rec() { return REC; }, get stats() { return { dist: Math.floor(dist / 2), bonus, coinsN, runT: +runT.toFixed(1) }; }, get state() { return state; }, get paused() { return paused; }, get score() { return score(); }, get zone() { return zone; }, get boost() { return cat.boost; },
    get result() { return result; }, get death() { return lastDeath; }, get size() { return [W, H, SCALE]; },
    advance(n, dt) { dt = dt || 1 / 60; for (let i = 0; i < n; i++) update(dt); render(); },
    press: (x, y) => press(x, y), release, start: startGame, boost: startBoost,
    get ui() { return UI; }, get audio() { const A = D.Audio; return A && { ctx: A.ctx ? A.ctx.state : null, song: A.cur ? A.cur.name : null, music: A.musicOn, sfx: A.sfxOn }; },
    kill: () => die('test'), Scores, LocalScores, RemoteScores, sanitizeName
  };
})(window.DECICAT);
