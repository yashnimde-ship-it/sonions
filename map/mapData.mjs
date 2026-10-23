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

/**
 * Every door in the reference, traced from the art: [x0, y0, x1, y1] in tiles (x1/y1
 * exclusive). Front-facing doors are the wooden slabs, frame included. Side doors
 * (`side: true`) are the gaps in vertical walls where the reference draws the door
 * swung open as a pale strip; closed, a wooden leaf fills the gap. All doors start
 * closed and block the way; press E to open them.
 */
export const DOOR_SLABS = [
  { id: 'door-bath', name: 'bathroom door', box: [44.1, 16.3, 47.6, 19.8] },
  { id: 'door-kitchen', name: 'kitchen door', box: [34.95, 18.8, 38.5, 22.2] },
  { id: 'door-master', name: 'bedroom door', box: [52.0, 18.6, 55.3, 22.1] },
  { id: 'door-closet', name: 'closet door', box: [34.95, 25.25, 38.0, 28.8] },
  { id: 'door-dining', name: 'dining room door', box: [54.0, 25.25, 57.95, 28.45] },
  { id: 'door-front', name: 'front door', box: [43.4, 39.4, 47.95, 43.9] },
  { id: 'door-patio', name: 'patio door', box: [54.0, 39.9, 58.6, 43.0] },
  { id: 'door-storage', name: 'storage door', box: [20.9, 13.1, 23.0, 16.1] },
  { id: 'door-study', name: 'study door', box: [27.4, 35.6, 30.3, 38.7] },
  { id: 'door-yard', name: 'back door', box: [70.2, 19.6, 73.8, 23.1] },
  { id: 'door-blue', name: 'bedroom door', box: [64.9, 29.95, 67.9, 33.35] },
  { id: 'door-purple', name: 'bedroom door', box: [64.9, 35.0, 67.9, 38.75] },
  { id: 'door-garage', name: 'garage door', box: [10.2, 19.6, 18.2, 20.8], rolling: true },
  // Side doors (pale strips in the reference)
  { id: 'side-living', name: 'living room door', box: [33.55, 22.0, 34.45, 25.1], side: true },
  { id: 'side-closet', name: 'closet door', box: [41.2, 30.4, 42.0, 33.1], side: true },
  { id: 'side-dining', name: 'dining room door', box: [49.8, 29.3, 51.0, 32.1], side: true },
  { id: 'side-blue', name: 'bedroom door', box: [61.4, 22.9, 62.1, 25.3], side: true },
  { id: 'side-bath2', name: 'bathroom door', box: [69.9, 32.3, 70.6, 34.5], side: true },
  { id: 'side-kitchen', name: 'kitchen door', box: [24.5, 13.4, 25.5, 15.95], side: true },
  { id: 'side-powder', name: 'powder room door', box: [38.8, 36.4, 39.5, 38.5], side: true },
  { id: 'side-powder-top', name: 'powder room door', box: [34.5, 35.5, 37.6, 36.3], side: true },
];

/**
 * Collision boxes for furniture and props, traced from the reference: [x0, y0, x1, y1]
 * in tiles (end exclusive), covering each piece as drawn so the bandit can't step onto
 * it. Used with the reference art; the procedural art uses OBJECTS footprints.
 */
