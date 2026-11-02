// Ranks and REP. Every player has REP (saved in their profile, changed only by the server when
// a match ends). Each division is REP_PER_DIVISION, so the rank is just REP / 100: eight ranks of
// three divisions, Pickpocket I up to Kingpin III. The top MOST_WANTED players on the leaderboard
// are MOST WANTED. Shared by the game and the server.

export const RANKS = [
  { id: 'pickpocket', name: 'Pickpocket', color: '#9a8a78' },
  { id: 'lookout', name: 'Lookout', color: '#7fb069' },
  { id: 'lockpick', name: 'Lockpick', color: '#4fb3bf' },
  { id: 'catBurglar', name: 'Cat Burglar', color: '#6c8cff' },
  { id: 'safecracker', name: 'Safecracker', color: '#b07cff' },
  { id: 'phantom', name: 'Phantom', color: '#e05aa8' },
  { id: 'mastermind', name: 'Mastermind', color: '#ff9a3d' },
  { id: 'kingpin', name: 'Kingpin', color: '#ffd84a' },
] as const;
export type RankId = (typeof RANKS)[number]['id'];

export const REP_PER_DIVISION = 100;
export const DIVISIONS = 3;
/** The leaderboard: how many it lists, its region (one for now), and how many are MOST WANTED. */
export const LEADERBOARD_SIZE = 100;
export const LEADERBOARD_REGION = 'Mumbai';
/** A special title for the top 100 players on the regional leaderboard. */
export const MOST_WANTED = 100;

/** REP for a finished match, by place on the final scoreboard (crews of MIN_RANKED_CREW or more). */
export const REP_RULES = {
  first: 25,
  topHalf: 15,
  bottomHalf: 5,
  last: -10,
  /** Each contract and each revenge in the match, up to `extrasCap` in all. */
  perExtra: 3,
  extrasCap: 10,
  /** Leaving a match before it's over. */
  quit: -20,
};
export const MIN_RANKED_CREW = 3;

export interface RankInfo {
  id: RankId;
  name: string;
  color: string;
  /** 1-3 (Kingpin III is the top division; REP past it keeps counting). */
  division: number;
  /** "Lockpick II" */
  label: string;
  /** REP into this division (0-99), and the REP where it starts. */
  progress: number;
  floor: number;
}

const ROMAN = ['I', 'II', 'III'];

export function rankOf(rep: number): RankInfo {
  const step = Math.max(0, Math.floor(rep / REP_PER_DIVISION));
  const last = RANKS.length * DIVISIONS - 1;
  const at = Math.min(step, last);
  const r = RANKS[Math.floor(at / DIVISIONS)];
  const division = (at % DIVISIONS) + 1;
  const floor = at * REP_PER_DIVISION;
  return { id: r.id, name: r.name, color: r.color, division, label: `${r.name} ${ROMAN[division - 1]}`, progress: Math.min(REP_PER_DIVISION - 1, rep - floor), floor };
}

/** REP for finishing in `place` (0 = first) of `crew` players, before extras. */
export function placeRep(place: number, crew: number) {
  if (place === 0) return REP_RULES.first;
  if (place === crew - 1) return REP_RULES.last;
  return place < crew / 2 ? REP_RULES.topHalf : REP_RULES.bottomHalf;
}

/**
 * Apply a REP change with the demotion shield: a loss that would drop you a division stops at
 * the bottom of the one you're in, once; the next one drops you. Any gain clears the shield.
 */
export function applyRep(rep: number, delta: number, shield: boolean): { rep: number; shield: boolean; shielded: boolean } {
  if (delta >= 0) return { rep: rep + delta, shield: false, shielded: false };
  const floor = rankOf(rep).floor;
  const next = Math.max(0, rep + delta);
  if (next < floor && !shield) return { rep: floor, shield: true, shielded: true };
  return { rep: next, shield: next < floor ? false : shield, shielded: false };
}

/** A leaderboard row. */
export interface BoardRow {
  place: number;
  name: string;
  rep: number;
  wins: number;
  matches: number;
  you?: boolean;
}
