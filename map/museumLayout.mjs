// Midnight Museum, traced from public/reference/museum-reference.png. The reference is
// 1536 x 1024: exactly 96 x 64 tiles at the estate's 16 px per tile, so tile coordinates
// here are reference pixels / 16. Boxes are [x0, y0, x1, y1] in tiles, end exclusive.
// See scripts/generate-museum.mjs for how this becomes the playable map.

export const REFERENCE = 'public/reference/museum-reference.png';
export const WIDTH = 96;
export const HEIGHT = 64;

/**
 * Room-name plaques painted into the reference (the game names rooms in its HUD instead).
 * Each is filled by repeating the strip of floor on one side of it (`from`, `span` tiles).
 */
export const LABELS = [
  { box: [17.7, 9.7, 22.3, 11.3], from: 'down', span: 1.2 }, // STORAGE
  { box: [24.3, 9.6, 31.2, 12.2], from: 'down', span: 1.0 }, // RESTORATION WORKSHOP
  { box: [41.3, 12.3, 48.8, 14.8], from: 'down', span: 0.8 }, // ANCIENT EGYPT GALLERY
  { box: [3.9, 17.1, 13.8, 18.9], from: 'up', span: 0.7 }, // SECURITY ROOM
  { box: [14.8, 30.4, 26.4, 32.3], from: 'down', span: 1.0 }, // DINOSAUR EXHIBIT
  { box: [62.4, 12.3, 72.6, 14.2], from: 'up', span: 0.9 }, // CLASSICAL ART WING
  { box: [81.4, 18.1, 88.0, 20.1], from: 'down', span: 1.0 }, // MODERN ART
  { box: [81.4, 25.6, 88.8, 28.6], from: 'up', span: 0.7 }, // RESTRICTED VAULT
  { box: [62.2, 32.1, 71.8, 34.2], from: 'down', span: 0.6 }, // ROYAL TREASURES
  { box: [41.4, 39.6, 48.8, 41.7], from: 'up', span: 0.8 }, // GRAND HALL
  { box: [7.4, 39.8, 13.6, 41.8], from: 'down', span: 0.8 }, // GIFT SHOP
  { box: [21.8, 39.6, 28.8, 41.8], from: 'up', span: 0.9 }, // CAFETERIA
  { box: [41.2, 49.2, 49.2, 51.3], from: 'down', span: 1.0 }, // MAIN ENTRANCE
  { box: [57.4, 38.3, 60.6, 40.2], from: 'down', span: 0.8 }, // MEN
  { box: [64.2, 38.3, 68.8, 40.2], from: 'down', span: 0.8 }, // WOMEN
  { box: [79.8, 35.4, 90.2, 37.5], from: 'down', span: 1.0 }, // TEMPORARY EXHIBIT
  { box: [76.0, 48.2, 83.2, 50.4], from: 'down', span: 0.8 }, // STAFF AREA
];

/** The building's footprint (walls are only looked for in and right around it). */
export const BUILDING = [
  [2.4, 3.8, 34.2, 50.4], // west wing
  [33.0, 1.8, 56.4, 53.4], // centre: Egypt, Grand Hall, entrance
  [55.0, 5.8, 95.2, 50.8], // east wing
  [71.6, 45.8, 84.8, 56.0], // staff area
];

