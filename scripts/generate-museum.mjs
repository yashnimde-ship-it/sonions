// Builds a heist map from its reference and a layout file (map/museumLayout.mjs,
// map/cruiseB1Layout.mjs), in the same format as the estate, so the game's TileMap,
// lighting, doors and collision all just work:
//   <out>/map.json      tile layers, collision, areas, lights, loot, doors, stairs, hiding spots
//   <out>/tileset.png   deduplicated 16x16 art tiles
//   <out>/doors.png     closed + open sprites for each door
//   <out>/preview.png   the composited map (lobby thumbnail, Map Info)
//
// A layout may also export:
//   NAME              the map's display name
//   inside(tx, ty)    the playable area (tiles); everything else is solid (the cruise's ocean)
//   FOLIAGE = false   skip the garden-foliage collision pass
//   STAIRS            stairwells: interaction zones with destination metadata
//   HIDING_SPOTS      places a player can hide (metadata for the hide mechanic)
//   OFF_LIMITS        area names nobody can reach on purpose (the open sea)
//   AUTO_WALLS        also read walls from the art's dark wall bands (inside() only), with
//                     NOT_WALLS boxes clearing anything it mistakes for wall
//   CLEARED           small props painted out of the art (same fill as LABELS) to open up
//                     cramped rooms; their SOLIDS boxes are removed from the layout too
//
// Steps: the reference (already 96 x 64 tiles at 16 px) has its room-name plaques painted
// over with the floor beside them; it's cut into 16x16 tiles and deduplicated. Collision is
// built from traced walls (with doorway gaps), exhibit and furniture boxes, and the garden's
// foliage (detected by colour, outside the building).
//
// Usage: node scripts/generate-museum.mjs [layout.mjs] [out dir]
//        npm run museum   /   npm run cruise

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decode, encode } from 'fast-png';
import { artWallMask } from '../map/artWalls.mjs';
import { CELL } from '../map/collisionMap.mjs';
import { doorSprites } from '../map/referenceLayers.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const L = await import(pathToFileURL(path.resolve(ROOT, process.argv[2] ?? 'map/museumLayout.mjs')).href);
const OUT = path.resolve(ROOT, process.argv[3] ?? 'public/assets/maps/museum');
const TILE = 16;
const W = L.WIDTH * TILE;
const H = L.HEIGHT * TILE;
const px = (t) => Math.round(t * TILE);
const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;

const writePng = (rel, w, h, data) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encode({ width: w, height: h, data, channels: 4, depth: 8 }));
};

const t0 = Date.now();
// The collision grid (8 px cells) for this map's size.
const CW = W / CELL;
const CH = H / CELL;
const doorCells = ([x0, y0, x1, y1]) => {
  const cells = [];
  for (let cy = Math.floor((y0 * TILE) / CELL); cy < Math.ceil((y1 * TILE) / CELL); cy++)
    for (let cx = Math.floor((x0 * TILE) / CELL); cx < Math.ceil((x1 * TILE) / CELL); cx++) cells.push(cy * CW + cx);
  return cells;
};
const ref = (() => {
  const png = decode(fs.readFileSync(path.join(ROOT, L.REFERENCE)));
  if (png.width !== W || png.height !== H) throw new Error(`${L.REFERENCE} must be ${W}x${H} (${L.WIDTH}x${L.HEIGHT} tiles)`);
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) rgb.set(png.data.subarray(i * png.channels, i * png.channels + 3), i * 3);
  return { w: W, h: H, rgb };
})();

// ---------- Paint over the room-name plaques ----------

/**
 * Fills a box by repeating (mirrored) the strip of `span` tiles on one side of it. Or, for a
 * prop with clutter right beside it: `strip: [a, b]` repeats a clean strip elsewhere in the same
 * rows (from 'left'/'right', x in tiles) or columns ('up'/'down', y in tiles), so floor planks
 * carry on; `shift: [dx, dy]` copies a clean patch that many tiles away (for tiled floors).
 */
function repair(img, { box, from, span, strip, shift }) {
  const [x0, y0, x1, y1] = box.map(px);
  const s = Math.max(1, px(strip ? strip[1] - strip[0] : span));
  const mirror = (d) => {
    const k = d % (2 * s);
    return k < s ? k : 2 * s - 1 - k;
  };
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      let sx = x;
      let sy = y;
      if (shift) {
        sx = x + px(shift[0]);
        sy = y + px(shift[1]);
      } else if (strip) {
        if (from === 'left' || from === 'right') sx = px(strip[0]) + mirror(x - x0);
        else sy = px(strip[0]) + mirror(y - y0);
      }
      else if (from === 'right') sx = x1 + mirror(x1 - 1 - x);
      if (!shift && !strip && from === 'left') sx = x0 - 1 - mirror(x - x0);
      if (!shift && !strip && from === 'down') sy = y1 + mirror(y1 - 1 - y);
      if (!shift && !strip && from === 'up') sy = y0 - 1 - mirror(y - y0);
      const si = (Math.min(img.h - 1, Math.max(0, sy)) * img.w + Math.min(img.w - 1, Math.max(0, sx))) * 3;
      img.rgb.copyWithin((y * img.w + x) * 3, si, si + 3);
    }
}
for (const label of [...L.LABELS, ...(L.CLEARED ?? [])]) repair(ref, label);

