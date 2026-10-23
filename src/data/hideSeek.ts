// Hide & Seek ("Lights Out"): the Saboteur is the ship's owner, the Seeker, with a gun and a
// flashlight; everyone else hides in the dark. Rules follow the usual hide-and-seek games
// (Prop Hunt, Hide or Die): the Seeker is blinded while the Hiders scatter, misses cost the
// Seeker, and the Hiders win by surviving. Shared by the game and the server.

import type { MapId } from './maps.ts'; // .ts: also loaded by the Node server

export type GameMode = 'heist' | 'hideSeek';
export const isGameMode = (m: unknown): m is GameMode => m === 'heist' || m === 'hideSeek';

/** Hide & Seek needs a crowd to be fun: a smaller crew plays a heist instead. */
export const HIDE_SEEK_MIN_PLAYERS = 3;
/** Always on the cruise ship (both decks, joined by the stairs), starting on the main floor. */
export const HIDE_SEEK_MAP: MapId = 'cruise-f1';

/** The Seeker counts in the Staff Room while the Hiders scatter. */
export const HIDE_MS = 30_000;
/** Then the hunt; for its last ESCAPE_MS the main entrance is open and Hiders can get out. */
export const HUNT_MS = 225_000;
export const ESCAPE_MS = 45_000;

/** Where the Seeker counts (tiles, on the main floor): the Staff Room. */
export const SEEKER_START = { x: 98.4, y: 44.2 };
/** The open gangway at the main entrance, where Hiders escape (tiles, main floor). */
export const ESCAPE_ZONE = { x: 54.6, y: 48.2, w: 8.6, h: 2.2 };

/** How far each side can see in the dark (art px). Hiders: a round light that isn't stopped by
 *  walls or furniture (kept under HIDER_SEES_SEEKER). Seeker: a flashlight cone ahead (and a
 *  little glow round their feet). */
export const HIDER_LIGHT = 100;
export const SEEKER_GLOW = 26;
export const FLASHLIGHT_RANGE = 170;
export const FLASHLIGHT_HALF_ANGLE = Math.PI / 5;

/** The server only tells you where someone is when you could plausibly see them (art px). */
export const HIDER_SEES_SEEKER = 120;
export const SEEKER_SEES_HIDERS = FLASHLIGHT_RANGE + 12;

/** The Seeker's gun. Hits are checked by the server along the same walls the light stops at. */
export const GUN = {
  /** Shots before a reload, and how long a reload takes (it starts by itself when empty). */
  ammo: 6,
  reloadMs: 2000,
  /** Shortest time between two shots. */
  fireMs: 350,
  /** How far a shot carries (art px), a little past the flashlight. */
  range: 210,
  /** A Hider has 100 HP: two hits and they're caught. */
  damage: 50,
  /** A shot that hits nobody costs the Seeker this much of their own 100 HP; at 0 the Hiders win. */
  missPenalty: 5,
  /** How close a shot must pass to a Hider's body to hit (art px). */
  hitRadius: 10,
};
export const SEEKER_HP = 100;

/** A hiding place from the map (the layout's HIDING_SPOTS), box in tiles. */
export interface HideSpot {
  id: string;
  room: string;
  box: [number, number, number, number];
}
/** "hide-wardrobe-a2" -> "wardrobe". */
export const hideSpotName = (id: string) => id.replace(/^hide-/, '').replace(/-[a-z]\d+$/, '').replace(/-/g, ' ');
/** How close you must be to a hiding place (its edge, art px) to hide in it or search it. */
export const HIDE_REACH = 20;
export const hideSpotCenter = (s: HideSpot) => ({ x: ((s.box[0] + s.box[2]) / 2) * 16, y: ((s.box[1] + s.box[3]) / 2) * 16 });
export function distToHideSpot(s: HideSpot, x: number, y: number) {
  const [x0, y0, x1, y1] = s.box.map((v) => v * 16);
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));
}
/** A sprinting Hider is heard by the Seeker this far away (art px), every NOISE_MS. */
export const NOISE_RANGE = 320;
export const NOISE_MS = 500;

/** Points in Hide & Seek: the Seeker per Hider caught and for a win; a Hider for surviving
 *  the hunt, and a bonus for getting out through the main entrance. */
export const HS_SCORE = { catch: 100, seekerWin: 150, survive: 150, escape: 50 };

/** Hide & Seek abilities, checked by the server. The Seeker's Flare (Q) lights their whole
 *  deck for a moment: every Hider out in the open shows up (and sees the flash, so can run).
 *  Their Heartbeat scan (C) shows which hiding places near them have someone inside. A
 *  Hider's Boost (Q) is a burst of speed, loud enough for the Seeker to hear. */
export type HsAbility = 'flare' | 'scan' | 'boost';
export const isHsAbility = (a: unknown): a is HsAbility => a === 'flare' || a === 'scan' || a === 'boost';
export const FLARE = { ms: 1500, uses: 3, cooldownMs: 20_000 };
export const SCAN = { ms: 2000, range: 320, cooldownMs: 45_000 };
export const BOOST = { ms: 5000, cooldownMs: 60_000, speed: 1.6 };