/** Rooms, for the HUD's area name and indoor lighting. Later entries win where they overlap. */
export const ROOMS = [
  { name: 'Dinosaur Exhibit', box: [3, 19.5, 34, 35.5] },
  { name: 'Security Room', box: [3, 11.5, 18, 19.5] },
  { name: 'Storage Room', box: [12, 4.5, 22.6, 15.5] },
  { name: 'Restoration Workshop', box: [22.6, 4.5, 34, 15.5] },
  { name: 'Staff Corridor', box: [17.5, 15.5, 34, 19.5] },
  { name: 'Gift Shop', box: [3.5, 35.5, 18.6, 48.6] },
  { name: 'Cafeteria', box: [18.6, 35.5, 34, 49.6] },
  { name: 'Ancient Egypt Gallery', box: [34, 2.4, 56, 20.4] },
  { name: 'Grand Hall', box: [34, 20.4, 56, 46.4] },
  { name: 'Main Entrance', box: [34, 46.4, 56, 53] },
  { name: 'Classical Art Wing', box: [56, 6.4, 81, 22.4] },
  { name: 'Modern Art Gallery', box: [76.6, 7.6, 95, 24.4] },
  { name: 'Royal Treasures', box: [56, 22.4, 76.6, 37.6] },
  { name: 'Restricted Vault', box: [76.6, 24.4, 95, 33.6] },
  { name: 'Temporary Exhibit', box: [76.6, 33.6, 95, 48.4] },
  { name: "Men's Restroom", box: [56, 37.6, 62.6, 50.4] },
  { name: "Women's Restroom", box: [62.6, 37.6, 69, 50.4] },
  { name: 'Staff Corridor', box: [69, 37.6, 76.6, 46.4] },
  { name: 'Staff Area', box: [72, 46.4, 84.6, 55.6] },
];

/** Outdoor areas, for the HUD (indoor rooms above take precedence). */
export const ZONES = [
  { name: 'Museum Gardens', box: [0, 0, 96, 57] },
  { name: 'Entrance Plaza', box: [36, 52, 56, 61] },
  { name: 'Street', box: [0, 57, 96, 64] },
];

/**
 * Walls, traced from the dark wall bands in the reference, with gaps left for every doorway.
 * (Thin pale strips on the walls in the reference are open doorways seen edge-on.)
 */
