// Object painters: furniture, appliances, vehicles, garden props. Each takes a target
// layer and art-pixel coordinates (top-left), draws an outlined sprite and stamps it.

import { rng, sprite } from './draw.mjs';

const FABRIC = {
  green: ['gb1', 'gb2', 'gb3'],
  blue: ['bb1', 'bb2', 'bb3'],
  purple: ['pp1', 'pp2', 'pp3'],
  red: ['r1', 'r2', 'r3'],
};

const done = (L, s, x, y) => {
  s.outline('K');
  L.stamp(s, x - 1, y - 1);
};

// ---------- Bedroom ----------

export function bed(L, x, y, w, h, color = 'green') {
  const [d, m, l] = FABRIC[color];
  const s = sprite(w + 2, h + 2);
  const o = 1;
  s.rect(o, o, w, h, 'fw3');
  s.rect(o, o, w, 6, 'fw2'); // headboard
  s.hl(o, o + 1, w, 'fw4');
  const pw = w >= 40 ? Math.floor((w - 8) / 2) : w - 6;
  for (let i = 0; i < (w >= 40 ? 2 : 1); i++) {
    const px = o + 3 + i * (pw + 2);
    s.rect(px, o + 7, pw, 8, 'lw2');
    s.hl(px, o + 7, pw, 'lw3');
    s.hl(px, o + 14, pw, 'lw1');
  }
  s.rect(o + 2, o + 17, w - 4, 4, 'lw2'); // folded sheet
  s.rect(o + 2, o + 21, w - 4, h - 26, m);
  s.hl(o + 2, o + 21, w - 4, l);
  for (let j = o + 25; j < o + h - 6; j += 6) s.hl(o + 3, j, w - 6, d);
  s.vl(o + 2, o + 21, h - 26, d);
  s.vl(o + w - 3, o + 21, h - 26, d);
  s.rect(o, o + h - 5, w, 5, 'fw2'); // footboard
  s.hl(o, o + h - 5, w, 'fw4');
  done(L, s, x, y);
}

export function nightstand(L, x, y, lamp = true) {
  const s = sprite(16, 18);
  s.rect(1, 5, 14, 12, 'fw3');
  s.hl(1, 5, 14, 'fw4');
  s.hl(3, 12, 10, 'fw2');
  s.px(8, 14, 'y2');
  if (lamp) {
    s.rect(6, 4, 4, 2, 'y1');
    s.ellipse(8, 3, 4, 3, 'y2');
    s.ellipse(8, 2.5, 2.5, 2, 'y3');
  }
  done(L, s, x, y - 4);
}

export function wardrobe(L, x, y, w, h) {
  const s = sprite(w + 2, h + 2);
  s.rect(1, 1, w, h, 'fw2');
  s.rect(2, 2, w - 2, h - 2, 'fw3');
  s.vl(1 + Math.floor(w / 2), 2, h - 2, 'fw1');
  s.hl(2, 2, w - 2, 'fw4');
  s.px(Math.floor(w / 2) - 1, Math.floor(h / 2), 'y2');
  s.px(Math.floor(w / 2) + 3, Math.floor(h / 2), 'y2');
  done(L, s, x, y);
}

export function dresser(L, x, y, w, h, top = []) {
  const s = sprite(w + 2, h + 2);
  s.rect(1, 1, w, h, 'fw3');
  s.rect(1, 1, w, 4, 'fw4');
  for (let j = 7; j < h - 1; j += 5) {
    s.hl(2, j, w - 2, 'fw2');
    s.px(Math.floor(w / 2) + 1, j + 2, 'y2');
  }
  done(L, s, x, y);
  for (const t of top) t(L);
}

// ---------- Living room ----------

