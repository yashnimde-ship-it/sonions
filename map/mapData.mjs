// The estate layout, measured from the reference (16 reference pixels = 1 tile).
// All coordinates are in tiles; the world is 96 x 64 tiles. The builder paints the
// art from this data, and the collision map is derived from it independently.

export const WIDTH = 96;
export const HEIGHT = 64;

// ---------- House ----------

/** Rooms with their own walls: [x0, y0, x1, y1] inclusive, walls on the edge tiles. */
export const ROOMS = [
  { id: 'garage', name: 'Garage', rect: [8, 6, 20, 20], floor: 'concrete' },
  { id: 'storage', name: 'Storage', rect: [20, 6, 25, 19], floor: 'wood' },
  { id: 'kitchen', name: 'Kitchen', rect: [25, 6, 42, 19], floor: 'kitchen' },
  { id: 'bath1', name: 'Bathroom', rect: [42, 6, 49, 16], floor: 'bluetile' },
  { id: 'master', name: 'Master Bedroom', rect: [49, 6, 68, 19], floor: 'wood' },
  { id: 'living', name: 'Living Room', rect: [19, 19, 34, 35], floor: 'wood' },
  { id: 'study', name: 'Study', rect: [19, 35, 34, 46], floor: 'wood' },
  { id: 'bath3', name: 'Powder Room', rect: [34, 35, 39, 43], floor: 'whitetile' },
  { id: 'dining', name: 'Dining Room', rect: [50, 25, 62, 41], floor: 'stone' },
  { id: 'bed2', name: 'Blue Bedroom', rect: [62, 19, 76, 31], floor: 'wood' },
  { id: 'bath2', name: 'Bathroom', rect: [69, 31, 76, 37], floor: 'whitetile' },
  { id: 'bed3', name: 'Purple Bedroom', rect: [62, 37, 77, 47], floor: 'wood' },
];

/** Open floor (hallways): no walls of their own; edges facing outdoors become walls. */
export const OPEN_FLOORS = [
  { id: 'hall', name: 'Hallway', rect: [35, 17, 49, 40], floor: 'wood' },
  { id: 'corridor', name: 'Hallway', rect: [50, 20, 61, 24], floor: 'wood' },
  { id: 'smallhall', name: 'Hallway', rect: [63, 32, 68, 36], floor: 'wood' },
];

/** Door openings carved into walls: [x0, y0, x1, y1] inclusive. */
export const DOORS = [
  { rect: [11, 20, 17, 20], kind: 'garage' },
  { rect: [20, 13, 20, 14] },
  { rect: [25, 14, 25, 15] },
  { rect: [36, 19, 37, 19] },
  { rect: [45, 16, 46, 16] },
  { rect: [52, 19, 53, 19] },
  { rect: [34, 25, 34, 26] },
  { rect: [30, 35, 31, 35] },
  { rect: [39, 37, 39, 38] },
  { rect: [44, 40, 47, 40], kind: 'front' },
  { rect: [55, 25, 56, 25] },
  { rect: [62, 22, 62, 23] },
  { rect: [65, 31, 66, 31] },
  { rect: [69, 33, 69, 34] },
  { rect: [65, 37, 66, 37] },
  { rect: [62, 33, 62, 34] },
  { rect: [55, 41, 56, 41], kind: 'patio' },
];

/** Windows in exterior walls: [x0, y0, x1, y1] inclusive. */
export const WINDOWS = [
  [13, 6, 16, 6], [22, 6, 23, 6], [29, 6, 32, 6], [36, 6, 37, 6], [44, 6, 46, 6], [58, 6, 62, 6],
  [8, 10, 8, 17], [19, 28, 19, 30], [23, 46, 26, 46], [67, 47, 70, 47],
  [76, 22, 76, 24], [76, 33, 76, 34], [77, 39, 77, 41], [68, 10, 68, 13],
];

// ---------- Grounds ----------

export const FENCE = {
  top: 2,
  bottom: 53,
  left: 2,
  right: 93,
  gates: [
    { rect: [43, 53, 47, 53], name: 'Front gate' },
    { rect: [8, 53, 10, 53], name: 'Side gate' },
  ],
};

