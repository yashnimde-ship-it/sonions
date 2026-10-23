// Fixed traps in each map, and the rules the game and the server share.
// Positions are art pixels (the trap's centre), picked on clear floor in each room.

/**
 * What a fixed trap is. 'plate' is the estate's Shock Plate; the rest are Midnight Museum's
 * exhibit traps. They all fire the same way (the Saboteur clicks one, the server broadcasts
 * it), flash a warning while arming, then hit whoever is in their area while active.
 */
export type TrapSpotKind = 'plate' | 'skeleton' | 'painting' | 'spotlight' | 'rolling' | 'sarcophagus';

export interface TrapSpot {
  id: string;
  room: string;
  x: number;
  y: number;
  /** Default 'plate'. */
  kind?: TrapSpotKind;
  /** Area it hits, centred on (x, y), art px (default: a plate, TRAP_RADIUS each way). */
  w?: number;
  h?: number;
  /** Rolling stand: it travels from (x, y) to (toX, toY) while active. */
  toX?: number;
  toY?: number;
}

export interface TrapRules {
  armMs: number;
  activeMs: number;
  cooldownMs: number;
  damage: number;
  stunMs: number;
  /** Shove away from the trap (art px). */
  knock: number;
  /** Spotlight: caught Runners are marked for everyone, and dazzled (slowed) this long. */
  revealMs: number;
  /** Shown to the Saboteur when hovering it. */
  label: string;
}

const RULES: Record<TrapSpotKind, TrapRules> = {
  plate: { armMs: 600, activeMs: 400, cooldownMs: 4000, damage: 25, stunMs: 2000, knock: 0, revealMs: 0, label: 'Shock Plate' },
  skeleton: { armMs: 1000, activeMs: 450, cooldownMs: 9000, damage: 30, stunMs: 2500, knock: 0, revealMs: 0, label: 'Collapsing Skeleton' },
  painting: { armMs: 700, activeMs: 500, cooldownMs: 6000, damage: 15, stunMs: 1200, knock: 26, revealMs: 0, label: 'Swinging Painting' },
  spotlight: { armMs: 500, activeMs: 1200, cooldownMs: 7000, damage: 0, stunMs: 0, knock: 0, revealMs: 4000, label: 'Motion Spotlight' },
  rolling: { armMs: 700, activeMs: 1800, cooldownMs: 8000, damage: 20, stunMs: 1200, knock: 22, revealMs: 0, label: 'Rolling Display Stand' },
  sarcophagus: { armMs: 600, activeMs: 450, cooldownMs: 6000, damage: 0, stunMs: 600, knock: 44, revealMs: 0, label: 'Sarcophagus Scare' },
};

export const trapRules = (spot: TrapSpot): TrapRules => RULES[spot.kind ?? 'plate'];

export const TRAPS: TrapSpot[] = [
  { id: 'hall', room: 'Hallway', x: 760, y: 392 },
  { id: 'living', room: 'Living Room', x: 536, y: 488 },
  { id: 'kitchen', room: 'Kitchen', x: 504, y: 216 },
  { id: 'porch', room: 'Front Porch', x: 712, y: 728 },
  { id: 'master', room: 'Master Bedroom', x: 872, y: 216 },
  { id: 'study', room: 'Study', x: 392, y: 664 },
  { id: 'blue', room: 'Blue Bedroom', x: 1112, y: 408 },
  { id: 'purple', room: 'Purple Bedroom', x: 1064, y: 664 },
];

/**
 * Midnight Museum: its exhibit traps, plus Shock Plates in the smaller rooms.
 * Coordinates are tiles x 16 (the museum is laid out in tiles, see map/museumLayout.mjs).
 */
const T = 16;
export const MUSEUM_TRAPS: TrapSpot[] = [
  { id: 'rexfall', room: 'Grand Hall', kind: 'skeleton', x: 52.3 * T, y: 32.2 * T, w: 32, h: 112 },
  { id: 'trexfall', room: 'Dinosaur Exhibit', kind: 'skeleton', x: 20.5 * T, y: 32.4 * T, w: 96, h: 28 },
  { id: 'painting-a', room: 'Classical Art Wing', kind: 'painting', x: 61.9 * T, y: 12.2 * T, w: 48, h: 44 },
  { id: 'painting-b', room: 'Classical Art Wing', kind: 'painting', x: 67.6 * T, y: 12.2 * T, w: 60, h: 44 },
  { id: 'spotlight', room: 'Modern Art Gallery', kind: 'spotlight', x: 84 * T, y: 21 * T, w: 80, h: 80 },
  { id: 'stand', room: 'Royal Treasures', kind: 'rolling', x: 57.4 * T, y: 33.8 * T, toX: 75 * T, toY: 33.8 * T, w: 28, h: 28 },
  { id: 'mummy', room: 'Ancient Egypt Gallery', kind: 'sarcophagus', x: 44 * T, y: 13.9 * T, w: 128, h: 48 },
  { id: 'gift', room: 'Gift Shop', x: 10 * T, y: 41 * T },
  { id: 'cafe', room: 'Cafeteria', x: 25.5 * T, y: 40.8 * T },
  { id: 'marine', room: 'Temporary Exhibit', x: 82 * T, y: 36.2 * T },
  { id: 'staff', room: 'Staff Area', x: 79 * T, y: 49.8 * T },
  { id: 'entrance', room: 'Main Entrance', x: 45 * T, y: 48 * T },
  { id: 'security', room: 'Security Room', x: 11 * T, y: 18 * T },
  { id: 'workshop', room: 'Restoration Workshop', x: 28 * T, y: 11.6 * T },
  { id: 'restroom', room: 'Restrooms', x: 61.6 * T, y: 46.6 * T },
];