/** A sofa; `facing` is the direction its seat faces. */
export function sofa(L, x, y, w, h, facing = 'down', color = 'red') {
  const [d, m, l] = FABRIC[color];
  const s = sprite(w + 2, h + 2);
  const o = 1;
  if (facing === 'down' || facing === 'up') {
    s.rect(o, o, w, h, d);
    const back = facing === 'down' ? o : o + h - 6;
    s.rect(o, back, w, 6, d);
    s.hl(o, back, w, m);
    const seatY = facing === 'down' ? o + 6 : o + 1;
    const n = Math.max(1, Math.round((w - 8) / 16));
    const cw = Math.floor((w - 8) / n);
    for (let i = 0; i < n; i++) {
      s.rect(o + 4 + i * cw, seatY, cw - 1, h - 7, m);
      s.hl(o + 4 + i * cw, seatY, cw - 1, l);
    }
    s.rect(o, o, 4, h, d);
    s.rect(o + w - 4, o, 4, h, d);
    s.vl(o + 1, o + 1, h - 2, m);
    s.vl(o + w - 3, o + 1, h - 2, m);
  } else {
    s.rect(o, o, w, h, d);
    const back = facing === 'right' ? o : o + w - 6;
    s.rect(back, o, 6, h, d);
    s.vl(back, o, h, m);
    const seatX = facing === 'right' ? o + 6 : o + 1;
    const n = Math.max(1, Math.round((h - 8) / 16));
    const ch = Math.floor((h - 8) / n);
    for (let i = 0; i < n; i++) {
      s.rect(seatX, o + 4 + i * ch, w - 7, ch - 1, m);
      s.hl(seatX, o + 4 + i * ch, w - 7, l);
    }
    s.rect(o, o, w, 4, d);
    s.rect(o, o + h - 4, w, 4, d);
  }
  done(L, s, x, y);
}

export function table(L, x, y, w, h, items = []) {
  const s = sprite(w + 2, h + 4);
  s.rect(2, h - 1, 2, 4, 'fw1');
  s.rect(w - 3, h - 1, 2, 4, 'fw1');
  s.rect(1, 1, w, h - 2, 'fw4');
  for (let j = 5; j < h - 3; j += 5) s.hl(2, j, w - 2, 'fw3');
  s.hl(1, 1, w, 'fw5');
  s.rect(1, h - 2, w, 2, 'fw2');
  done(L, s, x, y);
  for (const it of items) it(L);
}

export function chair(L, x, y, facing = 'down') {
  const s = sprite(12, 12);
  s.rect(1, 2, 10, 9, 'fw3');
  s.hl(1, 2, 10, 'fw4');
  if (facing === 'down') s.rect(1, 1, 10, 3, 'fw2');
  if (facing === 'up') s.rect(1, 8, 10, 3, 'fw2');
  if (facing === 'right') s.rect(1, 1, 3, 10, 'fw2');
  if (facing === 'left') s.rect(8, 1, 3, 10, 'fw2');
  done(L, s, x, y);
}

/** A dining table with chairs on every side, spaced along its length. */
export function diningSet(L, x, y, w, h, centerpiece = true) {
  const across = Math.max(1, Math.floor((w - 4) / 22));
  for (let i = 0; i < across; i++) {
    const cx = x + 3 + i * Math.floor((w - 6) / across) + Math.floor((w - 6) / across / 2) - 6;
    chair(L, cx, y - 9, 'down');
    chair(L, cx, y + h - 2, 'up');
  }
  const down = Math.max(1, Math.floor((h - 4) / 22));
  for (let j = 0; j < down; j++) {
    const cy = y + 3 + j * Math.floor((h - 6) / down) + Math.floor((h - 6) / down / 2) - 6;
    chair(L, x - 9, cy, 'right');
    chair(L, x + w - 2, cy, 'left');
  }
  table(L, x, y, w, h, centerpiece ? [(T) => plant(T, x + w / 2 - 6, y + h / 2 - 10, 'small')] : []);
}

export function coffeeTable(L, x, y, w, h) {
  table(L, x, y, w, h, [
    (T) => plant(T, x + w / 2 - 5, y + 2, 'small'),
    (T) => {
      T.rect(x + 4, y + h - 9, 6, 4, 'bb2');
      T.rect(x + w - 10, y + h - 9, 6, 3, 'm3');
    },
  ]);
}