/** Ground surfaces, painted in order over the lawn: [kind, x0, y0, x1, y1] inclusive. */
export const GROUND = [
  ['driveway', 4, 8, 8, 29],
  ['driveway', 9, 21, 18, 29],
  ['poolDeck', 76, 11, 92, 28],
  ['wooddeck', 84, 5, 92, 10],
  ['porch', 40, 41, 49, 46],
  ['steps', 43, 47, 48, 48],
  ['path', 44, 49, 47, 52],
  ['path', 9, 47, 10, 52],
  ['sidewalk', 0, 56, 95, 59],
  ['road', 0, 60, 95, 63],
];

/** Stepping stones (tile coordinates of each stone). */
export const STEPPING_STONES = [
  [7, 24], [7, 26], [7, 28], [7, 30], [7, 32], [7, 34],
  [72, 12], [72, 14], [72, 16], [72, 18],
  [84, 30], [84, 32], [84, 34], [83, 36], [83, 38], [84, 40], [84, 42], [85, 44], [85, 46],
  [9, 45],
];

// ---------- Objects ----------
// type: painter name; x, y, w, h in tiles. `solid: false` for floor decor (rugs, mats).
// `hit` overrides the collision box: [x, y, w, h] in tiles.

export const OBJECTS = [
  // Garage
  { type: 'car', x: 12.5, y: 9.5, w: 4.4, h: 9 },
  { type: 'workbench', x: 9.4, y: 7.3, w: 2.6, h: 1.6 },
  { type: 'shelf', x: 9.1, y: 10.5, w: 1, h: 7 },
  { type: 'shelf', x: 18.7, y: 10.5, w: 1, h: 7 },
  { type: 'crate', x: 18.3, y: 7.4 },
  // Storage
  { type: 'dresser', x: 21.2, y: 7.2, w: 3, h: 2.2 },
  { type: 'shelf', x: 21.2, y: 17.2, w: 3, h: 1.2 },
  { type: 'plant', x: 23.4, y: 15, size: 'small' },
  // Kitchen
  { type: 'fridge', x: 26.1, y: 7.1, w: 2.2, h: 4.4 },
  { type: 'counter', x: 28.6, y: 7.1, w: 12.6, h: 1.7, fixtures: [{ type: 'sink', at: 14 }, { type: 'stove', at: 74 }, { type: 'jar', at: 160 }] },
  { type: 'table', x: 29.3, y: 9.8, w: 2.2, h: 1.6, items: ['plantSmall'] },
  { type: 'rug', x: 27.6, y: 14, w: 2.6, h: 3.6, colors: ['bb2', 'bb1', 'lw2'], solid: false },
  { type: 'dining', x: 34.2, y: 12.4, w: 4.8, h: 3.4 },
  { type: 'plant', x: 40, y: 8.6 },
  { type: 'plant', x: 40, y: 14.6 },
  { type: 'plant', x: 26.3, y: 16.6, size: 'small' },
  // Bathroom 1
  { type: 'bathtub', x: 46.6, y: 7.4, w: 2.2, h: 3.8 },
  { type: 'toilet', x: 43.2, y: 12.8 },
  { type: 'sink', x: 47, y: 13.2 },
  { type: 'bathmat', x: 44.6, y: 9, w: 1.4, h: 1, solid: false },
  // Master bedroom
  { type: 'rug', x: 54.6, y: 12, w: 10.2, h: 6, colors: ['gb2', 'gb1', 'y2'], solid: false },
  { type: 'bed', x: 56.6, y: 7.3, w: 6, h: 9, color: 'green' },
  { type: 'nightstand', x: 54.6, y: 7.6 },
  { type: 'nightstand', x: 63.2, y: 7.6 },
  { type: 'wardrobe', x: 50.2, y: 7.3, w: 2, h: 6.2 },
  { type: 'dresser', x: 50.2, y: 14.6, w: 2, h: 3.2 },
  { type: 'dresser', x: 66, y: 7.4, w: 1.7, h: 2.4 },
  { type: 'bookshelf', x: 66, y: 12, w: 1.7, h: 5.4, seed: 11 },
  { type: 'plant', x: 66, y: 10, size: 'small' },
  // Living room
  { type: 'bookshelf', x: 23.4, y: 20.1, w: 5, h: 2.6, seed: 3 },
  { type: 'dresser', x: 29, y: 20.4, w: 2, h: 2.2 },
  { type: 'picture', x: 31.4, y: 19.9, solid: false },
  { type: 'floorLamp', x: 21.2, y: 21.4 },
  { type: 'tv', x: 20.2, y: 25.6, w: 1.8, h: 5.2 },
  { type: 'rug', x: 24.6, y: 28.4, w: 8.8, h: 5.6, colors: ['r2', 'r1', 'r4'], solid: false },
  { type: 'sofa', x: 25.4, y: 24.6, w: 7.6, h: 2.8, facing: 'down' },
  { type: 'sofa', x: 23.8, y: 28.8, w: 2.8, h: 5, facing: 'right' },
  { type: 'coffeeTable', x: 27.6, y: 28.9, w: 4.6, h: 3.6 },
  { type: 'plant', x: 20.4, y: 31.6, size: 'big' },
  // Hallway
  { type: 'rug', x: 42.4, y: 21.6, w: 10, h: 2.2, colors: ['r2', 'r1', 'r4'], solid: false },
  { type: 'rug', x: 44.4, y: 31.2, w: 2.6, h: 6.2, colors: ['r2', 'r1', 'r4'], solid: false },
  { type: 'table', x: 44.4, y: 26.4, w: 2.6, h: 4.2, items: ['plant'] },
  { type: 'plant', x: 39.6, y: 20.2, size: 'big' },
  { type: 'dresser', x: 39.2, y: 26, w: 1.6, h: 5 },
  { type: 'plant', x: 40, y: 38, size: 'small' },
  { type: 'dresser', x: 56, y: 20.2, w: 5.4, h: 2, top: ['plantSmall'] },
  // Dining room
  { type: 'rug', x: 53.2, y: 29, w: 6.8, h: 9.2, colors: ['bb2', 'bb1', 'lw2'], solid: false },
  { type: 'dining', x: 55, y: 30.6, w: 3.4, h: 5.6 },
  { type: 'dresser', x: 51.1, y: 28.2, w: 1.4, h: 6 },
  { type: 'plant', x: 60, y: 26.4 },
  { type: 'plant', x: 60, y: 38.4 },
  { type: 'plant', x: 51.2, y: 38.4 },
  // Blue bedroom
  { type: 'bed', x: 63.6, y: 21.2, w: 3.4, h: 6.6, color: 'blue' },
  { type: 'bookshelf', x: 67.4, y: 20.2, w: 2.6, h: 2.8, seed: 7 },
  { type: 'roundRug', x: 70.2, y: 27, r: 2.6, colors: ['bb2', 'bb1', 'bb3'], solid: false },
  { type: 'desk', x: 73.2, y: 23.4, w: 2.2, h: 4.8, items: ['laptop'] },
  { type: 'plant', x: 63.2, y: 28.4, size: 'small' },
  // Bathroom 2
  { type: 'bathtub', x: 73.6, y: 31.6, w: 2.2, h: 4.4 },
  { type: 'sink', x: 70.4, y: 35 },
  // Purple bedroom
  { type: 'roundRug', x: 66.8, y: 42, r: 2.2, colors: ['pp2', 'pp1', 'pp3'], solid: false },
  { type: 'bed', x: 68.8, y: 37.6, w: 5.6, h: 8, color: 'purple' },
  { type: 'nightstand', x: 74.6, y: 38.2 },
  { type: 'dresser', x: 63.1, y: 39, w: 1.6, h: 5.6 },
  { type: 'chair', x: 64.8, y: 43.6, facing: 'up' },
  { type: 'plant', x: 63.2, y: 37.4, size: 'small' },
  { type: 'bookshelf', x: 74.8, y: 41, w: 1.4, h: 4.4, seed: 9 },
  // Study
  { type: 'bookshelf', x: 23.6, y: 36.1, w: 5, h: 2.4, seed: 5 },
  { type: 'bookshelf', x: 20.3, y: 36.4, w: 2.4, h: 1.8, seed: 6 },
  { type: 'rug', x: 23.6, y: 39.4, w: 8.6, h: 5.8, colors: ['gb2', 'gb1', 'y2'], solid: false },
  { type: 'desk', x: 26.2, y: 40.8, w: 4.8, h: 3.6, items: ['book', 'lamp', 'laptop'] },
  { type: 'chair', x: 28, y: 39.6, facing: 'down' },
  { type: 'dresser', x: 20.3, y: 40.4, w: 1.8, h: 4.6 },
  { type: 'plant', x: 32, y: 36.4, size: 'small' },
  // Powder room
  { type: 'sink', x: 37.2, y: 36.2 },
  { type: 'toilet', x: 35.2, y: 39.8 },

  // ---- Grounds ----
  { type: 'pool', x: 79.2, y: 14, w: 8.6, h: 7.8 },
  { type: 'flamingo', x: 80.6, y: 15.2, solid: false },
  { type: 'ring', x: 84.4, y: 18.8, solid: false },
  { type: 'umbrella', x: 89.6, y: 17.4, r: 2.6, hit: [89.3, 17.2, 0.6, 0.6] },
  { type: 'cafe', x: 88.4, y: 21.6, w: 2, h: 1 },
  { type: 'lounger', x: 82, y: 23, w: 1, h: 2 },
  { type: 'lounger', x: 84, y: 23, w: 1, h: 2 },
  { type: 'plant', x: 78, y: 23.4, size: 'big' },
  { type: 'plant', x: 74.2, y: 14.6, size: 'big' },
  { type: 'planter', x: 78, y: 5, w: 6, h: 1 },
  { type: 'pergola', x: 84.6, y: 5.2, w: 7.6, h: 5.2, solid: false },
  { type: 'swing', x: 87, y: 6, w: 3, hit: [87, 7.2, 3, 0.6] },
  { type: 'vegBed', x: 86.2, y: 33, w: 6, h: 8.4 },
  { type: 'crate', x: 88.6, y: 42.4 },
  { type: 'doghouse', x: 89.2, y: 45.2, w: 2, h: 2 },
  { type: 'swingFrame', x: 79.4, y: 44.4, w: 4, hit: [79.4, 45.4, 4, 0.5] },
  { type: 'shed', x: 6, y: 37, w: 7.6, h: 7.6 },
  { type: 'firewood', x: 14, y: 42.4 },
  { type: 'crate', x: 14.4, y: 44 },
  { type: 'bench', x: 26, y: 49.8, w: 2 },
  { type: 'mailbox', x: 40.6, y: 52.2, w: 0.6, h: 1 },
  { type: 'mailbox', x: 50.4, y: 52.2, w: 0.6, h: 1 },
  { type: 'plant', x: 41.6, y: 44.6, size: 'big' },
  { type: 'plant', x: 47.6, y: 44.6, size: 'big' },
  { type: 'doormat', x: 44.6, y: 42.2, w: 2.8, h: 1.4, solid: false },
];

