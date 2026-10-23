// The diamonds: the Saboteur hides them inside furniture during setup, the Runners search the
// furniture, carry what they find to the getaway, and win by banking enough of them.
// Shared by the game and the server (the server decides where every diamond really is).

const TILE = 16;

/** Diamonds per heist: fewer for a small crew, so one Runner can still find them in time.
 *  2 players: 5, 3: 7, 4: 9, 5 and up: 11. */
export const diamondCount = (crew: number) => Math.min(11, 3 + 2 * Math.max(1, crew - 1));
/** Banked diamonds the Runners need to win: about 70% (5 -> 4, 7 -> 5, 9 -> 7, 11 -> 8). */
export const diamondsToWin = (total: number) => Math.ceil(total * 0.7);
/** At most this many diamonds in one room, so they're spread round the house. */
export const DIAMONDS_PER_ROOM = 2;
/** Holding E this long searches a piece of furniture. */
export const SEARCH_MS = 1500;
/** How close a Runner's feet must be to a piece of furniture (its edge) to search it, art px. */
export const SEARCH_REACH = 22;
/** How close a Runner must be to pick up a dropped diamond, art px. */
export const PICKUP_REACH = 18;
/** Within this distance a hiding spot with a diamond in it glints for a Runner, art px. */
export const GLINT_REACH = 40;

/** A piece of furniture that can hold a diamond (every interactable in the map). */
export interface HidingSpot {
  id: string;
  name: string;
  /** In tiles, inclusive: [x0, y0, x1, y1]. */
  rect: [number, number, number, number];
}

/** Where a diamond is now. */
export type DiamondPlace =
  | { at: 'tray' } // setup: not hidden yet
  | { at: 'spot'; spot: string } // hidden in furniture
  | { at: 'carried'; by: string }
  | { at: 'floor'; x: number; y: number } // dropped
  | { at: 'banked'; by: string };

export interface Diamond {
  id: string;
  place: DiamondPlace;
}

/** What a Runner may know: hidden diamonds don't say where they are. */
export const runnerView = (d: Diamond): Diamond => (d.place.at === 'spot' || d.place.at === 'tray' ? { id: d.id, place: { at: 'tray' } } : d);

/** A spot's box in art px. */
export const spotBox = (s: HidingSpot) => ({ x0: s.rect[0] * TILE, y0: s.rect[1] * TILE, x1: (s.rect[2] + 1) * TILE, y1: (s.rect[3] + 1) * TILE });

export const spotCenter = (s: HidingSpot) => {
  const b = spotBox(s);
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
};

/** Distance from (x, y) to the edge of a spot (0 inside it), art px. */
export function distToSpot(s: HidingSpot, x: number, y: number) {
  const b = spotBox(s);
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dy = Math.max(b.y0 - y, 0, y - b.y1);
  return Math.hypot(dx, dy);
}

/** The room a spot is in, from the map's area grid. */
export function spotRoom(s: HidingSpot, areas: { names: string[]; data: number[] }, width: number) {
  const c = spotCenter(s);
  const tx = Math.floor(c.x / TILE);
  const ty = Math.floor(c.y / TILE);
  return areas.names[areas.data[ty * width + tx]] ?? '';
}