export function rug(L, x, y, w, h, colors = ['r2', 'r1', 'y2'], pattern = 'diamond') {
  const [base, border, accent] = colors;
  L.rect(x, y, w, h, border);
  L.rect(x + 2, y + 2, w - 4, h - 4, base);
  L.rect(x + 3, y + 3, w - 6, 1, accent);
  L.rect(x + 3, y + h - 4, w - 6, 1, accent);
  L.rect(x + 3, y + 3, 1, h - 6, accent);
  L.rect(x + w - 4, y + 3, 1, h - 6, accent);
  if (pattern === 'diamond')
    for (let j = y + 8; j < y + h - 6; j += 8)
      for (let i = x + 8; i < x + w - 6; i += 10) {
        L.px(i, j - 1, accent);
        L.px(i - 1, j, accent);
        L.px(i + 1, j, accent);
        L.px(i, j + 1, accent);
      }
  // Fringe on the short ends.
  for (let i = x; i < x + w; i += 2) {
    L.px(i, y - 1, 'lw1');
    L.px(i, y + h, 'lw1');
  }
}

export function roundRug(L, cx, cy, r, colors = ['bb2', 'bb1', 'bb3']) {
  const [base, border, accent] = colors;
  L.ellipse(cx, cy, r, r * 0.9, border);
  L.ellipse(cx, cy, r - 2, r * 0.9 - 2, base);
  L.ellipse(cx, cy, r - 5, r * 0.9 - 5, accent);
  L.ellipse(cx, cy, r - 6, r * 0.9 - 6, base);
  for (let a = 0; a < 8; a++) L.px(cx + Math.cos((a * Math.PI) / 4) * (r - 9), cy + Math.sin((a * Math.PI) / 4) * (r - 9) * 0.9, accent);
}

export function bookshelf(L, x, y, w, h, seed = 1) {
  const r = rng(seed);
  const s = sprite(w + 2, h + 2);
  s.rect(1, 1, w, h, 'fw2');
  const shelves = Math.max(2, Math.floor((h - 2) / 9));
  const sh = Math.floor((h - 2) / shelves);
  const spines = ['r2', 'bb2', 'gb2', 'y1', 'pp2', 'r3', 'bb3', 'fw5', 'lw2'];
  for (let k = 0; k < shelves; k++) {
    const sy = 2 + k * sh;
    s.rect(2, sy, w - 2, sh - 2, 'fw1');
    for (let i = 3; i < w - 1; ) {
      const bw = 1 + Math.floor(r() * 2);
      const bh = sh - 3 - Math.floor(r() * 2);
      s.rect(i, sy + (sh - 2 - bh), bw, bh, spines[Math.floor(r() * spines.length)]);
      i += bw + (r() < 0.15 ? 2 : 0);
    }
    s.hl(1, sy + sh - 2, w, 'fw4');
  }
  done(L, s, x, y);
}

export function floorLamp(L, x, y) {
  const s = sprite(14, 26);
  s.rect(6, 10, 2, 13, 'm2');
  s.ellipse(7, 24, 4, 2, 'm1');
  s.ellipse(7, 6, 6, 5, 'y2');
  s.ellipse(7, 5, 4, 3.5, 'y3');
  s.ellipse(7, 4.5, 2, 2, 'y4');
  done(L, s, x, y);
}

export function tvStand(L, x, y, w, h) {
  const s = sprite(w + 2, h + 2);
  s.rect(1, 1, w, h, 'fw2');
  s.rect(2, 2, w - 2, h - 2, 'fw3');
  // TV seen from above along the wall: a dark screen slab.
  s.rect(Math.floor(w / 2) - 2, 3, 5, h - 4, 'm1');
  s.vl(Math.floor(w / 2) - 1, 4, h - 6, 'm2');
  s.px(Math.floor(w / 2), 5, 'bb3');
  done(L, s, x, y);
}

export function wallPicture(L, x, y, w = 18, h = 10) {
  L.box(x, y, w, h, 'fw4');
  L.rect(x + 2, y + 2, w - 4, h - 4, 'w3');
  L.rect(x + 2, y + h - 5, w - 4, 3, 'g4');
  L.px(x + w - 6, y + 3, 'y3');
}

