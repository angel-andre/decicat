/* DECICAT sprites + bitmap font (pure data, drawn as pixel art in code) */
(function (G) {
  'use strict';
  // 5x7 font, rows top->bottom, 5 bits each (MSB = left)
  const F = {
    'A':[14,17,17,31,17,17,17],'B':[30,17,17,30,17,17,30],'C':[14,17,16,16,16,17,14],'D':[30,17,17,17,17,17,30],
    'E':[31,16,16,30,16,16,31],'F':[31,16,16,30,16,16,16],'G':[14,17,16,23,17,17,15],'H':[17,17,17,31,17,17,17],
    'I':[14,4,4,4,4,4,14],'J':[7,2,2,2,2,18,12],'K':[17,18,20,24,20,18,17],'L':[16,16,16,16,16,16,31],
    'M':[17,27,21,21,17,17,17],'N':[17,17,25,21,19,17,17],'O':[14,17,17,17,17,17,14],'P':[30,17,17,30,16,16,16],
    'Q':[14,17,17,17,21,18,13],'R':[30,17,17,30,20,18,17],'S':[15,16,16,14,1,1,30],'T':[31,4,4,4,4,4,4],
    'U':[17,17,17,17,17,17,14],'V':[17,17,17,17,17,10,4],'W':[17,17,17,21,21,21,10],'X':[17,17,10,4,10,17,17],
    'Y':[17,17,10,4,4,4,4],'Z':[31,1,2,4,8,16,31],
    '0':[14,17,19,21,25,17,14],'1':[4,12,4,4,4,4,14],'2':[14,17,1,2,4,8,31],'3':[31,2,4,2,1,17,14],
    '4':[2,6,10,18,31,2,2],'5':[31,16,30,1,1,17,14],'6':[6,8,16,30,17,17,14],'7':[31,1,2,4,8,8,8],
    '8':[14,17,17,14,17,17,14],'9':[14,17,17,15,1,2,12],
    '.':[0,0,0,0,0,12,12],',':[0,0,0,0,12,4,8],'!':[4,4,4,4,4,0,4],'?':[14,17,1,2,4,0,4],
    ':':[0,12,12,0,12,12,0],'-':[0,0,0,31,0,0,0],'+':[0,4,4,31,4,4,0],'$':[4,15,20,14,5,30,4],
    '#':[10,10,31,10,31,10,10],'/':[1,1,2,4,8,16,16],"'":[4,4,8,0,0,0,0],'@':[14,17,23,21,23,16,15],
    'x':[0,0,17,10,4,10,17],'_':[0,0,0,0,0,0,31],'(':[2,4,8,8,8,4,2],')':[8,4,2,2,2,4,8],
    '&':[12,18,20,8,21,18,13],'%':[24,25,2,4,8,19,3],'=':[0,0,31,0,31,0,0],'*':[0,21,14,31,14,21,0],
    '>':[8,4,2,1,2,4,8],'<':[2,4,8,16,8,4,2],' ':[0,0,0,0,0,0,0]
  };
  G.FONT = F;
  // Decicat: traced 1:1 from Castro's (@doncastro) original pixel art (38x46 native grid).
  // v5.2: the raised paw (rows 19-31, x 22-33) is redrawn as the thinking pose: a curled paw at the chin, the index finger
  // bent with its tip touching the chin, knuckles stacked on the left (no single raised digit).
  // Y = body gold with the original's subtle top->bottom gradient (see CATPAL.Y).
  const CAT = [
    '.......KK......KKKKKKKKKK......KKK....',
    '.......KLKK..GGGGGGGGGGGGGG..KKLDK....',
    '......KLLYLGGKLLLLLLLLLLLLKGGLLLDK....',
    '......KLYYGYLLLLYYYYYYYYYYYLLGYYDK....',
    '......KLYGYYYYYYYYYYYYYYYYYYYYGYDK....',
    '.......KYGYYYYYYYYYYYYYYYYYYYYYGDK....',
    '.......KGYYYYYYYYYYYYYYYYYYYYYYGDK....',
    '.......KGYYYYYYYYYYYYYYYYYYYYYYYGK....',
    '......KLLYYYYYYYYYYYYYYYYYYYYYYYDK....',
    '......KLYYYYYYYYDDDDDYYYYDDDDDYYYDK...',
    '....GGGGYYYYYYYYYYYYYYYYYYYYYYYYYDGG..',
    '...GGGGGGKYYYYYKKKKKKKYYYKKKKKYYKGGGG.',
    '...GgGGGGKYYYYYKKKKKKKYYYKKKKKYYKGGgG.',
    '...GgGGGGKYYYYKKKKKKKKKKKKKKKKKYKGGgG.',
    '...GgGGGGKYYYYKKKKKKKKKKKKKKKKKYKGGgG.',
    '...GgGGGGKYYYYKLLLLKKLKKKLLKKLKYKGGgG.',
    '...GgGGGGKYYYYYKLLLKKKYYYKLKKKYYKGGgG.',
    '...GgGGGGKYYYYYYKKKKKYYYYYKKKYYYKGGgG.',
    '...GGGGGGKYYYYYYYYYYYYYKKKYYYYYYKGGGG.',
    '....GGGGYYYYYYYYYYYYYYYYKYYYYYYYYDGG..',
    '......KYYYYYDDDDDYYKYYYYKYYKYYYYYDK...',
    '......KLYYYYYYYYYYYYKKKKKKKYYYYYYDK...',
    '.....KLLYYYYYDDDDDYYYYKYYKKKKKYYYYDK..',
    '.....KLYYYYYYYYYYYYYYYKYYLLLYYKKYYDK..',
    '....KLLYYYYYYYYYYYYYYYYKYYYYYYYYKYYDK.',
    '....KLYYDYYYYYYYYYYYYYYYKDDYYYYYYKYDK.',
    '....KLYYDYYYYYYYYYYYYYYKYYYYYYYYYKYDK.',
    '....KLYYDYYYYYYYYYYYYYYYKDDDYYYYYKYDK.',
    '...KLLYYDYYYYYYYYYYYYYYYKYYYYYYYYKYDK.',
    '...KLYYYDYYYYYYYYYYYYYYYYKDDDYYYYKYDK.',
    '...KLYYYYDYYYYYYYYYYYYYYYKYYYYYYKYDDK.',
    '...KLYYYYDYYDYYYYYYYYYYYYYKKYYYKYDDK..',
    '...KLYYYYDYYDYYYYYYYYYYYYYYYKKKYYDK...',
    '.K..KYYYYDYYDYYYYYYYYYYYYYYYYYYYYDK...',
    'KDK.KYYYYDYYDYYYYYYYYYYYYYYYYYYYDDK...',
    'KDK.KYYYKYDDYKYYYYYYYYYYYYYYYYYYDK....',
    'KDK.KYYYKKKKKKYYYYYYYYYYYYYYYYYYDK....',
    'KDK..KYYYYYYYYYYYYYYYYYYYYYYYYYDDK....',
    'KLYKKLYYYYYYYYYYYYYYYYYYYYYYYYYDK.....',
    'KYYYYYYYYYYYYYYYYYDDDYYYYYYYYYDDK.....',
    '.KYYYYYYYYYYYYYYYDDKKKYYYYYYYYDK......',
    '.KKDDDYYYYYYYYYYYDK...KYYYYYYYDK......',
    '...KKKKYYYYYYYYYYDK...KYYYYYYYYDK.....',
    '.......KYYYDYYDYYDK...KYYYDYYDYDDK....',
    '.......KDDDKDDKDDDK...KKDDKDDKDDKK....',
    '.......KKKKKKKKKKKK...KKKKKKKKKKKK....'
  ];
  const CATPAL = {
    K: '#100e0c', G: '#292725', g: '#575350', L: '#f0d66a', D: '#bb872e',
    Y: function (y) { const t = Math.max(0, Math.min(1, (y - 2) / 43)); const c = (a, b) => Math.round(a + (b - a) * t); return 'rgb(' + c(238, 206) + ',' + c(190, 164) + ',' + c(70, 58) + ')'; }
  };
  const W_ = 38, H_ = CAT.length;
  const grid = rows => rows.map(r => r.split(''));
  const ungrid = g => g.map(a => a.join(''));
  // shift a rectangular region up by n px (vacated pixels become transparent)
  function lift(rows, x0, x1, y0, y1, n) {
    const src = grid(rows), out = grid(rows);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out[y][x] = '.';
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const c = src[y][x]; if (c !== '.' && y - n >= 0) out[y - n][x] = c; }
    return ungrid(out);
  }
  function shiftDown(rows, y0, y1, n) { // move rows y0..y1 down by n (overwrites below), clears top
    const g = grid(rows), out = grid(rows);
    for (let y = y1; y >= y0; y--) for (let x = 0; x < W_; x++) { if (y + n < H_ && g[y][x] !== '.') out[y + n][x] = g[y][x]; }
    for (let y = y0; y < y0 + n; y++) for (let x = 0; x < W_; x++) out[y][x] = '.';
    // keep outline continuity: rows overwritten that were body keep the shifted copy
    return ungrid(out);
  }
  const FEET_Y0 = 41, FEET_Y1 = H_ - 1;          // feet rows
  const LFOOT = [6, 19], RFOOT = [21, 34], TAIL = [0, 5, 32, 41];
  const tailUp = (r, n) => lift(r, TAIL[0], TAIL[1], TAIL[2], TAIL[3], n);
  const idle2 = shiftDown(CAT, 0, 39, 1);
  const run1 = tailUp(lift(CAT, LFOOT[0], LFOOT[1], FEET_Y0, FEET_Y1, 2), 1);
  const run3 = lift(CAT, RFOOT[0], RFOOT[1], FEET_Y0, FEET_Y1, 2);
  const jump = tailUp(lift(lift(CAT, LFOOT[0], LFOOT[1], FEET_Y0, FEET_Y1, 2), RFOOT[0], RFOOT[1], FEET_Y0, FEET_Y1, 2), 2);
  // dead: X'd shades (glints blacked out, X marks on each lens)
  const dg = grid(CAT);
  for (let y = 11; y <= 17; y++) for (let x = 13; x <= 31; x++) if (dg[y][x] === 'L') dg[y][x] = 'K';
  [[17, 14], [27, 14]].forEach(([cx, cy]) => { for (let d = -2; d <= 2; d++) { dg[cy + d][cx + d] = 'L'; dg[cy + d][cx - d] = 'L'; } });
  const dead = ungrid(dg);
  G.SPR = {
    cat: { pal: CATPAL, frames: { idle: CAT, idle2, run1, run2: CAT, run3, run4: CAT, jump, dead } },
    bear: { pal: { K: '#120a08', B: '#7a4a2a', D: '#4a2a16', M: '#c9935f', W: '#ffffff', R: '#ff4a3a' }, frames: {
      walk1: [
        '....KKK....KKK................',
        '...KBBBK..KBBBK...............',
        '...KBDBKKKKBDBK...KKKKKKKKK...',
        '..KBBBBBBBBBBBBKKKBBBBBBBBBKK.',
        '.KBBBBBBBBBBBBBBBBBBBBBBBBBBBK',
        '.KBKKKKBBBBBBBBBBBBBBBBBBBBBBK',
        'KBBBBRKBBBBBBBBBBBBBBBBBBBBBBK',
        'KMMBBKBBBBBBBBBBBBBBBBBBBBBBBK',
        'KKMMMBBBBBBBBBBBBBBBBBBBBBBBDK',
        'KMMMMBBBBBBBBBBBBBBBBBBBBBBBDK',
        '.KWKWKBBBBBBBBBBBBBBBBBBBBBDDK',
        '..KKKBBBBBBBBBBBBBBBBBBBBBDDDK',
        '...KBBBBBBBBBBBBBBBBBBBBBDDDK.',
        '...KBBDBBBBBBBBBBBBBBBBDDDDDK.',
        '...KBBDDBBBBBBBBBBBBBBDDDDDK..',
        '...KBBBKKKKKKKKKKKKKKKBBDDDK..',
        '...KBBBK.KBBBK....KBBBKBBDK...',
        '...KDDDK.KDDDK....KDDDKDDDK...',
        '...KKKKK.KKKKK....KKKKKKKKK...'
      ],
      walk2: null
    } },
    coin: { pal: { K: '#5a3a00', Y: '#FFD21F', L: '#FFF3A0', D: '#C98A00' }, frames: {
      c1: ['..KKKK..', '.KYLLYK.', 'KYLYYYDK', 'KYLYYYDK', 'KYLYYYDK', 'KYYYYDDK', '.KYDDDK.', '..KKKK..'],
      c2: ['.KKKK.', 'KYLLYK', 'KLYYDK', 'KLYYDK', 'KLYYDK', 'KYYDDK', 'KYDDDK', '.KKKK.'],
      c3: ['.KK.', 'KLYK', 'KLYK', 'KLDK', 'KLDK', 'KYDK', 'KYDK', '.KK.']
    } }
  };
  // bear walk frame 2: alternate leg pairs
  (function () {
    const b = G.SPR.bear.frames.walk1, hb = b.length;
    let r = lift(b, 3, 8, hb - 3, hb - 1, 1);
    r = lift(r, 18, 22, hb - 3, hb - 1, 1);
    G.SPR.bear.frames.walk2 = r;
  })();
// Official Decibel logo (from decibel.trade logo_full.svg): pixel wordmark/mark (14px / 15px tall, thresholded + hand-cleaned)
// and the mark's original vector paths (rasterised at runtime for larger sizes).
G.LOGO = {"word":["#######..........................##..##...................##","#########........................##..##...................##","##.....###...........................##...................##","##......###..........................##...................##","##.......##....####......#####...##..##..###......####....##","##.......##...#######...#######..##..########....#######..##","##.......##..##....##..###...###.##..###....##..##....##..##","##.......##..##.....##.##.....#..##..##.....##..##.....##.##","##.......##.##########.##........##..##......##.#########.##","##.......##.###........##........##..##......##.##........##","##......##...##........##.....##.##..##.....##..##........##","##.....###...##....##..###...###.##..###....##..##....##..##","#########.....#######...#######..##..########....#######..##","######.........####.......###....##..##..###......####....##"],"mark":[".........###..",".......######.",".......#######","...#...######.","..###...######","#####.....####","#####.........","#####.........","#####.........","#####.....####","..###...######","...#...######.",".......#######",".......######.",".........###.."],"markPaths":["M8.74624 12.5009C8.74624 16.384 7.44005 19.5339 5.82893 19.5339C4.60358 19.5339 3.55409 17.7101 3.12153 15.1275C2.80101 16.099 2.30605 16.7216 1.75152 16.7216C0.784282 16.7216 0 14.8325 0 12.5023C0 10.1722 0.784282 8.28307 1.75152 8.28307C2.30746 8.28307 2.80101 8.90568 3.12153 9.87717C3.55409 7.29457 4.60358 5.47072 5.82893 5.47072C7.44146 5.47072 8.74624 8.6192 8.74624 12.5037V12.5009Z","M15.4022 16.3428C18.7648 14.4013 22.1459 13.9573 22.9514 15.3529C23.5641 16.4137 22.5089 18.2347 20.4894 19.9012C21.4906 19.6927 22.2777 19.8104 22.5557 20.2912C23.0393 21.1279 21.7941 22.7518 19.776 23.9176C17.7578 25.0834 15.7298 25.3486 15.2462 24.5118C14.9682 24.031 15.2603 23.2921 15.9411 22.5277C13.489 23.4453 11.3843 23.4482 10.7716 22.3859C9.96608 20.9904 12.0395 18.2844 15.4036 16.3428H15.4022Z","M15.4024 8.65719C12.0398 6.71563 9.96489 4.00964 10.7704 2.6141C11.3831 1.55326 13.4878 1.5561 15.9399 2.47228C15.2592 1.70927 14.967 0.968951 15.245 0.48817C15.7286 -0.348587 17.7567 -0.0833777 19.7748 1.08241C21.7929 2.2482 23.0367 3.87065 22.5545 4.70883C22.2766 5.18961 21.4909 5.30732 20.4882 5.09884C22.5092 6.76385 23.5629 8.58486 22.9502 9.64711C22.1447 11.0427 18.765 10.6002 15.401 8.65719H15.4024Z"]};
// Decibel mark traced from the reference by box-downsampling (48 and 40 px masks), mirrored top->bottom, singles removed
G.LOGO.mark48 = ["..........................######........", "..........................########......", "...........................#########....", "...................##################...", "...................###################..", "..................#####################.", "...................####################.", "...................####################.", "....................##################..", ".........###........#################...", "........#####........#################..", ".......######.........#################.", ".......#######..........###############.", "......########...........###############", "..##..########.............#############", ".####.#########..............###########", ".##############................########.", ".##############....................###..", "###############.........................", "###############.........................", "###############.........................", "###############.........................", "###############.........................", "###############.........................", ".##############....................###..", ".##############................########.", ".####.#########..............###########", "..##..########.............#############", "......########...........###############", ".......#######..........###############.", ".......######.........#################.", "........#####........#################..", ".........###........#################...", "....................##################..", "...................####################.", "...................####################.", "..................#####################.", "...................###################..", "...................##################...", "...........................#########....", "..........................########......", "..........................######........"];
G.LOGO.mark40 = [".......................###........", "......................#######.....", "......................########....", "................###############...", "................################..", "................#################.", "................#################.", ".................###############..", "........##.......##############...", ".......####.......##############..", "......######........#############.", "......######.........############.", "..##.#######..........############", ".############...........##########", ".############..............######.", ".############.....................", ".############.....................", "#############.....................", "#############.....................", ".############.....................", ".############.....................", ".############..............######.", ".############...........##########", "..##.#######..........############", "......######.........############.", "......######........#############.", ".......####.......##############..", "........##.......##############...", ".................###############..", "................#################.", "................#################.", "................################..", "................###############...", "......................########....", "......................#######.....", ".......................###........"];
})(window.DECICAT = window.DECICAT || {});
