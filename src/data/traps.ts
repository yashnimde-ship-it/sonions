// Trap plates in the estate, and the rules the game and the server share.
// Positions are art pixels (the plate's centre), picked on clear floor in each room.

export interface TrapSpot {
  id: string;
  room: string;
  x: number;
  y: number;
}

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
export const JAM_REACH = 40;
export const JAM_MS = 3000;
/** Latch's First Aid: how close a hurt Runner must be to patch up. */
export const HEAL_REACH = 48;

/** Whether a fired trap's arm/cooldown cycle has elapsed, including doubled progress during Overclock. */
export function trapIsReady(
  firedAt: number | null | undefined,
  now: number,
  overclock: { startsAt: number; endsAt: number } | null = null,
): boolean {
  if (firedAt == null) return true;
  const elapsed = Math.max(0, now - firedAt);
  const boosted = overclock
    ? Math.max(0, Math.min(now, overclock.endsAt) - Math.max(firedAt, overclock.startsAt))
    : 0;
  return elapsed + boosted >= TRAP_ARM_MS + TRAP_COOLDOWN_MS;
}