export function plant(L, x, y, size = 'medium') {
  const big = size === 'big';
  const small = size === 'small';
  const w = big ? 20 : small ? 12 : 16;
  const h = big ? 26 : small ? 14 : 20;
  const s = sprite(w + 2, h + 2);
  const cx = (w + 2) / 2;
  const potW = big ? 10 : small ? 6 : 8;
  const potH = big ? 8 : small ? 5 : 6;
  s.rect(cx - potW / 2, h - potH, potW, potH, 'tc2');
  s.hl(cx - potW / 2 - 1, h - potH, potW + 2, 'tc3');
  s.vl(cx + potW / 2 - 1, h - potH + 1, potH - 1, 'tc1');
  const leaves = big ? 9 : small ? 5 : 7;
  for (let i = 0; i < leaves; i++) {
    const a = Math.PI + (i / (leaves - 1)) * Math.PI;
    const len = (big ? 10 : small ? 5 : 7) + (i % 2) * 2;
    for (let t = 0; t < len; t++) {
      const px = cx + Math.cos(a) * t * 0.9;
      const py = h - potH - 1 + Math.sin(a) * t + (t * t) / (len * 3);
      s.px(px, py, t > len * 0.6 ? 'g5' : 'g4');
      s.px(px + 1, py, 'g3');
    }
  }
  done(L, s, x, y);
}

// ---------- Kitchen and bathroom ----------

export function counter(L, x, y, w, h, fixtures = []) {
  const s = sprite(w + 2, h + 2);
  s.rect(1, 1, w, h, 'fw3');
  s.rect(1, 1, w, h - 5, 'kt2');
  s.hl(1, 1, w, 'kt3');
  s.hl(1, h - 5, w, 'K');
  for (let i = 8; i < w; i += 14) s.vl(1 + i, h - 4, 4, 'fw2');
  for (const f of fixtures) {
    const fx = f.at;
    if (f.type === 'sink') {
      s.rect(fx, 3, 16, h - 9, 'm2');
      s.rect(fx + 1, 4, 14, h - 11, 'm3');
      s.rect(fx + 7, 2, 2, 3, 'm1');
    } else if (f.type === 'stove') {
      s.rect(fx, 2, 18, h - 7, 'm1');
      for (const [bx, by] of [[4, 3], [12, 3], [4, 8], [12, 8]]) {
        s.ellipse(fx + bx + 1, by + 2, 2.5, 2, 'm2');
        s.px(fx + bx + 1, by + 2, 'r3');
      }
    } else if (f.type === 'jar') {
      s.rect(fx, 3, 6, 6, 'w4');
      s.rect(fx + 1, 6, 4, 3, 'y2');
      s.hl(fx, 2, 6, 'fw2');
    }
  }
  done(L, s, x, y);
}

export function fridge(L, x, y, w, h) {
  const s = sprite(w + 2, h + 2);
  s.rect(1, 1, w, h, 'lw1');
  s.rect(2, 2, w - 2, h - 2, 'lw2');
  s.hl(2, 2, w - 2, 'lw3');
  s.hl(1, Math.floor(h * 0.38), w, 'm2');
  s.rect(w - 4, 6, 2, 8, 'm2');
  s.rect(w - 4, Math.floor(h * 0.38) + 4, 2, 12, 'm2');
  done(L, s, x, y);
}

export function toilet(L, x, y) {
  const s = sprite(14, 18);
  s.rect(2, 1, 10, 6, 'lw2');
  s.hl(2, 1, 10, 'lw3');
  s.ellipse(7, 11, 5, 5.5, 'lw2');
  s.ellipse(7, 11.5, 3, 3.5, 'w4');
  done(L, s, x, y);
}

export function sink(L, x, y) {
  const s = sprite(16, 14);
  s.rect(1, 1, 14, 12, 'lw2');
  s.ellipse(8, 8, 5, 4, 'm3');
  s.ellipse(8, 8, 3.5, 2.5, 'w4');
  s.rect(7, 2, 2, 3, 'm2');
  done(L, s, x, y);
}

export function bathtub(L, x, y, w, h) {
  const s = sprite(w + 2, h + 2);
  s.rect(1, 1, w, h, 'lw2');
  s.hl(1, 1, w, 'lw3');
  s.rect(4, 4, w - 6, h - 6, 'w4');
  s.rect(5, 5, w - 8, h - 8, 'w3');
  s.rect(Math.floor(w / 2) - 1, 2, 2, 2, 'm2');
  done(L, s, x, y);
}