const floor = { w: W, h: H, data: new Uint8Array(W * H * 4) };
for (let i = 0; i < W * H; i++) floor.data.set([ref.rgb[i * 3], ref.rgb[i * 3 + 1], ref.rgb[i * 3 + 2], 255], i * 4);

// ---------- Tileset ----------

const tiles = [new Uint8Array(TILE * TILE * 4)]; // 0 = empty
const index = new Map();
const floorIds = new Array(L.WIDTH * L.HEIGHT);
for (let ty = 0; ty < L.HEIGHT; ty++)
  for (let tx = 0; tx < L.WIDTH; tx++) {
    const buf = new Uint8Array(TILE * TILE * 4);
    for (let y = 0; y < TILE; y++) {
      const src = ((ty * TILE + y) * W + tx * TILE) * 4;
      buf.set(floor.data.subarray(src, src + TILE * 4), y * TILE * 4);
    }
    const key = Buffer.from(buf).toString('base64');
    let id = index.get(key);
    if (id === undefined) {
      id = tiles.length;
      tiles.push(buf);
      index.set(key, id);
    }
    floorIds[ty * L.WIDTH + tx] = id;
  }
const COLS = 32;
const rows = Math.ceil(tiles.length / COLS);
const sheet = new Uint8Array(COLS * TILE * rows * TILE * 4);
tiles.forEach((buf, i) => {
  const ox = (i % COLS) * TILE;
  const oy = Math.floor(i / COLS) * TILE;
  for (let y = 0; y < TILE; y++) sheet.set(buf.subarray(y * TILE * 4, (y + 1) * TILE * 4), ((oy + y) * COLS * TILE + ox) * 4);
});
writePng('tileset.png', COLS * TILE, rows * TILE, sheet);
const empty = new Array(L.WIDTH * L.HEIGHT).fill(0);

// ---------- Collision (8 px cells, like the estate's) ----------

const grid = new Uint8Array(CW * CH);
/** Every cell the box (tiles) overlaps by more than 2 art px is solid. */
const cover = ([x0, y0, x1, y1]) => {
  const m = 2 / TILE;
  for (let cy = Math.max(0, Math.floor(((y0 + m) * TILE) / CELL)); cy < Math.min(CH, Math.ceil(((y1 - m) * TILE) / CELL)); cy++)
    for (let cx = Math.max(0, Math.floor(((x0 + m) * TILE) / CELL)); cx < Math.min(CW, Math.ceil(((x1 - m) * TILE) / CELL)); cx++) grid[cy * CW + cx] = 1;
};
L.WALLS.forEach(cover);
if (L.AUTO_WALLS) {
  // Walls read from the art: a cell is wall when enough of it is wall band.
  const mask = artWallMask(ref, null, { region: (x, y) => L.inside(x / TILE, y / TILE), windows: [], ...L.AUTO_WALLS });
  const auto = new Uint8Array(CW * CH);
  for (let cy = 0; cy < CH; cy++)
    for (let cx = 0; cx < CW; cx++) {
      let n = 0;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) n += mask[(cy * CELL + y) * W + cx * CELL + x];
      if (n >= 16) auto[cy * CW + cx] = 1;
    }
  for (const [x0, y0, x1, y1] of L.NOT_WALLS ?? [])
    for (let cy = Math.floor((y0 * TILE) / CELL); cy < Math.ceil((y1 * TILE) / CELL); cy++)
      for (let cx = Math.floor((x0 * TILE) / CELL); cx < Math.ceil((x1 * TILE) / CELL); cx++) auto[cy * CW + cx] = 0;
  for (let i = 0; i < auto.length; i++) if (auto[i]) grid[i] = 1;
}
L.SOLIDS.forEach(cover);
// Garden foliage (trees, hedges, flower beds) blocks: a cell is solid when most of it is
// leafy green. Only outside the building, where the art has no walls to go by.
const inBuilding = (x, y) => (L.BUILDING ?? []).some(([x0, y0, x1, y1]) => x >= x0 * TILE && x < x1 * TILE && y >= y0 * TILE && y < y1 * TILE);
let foliage = 0;
for (let cy = 0; cy < CH && L.FOLIAGE !== false; cy++)
  for (let cx = 0; cx < CW; cx++) {
    if (inBuilding(cx * CELL + 4, cy * CELL + 4)) continue;
    let green = 0;
    for (let y = 0; y < CELL; y++)
      for (let x = 0; x < CELL; x++) {
        const i = (cy * CELL + y) * W + cx * CELL + x;
        const [r, g, b] = [ref.rgb[i * 3], ref.rgb[i * 3 + 1], ref.rgb[i * 3 + 2]];
        if (g > r + 6 && g >= b - 4 && lum(r, g, b) < 150) green++;
      }
    if (green >= CELL * CELL * 0.45) {
      grid[cy * CW + cx] = 1;
      foliage++;
    }
  }
