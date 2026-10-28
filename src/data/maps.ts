// The heist maps. Shared by the game and the server, which picks each heist's map.

import { CRUISE_B1_TRAPS, CRUISE_F1_TRAPS, MUSEUM_TRAPS, type TrapSpot } from './traps.ts'; // .ts: also loaded by the Node server

// Each cruise deck is its own map ('cruise-b1', 'cruise-f1'; 'cruise-f2' later), and
// stairwells in a deck's map data name the deck they lead to.
export const MAP_IDS = ['estate', 'museum', 'cruise-b1', 'cruise-f1'] as const;
export type MapId = (typeof MAP_IDS)[number];

export interface MapDef {
  id: MapId;
  name: string;
  description: string;
  /** 1 to 3 stars. */
  difficulty: number;
  /** Generated assets (npm run assets / npm run museum). */
  json: string;
  tileset: string;
  doors: string;
  preview: string;
  /** Where Runners bank their loot, in tiles. */
  getaway: { x: number; y: number; w: number; h: number };
  /**
   * Heists: a room sealed by `doors` that only a keycard opens. The keycard is hidden in other
   * furniture on the same map; the red diamonds start in the vault. Every way in must be one of
   * `doors` (checked with the reachability script).
   */
  vault?: { room: string; doors: string[] };
  traps: TrapSpot[];
}

export const MAPS: Record<MapId, MapDef> = {
  estate: {
    id: 'estate',
    name: 'THE ESTATE',
    description: 'A cozy suburban mansion at dusk. Slip in, grab the valuables, get out.',
    difficulty: 1,
    json: '/assets/map/estate.json',
    tileset: '/assets/tiles/tileset.png',
    doors: '/assets/map/doors.png',
    preview: '/assets/map/preview.jpg',
    getaway: { x: 39.5, y: 55.6, w: 12, h: 3.8 },
    vault: { room: 'Master Bedroom', doors: ['door-master'] },
    // The Estate's traps are all the Saboteur's own now (the early placeholder plates are gone).
    traps: [],
  },
  museum: {
    id: 'museum',
    name: 'MIDNIGHT MUSEUM',
    description: 'Explore the galleries. Outsmart the traps. Escape with the relics.',
    difficulty: 3,
    json: '/assets/maps/museum/map.json',
    tileset: '/assets/maps/museum/tileset.png',
    doors: '/assets/maps/museum/doors.png',
    preview: '/assets/maps/museum/preview.jpg',
    getaway: { x: 34, y: 61.2, w: 24, h: 2.6 },
    vault: { room: 'Restricted Vault', doors: ['vault-door'] },
    traps: MUSEUM_TRAPS,
  },
  'cruise-b1': {
    id: 'cruise-b1',
    name: 'LUXURY CRUISE \u2014 B1',
    description: 'Explore the cargo holds, evade the machinery, and find a way through the ship.',
    difficulty: 2,
    json: '/assets/maps/cruise-b1/map.json',
    tileset: '/assets/maps/cruise-b1/tileset.png',
    doors: '/assets/maps/cruise-b1/doors.png',
    preview: '/assets/maps/cruise-b1/preview.jpg',
    // Bank loot at the cargo loading ramp in the bow.
    getaway: { x: 1.6, y: 28.4, w: 4.4, h: 5.2 },
    vault: { room: 'Fuel Storage', doors: ['door-fuel'] },
    traps: CRUISE_B1_TRAPS,
  },
  'cruise-f1': {
    id: 'cruise-f1',
    name: 'LUXURY CRUISE — F1 MAIN FLOOR',
    description: 'Explore the ballroom, sneak through passenger cabins, and outsmart your rivals aboard the luxury cruise.',
    difficulty: 2,
    json: '/assets/maps/cruise-f1/map.json',
    tileset: '/assets/maps/cruise-f1/tileset.png',
    doors: '/assets/maps/cruise-f1/doors.png',
    preview: '/assets/maps/cruise-f1/preview.jpg',
    // Bank loot at the gangway landing below the main entrance.
    getaway: { x: 55.4, y: 48, w: 7.4, h: 2.2 },
    vault: { room: 'Staff Room', doors: ['door-staff'] },
    traps: CRUISE_F1_TRAPS,
  },
};

/**
 * The cruise ship's decks. A heist on any of them takes place on the whole ship: players
 * move between decks by the stairwells, and each player is on one deck at a time.
 */
export const SHIP_DECKS: MapId[] = ['cruise-b1', 'cruise-f1'];
/** The decks a heist on this map spans (just the map itself, except on the ship). */
export const decksOf = (map: MapId): MapId[] => (SHIP_DECKS.includes(map) ? SHIP_DECKS : [map]);

export const isMapId = (id: unknown): id is MapId => typeof id === 'string' && (MAP_IDS as readonly string[]).includes(id);
