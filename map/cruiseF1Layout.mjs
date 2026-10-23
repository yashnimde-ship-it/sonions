// Luxury Cruise, F1 (main floor), traced from public/reference/cruise-f1-reference.png (the
// original 1774 x 887 art scaled to 1792 x 896: 112 x 56 tiles at 16 px). Boxes are
// [x0, y0, x1, y1] in tiles, end exclusive. Built by scripts/generate-museum.mjs
// (npm run cruise-f1). Walls come from the art's dark wall bands (AUTO_WALLS) plus WALLS.

export const NAME = 'Luxury Cruise F1';
export const REFERENCE = 'public/reference/cruise-f1-reference.png';
export const WIDTH = 112;
export const HEIGHT = 56;
export const FOLIAGE = false;
export const AUTO_WALLS = { wallLum: 46 };

/** UI and room plaques painted into the art, filled from the art beside them. */
export const LABELS = [
  { box: [0.4, 0.4, 28.6, 6.8], from: 'down', span: 1.0 }, // title panel (over the ocean)
  { box: [24.6, 13.5, 30.6, 15.8], from: 'down', span: 1.0 }, // KITCHEN
  { box: [23.9, 24.1, 31.0, 26.5], from: 'down', span: 1.0 }, // RESTAURANT
  { box: [5.4, 23.7, 12.0, 25.8], from: 'down', span: 1.2 }, // FRONT DECK
  { box: [40.4, 14.9, 43.8, 18.2], from: 'down', span: 1.0 }, // STAIRS TO F2 (left)
  { box: [73.0, 14.9, 76.4, 18.2], from: 'down', span: 1.0 }, // STAIRS TO F2 (right)
  { box: [54.6, 20.4, 64.0, 22.6], from: 'down', span: 0.8 }, // GRAND BALLROOM
  { box: [85.6, 19.8, 92.6, 21.7], from: 'down', span: 0.8 }, // LOUNGE & BAR
  { box: [100.2, 21.2, 107.0, 23.4], from: 'down', span: 1.0 }, // SIDE DECK
  { box: [27.4, 36.2, 35.4, 38.1], from: 'up', span: 0.8 }, // PASSENGER CABINS (A)
  { box: [83.8, 36.2, 92.6, 38.1], from: 'up', span: 0.8 }, // PASSENGER CABINS (B)
  { box: [56.2, 37.2, 61.1, 41.7], from: 'up', span: 1.6 }, // STAIRS TO B1, and its arrow
  { box: [55.0, 45.4, 61.6, 47.4], from: 'up', span: 1.0 }, // MAIN ENTRANCE
  { box: [69.0, 43.6, 77.9, 45.8], from: 'up', span: 1.0 }, // RECEPTION
  { box: [82.6, 43.8, 85.6, 45.8], from: 'up', span: 1.0 }, // MEN
  { box: [89.4, 43.8, 92.8, 45.8], from: 'up', span: 1.0 }, // WOMEN
  { box: [96.6, 42.2, 102.6, 44.3], from: 'down', span: 1.0 }, // STAFF ROOM
];

/** A rounded end of the ship (|dx|^4 + |dy|^4 < 1), centre (cx, cy), radii (rx, ry). */
const end = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 4 + ((y - cy) / ry) ** 4 < 1;

/** The walkable deck, inside the railings. Everything else (hull, ocean) is solid. */
export function inside(x, y) {
  if (x >= 51 && x < 66.4 && y >= 46 && y < 50.4) return true; // entrance landing
  if (x >= 37.4 && x < 78.2 && y >= 4.6 && y < 9.4) return true; // ballroom promenade
  if (y < 10.2) return false;
  const bottom = x < 26 ? 43.8 : x < 38.4 ? 44.6 : x < 51 ? 46.6 : 47.4;
  if (y >= bottom) return false;
  if (x < 24) return end(x, y, 24, 27.6, 20.4, 18.4);
  if (x > 90) return end(x, y, 90, 27.6, 16.8, 18.4);
  return true;
}

