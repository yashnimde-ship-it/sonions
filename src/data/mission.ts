// The heist's mission: four objectives the Runners must complete in order.
//   1. Hack the security terminal (hold E at the marked console; a new spot every round).
//      The hack shows which furniture hides the vault's keycard, and unseals the vault.
//   2. Find the keycard and open the vault.
//   3. Grab the Crown Jewel, which appears inside the vault when it opens.
//   4. Escape to the getaway with it: the Runners win.
// Diamonds are still worth points along the way. Shared by the game and the server.

export const MISSION_STEPS = [
  { title: 'Hack the security terminal', short: 'HACK' },
  { title: 'Find the keycard, open the vault', short: 'VAULT' },
  { title: 'Grab the Crown Jewel', short: 'CROWN' },
  { title: 'Escape to the GETAWAY with it', short: 'ESCAPE' },
] as const;

/** Holding E this long at the terminal hacks it. */
export const HACK_MS = 5000;
/** Points for whoever completes each step. */
export const MISSION_POINTS = [100, 100, 50, 200] as const;
