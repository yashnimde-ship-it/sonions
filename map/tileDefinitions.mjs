// Ground, floor, wall, fence and road painters. Patterns are aligned to world
// coordinates and repeat on tile multiples, so identical tiles deduplicate in the
// compiled tileset, the way a hand-made tileset reuses tiles.

import { TILE } from './draw.mjs';

/** Cheap deterministic hash in [0, 1) for texture noise. */
export function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const each = (x0, y0, x1, y1, fn) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) fn(x, y);
};

// ---------- Outdoor terrain ----------

export function grass(L, x0, y0, x1, y1) {
  each(x0, y0, x1, y1, (x, y) => {
    const n = hash(x & 63, y & 63, 1);
    let c = 'g3';
    if (n < 0.1) c = 'g2';
    else if (n > 0.94) c = 'g4';
    L.px(x, y, c);
  });
  // Grass tufts: small light blades on the 64px repeat.
  each(x0, y0, x1, y1, (x, y) => {
    if (hash(x & 63, y & 63, 2) < 0.012) {
      L.px(x, y, 'g4');
      L.px(x - 1, y + 1, 'g4');
      L.px(x + 1, y + 1, 'g5');
      L.px(x, y + 1, 'g2');
    }
  });
}

export function darkGround(L, x0, y0, x1, y1) {
  each(x0, y0, x1, y1, (x, y) => L.px(x, y, hash(x & 31, y & 31, 3) < 0.15 ? 'dg1' : 'dg2'));
}

/** Square paving slabs (driveway, garden paths). */
export function paving(L, x0, y0, x1, y1, [mortar, base, hi], size = 16) {
  each(x0, y0, x1, y1, (x, y) => {
    const row = Math.floor(y / size);
    const ox = row % 2 ? size / 2 : 0;
    const lx = (x + ox) % size;
    const ly = y % size;
    let c = base;
    if (lx === 0 || ly === 0) c = mortar;
    else if (lx === 1 || ly === 1) c = hi;
    else if (hash((x + ox) & 63, y & 63, 4) < 0.05) c = mortar;
    L.px(x, y, c);
  });
}

export function steppingStone(L, x, y, w = 12, h = 10) {
  L.rect(x + 1, y, w - 2, h, 'ps1');
  L.rect(x, y + 1, w, h - 2, 'ps1');
  L.rect(x + 1, y + 1, w - 2, h - 2, 'ps2');
  L.hl(x + 2, y + 1, w - 4, 'ps3');
  L.px(x + w - 3, y + h - 3, 'ps1');
}

export function woodDeck(L, x0, y0, x1, y1) {
  each(x0, y0, x1, y1, (x, y) => {
    const ly = y % 6;
    const seam = (x + Math.floor(y / 6) * 13) % 40 === 0;
    L.px(x, y, ly === 5 || seam ? 'fw2' : ly === 0 ? 'fw5' : 'fw4');
  });
}

export function soil(L, x0, y0, x1, y1) {
  each(x0, y0, x1, y1, (x, y) => L.px(x, y, hash(x & 31, y & 31, 5) < 0.2 ? 'so1' : hash(x & 31, y & 31, 6) < 0.1 ? 'so3' : 'so2'));
}

export function sidewalk(L, x0, y0, x1, y1) {
  each(x0, y0, x1, y1, (x, y) => {
    const lx = x % 48;
    const ly = (y - y0) % 48;
    let c = 'sw2';
    if (lx === 0 || ly === 0) c = 'sw1';
    else if (lx === 1 || ly === 1) c = 'sw3';
    L.px(x, y, c);
  });
  L.hl(x0, y1 - 2, x1 - x0, 'sw1');
  L.hl(x0, y1 - 1, x1 - x0, 'K');
}

export function road(L, x0, y0, x1, y1) {
  each(x0, y0, x1, y1, (x, y) => L.px(x, y, hash(x & 63, y & 63, 7) < 0.08 ? 'rd2' : 'rd1'));
  L.hl(x0, y0 + 2, x1 - x0, 'lane');
  const mid = Math.floor((y0 + y1) / 2) + 4;
  for (let x = x0 + 20; x < x1; x += 96) L.rect(x, mid, 36, 3, 'dash');
}

// ---------- Interior floors ----------

