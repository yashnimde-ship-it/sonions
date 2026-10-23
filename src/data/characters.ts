import type { CharacterId } from '../config.ts'; // .ts: also loaded by the Node server

export type Role = 'runner' | 'saboteur';
export const DOOR_JAM_DURATION_MS = 8000;

export type AbilityId =
  | 'quickstep'
  | 'overclock'
  | 'trapJam'
  | 'tripwire'
  | 'steadyCarry'
  | 'deepPockets'
  | 'shakeItOff'
  | 'trapRefresh'
  | 'firstAid'
  | 'doorJam';

export interface Ability {
  id: AbilityId;
  name: string;
  blurb: string;
  /** Seconds between uses; 0 for passives. */
  cooldown: number;
  /** Uses per round (every active ability is limited; passives aren't). */
  perRound?: number;
  passive?: boolean;
  /**
   * The game system the ability acts on. Abilities whose system isn't in yet show as
   * "coming soon" instead of doing nothing silently.
   */
  needs?: 'traps' | 'energy' | 'loot' | 'stuns' | 'health' | 'doors';
}

/** Every character has one ability per role, so any pick works whichever role you get. */
export const ABILITIES: Record<AbilityId, Ability> = {
  quickstep: { id: 'quickstep', name: 'Quickstep', blurb: 'Dash 4 steps ahead, even from standing still.', cooldown: 10, perRound: 5 },
  overclock: { id: 'overclock', name: 'Overclock', blurb: 'Trap cooldowns tick twice as fast for 5s.', cooldown: 20, perRound: 3 },
  trapJam: { id: 'trapJam', name: 'Trap Jam', blurb: 'Jams every trap near you for 5s, and shows you the hidden ones.', cooldown: 15, perRound: 3 },
  tripwire: { id: 'tripwire', name: 'Tripwire', blurb: 'Mid-heist, aim at the floor to lay a hidden trip line (a free Snare).', cooldown: 20, perRound: 3 },
  steadyCarry: { id: 'steadyCarry', name: 'Steady Carry', blurb: 'Loot slows her down half as much. Always on.', cooldown: 0, passive: true },
  deepPockets: { id: 'deepPockets', name: 'Deep Pockets', blurb: 'Starts every round with +30 max energy.', cooldown: 0, passive: true },
  shakeItOff: { id: 'shakeItOff', name: 'Shake It Off', blurb: 'Instantly break free of a trap stun or knockout.', cooldown: 35, perRound: 3 },
  trapRefresh: { id: 'trapRefresh', name: 'Trap Refresh', blurb: 'Aim at a trap that just went off to make it ready again.', cooldown: 0, perRound: 1 },
  firstAid: { id: 'firstAid', name: 'First Aid', blurb: 'Heals herself or the most hurt Runner nearby to full HP, even from a knockout.', cooldown: 30, perRound: 3 },
  doorJam: { id: 'doorJam', name: 'Door Jam', blurb: 'Aim at a door to slam it shut and lock it for 8s.', cooldown: 15, perRound: 3 },
};

export interface CharacterInfo {
  id: CharacterId;
  name: string;
  nick: string;
  runner: AbilityId;
  saboteur: AbilityId;
  /** Name-tag and card accent colour. */
  color: string;
}

export const CHARACTER_INFO: Record<CharacterId, CharacterInfo> = {
  maya: { id: 'maya', name: 'Maya Rao', nick: 'Zip', runner: 'quickstep', saboteur: 'overclock', color: '#2ec4b6' },
  dev: { id: 'dev', name: "Dev D'Souza", nick: 'Patch', runner: 'trapJam', saboteur: 'tripwire', color: '#ff8a3d' },
  zoya: { id: 'zoya', name: 'Zoya Khan', nick: 'Mule', runner: 'steadyCarry', saboteur: 'deepPockets', color: '#ffc94a' },
  rex: { id: 'rex', name: 'Rex Malhotra', nick: 'Rattle', runner: 'shakeItOff', saboteur: 'trapRefresh', color: '#e0409a' },
  iris: { id: 'iris', name: 'Iris Iyer', nick: 'Latch', runner: 'firstAid', saboteur: 'doorJam', color: '#8f7cff' },
};

export const abilityFor = (id: CharacterId, role: Role) => ABILITIES[CHARACTER_INFO[id][role]];
