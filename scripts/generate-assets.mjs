// Paints the estate from map/mapData.mjs and compiles it into game assets:
//   public/assets/tiles/tileset.png       deduplicated 16x16 art tiles (32x32 on screen)
//   public/assets/map/estate.json         tile layers, collision, areas, lights, interactables
//   public/assets/characters/bandit-placeholder.png   stand-in bandit (the real one is bandit.png)
//   public/assets/map/doors.png           closed + open sprite for every door
//   public/assets/map/preview.png         the composited map, for checking the art
//   public/assets/furniture/*.png         every object cut out of the reference, plus furniture.json
//
// The art comes from the reference image (map/referenceLayers.mjs): its floors and
// ground become the floor layer and its furniture is cut out onto the objects layer.
// `--procedural` uses the hand-written painters in map/furniture.mjs instead.
//
// Usage: npm run assets            (or: npm run assets -- --procedural)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode } from 'fast-png';
import { FRAME_H, FRAME_W, banditFrames } from '../map/bandit.mjs';
import { artWallMask } from '../map/artWalls.mjs';
import { CELL, CH, CW, buildCollision, doorCells } from '../map/collisionMap.mjs';
import { TILE } from '../map/draw.mjs';
import { buildPlan, paint } from '../map/mapBuilder.mjs';
import * as M from '../map/mapData.mjs';
import { EXTRACT_OPTIONS, REFERENCE } from '../map/referenceConfig.mjs';
import { loadReference } from '../map/referenceExtract.mjs';
import { doorSprites, objectSprites, referenceLayers } from '../map/referenceLayers.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'public', 'assets');
const W = M.WIDTH * TILE;
const H = M.HEIGHT * TILE;

const writePng = (rel, w, h, data) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encode({ width: w, height: h, data, channels: 4, depth: 8 }));
};

const t0 = Date.now();
const plan = buildPlan();
const procedural = process.argv.includes('--procedural');
const ref = procedural ? null : loadReference(path.join(ROOT, REFERENCE));
const layers = procedural ? paint(plan) : referenceLayers(ref, plan, EXTRACT_OPTIONS).layers;
// Reference mode reads the walls from the art so collision matches the picture exactly.
const collision = buildCollision(plan, procedural ? {} : { wallMask: artWallMask(ref, plan, EXTRACT_OPTIONS) });

// Doors: a closed and an open sprite for each wooden door, side by side in one atlas.
const doors = procedural ? [] : doorSprites(ref, layers.floor);
const atlasW = Math.max(1, ...doors.map((d) => d.w * 2));
const atlasH = Math.max(1, doors.reduce((h, d) => h + d.h, 0));
const atlas = new Uint8Array(atlasW * atlasH * 4);
let atlasY = 0;
for (const d of doors) {
  d.atlas = [0, atlasY];
  for (let y = 0; y < d.h; y++) {
    atlas.set(d.closed.subarray(y * d.w * 4, (y + 1) * d.w * 4), ((atlasY + y) * atlasW) * 4);
    atlas.set(d.open.subarray(y * d.w * 4, (y + 1) * d.w * 4), ((atlasY + y) * atlasW + d.w) * 4);
  }
  atlasY += d.h;
}

// ---------- Tileset: cut every layer into 16x16 tiles and dedupe ----------

const tiles = []; // Uint8Array(16*16*4) each; index 0 is reserved for "empty"
const index = new Map();
const EMPTY = 0;
tiles.push(new Uint8Array(TILE * TILE * 4));

function tileId(layer, tx, ty) {
  const buf = new Uint8Array(TILE * TILE * 4);
  let opaque = false;
  for (let y = 0; y < TILE; y++) {
    const src = ((ty * TILE + y) * W + tx * TILE) * 4;
    buf.set(layer.data.subarray(src, src + TILE * 4), y * TILE * 4);
  }
  for (let i = 3; i < buf.length; i += 4) if (buf[i]) opaque = true;
  if (!opaque) return EMPTY;
  const key = Buffer.from(buf).toString('base64');
  let id = index.get(key);
  if (id === undefined) {
    id = tiles.length;
    tiles.push(buf);
    index.set(key, id);
  }
  return id;
}

const layerData = {};
for (const name of ['floor', 'walls', 'objects', 'overhead']) {
  const ids = new Array(M.WIDTH * M.HEIGHT);
  for (let ty = 0; ty < M.HEIGHT; ty++) for (let tx = 0; tx < M.WIDTH; tx++) ids[ty * M.WIDTH + tx] = tileId(layers[name], tx, ty);
  layerData[name] = ids;
}

const COLS = 32;
const rows = Math.ceil(tiles.length / COLS);
const sheet = new Uint8Array(COLS * TILE * rows * TILE * 4);
tiles.forEach((buf, i) => {
  const ox = (i % COLS) * TILE;
  const oy = Math.floor(i / COLS) * TILE;
  for (let y = 0; y < TILE; y++) sheet.set(buf.subarray(y * TILE * 4, (y + 1) * TILE * 4), ((oy + y) * COLS * TILE + ox) * 4);
});
writePng('tiles/tileset.png', COLS * TILE, rows * TILE, sheet);