export function bathMat(L, x, y, w, h) {
  L.rect(x, y, w, h, 'bb1');
  L.rect(x + 1, y + 1, w - 2, h - 2, 'bb3');
}

// ---------- Study ----------

export function desk(L, x, y, w, h, items = ['book', 'lamp', 'laptop']) {
  table(L, x, y, w, h);
  for (const it of items) {
    if (it === 'book') {
      L.rect(x + w / 2 - 6, y + 4, 12, 8, 'lw3');
      L.vl(x + w / 2, y + 4, 8, 'lw1');
      for (let j = y + 6; j < y + 11; j += 2) {
        L.hl(x + w / 2 - 5, j, 4, 'lw1');
        L.hl(x + w / 2 + 2, j, 4, 'lw1');
      }
    } else if (it === 'lamp') {
      L.rect(x + w - 9, y + 3, 6, 5, 'm1');
      L.ellipse(x + w - 6, y + 3, 3, 2, 'y3');
    } else if (it === 'laptop') {
      L.box(x + 3, y + 3, 12, 9, 'm2');
      L.rect(x + 5, y + 4, 8, 4, 'bb3');
    }
  }
}

// ---------- Garage ----------

/** A red sedan seen from above, nose pointing down. */
export function car(L, x, y, w, h) {
  const s = sprite(w + 4, h + 2);
  const o = 2;
  // Body.
  s.rect(o + 2, o, w - 4, h, 'r2');
  s.rect(o, o + 4, w, h - 8, 'r2');
  s.vl(o + 1, o + 4, h - 8, 'r3');
  s.vl(o + w - 2, o + 4, h - 8, 'r1');
  // Wheels peeking out.
  for (const wy of [o + 12, o + h - 22]) {
    s.rect(o - 1, wy, 2, 10, 'K');
    s.rect(o + w - 1, wy, 2, 10, 'K');
  }
  // Windows and roof.
  const roofTop = Math.floor(h * 0.3);
  const roofBot = Math.floor(h * 0.68);
  s.rect(o + 4, roofTop - 12, w - 8, 12, 'm1');
  s.hl(o + 6, roofTop - 11, w - 12, 'bb3');
  s.rect(o + 4, roofTop, w - 8, roofBot - roofTop, 'r3');
  s.hl(o + 5, roofTop + 1, w - 10, 'r4');
  s.rect(o + 4, roofBot, w - 8, 10, 'm1');
  s.hl(o + 6, roofBot + 2, w - 12, 'bb2');
  // Mirrors, lights, grille.
  s.rect(o - 2, roofTop - 8, 2, 3, 'r1');
  s.rect(o + w, roofTop - 8, 2, 3, 'r1');
  s.rect(o + 3, o + h - 3, 5, 2, 'y3');
  s.rect(o + w - 8, o + h - 3, 5, 2, 'y3');
  s.rect(o + 3, o + 1, 4, 2, 'r4');
  s.rect(o + w - 7, o + 1, 4, 2, 'r4');
  s.hl(o + 10, o + h - 2, w - 20, 'm2');
  done(L, s, x - 1, y);
}

export function shelfUnit(L, x, y, w, h, seed = 3) {
  const r = rng(seed);
  const s = sprite(w + 2, h + 2);
  s.rect(1, 1, w, h, 'm1');
  const colors = ['fw4', 'tc3', 'r2', 'bb2', 'y1', 'm3'];
  const vertical = h > w;
  if (vertical) {
    for (let j = 3; j < h - 2; j += 8) {
      s.hl(1, j + 6, w, 'm2');
      s.rect(2, j, w - 3, 5, colors[Math.floor(r() * colors.length)]);
      s.hl(2, j, w - 3, 'kt3');
    }
  } else {
    for (let i = 3; i < w - 2; i += 8) {
      s.rect(i, 2, 6, h - 3, colors[Math.floor(r() * colors.length)]);
      s.vl(i, 2, h - 3, 'kt3');
    }
  }
  done(L, s, x, y);
}

export function workbench(L, x, y, w, h) {
  table(L, x, y, w, h, [
    (T) => {
      T.rect(x + 3, y + 3, 8, 4, 'r2');
      T.hl(x + 3, y + 3, 8, 'r3');
      T.rect(x + w - 10, y + 4, 6, 2, 'm3');
    },
  ]);
}

