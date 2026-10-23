// Luxury Cruise, B1 (base floor), traced from public/reference/cruise-b1-reference.png. The
// reference is 1536 x 1024: 96 x 64 tiles at the estate's 16 px per tile, so tile coordinates
// are reference pixels / 16. Boxes are [x0, y0, x1, y1] in tiles, end exclusive.
// Built by scripts/generate-museum.mjs (npm run cruise). F1 and F2 get their own layout files;
// stairwells name their destination deck and arrival point.

export const NAME = 'Luxury Cruise B1';
export const REFERENCE = 'public/reference/cruise-b1-reference.png';
export const WIDTH = 96;
export const HEIGHT = 64;
export const FOLIAGE = false;

/** UI and room plaques painted into the reference, filled from the art beside them. */
export const LABELS = [
  { box: [0.6, 0.6, 35.8, 9.2], from: 'down', span: 1.0 }, // title panel (over the ocean)
  { box: [51.4, 0.6, 95.6, 10.0], from: 'down', span: 0.5 }, // deck selector panel
  { box: [27.2, 18.5, 32.2, 20.3], from: 'down', span: 0.8 }, // STORAGE
  { box: [14.3, 28.3, 20.7, 30.5], from: 'down', span: 0.8 }, // CARGO HOLD
  { box: [40.5, 18.9, 52.4, 20.8], from: 'up', span: 0.8 }, // CREW QUARTERS
  { box: [64.5, 18.9, 71.6, 20.9], from: 'down', span: 0.8 }, // LOCKER ROOM
  { box: [80.0, 19.8, 86.0, 21.8], from: 'up', span: 0.6 }, // LAUNDRY
  { box: [52.7, 29.2, 57.1, 33.5], from: 'up', span: 1.6 }, // STAIRS TO F1 (main), and its arrow
  { box: [64.7, 51.4, 68.9, 55.1], from: 'up', span: 1.6 }, // STAIRS TO F1 (aft), and its arrow
  { box: [36.3, 43.9, 43.5, 45.7], from: 'up', span: 0.8 }, // ENGINE ROOM
  { box: [62.7, 35.3, 69.7, 37.3], from: 'up', span: 0.8 }, // MAINTENANCE
  { box: [80.6, 33.4, 88.0, 35.6], from: 'right', span: 1.6 }, // FUEL STORAGE
  { box: [77.7, 47.9, 86.5, 50.1], from: 'left', span: 1.2 }, // WATER PUMP ROOM
];

/**
 * The playable deck: inside the hull. The bow is an ellipse, the rest a rectangle, plus the
 * cargo loading ramp in the bow. Everything outside (hull plating, ocean) is solid.
 */
export function inside(x, y) {
  if (x >= 1.2 && x < 7 && y >= 28.2 && y < 33.8) return true; // loading ramp
  if (x >= 30) return x < 92.6 && y >= 12.4 && y < 55.6;
  const dx = (x - 30) / 26;
  const dy = (y - 33) / 21;
  return dx * dx + dy * dy < 1 && y >= 12.4 && y < 55.6;
}

/** Rooms, for the HUD's area name (all indoors). Later entries win where they overlap. */
export const ROOMS = [
  { name: 'Corridor', box: [1, 11.4, 93, 56.4] },
  { name: 'Cargo Hold', box: [1, 18.4, 25.6, 48.2] },
  { name: 'Cargo Store', box: [8, 48.2, 26.4, 56] },
  { name: 'Storage Room', box: [26.4, 12.4, 33.4, 23.2] },
  { name: 'Crew Quarters', box: [37.2, 12.4, 57.8, 23.2] },
  { name: 'Locker Room', box: [63.4, 12.4, 73.4, 23.2] },
  { name: 'Laundry', box: [74.2, 12.4, 92.6, 23.4] },
  { name: 'Engine Room', box: [26.4, 29, 57.4, 55.6] },
  { name: 'Main Stairwell', box: [51.6, 24.6, 57.2, 33.8] },
  { name: 'Maintenance', box: [58.4, 29, 73.6, 44.6] },
  { name: 'Fuel Storage', box: [78.6, 25.2, 92.6, 44.8] },
  { name: 'Water Pump Room', box: [70, 45.8, 92.6, 55.6] },
  { name: 'Aft Stairwell', box: [64.8, 45.6, 69.2, 55.6] },
];
export const ZONES = [{ name: 'Open Sea', box: [0, 0, 96, 64] }];
export const OFF_LIMITS = ['Open Sea'];

