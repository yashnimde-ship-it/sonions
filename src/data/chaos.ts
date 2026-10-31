// Crowd Chaos: anyone watching a room (they scan its QR: ?watch=CODE) votes on what the house
// does next. During a live heist the crowd gets three cards every CHAOS.everyMs; the most-voted
// one happens to everyone at once. The cards change the house, never a player's own controls
// for long, so the game stays playable. Shared by the game and the server.

export type ChaosId = 'blackout' | 'lockdown' | 'alarm' | 'sugarRush' | 'molasses' | 'confusion' | 'treasureHint' | 'earthquake';

export interface ChaosCard {
  id: ChaosId;
  name: string;
  /** The house rule it writes on the big screen while it lasts. */
  rule: string;
  blurb: string;
  /** Who it helps, so every vote offers both sides something. */
  side: 'runners' | 'saboteur' | 'chaos';
  ms: number;
  color: string;
  icon: string;
}

export const CHAOS_CARDS: Record<ChaosId, ChaosCard> = {
  blackout: { id: 'blackout', name: 'Blackout', rule: 'THE LIGHTS ARE OUT', blurb: 'The whole house goes dark for 8s.', side: 'saboteur', ms: 8000, color: '#9b6cff', icon: '🌑' },
  lockdown: { id: 'lockdown', name: 'Lockdown', rule: 'EVERY DOOR IS LOCKED', blurb: 'Every door slams shut and locks for 8s.', side: 'saboteur', ms: 8000, color: '#ff5d5d', icon: '🔒' },
  alarm: { id: 'alarm', name: 'Alarm', rule: 'THE TRAPS ARE RESET', blurb: 'Every used trap is armed again.', side: 'saboteur', ms: 3000, color: '#ff9a3d', icon: '🚨' },
  sugarRush: { id: 'sugarRush', name: 'Sugar Rush', rule: 'RUNNERS ARE FAST', blurb: 'Runners move 40% faster for 10s.', side: 'runners', ms: 10000, color: '#3ee6d4', icon: '⚡' },
  molasses: { id: 'molasses', name: 'Sticky Floors', rule: 'THE FLOORS ARE STICKY', blurb: 'Runners crawl at half speed for 7s.', side: 'saboteur', ms: 7000, color: '#c9a24a', icon: '🍯' },
  confusion: { id: 'confusion', name: 'Upside Down', rule: 'CONTROLS ARE BACKWARDS', blurb: "Runners' controls are reversed for 5s.", side: 'chaos', ms: 5000, color: '#e0409a', icon: '🙃' },
  treasureHint: { id: 'treasureHint', name: 'Treasure Map', rule: 'THE DIAMONDS ARE GLOWING', blurb: 'Every hidden diamond glows for 6s.', side: 'runners', ms: 6000, color: '#ffd84a', icon: '💎' },
  earthquake: { id: 'earthquake', name: 'Earthquake', rule: 'THE HOUSE IS SHAKING', blurb: 'Everyone stumbles for a moment.', side: 'chaos', ms: 2500, color: '#b98a5c', icon: '🌋' },
};

export const isChaosId = (v: unknown): v is ChaosId => typeof v === 'string' && v in CHAOS_CARDS;

/** Timing: the first vote some way into the heist, then one every `everyMs`, each open `voteMs`. */
export const CHAOS = { firstAfterMs: 15_000, everyMs: 30_000, voteMs: 12_000, options: 3 };

/** Three cards for a vote: one for each side and one wild, never the last winner again. */
export function chaosOptions(last: ChaosId | null): ChaosId[] {
  const pool = (Object.values(CHAOS_CARDS) as ChaosCard[]).filter((c) => c.id !== last);
  const pick = (side?: ChaosCard['side'], not: ChaosId[] = []) => {
    const from = pool.filter((c) => (!side || c.side === side) && !not.includes(c.id));
    return from[Math.floor(Math.random() * from.length)]?.id;
  };
  const a = pick('runners');
  const b = pick('saboteur', a ? [a] : []);
  const c = pick(undefined, [a, b].filter((x): x is ChaosId => !!x));
  return [a, b, c].filter((x): x is ChaosId => !!x).sort(() => Math.random() - 0.5);
}
