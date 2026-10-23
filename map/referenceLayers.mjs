// Builds the four art layers from the reference image (see referenceExtract.mjs):
//   floor     the reference's floors, walls and ground, with the pixels under each
//             piece of furniture filled from the same floor pattern a tile or more away
//   walls     empty (walls are part of the floor art; collision comes from the plan)
//   objects   the furniture and props cut out of the reference
//   overhead  foliage outdoors (tree and bush canopies), drawn over the bandit
// floor + objects + overhead recreates the reference exactly.

import { Layer, TILE } from './draw.mjs';
import * as M from './mapData.mjs';
import { extractMask } from './referenceExtract.mjs';

/** Which kind of surface a tile is, so the infill only copies like from like. */
function regionGrid(plan) {
  const grid = [];
  for (let y = 0; y < M.HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < M.WIDTH; x++) {
      const c = plan[y][x];
      let r = c.kind === 'floor' ? `room:${c.room}` : c.kind;
      if (c.kind === 'out') {
        r = 'lawn';
        for (const [kind, x0, y0, x1, y1] of M.GROUND) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) r = kind;
      }
      row.push(r);
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Fills masked pixels by copying from an unmasked pixel a whole number of tiles away in
 * the same region, which continues tiled floor patterns seamlessly. Repeats with the
 * newly filled pixels as sources until everything is filled.
 */
function infill(ref, mask, regions) {
  const W = ref.w;
  const H = ref.h;
  const out = ref.rgb.slice();
  const known = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) known[i] = mask[i] ? 0 : 1;
  const regionAt = (x, y) => regions[Math.floor(y / TILE)][Math.floor(x / TILE)];
  const offsets = [];
  for (let r = 1; r <= 4; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) offsets.push([dx * TILE, dy * TILE]);
  let remaining = W * H - known.reduce((a, b) => a + b, 0);
  for (let pass = 0; remaining > 0 && pass < 20; pass++) {
    const filled = [];
    for (let i = 0; i < W * H; i++) {
      if (known[i]) continue;
      const x = i % W;
      const y = (i - x) / W;
      const region = regionAt(x, y);
      // Same region first; on the last passes accept anything nearby.
      for (const strict of pass < 12 ? [true] : [true, false]) {
        let src = -1;
        for (const [dx, dy] of offsets) {
          const sx = x + dx;
          const sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
          const s = sy * W + sx;
          if (!known[s] || (strict && regionAt(sx, sy) !== region)) continue;
          src = s;
          break;
        }
        if (src >= 0) {
          filled.push([i, src]);
          break;
        }
      }
    }
    for (const [i, s] of filled) {
      out[i * 3] = out[s * 3];
      out[i * 3 + 1] = out[s * 3 + 1];
      out[i * 3 + 2] = out[s * 3 + 2];
    }
    for (const [i] of filled) known[i] = 1;
    remaining -= filled.length;
  }
  return out;
}

export function referenceLayers(ref, plan, opts) {
  const { mask, green } = extractMask(ref, plan, opts);
  const W = ref.w;
  const H = ref.h;
  const regions = regionGrid(plan);
  const ground = infill(ref, mask, regions);

  const floor = new Layer(W, H);
  const walls = new Layer(W, H);
  const objects = new Layer(W, H);
  const overhead = new Layer(W, H);
  for (let i = 0; i < W * H; i++) {
    floor.data.set([ground[i * 3], ground[i * 3 + 1], ground[i * 3 + 2], 255], i * 4);
    if (!mask[i]) continue;
    const px = [ref.rgb[i * 3], ref.rgb[i * 3 + 1], ref.rgb[i * 3 + 2], 255];
    (green[i] ? overhead : objects).data.set(px, i * 4);
  }
  // Tree canopies go overhead so the bandit walks behind them. They are the reference's
  // own pixels, so the copy is invisible until he's underneath. The trunk base stays below.
  for (const [, trunkY, , cx, cy, r] of M.TREES) {
    const rr = r * TILE * 0.95;
    const yMax = Math.min((trunkY - 0.5) * TILE, cy * TILE + rr);
    for (let y = Math.floor(cy * TILE - rr); y < yMax; y++)
      for (let x = Math.floor(cx * TILE - rr); x <= cx * TILE + rr; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if ((x - cx * TILE) ** 2 + (y - cy * TILE) ** 2 > rr * rr) continue;
        const i = y * W + x;
        overhead.data.set([ref.rgb[i * 3], ref.rgb[i * 3 + 1], ref.rgb[i * 3 + 2], 255], i * 4);
      }
  }
  return { layers: { floor, walls, objects, overhead }, mask, green };
}

/**
 * Cuts each object listed in mapData out of the extracted layers as its own sprite:
 * the object's rect (padded half a tile) with everything that isn't the object
 * transparent. Returns [{ id, type, room, x, y, w, h, data }] in art pixels.
 */
export function objectSprites(layers, plan) {
  const W = layers.objects.w;
  const sprites = [];
  const seen = new Map();
  for (const obj of M.OBJECTS) {
    const o = { w: 1, h: 1, ...obj };
    const cell = plan[Math.floor(o.y + o.h / 2)]?.[Math.floor(o.x + o.w / 2)];
    const room = cell?.kind === 'floor' ? cell.room : null;
    const x0 = Math.max(0, Math.floor((o.x - 0.5) * TILE));
    const y0 = Math.max(0, Math.floor((o.y - 0.5) * TILE));
    const x1 = Math.min(W, Math.ceil((o.x + o.w + 0.5) * TILE));
    const y1 = Math.min(layers.objects.h, Math.ceil((o.y + o.h + 0.5) * TILE));
    const w = x1 - x0;
    const h = y1 - y0;
    const data = new Uint8Array(w * h * 4);
    let opaque = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const s = ((y0 + y) * W + x0 + x) * 4;
        for (const L of [layers.objects, layers.overhead])
          if (L.data[s + 3]) {
            data.set(L.data.subarray(s, s + 4), (y * w + x) * 4);
            opaque++;
            break;
          }
      }
    if (!opaque) continue;
    const base = `${room ?? 'yard'}-${o.type}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    sprites.push({ id: `${base}-${n}`, type: o.type, room, x: x0, y: y0, w, h, data });
  }
  return sprites;
}
