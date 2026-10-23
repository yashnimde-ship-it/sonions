// Reads the house walls straight from the reference art, so collision matches what
// you see. Walls in the reference are thick dark-navy bands; furniture outlines are
// dark too but only a pixel or two wide, so a morphological opening (erode, then
// grow back) keeps the walls and drops the outlines.

import { TILE } from './draw.mjs';
import * as M from './mapData.mjs';

const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;

/** 1 where the reference shows wall. Only looks in and right around the house. */
export function artWallMask(ref, plan, opts = {}) {
  // opts.region(x, y): where walls may be (art px); defaults to in and around the estate's house.
  const W = ref.w;
  const H = ref.h;
  const maxLum = opts.wallLum ?? 46;
  const r = opts.wallMinHalfWidth ?? 2; // walls must be at least 2r+1 px thick
  const nearHouse = opts.region ?? ((x, y) => {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = plan[ty + dy]?.[tx + dx];
        if (c && c.kind !== 'out') return true;
      }
    return false;
  });
  const dark = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const R = ref.rgb[i * 3];
      const G = ref.rgb[i * 3 + 1];
      const B = ref.rgb[i * 3 + 2];
      if (lum(R, G, B) < maxLum && B + 6 >= R && nearHouse(x, y)) dark[i] = 1;
    }
  // Erode with a (2r+1)^2 square, then grow back by r.
  const eroded = new Uint8Array(W * H);
  for (let y = r; y < H - r; y++)
    for (let x = r; x < W - r; x++) {
      let all = true;
      for (let dy = -r; dy <= r && all; dy++) for (let dx = -r; dx <= r && all; dx++) if (!dark[(y + dy) * W + x + dx]) all = false;
      if (all) eroded[y * W + x] = 1;
    }
  const wall = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!eroded[y * W + x]) continue;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && dark[ny * W + nx]) wall[ny * W + nx] = 1;
        }
    }
  dropSmall(wall, W, H, opts.wallMinArea ?? 160);
  // Exterior windows are pale strips in the wall line: keep them solid.
  for (const [x0, y0, x1, y1] of opts.windows ?? M.WINDOWS)
    for (let y = y0 * TILE; y < (y1 + 1) * TILE; y++) for (let x = x0 * TILE; x < (x1 + 1) * TILE; x++) wall[y * W + x] = 1;
  for (const [x0, y0, x1, y1] of opts.extraWalls ?? [])
    for (let y = Math.round(y0 * TILE); y < Math.round(y1 * TILE); y++) for (let x = Math.round(x0 * TILE); x < Math.round(x1 * TILE); x++) wall[y * W + x] = 1;
  return wall;
}

/** Removes connected wall regions smaller than `min` pixels (dark furniture, car windows). */
function dropSmall(mask, w, h, min) {
  const seen = new Uint8Array(mask.length);
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const comp = [s];
    seen[s] = 1;
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k];
      const x = i % w;
      const y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
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