/** Horizontal planks with staggered seams. */
export function woodFloor(L, x0, y0, x1, y1) {
  each(x0, y0, x1, y1, (x, y) => {
    const row = Math.floor(y / 4);
    const ly = y % 4;
    const seam = (x + row * 19) % 32 === 0;
    const tone = hash(Math.floor((x + row * 19) / 32) & 7, row & 15, 8) < 0.5 ? 'wd3' : 'wd4';
    let c = tone;
    if (ly === 3 || seam) c = 'wd2';
    else if (ly === 0 && tone === 'wd4') c = 'wd5';
    L.px(x, y, c);
  });
}

/** Square tiles with grout lines. */
export function tileFloor(L, x0, y0, x1, y1, [grout, base, hi], size = 8) {
  each(x0, y0, x1, y1, (x, y) => {
    const lx = x % size;
    const ly = y % size;
    L.px(x, y, lx === 0 || ly === 0 ? grout : lx === 1 && ly === 1 ? hi : base);
  });
}

export function concrete(L, x0, y0, x1, y1) {
  each(x0, y0, x1, y1, (x, y) => {
    const lx = x % 32;
    const ly = y % 32;
    let c = hash(x & 63, y & 63, 9) < 0.08 ? 'cc3' : 'cc2';
    if (lx === 0 || ly === 0) c = 'cc1';
    L.px(x, y, c);
  });
}

export const FLOORS = {
  wood: (L, ...r) => woodFloor(L, ...r),
  kitchen: (L, ...r) => tileFloor(L, ...r, ['kt1', 'kt2', 'kt3'], 16),
  bluetile: (L, ...r) => tileFloor(L, ...r, ['bt1', 'bt2', 'bt3'], 8),
  whitetile: (L, ...r) => tileFloor(L, ...r, ['wt1', 'wt2', 'wt3'], 8),
  stone: (L, ...r) => tileFloor(L, ...r, ['sb1', 'sb2', 'sb3'], 16),
  concrete: (L, ...r) => concrete(L, ...r),
  porch: (L, ...r) => paving(L, ...r, ['sb1', 'sb2', 'sb3'], 16),
};

// ---------- Walls ----------

/**
 * Thick dark walls seen from above, with a highlight where a wall's top meets open
 * space. `plan` answers whether a tile is a wall.
 */
export function wallTile(L, tx, ty, isWall) {
  const x = tx * TILE;
  const y = ty * TILE;
  L.rect(x, y, TILE, TILE, 'wall');
  if (!isWall(tx, ty - 1)) {
    L.hl(x, y, TILE, 'wallHi');
    L.hl(x, y + 1, TILE, 'wallHi');
  }
  if (!isWall(tx - 1, ty)) L.vl(x, y, TILE, 'wallHi');
  if (!isWall(tx + 1, ty)) L.vl(x + TILE - 1, y, TILE, 'wallLo');
  if (!isWall(tx, ty + 1)) L.hl(x, y + TILE - 1, TILE, 'wallLo');
}

/** The visible face of a north wall, painted on the floor tile just below it. */
export function wallFace(L, tx, ty) {
  const x = tx * TILE;
  const y = ty * TILE;
  L.rect(x, y, TILE, 5, 'face1');
  for (let i = 0; i < TILE; i += 4) L.vl(x + i, y, 5, 'face2');
  L.hl(x, y + 5, TILE, 'faceTrim');
  L.hl(x, y + 6, TILE, 'K');
}

/** A window set into a wall tile run. */
export function wallWindow(L, x, y, w, horizontal) {
  if (horizontal) {
    L.rect(x + 2, y + 5, w - 4, 6, 'm3');
    L.rect(x + 3, y + 6, w - 6, 4, 'w4');
    L.hl(x + 3, y + 7, w - 6, 'lw3');
    for (let i = x + 10; i < x + w - 6; i += 12) L.vl(i, y + 6, 4, 'm2');
  } else {
    L.rect(x + 5, y + 2, 6, w - 4, 'm3');
    L.rect(x + 6, y + 3, 4, w - 6, 'w4');
    L.vl(x + 7, y + 3, w - 6, 'lw3');
  }
}

/**
 * An open doorway: a threshold, door jambs, and the door leaves folded back against
 * the frame. `horizontal` doors sit in north/south walls.
 */
