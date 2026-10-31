// Builds the safehouse lobby from the lobby reference (map/lobbyLayout.mjs), the same way
// the estate is built from its reference:
//   public/assets/lobby/lobby.png        the room as shown: floor layer + every prop placed back
//   public/assets/lobby/floor.png        the floor/wall layer alone (props removed, filled in)
//   public/assets/lobby/props/<id>.png   each prop as its own transparent sprite
//   public/assets/lobby/props.json       where each prop sits, and whether it's solid
//   public/assets/lobby/lobby.json       size, collision grid, portals, wardrobe, table, car, lights, spawn
//   public/assets/ui/mascot.png          the masked-burglar mascot for the title badge
//
// Steps: scale the reference to the estate's art scale (16 px per tile) and reduce it to
// a fixed palette; repair the areas where the reference has UI painted in; print the
// real estate map on the planning table; cut each prop out (its floor removed by a
// flood fill from the box edge); fill the floor under the props; collision from the
// walls and solid props. Portals, lamplight and prompts are drawn live by the game.
//
// Usage: npm run lobby

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, encode } from 'fast-png';
import * as L from '../map/lobbyLayout.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'public', 'assets', 'lobby');
const TILE = 16;
const W = L.WIDTH * TILE;
const H = L.HEIGHT * TILE;
const px = (t) => Math.round(t * TILE);
const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;

const readPng = (file) => {
  const p = decode(fs.readFileSync(file));
  const rgb = new Uint8Array(p.width * p.height * 3);
  for (let i = 0; i < p.width * p.height; i++) rgb.set(p.data.subarray(i * p.channels, i * p.channels + 3), i * 3);
  return { w: p.width, h: p.height, rgb };
};
const writeRgba = (rel, w, h, data) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encode({ width: w, height: h, data, channels: 4, depth: 8 }));
};

/** Area-average resample (each output pixel is the mean of the source pixels it covers). */
function resample(src, w, h) {
  const out = new Uint8Array(w * h * 3);
  const sx = src.w / w;
  const sy = src.h / h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [x0, x1, y0, y1] = [x * sx, (x + 1) * sx, y * sy, (y + 1) * sy];
      const acc = [0, 0, 0];
      let n = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++)
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const a = (Math.min(xx + 1, x1) - Math.max(xx, x0)) * (Math.min(yy + 1, y1) - Math.max(yy, y0));
          const i = (yy * src.w + xx) * 3;
          acc[0] += src.rgb[i] * a;
          acc[1] += src.rgb[i + 1] * a;
          acc[2] += src.rgb[i + 2] * a;
          n += a;
        }
      out.set(acc.map((v) => Math.round(v / n)), (y * w + x) * 3);
    }
  return { w, h, rgb: out };
}

/** Median-cut palette: `count` colors, every pixel snapped to the nearest. Crisp, pixel-art look. */
function quantize(img, count) {
  const n = img.w * img.h;
  let boxes = [Uint32Array.from({ length: n }, (_, i) => i)];
  while (boxes.length < count) {
    // Split the box with the widest channel range.
    let best = -1;
    let bestRange = -1;
    let bestCh = 0;
    boxes.forEach((b, k) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (let j = 0; j < b.length; j += 7) {
          const v = img.rgb[b[j] * 3 + c];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        if (hi - lo > bestRange) [best, bestRange, bestCh] = [k, hi - lo, c];
      }
    });
    if (best < 0) break;
    const b = Array.from(boxes[best]).sort((p, q) => img.rgb[p * 3 + bestCh] - img.rgb[q * 3 + bestCh]);
    const mid = b.length >> 1;
    boxes.splice(best, 1, Uint32Array.from(b.slice(0, mid)), Uint32Array.from(b.slice(mid)));
  }
  const palette = boxes.map((b) => {
    const s = [0, 0, 0];
    for (const i of b) for (let c = 0; c < 3; c++) s[c] += img.rgb[i * 3 + c];
    return s.map((v) => Math.round(v / b.length));
  });
  const cache = new Map();
  for (let i = 0; i < n; i++) {
    const key = (img.rgb[i * 3] << 16) | (img.rgb[i * 3 + 1] << 8) | img.rgb[i * 3 + 2];
    let c = cache.get(key);
    if (!c) {
      let bd = Infinity;
      for (const p of palette) {
        const d = (p[0] - img.rgb[i * 3]) ** 2 + (p[1] - img.rgb[i * 3 + 1]) ** 2 + (p[2] - img.rgb[i * 3 + 2]) ** 2;
        if (d < bd) [bd, c] = [d, p];
      }
      cache.set(key, c);
    }
    img.rgb.set(c, i * 3);
  }
  return palette;
}

