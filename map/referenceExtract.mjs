// Extracts the furniture and props from the reference image itself, so the map's
// assets match it exactly. The reference is already at the game's art scale
// (16 px per tile, the same grid as mapData), so every extracted piece sits exactly
// where it belongs.
//
// Indoors: for each room, learn the floor colors, then flood-fill the floor away
// from the room's edges. The flood stops at the dark outlines around furniture, so
// even brown tables on brown floors survive. Whatever isn't floor is the furniture.
// Outdoors: the same against the lawn, seeded from open grass. Green leftovers
// (trees, bushes) go on the overhead layer so the bandit walks behind them.

import fs from 'node:fs';
import { decode } from 'fast-png';
import { Layer, TILE } from './draw.mjs';
import * as M from './mapData.mjs';

const dist2 = (a, r, g, b) => (a[0] - r) ** 2 + (a[1] - g) ** 2 + (a[2] - b) ** 2;
const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;

export function loadReference(file) {
  const png = decode(fs.readFileSync(file));
  if (png.width !== M.WIDTH * TILE || png.height !== M.HEIGHT * TILE) throw new Error(`reference must be ${M.WIDTH * TILE}x${M.HEIGHT * TILE}`);
  const ch = png.channels;
  const rgb = new Uint8Array(png.width * png.height * 3);
  for (let i = 0; i < png.width * png.height; i++) rgb.set(png.data.subarray(i * ch, i * ch + 3), i * 3);
  return { w: png.width, h: png.height, rgb };
}

/** The most common colors in a set of pixels (quantized), covering `share` of them. */
function dominantColors(ref, pixels, share = 0.7, maxColors = 24) {
  const hist = new Map();
  for (const i of pixels) {
    const r = ref.rgb[i * 3] >> 3;
    const g = ref.rgb[i * 3 + 1] >> 3;
    const b = ref.rgb[i * 3 + 2] >> 3;
    const k = (r << 10) | (g << 5) | b;
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  const out = [];
  let acc = 0;
  for (const [k, n] of sorted) {
    out.push([((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4]);
    acc += n;
    if (acc >= pixels.length * share || out.length >= maxColors) break;
  }
  return out;
}

/** Flood fill from seed pixels through `passable` pixels within `inRegion`. */
function flood(ref, seeds, inRegion, passable) {
  const seen = new Uint8Array(ref.w * ref.h);
  const stack = [];
  for (const s of seeds) if (inRegion(s) && passable(s)) {
    seen[s] = 1;
    stack.push(s);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % ref.w;
    const y = (i - x) / ref.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= ref.w || ny >= ref.h) continue;
      const n = ny * ref.w + nx;
      if (seen[n] || !inRegion(n) || !passable(n)) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  return seen;
}

/** Grows a 0/1 mask by r pixels (square), limited to the listed pixels. */
function dilate(src, w, h, pixels, r) {
  const out = new Uint8Array(src.length);
  for (const i of pixels) {
    if (src[i]) {
      out[i] = 1;
      continue;
    }
    const x = i % w;
    const y = (i - x) / w;
    search: for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && src[ny * w + nx]) {
          out[i] = 1;
          break search;
        }
      }
  }
  return out;
}

/** Drops connected mask regions smaller than `min` pixels (grain, grass blades). */
function dropSpecks(mask, w, h, min) {
  const seen = new Uint8Array(mask.length);
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const comp = [s];
    seen[s] = 1;
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k];
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (mask[n] && !seen[n]) {
            seen[n] = 1;
            comp.push(n);
          }
        }
    }
    if (comp.length < min) for (const i of comp) mask[i] = 0;
  }
}

/** Removes 1-px-wide lines (floorboard seams, grass strokes): a morphological opening. */
function openThin(mask, w, h) {
  const eroded = new Uint8Array(mask.length);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w] && mask[i - w - 1] && mask[i - w + 1] && mask[i + w - 1] && mask[i + w + 1]) eroded[i] = 1;
    }
  const all = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) all.push(i);
  const opened = dilate(eroded, w, h, all, 1);
  for (let i = 0; i < mask.length; i++) mask[i] = opened[i];
}

/** Fills regions of non-mask pixels fully enclosed by mask (the inside of a bed or rug). */
function fillHoles(mask, w, h, maxHole) {
  const seen = new Uint8Array(mask.length);
  for (let s = 0; s < mask.length; s++) {
    if (mask[s] || seen[s]) continue;
    const comp = [s];
    seen[s] = 1;
    let touchesEdge = false;
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k];
      const x = i % w;
      const y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (!mask[n] && !seen[n]) {
          seen[n] = 1;
          comp.push(n);
        }
      }
    }
    if (!touchesEdge && comp.length <= maxHole) for (const i of comp) mask[i] = 1;
  }
}

/**
 * Builds the object mask: 1 where the reference shows furniture or props rather than
 * floor or lawn. Returns { mask, green } where `green` marks foliage pixels outdoors.
 */
