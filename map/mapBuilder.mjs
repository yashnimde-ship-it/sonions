// Builds the house plan from mapData and paints the four art layers:
//   floor    ground, terrain, interior floors, wall faces
//   walls    walls, windows, doorways
//   objects  furniture, garden props, fences, trunks (drawn under the player)
//   overhead tree canopies and beams (drawn over the player)

import { Layer, TILE } from './draw.mjs';
import * as F from './furniture.mjs';
import * as M from './mapData.mjs';
import * as T from './tileDefinitions.mjs';

const t = (n) => Math.round(n * TILE);
/** Bushes in mapData are listed at a base size; the reference's hedges are fuller. */
export const BUSH_SCALE = 1.4;

// ---------- Plan ----------

/** Per-tile plan: { kind: 'out' | 'floor' | 'wall' | 'door', floor?, room?, window?, door? } */
export function buildPlan() {
  const plan = Array.from({ length: M.HEIGHT }, () => Array.from({ length: M.WIDTH }, () => ({ kind: 'out' })));
  const fill = (x0, y0, x1, y1, cell) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) plan[y][x] = { ...cell };
  };
  for (const f of M.OPEN_FLOORS) fill(...f.rect, { kind: 'floor', floor: f.floor, room: f.id });
  // Interiors first, then every wall, so shared walls always stay walls.
  for (const r of M.ROOMS) {
    const [x0, y0, x1, y1] = r.rect;
    fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, { kind: 'floor', floor: r.floor, room: r.id });
  }
  for (const r of M.ROOMS) {
    const [x0, y0, x1, y1] = r.rect;
    for (let x = x0; x <= x1; x++) {
      plan[y0][x] = { kind: 'wall' };
      plan[y1][x] = { kind: 'wall' };
    }
    for (let y = y0; y <= y1; y++) {
      plan[y][x0] = { kind: 'wall' };
      plan[y][x1] = { kind: 'wall' };
    }
  }
  // Any floor touching the outdoors becomes exterior wall, so the house is always closed.
  const outdoor = (x, y) => x < 0 || y < 0 || x >= M.WIDTH || y >= M.HEIGHT || plan[y][x].kind === 'out';
  const toWall = [];
  for (let y = 0; y < M.HEIGHT; y++)
    for (let x = 0; x < M.WIDTH; x++)
      if (plan[y][x].kind === 'floor')
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && outdoor(x + dx, y + dy)) toWall.push([x, y]);
  for (const [x, y] of toWall) plan[y][x] = { kind: 'wall' };

  for (const [x0, y0, x1, y1] of M.WINDOWS)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (plan[y][x].kind === 'wall') plan[y][x].window = true;

  M.DOORS.forEach((d, i) => {
    const [x0, y0, x1, y1] = d.rect;
    const horizontal = x1 - x0 >= y1 - y0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) plan[y][x] = { kind: 'door', door: i, horizontal, doorKind: d.kind };
  });
  return plan;
}

// ---------- Painting ----------

