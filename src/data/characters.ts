import type { CharacterId } from '../config.ts'; // .ts: also loaded by the Node server

export type Role = 'runner' | 'saboteur';
export const DOOR_JAM_DURATION_MS = 8000;

export type AbilityId =
  | 'quickstep'
  | 'overclock'
  | 'trapJam'
  | 'wingman'
  | 'tripwire'
  | 'heavyCarry'
  | 'deepPockets'
  | 'shakeItOff'
  | 'shield'
  | 'clone'
  | 'mend'
  | 'empKnife'
  | 'trapRefresh'
  | 'firstAid'
  | 'doorJam'
  | 'comingSoon';

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
  needs?: 'traps' | 'energy' | 'loot' | 'stuns' | 'health' | 'doors' | 'abilities';
}

/** Every character has one ability per role, so any pick works whichever role you get. */
export const ABILITIES: Record<AbilityId, Ability> = {
  quickstep: { id: 'quickstep', name: 'Quickstep', blurb: 'Dash 4 steps ahead, even from standing still.', cooldown: 10, perRound: 5 },
  overclock: { id: 'overclock', name: 'Overclock', blurb: 'Trap cooldowns tick twice as fast for 5s.', cooldown: 20, perRound: 3 },
  // Nobody has Trap Jam right now (Patch has Wingman); its jam is kept for Scout's EMP knife.
  trapJam: { id: 'trapJam', name: 'Trap Jam', blurb: 'Jams every trap near you for 5s, and shows you the hidden ones.', cooldown: 15, perRound: 3 },
  wingman: { id: 'wingman', name: 'Wingman', blurb: 'Sends a drone to search the nearest furniture you face. A find drops out on the floor.', cooldown: 15, perRound: 3 },
  tripwire: { id: 'tripwire', name: 'Tripwire', blurb: 'Mid-heist, aim at the floor to lay a hidden trip line (a free Snare).', cooldown: 20, perRound: 3 },
  heavyCarry: { id: 'heavyCarry', name: 'Heavy Carry', blurb: 'Carries 2 diamonds at once, and loot slows her 60% less. Always on.', cooldown: 0, passive: true },
  deepPockets: { id: 'deepPockets', name: 'Deep Pockets', blurb: 'Starts every round with +30 max energy.', cooldown: 0, passive: true },
  shield: { id: 'shield', name: 'Shield', blurb: 'Absorbs one hit completely (no damage, no stun). Bank 2 diamonds to recharge it. Always on.', cooldown: 0, passive: true },
  clone: { id: 'clone', name: 'Clone', blurb: 'Sends a clone running straight ahead: traps on its path show up for the crew. 2 charges; bank 2 diamonds to refill.', cooldown: 2 },
  mend: { id: 'mend', name: 'Mend', blurb: 'Tap Q and stand still: teammates within 3 tiles heal 10 HP a second for 4s (not her, not anyone down).', cooldown: 20, perRound: 3 },
  empKnife: { id: 'empKnife', name: 'EMP Knife', blurb: 'Throws a knife straight ahead: every trap within 3.5 tiles of where it lands is off for 5s, hidden ones shown to the crew.', cooldown: 15, perRound: 3 },
  shakeItOff: { id: 'shakeItOff', name: 'Shake It Off', blurb: 'Instantly break free of a trap stun or knockout.', cooldown: 35, perRound: 3 },
  trapRefresh: { id: 'trapRefresh', name: 'Trap Refresh', blurb: 'Aim at a trap that just went off to make it ready again.', cooldown: 0, perRound: 1 },
  firstAid: { id: 'firstAid', name: 'First Aid', blurb: 'Heals herself or the most hurt Runner nearby to full HP, even from a knockout.', cooldown: 30, perRound: 3 },
  doorJam: { id: 'doorJam', name: 'Door Jam', blurb: 'Aim at a door to slam it shut and lock it for 8s.', cooldown: 15, perRound: 3 },
  comingSoon: { id: 'comingSoon', name: 'Coming Soon', blurb: 'This character’s unique ability is still in development.', cooldown: 0, needs: 'abilities' },
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
  dev: { id: 'dev', name: "Dev D'Souza", nick: 'Patch', runner: 'wingman', saboteur: 'tripwire', color: '#ff8a3d' },
  zoya: { id: 'zoya', name: 'Zoya Khan', nick: 'Mule', runner: 'heavyCarry', saboteur: 'deepPockets', color: '#ffc94a' },
  rex: { id: 'rex', name: 'Rex Malhotra', nick: 'Rattle', runner: 'shield', saboteur: 'trapRefresh', color: '#e0409a' },
  iris: { id: 'iris', name: 'Iris Iyer', nick: 'Latch', runner: 'clone', saboteur: 'doorJam', color: '#8f7cff' },
  theo: { id: 'theo', name: 'Theo Bennett', nick: 'Switch', runner: 'mend', saboteur: 'comingSoon', color: '#a2c66e' },
  elise: { id: 'elise', name: 'Elise Hart', nick: 'Scout', runner: 'empKnife', saboteur: 'comingSoon', color: '#55b8ae' },
  felix: { id: 'felix', name: 'Felix Morgan', nick: 'Fuse', runner: 'comingSoon', saboteur: 'comingSoon', color: '#f0b94e' },
  clara: { id: 'clara', name: 'Clara Weiss', nick: 'Beacon', runner: 'comingSoon', saboteur: 'comingSoon', color: '#6d9ff0' },
  miles: { id: 'miles', name: 'Miles Laurent', nick: 'Velvet', runner: 'comingSoon', saboteur: 'comingSoon', color: '#b95b76' },
};

export const abilityFor = (id: CharacterId, role: Role) => ABILITIES[CHARACTER_INFO[id][role]];

/** Rattle's Shield and Latch's clones recharge once she has banked this many diamonds since (fakes don't count). */
export const RECHARGE_BANKS = 2;

/** Switch's Mend: a heal of `perTick` HP every `tickMs` to each teammate in `reach` (art px, the
 *  heal reach), for up to `ms`, while she stands still (`still`: how far she may drift, art px). */
export const MEND = { tickMs: 500, perTick: 5, ms: 4000, reach: 48, still: 6 };

/** Scout's EMP Knife: flies up to `range` (art px, 6 tiles) at `speed` (px/s), then every trap
 *  within `radius` (Trap Jam's reach, 3.5 tiles) of where it lands is off for `ms`. */
export const EMP = { range: 96, speed: 240, radius: 56, ms: 5000 };

/** Latch's Clone: charges per refill, how far it runs (art px, 16 tiles), how fast (sprint, px/s),
 *  and how far either side of its path it spots traps (1 tile, plus a little for the trap's size). */
export const CLONE = { charges: 2, range: 256, speed: 156, scan: 20 };

/** Mule's Heavy Carry: how many diamonds she can hold, and how much of the carry slowdown she shrugs off. */
export const HEAVY_CARRY = { capacity: 2, slowCut: 0.6 };

/** How many diamonds a heist Runner playing this character can hold at once. */
export const carryCapacity = (character: CharacterId) => (CHARACTER_INFO[character].runner === 'heavyCarry' ? HEAVY_CARRY.capacity : 1);