export const WALLS = [
  // ---- West wing ----
  [2.6, 11.4, 3.6, 50.4], // outer west wall
  [2.6, 11.4, 17.8, 12.4], // security room / storage, north
  [12.0, 4.2, 34.2, 5.2], // storage + workshop, north
  [12.0, 4.2, 12.8, 12.4], // storage, west
  [22.2, 4.2, 22.9, 14.8], // storage | workshop
  [22.2, 14.8, 25.6, 15.6], // workshop, south (door at 25.6-27.4)
  [27.4, 14.8, 34.2, 15.6],
  [3.0, 18.8, 5.8, 19.8], // dinosaur exhibit, north (security door 5.8-9.4; arches 19.4-21.2, 26.6-28.2)
  [9.4, 18.8, 19.4, 19.8],
  [21.2, 18.8, 26.6, 19.8],
  [28.2, 18.8, 34.2, 19.8],
  [3.0, 35.4, 12.2, 36.4], // dinosaur exhibit, south (gift shop door 12.2-14.6, cafeteria door 20.0-21.8)
  [14.6, 35.4, 20.0, 36.4],
  [21.8, 35.4, 34.2, 36.4],
  [17.8, 36.4, 18.6, 40.0], // gift shop | cafeteria (doorway 40.0-45.8)
  [17.8, 45.8, 18.6, 50.4],
  [3.0, 46.6, 18.6, 50.2], // gift shop, south (and the facade below it)
  [18.0, 48.6, 34.2, 50.4], // cafeteria, south
  // ---- Centre ----
  [33.2, 1.8, 34.2, 15.8], // west wing | centre (openings 15.8-18.8, 25.8-28.0, 30.0-33.8)
  [33.2, 18.8, 34.2, 25.8],
  [33.2, 28.0, 34.2, 30.0],
  [33.2, 33.8, 34.2, 50.4],
  [33.2, 1.8, 56.4, 3.0], // Egypt gallery, north
  [55.6, 1.8, 57.4, 15.8], // Egypt | classical (doorway 15.8-18.8)
  [55.6, 18.8, 56.4, 21.6],
  [34.2, 19.8, 42.2, 21.2], // Egypt | Grand Hall (great doors 42.2-47.6)
  [47.6, 19.8, 56.4, 21.2],
  [55.6, 21.2, 56.4, 25.6], // Grand Hall | Royal Treasures (openings 25.6-27.8, 29.6-34.0)
  [55.6, 27.8, 56.4, 29.6],
  [55.6, 34.0, 57.0, 50.4],
  [34.2, 44.8, 40.4, 46.6], // Grand Hall | entrance hall
  [49.8, 44.8, 56.4, 46.6],
  [34.2, 46.6, 39.4, 50.2], // statue alcoves either side of the doors
  [51.0, 46.6, 56.4, 50.2],
  // ---- East wing ----
  [55.6, 5.8, 81.0, 7.8], // classical, north
  [80.8, 7.0, 95.2, 8.2], // modern art, north
  [94.4, 7.0, 95.2, 50.4], // outer east wall
  [81.0, 7.8, 81.8, 13.8], // classical | modern art
  [75.8, 13.6, 81.8, 14.4],
  [75.6, 14.4, 76.4, 16.0], // modern art doorway 16.0-20.0
  [75.6, 20.0, 76.4, 21.6],
  [55.6, 21.6, 60.4, 22.6], // classical | royal treasures (openings 60.4-62.2, 69.6-71.6)
  [62.2, 21.6, 69.6, 22.6],
  [71.6, 21.6, 77.4, 22.6],
  [76.4, 23.6, 95.2, 24.6], // modern art | vault
  [75.6, 22.6, 77.4, 28.8], // royal treasures | vault (vault door 28.8-31.2)
  [75.6, 31.2, 77.4, 35.0], // royal treasures | temporary exhibit (opening 35.0-37.4)
  [75.6, 37.4, 77.4, 38.4],
  [76.4, 33.4, 95.2, 34.6], // vault | temporary exhibit (solid: the vault has one way in)
  [76.4, 38.4, 77.2, 46.6], // corridor | temporary exhibit
  [77.2, 45.6, 95.2, 48.6], // temporary exhibit, south
  [56.4, 37.4, 60.2, 38.4], // royal treasures | restrooms (restroom door 60.2-62.6)
  [62.6, 37.4, 72.4, 38.4],
  [62.4, 38.4, 63.2, 45.0], // men | women
  [56.4, 48.6, 69.6, 50.4], // restrooms, south
  [68.6, 37.4, 72.4, 50.4], // women | staff corridor (a closet of shelves)
  [71.6, 50.4, 72.4, 55.6], // staff area, west
  [71.6, 54.6, 84.8, 55.6], // staff area, south
  [83.8, 46.6, 84.8, 55.6], // staff area, east
  [76.4, 45.8, 84.8, 46.6], // staff area, north (the stairs come down at 72.4-76.4)
];

