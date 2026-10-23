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
  { box: [82.3, 32.8, 89.3, 34.7], from: 'down', span: 1.0 }, // FUEL STORAGE (the floor between the tanks)
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
  { name: 'Engine Room', box: [26.4, 29, 58.6, 55.6] },
  { name: 'Generator Room', box: [59.4, 45.6, 62.6, 55.6] },
  { name: 'Main Stairwell', box: [52.0, 24.6, 57.4, 33.6] },
  { name: 'Maintenance', box: [58.4, 29, 73.6, 44.6] },
  { name: 'Fuel Storage', box: [78.6, 25.2, 92.6, 44.8] },
  { name: 'Water Pump Room', box: [70, 45.8, 92.6, 55.6] },
  { name: 'Aft Stairwell', box: [63.8, 45.6, 68.4, 55.6] },
];
export const ZONES = [{ name: 'Open Sea', box: [0, 0, 96, 64] }];
export const OFF_LIMITS = ['Open Sea'];

/** Interior walls (the hull is handled by inside()), with gaps for the doorways. */
export const WALLS = [
  // ---- Doorway gaps, sealed; each door opens exactly its drawn frame ----
  [24.8, 25.8, 26.4, 28.4], // sealed: cargo hold door (re-opened at its drawn frame)
  [25.2, 42.2, 26.4, 44.4], // sealed: engine room door (re-opened at its drawn frame)
  [22.6, 47.2, 24.2, 48.2], // sealed: cargo store door (re-opened at its drawn frame)
  [28.4, 23.2, 29.8, 24.2], // sealed: storage door (re-opened at its drawn frame)
  [46.6, 23.2, 48.4, 24.2], // sealed: crew quarters door (re-opened at its drawn frame)
  [65.6, 23.2, 67.6, 24.2], // sealed: locker room door (re-opened at its drawn frame)
  [75.6, 23.4, 78.0, 24.4], // sealed: laundry door (re-opened at its drawn frame)
  [30.6, 28.2, 32.6, 29.4], // sealed: engine room door (re-opened at its drawn frame)
  [48.4, 28.2, 50.2, 29.4], // sealed: engine room door (re-opened at its drawn frame)
  [62.6, 28.2, 64.6, 29.2], // sealed: maintenance door (re-opened at its drawn frame)
  [73.6, 38.4, 74.4, 40.4], // sealed: maintenance door (re-opened at its drawn frame)
  [58.6, 49.2, 59.4, 52.6], // sealed: generator room hatch (re-opened at its drawn frame)
  [77.0, 35.4, 78.0, 37.8], // sealed: fuel storage door (re-opened at its drawn frame)
  // ---- Cargo hold ----
  [8, 17.6, 25.6, 18.4], // north
  [25.4, 12.4, 26.4, 18.4], // storage, west
  [24.8, 18.4, 26.4, 25.8], // cargo | storage (door to the corridor 25.8-28.4)
  [25.2, 28.4, 26.4, 42.2], // cargo | engine room (door 42.2-44.4)
  [25.2, 44.4, 26.4, 48.2],
  [8, 47.2, 22.6, 48.2], // south (door to the cargo store 22.6-24.2)
  [24.2, 47.2, 26.4, 48.2],
  [26.4, 48.2, 27.2, 55.6], // cargo store | engine room
  // ---- North rooms ----
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
  // ---- Corridor | engine room (doors 30.6-32.6 into the lit foyer, 48.4-50.2) ----
  [26.4, 28.2, 30.6, 29.4],
  [32.6, 28.2, 48.4, 29.4],
  [50.2, 28.2, 51.4, 29.4],
  // ---- Main stairwell: pillars in the corridor, then the stair box ----
  [51.4, 24.2, 52.0, 25.6],
  [57.4, 24.2, 58.2, 25.6],
  [51.4, 28.2, 52.0, 35.0],
  [57.4, 28.2, 58.2, 35.0],
  [52.0, 33.6, 57.4, 35.0],
  // ---- Engine room | maintenance ----
  [57.4, 35.0, 58.4, 45.6],
  // ---- Maintenance ----
  [58.2, 28.2, 62.6, 29.2], // north (door 62.6-64.6)
  [64.6, 28.2, 74.4, 29.2],
  [73.6, 29.2, 74.4, 38.4], // east (door 38.4-40.4)
  [73.6, 40.4, 74.4, 45.6],
  [58.4, 44.6, 64.2, 45.6], // south (the aft stairs come up at 64.2-68.2)
  [68.2, 44.6, 74.4, 45.6],
  // ---- Generator room (behind the engine room) and the aft stairwell ----
  [58.6, 45.6, 59.4, 49.2], // generator room, west (hatch 49.2-52.6)
  [58.6, 52.6, 59.4, 55.6],
  [62.6, 45.6, 63.8, 55.6], // generator room | aft stairwell
  [68.4, 45.6, 69.4, 55.6], // aft stairwell | water pump room
  // ---- Fuel storage ----
  [77.0, 24.4, 78.0, 35.4], // west (door 35.4-37.8)
  [77.0, 37.8, 78.0, 45.6],
  [78.0, 24.4, 92.6, 25.2], // north
  [77.0, 44.6, 92.6, 45.6], // fuel storage | water pump room
];

