// The heist maps. Shared by the game and the server, which picks each heist's map.

import { CRUISE_B1_TRAPS, MUSEUM_TRAPS, TRAPS, type TrapSpot } from './traps.ts'; // .ts: also loaded by the Node server

// Each cruise deck is its own map ('cruise-b1' now; 'cruise-f1' and 'cruise-f2' later), and
// stairwells in a deck's map data name the deck they lead to.
export const MAP_IDS = ['estate', 'museum', 'cruise-b1'] as const;
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
    preview: '/assets/map/preview.png',
    getaway: { x: 39.5, y: 55.6, w: 12, h: 3.8 },
    traps: TRAPS,
  },
  museum: {
    id: 'museum',
    name: 'MIDNIGHT MUSEUM',
    description: 'Explore the galleries. Outsmart the traps. Escape with the relics.',
    difficulty: 3,
    json: '/assets/maps/museum/map.json',
    tileset: '/assets/maps/museum/tileset.png',
    doors: '/assets/maps/museum/doors.png',
    preview: '/assets/maps/museum/preview.png',
    getaway: { x: 34, y: 61.2, w: 24, h: 2.6 },
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
    preview: '/assets/maps/cruise-b1/preview.png',
    // Bank loot at the cargo loading ramp in the bow.
    getaway: { x: 1.6, y: 28.4, w: 4.4, h: 5.2 },
    traps: CRUISE_B1_TRAPS,
  },
};

export const isMapId = (id: unknown): id is MapId => typeof id === 'string' && (MAP_IDS as readonly string[]).includes(id);
