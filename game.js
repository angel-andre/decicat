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
    manual: Q.has('manual'), poster: Q.has('poster'), autostart: Q.has('autostart'), nogate: Q.has('nogate'),
    seed: Q.has('seed') ? (parseInt(Q.get('seed'), 10) || 1) : 0
  };

  // ---------- ?mem debug overlay instrumentation (off by default) ----------
  const MEM = Q.has('mem') ? (function () {
    const st = { cvRefs: [], aCreated: 0, aLive: 0, acs: 0 };
    const ce = Document.prototype.createElement;
    Document.prototype.createElement = function (t, ...r) { const e = ce.call(this, t, ...r); if (String(t).toLowerCase() === 'canvas') st.cvRefs.push(new WeakRef(e)); return e; };
    const fr = typeof FinalizationRegistry !== 'undefined' ? new FinalizationRegistry(() => { st.aLive--; }) : null;
    const P = (window.BaseAudioContext || window.AudioContext || function () { }).prototype;
    for (const k of Object.getOwnPropertyNames(P)) {
      if (!/^create/.test(k) || k === 'createBuffer' || k === 'createPeriodicWave') continue;
      const f = P[k]; if (typeof f !== 'function') continue;
      P[k] = function (...a) { const n = f.apply(this, a); st.aCreated++; st.aLive++; if (fr) fr.register(n, 0); return n; };
    }
    st.canvases = () => { let n = 0, a = 0; st.cvRefs = st.cvRefs.filter(r => { const c = r.deref(); if (c) { n++; a += c.width * c.height; } return !!c; }); return { n, mpx: a / 1e6 }; };
    return st;
  })() : null;

  // ---------- utils ----------
  const VERSION = 'v4.0';
  const cryptoSeed = () => (window.crypto && crypto.getRandomValues) ? (crypto.getRandomValues(new Uint32Array(1))[0] | 0) || 1 : ((Math.random() * 2147483647) | 0) || 1;
  let seed = DBG.seed || cryptoSeed();
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
    let w = Math.ceil(dw / s), h = Math.ceil(dh / s);
    if (w > h * 2.6) w = Math.ceil(h * 2.6);
    SCALE = s;
    applyLogical(w, h);
    const sw = W * s / dpr, sh = H * s / dpr;
    cv.style.width = sw + 'px'; cv.style.height = sh + 'px';
    cv.style.left = Math.floor((cw - sw) / 2) + 'px'; cv.style.top = Math.floor((ch - sh) / 2) + 'px';
  }
  // logical (game) resolution only: the canvas backing store is W x H (e.g. 427x240), the browser upscales it with CSS
  function applyLogical(w, h) {
    W = w; H = h;
    if (cv.width !== W) cv.width = W; if (cv.height !== H) cv.height = H;
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
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = color;
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
    x = Math.round(x); y = Math.round(y); // never draw glyphs at sub-pixel positions (that squashes/duplicates columns)
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
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { let p = pal[r[x]]; if (typeof p === 'function') p = p(y); if (p) { g.fillStyle = p; g.fillRect(x, y, 1, 1); } } });
    return c;
  }
  const S = {};
  for (const k in D.SPR) { S[k] = {}; for (const f in D.SPR[k].frames) S[k][f] = makeSprite(D.SPR[k].frames[f], D.SPR[k].pal); }
  // white flash version of the cat (for boost glow)
  S.catWhite = makeSprite(D.SPR.cat.frames.jump, { K: '#fff', Y: '#fff', L: '#fff', D: '#fff', G: '#fff', g: '#fff' });
  // power-up icons (9x9)
  S.pw = {
    shield: makeSprite(['.ooooooo.', 'oBBBBBBBo', 'oBwwwwwBo', 'oBwBBBBBo', 'oBwwwwwBo', 'oBBBBBwBo', '.oBwwwwo.', '..oBBBo..', '...ooo...'], { o: '#0c2a52', B: '#3a8ee8', w: '#ffffff' }),
    mag: makeSprite(['.ww...ww.', '.ww...ww.', '.rr...rr.', '.rr...rr.', '.rr...rr.', '.rrr.rrr.', '..rrrrr..', '...rrr...', '.........'], { w: '#e8e8f0', r: '#ff4a4a' }),
    slow: makeSprite(['..ooooo..', '.oWWWWWo.', 'oWWWkWWWo', 'oWWWkWWWo', 'oWWWkkkWo', 'oWWWWWWWo', 'oWWWWWWWo', '.oWWWWWo.', '..ooooo..'], { o: '#8a6a10', W: '#ffe680', k: '#2a1a00' }),
    dia: makeSprite(['..ccccc..', '.cWCcCWc.', 'cCCCCCCCc', '.cCCCCCc.', '..cCCCc..', '...cCc...', '....c....', '.........', '.........'], { c: '#1a8a9a', C: '#8ff6ff', W: '#ffffff' })
  };

  function drawSpr(img, x, y, flip, sc) {
    sc = sc || 1;
    if (flip) { ctx.save(); ctx.translate(Math.round(x) + img.width * sc, Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, img.width * sc, img.height * sc); ctx.restore(); }
    else ctx.drawImage(img, Math.round(x), Math.round(y), img.width * sc, img.height * sc);
  }

  // ---------- audio (music + sfx engine lives in audio.js) ----------
  const AU = D.Audio;
  let gameClock = 0, MUTE = false; const REC = Q.has('record') ? [] : null;
  const Snd = {
    init() { if (!REC && AU) AU.init(); },
    get musicOn() { return AU ? AU.musicOn : false; }, get sfxOn() { return AU ? AU.sfxOn : false; },
    sfx(name) { if (MUTE) return; if (REC) { REC.push({ t: gameClock, k: 'sfx', name }); return; } if (AU) AU.sfx(name); },
    music(name, opt) { if (MUTE) return; if (REC) { REC.push({ t: gameClock, k: 'music', name, opt }); return; } if (AU) AU.music(name, opt); },
    stop(fade) { if (MUTE) return; if (REC) { REC.push({ t: gameClock, k: 'stop', fade }); return; } if (AU) AU.stopMusic(undefined, fade); },
    amb(name, level) { if (MUTE) return; if (REC) { REC.push({ t: gameClock, k: 'amb', name, level }); return; } if (AU) AU.ambience(name, level); },
    toggleMusic() { if (AU) AU.setMusic(!AU.musicOn); }, toggleSfx() { if (AU) AU.setSfx(!AU.sfxOn); },
    toggleAll() { if (!AU) return; const on = !(AU.musicOn || AU.sfxOn); AU.setMusic(on); AU.setSfx(on); },
    suspend() { if (!REC && AU) AU.suspend(); }, resume() { if (!REC && AU) AU.resume(); }
  };
  let rainLvl = 0;
  function setRain(l) { if (l !== rainLvl) { rainLvl = l; Snd.amb('rain', l); } }
  function zoneRain(z) { const t = ztype(z); return t === 2 ? 0.09 : t === 3 ? 0.06 : 0; }
  function zoneTrack(z) { const L = zloop(z); return ['z' + ztype(z), { tr: L * 2, tm: 1 + 0.04 * L }]; }
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
  const TOPN = 20; // leaderboard size (worker /api/top returns 20 too)
  class LocalScores {
    constructor(key) { this.key = key || 'decicat_top10_v1'; }
    _load() { try { const a = JSON.parse(LS.get(this.key) || '[]'); return Array.isArray(a) ? a.filter(e => e && typeof e.name === 'string' && isFinite(e.score)) : []; } catch (e) { return []; } }
    async top() { return this._load().slice(0, TOPN); }
    async submit(r) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const list = this._load(); list.push({ id, name: r.name, score: Math.floor(r.score), runMs: r.runMs, at: Date.now() });
      list.sort((a, b) => b.score - a.score || a.at - b.at);
      const top = list.slice(0, TOPN); LS.set(this.key, JSON.stringify(top));
      return { id, rank: top.findIndex(e => e.id === id) + 1, top };
    }
  }
  class RemoteScores {
    constructor(base, opt) { opt = opt || {}; this.base = String(base || '').replace(/\/$/, ''); this.timeout = opt.timeout || 8000; this.backoff = opt.backoff || [700, 1600, 3200]; }
    async _try(path, init) {
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = ac && setTimeout(() => ac.abort(), this.timeout);
      try {
        const res = await fetch(this.base + path, Object.assign({ cache: 'no-store', signal: ac ? ac.signal : undefined }, init));
        let j = null; try { j = await res.json(); } catch (e) { }
        return { ok: res.ok && !!j, status: res.status, j, retryAfter: +(res.headers.get('retry-after') || 0) };
      } catch (e) { return { ok: false, status: 0 }; } finally { if (tm) clearTimeout(tm); }
    }
    // retries network errors, timeouts, 408/429/5xx with backoff; returns the last response
    async req(path, init, tries) {
      let r;
      for (let i = 0; i <= tries; i++) {
        r = await this._try(path, init);
        if (r.ok || !transient(r.status)) return r;
        if (i < tries) await sleep(r.status === 429 ? Math.min(6000, Math.max(1000, (r.retryAfter || 2) * 1000)) : this.backoff[Math.min(i, this.backoff.length - 1)]);
      }
      return r;
    }
    async top(tries) { const r = await this.req('/api/top', {}, tries === undefined ? 3 : tries); if (!r.ok) throw new Error('top ' + r.status); return { top: (r.j.top || []).slice(0, TOPN), total: r.j.total || 0 }; }
    post(it, tries) { return this.req('/api/score', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: it.name, score: it.score, runMs: it.runMs, nonce: it.nonce, replay: it.replay || null, v: it.v || null }) }, tries); }
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const transient = st => st === 0 || st === 408 || st === 429 || st >= 500;
  const mkNonce = () => (window.crypto && crypto.getRandomValues) ? Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('') : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).replace(/[^a-z0-9]/g, '');
  const local = new LocalScores();
  const QKEY = 'decicat_queue_v1';
  // Online scores: every score is queued in localStorage BEFORE it is sent and only removed once the server
  // has it (or rejected it outright), so nothing is lost to a flaky network; the nonce makes resends idempotent.
  const Scores = {
    remote: CONFIG.scores === 'remote' ? new RemoteScores(CONFIG.apiBase, CONFIG.net) : null,
    lastTop: null,
    get online() { return !!this.remote; },
    _q() { try { const a = JSON.parse(LS.get(QKEY) || '[]'); return Array.isArray(a) ? a.filter(i => i && i.nonce) : []; } catch (e) { return []; } },
    _setQ(a) { LS.set(QKEY, JSON.stringify(a.slice(-100))); },
    _drop(n) { this._setQ(this._q().filter(i => i.nonce !== n)); },
    get queued() { return this._q().length; },
    async _send(it, tries) {
      const res = await this.remote.post(it, tries);
      if (res.ok) { this._drop(it.nonce); this.lastTop = (res.j.top || []).slice(0, TOPN); return { status: 'ok', id: res.j.id, rank: res.j.rank || 0, ranked: res.j.ranked !== false, total: res.j.total || 0, top: this.lastTop, claim: res.j.claim || null, why: res.j.why || null }; }
      if (!transient(res.status)) { this._drop(it.nonce); return { status: 'rejected', code: res.status, top: this.lastTop || [] }; }
      return { status: 'queued', nonce: it.nonce, top: this.lastTop || [] };
    },
    async submit(r) {
      if (!this.remote) return Object.assign({ status: 'local', ranked: true }, await local.submit(r));
      const rp = r.replay && JSON.stringify(r.replay).length < 60000 ? r.replay : null;
      const it = { name: r.name, score: Math.floor(r.score), runMs: Math.floor(r.runMs), nonce: mkNonce(), at: Date.now(), replay: rp, v: VERSION };
      this._setQ(this._q().concat([it]));
      return this._send(it, 3);
    },
    async retry(nonce) { const it = this._q().find(i => i.nonce === nonce); if (!it) return null; return this._send(it, 1); },
    async flush() { // resend anything left from earlier sessions / failed attempts (oldest first)
      if (!this.remote || this._flushing) return 0; this._flushing = true; let sent = 0;
      try { for (const it of this._q()) { const r = await this._send(it, 1); if (r.status === 'queued') break; if (r.status === 'ok') sent++; } } finally { this._flushing = false; }
      return sent;
    },
    async top() { if (!this.remote) return { top: await local.top(), total: 0 }; const r = await this.remote.top(); this.lastTop = r.top; return r; }
  };
  if (Scores.remote) setTimeout(() => { if (Scores.queued) Scores.flush(); }, 1500);
  let best = parseInt(LS.get('decicat_best') || '0', 10) || 0;
  const CLAIMKEY = 'decicat_claims_v1';
  let lastReplay = null;

  // ---------- zones ----------
  const ZONES = [null,
    { name: 'ORDER BOOK', sky: ['#120b24', '#1f1438', '#2a1d4a', '#36265e', '#4a3577'], city: ['#2b1f4f', '#1c1336'], tint: null },
    { name: 'FUNDING STORM', sky: ['#0b0f22', '#141a36', '#1e2650', '#2b3466', '#3d4680'], city: ['#232a52', '#141a36'], tint: null },
    { name: 'LIQUIDATION RAIN', sky: ['#1a0814', '#2a0d22', '#3e1530', '#561d3c', '#74304a'], city: ['#3a1428', '#220a18'], tint: null },
    { name: 'BEAR MARKET', sky: ['#120a0a', '#1e1012', '#2c1618', '#3c201c', '#523026'], city: ['#2e1a16', '#1a0d0b'], tint: null },
    { name: 'TO THE MOON', sky: ['#03020a', '#080614', '#100b24', '#1b1438', '#2a1f50'], city: null, tint: null }, // retired as a stage (kept for a future ending / Moon Mode)
    { name: 'WHALE WATERS', sky: ['#01040c', '#03101f', '#061c33', '#0a2a47', '#103a5c'], city: null, tint: null },
    { name: 'SHORT SQUEEZE', sky: ['#0d0806', '#1a0f09', '#2a170c', '#3b2010', '#4e2c16'], city: null, tint: null },
    { name: 'FLASH CRASH', sky: ['#050309', '#0b0716', '#140b25', '#1e0f35', '#2b1247'], city: null, tint: null }
  ];
  // stage rotation (internal zone types): 1 ORDER BOOK, 2 FUNDING STORM, 3 LIQUIDATION RAIN, 4 BEAR MARKET,
  // 6 WHALE WATERS, 7 SHORT SQUEEZE, 8 FLASH CRASH -> then loops ("II", "III"...) with harder tuning
  const ROT = [1, 2, 3, 4, 6, 7, 8];
  function ztype(z) { return ROT[(z - 1) % ROT.length]; }
  function zloop(z) { return Math.floor((z - 1) / ROT.length); }
  function zoneName(z) { const L = zloop(z); return ZONES[ztype(z)].name + (L ? ' ' + ['II', 'III', 'IV', 'V'][Math.min(3, L - 1)] + (L > 4 ? '+' : '') : ''); }
  function zp(z) {
    const t = ztype(z), L = zloop(z);
    const base = [null,
      { speed: 98, gap: [0.16, 0.36], cl: [3, 6], red: 0.07, gapRed: 0, bear: 0, fall: 0, wind: false },
      { speed: 108, gap: [0.18, 0.4], cl: [3, 5], red: 0.14, gapRed: 0.15, bear: 0, fall: 0, wind: true },
      { speed: 118, gap: [0.18, 0.42], cl: [3, 5], red: 0.12, gapRed: 0.1, bear: 0, fall: [1.5, 2.4], wind: false },
      { speed: 126, gap: [0.2, 0.42], cl: [3, 6], red: 0.06, gapRed: 0.06, bear: 0.5, fall: 0, wind: false },
      { speed: 138, gap: [0.2, 0.42], cl: [3, 5], red: 0.16, gapRed: 0.12, bear: 0.2, fall: [2.6, 3.8], wind: false },
      { speed: 114, gap: [0.18, 0.36], cl: [3, 5], red: 0.08, gapRed: 0.05, bear: 0, fall: 0, wind: false, whale: 0.34 },
      { speed: 120, gap: [0.18, 0.38], cl: [3, 5], red: 0.1, gapRed: 0.06, bear: 0.12, fall: 0, wind: false, press: 0.32 },
      { speed: 126, gap: [0.18, 0.38], cl: [3, 5], red: 0.1, gapRed: 0.05, bear: 0, fall: 0, wind: false, flip: 1 }
    ][t];
    const p = Object.assign({}, base, { t, L });
    // gentle in-zone ramp: each zone opens a little easier and ends a little harder (f = 0..1 through the zone)
    const f = z === zone ? clamp(zoneT / ZONE_T, 0, 1) : 0;
    p.speed = Math.round(p.speed * (0.95 + 0.1 * f));
    p.red = Math.max(0, p.red * (0.7 + 0.6 * f)); p.gapRed = p.gapRed * (0.6 + 0.8 * f); p.bear = p.bear * (0.75 + 0.5 * f);
    p.gap = [p.gap[0], p.gap[1] + 0.04 * f];
    if (p.fall) p.fall = [p.fall[0] * (1.2 - 0.35 * f), p.fall[1] * (1.2 - 0.35 * f)];
    if (L > 0) {
      p.speed += 12 * L; p.red = Math.min(0.35, p.red + 0.05 * L); p.gap = [p.gap[0] + 0.02 * L, Math.min(0.56, p.gap[1] + 0.03 * L)];
      p.bear = t >= 6 ? p.bear : Math.max(p.bear, 0.25);
      if (t !== 8) { if (!p.fall) p.fall = [3.4, 4.8]; else p.fall = [p.fall[0] * 0.8, p.fall[1] * 0.8]; }
      p.wind = p.wind || t === 1;
    }
    return p;
  }

  // ---------- zone length (seconds per zone; the one knob to change) ----------
  const ZONE_SECONDS = 45;

  // ---------- physics constants ----------
  const GRAV = 1000, JUMP = 390, DJUMP = 340, MAXFALL = 560, BOOST_T = 4.0, BOOST_MUL = 1.9;
  let ZONE_T = Q.has('zt') ? Math.max(3, +Q.get('zt') || ZONE_SECONDS) : ZONE_SECONDS;

  // ---------- state ----------
  let state = (DBG.nogate || DBG.poster || DBG.autostart) ? 'title' : 'gate', stateT = 0, paused = false;
  let camX = 0, dist = 0, bonus = 0, coinsN = 0, runT = 0, zone = 1, zoneT = 0, prevZone = 1, zoneFade = 1;
  let plats = [], coins = [], powers = [], bears = [], fallers = [], parts = [], floats = [];
  let nextX = 0, lastTop = 0, moonPending = false, moonSeen = false, padMade = false;
  // v4 stage mechanics: grav = +1 / -1 (FLASH CRASH flips), presses (SHORT SQUEEZE), flips, items (power-ups)
  let grav = 1, inU = false, presses = [], flips = [], items = [], flipWarn = null, clustersSinceSpecial = 0, nextFlipX = 0;
  let shieldOn = false, pwSpawned = {}; const pwT = { mag: 0, slow: 0, dia: 0 };
  const FM2 = () => playTop + baseY; // gravity mirror: y -> FM2 - y
  const waterY = () => baseY - 20;
  // the sea stays while WHALE WATERS is on or any whale from it is still around (zone boundaries mid-ride)
  const waterOn = () => ztype(zone) === 6 || plats.some(w => w.k === 'w' && w.ph < 4 && w.x + w.w > camX - 40);
  const PW = {
    shield: { name: 'STOP-LOSS', col: '#5ab4ff', dark: '#123a66' },
    mag: { name: 'LIQUIDITY MAGNET', col: '#ff5a5a', dark: '#5a1414', dur: 6 },
    slow: { name: 'LIMIT ORDER', col: '#ffd84a', dark: '#5a4210', dur: 4 },
    dia: { name: 'DIAMOND PAWS', col: '#8ff6ff', dark: '#14505a', dur: 3 }
  };
  const PW_KEYS = ['shield', 'mag', 'slow', 'dia'];
  let powerTimer = 0, fallTimer = 0, gustTimer = 0, gust = 0, gustT = 0, banner = null, shake = 0;
  let result = null, lev = 1, btcWob = 0, lastDeath = '';
  const cat = { x: 0, y: 0, vy: 0, g: false, coy: 0, buf: 0, air: 1, holdT: 0, rising: false, dead: false, inv: 0, boost: 0, anim: 0, sx: 0, rot: 0 };
  let pressing = false;
  // ---- deterministic runs: fixed 60 Hz sim, seeded RNG only, inputs applied at sim-step boundaries and logged ----
  const FIX = 1 / 60;
  let simFrame = 0, runSeed = 0, runRec = null, replaying = null; const inQ = [];
  function recInput(d) { if (!runRec) return; runRec.ev.push(simFrame - runRec.lastF); runRec.lastF = simFrame; }
  function applyInput(d) {
    if (d === 1) { if (pressing) return; pressing = true; recInput(1); jumpPress(); }
    else { if (!pressing) return; pressing = false; recInput(0); jumpRelease(); }
  }
  function applyInputs() {
    if (replaying) {
      const R = replaying;
      while (R.rsi < R.rs.length && R.rs[R.rsi][0] <= simFrame) { const r = R.rs[R.rsi++]; applyLogical(r[1], r[2]); cat.sx = Math.round(W * 0.27); }
      while (R.ri < R.evs.length && R.evs[R.ri][0] <= simFrame) applyInput(R.evs[R.ri++][1]);
      inQ.length = 0; return;
    }
    for (let i = 0; i < inQ.length; i++) applyInput(inQ[i]);
    inQ.length = 0;
  }
  function packReplay() {
    if (!runRec) return null;
    return { v: VERSION, seed: runRec.seed, w: runRec.w, h: runRec.h, zt: ZONE_T, z0: runRec.z0, ev: runRec.ev.map(n => n.toString(36)).join('.'), rs: runRec.rs, f: simFrame, dbg: runRec.dbg };
  }
  function decodeEv(str) { const out = []; let f = 0, d = 1; if (str) for (const t of String(str).split('.')) { f += parseInt(t, 36) || 0; out.push([f, d]); d ^= 1; } return out; }
  // re-simulate a recorded run headlessly (verify.mjs / tests): same code, same seed, same inputs -> same score
  function simulate(rp) {
    MUTE = true;
    const prevSt = state, prevZT = ZONE_T, prevGod = DBG.god, prevBoost = DBG.boost;
    ZONE_T = +rp.zt > 0 ? +rp.zt : ZONE_SECONDS; DBG.god = false; DBG.boost = false;
    replaying = { evs: decodeEv(rp.ev), ri: 0, rs: (rp.rs || []).slice().sort((a, b) => a[0] - b[0]), rsi: 0 };
    applyLogical(rp.w, rp.h);
    state = 'play'; stateT = 0; paused = false; pressing = false; runRec = null;
    resetRun(rp.seed, rp.z0 || 1);
    let guard = 0; const max = 60 * 60 * 120;
    while (state === 'play' && guard++ < max) update(FIX);
    const out = { score: score(), frames: simFrame, dist: Math.floor(dist / 2), bonus, coins: coinsN, zone, death: lastDeath, runMs: Math.round(runT * 1000) };
    replaying = null; MUTE = false; ZONE_T = prevZT; DBG.god = prevGod; DBG.boost = prevBoost; state = prevSt === 'play' ? 'title' : prevSt; resize();
    return out;
  }

  function score() { return Math.floor(dist / 2) + bonus; }

  function resetRunHook() { nextFlipX = camX + 400; }
  function resetRun(seedIn, z0) {
    seed = seedIn || DBG.seed || cryptoSeed(); runSeed = seed; simFrame = 0; inQ.length = 0;
    plats = []; coins = []; powers = []; bears = []; fallers = []; parts = []; floats = [];
    camX = 0; dist = 0; bonus = 0; coinsN = 0; runT = 0; zone = z0 || DBG.zone; prevZone = zone; zoneFade = 1; zoneT = 0;
    moonPending = ztype(zone) === 5; moonSeen = false; padMade = false;
    grav = 1; inU = false; presses = []; flips = []; items = []; flipWarn = null; clustersSinceSpecial = 0; nextFlipX = 0;
    shieldOn = false; pwSpawned = {}; pwT.mag = 0; pwT.slow = 0; pwT.dia = 0;
    powerTimer = rand(10, 16); fallTimer = 2; gustTimer = rand(2, 4); gust = 0; gustT = 0; shake = 0; result = null; lev = 1;
    cat.sx = Math.round(W * 0.27);
    cat.x = camX + cat.sx; cat.vy = 0; cat.g = true; cat.air = 1; cat.dead = false; cat.inv = 0; cat.boost = 0; cat.rot = 0; cat.coy = 0; cat.buf = 0;
    // starting runway
    lastTop = baseY - 64;
    let x = -20;
    while (x < cat.sx + 120) { const w = randi(17, 21); plats.push(candle(x, lastTop, w, randi(18, 34), false)); x += w + randi(3, 4); }
    nextX = x; cat.y = lastTop; resetRunHook();
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
    // v4 stage specials (never during a boost or the first seconds of a run)
    if (cat.boost <= 0 && runT >= 3) {
      clustersSinceSpecial++;
      if (p.whale && clustersSinceSpecial >= 2 && rnd() < p.whale) { clustersSinceSpecial = 0; genWhale(p); return; }
      if (p.press && clustersSinceSpecial >= 2 && rnd() < p.press) { clustersSinceSpecial = 0; genPress(p); return; }
      if (p.flip && nextX >= nextFlipX && clustersSinceSpecial >= 3) { clustersSinceSpecial = 0; genFlip(p); return; }
    }
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
      powerTimer = 1e9; // one 40x box per zone (re-armed on zone change)
      const c = cs[Math.floor(cs.length / 2)];
      powers.push({ x: c.x + c.w / 2, y: Math.min(...cs.map(q => q.y)) - 64, t: 0 });
    } else if (!boosting && !safe && runT > 5 && cs.length >= 3 && rnd() < 0.055) {
      // rare power-ups: at most one of each per zone
      const avail = PW_KEYS.filter(k => !pwSpawned[k]);
      if (avail.length) { const k = avail[randi(0, avail.length - 1)]; pwSpawned[k] = 1; const c = cs[1]; items.push({ k, x: c.x + c.w / 2, y: Math.min(...cs.map(q => q.y)) - 46 }); }
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
  // WHALE WATERS: a whale breaches in a wide stretch of open water; land on its back and it carries you forward,
  // then it spouts (warning) and dives - jump off before it goes under
  function genWhale(p) {
    const len = randi(100, 126), x0 = nextX + randi(26, 36);
    const top = clamp(lastTop + randi(-4, 14), topMin() + 16, topMax() - 8);
    plats.push({ k: 'w', x: x0, w: len, y: waterY() + 34, top, ph: 0, t: 0, rt: 0, ridden: false, spout: 0, id: x0 });
    for (let i = 0; i < 3; i++) coins.push({ x: x0 + len * (0.35 + i * 0.2), y: top - 34 - (i === 1 ? 6 : 0) });
    const ride = 42 * len / Math.max(50, p.speed - 42);
    nextX = x0 + len + ride * 0.8; lastTop = top;
  }
  // SHORT SQUEEZE: a pressure tunnel - flat plates under a hydraulic ceiling bar that slams down (with warning
  // flashes) as you arrive, leaving a gap you can only thread by staying low; the last plate is open to jump from
  function genPress(p) {
    let x = nextX + 3; const fy = lastTop, lead = 3, n = lead + randi(3, 5), cols = [];
    for (let i = 0; i < n; i++) { const w = randi(24, 30), c = candle(x, fy, w, randi(36, 56), false); c.plate = true; c.y0 = fy; plats.push(c); cols.push(c); x += w + 2; }
    // three open lead-in plates (land, settle), then the bar over the rest except the last plate
    const x1 = cols[n - 2].x + cols[n - 2].w;
    presses.push({ x0: cols[lead].x, x1, fy, cols: cols.slice(lead - 1), ph: 0, t: 0, bot: playTop - 30, warned: false });
    for (let xx = cols[0].x + 20; xx < x1 - 8; xx += 22) coins.push({ x: xx, y: fy - 16 });
    nextX = x; lastTop = fy;
  }
  // FLASH CRASH: gravity flips for 2-4 s (1 s glitch + arrow warning before each flip and before flipping back);
  // ceiling candles carry you while upside down, and a long safe floor waits when gravity returns
  function genFlip(p) {
    const dur = p.L > 0 ? rand(2.4, 4) : rand(2, 3.2), xs = nextX + 12, xe = xs + dur * p.speed, M2 = FM2();
    let x = xs - 70, ut = clamp((topMin() + topMax()) / 2 + randi(-8, 8), topMin(), topMax()), first = true;
    while (x < xe + 30) {
      const n = first ? Math.max(5, Math.ceil((xs + 30 - x) / 22)) : randi(3, 5); let prevT = ut; const cs = [];
      for (let i = 0; i < n; i++) {
        const w = randi(17, 22);
        const red = !first && i > 0 && i < n - 1 && rnd() < p.red * 0.8 && !(cs[i - 1] && cs[i - 1].red);
        const t = red ? prevT - randi(12, 18) : (i === 0 ? ut : clamp(prevT + randi(-8, 8), topMin(), topMax()));
        if (!red) prevT = t;
        const bottom = M2 - t, h = red ? randi(30, 42) : randi(20, 46);
        const c = { k: 'c', ceil: true, x, y: bottom - h, w, h, red, wt: Math.max(2, bottom - h - playTop + 6), wb: randi(3, 8) };
        cs.push(c); plats.push(c); x += w + randi(3, 5);
      }
      if (rnd() < 0.5) { const mx = cs[Math.floor(n / 2)]; coins.push({ x: mx.x + mx.w / 2, y: M2 - prevT + 34 }); }
      first = false; ut = clamp(prevT + randi(-14, 14), topMin(), topMax());
      if (x < xe + 30) x += rand(0.14, 0.26) * p.speed;
    }
    // safe landing floor (starts before the flip-back point)
    let fx = xe - 70; const ft = clamp((topMin() + topMax()) / 2 + randi(0, 20), topMin(), topMax()); let last = ft;
    while (fx < x + 40) { const w = randi(18, 22); last = clamp(last + randi(-4, 4), topMin(), topMax()); plats.push(candle(fx, last, w, randi(24, 48), false)); fx += w + 3; }
    flips.push({ xs, xe, st: 0 });
    nextX = fx; lastTop = last; nextFlipX = nextX + p.speed * rand(5, 8);
  }
  function boostY() { return Math.max(72, Math.round(playTop + playH * 0.5)); }

  // surface height of platform under x within tolerance; returns top or null
  function surf(pl, x, hw) {
    if (pl.k === 'c') { if (pl.red || pl.ceil) return null; return (x + hw > pl.x && x - hw < pl.x + pl.w) ? pl.y : null; }
    if (pl.k === 'w') return whaleSurf(pl, x, hw);
    const dx = x - pl.cx; if (Math.abs(dx) > pl.r * 0.88) return null;
    return pl.cy - Math.sqrt(pl.r * pl.r - dx * dx);
  }

  // surface in "gravity space": normal surfaces when grav > 0; ceiling-candle undersides (mirrored) when flipped
  function surfG(pl, x, hw) {
    if (grav > 0) return surf(pl, x, hw);
    if (pl.k !== 'c' || !pl.ceil || pl.red) return null;
    return (x + hw > pl.x && x - hw < pl.x + pl.w) ? FM2() - (pl.y + pl.h) : null;
  }
  function whaleSurf(w, x, hw) {
    if (w.ph === 0 || w.ph >= 4) return null;
    if (!(x + hw > w.x + 6 && x - hw < w.x + w.w - 4)) return null;
    const u = clamp((x - w.x) / w.w, 0, 1);
    const s = w.y + (u < 0.18 ? (0.18 - u) * 36 : u > 0.86 ? (u - 0.86) * 44 : 0);
    return s < waterY() - 2 ? Math.round(s * 4) / 4 : null;
  }

  // ---------- run control ----------
  function startGame() {
    Snd.init();
    state = 'play'; stateT = 0; paused = false; pressing = false;
    resetRun();
    runRec = { seed: runSeed, w: W, h: H, z0: zone, ev: [], lastF: 0, rs: [], dbg: (DBG.bot || DBG.god || DBG.boost || DBG.seed || DBG.zone !== 1 || ZONE_T !== ZONE_SECONDS) ? 1 : 0 };
    playZoneMusic('bar'); setRain(zoneRain(zone));
  }
  function startBoost() {
    cat.boost = BOOST_T; padMade = false; lev = 40; cat.g = false;
    // purge un-seen generated stuff so we can lay a landing pad & sky coins
    const edge = camX + W + 10;
    plats = plats.filter(p => p.k === 'm' || p.x < edge); coins = coins.filter(c => c.x < edge); bears = bears.filter(b => b.x < edge); powers = powers.filter(p => p.x < edge);
    items = items.filter(q => q.x < edge); presses = presses.filter(q => q.x0 < edge);
    for (const f of flips) f.st = 4; if (grav < 0) setGrav(1, true); flipWarn = null;
    const lastC = plats.filter(p => p.k === 'c' && !p.red && !p.ceil).reduce((m, p) => Math.max(m, p.x + p.w), camX + W * 0.6);
    nextX = Math.min(nextX, Math.max(lastC, edge));
    banner = { big: '40x POWER!', small: '', t: 0, dur: 1.6, yellow: true };
    Snd.sfx('power'); Snd.music('boost', { q: 'beat' }); Snd.amb('rocket', 0.09); shake = 0.15;
  }
  function die(why) {
    if (cat.dead) return;
    lastDeath = why;
    if (DBG.god) { if (why === 'fell') { cat.y = boostY() + 40; cat.vy = 0; cat.inv = 1; } return; }
    lastReplay = packReplay(); runRec = null;
    cat.dead = true; cat.vy = why === 'fell' ? -120 : -260; cat.g = false; state = 'dying'; stateT = 0; shake = 0.35; lev = 1;
    Snd.stop(0.15); Snd.sfx('death'); Snd.amb('rocket', 0); setRain(0);
    for (let i = 0; i < 18; i++) parts.push({ x: cat.x, y: cat.y - 22, vx: rand(-90, 90), vy: rand(-140, 20), l: rand(0.4, 0.9), c: ['#FFCC00', '#ffffff', '#D9584E'][i % 3], s: 2 });
  }
  async function finishRun() {
    const sc = score(), runMs = Math.round(runT * 1000);
    const isBest = sc > best; if (isBest) { best = sc; LS.set('decicat_best', String(best)); }
    const R = result = { score: sc, best, isBest, pending: true, status: null, rank: 0, ranked: true, top: Scores.lastTop || [], board: 'loading', id: null, zone };
    Snd.music('gameover', { q: 'now', then: 'results', restart: true });
    if (isBest && sc > 0) Snd.sfx('best');
    let r; try { r = await Scores.submit({ name: playerName(), score: sc, runMs, replay: lastReplay }); } catch (e) { r = { status: 'queued', top: Scores.lastTop || [] }; }
    applyResult(R, r);
    if (r.status === 'ok') Scores.flush();
  }
  function applyResult(R, r) {
    Object.assign(R, r, { pending: false });
    if (r.claim) { // private prize code for a top-20 run: shown once, kept in this device's history
      R.claimShow = true; R.claimT = 0;
      try { const h = JSON.parse(LS.get(CLAIMKEY) || '[]'); if (!h.some(e => e.code === r.claim)) { h.push({ code: r.claim, score: R.score, rank: r.rank, name: playerName(), at: Date.now() }); LS.set(CLAIMKEY, JSON.stringify(h.slice(-50))); } } catch (e) { }
      Snd.sfx('top10');
    }
    R.board = R.top && R.top.length ? 'ok' : (r.status === 'ok' || r.status === 'local') ? 'ok' : 'loading';
    if ((r.status === 'ok' || r.status === 'local') && r.rank > 0 && r.rank <= TOPN && !R.isBest) Snd.sfx('top10');
    if (R.board !== 'ok') loadBoard(R);
  }
  function loadBoard(R) {
    R.board = 'loading';
    Scores.top().then(t => { if (!R.top.length || R.status !== 'ok') R.top = t.top; R.board = 'ok'; }).catch(() => { R.board = R.top.length ? 'ok' : 'error'; });
  }
  async function retryResult() {
    const R = result; if (!R || R.pending) return;
    if (R.status === 'queued' && R.nonce) { R.pending = true; let r; try { r = await Scores.retry(R.nonce); } catch (e) { r = null; } R.pending = false; if (r) applyResult(R, r); else loadBoard(R); }
    else loadBoard(R);
  }


  // ---------- input ----------
  const UI = { name: null, music: null, sfx: null, again: null, menu: null, retry: null };
  const inRect = (r, x, y) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  function toLogical(e) { const b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * W, y: (e.clientY - b.top) / b.height * H }; }
  function press(lx, ly) {
    if (state === 'gate') return; // the gate is left on the gesture's release (pointerup/touchend/keydown) so audio may start
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
    if (state === 'play') { inQ.push(1); return; }
    if (state === 'over' && stateT > 0.7) {
      if (result && result.claimShow) { if (result.claimT > 1.2) { result.claimShow = false; Snd.sfx('click'); } return; }
      if (lx !== undefined && inRect(UI.retry, lx, ly) && result && (result.status === 'queued' || result.board === 'error')) { Snd.sfx('click'); retryResult(); return; }
      if (lx === undefined || inRect(UI.again, lx, ly)) { Snd.sfx('click'); startGame(); return; }
      if (inRect(UI.menu, lx, ly)) { Snd.sfx('click'); state = 'title'; stateT = 0.3; Snd.music('title', { q: 'now' }); return; }
    }
  }
  function release() { if (state === 'play') inQ.push(0); else pressing = false; }
  function jumpPress() {
    if (cat.dead || cat.boost > 0) return;
    if (cat.g || cat.coy > 0) { doJump(JUMP); Snd.sfx('jump'); }
    else if (cat.air > 0) { cat.air--; doJump(DJUMP); Snd.sfx('djump'); for (let i = 0; i < 6; i++) parts.push({ x: cat.x + rand(-6, 6), y: cat.y, vx: rand(-30, 30), vy: rand(10, 50) * grav, l: 0.3, c: '#d8ccff', s: 1 }); }
    else cat.buf = 0.12;
  }
  function doJump(v) { cat.vy = -v * (inU ? 1 : grav); cat.g = false; cat.coy = 0; cat.holdT = 0; cat.rising = true; cat.buf = 0; }
  function jumpRelease() { if (cat.rising && cat.vy * (inU ? 1 : grav) < -120 && cat.holdT > 0.07) cat.vy *= 0.5; cat.rising = false; }

  // Audio unlock: iOS/Safari only treats touchend / pointerup / click / keydown as user activation (not touchstart / touch pointerdown)
  const unlockAudio = () => { if (!REC && AU && AU.unlock) AU.unlock(); };
  ['pointerup', 'touchend', 'click', 'keydown', 'mousedown'].forEach(ev => document.addEventListener(ev, unlockAudio, { capture: true, passive: true }));
  // TAP TO START gate: the first real gesture unlocks audio and starts the title theme, then the title screen drops in with the music
  function leaveGate() {
    if (state !== 'gate') return;
    unlockAudio(); Snd.init();
    state = 'title'; stateT = 0;
    Snd.sfx('click'); Snd.music('title', { q: 'now', restart: true });
  }
  ['pointerup', 'touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, e => { if (state === 'gate' && !(e.key && /^(Shift|Control|Alt|Meta|Tab)$/.test(e.key))) leaveGate(); }, { capture: true, passive: true }));
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
  // resize is debounced: dragging a window edge or toggling fullscreen fires dozens of events, and each real size change
  // re-renders the zone backgrounds for the new size; caches for the old size are released at once
  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { const w0 = W, h0 = H; resize(); if (W !== w0 || H !== h0) { BG.reset(); if (state === 'play' && runRec) runRec.rs.push([simFrame, W, H]); } if (state === 'play' || state === 'dying') { cat.sx = Math.round(W * 0.27); } }, 120); });

  // ---------- name editor (DOM overlay) ----------
  let nameOpen = false;
  const nameBox = document.getElementById('namebox'), nameIn = document.getElementById('namein'), nameMsg = document.getElementById('namemsg');
  function openNameEditor() {
    if (!nameBox) return;
    nameOpen = true; nameBox.style.display = 'flex'; nameIn.value = sanitizeName(LS.get('decicat_name')) || ''; nameIn.placeholder = anonName; nameMsg.textContent = 'Shown on the leaderboard. Up to 16 letters/numbers. Leave it empty (or tap Play anonymous) to stay ' + anonName + '.';
    setTimeout(() => nameIn.focus(), 30);
  }
  let nameClosedAt = 0;
  function closeNameEditor() { nameOpen = false; nameBox.style.display = 'none'; nameIn.blur(); nameClosedAt = performance.now(); if (state === 'title') Snd.music('title', { q: 'now' }); }
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
    if (state === 'title' || state === 'over' || state === 'gate') { animBg(dt); updParts(dt); return; }
    if (paused) return;
    if (state === 'dying') {
      cat.vy = Math.min(cat.vy + GRAV * dt, MAXFALL); cat.y += cat.vy * dt; cat.rot += dt * 8;
      updParts(dt); shake = Math.max(0, shake - dt);
      if (stateT > 1.25) { state = 'over'; stateT = 0; finishRun(); }
      return;
    }
    // play
    if (DBG.bot && !replaying) bot(dt);
    applyInputs();
    simFrame++;
    // LIMIT ORDER: the whole sim runs at 0.6x for 4 s (real) - deterministic, it is just a scaled fixed step
    const realDt = dt;
    if (pwT.slow > 0) { pwT.slow -= realDt; dt *= 0.6; if (pwT.slow <= 0) { pwT.slow = 0; Snd.sfx('pwEnd'); } }
    if (pwT.mag > 0) { pwT.mag -= dt; if (pwT.mag <= 0) { pwT.mag = 0; Snd.sfx('pwEnd'); } }
    if (pwT.dia > 0) { pwT.dia -= dt; if (pwT.dia <= 0) { pwT.dia = 0; cat.inv = Math.max(cat.inv, 0.6); Snd.sfx('pwEnd'); } else if (rnd() < 0.5) parts.push({ x: cat.x + rand(-12, 12), y: cat.y - 22 * grav + rand(-20, 20), vx: rand(-10, 10), vy: rand(-40, -10), l: 0.35, c: rnd() < 0.5 ? '#ffffff' : '#8ff6ff', s: 1 }); }
    if (flipWarn) { flipWarn.t -= dt; if (flipWarn.t <= 0) flipWarn = null; }
    const p = zp(zone);
    runT += dt; zoneT += dt; powerTimer -= dt; zoneFade = Math.min(1, zoneFade + dt / 1.5);
    if (zoneT >= ZONE_T) {
      prevZone = zone; zone++; zoneT = 0; zoneFade = 0; powerTimer = rand(0.25, 0.6) * ZONE_T; pwSpawned = {}; clustersSinceSpecial = 0;
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
    if (state === 'play') stageTriggers(v);
    // generation / cleanup
    while (nextX < camX + W + 100) genCluster();
    const cut = camX - 60;
    plats = plats.filter(q => q.k === 'm' ? q.cx + q.r > cut : q.x + q.w > cut);
    coins = coins.filter(c => !c.taken && c.x > cut);
    powers = powers.filter(q => !q.taken && q.x > cut);
    items = items.filter(q => !q.taken && q.x > cut);
    presses = presses.filter(q => q.x1 > cut - 40);
    flips = flips.filter(f => f.st < 4 || f.xe > cut);
    bears = bears.filter(b => b.x > cut - 20 && b.y < baseY + 200 && b.alive);
    fallers = fallers.filter(f => f.y < H + 60 && !f.gone);
    updParts(dt); animBg(dt);
    shake = Math.max(0, shake - dt);
    if (banner) { banner.t += dt; if (banner.t > banner.dur) banner = null; }
    // cosmetic BTC wobble
    btcWob += dt;
  }

  function setGrav(g, quiet) {
    if (grav === g) return;
    grav = g; cat.g = false; cat.vy = 0; cat.coy = 0; cat.rising = false; cat.air = 1;
    if (!quiet) { Snd.sfx('flip'); shake = Math.max(shake, 0.12); }
  }
  function stageTriggers(v) {
    for (const f of flips) {
      if (f.st === 0 && cat.x >= f.xs - v * 1.0) { f.st = 1; flipWarn = { t: 1, dir: -1 }; Snd.sfx('flipWarn'); }
      if (f.st === 1 && cat.x >= f.xs) { f.st = 2; setGrav(-1); }
      if (f.st === 2 && cat.x >= f.xe - v * 1.0) { f.st = 3; flipWarn = { t: 1, dir: 1 }; Snd.sfx('flipWarn'); }
      if (f.st === 3 && cat.x >= f.xe) { f.st = 4; setGrav(1); }
    }
  }
  function updWhale(w, dt, v) {
    const wy = waterY();
    if (w.ph === 0) { if (cat.x > w.x - v * 1.6) { w.ph = 1; w.t = 0; Snd.sfx('whale'); } else return; }
    w.t += dt;
    if (w.ph === 1) {
      const f = Math.min(1, w.t / 0.7), y0 = wy + 34; w.y = y0 + (w.top - y0) * (1 - (1 - f) * (1 - f));
      if (rnd() < 0.6) parts.push({ x: w.x + rand(0, w.w), y: wy, vx: rand(-30, 30), vy: rand(-140, -60), l: rand(0.3, 0.6), c: rnd() < 0.5 ? '#bfe8ff' : '#5ab0e0', s: 1 });
      if (f >= 1) { w.ph = 2; w.t = 0; Snd.sfx('splash'); }
    } else if (w.ph === 2) {
      w.y = w.top + Math.round(Math.sin(w.t * 3) * 1.5);
      if (w.ridden) { w.rt += dt; w.x += 42 * dt; }
      const left = w.ridden ? 2.3 - w.rt : 3.6 - w.t;
      w.spout = left < 0.7 ? 1 : 0;
      if (w.spout && rnd() < 0.7) parts.push({ x: w.x + w.w * 0.78 + rand(-2, 2), y: w.y - 4, vx: rand(-14, 14), vy: rand(-170, -110), l: 0.45, c: rnd() < 0.5 ? '#e8f8ff' : '#8fd0ff', s: rnd() < 0.3 ? 2 : 1 });
      if (left <= 0) { w.ph = 3; w.t = 0; Snd.sfx('whale'); }
    } else if (w.ph === 3) {
      w.y += 52 * dt; if (w.ridden) w.x += 42 * dt;
      if (w.y > wy + 40) w.ph = 4;
    }
  }
  function updPress(q, dt, v) {
    const target = q.fy - 4 - 46; // bar bottom when closed: 8 px over a standing cat's head
    if (q.ph === 0 && cat.x > q.x0 - v * 1.35) { q.ph = 1; q.t = 0; Snd.sfx('pressWarn'); }
    if (q.ph === 1 && cat.x > q.x0 - v * 0.5) { q.ph = 2; q.t = 0; }
    if (q.ph === 2) { q.t += dt; const f = Math.min(1, q.t / 0.14); q.bot = playTop - 30 + (target - playTop + 30) * f; if (f >= 1) { q.ph = 3; q.t = 0; Snd.sfx('slam'); shake = Math.max(shake, 0.1); } }
    else if (q.ph === 3) { q.t += dt; q.bot = target + Math.round(Math.sin(q.t * 18) * 1.5); if (cat.x > q.x1 + 24) { q.ph = 4; q.t = 0; } }
    else if (q.ph === 4) { q.t += dt; q.bot = target + (playTop - 30 - target) * Math.min(1, q.t / 0.5); }
    // floor plates squeeze up a little while the bar is down
    const lift = q.ph === 2 ? 4 * Math.min(1, q.t / 0.14) : q.ph === 3 ? 4 : q.ph === 4 ? 4 * (1 - Math.min(1, q.t / 0.5)) : 0;
    for (const c of q.cols) c.y = c.y0 - lift;
  }
  function hurt(why) {
    if (pwT.dia > 0) return false;
    if (shieldOn) {
      shieldOn = false; cat.inv = 1.3; shake = Math.max(shake, 0.2); Snd.sfx('shieldBreak');
      floats.push({ x: cat.x, y: cat.y - 56 * grav, t: 0, s: 'STOP-LOSS HIT!', c: '#8fd0ff' });
      for (let i = 0; i < 14; i++) parts.push({ x: cat.x, y: cat.y - 22 * grav, vx: rand(-120, 120), vy: rand(-120, 40), l: rand(0.3, 0.6), c: i % 2 ? '#5ab4ff' : '#ffffff', s: 2 });
      return false;
    }
    die(why); return true;
  }
  // falling off / into the sea: DIAMOND PAWS or a STOP-LOSS bounces you back up instead
  function rescueFall(why) {
    if (DBG.god) { cat.vy = -640 * grav; cat.g = false; cat.air = 1; cat.y = why === 'splash' ? waterY() + 4 : grav > 0 ? baseY + 40 : playTop - 40; return; }
    if (pwT.dia <= 0 && !shieldOn) { die(why); return; }
    if (pwT.dia <= 0) { shieldOn = false; Snd.sfx('shieldBreak'); floats.push({ x: cat.x, y: cat.y - 56 * grav, t: 0, s: 'STOP-LOSS HIT!', c: '#8fd0ff' }); }
    cat.vy = -640 * grav; cat.g = false; cat.air = 1; cat.inv = Math.max(cat.inv, 1); cat.rising = false;
    if (why === 'splash') { cat.y = waterY() + 4; Snd.sfx('splash'); }
    else cat.y = grav > 0 ? baseY + 40 : playTop - 40;
  }
  function pickItem(q) {
    q.taken = true; const P = PW[q.k]; bonus += 250; Snd.sfx('pw_' + q.k);
    if (q.k === 'shield') shieldOn = true; else pwT[q.k] = P.dur;
    banner = { big: P.name + '!', small: q.k === 'shield' ? 'BLOCKS ONE HIT' : q.k === 'mag' ? 'PULLS IN COINS' : q.k === 'slow' ? 'SLOW-MO 0.6X' : 'INVINCIBLE', t: 0, dur: 1.4 };
    floats.push({ x: q.x, y: q.y - 8, t: 0, s: '+250', c: P.col });
    for (let i = 0; i < 10; i++) parts.push({ x: q.x, y: q.y, vx: rand(-90, 90), vy: rand(-90, 30), l: 0.45, c: i % 2 ? P.col : '#ffffff', s: 1 });
  }
  function step(dt, v, p) {
    for (const pl of plats) if (pl.k === 'w') updWhale(pl, dt, v);
    for (const q of presses) updPress(q, dt, v);
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
      // (flipped gravity: run the same physics in mirrored "gravity space", then map back)
      if (grav < 0) { cat.y = FM2() - cat.y; cat.vy = -cat.vy; } inU = true;
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
          for (const pl of plats) { const s = surfG(pl, cat.x, 10); if (s !== null && prevY <= s + 2 && cat.y >= s) { if (best === null || s < best.s) best = { s, pl }; } }
          if (best) { land(best.s, best.pl); if (vyIn > 230) Snd.sfx('land'); }
        }
      } else {
        // stay grounded: find support (allows small step-ups and walking down slopes)
        let s0 = null, plg = null;
        for (const pl of plats) {
          const s = surfG(pl, cat.x, 10);
          const up = pl.k === 'm' ? 20 : 16, down = pl.k === 'm' ? 8 : pl.k === 'w' ? 5 : 3;
          if (s !== null && s >= cat.y - up && s <= cat.y + down) { if (s0 === null || s < s0) { s0 = s; plg = pl; } }
        }
        if (s0 === null) { cat.g = false; cat.coy = 0.1; cat.vy = 0; }
        else { cat.y = s0; if (plg.k === 'm') moonLand(plg); if (plg.k === 'w') plg.ridden = true; }
      }
      inU = false; if (grav < 0) { cat.y = FM2() - cat.y; cat.vy = -cat.vy; }
    }
    const cmy = cat.y - 22 * grav; // cat body centre
    // LIQUIDITY MAGNET
    if (pwT.mag > 0 && cat.boost <= 0) for (const c of coins) { if (c.taken) continue; const dx = cat.x - c.x, dy = cmy - c.y, d = Math.hypot(dx, dy); if (d < 120 && d > 1) { const sp = 260 + (120 - d) * 2; c.x += dx / d * sp * dt; c.y += dy / d * sp * dt; } }
    // coins
    for (const c of coins) {
      if (c.taken) continue;
      if (Math.abs(c.x - cat.x) < 17 && Math.abs(c.y - cmy) < 26) {
        c.taken = true; bonus += 100; coinsN++; Snd.sfx('coin');
        const recent = floats.find(f => f.coin && f.t < 0.35);
        if (recent) { recent.n += 100; recent.s = '+' + recent.n; recent.t = 0; recent.x = cat.x; recent.y = cat.y - 36; }
        else floats.push({ x: cat.x + 4, y: cat.y - 36, t: 0, s: '+100', c: '#FFE500', coin: true, n: 100 });
        for (let i = 0; i < 5; i++) parts.push({ x: c.x, y: c.y, vx: rand(-40, 40), vy: rand(-60, 0), l: 0.3, c: '#FFF3A0', s: 1 });
      }
    }
    for (const pw of powers) {
      if (pw.taken) continue;
      if (Math.abs(pw.x - cat.x) < 21 && Math.abs(pw.y - cmy) < 28) { pw.taken = true; bonus += 400; floats.push({ x: pw.x, y: pw.y - 8, t: 0, s: '+400', c: '#FFE500' }); startBoost(); }
    }
    for (const q of items) { if (!q.taken && Math.abs(q.x - cat.x) < 18 && Math.abs(q.y - cmy) < 26) pickItem(q); }
    const hb = grav > 0 ? { x: cat.x - 10, y: cat.y - 38, w: 20, h: 35 } : { x: cat.x - 10, y: cat.y + 3, w: 20, h: 35 };
    const hit = r => hb.x < r.x + r.w && hb.x + hb.w > r.x && hb.y < r.y + r.h && hb.y + hb.h > r.y;
    const invuln = cat.boost > 0 || cat.inv > 0 || pwT.dia > 0 || DBG.god;
    // SHORT SQUEEZE bars
    for (const q of presses) {
      if (q.ph < 2) continue;
      if (hit({ x: q.x0, y: playTop - 400, w: q.x1 - q.x0, h: q.bot - playTop + 400 })) {
        if (cat.boost > 0) continue;
        if (!invuln && hurt('squeeze')) return;
      }
    }
    // red candles
    for (const pl of plats) {
      if (pl.k !== 'c' || !pl.red || pl.gone) continue;
      if (hit({ x: pl.x + 2, y: pl.y + 2, w: pl.w - 4, h: pl.h - 3 })) {
        if (cat.boost > 0) { smash(pl.x + pl.w / 2, pl.y + pl.h / 2, '#D9584E'); pl.gone = true; bonus += 50; floats.push({ x: pl.x, y: pl.y, t: 0, s: '+50', c: '#ffffff' }); }
        else if (!invuln && hurt('red')) return;
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
        else if (!invuln && hurt('fall')) return;
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
        else if (grav > 0 && !cat.g && cat.vy > 40 && cat.y - (b.y - 16) < 13) {
          b.dead = true; b.vy = -120; cat.vy = -280; cat.rising = true; cat.holdT = 0; cat.air = 1; bonus += 200; Snd.sfx('stomp');
          floats.push({ x: b.x, y: b.y - 22, t: 0, s: 'STOMP +200', c: '#ffffff' });
        }
        else if (!invuln && hurt('bear')) return;
      }
    }
    // fell off / into the sea
    if (cat.boost <= 0 && grav > 0 && cat.y > waterY() + 10 && waterOn()) { rescueFall('splash'); return; }
    if (grav > 0 ? cat.y - 44 > baseY + 4 : cat.y + 44 < playTop - 4) { if (DBG.god) die('fell'); else rescueFall('fell'); }
  }
  function land(s, pl) {
    cat.y = s; cat.vy = 0; cat.g = true; cat.air = 1; cat.rising = false;
    const ry = grav > 0 ? s : FM2() - s;
    for (let i = 0; i < 3; i++) parts.push({ x: cat.x + rand(-6, 6), y: ry, vx: rand(-30, 30), vy: rand(-30, -5) * grav, l: 0.25, c: '#cfc3ff', s: 1 });
    if (pl.k === 'm') moonLand(pl);
    if (pl.k === 'w' && !pl.ridden) { pl.ridden = true; bonus += 150; floats.push({ x: cat.x, y: ry - 50, t: 0, s: 'WHALE RIDE +150', c: '#8fd0ff' }); Snd.sfx('splash'); }
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
    const p = zp(zone), look = p.speed * 0.16, M2 = FM2(), uy = grav > 0 ? cat.y : M2 - cat.y;
    const supAt = (x) => plats.some(pl => { const s = surfG(pl, x, 4); return s !== null && Math.abs(s - uy) < 18; });
    if (cat.g) { // stage specials: never jump under a squeeze bar; jump off a diving whale
      const inPress = presses.some(q => q.ph >= 1 && q.ph < 4 && cat.x > q.x0 - 100 && cat.x < q.x1 + 12);
      if (inPress && supAt(cat.x + 13)) return;
      const diving = plats.some(pl => pl.k === 'w' && (pl.ph >= 3 || pl.spout) && surf(pl, cat.x, 10) !== null);
      if (diving && plats.some(pl => pl.k === 'c' && !pl.red && pl.x > cat.x && pl.x - cat.x < 70)) { press(); botHold = 0.25; return; }
    }
    const danger = () => {
      for (const pl of plats) {
        if (pl.k !== 'c' || !pl.red || !!pl.ceil !== (grav < 0)) continue;
        const top = grav > 0 ? pl.y : M2 - (pl.y + pl.h);
        if (pl.x - cat.x > 0 && pl.x - cat.x < look + 10 && top < uy && top + pl.h > uy - 40) return true;
      }
      for (const b of bears) if (!b.dead && b.x - cat.x > 0 && b.x - cat.x < look + 34 + (b.charged ? 30 : 0) && Math.abs(b.y - cat.y) < 20) return true;
      for (const f of fallers) if (Math.abs(f.x - (cat.x + 20)) < 16 && f.warn <= 0 && f.y < cat.y && f.y > cat.y - 120) return true;
      return false;
    };
    const pw = powers.find(q => !q.taken && q.x - cat.x > 0 && q.x - cat.x < look + 12);
    if (cat.g) {
      if (!supAt(cat.x + 13) || danger() || pw) { press(); botHold = 0.22; }
    } else if (cat.vy * grav > 60 && cat.air > 0) {
      let below = false;
      for (const pl of plats) { for (let k = 0; k < 6; k++) { const s = surfG(pl, cat.x + k * 10, 10); if (s !== null && s >= uy - 2 && s < baseY) below = true; } }
      if (!below) { press(); botHold = 0.2; }
    }
  }

  // ---------- background (parallax layers live in bg.js) ----------
  let bgCache = {}, stars = [];
  function buildSkyline() {
    const s0 = seed; seed = 4242;
    stars = []; for (let i = 0; i < 90; i++) stars.push({ x: rand(0, 1), y: rand(0, 1), b: rnd(), tw: rand(0, 6) });
    seed = s0; BG.reset();
  }
  let bgT = 0;
  function animBg(dt) { bgT += dt; }
  const BG = D.makeBG({
    ctx, get W() { return W; }, get H() { return H; }, get baseY() { return baseY; }, get playTop() { return playTop; }, get playH() { return playH; },
    get camX() { return camX; }, get bgT() { return bgT; }, get gust() { return gust; }, get zoneP() { return Math.min(1, zoneT / ZONE_T); }, get stars() { return stars; },
    zone: zt => ZONES[zt], ztype, zloop, text: (s, x, y, c) => text(s, x, y, c), textW: s => textW(s)
  });
  function drawBackground() {
    const zt = ztype(zone), noIcon = state === 'title' || state === 'gate';
    if (zoneFade < 1) BG.drawZone(prevZone, 1, { noIcon });
    BG.drawZone(zone, zoneFade < 1 ? zoneFade : 1, { noIcon });
    // weather
    if (zt === 2 && state !== 'title') {
      ctx.fillStyle = 'rgba(190,200,255,0.55)';
      const slant = 1 + (gust < 0 ? 3 : 0);
      for (let i = 0; i < 60; i++) {
        const x = ((i * 53.7 + bgT * (60 + slant * 40) * (i % 3 + 1) - camX * 0.6) % (W + 20) + W + 20) % (W + 20) - 10;
        const y = ((i * 97.3 + bgT * 260 * (1 + (i % 2) * 0.5)) % (baseY + 10));
        const rx = Math.round(x), ry = Math.round(y); ctx.fillRect(rx, ry, 1, 4); if (slant > 1) ctx.fillRect(rx - 1, ry + 3, 1, 3);
      }
    }
    if (zt === 3 && state !== 'title') {
      ctx.fillStyle = 'rgba(255,110,90,0.35)';
      for (let i = 0; i < 30; i++) { const x = ((i * 71.3 - camX * 0.3) % W + W) % W; const y = (i * 37.7 + bgT * 40 * (1 + i % 3)) % baseY; ctx.fillRect(Math.round(x), Math.round(y), 1, 2); }
    }
  }
  function drawMoon(cx, cy, r, small) {
    // pre-rendered pixel moon (disc + rim + terminator + craters + 48-px mark at an integer scale), cached per radius
    const key = 'moon' + r;
    if (!bgCache[key]) bgCache[key] = BG.moon(2 * r + 1, '#FFE500', '#a88400', '#e8c200', '#111111', Math.max(1, Math.round(r * 1.12 / D.LOGO.mark48.length)));
    ctx.drawImage(bgCache[key], Math.round(cx) - r, Math.round(cy) - r);
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
  function drawWhale(w, sx) {
    if (w.ph === 0 || w.ph >= 4) return;
    const x = Math.round(w.x - sx), y = Math.round(w.y), L = w.w;
    if (x > W + 30 || x + L < -40) return;
    const body = '#2c4a6e', dark = '#1a2e48', belly = '#7fa8c8', hi = '#5a86b0';
    // body: rounded slab, head on the right (swims forward), tail flukes on the left
    for (let i = 0; i < L; i++) {
      const u = i / L, top = Math.round(y + (u < 0.18 ? (0.18 - u) * 36 : u > 0.86 ? (u - 0.86) * 44 : 0));
      const bot = y + 30 - Math.round(u < 0.12 ? (0.12 - u) * 60 : u > 0.9 ? (u - 0.9) * 90 : 0);
      ctx.fillStyle = dark; ctx.fillRect(x + i, top, 1, Math.max(1, bot - top));
      ctx.fillStyle = body; ctx.fillRect(x + i, top + 1, 1, Math.max(1, bot - top - 6));
      if (i % 9 > 1 && u > 0.25 && u < 0.85) { ctx.fillStyle = belly; ctx.fillRect(x + i, bot - 7, 1, 1); ctx.fillRect(x + i, bot - 4, 1, 1); }
      if (u > 0.2 && u < 0.84) { ctx.fillStyle = hi; ctx.fillRect(x + i, top + 1, 1, 1); }
    }
    // flukes
    const fy = y + 2 + Math.round(Math.sin(bgT * 4) * 2);
    ctx.fillStyle = dark; ctx.fillRect(x - 14, fy, 16, 4); ctx.fillRect(x - 18, fy - 4, 7, 5); ctx.fillRect(x - 18, fy + 3, 7, 5);
    ctx.fillStyle = body; ctx.fillRect(x - 13, fy + 1, 14, 2); ctx.fillRect(x - 17, fy - 3, 5, 3); ctx.fillRect(x - 17, fy + 4, 5, 3);
    // eye + mouth line + blowhole
    const ex = x + L - 16, ey = y + 12; ctx.fillStyle = '#e8f4ff'; ctx.fillRect(ex, ey, 2, 2); ctx.fillStyle = '#0a1420'; ctx.fillRect(ex + 1, ey + 1, 1, 1);
    ctx.fillStyle = dark; ctx.fillRect(x + L - 26, y + 19, 22, 1);
    ctx.fillStyle = w.spout && Math.floor(bgT * 10) % 2 ? '#ffffff' : '#0a1420'; ctx.fillRect(x + Math.round(L * 0.78), y, 3, 1);
    if (w.spout && Math.floor(bgT * 8) % 2 === 0) text('!', x + Math.round(L * 0.78), y - 18, '#ff5a4a', { shadow: '#1a0f30' });
  }
  function drawWater(sx) {
    const wy = waterY();
    ctx.fillStyle = '#04142a'; ctx.fillRect(0, wy, W, H - wy);
    ctx.fillStyle = '#0a2a4c'; ctx.fillRect(0, wy + 3, W, 2);
    for (let x = 0; x < W; x++) {
      const k = x + Math.round(sx * 0.9);
      const h = Math.round(Math.sin(k * 0.09 + bgT * 2.2) * 1.5 + Math.sin(k * 0.031 - bgT * 1.3) * 1.2);
      ctx.fillStyle = '#1d5a8a'; ctx.fillRect(x, wy - 1 + h, 1, 2);
      if (((k * 7 + Math.floor(bgT * 6)) % 23) === 0) { ctx.fillStyle = '#bfe8ff'; ctx.fillRect(x, wy - 2 + h, 1, 1); }
    }
    for (let i = 0; i < 26; i++) { // bioluminescent plankton
      const px = Math.round(((i * 61.7 - sx * 0.95) % W + W) % W), py = wy + 6 + ((i * 13) % Math.max(4, H - wy - 8));
      if (Math.sin(bgT * 2 + i) > 0.3) { ctx.fillStyle = i % 3 ? '#2affd0' : '#7af0ff'; ctx.fillRect(px, py, 1, 1); }
    }
  }
  function drawPress(q, sx) {
    const x0 = Math.round(q.x0 - sx), x1 = Math.round(q.x1 - sx), w = x1 - x0;
    if (x1 < -4 || x0 > W + 4) return;
    const target = q.fy - 4 - 46;
    if (q.ph === 1 || q.ph === 0) { // warning: flashing target line + hazard marker on the ceiling
      if (q.ph === 1 && Math.floor(bgT * 10) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,60,40,0.14)'; ctx.fillRect(x0, playTop, w, Math.max(0, target - playTop));
        ctx.fillStyle = '#ff4a3a'; for (let x = x0; x < x1; x += 4) ctx.fillRect(x, Math.round(target), 2, 1);
        text('!', Math.round((x0 + x1) / 2) - 2, Math.max(playTop + 22, Math.round(target) - 18), '#ffffff', { shadow: '#5a0a0a' });
      }
    }
    const by = Math.round(q.bot);
    if (by > playTop - 20) {
      // piston rods
      ctx.fillStyle = '#26262e'; for (let x = x0 + 6; x < x1 - 4; x += 18) ctx.fillRect(x, playTop - 2, 4, Math.max(0, by - 12 - playTop + 2));
      ctx.fillStyle = '#5a5a68'; for (let x = x0 + 6; x < x1 - 4; x += 18) ctx.fillRect(x + 1, playTop - 2, 1, Math.max(0, by - 12 - playTop + 2));
      // press head: steel slab with red/black hazard stripes on the leading edge
      ctx.fillStyle = '#1a1a20'; ctx.fillRect(x0 - 1, by - 13, w + 2, 14);
      ctx.fillStyle = '#4a4a56'; ctx.fillRect(x0, by - 12, w, 7);
      ctx.fillStyle = '#6e6e7e'; ctx.fillRect(x0, by - 12, w, 1);
      for (let x = x0; x < x1; x++) { ctx.fillStyle = ((x + by) >> 2) % 2 ? '#d9584e' : '#1a1a20'; ctx.fillRect(x, by - 5, 1, 5); }
      // pressure gauge on the slab
      const gx = Math.round((x0 + x1) / 2) - 4; ctx.fillStyle = '#e8e0c8'; ctx.fillRect(gx, by - 12, 9, 6); ctx.fillStyle = '#d9584e'; ctx.fillRect(gx + 4 + (q.ph === 3 ? 3 : 0), by - 11, 1, 4);
    }
  }
  function drawItem(q, sx) {
    const x = Math.round(q.x - sx) - 7, y = Math.round(q.y - 7 + Math.sin(bgT * 4 + q.x) * 2);
    if (x < -20 || x > W + 4) return;
    const P = PW[q.k], glow = Math.floor(bgT * 6) % 2;
    ctx.fillStyle = P.dark; ctx.fillRect(x, y + 1, 15, 13); ctx.fillRect(x + 1, y, 13, 15);
    ctx.fillStyle = glow ? P.col : '#ffffff'; ctx.fillRect(x + 1, y, 13, 1); ctx.fillRect(x + 1, y + 14, 13, 1); ctx.fillRect(x, y + 1, 1, 13); ctx.fillRect(x + 14, y + 1, 1, 13);
    ctx.drawImage(S.pw[q.k], x + 3, y + 3);
  }
  function drawWorld() {
    const sx = camX, z6 = waterOn();
    for (const pl of plats) if (pl.k === 'w') drawWhale(pl, sx);
    for (const pl of plats) {
      if (pl.k === 'm') { if (pl.cx - sx + pl.r > -4 && pl.cx - sx - pl.r < W + 4) drawMoon(pl.cx - sx, pl.cy, pl.r, false); }
      else if (pl.k === 'c') drawCandle(pl, sx);
    }
    if (z6) drawWater(sx);
    for (const q of presses) drawPress(q, sx);
    for (const q of items) if (!q.taken) drawItem(q, sx);
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
    if (grav < 0 && !cat.dead) { // upside down (FLASH CRASH)
      ctx.save(); ctx.translate(0, Math.round(y)); ctx.scale(1, -1); ctx.translate(0, -Math.round(y));
      grav = 1; try { drawCat(x, y); } finally { grav = -1; ctx.restore(); }
      return;
    }
    if (shieldOn && !cat.dead) { // STOP-LOSS bubble
      const cx = Math.round(x), cy = Math.round(y - 22), r = 22, on = Math.floor(bgT * 4) % 4 !== 0;
      ctx.fillStyle = on ? 'rgba(90,180,255,0.75)' : 'rgba(200,235,255,0.75)';
      for (let a = 0; a < 48; a++) { const t = a / 48 * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * (r + 2)), 1, 1); }
    }
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
    if (pwT.dia > 0 && Math.floor(bgT * 12) % 3 === 0) { ctx.globalAlpha = 0.55; drawSpr(S.catWhite, X - 19, Y - 46); ctx.globalAlpha = 1; } // DIAMOND PAWS shimmer
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
    // active power-ups: icon + draining timer bar
    let hx = 4; const hy = 24;
    const pwHud = (k, f) => { ctx.fillStyle = '#140b26'; ctx.fillRect(hx - 1, hy - 1, 11, 11); ctx.drawImage(S.pw[k], hx, hy); if (f !== null) { ctx.fillStyle = '#140b26'; ctx.fillRect(hx - 1, hy + 10, 11, 3); ctx.fillStyle = PW[k].col; ctx.fillRect(hx, hy + 11, Math.max(1, Math.round(9 * f)), 1); } hx += 13; };
    if (shieldOn) pwHud('shield', null);
    if (pwT.mag > 0) pwHud('mag', pwT.mag / PW.mag.dur);
    if (pwT.slow > 0) pwHud('slow', pwT.slow / PW.slow.dur);
    if (pwT.dia > 0) pwHud('dia', pwT.dia / PW.dia.dur);
  }
  // FLASH CRASH: 1 s glitch + arrow warning before every gravity change (cheap: a few row slices of the frame)
  function drawFlipFx() {
    if (grav < 0 && !flipWarn) { // subtle "inverted" scanlines
      ctx.fillStyle = 'rgba(255,60,200,0.05)'; for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
      if (Math.floor(bgT * 2) % 2 === 0) text('GRAVITY INVERTED', W / 2, baseY - 12, '#ff7ae0', { align: 'center', shadow: '#2a0a2a' });
    }
    if (!flipWarn) return;
    const t = 1 - flipWarn.t, k = Math.floor(bgT * 30);
    for (let i = 0; i < 5; i++) { // row slices shifted sideways
      const y = Math.floor(hash01(k * 7 + i) * H), h = 2 + Math.floor(hash01(k * 13 + i) * 6), dx = Math.round((hash01(k * 3 + i) - 0.5) * 16);
      ctx.drawImage(cv, 0, y, W, h, dx, y, W, h);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = k % 2; y < H; y += 2) ctx.fillRect(0, y, W, 1);
    ctx.fillStyle = k % 2 ? 'rgba(255,0,90,0.10)' : 'rgba(0,240,255,0.08)'; ctx.fillRect(0, 0, W, H);
    // big arrow pointing where gravity will pull
    if (Math.floor(t * 8) % 2 === 0) {
      const ax = Math.round(W / 2), up = flipWarn.dir < 0, ay = Math.round(playTop + playH * 0.42);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 10; i++) ctx.fillRect(ax - i, up ? ay + i : ay + 20 - i, i * 2 + 1, 1);
      ctx.fillRect(ax - 3, up ? ay + 10 : ay - 4, 7, 14);
      text(up ? 'GRAVITY FLIP!' : 'GRAVITY BACK!', W / 2, up ? ay + 28 : ay + 26, '#ff7ae0', { align: 'center', bold: true, shadow: '#2a0a2a' });
    }
  }
  const hash01 = n => { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
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
  // --- Decibel lockup (official mark in its yellow app-icon square + pixel wordmark), cached ---
  let lockup = null;
  function getLockup() {
    if (lockup) return lockup;
    const icon = BG.icon(54, '#fff600', '#bdb400', '#111111');
    const word = makeSprite(D.LOGO.word.map(r => r.replace(/#/g, 'w')), { w: '#ececec' });
    const wordSh = makeSprite(D.LOGO.word.map(r => r.replace(/#/g, 'w')), { w: '#1a1030' });
    const gap = 6, w = icon.width + gap + word.width + 1, h = icon.height;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(icon, 0, 0);
    const wy = Math.round(h / 2 - word.height / 2);
    g.drawImage(wordSh, icon.width + gap + 1, wy + 1); g.drawImage(word, icon.width + gap, wy);
    return (lockup = { c, h, icon, word, wordSh });
  }
  function drawLockup(cx, y, T) {
    const L = getLockup();
    if (T < 0.08) return;
    ctx.drawImage(L.c, Math.round(cx - L.c.width / 2), Math.round(y));
  }
  function drawSpeaker(x, y, on, T) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y + 2, 2, 3); ctx.fillRect(x + 2, y + 1, 1, 5); ctx.fillRect(x + 3, y, 1, 7);
    const k = Math.floor(T * 3) % 3;
    if (on) { if (k >= 0) ctx.fillRect(x + 5, y + 2, 1, 3); if (k >= 1) ctx.fillRect(x + 7, y + 1, 1, 5); if (k >= 2) ctx.fillRect(x + 9, y, 1, 7); }
  }
  function drawGate() {
    const T = stateT;
    ctx.fillStyle = 'rgba(8,4,18,0.55)'; ctx.fillRect(0, 0, W, H);
    const csc = 2, ch = 46 * csc, cy = Math.round(H / 2 - ch / 2 - 10);
    const sh = Math.round(Math.sin(T * 3) * 1.5);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(Math.round(W / 2 - 30), cy + ch - 2, 60, 3);
    drawSpr(Math.floor(T * 1.6) % 2 ? S.cat.idle2 : S.cat.idle, Math.round(W / 2 - 19 * csc), cy + sh * 0, false, csc);
    const big = textW('TAP TO START', 2, true) <= W - 10 ? 2 : 1;
    if (Math.floor(T * 2.2) % 2 === 0) text('TAP TO START', W / 2, cy + ch + 10, '#FFE500', { align: 'center', scale: big, bold: true, shadow: '#5a2a8a' });
    const hint = 'SOUND ON', hw = textW(hint) + 14, hx = Math.round(W / 2 - hw / 2), hy = cy + ch + 10 + 7 * big + 12;
    drawSpeaker(hx, hy, true, T); text(hint, hx + 14, hy, '#bdb3e6');
  }
  function drawTitle() {
    const T = DBG.poster ? 99 : stateT;
    ctx.fillStyle = 'rgba(8,4,18,0.38)'; ctx.fillRect(0, 0, W, H); // calm the busy city behind the title
    const word = 'DECICAT', sc = W >= 300 && H >= 300 ? 4 : 3, adv = 7 * sc;
    const tw = word.length * adv - sc, x0 = Math.round(W / 2 - tw / 2);
    const gy = baseY - 34, csc = 2, catTop = gy - 46 * csc;
    const L = getLockup(), LH = L.h, wordH = L.word.height;
    // stacked: lockup / DECICAT / subtitle / name row; side-by-side (icon left, wordmark + DECICAT + subtitle right) when short
    const tail = 9 + 15 + 4 + 7, stackH = LH + 6 + 8 * sc + 6 + 7 + tail;
    const colH = wordH + 4 + 8 * sc + 3 + 5 + 7, sideW = L.icon.width + 8 + tw;
    const side = catTop - 4 - stackH < 8 && sideW <= W - 8;
    const blockH = side ? Math.max(LH, colH) + tail : stackH;
    const y0 = Math.max(4, Math.round((catTop - 4 - blockH) / 2));
    let ty, tx0 = x0, subX, subY;
    if (side) {
      const gx = Math.round(W / 2 - sideW / 2), cx = gx + L.icon.width + 8, top = y0 + Math.max(0, Math.round((LH - colH) / 2));
      if (T >= 0.08) {
        ctx.drawImage(L.icon, gx, y0 + Math.max(0, Math.round((colH - LH) / 2)));
        ctx.drawImage(L.wordSh, cx + 1, top + 1); ctx.drawImage(L.word, cx, top);
      }
      ty = top + wordH + 4; tx0 = cx; subX = cx; subY = ty + 8 * sc + 3 + 5;
    } else {
      drawLockup(W / 2, y0, T);
      ty = y0 + LH + 6; subY = ty + 8 * sc + 6; subX = null;
    }
    for (let i = 0; i < word.length; i++) {
      const lt = clamp((T - 0.15 - i * 0.13) / 0.55, 0, 1); if (lt <= 0) continue;
      const y = Math.round(-30 + (ty + 30) * easeBounce(lt));
      text(word[i], tx0 + i * adv, y, i === 4 || i === 5 ? '#ffffff' : '#FFE500', { scale: sc, bold: true, shadow: '#8a2fb8', sx: 0, sy: sc });
    }
    const sub = 'A DECIBEL ADVENTURE';
    if (T > 1.2) {
      const n = DBG.poster ? 99 : Math.floor((T - 1.2) * 30);
      text(sub.slice(0, n), subX !== null ? subX : Math.round(W / 2 - textW(sub) / 2), subY, '#d9d0ff', { shadow: '#2a1d4a' });
    }
    // ground + cat
    ctx.fillStyle = '#5b4596'; ctx.fillRect(0, gy, W, 1);
    ctx.fillStyle = '#1a1030'; ctx.fillRect(0, gy + 1, W, H - gy - 1);
    drawSpr((Math.floor(T * 1.6) % 2 && !DBG.poster) ? S.cat.idle2 : S.cat.idle, Math.round(W / 2 - 19 * csc), catTop, false, csc);
    const credits = () => {
      text('ART & IDEA BY @DONCASTRO', W / 2, H - 19, '#b4a8e0', { align: 'center' });
      text('GAME BY @ANGELATAPTOS', W / 2, H - 10, '#8f84c4', { align: 'center' });
    };
    if (DBG.poster) { text('HOW LONG CAN YOU LAST?', W / 2, subY + 16, '#FFE500', { align: 'center', shadow: '#2a1d4a' }); text('TAP TO PLAY', W / 2, gy + 5, '#ffffff', { align: 'center', bold: true, shadow: '#2a1d4a' }); credits(); return; }
    if (T > 1.6) {
      // name row: current name + EDIT NAME button (both open the editor)
      const custom = !!sanitizeName(LS.get('decicat_name'));
      const nm = 'NAME: ' + playerName().toUpperCase(), btn = 'EDIT NAME';
      const pw = textW(nm) + 8, bw = textW(btn, 1, true) + 10, tot = pw + 4 + bw;
      const nx = Math.round(W / 2 - tot / 2), ny = subY + 7 + 9, bx = nx + pw + 4;
      UI.name = { x: nx - 2, y: ny - 3, w: tot + 4, h: 21 };
      ctx.fillStyle = '#140c28'; ctx.fillRect(nx, ny, pw, 15);
      ctx.fillStyle = '#6b55b0'; ctx.fillRect(nx, ny, pw, 1); ctx.fillRect(nx, ny + 14, pw, 1); ctx.fillRect(nx, ny, 1, 15); ctx.fillRect(nx + pw - 1, ny, 1, 15);
      text('NAME:', nx + 4, ny + 4, '#9a8ccc'); text(playerName().toUpperCase(), nx + 4 + 36, ny + 4, custom ? '#FFE500' : '#ffffff');
      const pulse = Math.floor(T * 2) % 2 === 0;
      ctx.fillStyle = '#5a3a00'; ctx.fillRect(bx, ny, bw, 15); ctx.fillStyle = pulse ? '#FFE500' : '#f0d040'; ctx.fillRect(bx + 1, ny + 1, bw - 2, 13);
      ctx.fillStyle = '#FFF3A0'; ctx.fillRect(bx + 1, ny + 1, bw - 2, 1);
      text(btn, bx + 5, ny + 4, '#2a1a00', { bold: true });
      const note = custom ? (best > 0 ? 'YOUR BEST ' + pad6(best) : 'READY WHEN YOU ARE') : 'OR JUST TAP TO PLAY ANONYMOUS';
      text(note, W / 2, ny + 19, custom ? '#a8e6a1' : '#9a8ccc', { align: 'center' });
      if (best > 0 && !custom) text('BEST ' + pad6(best), 4, 4, '#a8e6a1', { shadow: '#140b26' });
      if (Math.floor(T * 2.2) % 2 === 0) text('TAP TO START', W / 2, gy + 5, '#ffffff', { align: 'center', bold: true, shadow: '#2a1d4a' });
    }
    credits();
  }
  function drawOver() {
    ctx.fillStyle = 'rgba(8,4,18,0.84)'; ctx.fillRect(0, 0, W, H);
    const roomy = H >= 300, pitch = roomy ? 10 : 8;
    const total = roomy ? 18 + 10 + 10 + 11 + TOPN * pitch + 5 + 17 + 34 : 16 + 9 + 9 + 10 + TOPN * pitch + 4 + 16 + 3 + 7;
    const top = Math.max(0, Math.round((H - total) / 2));
    let y = top + (roomy ? 2 : 1);
    const lsc = textW('LIQUIDATED', 2, true) <= W - 8 ? 2 : 1;
    text('LIQUIDATED', W / 2, y, '#ff5a4a', { align: 'center', scale: lsc, bold: true, shadow: '#3a0a0a' });
    y += roomy ? 18 : 16;
    if (!result) return;
    text('SCORE ' + pad6(result.score) + (result.isBest ? '  NEW BEST!' : ''), W / 2, y, result.isBest ? '#FFE500' : '#ffffff', { align: 'center' });
    y += roomy ? 10 : 9;
    const R = result, st = R.status;
    let msg, mc = '#d9d0ff', sub = '- TOP ' + TOPN + ' -', scol = '#FFE500';
    if (R.pending) msg = 'SAVING...';
    else if (st === 'queued') { msg = "COULDN'T REACH THE LEADERBOARD"; mc = '#ffb070'; sub = 'WILL RETRY - TAP HERE TO RETRY NOW'; scol = '#bdb3e6'; }
    else if (st === 'rejected') { msg = 'SCORE NOT ACCEPTED'; mc = '#ff8a7a'; }
    else if (!R.ranked) msg = R.why === 'debug' ? 'PRACTICE RUN - NOT RANKED' : 'RUN TOO SHORT TO RANK';
    else if (R.rank > 0) { msg = 'YOU PLACED #' + R.rank + (R.total > TOPN ? ' OF ' + R.total : '') + '!'; mc = '#a8e6a1'; }
    else msg = 'NOT IN THE TOP ' + TOPN + ' - BEST ' + pad6(R.best);
    if (textW(msg) > W - 4) msg = msg.replace(' OF ' + R.total, '');
    if (st === 'local') sub = '- TOP ' + TOPN + ' (THIS DEVICE) -';
    text(msg, W / 2, y, mc, { align: 'center' });
    y += roomy ? 10 : 9;
    text(sub, W / 2, y, scol, { align: 'center' });
    const rowW0 = 27 * 6;
    UI.retry = { x: Math.round(W / 2 - rowW0 / 2) - 4, y: y - 3, w: rowW0 + 8, h: 14 + TOPN * pitch };
    y += roomy ? 11 : 10;
    const rowW = 27 * 6, tx = Math.round(W / 2 - rowW / 2);
    const empty = !R.top || !R.top.length;
    if (empty && (R.pending || R.board === 'loading' || R.board === 'error')) {
      const my = y + Math.round(TOPN * pitch / 2) - 8;
      if (R.board === 'error' && !R.pending) {
        const bw2 = 84, bx2 = Math.round(W / 2 - bw2 / 2);
        text("LEADERBOARD DIDN'T LOAD", W / 2, my - 12, '#bdb3e6', { align: 'center' });
        ctx.fillStyle = '#2a1d4a'; ctx.fillRect(bx2 - 1, my - 1, bw2 + 2, 17); ctx.fillStyle = '#3a2d63'; ctx.fillRect(bx2, my, bw2, 15);
        text('TAP TO RETRY', W / 2, my + 4, '#FFE500', { align: 'center' });
      } else if (Math.floor(bgT * 3) % 3 !== 2) text('LOADING...', W / 2, my + 4, '#bdb3e6', { align: 'center' });
      y += TOPN * pitch;
    } else for (let i = 0; i < TOPN; i++) {
      const e = result.top[i], mine = e && result.id && e.id === result.id;
      if (mine) { ctx.fillStyle = (Math.floor(bgT * 3) % 2) ? '#6b4b00' : '#553c00'; ctx.fillRect(tx - 3, y - 1, rowW + 6, pitch); }
      else if (i % 2 === 0) { ctx.fillStyle = 'rgba(120,100,200,0.10)'; ctx.fillRect(tx - 3, y - 1, rowW + 6, pitch); }
      const col = mine ? '#FFE500' : (i < 3 ? '#ffffff' : '#bdb3e6');
      text(String(i + 1).padStart(2, ' ') + '.', tx, y, col);
      text(e ? String(e.name).toUpperCase().slice(0, 16) : '---', tx + 21, y, e ? col : '#5b4f8a');
      if (e) text(pad6(e.score), tx + rowW, y, col, { align: 'right' });
      if (mine) { ctx.fillStyle = '#FFE500'; const ax = tx - 7, ay = y + 1; ctx.fillRect(ax, ay, 1, 5); ctx.fillRect(ax + 1, ay + 1, 1, 3); ctx.fillRect(ax + 2, ay + 2, 1, 1); }
      y += pitch;
    }
    y += roomy ? 5 : 4;
    // buttons side by side
    const bw = 92, mw = 52, gap = 8, bx = Math.round(W / 2 - (bw + gap + mw) / 2), mx = bx + bw + gap;
    UI.again = { x: bx - 3, y: y - 3, w: bw + 6, h: 22 };
    UI.menu = { x: mx - 3, y: y - 3, w: mw + 6, h: 22 };
    const blink = stateT > 0.7;
    ctx.fillStyle = '#5a3a00'; ctx.fillRect(bx - 1, y - 1, bw + 2, 17);
    ctx.fillStyle = blink ? '#FFE500' : '#8a7a30'; ctx.fillRect(bx, y, bw, 15);
    ctx.fillStyle = '#FFF3A0'; ctx.fillRect(bx, y, bw, 1);
    text('PLAY AGAIN', bx + Math.round(bw / 2), y + 4, '#2a1a00', { align: 'center', bold: true });
    ctx.fillStyle = '#2a1d4a'; ctx.fillRect(mx - 1, y - 1, mw + 2, 17); ctx.fillStyle = '#3a2d63'; ctx.fillRect(mx, y, mw, 15);
    text('MENU', mx + Math.round(mw / 2), y + 4, '#d9d0ff', { align: 'center', bold: true });
    y += 17;
    if (roomy) {
      text('TRADE LOUD ON DECIBEL.TRADE', W / 2, y + 8, '#FFE500', { align: 'center' });
      text('DECICAT ART & IDEA BY @DONCASTRO', W / 2, y + 20, '#7d70b0', { align: 'center' });
    } else text('TRADE LOUD ON DECIBEL.TRADE', W / 2, y + 2, '#FFE500', { align: 'center' });
  }
  function drawClaim() {
    const R = result; R.claimT = (R.claimT || 0) + 1 / 60;
    ctx.fillStyle = 'rgba(4,2,10,0.86)'; ctx.fillRect(0, 0, W, H);
    const big = textW(R.claim, 2, true) <= W - 24 ? 2 : 1;
    const bw = Math.min(W - 8, Math.max(textW(R.claim, big, true), textW("YOU'LL NEED IT TO CLAIM A PRIZE.")) + 20), bh = 96;
    const bx = Math.round(W / 2 - bw / 2), by = Math.round(H / 2 - bh / 2);
    ctx.fillStyle = '#FFE500'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = '#1a1030'; ctx.fillRect(bx, by, bw, bh);
    let y = by + 7;
    text('TOP 20! #' + R.rank, W / 2, y, '#a8e6a1', { align: 'center', bold: true }); y += 11;
    text('YOUR CLAIM CODE', W / 2, y, '#d9d0ff', { align: 'center' }); y += 11;
    ctx.fillStyle = '#2d2050'; ctx.fillRect(bx + 6, y - 3, bw - 12, big === 2 ? 18 : 11);
    text(R.claim, W / 2, y, '#FFE500', { align: 'center', scale: big, bold: true, shadow: '#5a3a00' }); y += big === 2 ? 20 : 13;
    text('SCREENSHOT THIS!', W / 2, y, '#ffffff', { align: 'center', bold: true }); y += 10;
    text("YOU'LL NEED IT TO CLAIM A PRIZE.", W / 2, y, '#ffffff', { align: 'center' }); y += 12;
    if (R.claimT > 1.2 && Math.floor(bgT * 2) % 2 === 0) text('TAP TO CONTINUE', W / 2, y, '#bdb3e6', { align: 'center' });
  }
  function drawPause() {
    ctx.fillStyle = 'rgba(8,4,18,0.7)'; ctx.fillRect(0, 0, W, H);
    text('PAUSED', W / 2, H / 2 - 14, '#FFE500', { align: 'center', scale: 2, bold: true, shadow: '#2a1d4a' });
    text('TAP TO RESUME', W / 2, H / 2 + 8, '#ffffff', { align: 'center' });
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sh = shake > 0 ? Math.round((Math.random() * 4 - 2) * shake * 6) : 0;
    ctx.translate(sh, Math.round(sh * 0.5));
    drawBackground();
    if (state === 'gate') { drawGate(); return; }
    if (state === 'title') { drawTitle(); if (!DBG.poster) drawToggles(); return; }
    drawWorld();
    if (pwT.slow > 0 && state === 'play') { ctx.fillStyle = 'rgba(255,216,74,0.07)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = 'rgba(255,216,74,0.35)'; ctx.fillRect(0, 0, W, 1); ctx.fillRect(0, H - 1, W, 1); }
    if (state === 'play' || state === 'dying') { drawFlipFx(); drawBanner(); drawHUD(); }
    if (state === 'over') { drawOver(); if (result && result.claimShow && result.claim) drawClaim(); else drawToggles(); }
    if (paused && state === 'play') drawPause();
    if (MEM) drawMem();
  }

  let memFps = 0, memFrames = 0, memT = 0, memTxt = [];
  function drawMem() {
    memFrames++;
    const now = performance.now();
    if (now - memT > 500) {
      memFps = Math.round(memFrames * 1000 / (now - memT || 1)); memFrames = 0; memT = now;
      const c = MEM.canvases(), A = D.Audio, pm = performance.memory, bs = BG.stats();
      memTxt = [
        'MEM ' + W + 'X' + H + ' @' + (+SCALE).toFixed(2) + ' DPR ' + (window.devicePixelRatio || 1) + ' ' + memFps + 'FPS',
        'CANVAS ' + c.n + ' LIVE ' + c.mpx.toFixed(2) + 'MPX',
        'CACHE BG ' + bs.zones + ' EARTH ' + bs.earth + ' MARK ' + bs.marks + ' GAME ' + Object.keys(bgCache).length,
        'AUDIO NODES ' + MEM.aLive + ' LIVE ' + MEM.aCreated + ' MADE',
        'AUDIO ' + (A && A.ctx ? A.ctx.state + ' ' + A.ctx.sampleRate + 'HZ LAT ' + Math.round((A.ctx.baseLatency || 0) * 1000) + 'MS VOICES ' + A.voiceSets() : 'OFF'),
        pm ? 'HEAP ' + (pm.usedJSHeapSize / 1048576).toFixed(1) + '/' + (pm.totalJSHeapSize / 1048576).toFixed(1) + 'MB LIM ' + Math.round(pm.jsHeapSizeLimit / 1048576) : 'HEAP N/A'
      ];
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000000'; ctx.fillRect(0, H - memTxt.length * 7 - 4, W, memTxt.length * 7 + 4);
    memTxt.forEach((t, i) => D.TINY.draw(ctx, t, 2, H - memTxt.length * 7 - 1 + i * 7, '#7CFC9A'));
  }

  // ---------- loop ----------
  let last = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (DBG.manual) return;
    const real = Math.min(0.25, last ? (ts - last) / 1000 : FIX); last = ts;
    acc += real; let n = 0;
    while (acc >= FIX && n < 8) { update(FIX); acc -= FIX; n++; }
    if (n >= 8) acc = 0; // way behind (tab was hidden): drop the backlog instead of fast-forwarding
    render();
  }
  resize();
  if (DBG.autostart) startGame();
  requestAnimationFrame(frame);

  // test / debug hooks
  window.__decicat = {
    get rec() { return REC; }, get stats() { return { dist: Math.floor(dist / 2), bonus, coinsN, runT: +runT.toFixed(1) }; }, get state() { return state; }, get stateT() { return stateT; }, get paused() { return paused; }, get score() { return score(); }, get zone() { return zone; }, get boost() { return cat.boost; },
    get result() { return result; }, get death() { return lastDeath; }, get size() { return [W, H, SCALE]; },
    advance(n, dt) { dt = dt || 1 / 60; for (let i = 0; i < n; i++) update(dt); render(); },
    press: (x, y) => press(x, y), release, start: startGame, boost: startBoost, leaveGate,
    get ui() { return UI; }, get audio() { const A = D.Audio; return A && { ctx: A.ctx ? A.ctx.state : null, song: A.cur ? A.cur.name : null, music: A.musicOn, sfx: A.sfxOn }; },
    get dbgStage() { return { onWhale: cat.g && plats.some(w => w.k === 'w' && surf(w, cat.x, 10) !== null && Math.abs(surf(w, cat.x, 10) - cat.y) < 3), inPress: presses.some(q => q.ph === 3 && cat.x > q.x0 + 10 && cat.x < q.x1 - 10), flipWarn: !!flipWarn, grav, cat: { x: cat.x, y: cat.y, vy: cat.vy, g: cat.g }, presses: presses.map(q => ({ x0: q.x0, x1: q.x1, fy: q.fy, ph: q.ph, bot: q.bot })), plats: plats.filter(p => p.k === 'c' && Math.abs(p.x - cat.x) < 80).map(p => [Math.round(p.x), p.w, Math.round(p.y), p.red ? 1 : 0, p.plate ? 1 : 0]) }; },
    pw: k => pickItem({ k, x: cat.x, y: cat.y - 22 }), zoneName, showItems: () => { PW_KEYS.forEach((k, i) => items.push({ k, x: cat.x + 60 + i * 50, y: cat.y - 40 })); }, get pwState() { return { shield: shieldOn, mag: +pwT.mag.toFixed(2), slow: +pwT.slow.toFixed(2), dia: +pwT.dia.toFixed(2), grav }; },
    kill: () => die('test'), simulate, get replay() { return lastReplay; }, get version() { return VERSION; }, get simFrame() { return simFrame; }, Scores, LocalScores, RemoteScores, sanitizeName
  };
})(window.DECICAT);