export const SOLIDS = [
  // Garage
  [12.55, 9.65, 16.95, 19.05], // car
  [10.0, 8.0, 11.95, 9.8], // workbench
  [18.6, 8.5, 20.0, 10.2], // crate
  [9.4, 11.4, 10.6, 16.6], // tool shelves, west
  [19.3, 11.4, 20.3, 19.5], // tool shelves, east
  // Storage
  [21.45, 7.6, 23.9, 10.4], // dresser
  [23.95, 7.6, 24.5, 9.0], // plant
  [21.4, 17.7, 24.0, 18.7], // low shelf
  // Kitchen
  [25.5, 7.8, 28.0, 12.7], // fridge
  [28.0, 7.9, 41.0, 10.7], // counter, sink, stove
  [40.2, 9.0, 41.3, 12.1], // cabinet
  [29.0, 10.0, 30.6, 11.8], // little table
  [33.1, 12.3, 39.25, 17.25], // dining table and chairs
  [40.0, 13.4, 41.2, 16.0], // plant
  [39.9, 16.6, 41.3, 18.5], // plant
  [25.6, 17.0, 27.4, 18.6], // plant
  // Bathroom
  [47.1, 10.4, 48.7, 13.1], // sink unit
  [42.5, 13.6, 44.5, 15.8], // toilet
  [47.95, 13.5, 49.0, 16.0], // sink
  // Master bedroom
  [50.0, 8.0, 51.9, 13.5], // wardrobe
  [50.0, 14.5, 51.9, 18.4], // dresser
  [52.0, 8.2, 53.8, 10.9], // side table
  [54.3, 8.4, 56.3, 11.6], // nightstand
  [56.55, 8.0, 62.6, 17.2], // bed
  [63.0, 8.4, 64.9, 11.6], // nightstand
  [66.0, 8.0, 68.0, 11.6], // plant on cabinet
  [66.5, 11.5, 68.0, 17.0], // bookshelf
  // Living room
  [23.5, 20.0, 28.45, 23.8], // bookshelf
  [28.85, 20.5, 30.95, 23.4], // cabinet
  [31.25, 21.9, 32.6, 23.4], // side table
  [21.2, 22.8, 22.8, 26.4], // floor lamp
  [20.5, 25.4, 22.3, 31.7], // TV cabinet
  [20.4, 32.6, 22.6, 35.2], // big plant
  [25.4, 24.75, 33.1, 28.5], // sofa
  [23.95, 29.2, 26.8, 34.0], // armchair
  [27.5, 29.0, 32.1, 33.3], // coffee table
  // Hallway and closet
  [39.3, 20.3, 41.4, 23.6], // big plant
  [49.6, 20.9, 51.2, 22.1], // small plant
  [55.9, 20.4, 61.0, 23.1], // console table
  [44.4, 26.4, 47.1, 31.9], // table with plant
  [39.5, 26.4, 41.05, 31.0], // closet dresser
  [40.2, 34.0, 41.0, 35.5], // small plant
  [48.3, 36.0, 49.6, 39.5], // shelf and plant
  [40.0, 36.8, 42.1, 39.5], // plants
  // Dining room
  [51.0, 27.1, 52.45, 34.0], // sideboard
  [54.0, 29.9, 59.2, 37.3], // table and chairs
  [59.8, 26.5, 61.3, 29.0], // plant
  [51.0, 36.8, 52.9, 39.6], // plant
  // Blue bedroom
  [63.45, 21.4, 67.4, 28.5], // bed
  [62.4, 21.3, 63.8, 24.5], // nightstand
  [67.4, 20.8, 70.0, 23.9], // bookshelf
  [73.35, 23.9, 75.3, 28.5], // desk
  [74.1, 20.8, 75.3, 23.6], // tall cabinet
  [72.1, 28.7, 75.3, 30.0], // dog bed and box
  [62.5, 28.4, 64.3, 30.0], // plant
  [61.6, 31.0, 64.8, 33.2], // hall cabinet
  // Bathroom 2
  [74.1, 31.9, 76.0, 35.8], // bathtub
  [71.5, 35.0, 73.6, 36.0], // sink
  // Purple bedroom
  [68.55, 37.4, 74.3, 45.5], // bed
  [74.4, 37.7, 75.95, 40.7], // nightstand
  [74.9, 41.0, 75.95, 45.6], // cabinet
  [62.5, 36.5, 64.3, 45.5], // plant and shelves
  [64.5, 43.1, 66.2, 45.4], // chair
  // Study
  [24.0, 35.9, 27.1, 38.8], // bookshelf
  [20.6, 37.1, 23.5, 39.4], // low bookshelf
  [20.4, 39.6, 22.1, 45.0], // cabinet and plant
  [26.25, 40.4, 30.9, 45.3], // desk and chair
  [31.95, 37.4, 32.95, 39.3], // plant
  // Powder room
  [36.7, 37.2, 38.5, 39.5], // sink
  [34.5, 40.0, 35.8, 42.1], // toilet
  // Pool deck and back deck
  [78.6, 13.9, 87.1, 21.9], // pool water
  [89.3, 20.8, 90.1, 21.9], // umbrella pole
  [88.6, 22.5, 92.4, 24.3], // cafe table and chair
  [82.1, 23.0, 84.0, 26.9], // lounger
  [84.9, 23.0, 86.9, 26.9], // lounger
  [78.9, 23.2, 81.2, 25.8], // flower pot
  [78.0, 5.0, 84.0, 7.3], // planter boxes
  [89.5, 8.8, 90.2, 10.0], // deck lamp
  [74.1, 14.0, 76.3, 19.4], // potted plant and planter
  [69.1, 7.0, 70.7, 9.6], // plant
  // Backyard
  [86.2, 32.4, 92.7, 41.8], // vegetable garden
  [78.8, 35.3, 81.0, 38.6], // planter
  [89.0, 41.3, 91.8, 43.6], // chest
  [89.15, 45.5, 93.4, 50.7], // doghouse
  [79.6, 44.8, 80.1, 47.2], // swing post
  [83.6, 44.8, 84.2, 47.2], // swing post
  // West lawn
  [6.0, 37.1, 13.3, 46.75], // shed
  [13.6, 42.4, 16.1, 45.5], // firewood and crate
  // Front yard and porch
  [26.0, 50.0, 28.8, 51.75], // bench
  [39.7, 45.4, 42.3, 49.1], // potted shrub
  [49.2, 45.4, 51.8, 49.1], // potted shrub
  [40.2, 41.3, 41.5, 44.6], // porch pillar
  [49.6, 41.3, 51.0, 44.6], // porch pillar
  [51.4, 42.5, 53.5, 45.2], // potted plant
  [58.6, 42.5, 60.6, 45.2], // potted plant
  [40.5, 52.6, 41.3, 53.6], // mailbox
  [50.3, 52.6, 51.3, 53.6], // mailbox
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
  { id: 'toolbox', rect: [9, 11, 10, 16], name: 'toolbox', loot: 90, text: 'You swipe a toolbox full of expensive tools.' },
  { id: 'fridge', rect: [25, 7, 27, 12], name: 'fridge', text: 'A midnight snack would be nice... but focus. Loot first.' },
  { id: 'jar', rect: [38, 7, 39, 10], name: 'cookie jar', loot: 120, text: 'The cookie jar is stuffed with cash! You pocket it.' },
  { id: 'stove', rect: [33, 7, 35, 10], name: 'stove', text: 'Still warm. Someone cooked dinner not long ago.' },
  { id: 'jewelry', rect: [66, 8, 67, 11], name: 'jewelry box', loot: 500, text: 'A velvet jewelry box. Pearls, rings... jackpot!' },
  { id: 'masterbed', rect: [56, 8, 62, 17], name: 'bed', text: 'A big comfy bed. No napping on the job.' },
  { id: 'tv', rect: [20, 25, 22, 31], name: 'TV', loot: 300, text: 'You unplug the flat-screen TV and squeeze it into the sack.' },
  { id: 'bookshelf', rect: [23, 20, 28, 23], name: 'bookshelf', text: 'Classics, mysteries... and a book called "Home Security 101".' },
  { id: 'sofa', rect: [25, 24, 33, 28], name: 'sofa', text: 'Plush red cushions. You check under them: just crumbs.' },
  { id: 'laptop', rect: [26, 40, 30, 45], name: 'laptop', loot: 800, text: "A brand-new laptop on the study desk. It's coming with you." },
  { id: 'console', rect: [73, 23, 75, 28], name: 'game console', loot: 200, text: "A handheld game console. The kid won't be happy." },
  { id: 'watch', rect: [74, 37, 75, 40], name: 'gold watch', loot: 250, text: 'A gold watch on the nightstand. It ticks into your sack.' },
  { id: 'piggybank', rect: [67, 20, 69, 23], name: 'piggy bank', loot: 60, text: 'A piggy bank on the shelf. Coins jingle as you take it.' },
  { id: 'silverware', rect: [51, 27, 52, 33], name: 'silver cabinet', loot: 350, text: 'The cabinet holds the family silverware. Shiny!' },
  { id: 'pool', rect: [78, 13, 87, 21], name: 'pool', text: "The pool glows in the dusk. A flamingo float drifts lazily. Don't get wet." },
  { id: 'doghouse', rect: [89, 45, 93, 50], name: 'doghouse', text: 'A dog is snoring inside. Tiptoe... tiptoe...' },
  { id: 'shed', rect: [6, 37, 13, 46], name: 'shed', text: 'The shed is padlocked. Rakes and shovels lean inside.' },
  { id: 'mailbox1', rect: [40, 52, 41, 53], name: 'mailbox', text: 'Bills, flyers, and a pizza coupon.' },
  { id: 'mailbox2', rect: [50, 52, 51, 53], name: 'mailbox', text: 'Empty. The neighbors must have already checked.' },
  { id: 'veggies', rect: [86, 32, 92, 41], name: 'vegetable garden', text: 'Tomatoes, carrots and lettuce. Somebody has a green thumb.' },
  { id: 'toilet', rect: [42, 13, 44, 15], name: 'toilet', text: 'Not now!' },
];

/** Where the bandit starts: on the sidewalk outside the front gate (tiles). */
export const SPAWN = { x: 45.5, y: 57.4, facing: 'up' };
