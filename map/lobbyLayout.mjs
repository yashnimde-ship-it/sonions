// The safehouse lobby, traced from the lobby reference (public/reference/lobby-reference.png,
// scaled to 70 x 40 tiles of 16 px, the estate's scale). Everything is in tiles:
// boxes are [x0, y0, x1, y1] with the end exclusive.
//
// The reference is a finished screenshot with UI painted over parts of the room. Those
// parts are REPAIRED (filled from the floor or wall beside them); the game draws its own
// UI there. Each PROP is cut out of the reference as its own sprite, then placed back by
// this layout, so props can be moved or reused. See scripts/generate-lobby.mjs.

export const REFERENCE = 'public/reference/lobby-reference.png';
export const WIDTH = 70;
export const HEIGHT = 40;

/**
 * UI painted into the reference, and how to fill each area. Either `tile` (a clean patch
 * that's repeated, mirrored, across the area) or `from` (the side whose strip, `span`
 * tiles wide, is repeated). `shade` darkens rooms that sit under the game's own panels.
 */
const WOOD = [20.6, 20.0, 23.4, 24.0]; // plain floorboards on the hall's west side
const WALL = [55.5, 20.4, 63.5, 21.6]; // the dark wall band between garage and wardrobe room
export const REPAIRS = [
  { id: 'branding', box: [1.6, 1.1, 24.7, 8.0], tile: WOOD },
  { id: 'nav', box: [1.4, 9.0, 12.0, 23.0], tile: WOOD },
  { id: 'lobby-panel', box: [52.3, 1.4, 69.0, 9.0], tile: WALL },
  { id: 'profile', box: [1.4, 31.4, 20.2, 38.0], tile: WOOD },
  { id: 'start', box: [49.4, 31.5, 68.7, 38.5], tile: WALL },
  { id: 'customize', box: [54.4, 22.5, 61.7, 24.7], from: 'right', span: 2.2 },
  // The portal pads and their signs: the game draws live ones, so this becomes plain floor.
  { id: 'portals-left', box: [23.4, 24.0, 35.2, 31.0], from: 'left', span: 2.9 },
  { id: 'portals-right', box: [35.2, 24.0, 47.1, 31.0], from: 'right', span: 2.0 },
];

/**
 * Props cut from the reference: each becomes public/assets/lobby/props/<id>.png. `solid`
 * props block movement over their whole box (the lobby draws players over everything,
 * so nothing may be walked onto), or over `hit` instead where the box's edges are mostly
 * empty and would choke a doorway.
 */
export const PROPS = [
  // North wall
  { id: 'fireplace', box: [31.0, 0.0, 39.6, 5.3], solid: true },
  { id: 'plant-fireplace', box: [25.9, 1.1, 28.4, 5.1], solid: true },
  { id: 'bookshelf', box: [40.2, 0.0, 46.6, 4.7], solid: true },
  { id: 'table-lamp', box: [48.0, 0.4, 50.2, 4.9], solid: true },
  // Lounge around the planning table
  { id: 'sofa-north', box: [31.3, 6.0, 38.7, 9.0], solid: true },
  { id: 'lamp-west', box: [27.5, 6.8, 29.0, 9.3], solid: true },
  { id: 'plant-west', box: [29.0, 6.5, 31.3, 9.1], solid: true },
  { id: 'plant-east', box: [38.9, 6.2, 41.3, 8.8], solid: true },
  { id: 'lamp-east', box: [41.3, 7.1, 42.3, 9.4], solid: true },
  { id: 'planning-table', box: [25.2, 9.5, 44.8, 20.0], solid: true },
  { id: 'sofa-south', box: [30.2, 19.4, 39.8, 21.5], solid: true },
  { id: 'side-table', box: [32.0, 21.5, 38.0, 23.9], solid: true },
  // Hall, east side
  { id: 'plant-hall-east', box: [50.2, 19.1, 52.0, 23.5], solid: true },
  { id: 'cabinet-hall', box: [50.3, 23.4, 51.9, 26.3], solid: true, hit: [50.4, 23.4, 51.7, 25.5] },
  { id: 'lamp-plant-hall', box: [49.2, 27.3, 52.0, 31.3], solid: true, hit: [49.5, 28.8, 51.6, 31.3] },
  // Hall, west side
  { id: 'plant-hall-west', box: [20.2, 15.1, 22.1, 19.8], solid: true },
  // Stairs and porch
  { id: 'plant-stairs-west', box: [20.6, 31.0, 24.0, 36.9], solid: true },
  { id: 'railing-west', box: [24.0, 31.9, 30.1, 35.5], solid: true },
  { id: 'lamp-post-west', box: [27.3, 33.3, 29.1, 37.1], solid: true },
  { id: 'pillar-west', box: [29.8, 31.0, 31.2, 37.4], solid: true },
  { id: 'plant-step-west', box: [31.0, 35.4, 32.5, 37.4], solid: true },
  { id: 'plant-step-east', box: [37.6, 35.4, 39.0, 37.4], solid: true },
  { id: 'pillar-east', box: [38.9, 31.0, 40.4, 37.4], solid: true },
  { id: 'railing-east', box: [40.3, 31.9, 46.6, 35.5], solid: true },
  { id: 'lamp-post-east', box: [41.0, 33.3, 42.9, 37.1], solid: true },
  { id: 'plant-stairs-east', box: [46.0, 31.0, 49.5, 36.9], solid: true },
  // Garage
  { id: 'car', box: [57.8, 9.6, 62.5, 19.5], solid: true },
  { id: 'garage-shelves-west', box: [53.0, 8.8, 55.3, 20.3], solid: true },
  { id: 'garage-shelves-east', box: [65.0, 9.6, 66.5, 18.1], solid: true },
  { id: 'compressor', box: [64.0, 18.4, 66.5, 20.3], solid: true },
  // Wardrobe room
  { id: 'wardrobe', box: [54.4, 24.1, 64.2, 30.0], solid: true, hit: [54.5, 24.1, 64.1, 29.5] },
  { id: 'cabinet-wardrobe', box: [64.0, 23.5, 67.7, 31.1], solid: true },
];