/** Rooms, for the HUD (all indoors). Later entries win where they overlap. */
export const ROOMS = [
  { name: 'Promenade', box: [0, 0, 112, 56] },
  { name: 'Front Deck', box: [4, 8, 13.8, 47] },
  { name: 'Kitchen', box: [14.6, 10.6, 38.2, 19.4] },
  { name: 'Restaurant', box: [14.6, 19.4, 38.2, 30.6] },
  { name: 'Grand Ballroom', box: [44.6, 7.2, 72.6, 27.6] },
  { name: 'Lounge & Bar', box: [79.2, 10.6, 99.4, 27.2] },
  { name: 'Side Deck', box: [100.2, 8, 109, 47] },
  { name: 'Passenger Cabins A', box: [14.6, 31.2, 50, 38.6] },
  { name: 'Passenger Cabins B', box: [68.4, 31.2, 101, 38.6] },
  { name: 'Central Stairwell', box: [54.2, 29.4, 63.8, 42.2] },
  { name: 'Main Entrance', box: [51, 42.2, 66.4, 50.4] },
  { name: 'Reception', box: [66, 41.4, 79.6, 47.4] },
  { name: "Men's Restroom", box: [80.4, 41.4, 86.6, 47.4] },
  { name: "Women's Restroom", box: [86.8, 41.4, 93.8, 47.4] },
  { name: 'Staff Room', box: [94.4, 41.4, 103, 47.4] },
  { name: 'Crew Lounge', box: [16.4, 41.2, 38.2, 44.6] },
];
export const ZONES = [{ name: 'Open Sea', box: [0, 0, 112, 56] }];
export const OFF_LIMITS = ['Open Sea'];

/** Walls the detector misses (light-trimmed or partly hidden by props). */
export const WALLS = [
  [13.6, 10.0, 38.6, 11.0], // kitchen, north (windows onto the deck)
  [13.4, 13.8, 14.6, 16.8], // kitchen, west: a window (shelves stand right behind it)
  [78.0, 10.0, 101.0, 11.0], // lounge, north (windows)
  [37.6, 27.2, 38.6, 30.6], // restaurant, east, below its side door
  [13.6, 30.6, 50.4, 31.6], // cabins A, north (their lamps face the restaurant)
  [67.0, 30.6, 101.0, 31.6], // cabins B, north
  [14.0, 37.9, 50.0, 38.7], // cabins A, south (each cabin's door is cut into it)
  [67.4, 37.9, 100.6, 38.7], // cabins B, south
  [25.6, 40.6, 35.6, 41.4], // crew mess, north (its wooden door at 28-29.8)
  [79.4, 45.6, 80.6, 47.6], // reception | men's restroom, below the detected wall
  [78.0, 14.4, 79.2, 17.2], // lounge, west: a window (the bar's back shelves stand behind it)
];
/** Things the wall detector mistakes for walls (dark furniture, the navy bar floor). */
export const NOT_WALLS = [
  [90.4, 26.2, 92.6, 28.2], // the lounge's south doorway (a dark door frame, not wall)
];

/**
 * Passenger cabins, between the dividers measured on the art: x0..x1 in tiles. Each gets
 * a door in its south wall, a wardrobe and desk row along the north wall and its bed, with
 * room to walk round the bed (dressers are left walkable so the cabins stay navigable).
 */
export const CABINS = [
  ['A1', 14.5, 20.5], ['A2', 21.5, 27.5], ['A3', 28.5, 33], ['A4', 33.5, 36], ['A5', 37, 42.5], ['A6', 43.5, 48.5],
  ['B1', 68.5, 73.5], ['B2', 74.5, 80], ['B3', 81, 86], ['B4', 87, 92.5], ['B5', 93.5, 99],
].map(([id, x0, x1]) => ({ id, x0, x1, cx: (x0 + x1) / 2 }));

function cabinSolids() {
  const out = [];
  for (const c of CABINS) {
    out.push([c.x0, 31.6, c.x1, 33.2]); // wardrobes and desks
    if (c.x1 - c.x0 < 3) continue; // the narrow suite is a sitting room
    out.push([c.cx - 1.4, 33.2, c.cx + 1.4, 36.4]); // bed
  }
  return out;
}

