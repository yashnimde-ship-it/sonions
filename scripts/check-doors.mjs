// Checks every door in a map: walkable when open, blocks when closed (cuts something off),
// and its E prompt is reachable. Usage: node scripts/check-doors.mjs [map.json] (default: the estate)
import fs from 'node:fs';
const file = process.argv[2] ?? 'public/assets/map/estate.json';
const map = JSON.parse(fs.readFileSync(file, 'utf8'));
const base = Buffer.from(map.collision.data, 'base64');
const { cell, width: CW, height: CH } = map.collision;
const HIT = { l: -5, r: 5, t: -5, b: 0 };
function make(closedIds) {
  const g = Buffer.from(base);
  for (const d of map.doors) if (closedIds.has(d.id)) for (const c of d.cells) g[c] = 1;
  const solid = (x, y) => { const cx = Math.floor(x / cell), cy = Math.floor(y / cell); return cx < 0 || cy < 0 || cx >= CW || cy >= CH || g[cy * CW + cx] === 1; };
  return (x, y) => { for (let yy = y + HIT.t; yy < y + HIT.b; yy += 2) for (let xx = x + HIT.l; xx < x + HIT.r; xx += 2) if (solid(xx, yy)) return true; return solid(x + HIT.r - 0.01, y - 0.01); };
}
// Flood from spawn with all doors open: reachable set.
function flood(blocked) {
  const S = 2, W = map.width * 16 / S, H = map.height * 16 / S, seen = new Uint8Array(W * H);
  const s0 = [Math.round(map.spawn.x * 16 / S), Math.round(map.spawn.y * 16 / S)];
  const q = [s0]; seen[s0[1] * W + s0[0]] = 1;
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || blocked(nx * S, ny * S)) continue; seen[ny * W + nx] = 1; q.push([nx, ny]); } }
  return { seen, W, S };
}
const open = flood(make(new Set()));
for (const d of map.doors) {
  // Does any reachable point lie inside the door's box (i.e., you can walk into the doorway when open)?
  let through = 0, near = 0;
  for (let y = d.y; y < d.y + d.h; y += 2) for (let x = d.x; x < d.x + d.w; x += 2) if (open.seen[Math.floor(y / open.S) * open.W + Math.floor(x / open.S)]) through++;
  // Closing just this door: does it cut anything off? (a door that blocks nothing is cosmetic)
  const closed = flood(make(new Set([d.id])));
  let lost = 0;
  for (let i = 0; i < open.seen.length; i++) if (open.seen[i] && !closed.seen[i]) lost++;
  // Can the E probe reach it: reachable points within 18 px of the door box.
  for (let y = d.y - 18; y < d.y + d.h + 18; y += 2) for (let x = d.x - 18; x < d.x + d.w + 18; x += 2) if (y >= 0 && x >= 0 && open.seen[Math.floor(y / open.S) * open.W + Math.floor(x / open.S)]) near++;
  const status = through === 0 ? 'CANT WALK INTO DOORWAY' : lost === 0 ? 'closing blocks nothing (bypassable?)' : 'ok';
  console.log(`${d.id.padEnd(16)} ${d.name.padEnd(18)} doorway-reach=${String(through).padStart(4)} cutOffWhenClosed=${String(lost).padStart(6)} nearPts=${near}  ${status}`);
}