/** Walls and the rooms under the game's panels: solid, never walked on. */
export const WALLS = [
  [0, 0, 20.2, 40], // west rooms (under the menu and profile) and the hall's west wall
  [20.2, 0, 25.2, 8.4], // under the title badge
  [20.2, 0, 52.0, 2.6], // north wall
  [52.0, 0, 53.0, 14.4], // hall's east wall, with doorways to the garage and the wardrobe room
  [52.0, 17.8, 53.0, 25.8],
  [52.0, 28.3, 53.0, 40],
  [53.0, 0, 70, 8.9], // garage's north wall (under the lobby panel)
  [66.5, 8.9, 70, 21.9], // garage's east wall
  [53.0, 20.2, 67.6, 24.2], // between garage and wardrobe room, and its wall face
  [67.6, 21.9, 70, 40], // east of the wardrobe room
  [49.5, 31.7, 70, 40], // under the Start panel
  // Below the porch is the street: nobody goes down there. Only the steps between the pillars
  // stay open (they're walkable down to the pillars' feet), so no one can get stuck in a pocket.
  [20.2, 35.5, 31.0, 40],
  [39.0, 35.5, 49.5, 40],
  [31.0, 37.4, 39.0, 40],
];

/** The real estate map, printed on the planning table (the inner, grassy part of the board). */
export const TABLE_MAP = [28.0, 10.3, 42.4, 18.8];

/** Party portals: the pads under the table. Signs hang just above them. */
export const PORTALS = [
  { size: 2, x: 23.8, y: 25.8, w: 6.8, h: 4.7 },
  { size: 3, x: 31.8, y: 25.8, w: 6.7, h: 4.7 },
  { size: 4, x: 39.9, y: 25.8, w: 6.8, h: 4.7 },
];

/** Stand here (in front of the wardrobe and mirror) and press E to customize; the sign hangs at `prompt`. */
export const WARDROBE = { x: 53.0, y: 24.2, w: 11.0, h: 7.5, prompt: { x: 58.1, y: 23.5 } };
/** Stand around the planning table and press E to pick the map (the host) or look at the maps. */
export const PLANNING_TABLE = { x: 23.6, y: 8.0, w: 22.8, h: 14.0, prompt: { x: 35.0, y: 19.9 } };
/** The garage's side door: the getaway car is behind it (the workbench fills the garage's west
 *  side, so the car itself can't be walked up to). E here starts the heist (host) or readies up. */
export const GARAGE_DOOR = { x: 50.0, y: 14.0, w: 3.0, h: 4.0, prompt: { x: 57.8, y: 13.2 } };

/** The masked-burglar mascot in the reference's title badge (reference pixels): circle centre and radius. */
export const MASCOT = { cx: 120, cy: 102, r: 47 };

/** Lamps for the runtime glow: x, y, radius (tiles). The reference is already lit, so these are soft. */
export const LIGHTS = [
  { x: 35.3, y: 3.6, r: 6 }, // fireplace
  { x: 28.3, y: 7.4, r: 4 },
  { x: 41.8, y: 7.6, r: 4 },
  { x: 49.1, y: 2.2, r: 4 },
  { x: 44.4, y: 11.8, r: 5 }, // table lamp
  { x: 35, y: 15, r: 9 }, // over the planning table
  { x: 28.2, y: 34.2, r: 4 },
  { x: 41.9, y: 34.2, r: 4 },
  { x: 50.8, y: 28.3, r: 3.5 },
  { x: 65.0, y: 27.0, r: 4 },
  { x: 60.2, y: 14.5, r: 6 }, // garage
  { x: 35.2, y: 28.2, r: 9 }, // the portals' glow
  { x: 7.0, y: 20.0, r: 4 }, // the den's lounge
  { x: 10.5, y: 35.0, r: 6 }, // the stash
];

/**
 * Decor painted over the room as drawn (pieces of art, blended in; no collision: the west
 * wing is walled off from the hall). `file` is relative to the project, placed at (x, y) in tiles.
 */
export const DECOR = [
  // Where the reference had its menu and profile card painted in (plain floor once repaired):
  // the den in the west wing (a desk on a green rug, then the lounge's sofa on a red rug), and
  // the stash along the south wall (the crew's loot: crates, a tarp-covered pallet, a case of gold).
  { id: 'den', file: 'art/lobby/den.png', x: 1.375, y: 9.0 },
  { id: 'stash', file: 'art/lobby/stash.png', x: 1.375, y: 31.4 },
];

export const SPAWN = { x: 28.5, y: 23.6 };