/**
 * Fills a UI area: by tiling a clean patch (`tile`), or by repeating the strip on one
 * side of it (`from`). Both mirror at the seams so edges meet cleanly.
 */
function repair(img, { box, from, span = 1, tile, shade = 1 }) {
  const [x0, y0, x1, y1] = box.map(px);
  const s = Math.max(1, px(span));
  const mirror = (d, n = s) => {
    const k = d % (2 * n);
    return k < n ? k : 2 * n - 1 - k;
  };
  const [tx0, ty0, tx1, ty1] = tile ? tile.map(px) : [0, 0, 1, 1];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      let sx = x;
      let sy = y;
      if (tile) {
        sx = tx0 + mirror(x - x0, tx1 - tx0);
        sy = ty0 + mirror(y - y0, ty1 - ty0);
      }
      if (from === 'right') sx = x1 + mirror(x1 - 1 - x);
      if (from === 'left') sx = x0 - 1 - mirror(x - x0);
      if (from === 'down') sy = y1 + mirror(y1 - 1 - y);
      if (from === 'up') sy = y0 - 1 - mirror(y - y0);
      sx = Math.min(img.w - 1, Math.max(0, sx));
      sy = Math.min(img.h - 1, Math.max(0, sy));
      const si = (sy * img.w + sx) * 3;
      img.rgb.set([img.rgb[si] * shade, img.rgb[si + 1] * shade, img.rgb[si + 2] * shade].map(Math.round), (y * img.w + x) * 3);
    }
}

/** Prints the real estate map (its composited preview) on the planning table. */
function printEstateMap(img) {
  const [x0, y0, x1, y1] = L.TABLE_MAP.map(px);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const edge = x === x0 || y === y0 || x === x1 - 1 || y === y1 - 1;
      img.rgb.set(edge ? [120, 96, 64] : [226, 212, 176], (y * img.w + x) * 3);
    }
  const estate = readPng(path.join(ROOT, 'public/assets/map/preview.png'));
  const room = [x1 - x0 - 6, y1 - y0 - 6];
  const k = Math.min(room[0] / estate.w, room[1] / estate.h);
  const mw = Math.round(estate.w * k);
  const mh = Math.round(estate.h * k);
  const map = resample(estate, mw, mh);
  const ox = x0 + Math.round((x1 - x0 - mw) / 2);
  const oy = y0 + Math.round((y1 - y0 - mh) / 2);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) img.rgb.set(map.rgb.subarray((y * mw + x) * 3, (y * mw + x) * 3 + 3), ((oy + y) * img.w + ox + x) * 3);
}