export function crate(L, x, y, w = 14, h = 14) {
  const s = sprite(w + 2, h + 2);
  s.rect(1, 1, w, h, 'fw4');
  s.rect(3, 3, w - 4, h - 4, 'fw3');
  for (let i = 0; i < w - 4; i++) s.px(3 + i, 3 + Math.floor((i * (h - 4)) / (w - 4)), 'fw5');
  s.hl(1, 1, w, 'fw5');
  done(L, s, x, y);
}

// ---------- Pool ----------

export function pool(L, x, y, w, h) {
  L.rect(x - 4, y - 4, w + 8, h + 8, 'pd3');
  L.rect(x - 4, y - 4, w + 8, 1, 'pd2');
  L.rect(x - 1, y - 1, w + 2, h + 2, 'K');
  L.rect(x, y, w, h, 'w2');
  L.rect(x, y, w, 4, 'w1');
  L.rect(x, y, 3, h, 'w1');
  for (let j = y + 8; j < y + h; j += 9)
    for (let i = x + 6; i < x + w - 4; i += 14) {
      L.hl(i, j, 5, 'w3');
      L.px(i + 5, j - 1, 'w3');
      L.px(i - 1, j + 1, 'w3');
    }
  L.hl(x + 4, y + 5, w - 8, 'w3');
}

export function flamingoFloat(L, x, y) {
  const s = sprite(18, 20);
  s.ellipse(10, 13, 7, 5, 'pk2');
  s.ellipse(10, 13, 3.5, 2.5, 'w2');
  s.rect(3, 3, 3, 9, 'pk2');
  s.ellipse(5, 3, 3, 2.5, 'pk2');
  s.rect(1, 3, 2, 2, 'K');
  s.px(5, 2, 'K');
  s.hl(9, 10, 5, 'pk3');
  done(L, s, x, y);
}

export function ringFloat(L, x, y) {
  const s = sprite(18, 16);
  s.ellipse(9, 8, 8, 7, 'y2');
  s.ellipse(9, 8, 4, 3.5, 'w2');
  s.ellipse(7, 5, 2, 1.5, 'y3');
  done(L, s, x, y);
}

export function umbrella(L, cx, cy, r) {
  const s = sprite(r * 2 + 4, r * 2 + 4);
  const c = r + 2;
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      if (dx * dx + dy * dy > r * r) continue;
      const seg = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 8);
      s.px(x, y, seg % 2 ? 'bb2' : 'lw2');
    }
  s.ellipse(c, c, 2, 2, 'm2');
  done(L, s, cx - c, cy - c);
}

export function lounger(L, x, y, w = 14, h = 26) {
  const s = sprite(w + 2, h + 2);
  s.rect(1, 1, w, h, 'fw3');
  s.rect(3, 3, w - 4, h - 8, 'lw2');
  s.rect(3, 3, w - 4, 7, 'lw3');
  s.hl(3, h - 7, w - 4, 'bb2');
  s.rect(3, h - 6, w - 4, 3, 'bb2');
  done(L, s, x, y);
}

export function cafeSet(L, x, y) {
  const t = sprite(16, 16);
  t.ellipse(8, 8, 7, 6, 'm2');
  t.ellipse(8, 7, 5, 4, 'm3');
  done(L, t, x, y);
  const c = sprite(12, 12);
  c.rect(1, 1, 10, 10, 'm3');
  c.rect(2, 2, 8, 6, 'lw2');
  done(L, c, x + 16, y - 4);
}

// ---------- Garden ----------