/** Furniture and props that block movement. Kept to the essentials so rooms stay open. */
export const SOLIDS = [
  // Front deck
  [10.2, 13.6, 11.8, 16.6], [12.6, 14.2, 13.4, 17.2], // deck chair, bench
  [6.0, 19.4, 7.6, 22.2], [6.0, 27.6, 7.6, 30.4], [6.6, 33.4, 8.2, 36.4], [10.2, 33.4, 11.8, 36.4], // deck chairs
  [10.6, 18.6, 12.0, 21.0], [10.6, 27.4, 12.0, 30.0], [5.2, 33.6, 6.4, 35.4], // potted palms
  // Kitchen: counters round the walls, two islands; the middle stays open
  [14.6, 11.0, 37.6, 12.6],
  [14.6, 12.6, 17.4, 17.6],
  [20.6, 12.6, 22.6, 15.8],
  [19.6, 16.8, 31.8, 18.6],
  [34.4, 12.6, 37.6, 18.6],
  [30.6, 15.0, 32.2, 16.8],
  // Restaurant: six tables with broad lanes between them, and the service counter
  [16.6, 20.2, 20.2, 24.4], [21.4, 21.4, 24.8, 24.8], [26.8, 21.4, 30.0, 24.8],
  [16.6, 26.2, 20.2, 30.0], [21.6, 27.0, 25.6, 30.4], [27.6, 27.0, 30.8, 30.4],
  [31.4, 22.8, 36.6, 26.6],
  // Grand ballroom: stage, piano and five tables round the edge; the dance floor is open
  [50.4, 4.6, 65.8, 8.0], [52.4, 8.0, 63.6, 11.2], // curtains and stage
  [45.6, 8.6, 50.2, 10.2], [66.2, 8.6, 72.4, 10.2], // backstage cabinets
  [47.0, 12.4, 51.0, 16.8], // grand piano
  [47.6, 18.4, 50.6, 21.6], [47.8, 23.0, 50.8, 25.4], [67.6, 11.8, 70.6, 15.2], [69.0, 17.6, 72.0, 21.0], [67.6, 21.2, 70.6, 24.6],
  [46.0, 25.4, 52.0, 27.4], [54.6, 25.6, 57.4, 27.2], [60.6, 25.6, 63.6, 27.2], [65.4, 25.4, 71.6, 27.4], // counters and sofas along the south side
  // Stairs up to F2 (the treads; you climb from the landing below them)
  [39.8, 8.8, 44.0, 14.4], [74.2, 8.8, 78.2, 14.4],
  // Lounge & bar
  [79.2, 11.0, 90.4, 17.8], // bar, back shelves and the bartender's side
  [91.6, 11.4, 92.8, 13.2], [98.0, 11.0, 99.4, 14.6], // plant, cabinet
  [93.6, 14.2, 95.6, 17.6], [96.6, 14.2, 98.6, 17.6], // armchairs
  [95.4, 19.8, 99.0, 23.6], [97.8, 23.8, 99.4, 26.6], // round table, palm
  [80.4, 23.0, 83.2, 25.6], [84.0, 23.2, 85.8, 25.6], [86.0, 22.8, 88.6, 25.4], [89.0, 23.0, 91.6, 25.6], // lounge tables
  [79.4, 26.6, 90.4, 28.2], [92.6, 26.8, 98.2, 28.4], // benches along the south side (doorway between)
  // Side deck
  [103.6, 16.6, 106.6, 19.0], [100.6, 10.6, 102.0, 12.4], [101.0, 23.4, 102.4, 25.4], [103.8, 32.6, 105.2, 35.4],
  // Crew stairs by the cabins (locked)
  [100.8, 31.6, 103.0, 36.4], [13.6, 39.4, 15.8, 43.6],
  // Promenade: sofas by the cabins
  [49.8, 33.4, 51.2, 36.2], [65.0, 33.4, 66.4, 36.4],
  // Central stairwell: banisters and the stairs going down; the landing in front is open
  [54.4, 29.4, 56.6, 41.0], [61.4, 29.4, 63.6, 41.0], [56.6, 30.0, 61.4, 33.4],
  // Main entrance palms
  [53.2, 46.4, 55.0, 49.6], [63.2, 46.4, 65.0, 49.6],
  // Reception
  [70.0, 45.6, 76.4, 47.0], [71.0, 42.6, 72.2, 45.4],
  // Restrooms (sinks along the sides, toilets along the bottom; the middle stays open)
  [80.6, 41.6, 81.8, 44.8], [85.0, 41.6, 86.4, 44.4], [80.6, 45.0, 86.4, 47.4],
  [87.6, 41.6, 88.8, 43.8], [92.4, 41.6, 93.6, 46.0], [87.6, 45.4, 93.6, 47.4],
  // Staff room
  [95.0, 41.6, 96.0, 45.4], [99.4, 43.0, 102.4, 46.6], [95.4, 46.0, 98.6, 47.4],
  // Crew mess and storeroom
  [17.0, 41.6, 22.0, 42.6], [30.4, 41.6, 32.4, 43.4], [30.4, 43.6, 32.4, 44.6], [36.0, 41.6, 37.6, 43.4], [39.6, 41.4, 41.4, 44.6],
  ...cabinSolids(),
];

