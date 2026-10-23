// Paints the safehouse lobby (where players gather before a heist) with the same
// pixel-art painters as the estate, and writes:
//   public/assets/lobby/lobby.png    the whole room, one image (floor, walls, furniture)
//   public/assets/lobby/lobby.json   size, collision grid, portals, wardrobe, lights, spawn
//
// The portals, the lamplight and the wardrobe prompt are drawn by the game at runtime,
// since they glow and show live player counts. Usage: npm run lobby

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode } from 'fast-png';
import { Layer, sprite, TILE } from '../map/draw.mjs';
import * as F from '../map/furniture.mjs';
import { PAINTERS } from '../map/mapBuilder.mjs';
import * as T from '../map/tileDefinitions.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'public', 'assets', 'lobby');

// ---------- Layout (tiles) ----------

const WIDTH = 40;
const HEIGHT = 26;
const t = (n) => Math.round(n * TILE);

/** Floor zones: [kind, x0, y0, x1, y1] inclusive; later zones paint over earlier ones. */
const FLOORS = [
  ['wood', 1, 1, 38, 24],
  ['concrete', 28, 1, 38, 14],
];
/** Window runs in the top wall: [x0, x1] inclusive. */
const WINDOWS = [
  [3, 6],
  [24, 26],
  [31, 35],
];

// Same object format as mapData: type, x, y, w, h in tiles; solid: false for floor decor.
const OBJECTS = [
  // Reading corner (top left)
  { type: 'bookshelf', x: 1.4, y: 1.3, w: 5.2, h: 2.6, seed: 5 },
  { type: 'dresser', x: 7, y: 1.3, w: 2.8, h: 2.4 },
  { type: 'plant', x: 10.2, y: 1.5 },
  { type: 'rug', x: 5.6, y: 5, w: 6.4, h: 3.6, colors: ['r2', 'r1', 'r4'], solid: false },
  { type: 'desk', x: 1.4, y: 6.4, w: 2, h: 4.6, items: ['book', 'lamp'] },
  // Lounge (bottom left)
  { type: 'rug', x: 1.4, y: 14, w: 10.2, h: 8.4, colors: ['r2', 'r1', 'r4'], solid: false },
  { type: 'floorLamp', x: 1.6, y: 12 },
  { type: 'sofa', x: 1.6, y: 14.4, w: 2.8, h: 6.6, facing: 'right' },
  { type: 'sofa', x: 4.4, y: 20.8, w: 6.6, h: 2.6, facing: 'up' },
  { type: 'coffeeTable', x: 5.6, y: 15.8, w: 4.2, h: 3.2 },
  { type: 'plant', x: 11, y: 14.4, size: 'big' },
  // Long cabinet under the pictures (top center)
  { type: 'dresser', x: 12.6, y: 1.3, w: 10.4, h: 2, top: ['plantSmall'] },
  // Planning table (center), with the estate's map spread on it
  { type: 'rug', x: 12, y: 5.8, w: 14.6, h: 8.4, colors: ['bb2', 'bb1', 'y2'], solid: false },
  { type: 'dining', x: 14.6, y: 7.6, w: 9.6, h: 4.8 },
  { type: 'plant', x: 26.8, y: 1.5 },
  // Garage bay (top right): the getaway car and gear
  { type: 'car', x: 32.4, y: 2.2, w: 4.6, h: 9.4 },
  { type: 'shelf', x: 37.6, y: 2.4, w: 1, h: 8 },
  { type: 'crate', x: 29, y: 1.5 },
  { type: 'crate', x: 29, y: 3.3 },
  { type: 'crate', x: 30.6, y: 1.5 },
  { type: 'workbench', x: 28.8, y: 9.6, w: 3, h: 1.8 },
  // Wardrobe corner (bottom right): where players change character
  { type: 'rug', x: 30.4, y: 19.6, w: 7.8, h: 3.6, colors: ['pp2', 'pp1', 'y2'], solid: false },
  { type: 'wardrobe', x: 30.6, y: 15.4, w: 2.4, h: 3.4 },
  { type: 'plant', x: 37.2, y: 15.6, size: 'small' },
];