/** A tree: trunk on the object layer, canopy on the overhead layer. */
export function tree(objects, overhead, cx, baseY, r = 14, seed = 1) {
  const rand = rng(seed);
  const trunk = sprite(10, 12);
  trunk.rect(3, 0, 4, 10, 'fw2');
  trunk.vl(4, 0, 9, 'fw3');
  trunk.rect(1, 9, 8, 2, 'fw2');
  done(objects, trunk, cx - 5, baseY - 11);
  objects.ellipse(cx, baseY, r * 0.7, 3, 'g2');

  const s = sprite(r * 2 + 6, r * 2 + 4);
  const c = r + 3;
  const blobs = [[0, 0, r]];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand();
    blobs.push([Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.45, r * (0.45 + rand() * 0.15)]);
  }
  for (const [bx, by, br] of blobs) s.ellipse(c + bx, c + by, br, br * 0.9, 'g2');
  for (const [bx, by, br] of blobs) s.ellipse(c + bx - 1, c + by - 2, br * 0.75, br * 0.65, 'g3');
  for (const [bx, by, br] of blobs) s.ellipse(c + bx - 2, c + by - 3, br * 0.4, br * 0.35, 'g4');
  for (let i = 0; i < r; i++) s.px(c - r * 0.5 + rand() * r, c - r * 0.6 + rand() * r * 0.6, 'g5');
  s.outline('g1');
  overhead.stamp(s, cx - c, baseY - 10 - c * 2 + 4);
}

export function bush(L, cx, cy, r = 7, flowers = null, seed = 2) {
  const rand = rng(seed);
  const s = sprite(r * 2 + 4, r * 2 + 2);
  const c = r + 2;
  s.ellipse(c, c, r, r * 0.85, 'g2');
  s.ellipse(c - 1, c - 1.5, r * 0.75, r * 0.6, 'g3');
  s.ellipse(c - 2, c - 2.5, r * 0.4, r * 0.3, 'g4');
  if (flowers)
    for (let i = 0; i < r; i++) {
      const fx = c - r * 0.6 + rand() * r * 1.2;
      const fy = c - r * 0.5 + rand() * r;
      s.px(fx, fy, flowers[0]);
      s.px(fx + 1, fy, flowers[1]);
    }
  s.outline('g1');
  L.stamp(s, cx - c, cy - c);
}

export function flowerPatch(L, x, y, colors = ['pk2', 'y2', 'r3', 'white'], n = 6, seed = 4) {
  const rand = rng(seed);
  for (let i = 0; i < n; i++) {
    const fx = x + Math.floor(rand() * 14);
    const fy = y + Math.floor(rand() * 10);
    const col = colors[Math.floor(rand() * colors.length)];
    L.px(fx, fy + 1, 'g2');
    L.px(fx, fy - 1, col);
    L.px(fx - 1, fy, col);
    L.px(fx + 1, fy, col);
    L.px(fx, fy, 'y3');
  }
}

export function lampPost(L, x, y) {
  const s = sprite(10, 26);
  s.rect(4, 8, 2, 15, 'm1');
  s.rect(2, 22, 6, 3, 'm1');
  s.rect(1, 1, 8, 8, 'm1');
  s.rect(2, 2, 6, 6, 'y2');
  s.rect(3, 3, 4, 4, 'y3');
  s.rect(4, 4, 2, 2, 'y4');
  done(L, s, x, y);
}

export function wallLantern(L, x, y) {
  const s = sprite(8, 12);
  s.rect(1, 1, 6, 2, 'm1');
  s.rect(1, 3, 6, 6, 'y2');
  s.rect(2, 4, 4, 4, 'y3');
  s.rect(1, 9, 6, 2, 'm1');
  done(L, s, x, y);
}

export function bench(L, x, y, w = 30) {
  const s = sprite(w + 2, 14);
  s.rect(1, 1, w, 4, 'fw3');
  s.hl(1, 1, w, 'fw4');
  s.rect(1, 6, w, 5, 'fw3');
  s.hl(1, 6, w, 'fw5');
  s.rect(3, 11, 2, 2, 'K');
  s.rect(w - 3, 11, 2, 2, 'K');
  done(L, s, x, y);
}

export function mailbox(L, x, y) {
  const s = sprite(10, 20);
  s.rect(4, 9, 2, 10, 'fe1');
  s.rect(1, 1, 8, 9, 'r2');
  s.hl(1, 1, 8, 'r3');
  s.rect(2, 5, 6, 1, 'r1');
  s.rect(8, 2, 1, 4, 'y2');
  done(L, s, x, y);
}

