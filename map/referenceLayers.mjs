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

/**
 * Closed and open sprites for every door in M.DOOR_SLABS. Closed is the reference as
 * drawn. Open keeps the frame (posts and lintel) and replaces the slab with the room
 * beyond (the floor just past the wall, shaded darker toward the top), with the
 * leaves swung back against the posts.
 */
export function doorSprites(ref, floorLayer) {
  const W = ref.w;
  const LEAF = 4;
  return M.DOOR_SLABS.map((d) => {
    // A roll-up garage door has no frame to speak of and no leaves.
    const POST = d.rolling ? 0 : 3;
    const LINTEL = d.rolling ? 2 : 5;
    const x = Math.floor(d.box[0] * TILE);
    const y = Math.floor(d.box[1] * TILE);
    const w = Math.ceil(d.box[2] * TILE) - x;
    const h = Math.ceil(d.box[3] * TILE) - y;
    const closed = new Uint8Array(w * h * 4);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const s = ((y + j) * W + x + i) * 3;
        closed.set([ref.rgb[s], ref.rgb[s + 1], ref.rgb[s + 2], 255], (j * w + i) * 4);
      }
    // The door's wood color: the median of the slab's middle.
    const wood = [];
    for (let j = Math.floor(h * 0.35); j < h * 0.75; j++)
      for (let i = Math.floor(w * 0.2); i < w * 0.45; i++) wood.push((j * w + i) * 4);
    const lumOf = (k) => closed[k] * 0.3 + closed[k + 1] * 0.59 + closed[k + 2] * 0.11;
    wood.sort((a, b) => lumOf(a) - lumOf(b));
    const mid = wood[wood.length >> 1];
    const woodC = [closed[mid], closed[mid + 1], closed[mid + 2]];
    const woodDark = woodC.map((c) => Math.round(c * 0.55));

    // The opening shows the room beyond: its median floor color (sampled just past the
    // wall, so stray furniture and other doors don't matter), shaded darker toward the
    // top for depth, with faint board lines.
    const band = [];
    for (let sy = Math.max(0, y - 14); sy < y - 2; sy++)
      for (let i = POST; i < w - POST; i++) band.push((sy * W + x + i) * 4);
    const fl = (k) => floorLayer.data[k] * 0.3 + floorLayer.data[k + 1] * 0.59 + floorLayer.data[k + 2] * 0.11;
    band.sort((p, q) => fl(p) - fl(q));
    const fm = band[band.length >> 1];
    const floorC = band.length ? [floorLayer.data[fm], floorLayer.data[fm + 1], floorLayer.data[fm + 2]] : [60, 45, 35];
    const open = closed.slice();
    const innerH = h - LINTEL;
    for (let j = LINTEL; j < h; j++)
      for (let i = POST; i < w - POST; i++) {
        const t = (j - LINTEL) / innerH;
        let shade = 0.3 + 0.62 * t;
        if ((h - 1 - j) % 5 === 0) shade *= 0.86;
        if (j === h - 1) shade = 0.45;
        open.set([...floorC.map((c) => Math.round(c * shade)), 255], (j * w + i) * 4);
      }
    // Leaves folded back against the posts (both sides for a double door).
    const double = w >= 2.8 * TILE;
    if (d.rolling) return { id: d.id, name: d.name, box: d.box, x, y, w, h, closed, open };
    const leafCols = [];
    for (let k = 0; k < LEAF; k++) leafCols.push(POST + k);
    if (double) for (let k = 0; k < LEAF; k++) leafCols.push(w - POST - 1 - k);
    for (const i of leafCols)
      for (let j = LINTEL; j < h - 1; j++) {
        const inner = i === POST + LEAF - 1 || i === w - POST - LEAF;
        const outer = i === POST || i === w - POST - 1;
        const c = inner ? woodDark : outer ? woodC.map((v) => Math.min(255, Math.round(v * 1.25))) : woodC;
        open.set([...c, 255], (j * w + i) * 4);
      }
    return { id: d.id, name: d.name, box: d.box, x, y, w, h, closed, open };
  });
}