/** Interior walls (the hull is handled by inside()), with gaps for the doorways. */
export const WALLS = [
  [8, 17.6, 25.6, 18.4], // cargo hold, north
  [25.4, 12.4, 26.4, 25.8], // storage | cargo (door to the corridor below, 25.8-28.4)
  [25.6, 28.4, 26.4, 42.2], // cargo | engine room (door 42.2-44.4)
  [25.6, 44.4, 26.4, 48.2],
  [8, 47.2, 22.6, 48.2], // cargo hold, south (door to the cargo store 22.6-24.2)
  [24.2, 47.2, 26.4, 48.2],
  [26.4, 48.2, 27.2, 55.6], // cargo store | engine room
  [26.4, 23.2, 28.4, 24.2], // storage, south (door 28.4-29.8)
  [29.8, 23.2, 33.6, 24.2],
  [33.0, 12.4, 33.6, 24.2], // storage, east
  [36.4, 12.4, 37.2, 24.2], // crew quarters, west
  [57.8, 12.4, 58.6, 24.2], // crew quarters, east
  [37.2, 23.2, 46.6, 24.2], // crew quarters, south (door 46.6-48.4)
  [48.4, 23.2, 57.8, 24.2],
  [62.6, 12.4, 63.4, 24.2], // locker room, west
  [73.4, 12.4, 74.2, 24.2], // locker room | laundry
  [63.4, 23.2, 65.6, 24.2], // locker room, south (door 65.6-67.6)
  [67.6, 23.2, 73.4, 24.2],
  [74.2, 23.4, 75.6, 24.4], // laundry, south (door 75.6-78)
  [78, 23.4, 92.6, 24.4],
  [26.4, 28.2, 32.0, 29.0], // corridor | engine room (doors 32-34, 40.6-42.6)
  [34.0, 28.2, 40.6, 29.0],
  [42.6, 28.2, 50.8, 29.0],
  [50.8, 28.2, 51.6, 35.0], // main stairwell
  [57.2, 28.2, 58.0, 35.0],
  [51.6, 33.8, 57.2, 35.0],
  [57.4, 35.0, 58.4, 47.6], // engine room | maintenance (passage 47.6-50 into the red corridor)
  [57.4, 50.0, 58.4, 55.6],
  [58.0, 28.2, 60.8, 29.0], // maintenance, north (door 60.8-62.6)
  [62.6, 28.2, 74.4, 29.0],
  [73.6, 29.0, 74.4, 38.4], // maintenance, east (door 38.4-40.4)
  [73.6, 40.4, 74.4, 45.6],
  [58.4, 44.6, 58.8, 45.6], // maintenance, south (to the red corridor 58.8-61, aft stairs 64.8-68.4)
  [61.0, 44.6, 64.8, 45.6],
  [68.4, 44.6, 74.4, 45.6],
  [64.0, 45.6, 64.8, 55.6], // aft stairwell
  [69.2, 45.6, 70.0, 55.6],
  [77.8, 24.4, 78.6, 35.4], // fuel storage, west (door 35.4-37.8)
  [77.8, 37.8, 78.6, 45.8],
  [78.6, 24.4, 92.6, 25.2], // fuel storage, north
  [78.6, 44.8, 92.6, 45.8], // fuel storage | water pump room
];

