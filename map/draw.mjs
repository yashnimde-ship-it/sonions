// Pixel-art drawing primitives shared by every painter. Coordinates are art pixels
// (16 per tile); the game renders them at 2x, so a tile is 32x32 on screen.

export const TILE = 16;

// Dusk palette, picked to match the reference's warm interiors and cool evening garden.
export const C = {
  K: '#16121c', // outline
  void: '#0e1014',
  wall: '#1b1d2b', wallHi: '#2c3045', wallLo: '#11121b',
  face1: '#3b2618', face2: '#52341f', faceTrim: '#6b4529',
  wd1: '#5a3420', wd2: '#744526', wd3: '#8c5530', wd4: '#a4683a', wd5: '#ba7e4c',
  fw1: '#3a2214', fw2: '#5c3820', fw3: '#7a4c2a', fw4: '#9a6236', fw5: '#b97c46',
  kt1: '#b8ae9a', kt2: '#d8d0bf', kt3: '#ebe5d8',
  bt1: '#3f5f8e', bt2: '#5a7cb0', bt3: '#86a6d4',
  wt1: '#a9aeb8', wt2: '#c8ccd4', wt3: '#e0e3e8',
  sb1: '#9c8a6e', sb2: '#b9a689', sb3: '#cfbd9f',
  cc1: '#34363d', cc2: '#41444c', cc3: '#4f525b',
  g1: '#24481f', g2: '#2f5e2a', g3: '#3f7a33', g4: '#509a3d', g5: '#72bc50', g6: '#98d868',
  dg1: '#121e14', dg2: '#18281a',
  ps1: '#6c6c72', ps2: '#8a8a90', ps3: '#a8a8ae',
  pd1: '#968670', pd2: '#b4a48a', pd3: '#cbbca2',
  w1: '#1f6aa8', w2: '#2f88cc', w3: '#55aee6', w4: '#a8def8',
  r1: '#5e1616', r2: '#922424', r3: '#c03a32', r4: '#e06a50',
  gb1: '#244a30', gb2: '#356a42', gb3: '#4f8a58',
  bb1: '#1e3668', bb2: '#30509a', bb3: '#5a7cc8',
  pp1: '#3e2460', pp2: '#6a4096', pp3: '#9a6cc4',
  lw1: '#b8b8c4', lw2: '#dcdce6', lw3: '#f4f4f8',
  y1: '#b8801e', y2: '#e8b440', y3: '#ffe39a', y4: '#fff6d0',
  m1: '#33353d', m2: '#5e6068', m3: '#9a9ca4', m4: '#cdcfd6',
  pk1: '#b8406e', pk2: '#e87aa6', pk3: '#f8b8d0',
  tc1: '#6e3220', tc2: '#9a4e2a', tc3: '#c26c3a',
  sl1: '#1e2232', sl2: '#2c3248', sl3: '#3e4664',
  rd1: '#24242a', rd2: '#2e2e36', lane: '#b8922a', dash: '#b8b8bc',
  sw1: '#5a5a62', sw2: '#6e6e76', sw3: '#82828a',
  fe1: '#3e2216', fe2: '#6a3c22', fe3: '#8a5030',
  pi1: '#5e5e64', pi2: '#84848a', pi3: '#a8a8ae',
  so1: '#3e2616', so2: '#5a3a22', so3: '#74502e',
  white: '#f2f2f6', black: '#0a0a0e',
};

export const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const cache = new Map();
const toRgb = (c) => {
  if (!cache.has(c)) cache.set(c, rgb(C[c] ?? c));
  return cache.get(c);
};

/** An RGBA pixel buffer with the drawing operations the painters use. */
export class Layer {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }

  px(x, y, c) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = toRgb(c);
    const i = (y * this.w + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = 255;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const i = (y * this.w + x) * 4;
    return this.data[i + 3] ? this.data.subarray(i, i + 4) : null;
  }

  clear(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data.fill(0, (y * this.w + x) * 4, (y * this.w + x) * 4 + 4);
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }

  hl(x, y, w, c) {
    this.rect(x, y, w, 1, c);
  }

  vl(x, y, h, c) {
    this.rect(x, y, 1, h, c);
  }

  /** Filled rectangle with a 1px outline. */
  box(x, y, w, h, fill, line = 'K') {
    this.rect(x, y, w, h, line);
    this.rect(x + 1, y + 1, w - 2, h - 2, fill);
  }

  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
  }

  /** Rows of characters mapped to colors; '.' and unmapped characters are transparent. */
  art(x, y, rows, map, mirror = false) {
    const w = Math.max(...rows.map((r) => r.length));
    rows.forEach((row, j) => {
      for (let i = 0; i < w; i++) {
        const ch = row[mirror ? w - 1 - i : i];
        if (ch && map[ch]) this.px(x + i, y + j, map[ch]);
      }
    });
  }

  /** 1px outline around everything drawn (for standalone sprites). */
  outline(c = 'K') {
    const edge = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (!this.get(x, y) && (this.get(x + 1, y) || this.get(x - 1, y) || this.get(x, y + 1) || this.get(x, y - 1))) edge.push([x, y]);
    for (const [x, y] of edge) this.px(x, y, c);
    return this;
  }

  /** Copies another layer's opaque pixels onto this one at (x, y). */
  stamp(src, x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    for (let j = 0; j < src.h; j++)
      for (let i = 0; i < src.w; i++) {
        const p = src.get(i, j);
        const tx = x + i;
        const ty = y + j;
        if (!p || tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        this.data.set(p, (ty * this.w + tx) * 4);
      }
  }
}

/** A small standalone sprite: draw into it, outline it, stamp it onto a map layer. */
export const sprite = (w, h) => new Layer(w, h);

/** Deterministic pseudo-random numbers so the art is identical on every build. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s >>> 8) / 0x1000000;
  };
}