/** Furniture, cargo and machinery that block movement. */
export const SOLIDS = [
  // Crate alcove along the hull above the cargo hold (sealed by stacked cargo)
  [8, 12, 25.4, 17.6],
  // Cargo hold
  [11.4, 18.4, 19.4, 20.2], // shelving along the north wall
  [9.0, 21.8, 11.6, 24.4],
  [11.8, 21.6, 16.4, 26.9], // big crate stack
  [20.4, 20.4, 23.4, 24.6],
  [6.2, 23.4, 8.2, 28.0],
  [7.6, 26.4, 9.4, 29.2],
  [10.0, 28.6, 11.8, 31.2],
  [20.8, 29.4, 24.6, 32.8], // container racks by the east wall
  [21.2, 32.8, 22.4, 35.8],
  [20.8, 35.8, 24.6, 40.0],
  [9.0, 35.4, 11.8, 41.6],
  [12.4, 41.6, 18.0, 47.0], // tarp-covered cargo
  [20.0, 42.0, 23.6, 44.6],
  [14.2, 32.6, 17.8, 36.0], // forklift
  // Red wall lights on the corridor's south wall
  [38.4, 27.4, 39.6, 28.2],
  // Cargo store
  [15.4, 49.0, 17.8, 51.4],
  [19.4, 49.4, 25.4, 53.8],
  // Storage room
  [26.6, 13.4, 32.8, 16.6],
  [26.6, 16.6, 27.6, 23.2],
  [31.6, 16.6, 32.8, 23.2],
  // Crew quarters
  [39.2, 14.2, 56.6, 17.4], // bunks along the north wall
  [39.4, 17.4, 42.0, 21.0],
  [53.2, 17.6, 56.4, 19.6],
  [37.2, 13.4, 38.8, 23.2], // plant and shelves, west
  [56.4, 13.4, 57.8, 23.2], // shelves, east
  [38.8, 21.0, 46.4, 23.2], // bunks and crates, south
  [48.4, 21.0, 57.8, 23.2],
  // Locker room
  [64.0, 14.2, 69.8, 18.0], // lockers
  [70.0, 14.0, 71.2, 18.0],
  [63.4, 20.8, 65.4, 23.2],
  [68.6, 20.8, 73.2, 23.2],
  // Laundry
  [75.4, 14.2, 80.2, 19.6], // linen shelves
  [80.2, 14.6, 83.4, 18.0],
  [83.4, 15.2, 90.0, 19.0], // washers and dryers
  [90.2, 15.0, 92.4, 18.6],
  [90.4, 18.6, 92.6, 23.4],
  [86.0, 21.0, 90.4, 23.2], // folding counter
  [80.4, 21.4, 85.0, 23.2],
  [77.0, 20.4, 78.4, 22.0], // chair
  // Engine room: the gallery
  [27.6, 29.4, 30.4, 33.4], // red machinery
  [33.0, 29.4, 33.8, 32.0], // panel
  [34.6, 29.6, 36.6, 32.2], // tanks
  [38.0, 29.4, 40.0, 35.8], // exhaust stack
  [41.0, 29.4, 45.2, 32.2], // tanks
  [45.8, 29.4, 47.0, 32.2], // panel
  [29.6, 33.8, 36.4, 34.8], // railings (gaps at 36.4-38 and 40-41.6)
  [41.6, 33.8, 46.8, 34.8],
  // Engine room: the floor
  [27.2, 35.6, 28.6, 41.6], // pipe along the wall (gap at the cargo door)
  [27.2, 45.0, 28.6, 53.6],
  [31.6, 39.4, 37.6, 54.2], // left engine
  [39.8, 39.0, 42.2, 54.2], // machinery between the engines (walkway 37.6-39.8)
  [42.2, 39.4, 48.4, 54.2], // right engine
  [48.6, 36.0, 51.2, 52.4], // red pipe bank
  [52.4, 40.0, 56.0, 48.6], // pump machinery
  [51.2, 50.0, 56.4, 54.2], // blue pipes
  [27.2, 54.2, 58.6, 55.6], // floor pipes along the hull
  // Maintenance
  [64.8, 29.4, 72.0, 34.0], // shelves and the parts counter in front of them
  [71.8, 29.6, 73.4, 37.6], // tall cabinet
  [69.4, 40.4, 73.4, 44.4], // workbench
  [58.6, 34.0, 59.8, 44.4], // control panels
  [60.4, 29.4, 62.4, 33.4], // shelf
  [61.4, 43.0, 62.8, 44.6], // drum
  [66.0, 42.8, 67.2, 44.4], // blue drum
  // Generator room
  [59.4, 45.6, 62.6, 48.4],
  [61.6, 48.4, 62.6, 49.6],
  // Fuel storage
  [78.0, 25.2, 92.6, 26.6], // pipes along the north wall
  [78.0, 26.6, 82.0, 31.0], // crates and red pipe bends, north-west
  [79.0, 32.0, 80.8, 35.8], // control cabinet
  [82.0, 28.0, 90.2, 31.8], // fuel tanks
  [82.0, 36.0, 90.2, 39.6],
  [82.0, 40.0, 90.2, 43.6],
  [80.6, 37.4, 82.0, 41.6], // red pipe bends, west
  [78.0, 38.6, 79.4, 44.6], // yellow pipes, lower west
  [90.2, 26.6, 92.6, 34.6], // red pipes, east
  [90.2, 36.0, 92.6, 44.6], // yellow pipes, east
  // Water pump room
  [70.4, 46.0, 73.4, 49.4], // crates
  [70.4, 49.4, 73.8, 54.6], // blue tank
  [76.0, 45.6, 87.4, 47.4], // pipes along the north wall
  [76.8, 50.2, 81.8, 53.0], // pump and valves
  [81.6, 51.0, 82.6, 52.6], // gauge
  [84.4, 50.4, 86.6, 53.4], // control cabinet
  [88.6, 45.6, 92.6, 55.6], // riser pipe and wall pipes
  [74.4, 53.2, 92.6, 55.6], // floor pipes
];