/** Luxury Cruise B1: Shock Plates in the corridors and rooms (tiles x 16, see map/cruiseB1Layout.mjs). */
export const CRUISE_B1_TRAPS: TrapSpot[] = [
  { id: 'cargo', room: 'Cargo Hold', x: 18 * T, y: 27.5 * T },
  { id: 'corridor-w', room: 'Corridor', x: 30 * T, y: 26.2 * T },
  { id: 'corridor-e', room: 'Corridor', x: 70 * T, y: 26.2 * T },
  { id: 'crew', room: 'Crew Quarters', x: 47.5 * T, y: 19.6 * T },
  { id: 'engine', room: 'Engine Room', x: 40.4 * T, y: 36.8 * T },
  { id: 'maint', room: 'Maintenance', x: 66 * T, y: 38 * T },
  { id: 'aft', room: 'Corridor', x: 76.2 * T, y: 40 * T },
  { id: 'pump', room: 'Water Pump Room', x: 82 * T, y: 49 * T },
];

/** Luxury Cruise F1: Shock Plates on open floor (tiles x 16, see map/cruiseF1Layout.mjs). */
export const CRUISE_F1_TRAPS: TrapSpot[] = [
  { id: 'f1-promenade-w', room: 'Promenade', x: 41.4 * T, y: 22 * T },
  { id: 'f1-ballroom', room: 'Grand Ballroom', x: 58.6 * T, y: 24 * T },
  { id: 'f1-restaurant', room: 'Restaurant', x: 26 * T, y: 25.8 * T },
  { id: 'f1-lounge', room: 'Lounge & Bar', x: 88 * T, y: 20.6 * T },
  { id: 'f1-cabins-a', room: 'Passenger Cabins A', x: 32 * T, y: 39.6 * T },
  { id: 'f1-cabins-b', room: 'Passenger Cabins B', x: 85 * T, y: 39.6 * T },
  { id: 'f1-entrance', room: 'Main Entrance', x: 58.6 * T, y: 44 * T },
  { id: 'f1-side-deck', room: 'Side Deck', x: 104 * T, y: 28 * T },
  { id: 'f1-front-deck', room: 'Front Deck', x: 9 * T, y: 32 * T },
];

/** Where a rolling stand is `t` (0..1) of the way through its run; other traps stay put. */
export function trapPosition(spot: TrapSpot, t: number): [number, number] {
  if (spot.toX === undefined || spot.toY === undefined) return [spot.x, spot.y];
  const k = Math.max(0, Math.min(1, t));
  return [spot.x + (spot.toX - spot.x) * k, spot.y + (spot.toY - spot.y) * k];
}

/** Is the point (art px) inside the trap's area? A rolling stand is where it is at time t. */
export function inTrapArea(spot: TrapSpot, x: number, y: number, t = 0): boolean {
  const [cx, cy] = trapPosition(spot, t);
  if (spot.kind === 'spotlight') return Math.hypot(x - cx, y - cy) <= (spot.w ?? 2 * TRAP_RADIUS) / 2;
  if (spot.kind === undefined || spot.kind === 'plate') return Math.hypot(x - cx, y - cy) <= TRAP_RADIUS;
  return Math.abs(x - cx) <= (spot.w ?? 2 * TRAP_RADIUS) / 2 && Math.abs(y - cy) <= (spot.h ?? 2 * TRAP_RADIUS) / 2;
}

/** Half the plate's width (art px): a Runner whose feet are this close is on it. */
export const TRAP_RADIUS = 14;
/** The warning flash before it fires, then how long it stays live. */
export const TRAP_ARM_MS = 600;
export const TRAP_ACTIVE_MS = 400;
/** Time before the same plate can fire again. */
export const TRAP_COOLDOWN_MS = 4000;
export const OVERCLOCK_MS = 5000;
export const OVERCLOCK_COOLDOWN_MS = 20_000;
export const TRIPWIRE_COOLDOWN_MS = 20_000;
/** What a shock does to a Runner. */
export const TRAP_DAMAGE = 25;
export const TRAP_STUN_MS = 2000;
/** Runners' health. */
export const MAX_HP = 100;
/** Patch's Trap Jam: how close a plate must be, and how long it stays jammed. */
/** Trap Jam reaches every trap this close (art px), map traps and placed ones alike. */
export const JAM_REACH = 56;
export const JAM_MS = 5000;
/** Latch's First Aid: how close a hurt Runner must be to patch up. */
export const HEAL_REACH = 48;

/** Whether a fired trap's arm/cooldown cycle has elapsed, including doubled progress during Overclock. */
export function trapIsReady(
  firedAt: number | null | undefined,
  now: number,
  overclock: { startsAt: number; endsAt: number } | null = null,
  rules: { armMs: number; cooldownMs: number } = { armMs: TRAP_ARM_MS, cooldownMs: TRAP_COOLDOWN_MS },
): boolean {
  if (firedAt == null) return true;
  const elapsed = Math.max(0, now - firedAt);
  const boosted = overclock
    ? Math.max(0, Math.min(now, overclock.endsAt) - Math.max(firedAt, overclock.startsAt))
    : 0;
  return elapsed + boosted >= rules.armMs + rules.cooldownMs;
}
