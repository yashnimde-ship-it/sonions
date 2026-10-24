// What the floor is made of, room by room, so footsteps sound right: wood, metal, carpet, stone,
// grass or tile. Each map has a default for rooms not listed.

export type Surface = 'wood' | 'metal' | 'carpet' | 'stone' | 'grass' | 'tile';

const DEFAULT: Record<string, Surface> = { lobby: 'wood', estate: 'wood', museum: 'stone', 'cruise-b1': 'metal', 'cruise-f1': 'carpet' };

const ROOMS: Record<string, Record<string, Surface>> = {
  estate: {
    Kitchen: 'tile',
    Bathroom: 'tile',
    'Powder Room': 'tile',
    'Master Bedroom': 'carpet',
    'Blue Bedroom': 'carpet',
    'Purple Bedroom': 'carpet',
    'Living Room': 'carpet',
    Study: 'carpet',
    Garden: 'grass',
    'Front Yard': 'grass',
    Backyard: 'grass',
    Garage: 'stone',
    Driveway: 'stone',
    Street: 'stone',
    'Front Porch': 'stone',
    'Pool Deck': 'stone',
  },
  museum: {
    'Royal Treasures': 'carpet',
    'Classical Art Wing': 'carpet',
    'Restricted Vault': 'metal',
    'Security Room': 'metal',
    'Storage Room': 'metal',
    'Restoration Workshop': 'wood',
    Cafeteria: 'tile',
    "Men's Restroom": 'tile',
    "Women's Restroom": 'tile',
    'Museum Gardens': 'grass',
  },
  'cruise-b1': {
    Laundry: 'tile',
  },
  'cruise-f1': {
    Promenade: 'wood',
    'Front Deck': 'wood',
    'Side Deck': 'wood',
    'Main Entrance': 'wood',
    'Grand Ballroom': 'wood',
    Kitchen: 'tile',
    "Men's Restroom": 'tile',
    "Women's Restroom": 'tile',
    'Staff Room': 'tile',
    'Crew Lounge': 'tile',
    'Central Stairwell': 'metal',
  },
};

/** The floor in `room` on `map` (a map id, or 'lobby'). */
export const surfaceAt = (map: string, room: string): Surface => ROOMS[map]?.[room] ?? DEFAULT[map] ?? 'stone';