// Trees, bushes and hedges, traced from the reference image (tile coordinates).
// Sizes are canopy radii in tiles; tree x/y is the base of the trunk.

/** Trees: [trunk x, trunk y, canopy radius px (procedural art), canopy center x, canopy center y, canopy radius tiles]. */
const tree = (x, y, cx, cy, r) => [x, y, Math.round((r * TILE_PX) / 1.25), cx, cy, r];
const TILE_PX = 16;
export const TREES = [
  // Along the back fence
  tree(7, 6.2, 7, 3.5, 2.6), tree(13.5, 4.8, 13.5, 2.2, 2.2), tree(27.5, 6, 27.3, 3, 2.6), tree(33, 6, 33, 3, 2.5),
  tree(45.5, 5, 45.5, 3.8, 1.2), tree(55.5, 6.3, 55.5, 3.3, 2.6), tree(63.5, 6.2, 63, 3, 2.6), tree(89.5, 4.6, 89.5, 2.5, 2.6),
  // West lawn
  tree(11.8, 35.2, 11.5, 32.5, 2.6), tree(5.8, 51.8, 5.5, 49.5, 2.8),
  // Front yard
  tree(21.5, 52.6, 21, 49.5, 2.8), tree(64.2, 52.4, 64, 50, 2.3), tree(70.2, 52.4, 70, 49.5, 2.5), tree(79, 51.6, 78.8, 49.5, 2.2),
  // Backyard
  tree(80.5, 31.2, 80, 29, 2.3), tree(90.5, 29.7, 90, 27.5, 2.3),
];

