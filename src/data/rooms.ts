// Online rooms, Among Us style: a host creates one (private: join by its code; public: also
// listed in the room browser and used by Quick Play), players gather in that room's own
// safehouse, ready up, and the host starts the game. Shared by the game and the server.

import type { GameMode } from './hideSeek';
import type { MapId } from './maps';

/** Room codes: 6 characters, no look-alikes (no O/0, I/1). */
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
/** A room's size, set by the host: 1 Saboteur and 1 to 8 Runners. Quick Play rooms hold 4. */
export const ROOM_MIN = 2;
export const ROOM_MAX = 9;
export const QUICK_PLAY_SIZE = 4;
/** The host presses START: everyone gets a 3-2-1 in the safehouse, then the game begins. */
export const START_COUNTDOWN_MS = 3000;
/** Then, for a heist, the getaway: the crew is whisked to the garage, gets in the car and it drives
 *  off (src/main.ts plays it); the game starts when it's over. Hide & Seek starts straight away. */
export const DEPART_MS = 5200;
/** What a wave says over your head (the server checks the index). */
export const WAVE_LINES = ['HEY!', 'YO!', 'HI CREW!', "LET'S GO!"] as const;

/** What someone typed (or a ?room= link) as a code: upper case, no spaces or dashes; null if it can't be one. */
export function normalizeCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  return code.length === ROOM_CODE_LENGTH && [...code].every((ch) => ROOM_CODE_CHARS.includes(ch)) ? code : null;
}

export interface RoomMember {
  id: string;
  name: string;
  character: string;
  ready: boolean;
  /** Still in the last game (they come back to the safehouse when they're done). */
  inGame: boolean;
  offline: boolean;
}

/** A room as its members see it. */
export interface RoomInfo {
  code: string;
  private: boolean;
  host: string;
  size: number;
  map: MapId;
  mode: GameMode;
  status: 'waiting' | 'playing';
  members: RoomMember[];
}

/** A public room in the browser. */
export interface RoomSummary {
  code: string;
  hostName: string;
  count: number;
  size: number;
  map: MapId;
  mode: GameMode;
  status: 'waiting' | 'playing';
}

export type RoomError = 'notFound' | 'full' | 'playing' | 'badCode' | 'notHost' | 'notReady' | 'tooFew' | 'kicked';

export const ROOM_ERRORS: Record<RoomError, string> = {
  notFound: 'Room not found. Check the code and try again.',
  full: 'That room is full. Try Quick Play to find another one.',
  playing: 'That room is in the middle of a game. Try again when it ends, or use Quick Play.',
  badCode: 'Room codes are 6 letters and numbers, like KQ7XRP.',
  notHost: 'Only the host can do that.',
  notReady: 'Everyone needs to be ready first.',
  tooFew: 'You need at least 2 players to start.',
  kicked: 'The host removed you from the room.',
};