/** Doors: wooden for the luxury deck (side doors fill the doorway gaps). */
const door = (id, name, box, extra = {}) => ({ id, name, box, side: true, ...extra });
export const DOORS = [
  door('door-rest-w', 'restaurant door', [13.6, 20.0, 14.6, 24.0]),
  door('door-service', 'service door', [32.0, 18.6, 34.5, 19.6]),
  door('door-rest-e', 'restaurant door', [37.6, 20.2, 38.6, 23.8]),
  door('door-lounge-w2', 'lounge door', [78.2, 20.5, 79.2, 23.5]),
  door('door-lounge-e', 'side deck door', [99.4, 15.5, 100.6, 19.0]),
  door('door-men', "men's restroom door", [82.6, 40.5, 85.9, 41.5]),
  door('door-women', "women's restroom door", [89.6, 40.5, 92.9, 41.5]),
  door('door-staff', 'staff room door', [95.1, 40.5, 97.9, 41.5]),
  door('door-crew-mess', 'crew mess door', [28.0, 40.6, 29.8, 41.4]),
  ...CABINS.map((c, i) => door(`door-cabin-${c.id}`, `cabin ${c.id} door`, [c.cx - 0.8, 37.9, c.cx + 0.8, 38.7])),
];

/**
 * Stairwells: the central one goes down to B1, the two by the ballroom up to F2. `zone` is
 * where E works, `arrive` where you appear when you come up these stairs (tiles), and `to`
 * the deck and stairwell they lead to.
 */
export const STAIRS = [
  { id: 'stairs-b1', name: 'stairs to B1', zone: [56.6, 33.4, 61.4, 41.6], arrive: [59, 36.4], to: { deck: 'cruise-b1', arrive: 'stairs-main' } },
  { id: 'stairs-f2-left', name: 'stairs to F2', zone: [39.8, 14.4, 44.0, 16.8], arrive: [41.9, 15.8], to: { deck: 'cruise-f2', arrive: 'stairs-left' } },
  { id: 'stairs-f2-right', name: 'stairs to F2', zone: [74.2, 14.4, 78.2, 16.8], arrive: [76.2, 15.8], to: { deck: 'cruise-f2', arrive: 'stairs-right' } },
];

export const HIDING_SPOTS = [
  { id: 'hide-wardrobe-a2', room: 'Passenger Cabins A', box: [21.5, 33.2, 22.6, 36.4] },
  { id: 'hide-wardrobe-b3', room: 'Passenger Cabins B', box: [81, 33.2, 82.1, 36.4] },
  { id: 'hide-suite', room: 'Passenger Cabins A', box: [33.5, 33.2, 36, 37.8] },
  { id: 'hide-curtains', room: 'Grand Ballroom', box: [45.6, 10.2, 50.2, 11.6] },
  { id: 'hide-bar', room: 'Lounge & Bar', box: [90.4, 17.8, 92.6, 19.6] },
  { id: 'hide-pantry', room: 'Kitchen', box: [17.4, 12.6, 20.6, 14.4] },
  { id: 'hide-reception', room: 'Reception', box: [71.2, 42.6, 72.6, 45.2] },
];

