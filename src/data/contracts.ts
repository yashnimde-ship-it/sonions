// Secret Contracts and the Grudge: two reasons to play one more round.
//
// Contracts: every round each player gets a private side mission that fits their mode and role
// (only they see it). The server tracks it and pays CONTRACT_POINTS when it's done.
//
// The Grudge: the server remembers who wronged you (shot you, voted you out, trapped you, caught
// you, betrayed the crew). Next time you're in a game with them, only you see them marked; get
// them back and it's REVENGE_POINTS. Shared by the game and the server.

import type { GameMode } from './hideSeek.ts'; // .ts: also loaded by the Node server

export const CONTRACT_POINTS = 150;
export const REVENGE_POINTS = 200;

export type ContractId =
  | 'bank' | 'bankRed' | 'search' | 'revive' | 'pass' | 'untouched'
  | 'hits' | 'ko' | 'keepRed'
  | 'escape' | 'unshot' | 'catch' | 'quickCatch'
  | 'voteInsider' | 'accused' | 'stash' | 'shoot' | 'frame' | 'noVotes';

export interface ContractDef {
  id: ContractId;
  text: string;
  need: number;
  /** Checked when the round ends (not counted up as it goes). */
  atEnd?: boolean;
  /** Only when this round has a red diamond. */
  needsRed?: boolean;
}

type Role = 'runner' | 'saboteur';

/** The contracts each side can draw, by mode. */
export const CONTRACTS: Record<GameMode, Record<Role, ContractDef[]>> = {
  heist: {
    runner: [
      { id: 'bank', text: 'Bank 2 diamonds yourself', need: 2 },
      { id: 'bankRed', text: 'Bank a red diamond', need: 1, needsRed: true },
      { id: 'search', text: 'Search 6 pieces of furniture', need: 6 },
      { id: 'revive', text: 'Get a knocked-out teammate back up', need: 1 },
      { id: 'pass', text: 'Hand a diamond to a teammate', need: 1 },
      { id: 'untouched', text: 'Never get knocked out this round', need: 1, atEnd: true },
    ],
    saboteur: [
      { id: 'hits', text: 'Catch Runners in traps 4 times', need: 4 },
      { id: 'ko', text: 'Knock out 2 Runners', need: 2 },
      { id: 'keepRed', text: 'Never let a red diamond be banked', need: 1, atEnd: true, needsRed: true },
    ],
  },
  hideSeek: {
    runner: [
      { id: 'escape', text: 'Escape through the main entrance', need: 1 },
      { id: 'unshot', text: 'Survive the hunt without being shot', need: 1, atEnd: true },
    ],
    saboteur: [
      { id: 'catch', text: 'Catch 2 Hiders', need: 2 },
      { id: 'quickCatch', text: 'Catch someone in the first 60s of the hunt', need: 1 },
    ],
  },
  insideJob: {
    // In Inside Job everyone is told 'runner'; the Insider draws from 'saboteur'.
    runner: [
      { id: 'bank', text: 'Bank a diamond yourself', need: 1 },
      { id: 'search', text: 'Search 6 pieces of furniture', need: 6 },
      { id: 'voteInsider', text: 'Vote for the Insider in a meeting', need: 1 },
      { id: 'accused', text: 'Get voted against in a meeting, and survive it', need: 1 },
      { id: 'untouched', text: "Don't get shot or voted out", need: 1, atEnd: true },
    ],
    saboteur: [
      { id: 'stash', text: 'Stash 2 diamonds somewhere new', need: 2 },
      { id: 'shoot', text: 'Shoot a thief', need: 1 },
      { id: 'frame', text: 'Get a thief voted out', need: 1 },
      { id: 'noVotes', text: 'Never get a single vote against you', need: 1, atEnd: true },
    ],
  },
};

/** A random contract for this player this round. */
export function drawContract(mode: GameMode, role: Role, hasRed: boolean): ContractDef {
  const pool = CONTRACTS[mode][role].filter((c) => hasRed || !c.needsRed);
  return pool[Math.floor(Math.random() * pool.length)];
}