export function doorway(L, x, y, w, horizontal) {
  if (horizontal) {
    L.rect(x, y, w, TILE, 'fw3');
    for (let i = 0; i < w; i += 4) L.vl(x + i, y + 2, 12, 'fw2');
    L.rect(x, y, w, 2, 'K');
    L.rect(x, y + TILE - 2, w, 2, 'fw1');
    // Jambs and folded leaves.
    L.rect(x, y, 3, TILE, 'fw1');
    L.rect(x + w - 3, y, 3, TILE, 'fw1');
    L.rect(x + 3, y + 2, 2, 12, 'fw4');
    L.rect(x + w - 5, y + 2, 2, 12, 'fw4');
    L.px(x + 4, y + 8, 'y2');
    L.px(x + w - 5, y + 8, 'y2');
  } else {
    L.rect(x, y, TILE, w, 'fw3');
    for (let i = 0; i < w; i += 4) L.hl(x + 2, y + i, 12, 'fw2');
    L.rect(x, y, 2, w, 'K');
    L.rect(x + TILE - 2, y, 2, w, 'fw1');
    L.rect(x, y, TILE, 3, 'fw1');
    L.rect(x, y + w - 3, TILE, 3, 'fw1');
    L.rect(x + 2, y + 3, 12, 2, 'fw4');
    L.rect(x + 2, y + w - 5, 12, 2, 'fw4');
  }
}

/** Roll-up garage door, open, with its rail. */
export function garageDoor(L, x, y, w) {
  L.rect(x, y, w, TILE, 'cc2');
  L.rect(x, y, w, 4, 'm2');
  L.hl(x, y, w, 'm3');
  L.hl(x, y + 4, w, 'K');
  for (let i = x; i < x + w; i += 8) L.vl(i, y + 5, 11, 'cc1');
}

// ---------- Fences ----------

export function stonePillar(L, x, y, h = 22) {
  L.box(x, y + 4, 12, h - 4, 'pi2');
  L.vl(x + 1, y + 5, h - 6, 'pi3');
  L.box(x - 1, y, 14, 6, 'pi3');
  L.hl(x, y + 1, 12, 'white');
  L.hl(x + 1, y + h - 2, 10, 'pi1');
}

/** Wooden rail fence running horizontally, posts every 64px with stone pillars. */
export function fenceH(L, x0, x1, y, lowWall = false) {
  if (lowWall) {
    // Stone base with a wooden cap rail, like the front boundary.
    L.rect(x0, y + 8, x1 - x0, 10, 'pi1');
    for (let x = x0; x < x1; x += 10) L.vl(x, y + 9, 8, 'K');
    L.hl(x0, y + 9, x1 - x0, 'pi2');
    L.rect(x0, y + 4, x1 - x0, 5, 'fe2');
    L.hl(x0, y + 4, x1 - x0, 'fe3');
    L.hl(x0, y + 3, x1 - x0, 'K');
    L.hl(x0, y + 18, x1 - x0, 'K');
  } else {
    L.rect(x0, y + 3, x1 - x0, 4, 'fe2');
    L.rect(x0, y + 10, x1 - x0, 4, 'fe2');
    L.hl(x0, y + 3, x1 - x0, 'fe3');
    L.hl(x0, y + 10, x1 - x0, 'fe3');
    L.hl(x0, y + 7, x1 - x0, 'K');
    L.hl(x0, y + 14, x1 - x0, 'K');
    for (let x = x0; x < x1; x += 16) {
      L.rect(x, y, 4, 16, 'fe1');
      L.vl(x + 1, y + 1, 14, 'fe2');
    }
  }
}

export function fenceV(L, x, y0, y1) {
  L.rect(x + 3, y0, 4, y1 - y0, 'fe2');
  L.rect(x + 9, y0, 4, y1 - y0, 'fe2');
  L.vl(x + 3, y0, y1 - y0, 'fe3');
  L.vl(x + 7, y0, y1 - y0, 'K');
  L.vl(x + 13, y0, y1 - y0, 'K');
  for (let y = y0; y < y1; y += 16) {
    L.rect(x + 1, y, 14, 4, 'fe1');
    L.hl(x + 2, y + 1, 12, 'fe2');
  }
}

/** A wooden double gate, swung open. */
export function openGate(L, x, y, w) {
  L.rect(x, y + 6, 4, 14, 'fe1');
  L.rect(x + w - 4, y + 6, 4, 14, 'fe1');
  for (let i = 0; i < 3; i++) {
    L.rect(x + 4, y + 2 + i * 6, 4, 4, 'fe3');
    L.rect(x + w - 8, y + 2 + i * 6, 4, 4, 'fe3');
  }
}
