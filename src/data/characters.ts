import type { CharacterId } from '../config';

export interface CharacterInfo {
  id: CharacterId;
  name: string;
  nick: string;
  /** The role this persona's ability is built for. */
  role: 'Runner' | 'Saboteur';
  ability: string;
  blurb: string;
  /** Name-tag and card accent colour. */
  color: string;
}

export const CHARACTER_INFO: Record<CharacterId, CharacterInfo> = {
  maya: { id: 'maya', name: 'Maya Rao', nick: 'Zip', role: 'Runner', ability: 'Quickstep', blurb: 'Speed burst. 10s cooldown.', color: '#2ec4b6' },
  dev: { id: 'dev', name: "Dev D'Souza", nick: 'Patch', role: 'Runner', ability: 'Trap Jam', blurb: 'Disables a nearby trap for 3s. 15s cooldown.', color: '#ff8a3d' },
  zoya: { id: 'zoya', name: 'Zoya Khan', nick: 'Mule', role: 'Runner', ability: 'Steady Carry', blurb: 'Loot slows her down less.', color: '#ffc94a' },
  rex: { id: 'rex', name: 'Rex Malhotra', nick: 'Rattle', role: 'Saboteur', ability: 'Trap Refresh', blurb: "Resets one trap's cooldown, once per round.", color: '#e0409a' },
  iris: { id: 'iris', name: 'Iris Iyer', nick: 'Latch', role: 'Saboteur', ability: 'Door Jam', blurb: 'Locks one doorway. Costs energy, 15s cooldown.', color: '#8f7cff' },
};