export function extractMask(ref, plan, opts = {}) {
  const tol = opts.floorTolerance ?? 30;
  const grassTol = opts.grassTolerance ?? 26;
  const W = ref.w;
  const mask = new Uint8Array(ref.w * ref.h);
  const green = new Uint8Array(ref.w * ref.h);
  const tileOf = (i) => {
    const x = i % W;
    const y = (i - x) / W;
    return plan[Math.floor(y / TILE)]?.[Math.floor(x / TILE)];
  };

  // ---- Indoors, room by room ----
  const rooms = new Map();
  for (let ty = 0; ty < M.HEIGHT; ty++)
    for (let tx = 0; tx < M.WIDTH; tx++) {
      const c = plan[ty][tx];
      if (c.kind !== 'floor') continue;
      if (!rooms.has(c.room)) rooms.set(c.room, []);
      rooms.get(c.room).push([tx, ty]);
    }
  for (const [room, tiles] of rooms) {
    const inRoom = new Uint8Array(ref.w * ref.h);
    const pixels = [];
    for (const [tx, ty] of tiles)
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const i = (ty * TILE + y) * W + tx * TILE + x;
          inRoom[i] = 1;
          pixels.push(i);
        }
    // The ring along the walls is mostly bare floor: learn the floor colors there.
    const ring = [];
    for (const i of pixels) {
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of [[5, 0], [-5, 0], [0, 5], [0, -5]])
        if (!inRoom[(y + dy) * W + x + dx]) {
          ring.push(i);
          break;
        }
    }
    const floorColors = dominantColors(ref, ring, opts.floorShare ?? 0.6, 14);
    const floorLike = (i) => {
      const r = ref.rgb[i * 3];
      const g = ref.rgb[i * 3 + 1];
      const b = ref.rgb[i * 3 + 2];
      return floorColors.some((c) => dist2(c, r, g, b) < tol * tol);
    };
    // Outlines (dark pixels), thickened by one pixel so small gaps don't leak.
    const dark = new Uint8Array(ref.w * ref.h);
    for (const i of pixels) {
      if (lum(ref.rgb[i * 3], ref.rgb[i * 3 + 1], ref.rgb[i * 3 + 2]) < (opts.outlineLum ?? 40)) dark[i] = 1;
    }
    const barrier = dilate(dark, W, ref.h, pixels, opts.barrierGrow ?? 1);
    // Plain floor along the walls seeds the flood; so does wide-open floor mid-room.
    const seeds = ring.filter((i) => floorLike(i) && !barrier[i]);
    for (let k = 0; k < pixels.length; k += 5) {
      const i = pixels[k];
      const x = i % W;
      const y = (i - x) / W;
      let open = true;
      for (let dy = -6; dy <= 6 && open; dy += 2) for (let dx = -6; dx <= 6 && open; dx += 2) {
        const n = (y + dy) * W + x + dx;
        if (!inRoom[n] || !floorLike(n) || dark[n]) open = false;
      }
      if (open) seeds.push(i);
    }
    const floorSeen = flood(ref, seeds, (i) => inRoom[i] === 1, (i) => floorLike(i) && !barrier[i]);
    // Grow the floor back over the barrier pixels that are just floor grain (they touch
    // floor and are floor colored or lone dark lines between floor).
    const floor = dilate(floorSeen, W, ref.h, pixels, opts.barrierGrow ?? 1);
    for (const i of pixels) if (!floor[i]) mask[i] = 1;
  }

  // ---- Outdoors, against the lawn ----
  const isOut = (i) => tileOf(i)?.kind === 'out';
  const lawn = [];
  for (const [x0, y0, x1, y1] of opts.lawnSamples ?? []) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) lawn.push(y * W + x);
  const grassColors = dominantColors(ref, lawn, 0.97, 40);
  const grassLike = (i) => {
    const r = ref.rgb[i * 3];
    const g = ref.rgb[i * 3 + 1];
    const b = ref.rgb[i * 3 + 2];
    return grassColors.some((c) => dist2(c, r, g, b) < grassTol * grassTol);
  };
  const lawnSeeds = (opts.lawnSeeds ?? []).map(([x, y]) => y * W + x);
  const grassSeen = flood(ref, [...lawn, ...lawnSeeds], isOut, grassLike);
  for (let i = 0; i < ref.w * ref.h; i++) {
    if (!isOut(i) || grassSeen[i]) continue;
    mask[i] = 1;
    const r = ref.rgb[i * 3];
    const g = ref.rgb[i * 3 + 1];
    const b = ref.rgb[i * 3 + 2];
    if (g > r + 8 && g > b + 4) green[i] = 1;
  }
  openThin(mask, W, ref.h);
  fillHoles(mask, W, ref.h, opts.maxHole ?? 900);
  dropSpecks(mask, W, ref.h, opts.minSpeck ?? 24);
  for (let i = 0; i < mask.length; i++) if (!mask[i]) green[i] = 0;
  return { mask, green };
}

/** Copies the masked reference pixels into a layer. */
export function maskedLayer(ref, mask) {
  const L = new Layer(ref.w, ref.h);
  for (let i = 0; i < ref.w * ref.h; i++) if (mask[i]) L.data.set([ref.rgb[i * 3], ref.rgb[i * 3 + 1], ref.rgb[i * 3 + 2], 255], i * 4);
  return L;
}