/** Exhibits, furniture and props that block movement, covering each piece as drawn. */
export const SOLIDS = [
  // Security room
  [3.6, 12.6, 13.8, 17.2], // monitor wall and control desk
  [14.4, 12.4, 17.0, 16.0], // server cabinet
  // Storage room and workshop
  [12.8, 5.2, 22.2, 8.4], // shelves, crates, desks
  [12.8, 8.4, 14.2, 11.4],
  [22.9, 5.2, 33.4, 8.8], // workbenches
  [26.6, 8.8, 31.0, 9.4],
  [22.9, 8.8, 24.4, 14.4], // tool rack
  [29.6, 16.2, 33.4, 18.2], // corridor bench
  // Dinosaur exhibit
  [9.4, 23.4, 29.8, 31.2], // T. rex on its platform, inside the ropes
  [3.6, 26.4, 11.0, 32.8], // triceratops and its ropes
  [3.6, 23.6, 6.8, 26.4], // info desk
  [10.0, 20.2, 12.6, 22.2], // plants and fossils along the north wall
  [12.6, 21.4, 15.0, 22.8],
  [15.0, 20.2, 18.8, 22.2],
  [21.6, 20.4, 24.6, 22.4],
  [24.6, 21.6, 26.4, 23.2],
  [28.6, 20.4, 33.0, 22.4],
  [31.4, 26.4, 33.0, 28.8], // bench
  [3.8, 33.4, 9.0, 35.4], // bench and plants along the south wall
  [9.2, 33.6, 12.2, 35.4],
  [22.0, 33.6, 33.2, 35.4],
  // Gift shop
  [4.4, 36.4, 12.0, 39.6], // shelves
  [3.6, 38.0, 5.6, 46.6],
  [5.6, 42.6, 8.4, 44.6], // display tables
  [9.2, 42.6, 12.4, 44.6],
  [13.2, 39.0, 14.4, 43.2], // mannequin
  [15.0, 37.6, 17.8, 46.6], // shelving
  [5.6, 45.6, 15.4, 46.6], // counter
  // Cafeteria
  [22.6, 36.4, 31.6, 38.8], // serving counter
  [30.6, 38.4, 33.2, 45.6], // drinks counter
  [21.6, 42.6, 24.8, 45.6], // tables
  [26.2, 42.6, 29.4, 45.6],
  [18.8, 46.2, 21.8, 48.6], // plant and the cashier
  [28.6, 45.6, 33.2, 48.6], // coffee machine
  [25.6, 46.4, 27.0, 48.6], // lamp
  // Ancient Egypt gallery
  [39.6, 3.0, 48.4, 12.4], // the pharaoh's sarcophagus, its pillars and dais
  [34.2, 3.0, 35.0, 16.6], // pillars along the west wall
  [35.0, 4.4, 38.6, 15.0], // relic cases
  [49.4, 4.4, 53.0, 15.2],
  [53.4, 3.0, 55.6, 16.6], // pillars along the east wall
  [36.4, 16.4, 39.6, 18.4], // benches with statues
  [46.6, 16.4, 49.6, 18.4],
  // Grand Hall
  [38.8, 27.4, 51.2, 41.8], // T. rex on its platform and front steps, inside the ropes
  [34.2, 21.2, 40.6, 26.2], // pillars, banners and plants by the great doors
  [49.4, 21.2, 55.6, 26.2],
  [34.2, 28.0, 35.4, 30.0], // pillars between the openings
  [34.2, 33.8, 36.2, 44.8],
  [53.8, 27.8, 55.6, 29.6],
  [53.4, 34.0, 55.6, 44.8],
  [36.2, 37.4, 37.0, 40.4], // lamp posts
  [52.8, 37.4, 53.6, 40.4],
  [36.2, 42.4, 40.0, 44.8], // artifact displays
  [49.6, 42.4, 53.4, 44.8],
  [40.4, 43.6, 41.6, 46.6], // lamp posts by the vestibule
  [47.8, 43.6, 49.0, 46.6],
  [39.2, 46.6, 41.2, 51.8], // the lions
  [49.2, 46.6, 51.2, 51.8],
  // Classical art wing
  [57.4, 7.8, 75.8, 10.8], // the painting wall
  [57.4, 10.8, 60.0, 14.0], // statue on its pedestal
  [58.6, 14.4, 60.6, 18.8], // statues
  [63.4, 14.4, 65.2, 18.8],
  [67.4, 14.4, 69.4, 18.8],
  [72.0, 14.4, 74.0, 18.8],
  [74.0, 9.8, 79.2, 13.6], // bust and writing desk
  [64.6, 20.0, 68.6, 21.4], // bench
  [57.4, 20.2, 60.4, 21.6], // side tables and plants
  [71.8, 20.2, 75.6, 21.6],
  // Modern art gallery
  [81.8, 8.2, 94.4, 11.4], // wall displays
  [77.4, 14.4, 82.0, 16.2],
  [78.0, 16.2, 80.6, 19.6], // sculpture
  [76.4, 20.0, 79.2, 23.6], // pedestal
  [82.6, 12.2, 84.6, 14.8], // crystal sculpture
  [83.2, 15.0, 86.4, 18.4], // glowing painting stand
  [88.0, 11.4, 91.2, 17.2], // easels
  [88.6, 19.4, 91.6, 23.6],
  [92.4, 11.4, 94.4, 23.6], // shelf
  // Royal treasures
  [62.2, 24.6, 68.2, 32.2], // the crown on its dais
  [59.0, 24.0, 61.8, 33.0], // gem cases
  [68.2, 24.0, 71.0, 33.0],
  [56.4, 22.6, 58.8, 25.4], // plants by the doors
  [72.0, 22.6, 75.6, 25.4],
  [57.8, 27.8, 58.8, 30.4], // golden statue
  [62.6, 34.6, 70.4, 37.4], // reception counter
  [57.4, 34.4, 59.6, 37.4], // marble statue
  [70.4, 35.0, 72.0, 37.4], // plant
  // Restricted vault
  [82.2, 27.8, 87.6, 33.4], // the vault door
  [77.4, 24.6, 94.4, 26.0], // shelving along the north wall
  [78.0, 26.0, 80.4, 31.0], // warning lights on their banners
  [91.0, 26.0, 93.6, 31.0],
  [89.4, 29.6, 90.8, 31.2], // keypad
  [91.6, 31.4, 94.4, 33.4], // treasure chest
  // Temporary (marine) exhibit
  [80.4, 37.8, 93.0, 45.6], // whale skeleton inside its ropes
  [88.4, 34.6, 94.4, 39.6], // aquarium and desk
  [77.2, 41.6, 79.0, 45.6], // fossil display
  [77.2, 37.6, 78.6, 39.4], // plant
  // Restrooms
  [57.0, 38.4, 60.0, 44.2], // men: toilets and sinks
  [60.0, 38.4, 61.6, 45.6], // stall partition
  [63.2, 38.4, 64.6, 45.6],
  [65.6, 38.4, 68.6, 44.2], // women: toilets and sinks
  [57.0, 45.6, 58.6, 48.6], // lockers
  [65.6, 45.6, 68.6, 48.6],
  [59.6, 47.4, 65.6, 48.6], // benches
  // Staff corridor and staff area
  [72.6, 38.6, 74.4, 41.2], // desk
  [72.6, 44.4, 74.0, 46.6], // plant
  [73.0, 48.4, 75.2, 54.4], // desks
  [76.2, 50.2, 78.0, 53.6],
  [78.6, 52.0, 82.0, 54.0],
  [79.2, 46.6, 83.8, 48.4], // counters
  [82.6, 48.4, 83.8, 52.8], // shelves
  // Outside: fountain, lamp posts and the low fence's pillars
  [42.6, 56.6, 50.2, 60.8],
  [36.6, 51.8, 38.0, 55.2], [52.2, 51.8, 53.6, 55.2],
  [40.8, 58.6, 41.8, 62.0], [49.6, 58.6, 50.6, 62.0],
  [7.6, 53.6, 11.6, 58.8], [17.4, 55.0, 19.0, 58.8], [20.6, 55.0, 21.8, 58.6],
  [28.6, 55.0, 30.6, 58.8], [32.4, 55.0, 33.8, 60.4],
  [56.6, 55.2, 58.2, 59.6], [60.2, 55.4, 62.0, 58.8], [65.8, 55.4, 67.4, 58.8],
  [67.8, 55.4, 69.4, 58.8], [77.4, 55.4, 78.8, 58.8], [91.2, 53.4, 93.6, 58.6],
  [1.6, 52.0, 3.4, 54.6], [4.4, 1.6, 6.0, 5.2], [19.4, 1.8, 21.0, 4.0], [7.8, 9.2, 9.0, 11.2],
  [71.2, 1.6, 73.0, 6.6], [89.6, 2.0, 91.2, 6.6],
];