/** Bushes: [x, y, radius px (procedural art), flower colors or null]. Radius from tiles. */
const bush = (x, y, r, flowers = null) => [x, y, Math.round((r * TILE_PX) / 1.4), flowers];
export const BUSHES = [
  // Back fence
  bush(41.5, 4.8, 1.3, ['pk2', 'r3']), bush(66.5, 4.8, 1.2, ['y2', 'r3']), bush(75.5, 5.6, 1.2, ['pk2', 'r3']), bush(11.5, 4.5, 1, ['pk2', 'r3']),
  // West lawn
  bush(14.5, 37.2, 1.2, ['pk2', 'r3']), bush(14.5, 41.5, 1.3), bush(14.5, 49, 1.6, ['pk2', 'y2']),
  // Front yard
  bush(17.5, 49, 1.5), bush(25, 48.5, 1.3), bush(31, 48.7, 1.8), bush(36.8, 46.2, 1.4, ['pk2', 'y2']),
  bush(59.5, 46.5, 1.3, ['y2', 'r3']), bush(60.5, 49, 1.6), bush(67, 48.5, 1.4), bush(73.5, 48.8, 1.3),
  bush(82, 49, 1.8, ['y2', 'r3']), bush(85, 51, 1.5),
  bush(25, 53.6, 1.6), bush(32, 53.6, 1.6), bush(38.8, 53.5, 1.3), bush(56.3, 53.5, 1.4), bush(66, 53.6, 1.6), bush(73.5, 53.6, 1.6),
  // Backyard
  bush(88.8, 12.6, 1.2, ['r3', 'y2']), bush(80, 34.5, 1.5, ['y2', 'r3']), bush(80.5, 41, 1.4, ['pk2', 'r3']),
];

