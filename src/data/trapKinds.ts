// The twelve Saboteur traps: what they're called, what they cost and how big they are.
// Pure data, shared by the game and the server. How they look is in systems/TrapArt.ts;
// what they do (damage, stuns, cooldowns) isn't built yet.

export const TRAP_KIND_IDS = ['shock', 'spring', 'snare', 'glue', 'oil', 'crusher', 'laser', 'boulder', 'magnet', 'gas', 'blackout', 'fakeLoot'] as const;
export type TrapKindId = (typeof TRAP_KIND_IDS)[number];

export interface TrapKind {
  id: TrapKindId;
  name: string;
  /** Saboteur energy it will cost. */
  cost: number;
  /** Card and outline colour. */
  color: string;
  /** Footprint on the floor (art px), centred on where it's placed. */
  w: number;
  h: number;
  /** Extra art above the footprint (posts, a piston, a chest lid). */
  up: number;
  /** Key that picks it: 1-9, 0, then - and =. */
  key: string;
  /** Runners see something innocent; only the Saboteur sees the trap. */
  disguised?: boolean;
}

export const TRAP_KINDS: TrapKind[] = [
  { id: 'shock', name: 'Shock Plate', cost: 20, color: '#ff3b4a', w: 28, h: 28, up: 0, key: 'Digit1' },
  { id: 'spring', name: 'Spring Floor', cost: 25, color: '#f2b632', w: 32, h: 32, up: 0, key: 'Digit2' },
  { id: 'snare', name: 'Snare', cost: 15, color: '#ff5fa8', w: 32, h: 24, up: 0, key: 'Digit3', disguised: true },
  { id: 'glue', name: 'Glue Floor', cost: 15, color: '#ff9a2e', w: 48, h: 48, up: 0, key: 'Digit4' },
  { id: 'oil', name: 'Oil Slick', cost: 20, color: '#4cc3ff', w: 48, h: 48, up: 0, key: 'Digit5' },
  { id: 'crusher', name: 'Crusher', cost: 40, color: '#f2d23a', w: 32, h: 32, up: 30, key: 'Digit6' },
  { id: 'laser', name: 'Laser Grid', cost: 30, color: '#ff3b4a', w: 48, h: 24, up: 12, key: 'Digit7' },
  { id: 'boulder', name: 'Rolling Boulder', cost: 35, color: '#4c9aff', w: 48, h: 24, up: 0, key: 'Digit8' },
  { id: 'magnet', name: 'Magnet', cost: 30, color: '#22e6e6', w: 32, h: 32, up: 0, key: 'Digit9' },
  { id: 'gas', name: 'Confusion Gas', cost: 25, color: '#b45cff', w: 48, h: 32, up: 0, key: 'Digit0' },
  { id: 'blackout', name: 'Blackout', cost: 30, color: '#9b6cff', w: 24, h: 32, up: 0, key: 'Minus' },
  { id: 'fakeLoot', name: 'Fake Loot', cost: 20, color: '#2fe0c8', w: 28, h: 24, up: 12, key: 'Equal', disguised: true },
];

export const trapKind = (id: string) => TRAP_KINDS.find((k) => k.id === id);

/** A trap the Saboteur has placed in this heist. */
export interface PlacedTrap {
  id: string;
  kind: TrapKindId;
  /** Centre of its footprint, art px. */
  x: number;
  y: number;
  /** On the cruise ship: which deck it's on (other maps have one). */
  deck?: string;
}