/**
 * The restricted vault's door: a side door (drawn open in the reference) that starts shut.
 * `keypad`: walking into it doesn't push it open; someone has to crack the keypad (E).
 */
export const DOORS = [{ id: 'vault-door', name: 'vault door', box: [76.2, 28.8, 77.4, 31.2], side: true, keypad: true }];

/** Loot (with a value) and things to look at. rect is [x0, y0, x1, y1] in tiles, inclusive. */
export const INTERACTABLES = [
  { id: 'pharaoh', rect: [42, 12, 46, 12], name: "pharaoh's golden mask", loot: 900, text: "The pharaoh's golden death mask. Heavy, priceless, and now yours." },
  { id: 'scarab', rect: [35, 14, 38, 14], name: 'jeweled scarab', loot: 300, text: 'A jeweled scarab amulet lifts out of its case. Nobody saw. Probably.' },
  { id: 'canopic', rect: [49, 14, 52, 14], name: 'canopic jar', loot: 350, text: 'An alabaster canopic jar. You try not to think about what was inside.' },
  { id: 'crown', rect: [63, 32, 67, 32], name: 'royal crown', loot: 1200, text: 'The royal crown. You resist the urge to try it on. Barely.' },
  { id: 'gems-west', rect: [59, 33, 61, 33], name: 'ruby necklace', loot: 450, text: 'A ruby necklace glitters as it slides into your bag.' },
  { id: 'gems-east', rect: [68, 33, 70, 33], name: 'sapphire brooch', loot: 450, text: 'A sapphire the size of a walnut. Good night, sapphire.' },
  { id: 'vault', rect: [83, 27, 86, 27], name: 'vault strongbox', loot: 1500, text: 'The strongbox in the vault! Gold coins, bonds and a very old ledger.' },
  { id: 'painting-1', rect: [59, 10, 62, 10], name: 'landscape painting', loot: 400, text: 'You lift the landscape off its hooks. The wall looks emptier already.' },
  { id: 'painting-2', rect: [66, 10, 69, 10], name: 'garden painting', loot: 450, text: 'A small garden scene, worth more than a house. It fits under your arm.' },
  { id: 'abstract', rect: [87, 13, 87, 16], name: 'abstract painting', loot: 380, text: "Is it upside down? Doesn't matter. It's worth a fortune." },
  { id: 'fossil', rect: [79, 42, 79, 44], name: 'megalodon tooth', loot: 320, text: 'A fossil shark tooth as big as your hand.' },
  { id: 'keycard', rect: [6, 17, 10, 17], name: 'master keycard', loot: 200, text: 'A master keycard on the control desk. Security will hate that.' },
  { id: 'statuette', rect: [27, 9, 30, 9], name: 'restored statuette', loot: 260, text: 'A freshly restored statuette, still smelling of varnish.' },
  { id: 'crates', rect: [15, 8, 20, 8], name: 'antique vase', loot: 150, text: 'An antique vase, packed for storage. You repack it into your bag.' },
  { id: 'souvenirs', rect: [6, 39, 11, 39], name: 'gold souvenir coins', loot: 120, text: 'Gold-plated souvenir coins. Not real gold, but nobody has to know.' },
  { id: 'tipjar', rect: [24, 38, 29, 38], name: 'tip jar', loot: 80, text: 'The cafeteria tip jar. A new low, but a profitable one.' },
  { id: 'wallet', rect: [76, 50, 77, 53], name: "guard's wallet", loot: 60, text: 'Someone left their wallet on the desk. Their loss.' },
  // Things to look at
  { id: 'rex', rect: [40, 41, 50, 41], name: 'T. rex skeleton', text: "The museum's pride: a complete T. rex. It looks hungry, even now." },
  { id: 'whale', rect: [81, 38, 87, 38], name: 'whale skeleton', text: 'A blue whale skeleton, suspended over a glowing blue floor.' },
  { id: 'monitors', rect: [4, 16, 13, 16], name: 'security monitors', text: 'Every camera in the building, on a wall of screens.' },
  { id: 'fountain', rect: [43, 60, 49, 60], name: 'fountain', text: 'Coins glint at the bottom. Too small to bother with tonight.' },
];