// Outside the playable area (the cruise ship's hull and the ocean) is solid.
if (L.inside)
  for (let cy = 0; cy < CH; cy++)
    for (let cx = 0; cx < CW; cx++) if (!L.inside(((cx + 0.5) * CELL) / TILE, ((cy + 0.5) * CELL) / TILE)) grid[cy * CW + cx] = 1;
// The world's edge.
for (let cx = 0; cx < CW; cx++) grid[cx] = grid[(CH - 1) * CW + cx] = 1;
for (let cy = 0; cy < CH; cy++) grid[cy * CW] = grid[cy * CW + CW - 1] = 1;
// Doorways stay open in the saved grid; the game closes each door at the start.
for (const d of L.DOORS) for (const c of doorCells(d.hit ?? d.box)) grid[c] = 0;

// ---------- Doors ----------

const doors = doorSprites(ref, floor, L.DOORS);
const atlasW = Math.max(1, ...doors.map((d) => d.w * 2));
const atlasH = Math.max(1, doors.reduce((h, d) => h + d.h, 0));
const atlas = new Uint8Array(atlasW * atlasH * 4);
let atlasY = 0;
for (const d of doors) {
  d.atlas = [0, atlasY];
  for (let y = 0; y < d.h; y++) {
    atlas.set(d.closed.subarray(y * d.w * 4, (y + 1) * d.w * 4), (atlasY + y) * atlasW * 4);
    atlas.set(d.open.subarray(y * d.w * 4, (y + 1) * d.w * 4), ((atlasY + y) * atlasW + d.w) * 4);
  }
  atlasY += d.h;
}
writePng('doors.png', atlasW, atlasH, atlas);

// ---------- Areas and indoor flags ----------

const areaNames = [];
const areaId = (name) => {
  let i = areaNames.indexOf(name);
  if (i < 0) i = areaNames.push(name) - 1;
  return i;
};
const areas = new Array(L.WIDTH * L.HEIGHT).fill(areaId(L.ZONES[0].name));
const indoor = new Array(L.WIDTH * L.HEIGHT).fill(0);
const paint = (box, fn) => {
  const [x0, y0, x1, y1] = box;
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) if (x >= 0 && y >= 0 && x < L.WIDTH && y < L.HEIGHT) fn(y * L.WIDTH + x);
};
for (const z of L.ZONES) paint(z.box, (i) => (areas[i] = areaId(z.name)));
for (const r of L.ROOMS)
  paint(r.box, (i) => {
    areas[i] = areaId(r.name);
    indoor[i] = 1;
  });

// ---------- Map JSON and preview ----------

const map = {
  name: L.NAME ?? 'Midnight Museum',
  tileSize: TILE,
  width: L.WIDTH,
  height: L.HEIGHT,
  tilesetColumns: COLS,
  tileCount: tiles.length,
  layers: { floor: floorIds, walls: empty, objects: empty, overhead: empty },
  collision: { cell: CELL, width: CW, height: CH, data: Buffer.from(grid).toString('base64') },
  areas: { names: areaNames, data: areas },
  indoor,
  lights: L.LIGHTS,
  interactables: L.INTERACTABLES,
  doors: doors.map((d, i) => {
    // Where E works: the drawn door and its whole doorway (thick walls make the doorway
    // deeper than the art), so it can be reached from either side.
    const hit = (L.DOORS[i].hit ?? L.DOORS[i].box).map((v) => v * TILE);
    const reach = [Math.min(d.x, hit[0]), Math.min(d.y, hit[1]), Math.max(d.x + d.w, hit[2]), Math.max(d.y + d.h, hit[3])].map(Math.round);
    return { id: d.id, name: d.name, x: d.x, y: d.y, w: d.w, h: d.h, atlas: d.atlas, cells: doorCells(L.DOORS[i].hit ?? d.box), reach, ...(L.DOORS[i].keypad ? { keypad: true } : {}) };
  }),
  spawn: L.SPAWN,
  ...(L.STAIRS ? { stairs: L.STAIRS } : {}),
  ...(L.HIDING_SPOTS ? { hiding: L.HIDING_SPOTS } : {}),
  ...(L.OFF_LIMITS ? { offLimits: L.OFF_LIMITS } : {}),
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'map.json'), JSON.stringify(map));
writePng('preview.png', W, H, floor.data);

const solid = grid.reduce((a, b) => a + b, 0);
console.log(`${L.NAME ?? 'museum'}: ${L.WIDTH}x${L.HEIGHT} tiles, ${tiles.length} unique tiles`);
console.log(`collision: ${solid} solid cells (${foliage} foliage); ${doors.length} door(s); ${L.INTERACTABLES.filter((i) => i.loot).length} loot`);
console.log(`areas: ${areaNames.join(', ')}`);
console.log(`done in ${Date.now() - t0} ms -> ${OUT}`);