export const INTERACTABLES = [
  { id: 'chef-knives', rect: [26, 16, 26, 16], name: "chef's gold knife set", loot: 220, text: "A chef's knife set with gold handles." },
  { id: 'silverware', rect: [33, 27, 33, 27], name: 'silver service', loot: 300, text: 'The captain\'s silver service, polished for tonight.' },
  { id: 'tiara', rect: [49, 17, 49, 17], name: 'diamond tiara', loot: 900, text: 'A diamond tiara left on the piano bench after the dance.' },
  { id: 'wine', rect: [91, 19, 91, 19], name: 'vintage wine', loot: 350, text: 'A bottle of wine older than the ship.' },
  { id: 'jewels-a', rect: [34, 37, 34, 37], name: 'jewelry box', loot: 480, text: 'A jewelry box in the suite. Someone forgot to lock it.' },
  { id: 'watch-b', rect: [89, 37, 89, 37], name: 'gold pocket watch', loot: 400, text: 'A gold pocket watch on a cabin nightstand.' },
  { id: 'cashbox', rect: [74, 42, 74, 42], name: 'reception cash box', loot: 380, text: 'The reception cash box. Heavy.' },
  { id: 'masterkey', rect: [96, 43, 96, 43], name: 'master key ring', loot: 150, text: 'The master key ring from the staff room.' },
  { id: 'binoculars', rect: [104, 20, 104, 20], name: "captain's binoculars", loot: 180, text: "The captain's brass binoculars." },
  { id: 'pearl-necklace', rect: [9, 25, 9, 25], name: 'pearl necklace', loot: 600, text: 'A pearl necklace dropped by a deck chair.' },
  // Stairwells (they lead to other decks)
  { id: 'stairs-b1', rect: [57, 33, 60, 33], name: 'stairs to B1', text: "These stairs aren't connected yet. Pick LUXURY CRUISE — B1 in Map Info to play the Base Floor." },
  { id: 'stairs-f2-left', rect: [40, 14, 43, 14], name: 'stairs to F2', text: 'Top Deck (F2) is coming soon.' },
  { id: 'stairs-f2-right', rect: [74, 14, 77, 14], name: 'stairs to F2', text: 'Top Deck (F2) is coming soon.' },
  { id: 'piano', rect: [47, 16, 50, 16], name: 'grand piano', text: 'A black grand piano. You resist playing a note.' },
];

export const LIGHTS = [
  { x: 9, y: 20, r: 6, kind: 'soft' }, { x: 9, y: 34, r: 6, kind: 'soft' }, { x: 26, y: 14.5, r: 9, kind: 'soft' }, { x: 25, y: 25, r: 10, kind: 'soft' },
  { x: 58.6, y: 18, r: 13, kind: 'soft' }, { x: 41.6, y: 22, r: 6, kind: 'soft' }, { x: 75.6, y: 22, r: 6, kind: 'soft' }, { x: 89, y: 19, r: 10, kind: 'soft' },
  { x: 104, y: 24, r: 6, kind: 'soft' }, { x: 32, y: 35, r: 9, kind: 'soft' }, { x: 84, y: 35, r: 9, kind: 'soft' }, { x: 59, y: 37, r: 7, kind: 'soft' },
  { x: 58.6, y: 46, r: 6, kind: 'soft' }, { x: 72, y: 44, r: 5, kind: 'soft' }, { x: 88, y: 44, r: 7, kind: 'soft' }, { x: 97, y: 44, r: 5, kind: 'soft' },
  { x: 29, y: 43, r: 6, kind: 'soft' }, { x: 53.6, y: 40.4, r: 3, kind: 'lamp' }, { x: 64.6, y: 40.4, r: 3, kind: 'lamp' },
];

export const SPAWN = { x: 58.6, y: 48.8, facing: 'up' };