/** Lamps for the lighting pass (the reference is already lit, so these are gentle). */
export const LIGHTS = [
  { x: 44, y: 7, r: 9, kind: 'soft' }, { x: 37, y: 8, r: 5, kind: 'soft' }, { x: 51, y: 8, r: 5, kind: 'soft' },
  { x: 45, y: 33, r: 11, kind: 'soft' }, { x: 41.6, y: 44.6, r: 4, kind: 'lamp' }, { x: 48.4, y: 44.6, r: 4, kind: 'lamp' },
  { x: 18, y: 26, r: 10, kind: 'soft' }, { x: 13.4, y: 20.4, r: 3, kind: 'lamp' }, { x: 20.2, y: 20.4, r: 3, kind: 'lamp' }, { x: 27.4, y: 20.4, r: 3, kind: 'lamp' },
  { x: 66, y: 28, r: 9, kind: 'soft' }, { x: 66, y: 14, r: 9, kind: 'soft' }, { x: 85, y: 17, r: 8, kind: 'soft' },
  { x: 85, y: 29, r: 7, kind: 'soft' }, { x: 79.2, y: 27.6, r: 3, kind: 'lamp' }, { x: 92.2, y: 27.6, r: 3, kind: 'lamp' },
  { x: 86, y: 41, r: 9, kind: 'soft' }, { x: 10, y: 42, r: 7, kind: 'soft' }, { x: 26, y: 43, r: 8, kind: 'soft' }, { x: 27.2, y: 47.6, r: 3, kind: 'lamp' },
  { x: 9, y: 15, r: 6, kind: 'soft' }, { x: 18, y: 9, r: 5, kind: 'soft' }, { x: 28, y: 10, r: 6, kind: 'soft' },
  { x: 62, y: 44, r: 7, kind: 'soft' }, { x: 78, y: 51, r: 6, kind: 'soft' }, { x: 74.4, y: 42, r: 4, kind: 'soft' },
  // Outside
  { x: 37.3, y: 52.4, r: 4, kind: 'lamp' }, { x: 52.9, y: 52.4, r: 4, kind: 'lamp' }, { x: 41.3, y: 58.6, r: 4, kind: 'lamp' }, { x: 50.1, y: 58.6, r: 4, kind: 'lamp' },
  { x: 33.1, y: 56, r: 4, kind: 'lamp' }, { x: 57.4, y: 56, r: 4, kind: 'lamp' }, { x: 20.2, y: 58.4, r: 3.5, kind: 'lamp' }, { x: 69.6, y: 58.2, r: 3.5, kind: 'lamp' },
  { x: 2.5, y: 52.6, r: 3.5, kind: 'lamp' }, { x: 10.2, y: 54.4, r: 3.5, kind: 'lamp' }, { x: 92.4, y: 54.6, r: 3.5, kind: 'lamp' },
  { x: 5.2, y: 2.6, r: 3.5, kind: 'lamp' }, { x: 20.2, y: 2.6, r: 3.5, kind: 'lamp' }, { x: 8.4, y: 9.8, r: 3, kind: 'lamp' },
  { x: 72.2, y: 2.4, r: 3.5, kind: 'lamp' }, { x: 90.4, y: 2.6, r: 3.5, kind: 'lamp' }, { x: 46, y: 58.6, r: 3, kind: 'soft' },
];

export const SPAWN = { x: 46, y: 62.2, facing: 'up' };