// Portals in a row above the stairs: walk in with your crew to start a heist.
const PORTALS = [
  { size: 2, x: 12.6, y: 16.2, w: 5, h: 4.6 },
  { size: 3, x: 18.6, y: 16.2, w: 5, h: 4.6 },
  { size: 4, x: 24.6, y: 16.2, w: 5, h: 4.6 },
];
// The spot in front of the wardrobe and clothes rack where players change character.
const WARDROBE = { x: 30.4, y: 19, w: 7.8, h: 4.4 };
// Lamps, for the runtime lighting: x, y and radius in tiles.
const LIGHTS = [
  { x: 2.1, y: 12.4, r: 5 }, // floor lamp by the sofa
  { x: 19.4, y: 9.6, r: 8 }, // pendant over the planning table
  { x: 4, y: 2.6, r: 4 }, // reading lamp
  { x: 17.8, y: 2.4, r: 5 }, // cabinet lamps
  { x: 34.7, y: 6.5, r: 6 }, // garage light
  { x: 34, y: 17, r: 5 }, // wardrobe corner
  { x: 12, y: 23, r: 3.5 }, // stair lamps
  { x: 30, y: 23, r: 3.5 },
  { x: 21, y: 18.5, r: 6 }, // the portals' own glow
];
const SPAWN = { x: 19.4, y: 14.6 };
const STAIRS = { x0: 17, x1: 23 }; // the opening in the south wall, tiles

// ---------- Custom props ----------

/** A rail of hanging clothes in the crew's colours, shoes lined up underneath. */
function clothesRack(L, x, y, w) {
  const s = sprite(w + 2, 36);
  s.rect(1, 2, w, 2, 'm2');
  s.vl(1, 2, 30, 'm2');
  s.vl(w, 2, 30, 'm2');
  const colors = [['tc2', 'tc3'], ['g3', 'g4'], ['bb2', 'bb3'], ['pk1', 'pk2'], ['y1', 'y2'], ['pp2', 'pp3'], ['r2', 'r3']];
  let cx = 4;
  for (let i = 0; cx < w - 4; i++, cx += 6) {
    const [d, l] = colors[i % colors.length];
    s.rect(cx, 4, 5, 18 + (i % 3) * 2, d);
    s.vl(cx + 1, 5, 14, l);
    s.hl(cx, 4, 5, 'K');
  }
  for (let sx = 4; sx < w - 4; sx += 5) s.rect(sx, 30, 4, 3, (sx / 5) % 2 ? 'lw2' : 'r3');
  s.outline();
  L.stamp(s, x, y);
}

/** A tall mirror with a warm frame. */
function mirror(L, x, y) {
  L.box(x, y, 14, 30, 'fw4');
  L.rect(x + 2, y + 2, 10, 26, 'w4');
  L.vl(x + 4, y + 4, 18, 'lw3');
  L.vl(x + 5, y + 6, 10, 'lw3');
}

/** The estate's plan, printed and spread across the planning table. */
function heistMap(L, x, y, w, h) {
  L.box(x, y, w, h, 'kt3');
  L.rect(x + 2, y + 2, w - 4, h - 4, 'g5');
  for (const [px, py, pw, ph] of [[0.15, 0.2, 0.3, 0.35], [0.5, 0.15, 0.3, 0.3], [0.2, 0.6, 0.25, 0.25], [0.55, 0.55, 0.3, 0.3]])
    L.box(x + Math.round(w * px), y + Math.round(h * py), Math.round(w * pw), Math.round(h * ph), 'kt2', 'fw2');
  L.hl(x + 3, y + Math.round(h / 2), w - 6, 'ps3');
  L.vl(x + Math.round(w * 0.47), y + 3, h - 6, 'ps3');
  // The target, circled in red.
  L.ellipse(x + w * 0.7, y + h * 0.35, 4, 3, 'r3');
  L.ellipse(x + w * 0.7, y + h * 0.35, 2.5, 1.6, 'kt2');
  // Notes pinned around it.
  L.box(x - 6, y + 4, 8, 9, 'y3');
  L.box(x + w - 3, y + h - 12, 8, 9, 'lw3');
}

function stairs(L, x0, x1) {
  const y = t(HEIGHT - 2) + 6;
  const h = t(HEIGHT) - y;
  for (let j = 0; j < h; j++) L.hl(x0, y + j, x1 - x0, j % 6 === 0 ? 'K' : j % 6 === 1 ? 'fw4' : 'fw2');
  L.vl(x0, y, h, 'K');
  L.vl(x1 - 1, y, h, 'K');
}