/** Steel sliding doors, fitted to the frames drawn in the art. They start closed. */
// `box` is the frame as drawn (where the door sprite goes); `hit` is the doorway through the
// whole wall (what it blocks when shut).
const door = (id, name, box, hit) => ({ id, name, box, hit, side: true, style: 'metal' });
export const DOORS = [
  door('door-cargo', 'cargo hold door', [24.8125, 25.75, 26.4375, 27.875], [24.8, 25.812, 26.4, 27.875]),
  door('door-cargo-engine', 'engine room door', [25.4375, 42.0, 26.75, 44.5], [25.2, 42.0, 26.75, 44.5]),
  door('door-cargo-store', 'cargo store door', [22.6875, 47.25, 24.0625, 48.3125], [22.812, 47.2, 24.0, 48.25]),
  door('door-storage', 'storage door', [29.25, 22.9375, 31.25, 24.1875], [29.25, 22.938, 31.25, 24.2]),
  door('door-crew', 'crew quarters door', [47.75, 23.375, 49.875, 24.4375], [47.75, 23.2, 49.875, 24.438]),
  door('door-locker', 'locker room door', [66.875, 23.375, 69.375, 24.4375], [66.875, 23.2, 69.375, 24.438]),
  door('door-laundry', 'laundry door', [74.9375, 23.25, 77.5, 24.4375], [74.938, 23.25, 77.5, 24.438]),
  door('door-engine-1', 'engine room door', [31.0, 28.25, 32.6875, 29.375], [31.0, 28.2, 32.688, 29.4]),
  door('door-engine-2', 'engine room door', [48.5625, 28.25, 50.375, 29.375], [48.562, 28.2, 50.375, 29.4]),
  door('door-maint-n', 'maintenance door', [61.25, 28.25, 64.375, 29.375], [61.25, 28.2, 64.375, 29.375]),
  door('door-maint-e', 'maintenance door', [73.4375, 38.125, 74.375, 40.5], [73.562, 38.25, 74.438, 40.375]),
  door('door-generator', 'generator room hatch', [58.6875, 49.0, 59.5625, 52.625], [58.6, 48.938, 59.562, 52.5]),
  door('door-fuel', 'fuel storage door', [77.5625, 36.125, 78.6875, 38.5], [77.0, 36.062, 78.375, 38.375]),
];

