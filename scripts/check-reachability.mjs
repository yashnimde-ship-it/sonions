// Verifies every area of the estate can be reached from the spawn point, by flood-
// filling the collision grid with the bandit's real feet hitbox in 4px steps.
//
// Usage: node scripts/check-reachability.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/map/estate.json'), 'utf8'));
const grid = Buffer.from(map.collision.data, 'base64');
const { cell, width: CW, height: CH } = map.collision;
const T = map.tileSize;
const HIT = { left: -5, right: 5, top: -5, bottom: 0 }; // matches src/config.ts
const STEP = 4;

const solid = (x, y) => {
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  return cx < 0 || cy < 0 || cx >= CW || cy >= CH || grid[cy * CW + cx] === 1;
};
const blocked = (x, y) => {
  for (let yy = y + HIT.top; yy < y + HIT.bottom; yy += 2) for (let xx = x + HIT.left; xx < x + HIT.right; xx += 2) if (solid(xx, yy)) return true;
  return solid(x + HIT.right - 0.01, y + HIT.bottom - 0.01);
};

const W = (map.width * T) / STEP;
const H = (map.height * T) / STEP;
const seen = new Uint8Array(W * H);
const sx = Math.round((map.spawn.x * T) / STEP);
const sy = Math.round((map.spawn.y * T) / STEP);
const queue = [[sx, sy]];
seen[sy * W + sx] = 1;
const reachedAreas = new Set();
while (queue.length) {
  const [x, y] = queue.pop();
  const tx = Math.floor((x * STEP) / T);
  const ty = Math.floor((y * STEP - 3) / T);
  reachedAreas.add(map.areas.names[map.areas.data[ty * map.width + tx]]);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx]) continue;
    if (blocked(nx * STEP, ny * STEP)) continue;
    seen[ny * W + nx] = 1;
    queue.push([nx, ny]);
  }
}

// Every interactable must be reachable by the same probe the game uses (src/systems/InteractionSystem.ts).
const REACH = 12;
const AHEAD = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const touched = new Set();
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    if (!seen[y * W + x]) continue;
    for (const [ax, ay] of AHEAD)
      for (const d of [REACH, REACH / 2]) {
        const tx = Math.floor((x * STEP + ax * d) / T);
        const ty = Math.floor((y * STEP - 4 + ay * d) / T);
        for (const i of map.interactables) if (tx >= i.rect[0] && tx <= i.rect[2] && ty >= i.rect[1] && ty <= i.rect[3]) touched.add(i.id);
      }
  }
const unreachableItems = map.interactables.filter((i) => !touched.has(i.id)).map((i) => i.id);
console.log(`interactables reachable: ${touched.size}/${map.interactables.length}`);
if (unreachableItems.length) {
  console.log(`UNREACHABLE ITEMS: ${unreachableItems.join(', ')}`);
  process.exitCode = 1;
}

const all = new Set(map.areas.names);
const missing = [...all].filter((a) => !reachedAreas.has(a));
console.log(`reachable areas (${reachedAreas.size}/${all.size}): ${[...reachedAreas].sort().join(', ')}`);
if (missing.length) {
  console.log(`UNREACHABLE: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('OK: every area is reachable from the spawn point');