/** A wooden balustrade along the stair opening. */
function railing(L, x0, x1, y) {
  L.rect(x0, y, x1 - x0, 3, 'fw4');
  L.hl(x0, y + 3, x1 - x0, 'fw1');
  for (let x = x0; x < x1; x += 8) {
    L.rect(x, y + 3, 2, 9, 'fw2');
    L.vl(x, y + 3, 9, 'fw4');
  }
  L.rect(x0 - 2, y - 3, 6, 15, 'fw3');
  L.rect(x1 - 4, y - 3, 6, 15, 'fw3');
}

// ---------- Paint ----------

const W = WIDTH * TILE;
const H = HEIGHT * TILE;
const L = new Layer(W, H);
const isWall = (x, y) => x <= 0 || y <= 0 || x >= WIDTH - 1 || y >= HEIGHT - 1;

for (const [kind, x0, y0, x1, y1] of FLOORS) T.FLOORS[kind](L, t(x0), t(y0), t(x1 + 1), t(y1 + 1));
for (let x = 1; x < WIDTH - 1; x++) T.wallFace(L, x, 1);
for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (isWall(x, y)) T.wallTile(L, x, y, isWall);
for (const [x0, x1] of WINDOWS) T.wallWindow(L, t(x0), 0, t(x1 - x0 + 1), true);
// Hazard stripes along the edge of the garage bay.
for (let y = t(1); y < t(15); y += 8) L.rect(t(28) - 2, y, 3, 5, 'y2');
for (let x = t(28); x < t(39); x += 8) L.rect(x, t(15) - 2, 5, 3, 'y2');

for (const o of OBJECTS) PAINTERS[o.type](L, o);
heistMap(L, t(16.8), t(8.6), t(5.2), t(2.8));
clothesRack(L, t(33.4), t(15.3), t(3.6));
mirror(L, t(37.3) - 6, t(17.2));
F.wallPicture(L, t(14), t(1) - 2, 22, 12);
F.wallPicture(L, t(18.6), t(1) - 2, 26, 12);
F.wallPicture(L, t(8), t(1) - 1);
F.floorLamp(L, t(11.5), t(21.6));
F.floorLamp(L, t(29.6), t(21.6));
stairs(L, t(STAIRS.x0), t(STAIRS.x1 + 1));
railing(L, t(12), t(STAIRS.x0), t(23.2));
railing(L, t(STAIRS.x1 + 1), t(29.4), t(23.2));

// ---------- Collision (8 px cells), like the estate's ----------

const CELL = 8;
const PER = TILE / CELL;
const CW = WIDTH * PER;
const CH = HEIGHT * PER;
const grid = new Uint8Array(CW * CH);
const solidBox = (x, y, w, h) => {
  for (let cy = 0; cy < CH; cy++)
    for (let cx = 0; cx < CW; cx++) {
      const mx = (cx + 0.5) / PER;
      const my = (cy + 0.5) / PER;
      if (mx > x && mx < x + w && my > y && my < y + h) grid[cy * CW + cx] = 1;
    }
};
for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (isWall(x, y)) solidBox(x, y, 1, 1);
solidBox(1, 1, WIDTH - 2, 0.9); // the north wall's face
// Furniture blocks its lower part, so players can stand "behind" its top edge.
for (const o of OBJECTS) {
  if (o.solid === false) continue;
  const w = o.w ?? 1;
  const h = o.h ?? 1;
  const top = h > 1.5 ? h * 0.35 : 0;
  solidBox(o.x + 0.1, o.y + top, w - 0.2, h - top);
}
solidBox(33.4, 16.4, 3.6, 1.6); // clothes rack
solidBox(11.6, 22.6, 18, 2.4); // railings and the stair well

// ---------- Write ----------

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'lobby.png'), encode({ width: W, height: H, data: L.data, channels: 4, depth: 8 }));
const json = {
  name: 'Safehouse',
  tileSize: TILE,
  width: WIDTH,
  height: HEIGHT,
  collision: { cell: CELL, width: CW, height: CH, data: Buffer.from(grid).toString('base64') },
  portals: PORTALS,
  wardrobe: WARDROBE,
  lights: LIGHTS,
  spawn: SPAWN,
};
fs.writeFileSync(path.join(OUT, 'lobby.json'), JSON.stringify(json));
console.log(`lobby: ${W}x${H} px, ${grid.reduce((a, b) => a + b, 0)} solid cells`);