/**
 * Stairwells up to F1. `zone` is where E works; `to` names the destination deck and its
 * arrival point. F1 isn't built yet, so the game says so instead of moving anyone.
 */
export const STAIRS = [
  { id: 'stairs-main', name: 'main stairwell', zone: [52.0, 24.6, 57.4, 33.6], to: { deck: 'cruise-f1', arrive: 'stairs-main' } },
  { id: 'stairs-aft', name: 'aft stairwell', zone: [63.8, 45.6, 68.4, 55.6], to: { deck: 'cruise-f1', arrive: 'stairs-aft' } },
];

/** Hiding spots (metadata for a hide mechanic; the game doesn't have one yet). */
export const HIDING_SPOTS = [
  { id: 'hide-crates', room: 'Cargo Hold', box: [18, 44.6, 20, 47.2] },
  { id: 'hide-tarp', room: 'Cargo Hold', box: [11.6, 36, 14.4, 41.2] },
  { id: 'hide-lockers', room: 'Locker Room', box: [64, 18, 69.8, 19] },
  { id: 'hide-bunks', room: 'Crew Quarters', box: [42, 17.4, 53, 18.4] },
  { id: 'hide-engines', room: 'Engine Room', box: [37.6, 39, 39.8, 54.2] },
  { id: 'hide-tanks', room: 'Fuel Storage', box: [88, 31.8, 90, 36] },
  { id: 'hide-linen', room: 'Laundry', box: [80.2, 17.8, 83, 19.6] },
];

/** Loot (with a value) and things to look at. rect is [x0, y0, x1, y1] in tiles, inclusive. */
export const INTERACTABLES = [
  { id: 'manifest', rect: [18, 38, 18, 38], name: "smuggler's manifest", loot: 300, text: 'A manifest listing cargo that is definitely not on the official books.' },
  { id: 'toolchest', rect: [29, 21, 29, 21], name: 'gold-plated tool chest', loot: 180, text: 'A gold-plated tool chest. Someone on this ship has expensive taste.' },
  { id: 'watch', rect: [47, 19, 47, 19], name: "captain's watch", loot: 420, text: "The captain's watch, left on a bunk. Very careless." },
  { id: 'stash', rect: [66, 19, 66, 19], name: 'locker stash', loot: 260, text: 'A wad of cash taped inside a locker.' },
  { id: 'wallet', rect: [80, 19, 80, 19], name: "passenger's wallet", loot: 150, text: 'A wallet lost in the laundry. Finders keepers.' },
  { id: 'goldbars', rect: [38, 46, 38, 46], name: 'gold bars', loot: 900, text: 'Gold bars hidden between the engines. That explains the rumbling.' },
  { id: 'drillbit', rect: [66, 40, 66, 40], name: 'diamond drill bit', loot: 350, text: 'An industrial diamond drill bit. Real diamonds, too.' },
  { id: 'ledger', rect: [80, 35, 80, 35], name: 'fuel ledger', loot: 200, text: 'A ledger of off-the-books fuel sales.' },
  { id: 'pearls', rect: [79, 48, 79, 48], name: 'smuggled pearls', loot: 650, text: 'A pouch of pearls hidden behind the pumps.' },
  // Stairwells (handled specially by the game: they lead to other decks)
  { id: 'stairs-main', rect: [52, 25, 56, 33], name: 'stairs to F1', text: 'Main Floor (F1) is coming soon.' },
  { id: 'stairs-aft', rect: [64, 46, 67, 54], name: 'stairs to F1', text: 'Main Floor (F1) is coming soon.' },
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