/** Hedges: solid rectangles [x0, y0, x1, y1] in tiles (fence-side hedges in the reference). */
export const HEDGES = [
  [3, 9, 6, 46], // west fence
  [92.2, 12, 93, 52], // east fence
  [55.5, 45, 60.5, 47.2], // right of the porch
];

export const FLOWER_PATCHES = [
  [10, 3], [18, 3.4], [47, 3], [66, 3.2], [3, 6], [3.4, 52], [14, 50], [36.4, 46.8], [52.8, 46.6], [74, 9.6], [79.6, 9.4],
  [78.6, 32.6], [80.4, 41], [87.6, 48], [26, 54.4], [60, 54.6], [8, 54.6], [90.4, 54.6],
];

// ---------- Lights ----------
// [x, y] in tiles, radius in tiles, kind: lamp (warm, bright) or soft (dim fill).

export const LIGHTS = [
  // Outdoor lamp posts and lanterns
  { x: 7.3, y: 22.6, r: 4.5, kind: 'lamp' },
  { x: 38.6, y: 47.4, r: 4, kind: 'lamp' },
  { x: 52.4, y: 47.4, r: 4, kind: 'lamp' },
  { x: 88.3, y: 49.6, r: 4, kind: 'lamp' },
  { x: 89.5, y: 6.6, r: 4, kind: 'lamp' },
  { x: 40.8, y: 41.6, r: 3.2, kind: 'lamp' },
  { x: 49.2, y: 41.6, r: 3.2, kind: 'lamp' },
  { x: 13.6, y: 43, r: 2.6, kind: 'lamp' },
  // Interior lamps
  { x: 21.8, y: 22.2, r: 5, kind: 'lamp' },
  { x: 55.1, y: 7.8, r: 3.4, kind: 'lamp' },
  { x: 63.7, y: 7.8, r: 3.4, kind: 'lamp' },
  { x: 75.1, y: 38.4, r: 3.2, kind: 'lamp' },
  { x: 30.4, y: 41.2, r: 3, kind: 'lamp' },
];

