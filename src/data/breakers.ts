// Fuse boxes (Among Us's "Fix Lights", heist style): the Saboteur can cut the wires of a fuse
// box from their camera, paying energy (the same energy traps cost). The lights go out for the
// Runners until one of them gets to that box and flips its switches back on. Both sides use the
// same piece of the house. Shared by the game and the server.

export const BREAKER = {
  /** Fuse boxes per heist (on the ship, one per deck). */
  count: 2,
  /** Energy a cut costs the Saboteur. */
  cutCost: 40,
  /** After a repair, the Saboteur waits this long before cutting again. */
  cooldownMs: 30_000,
  /** A repair can't be finished sooner than this after the cut. */
  fixMinMs: 1_500,
  fixPoints: 50,
  /** Switches in the repair panel. */
  switches: 5,
  /** How far a Runner sees with the lights out (art px). */
  darkSight: 80,
};
