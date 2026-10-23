// Collision, built from the map data rather than the artwork. Cells are half a tile
// (8 art px, 16 px on screen) so furniture blocks roughly where it is drawn.

import { BUSH_SCALE } from './mapBuilder.mjs';
import * as M from './mapData.mjs';

export const CELL = 8; // art pixels per collision cell
const PER_TILE = 16 / CELL;
export const CW = M.WIDTH * PER_TILE;
export const CH = M.HEIGHT * PER_TILE;

export function buildCollision(plan) {
  const grid = new Uint8Array(CW * CH);
  const solidTile = (tx, ty) => {
    for (let j = 0; j < PER_TILE; j++) for (let i = 0; i < PER_TILE; i++) grid[(ty * PER_TILE + j) * CW + tx * PER_TILE + i] = 1;
  };
  /** Marks cells whose centers fall inside a box given in tiles. */
  const solidBox = (x, y, w, h) => {
    const x0 = Math.floor(x * PER_TILE);
    const y0 = Math.floor(y * PER_TILE);
    const x1 = Math.ceil((x + w) * PER_TILE);
    const y1 = Math.ceil((y + h) * PER_TILE);
    for (let cy = Math.max(0, y0); cy < Math.min(CH, y1); cy++)
      for (let cx = Math.max(0, x0); cx < Math.min(CW, x1); cx++) {
        const mx = (cx + 0.5) / PER_TILE;
        const my = (cy + 0.5) / PER_TILE;
        if (mx > x && mx < x + w && my > y && my < y + h) grid[cy * CW + cx] = 1;
      }
  };

  // Walls (doors are carved out of the plan already).
  for (let y = 0; y < M.HEIGHT; y++) for (let x = 0; x < M.WIDTH; x++) if (plan[y][x].kind === 'wall') solidTile(x, y);

  // Fences: everything beyond the top/side fences, and the front wall except its gates.
  const { top, bottom, left, right, gates } = M.FENCE;
  for (let y = 0; y < M.HEIGHT; y++)
    for (let x = 0; x < M.WIDTH; x++) {
      const outside = y <= top || ((x <= left || x >= right) && y <= bottom);
      if (outside) solidTile(x, y);
    }
  for (let x = 0; x < M.WIDTH; x++) {
    const inGate = gates.some((g) => x >= g.rect[0] && x <= g.rect[2]);
    if (!inGate) solidTile(x, bottom);
  }

  // Furniture and props. Footprints are trimmed a little so you can walk right up to them.
  for (const o of M.OBJECTS) {
    if (o.solid === false) continue;
    if (o.hit) {
      solidBox(...o.hit);
      continue;
    }
    const w = o.w ?? (o.type === 'plant' ? (o.size === 'big' ? 1.2 : 0.9) : 1);
    const h = o.h ?? (o.type === 'plant' ? (o.size === 'big' ? 1.5 : 1.1) : 1);
    if (o.type === 'plant' || o.type === 'nightstand' || o.type === 'crate' || o.type === 'toilet' || o.type === 'sink' || o.type === 'floorLamp' || o.type === 'chair') {
      // Small things: block their lower half, like a sprite's feet.
      solidBox(o.x + 0.1, o.y + h * 0.45, Math.max(0.8, w - 0.2), h * 0.55);
    } else if (o.type === 'dining') {
      solidBox(o.x - 0.3, o.y - 0.2, o.w + 0.6, o.h + 0.5);
    } else {
      solidBox(o.x + 0.05, o.y + 0.1, w - 0.1, h - 0.1);
    }
  }
  for (const [x, y] of M.TREES) solidBox(x - 0.45, y - 0.7, 0.9, 0.75);
  for (const [x, y, r] of M.BUSHES) {
    const rt = ((r * BUSH_SCALE) / 16) * 0.7;
    solidBox(x - rt, y - rt * 0.8, rt * 2, rt * 1.6);
  }
  for (const [kind, x, y] of M.LAMPS) if (kind === 'post') solidBox(x + 0.1, y + 1.1, 0.5, 0.45);

  return grid;
}