export function doghouse(L, x, y) {
  const s = sprite(34, 34);
  // Roof (red shingles) and walls.
  for (let j = 0; j < 14; j++) s.hl(16 - j - 1, 1 + j, 2 + j * 2, j % 3 === 2 ? 'r1' : 'r2');
  s.rect(2, 15, 30, 2, 'r1');
  s.rect(4, 17, 26, 15, 'lw2');
  s.hl(4, 17, 26, 'lw1');
  for (let j = 21; j < 32; j += 4) s.hl(4, j, 26, 'lw1');
  s.rect(12, 21, 10, 11, 'K');
  s.rect(13, 22, 8, 10, 'm1');
  done(L, s, x, y);
}

export function shed(L, x, y, w, h) {
  const s = sprite(w + 2, h + 2);
  const roofH = Math.floor(h * 0.6);
  s.rect(1, 1, w, roofH, 'sl2');
  for (let j = 3; j < roofH; j += 5)
    for (let i = 1 + ((j / 5) % 2 ? 4 : 0); i < w; i += 8) s.rect(i, j, 7, 4, 'sl3');
  s.hl(1, 1, w, 'sl3');
  s.rect(1, roofH, w, 2, 'sl1');
  s.rect(1, roofH + 2, w, h - roofH - 2, 'fw3');
  for (let i = 4; i < w; i += 5) s.vl(1 + i, roofH + 2, h - roofH - 2, 'fw2');
  const dw = 12;
  const dx = Math.floor(w / 2) - dw / 2;
  s.rect(dx, roofH + 4, dw, h - roofH - 4, 'fw2');
  s.rect(dx + 1, roofH + 5, dw - 2, h - roofH - 5, 'fw4');
  s.px(dx + dw - 3, roofH + 12, 'y2');
  s.box(w - 12, roofH + 6, 9, 7, 'w4');
  done(L, s, x, y);
}

export function vegBed(L, x, y, w, h) {
  L.rect(x - 2, y - 2, w + 4, h + 4, 'fe2');
  L.rect(x - 1, y - 1, w + 2, h + 2, 'K');
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) L.px(x + i, y + j, (j % 14) < 2 ? 'so1' : 'so2');
  for (let j = y + 5; j < y + h - 4; j += 14)
    for (let i = x + 5; i < x + w - 4; i += 12) {
      const s = sprite(10, 10);
      s.ellipse(5, 5, 4, 3.5, 'g3');
      s.ellipse(4, 4, 2, 1.5, 'g5');
      s.px(5, 6, (i + j) % 3 ? 'r3' : 'y2');
      s.outline('g1');
      L.stamp(s, i - 3, j - 4);
    }
}

export function planterBox(L, x, y, w, h = 12) {
  L.box(x, y + 4, w, h - 4, 'fe2');
  L.hl(x + 1, y + 5, w - 2, 'fe3');
  for (let i = x + 3; i < x + w - 3; i += 7) bush(L, i + 3, y + 3, 4, ['pk2', 'y2'], i);
}

export function firewood(L, x, y) {
  const s = sprite(18, 16);
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3 - (j % 2); i++) {
      const lx = 2 + i * 5 + (j % 2) * 2;
      const ly = 10 - j * 4;
      s.ellipse(lx + 2, ly + 2, 2.5, 2.5, 'fw3');
      s.px(lx + 2, ly + 2, 'fw5');
    }
  done(L, s, x, y);
}

export function swingFrame(L, x, y, w) {
  L.rect(x, y + 2, w, 4, 'fe2');
  L.hl(x, y + 2, w, 'fe3');
  L.rect(x + 2, y + 6, 3, 18, 'fe1');
  L.rect(x + w - 5, y + 6, 3, 18, 'fe1');
  L.vl(x + Math.floor(w / 2), y + 6, 14, 'm2');
  L.rect(x + Math.floor(w / 2) - 2, y + 20, 5, 3, 'bb2');
}

export function pergola(objects, overhead, x, y, w, h) {
  for (const [px, py] of [[x, y], [x + w - 4, y], [x, y + h - 4], [x + w - 4, y + h - 4]]) objects.box(px, py, 5, 5, 'fe2');
  overhead.rect(x - 2, y + 1, w + 4, 3, 'fe2');
  overhead.rect(x - 2, y + h - 4, w + 4, 3, 'fe2');
  for (let i = x + 4; i < x + w - 2; i += 8) overhead.rect(i, y, 2, h, 'fe3');
}