/** The most common colors among some pixels (quantized to 5 bits per channel). */
function dominant(img, pixels, share = 0.8, max = 16) {
  const hist = new Map();
  for (const i of pixels) {
    const k = ((img.rgb[i * 3] >> 3) << 10) | ((img.rgb[i * 3 + 1] >> 3) << 5) | (img.rgb[i * 3 + 2] >> 3);
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  const out = [];
  let acc = 0;
  for (const [k, c] of [...hist].sort((a, b) => b[1] - a[1])) {
    out.push([((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4]);
    acc += c;
    if (acc >= pixels.length * share || out.length >= max) break;
  }
  return out;
}

/**
 * The prop's own pixels inside its box: flood-fill the surroundings (colors seen in a ring
 * just outside the box) in from the box edge, stopping at dark outlines; whatever the
 * flood can't reach is the prop. Enclosed gaps are filled back in.
 */
function propMask(img, box) {
  const [x0, y0, x1, y1] = box.map(px);
  const w = x1 - x0;
  const h = y1 - y0;
  const ring = [];
  for (let y = y0 - 3; y < y1 + 3; y++)
    for (let x = x0 - 3; x < x1 + 3; x++) {
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
      if (x >= 0 && y >= 0 && x < img.w && y < img.h) ring.push(y * img.w + x);
    }
  const around = dominant(img, ring);
  const passable = (i) => {
    const [r, g, b] = [img.rgb[i * 3], img.rgb[i * 3 + 1], img.rgb[i * 3 + 2]];
    if (lum(r, g, b) < 34) return false;
    return around.some((c) => (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2 < 26 * 26);
  };
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x && y && x < w - 1 && y < h - 1) continue;
      const i = (y0 + y) * img.w + x0 + x;
      if (passable(i)) {
        seen[y * w + x] = 1;
        stack.push(y * w + x);
      }
    }
  while (stack.length) {
    const k = stack.pop();
    const x = k % w;
    const y = (k - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx]) continue;
      if (!passable((y0 + ny) * img.w + x0 + nx)) continue;
      seen[ny * w + nx] = 1;
      stack.push(ny * w + nx);
    }
  }
  // Keep what the flood missed; then drop tiny specks (floor grain caught as "prop").
  const mask = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) mask[k] = seen[k] ? 0 : 1;
  const comp = new Int32Array(w * h).fill(-1);
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || comp[s] >= 0) continue;
    const list = [s];
    comp[s] = s;
    for (let j = 0; j < list.length; j++) {
      const k = list[j];
      const x = k % w;
      const y = (k - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (mask[n] && comp[n] < 0) {
          comp[n] = s;
          list.push(n);
        }
      }
    }
    if (list.length < 20) for (const k of list) mask[k] = 0;
  }
  return { x0, y0, w, h, mask };
}

/** Fills masked pixels from the nearest unmasked pixel along the same row (planks run sideways). */
function fillUnder(img, masked) {
  const out = img.rgb.slice();
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const i = y * img.w + x;
      if (!masked[i]) continue;
      for (let d = 16; d < img.w; d += 16) {
        const l = x - d;
        const r = x + d;
        const s = l >= 0 && !masked[y * img.w + l] ? y * img.w + l : r < img.w && !masked[y * img.w + r] ? y * img.w + r : -1;
        if (s >= 0) {
          out.set(img.rgb.subarray(s * 3, s * 3 + 3), i * 3);
          break;
        }
      }
    }
  return out;
}

// ---------- Build ----------

const t0 = Date.now();
const reference = readPng(path.join(ROOT, L.REFERENCE));

// The mascot, cut from the reference's title badge as a round sprite.
{
  const { cx, cy, r } = L.MASCOT;
  const size = r * 2;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if ((x - r + 0.5) ** 2 + (y - r + 0.5) ** 2 > r * r) continue;
      const i = ((cy - r + y) * reference.w + cx - r + x) * 3;
      data.set([reference.rgb[i], reference.rgb[i + 1], reference.rgb[i + 2], 255], (y * size + x) * 4);
    }
  const file = path.join(ROOT, 'public', 'assets', 'ui', 'mascot.png');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encode({ width: size, height: size, data, channels: 4, depth: 8 }));
}

const img = resample(reference, W, H);
const palette = quantize(img, 128);
for (const r of L.REPAIRS) repair(img, r);
printEstateMap(img);

fs.rmSync(path.join(OUT, 'props'), { recursive: true, force: true });
const masked = new Uint8Array(W * H);
const props = [];
for (const p of L.PROPS) {
  const m = propMask(img, p.box);
  const data = new Uint8Array(m.w * m.h * 4);
  let opaque = 0;
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (!m.mask[y * m.w + x]) continue;
      const i = (m.y0 + y) * W + m.x0 + x;
      data.set([img.rgb[i * 3], img.rgb[i * 3 + 1], img.rgb[i * 3 + 2], 255], (y * m.w + x) * 4);
      masked[i] = 1;
      opaque++;
    }
  writeRgba(`props/${p.id}.png`, m.w, m.h, data);
  props.push({ id: p.id, file: `props/${p.id}.png`, x: m.x0, y: m.y0, w: m.w, h: m.h, solid: p.solid, coverage: +(opaque / (m.w * m.h)).toFixed(2), ...(p.place === false ? { place: false } : {}) });
}