// ---------- Areas (for the HUD) and indoor flags (for lighting) ----------

const areaNames = ['Garden'];
const areaId = (name) => {
  let i = areaNames.indexOf(name);
  if (i < 0) i = areaNames.push(name) - 1;
  return i;
};
const areas = new Array(M.WIDTH * M.HEIGHT).fill(0);
const indoor = new Array(M.WIDTH * M.HEIGHT).fill(0);
const names = Object.fromEntries([...M.ROOMS, ...M.OPEN_FLOORS].map((r) => [r.id, r.name]));
for (let y = 0; y < M.HEIGHT; y++)
  for (let x = 0; x < M.WIDTH; x++) {
    const c = plan[y][x];
    const i = y * M.WIDTH + x;
    if (c.kind !== 'out') indoor[i] = 1;
    if (c.kind === 'floor') areas[i] = areaId(names[c.room]);
  }
const zone = (name, x0, y0, x1, y1) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!indoor[y * M.WIDTH + x]) areas[y * M.WIDTH + x] = areaId(name);
};
zone('Front Yard', 3, 41, 92, 52);
zone('Backyard', 69, 26, 92, 52);
zone('Driveway', 4, 8, 8, 29);
zone('Driveway', 9, 21, 18, 29);
zone('Pool Deck', 76, 11, 92, 28);
zone('Back Deck', 84, 5, 92, 10);
zone('Front Porch', 40, 41, 49, 46);
zone('Street', 0, 53, 95, 63);
// Doors take the name of the room on their inner side.
for (let y = 0; y < M.HEIGHT; y++)
  for (let x = 0; x < M.WIDTH; x++)
    if (plan[y][x].kind === 'door') {
      const n = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => plan[y + dy]?.[x + dx]).find((c) => c?.kind === 'floor');
      if (n) areas[y * M.WIDTH + x] = areaId(names[n.room]);
    }

// ---------- Map JSON ----------

const estate = {
  name: 'The Estate',
  tileSize: TILE,
  width: M.WIDTH,
  height: M.HEIGHT,
  tilesetColumns: COLS,
  tileCount: tiles.length,
  layers: layerData,
  collision: { cell: CELL, width: CW, height: CH, data: Buffer.from(collision).toString('base64') },
  areas: { names: areaNames, data: areas },
  indoor,
  lights: M.LIGHTS,
  interactables: M.INTERACTABLES,
  doors: doors.map((d) => ({ id: d.id, name: d.name, x: d.x, y: d.y, w: d.w, h: d.h, atlas: d.atlas, cells: doorCells(d.box) })),
  spawn: M.SPAWN,
};
fs.mkdirSync(path.join(OUT, 'map'), { recursive: true });
writePng('map/doors.png', atlasW, atlasH, atlas);
fs.writeFileSync(path.join(OUT, 'map', 'estate.json'), JSON.stringify(estate));

// ---------- Furniture: each object as its own sprite ----------

const furnitureDir = path.join(OUT, 'furniture');
fs.rmSync(furnitureDir, { recursive: true, force: true });
const furniture = procedural ? [] : objectSprites(layers, plan);
for (const f of furniture) writePng(`furniture/${f.id}.png`, f.w, f.h, f.data);
if (furniture.length)
  fs.writeFileSync(
    path.join(furnitureDir, 'furniture.json'),
    JSON.stringify(furniture.map(({ data, ...f }) => ({ ...f, file: `${f.id}.png` })), null, 1),
  );

// ---------- Placeholder bandit ----------
// The real bandit sprite comes from the art team as characters/bandit.png and is never
// touched here. This stand-in only exists so the map can be played before it lands.

const frames = banditFrames();
const bandit = new Uint8Array(FRAME_W * frames.length * FRAME_H * 4);
frames.forEach((f, n) => {
  for (let y = 0; y < FRAME_H; y++)
    for (let x = 0; x < FRAME_W; x++) {
      const i = (y * FRAME_W + x) * 4;
      bandit.set(f.data.subarray(i, i + 4), (y * FRAME_W * frames.length + n * FRAME_W + x) * 4);
    }
});
writePng('characters/bandit-placeholder.png', FRAME_W * frames.length, FRAME_H, bandit);

// ---------- Preview ----------

const preview = new Uint8Array(W * H * 4);
for (const name of ['floor', 'walls', 'objects', 'overhead']) {
  const d = layers[name].data;
  for (let i = 0; i < W * H; i++) if (d[i * 4 + 3]) preview.set(d.subarray(i * 4, i * 4 + 4), i * 4);
}
writePng('map/preview.png', W, H, preview);

const solid = collision.reduce((a, b) => a + b, 0);
console.log(`map ${M.WIDTH}x${M.HEIGHT} tiles (${W * 2}x${H * 2} px on screen)`);
console.log(`art: ${procedural ? 'procedural painters' : `reference image (${furniture.length} furniture sprites)`}`);
console.log(`tileset: ${tiles.length} unique tiles`);
console.log(`collision: ${CW}x${CH} cells, ${solid} solid; ${doors.length} doors`);
console.log(`areas: ${areaNames.join(', ')}`);
console.log(`done in ${Date.now() - t0} ms -> ${OUT}`);