/** Furniture, cargo and machinery that block movement. */
export const SOLIDS = [
  // Crate alcove along the hull above the cargo hold (sealed by stacked cargo)
  [8, 12, 25.4, 17.6],
  // Cargo hold
  [11.4, 18.4, 19.4, 20.2], // shelving along the north wall
  [9.2, 21.6, 11.6, 24.0],
  [12.0, 22.0, 16.4, 26.8], // big crate stack
  [20.6, 20.4, 23.0, 24.4],
  [6.4, 23.6, 8.2, 28.0],
  [7.8, 27.0, 9.4, 29.2],
  [10.0, 28.6, 11.8, 31.2],
  [21.0, 29.6, 25.4, 32.8], // container racks by the east wall
  [21.0, 36.0, 25.4, 39.8],
  [9.4, 34.6, 11.6, 41.6],
  [12.4, 41.4, 17.8, 47.2], // tarp-covered cargo
  [20.2, 42.0, 23.6, 44.4],
  [14.4, 32.4, 17.6, 35.6], // forklift
  // Cargo store
  [18.6, 48.6, 26.2, 55.6],
  // Storage room
  [26.6, 13.4, 32.8, 16.6],
  [26.6, 16.6, 27.6, 23.2],
  [31.6, 16.6, 32.8, 23.2],
  // Crew quarters
  [39.2, 14.2, 56.6, 17.4], // bunks along the north wall
  [39.2, 17.4, 42.0, 19.4],
  [53.2, 17.4, 56.4, 19.4],
  [37.2, 13.4, 39.4, 23.2], // shelves and lockers, west
  [56.2, 13.4, 57.8, 23.2], // shelves, east
  [39.4, 20.8, 46.4, 23.2], // bunks and crates, south
  [48.4, 20.8, 56.2, 23.2],
  // Locker room
  [64.2, 14.2, 70.0, 18.4], // lockers
  [70.0, 14.0, 71.6, 18.0],
  [63.4, 20.6, 65.6, 23.2],
  [68.6, 20.8, 73.2, 23.2],
  // Laundry
  [76.2, 14.2, 80.2, 19.6], // linen shelves
  [80.4, 14.6, 83.0, 17.8],
  [84.6, 15.2, 89.8, 18.8], // washers and dryers
  [90.2, 15.0, 92.4, 18.4],
  [91.0, 19.6, 92.6, 23.4],
  [86.6, 20.8, 91.0, 23.2], // folding counter
  [80.0, 21.4, 85.0, 23.2],
  // Engine room
  [31.6, 39.0, 38.2, 54.2], // the two engines
  [42.2, 39.0, 48.6, 54.2],
  [38.6, 29.2, 40.4, 35.2], // exhaust stack
  [27.6, 29.4, 31.0, 33.6], // red machinery
  [42.6, 29.2, 44.2, 32.4],
  [48.6, 36.0, 51.2, 52.0], // red pipe bank
  [52.4, 40.0, 56.0, 48.6], // blue pump machinery
  [27.2, 54.2, 57.4, 55.6], // floor pipes along the hull
  // Maintenance
  [65.0, 29.6, 72.0, 32.6], // shelves and parts counter
  [71.6, 32.6, 73.4, 38.0],
  [69.6, 40.4, 73.4, 44.4], // workbench
  [58.6, 34.0, 60.0, 44.6], // gauge panel
  [60.8, 29.6, 62.6, 33.6],
  [61.4, 43.2, 63.0, 44.6],
  // Fuel storage
  [81.6, 28.4, 90.2, 32.0], // fuel tanks
  [81.6, 36.0, 90.2, 39.8],
  [81.6, 40.2, 90.2, 43.6],
  [79.0, 25.2, 92.6, 26.2], // pipes along the north wall
  [79.0, 26.2, 82.0, 30.6],
  [79.0, 32.0, 82.0, 34.6],
  [90.2, 26.2, 92.6, 34.6],
  // Water pump room
  [71.0, 46.0, 73.6, 49.2], // crates
  [71.0, 49.2, 74.4, 54.6], // blue tank
  [77.2, 50.2, 82.0, 52.6], // pump
  [84.6, 50.4, 86.6, 54.0], // control cabinet
  [88.8, 46.0, 90.8, 54.6], // riser pipe
  [76.0, 46.0, 88.0, 47.2], // pipes along the north wall
  [74.4, 53.0, 92.0, 55.6], // floor pipes
];

/** Doors in the doorway gaps: steel leaves (drawn when shut) that start closed. */
const door = (id, name, box) => ({ id, name, box, side: true });
export const DOORS = [
  door('door-cargo', 'cargo hold door', [25.4, 25.8, 26.4, 28.4]),
  door('door-cargo-engine', 'engine room door', [25.6, 42.2, 26.4, 44.4]),
  door('door-cargo-store', 'cargo store door', [22.6, 47.2, 24.2, 48.2]),
  door('door-storage', 'storage door', [28.4, 23.2, 29.8, 24.2]),
  door('door-crew', 'crew quarters door', [46.6, 23.2, 48.4, 24.2]),
  door('door-locker', 'locker room door', [65.6, 23.2, 67.6, 24.2]),
  door('door-laundry', 'laundry door', [75.6, 23.4, 78.0, 24.4]),
  door('door-engine-1', 'engine room door', [32.0, 28.2, 34.0, 29.0]),
  door('door-engine-2', 'engine room door', [40.6, 28.2, 42.6, 29.0]),
  door('door-maint-n', 'maintenance door', [60.8, 28.2, 62.6, 29.0]),
  door('door-maint-e', 'maintenance door', [73.6, 38.4, 74.4, 40.4]),
  door('door-fuel', 'fuel storage door', [77.8, 35.4, 78.6, 37.8]),
];

/**
 * Stairwells up to F1. `zone` is where E works; `to` names the destination deck and its
 * arrival point. F1 isn't built yet, so the game says so instead of moving anyone.
 */
export const STAIRS = [
  { id: 'stairs-main', name: 'main stairwell', zone: [51.6, 24.6, 57.2, 33.8], to: { deck: 'cruise-f1', arrive: 'stairs-main' } },
  { id: 'stairs-aft', name: 'aft stairwell', zone: [64.8, 45.6, 69.2, 55.6], to: { deck: 'cruise-f1', arrive: 'stairs-aft' } },
];