/** Outdoor lamp posts and lanterns to draw: [kind, x, y] in tiles. */
export const LAMPS = [
  ['post', 7, 21.4], ['post', 38.3, 46.2], ['post', 52.1, 46.2], ['post', 88, 48.4], ['post', 89.2, 5.4],
  ['lantern', 40.6, 40.9], ['lantern', 49, 40.9], ['lantern', 13.4, 42.4],
];

// ---------- Interactions ----------
// rect [x0, y0, x1, y1] inclusive tiles; `loot` makes it stealable for that many dollars.

export const INTERACTABLES = [
  { id: 'car', rect: [12, 9, 17, 18], name: 'red sedan', text: "A shiny red sedan. Locked tight, and the keys aren't in it." },
  { id: 'toolbox', rect: [9, 10, 10, 17], name: 'toolbox', loot: 90, text: 'You swipe a toolbox full of expensive tools.' },
  { id: 'fridge', rect: [26, 7, 28, 11], name: 'fridge', text: 'A midnight snack would be nice... but focus. Loot first.' },
  { id: 'jar', rect: [38, 7, 39, 8], name: 'cookie jar', loot: 120, text: 'The cookie jar is stuffed with cash! You pocket it.' },
  { id: 'stove', rect: [33, 7, 35, 8], name: 'stove', text: 'Still warm. Someone cooked dinner not long ago.' },
  { id: 'jewelry', rect: [66, 7, 67, 9], name: 'jewelry box', loot: 500, text: 'A velvet jewelry box. Pearls, rings... jackpot!' },
  { id: 'masterbed', rect: [56, 7, 62, 16], name: 'bed', text: 'A big comfy bed. No napping on the job.' },
  { id: 'tv', rect: [20, 25, 21, 30], name: 'TV', loot: 300, text: 'You unplug the flat-screen TV and squeeze it into the sack.' },
  { id: 'bookshelf', rect: [23, 20, 28, 22], name: 'bookshelf', text: 'Classics, mysteries... and a book called "Home Security 101".' },
  { id: 'sofa', rect: [25, 24, 32, 27], name: 'sofa', text: 'Plush red cushions. You check under them: just crumbs.' },
  { id: 'laptop', rect: [26, 40, 30, 44], name: 'laptop', loot: 800, text: "A brand-new laptop on the study desk. It's coming with you." },
  { id: 'console', rect: [73, 23, 75, 28], name: 'game console', loot: 200, text: "A handheld game console. The kid won't be happy." },
  { id: 'watch', rect: [74, 37, 75, 39], name: 'gold watch', loot: 250, text: 'A gold watch on the nightstand. It ticks into your sack.' },
  { id: 'piggybank', rect: [67, 20, 69, 22], name: 'piggy bank', loot: 60, text: 'A piggy bank on the shelf. Coins jingle as you take it.' },
  { id: 'silverware', rect: [51, 28, 52, 33], name: 'silver cabinet', loot: 350, text: 'The cabinet holds the family silverware. Shiny!' },
  { id: 'pool', rect: [79, 14, 87, 21], name: 'pool', text: "The pool glows in the dusk. A flamingo float drifts lazily. Don't get wet." },
  { id: 'doghouse', rect: [89, 45, 91, 47], name: 'doghouse', text: 'A dog is snoring inside. Tiptoe... tiptoe...' },
  { id: 'shed', rect: [6, 37, 13, 44], name: 'shed', text: 'The shed is padlocked. Rakes and shovels lean inside.' },
  { id: 'mailbox1', rect: [40, 52, 41, 53], name: 'mailbox', text: 'Bills, flyers, and a pizza coupon.' },
  { id: 'mailbox2', rect: [50, 52, 51, 53], name: 'mailbox', text: 'Empty. The neighbors must have already checked.' },
  { id: 'veggies', rect: [86, 33, 92, 41], name: 'vegetable garden', text: 'Tomatoes, carrots and lettuce. Somebody has a green thumb.' },
  { id: 'toilet', rect: [43, 12, 44, 14], name: 'toilet', text: 'Not now!' },
  { id: 'frontdoor', rect: [44, 39, 47, 41], name: 'front door', text: "The front door was left unlocked. How careless." },
];

/** Where the bandit starts: on the sidewalk outside the front gate (tiles). */
export const SPAWN = { x: 45.5, y: 57.4, facing: 'up' };
