// A heist round: the Saboteur rigs the house (setup), then the Runners go in (live).
// Shared by the game and the server, which runs the clock.

import { trapKind, type TrapKindId } from './trapKinds.ts'; // .ts: also loaded by the Node server
import type { CharacterId } from '../config.ts';

export type Phase = 'setup' | 'live' | 'over';

export const SETUP_MS = 120_000;
export const LIVE_MS = 180_000;

// A match is a few rounds, a different Saboteur each round (everyone gets a turn in crews of
// up to MAX_ROUNDS), the map rotating so the crew sees every arena. Highest total score wins.
export const MAX_ROUNDS = 4;
export const roundsFor = (crew: number) => Math.min(crew, MAX_ROUNDS);
/** The break between rounds (the result card and scoreboard), then the next round starts. */
export const INTERMISSION_MS = 10_000;
/** After the last round's card, how long until the final results screen. */
export const FINAL_DELAY_MS = 6_000;
/** Points. Runners: per diamond you bank yourself, and each if the Runners win the round.
 *  Saboteur: per trap hit, per diamond still not banked at the end, and for winning. */
export const SCORE = { bank: 100, runnersWin: 50, trapHit: 20, unbanked: 50, saboteurWin: 150 };

/** Up to this many players in one heist (one Saboteur, the rest Runners). */
export const MIN_CREW = 2;
export const MAX_CREW = 9;
/** The lobby's biggest pad (drawn as 4 players in the map) is the CUSTOM pad: its party size is
 *  whatever the player picks, from CUSTOM_MIN to MAX_CREW. The 2 and 3 pads are fixed. */
export const CUSTOM_PAD = 4;
export const CUSTOM_MIN = 4;

// The Saboteur's kit grows with the crew: more Runners, more traps to stop them with.
// 2 players: 8 slots, 3: 10, 4: 12 ... 9: 22.
/** Trap slots for a heist of `crew` players. */
export const trapSlots = (crew: number) => 6 + 2 * Math.max(1, crew - 1);
/** Copies of one trap allowed: 2, then 3 from 5 Runners up. Fake Loot: 1, then 2 from 4 Runners. */
export const kindLimit = (kind: TrapKindId, crew: number) => {
  const runners = Math.max(1, crew - 1);
  return kind === 'fakeLoot' ? (runners >= 4 ? 2 : 1) : runners >= 5 ? 3 : 2;
};
/** Energy pays for placing traps: about 25 per slot, so the slots can actually be filled. */
export const SABOTEUR_ENERGY_PER_SLOT = 25;
export const DEEP_POCKETS_BONUS = 30;

export const saboteurMaxEnergy = (character: CharacterId, crew: number) => trapSlots(crew) * SABOTEUR_ENERGY_PER_SLOT + (character === 'zoya' ? DEEP_POCKETS_BONUS : 0);

/** Why another trap of this kind can't be placed, or null if it can. */
export function placementRefusal(placedKinds: Iterable<TrapKindId>, kind: TrapKindId, crew: number): string | null {
  const all = [...placedKinds];
  const slots = trapSlots(crew);
  if (all.length >= slots) return `All ${slots} trap slots are used`;
  const limit = kindLimit(kind, crew);
  if (all.filter((k) => k === kind).length >= limit) return `${trapKind(kind)!.name}: ${limit} per round at most`;
  return null;
}
