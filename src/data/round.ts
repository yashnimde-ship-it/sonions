// A heist round: the Saboteur rigs the house (setup), then the Runners go in (live).
// Shared by the game and the server, which runs the clock.

import { trapKind, type TrapKindId } from './trapKinds.ts'; // .ts: also loaded by the Node server
import type { CharacterId } from '../config.ts';

export type Phase = 'setup' | 'live' | 'over';

export const SETUP_MS = 75_000;
export const LIVE_MS = 240_000;

/** Traps the Saboteur may place during setup, and how many of one kind. */
export const TRAP_SLOTS = 8;
export const MAX_PER_KIND = 2;
export const MAX_FAKE_LOOT = 1;
export const SABOTEUR_BASE_ENERGY = 200;
export const DEEP_POCKETS_BONUS = 30;

export const saboteurMaxEnergy = (character: CharacterId) => SABOTEUR_BASE_ENERGY + (character === 'zoya' ? DEEP_POCKETS_BONUS : 0);

/** How many of this kind may go down, given what's already placed. */
export const kindLimit = (kind: TrapKindId) => (kind === 'fakeLoot' ? MAX_FAKE_LOOT : MAX_PER_KIND);

/** Why another trap of this kind can't be placed, or null if it can. */
export function placementRefusal(placedKinds: Iterable<TrapKindId>, kind: TrapKindId): string | null {
  const all = [...placedKinds];
  if (all.length >= TRAP_SLOTS) return `All ${TRAP_SLOTS} trap slots are used`;
  if (all.filter((k) => k === kind).length >= kindLimit(kind)) return `${trapKind(kind)!.name}: ${kindLimit(kind)} per round at most`;
  return null;
}