/** Hiding spots (metadata for a hide mechanic; the game doesn't have one yet). */
export const HIDING_SPOTS = [
  { id: 'hide-crates', room: 'Cargo Hold', box: [17.8, 44.4, 20.2, 47.2] },
  { id: 'hide-tarp', room: 'Cargo Hold', box: [11.6, 36, 14.4, 41.2] },
  { id: 'hide-lockers', room: 'Locker Room', box: [64.2, 18.4, 70, 19.4] },
  { id: 'hide-bunks', room: 'Crew Quarters', box: [42, 17.4, 53, 18.4] },
  { id: 'hide-engines', room: 'Engine Room', box: [38.2, 39, 42.2, 54.2] },
  { id: 'hide-tanks', room: 'Fuel Storage', box: [90.2, 36, 92.6, 43.6] },
  { id: 'hide-linen', room: 'Laundry', box: [80.2, 17.8, 83, 19.6] },
];

/** Loot (with a value) and things to look at. rect is [x0, y0, x1, y1] in tiles, inclusive. */
export const INTERACTABLES = [
  { id: 'manifest', rect: [18, 38, 18, 38], name: "smuggler's manifest", loot: 300, text: 'A manifest listing cargo that is definitely not on the official books.' },
  { id: 'toolchest', rect: [29, 21, 29, 21], name: 'gold-plated tool chest', loot: 180, text: 'A gold-plated tool chest. Someone on this ship has expensive taste.' },
  { id: 'watch', rect: [47, 19, 47, 19], name: "captain's watch", loot: 420, text: "The captain's watch, left on a bunk. Very careless." },
  { id: 'stash', rect: [66, 19, 66, 19], name: 'locker stash', loot: 260, text: 'A wad of cash taped inside a locker.' },
  { id: 'wallet', rect: [80, 19, 80, 19], name: "passenger's wallet", loot: 150, text: 'A wallet lost in the laundry. Finders keepers.' },
  { id: 'goldbars', rect: [40, 46, 40, 46], name: 'gold bars', loot: 900, text: 'Gold bars hidden between the engines. That explains the rumbling.' },
  { id: 'drillbit', rect: [66, 40, 66, 40], name: 'diamond drill bit', loot: 350, text: 'An industrial diamond drill bit. Real diamonds, too.' },
  { id: 'ledger', rect: [80, 35, 80, 35], name: 'fuel ledger', loot: 200, text: 'A ledger of off-the-books fuel sales.' },
  { id: 'pearls', rect: [79, 48, 79, 48], name: 'smuggled pearls', loot: 650, text: 'A pouch of pearls hidden behind the pumps.' },
  // Stairwells (handled specially by the game: they lead to other decks)
  { id: 'stairs-main', rect: [52, 25, 56, 33], name: 'stairs to F1', text: 'Main Floor (F1) is coming soon.' },
  { id: 'stairs-aft', rect: [65, 46, 68, 54], name: 'stairs to F1', text: 'Main Floor (F1) is coming soon.' },
  { id: 'engines', rect: [32, 38, 37, 38], name: 'engines', text: 'Two huge diesel engines, thrumming away.' },
];

/** Lights: warm in cargo and crew areas, red in the engine room, blue in the pump room. */
export const LIGHTS = [
  { x: 11, y: 20, r: 5, kind: 'soft' }, { x: 19.6, y: 20, r: 5, kind: 'soft' }, { x: 9, y: 41, r: 5, kind: 'soft' },
  { x: 19.6, y: 40.6, r: 5, kind: 'soft' }, { x: 16, y: 33, r: 9, kind: 'soft' },
  { x: 28.6, y: 15, r: 5, kind: 'soft' }, { x: 47, y: 18, r: 9, kind: 'soft' }, { x: 67, y: 18, r: 6, kind: 'soft' },
  { x: 83, y: 18, r: 8, kind: 'soft' }, { x: 40, y: 26, r: 5, kind: 'soft' }, { x: 66, y: 26, r: 5, kind: 'soft' },
  { x: 40, y: 45, r: 10, kind: 'soft' }, { x: 66, y: 37, r: 8, kind: 'soft' }, { x: 85, y: 35, r: 8, kind: 'soft' },
  { x: 81, y: 51, r: 8, kind: 'soft' }, { x: 54.4, y: 29, r: 4, kind: 'lamp' }, { x: 66.6, y: 47, r: 4, kind: 'lamp' },
];

export const SPAWN = { x: 15.5, y: 40.4, facing: 'up' };
