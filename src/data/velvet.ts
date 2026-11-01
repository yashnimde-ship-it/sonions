// Velvet's Energy Sprint: a 100-point bar that drains while it's on and refills while it's off.

export const VELVET = {
  max: 100,
  /** Energy a second while it's on (a full bar lasts 4 s). */
  drainPerSec: 25,
  /** Energy a second while it's off (8 s from empty), once `refillDelayMs` has passed. */
  refillPerSec: 12.5,
  refillDelayMs: 1000,
  /** It won't switch on with less than this. */
  minToStart: 20,
  /** How much faster she moves while it's on (on top of walking or Shift-sprinting). */
  speed: 1.4,
};

/** On or off since `since` (ms), with `energy` at that moment. */
export interface Energy {
  on: boolean;
  energy: number;
  since: number;
}

/** The bar at `now`: the server and the game work it out the same way. */
export function energyAt(e: Energy, now: number) {
  if (e.on) return Math.max(0, e.energy - (VELVET.drainPerSec * (now - e.since)) / 1000);
  return Math.min(VELVET.max, e.energy + (VELVET.refillPerSec * Math.max(0, now - e.since - VELVET.refillDelayMs)) / 1000);
}