// Floor layer (props removed), then the room as shown: the floor with every prop placed back.
const floor = fillUnder(img, masked);
const toRgba = (rgb) => {
  const d = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) d.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 255], i * 4);
  return d;
};
writeRgba('floor.png', W, H, toRgba(floor));
const room = toRgba(floor);
for (const p of props) {
  // `place: false`: cut out (so the floor under it is filled in) but left out of the room.
  if (p.place === false) continue;
  const sprite = decode(fs.readFileSync(path.join(OUT, p.file)));
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const s = (y * p.w + x) * 4;
      if (sprite.data[s + 3]) room.set(sprite.data.subarray(s, s + 4), ((p.y + y) * W + p.x + x) * 4);
    }
}
// Decor: whole pieces of art painted over the room (blended by their alpha).
for (const d of L.DECOR) {
  const art = decode(fs.readFileSync(path.join(ROOT, d.file)));
  const ch = art.channels;
  for (let y = 0; y < art.height; y++)
    for (let x = 0; x < art.width; x++) {
      const s = (y * art.width + x) * ch;
      const a = ch === 4 ? art.data[s + 3] / 255 : 1;
      const tx = px(d.x) + x;
      const ty = px(d.y) + y;
      if (!a || tx >= W || ty >= H) continue;
      const i = (ty * W + tx) * 4;
      for (let k = 0; k < 3; k++) room[i + k] = Math.round(art.data[s + k] * a + room[i + k] * (1 - a));
      room[i + 3] = 255;
    }
}
writeRgba('lobby.png', W, H, room);

// ---------- Collision (8 px cells, like the estate's) ----------

const CELL = 8;
const CW = W / CELL;
const CH = H / CELL;
const grid = new Uint8Array(CW * CH);
/** Every cell the box overlaps by more than 2 px is set to `v` (solid, or open again). */
const cover = ([x0, y0, x1, y1], v = 1) => {
  const m = 2 / TILE;
  for (let cy = Math.max(0, Math.floor(((y0 + m) * TILE) / CELL)); cy < Math.min(CH, Math.ceil(((y1 - m) * TILE) / CELL)); cy++)
    for (let cx = Math.max(0, Math.floor(((x0 + m) * TILE) / CELL)); cx < Math.min(CW, Math.ceil(((x1 - m) * TILE) / CELL)); cx++) grid[cy * CW + cx] = v;
};
L.WALLS.forEach((b) => cover(b));
// The walkable part of the west wing, then its furniture.
for (const b of L.WEST_OPEN) cover(b, 0);
for (const b of L.WEST_SOLID) cover(b);
for (const p of L.PROPS) if (p.solid) cover(p.hit ?? p.box);

fs.writeFileSync(path.join(OUT, 'props.json'), JSON.stringify(props, null, 1));
fs.writeFileSync(
  path.join(OUT, 'lobby.json'),
  JSON.stringify({
    name: 'Safehouse',
    tileSize: TILE,
    width: L.WIDTH,
    height: L.HEIGHT,
    collision: { cell: CELL, width: CW, height: CH, data: Buffer.from(grid).toString('base64') },
    portals: L.PORTALS,
    wardrobe: L.WARDROBE,
    table: L.PLANNING_TABLE,
    car: L.GARAGE_DOOR,
    gadgets: L.GADGET_PADS,
    gadgetSign: L.GADGET_SIGN,
    lights: L.LIGHTS,
    spawn: L.SPAWN,
  }),
);
console.log(`lobby: ${W}x${H} px (${L.WIDTH}x${L.HEIGHT} tiles), ${palette.length}-color palette`);
console.log(`props: ${props.length} sprites; low coverage: ${props.filter((p) => p.coverage < 0.25).map((p) => `${p.id} ${p.coverage}`).join(', ') || 'none'}`);
console.log(`collision: ${grid.reduce((a, b) => a + b, 0)} solid cells; done in ${Date.now() - t0} ms`);