const PAINTERS = {
  car: (L, o) => F.car(L, t(o.x), t(o.y), t(o.w), t(o.h)),
  workbench: (L, o) => F.workbench(L, t(o.x), t(o.y), t(o.w), t(o.h)),
  shelf: (L, o) => F.shelfUnit(L, t(o.x), t(o.y), t(o.w), t(o.h), Math.round(o.x * 7 + o.y)),
  crate: (L, o) => F.crate(L, t(o.x), t(o.y)),
  dresser: (L, o) =>
    F.dresser(L, t(o.x), t(o.y), t(o.w), t(o.h), (o.top ?? []).map((k) => (T2) => F.plant(T2, t(o.x + o.w / 2) - 6, t(o.y) - 6, k === 'plantSmall' ? 'small' : 'medium'))),
  plant: (L, o) => F.plant(L, t(o.x), t(o.y), o.size ?? 'medium'),
  fridge: (L, o) => F.fridge(L, t(o.x), t(o.y), t(o.w), t(o.h)),
  counter: (L, o) => F.counter(L, t(o.x), t(o.y), t(o.w), t(o.h), o.fixtures ?? []),
  table: (L, o) =>
    F.table(L, t(o.x), t(o.y), t(o.w), t(o.h), (o.items ?? []).map((k) => (T2) => F.plant(T2, t(o.x + o.w / 2) - 7, t(o.y) - 4, k === 'plantSmall' ? 'small' : 'medium'))),
  rug: (L, o) => F.rug(L, t(o.x), t(o.y), t(o.w), t(o.h), o.colors),
  dining: (L, o) => F.diningSet(L, t(o.x), t(o.y), t(o.w), t(o.h)),
  bathtub: (L, o) => F.bathtub(L, t(o.x), t(o.y), t(o.w), t(o.h)),
  toilet: (L, o) => F.toilet(L, t(o.x), t(o.y)),
  sink: (L, o) => F.sink(L, t(o.x), t(o.y)),
  bathmat: (L, o) => F.bathMat(L, t(o.x), t(o.y), t(o.w), t(o.h)),
  bed: (L, o) => F.bed(L, t(o.x), t(o.y), t(o.w), t(o.h), o.color),
  nightstand: (L, o) => F.nightstand(L, t(o.x), t(o.y)),
  wardrobe: (L, o) => F.wardrobe(L, t(o.x), t(o.y), t(o.w), t(o.h)),
  bookshelf: (L, o) => F.bookshelf(L, t(o.x), t(o.y), t(o.w), t(o.h), o.seed),
  picture: (L, o) => F.wallPicture(L, t(o.x), t(o.y)),
  floorLamp: (L, o) => F.floorLamp(L, t(o.x), t(o.y)),
  tv: (L, o) => F.tvStand(L, t(o.x), t(o.y), t(o.w), t(o.h)),
  sofa: (L, o) => F.sofa(L, t(o.x), t(o.y), t(o.w), t(o.h), o.facing),
  coffeeTable: (L, o) => F.coffeeTable(L, t(o.x), t(o.y), t(o.w), t(o.h)),
  roundRug: (L, o) => F.roundRug(L, t(o.x), t(o.y), t(o.r), o.colors),
  desk: (L, o) => F.desk(L, t(o.x), t(o.y), t(o.w), t(o.h), o.items),
  chair: (L, o) => F.chair(L, t(o.x), t(o.y), o.facing),
  pool: (L, o) => F.pool(L, t(o.x), t(o.y), t(o.w), t(o.h)),
  flamingo: (L, o) => F.flamingoFloat(L, t(o.x), t(o.y)),
  ring: (L, o) => F.ringFloat(L, t(o.x), t(o.y)),
  umbrella: (L, o) => F.umbrella(L, t(o.x), t(o.y), t(o.r)),
  cafe: (L, o) => F.cafeSet(L, t(o.x), t(o.y)),
  lounger: (L, o) => F.lounger(L, t(o.x), t(o.y)),
  planter: (L, o) => F.planterBox(L, t(o.x), t(o.y), t(o.w)),
  swing: (L, o) => {
    F.swingFrame(L, t(o.x), t(o.y), t(o.w));
    F.bench(L, t(o.x) + 6, t(o.y) + 14, t(o.w) - 14);
  },
  vegBed: (L, o) => F.vegBed(L, t(o.x), t(o.y), t(o.w), t(o.h)),
  doghouse: (L, o) => F.doghouse(L, t(o.x), t(o.y)),
  swingFrame: (L, o) => F.swingFrame(L, t(o.x), t(o.y), t(o.w)),
  shed: (L, o) => F.shed(L, t(o.x), t(o.y), t(o.w), t(o.h)),
  firewood: (L, o) => F.firewood(L, t(o.x), t(o.y)),
  bench: (L, o) => F.bench(L, t(o.x), t(o.y), t(o.w)),
  mailbox: (L, o) => F.mailbox(L, t(o.x), t(o.y)),
  doormat: (L, o) => F.rug(L, t(o.x), t(o.y), t(o.w), t(o.h), ['r2', 'r1', 'r3'], 'plain'),
};

export function paint(plan) {
  const W = M.WIDTH * TILE;
  const H = M.HEIGHT * TILE;
  const floor = new Layer(W, H);
  const walls = new Layer(W, H);
  const objects = new Layer(W, H);
  const overhead = new Layer(W, H);
  const at = (x, y) => (x < 0 || y < 0 || x >= M.WIDTH || y >= M.HEIGHT ? { kind: 'out' } : plan[y][x]);

  // Ground: dark beyond the fence, lawn inside it and down to the sidewalk.
  T.darkGround(floor, 0, 0, W, H);
  T.grass(floor, t(M.FENCE.left), t(M.FENCE.top), t(M.FENCE.right + 1), t(56));
  for (const [kind, x0, y0, x1, y1] of M.GROUND) {
    const r = [t(x0), t(y0), t(x1 + 1), t(y1 + 1)];
    if (kind === 'driveway') T.paving(floor, ...r, ['cc1', 'cc3', 'm2'], 16);
    if (kind === 'poolDeck') T.paving(floor, ...r, ['pd1', 'pd2', 'pd3'], 16);
    if (kind === 'wooddeck') T.woodDeck(floor, ...r);
    if (kind === 'porch') T.FLOORS.porch(floor, ...r);
    if (kind === 'path') T.paving(floor, ...r, ['ps1', 'ps2', 'ps3'], 16);
    if (kind === 'sidewalk') T.sidewalk(floor, ...r);
    if (kind === 'road') T.road(floor, ...r);
    if (kind === 'steps') {
      for (let y = r[1]; y < r[3]; y++) floor.hl(r[0], y, r[2] - r[0], (y - r[1]) % 8 === 0 ? 'K' : (y - r[1]) % 8 === 1 ? 'kt3' : 'kt2');
    }
  }
  for (const [x, y] of M.STEPPING_STONES) T.steppingStone(floor, t(x) + 2, t(y) + 3);

  // Interior floors and the faces of north walls.
  for (let y = 0; y < M.HEIGHT; y++)
    for (let x = 0; x < M.WIDTH; x++) {
      const c = plan[y][x];
      if (c.kind !== 'floor') continue;
      T.FLOORS[c.floor](floor, t(x), t(y), t(x + 1), t(y + 1));
      if (at(x, y - 1).kind === 'wall') T.wallFace(floor, x, y);
    }

  // Walls, windows and doorways.
  const isWall = (x, y) => at(x, y).kind === 'wall';
  for (let y = 0; y < M.HEIGHT; y++)
    for (let x = 0; x < M.WIDTH; x++) if (plan[y][x].kind === 'wall') T.wallTile(walls, x, y, isWall);
  for (let y = 0; y < M.HEIGHT; y++)
    for (let x = 0; x < M.WIDTH; x++) {
      const c = plan[y][x];
      if (!c.window) continue;
      const horizontal = isWall(x - 1, y) || isWall(x + 1, y);
      T.wallWindow(walls, t(x), t(y), TILE, horizontal);
    }
  M.DOORS.forEach((d) => {
    const [x0, y0, x1, y1] = d.rect;
    const horizontal = x1 - x0 >= y1 - y0;
    if (d.kind === 'garage') T.garageDoor(walls, t(x0), t(y0), t(x1 - x0 + 1));
    else if (horizontal) T.doorway(walls, t(x0), t(y0), t(x1 - x0 + 1), true);
    else T.doorway(walls, t(x0), t(y0), t(y1 - y0 + 1), false);
  });

  // Flowers sit on the ground under everything else.
  M.FLOWER_PATCHES.forEach(([x, y], i) => F.flowerPatch(objects, t(x), t(y), undefined, 7, i + 1));

  // Fences: wooden rails top and sides, a low stone wall with gates along the front.
  const fx0 = t(M.FENCE.left);
  const fx1 = t(M.FENCE.right + 1);
  T.fenceH(objects, fx0, fx1, t(M.FENCE.top));
  T.fenceV(objects, fx0, t(M.FENCE.top), t(M.FENCE.bottom + 1));
  T.fenceV(objects, t(M.FENCE.right), t(M.FENCE.top), t(M.FENCE.bottom + 1));
  const gateSpans = M.FENCE.gates.map((g) => [t(g.rect[0]), t(g.rect[2] + 1)]).sort((a, b) => a[0] - b[0]);
  let cursor = fx0;
  for (const [g0, g1] of gateSpans) {
    T.fenceH(objects, cursor, g0, t(M.FENCE.bottom), true);
    T.openGate(objects, g0, t(M.FENCE.bottom), g1 - g0);
    cursor = g1;
  }
  T.fenceH(objects, cursor, fx1, t(M.FENCE.bottom), true);
  const pillars = new Set([fx0, fx1 - 12]);
  for (const [g0, g1] of gateSpans) {
    pillars.add(g0 - 12);
    pillars.add(g1);
  }
  for (let x = fx0 + 96; x < fx1 - 48; x += 112) if (![...pillars].some((p) => Math.abs(p - x) < 40)) pillars.add(x);
  for (const x of pillars) T.stonePillar(objects, x, t(M.FENCE.bottom) - 6);
  for (let x = fx0 + 64; x < fx1 - 32; x += 128) T.stonePillar(objects, x, t(M.FENCE.top) - 6, 20);

  // Furniture and props, in list order (rugs first, then what stands on them).
  for (const o of M.OBJECTS) {
    if (o.type === 'pergola') F.pergola(objects, overhead, t(o.x), t(o.y), t(o.w), t(o.h));
    else PAINTERS[o.type]?.(objects, o);
  }
  M.BUSHES.forEach(([x, y, r, flowers], i) => F.bush(objects, t(x), t(y), Math.round(r * BUSH_SCALE), flowers, i + 7));
  for (const [kind, x, y] of M.LAMPS) (kind === 'post' ? F.lampPost : F.wallLantern)(objects, t(x), t(y));
  M.TREES.forEach(([x, y, r], i) => F.tree(objects, overhead, t(x), t(y), Math.round(r * 1.25), i + 3));

  return { floor, walls, objects, overhead };
}

export { PAINTERS };
