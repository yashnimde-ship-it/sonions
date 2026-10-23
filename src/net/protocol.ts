// Messages between the game and the server (server/index.ts), sent as JSON over one WebSocket.

import type { CharacterId } from '../config.ts'; // .ts: also loaded by the Node server
import type { AbilityId } from '../data/characters.ts';

export type Facing = 'up' | 'down' | 'left' | 'right';
export type RoomKind = 'lobby' | 'match';

export interface PlayerState {
  id: string;
  name: string;
  character: CharacterId;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  sprint: boolean;
  /** Holding loot (shows a bag over their head). */
  carrying: boolean;
  /** Health, and whether a trap has them stunned (Runners only). */
  hp: number;
  stunned: boolean;
}

/** A character someone online is using, and who. */
export interface Taken {
  character: CharacterId;
  name: string;
}

export interface PortalState {
  size: number;
  /** Players standing in the portal right now. */
  count: number;
  /** Seconds until the heist starts, or null while not enough players are in. */
  countdown: number | null;
}

/** Game -> server */
export type ClientMsg =
  | { t: 'hello'; name: string; character: CharacterId }
  // `room` says where the sender was; a lobby move that arrives after a teleport is dropped.
  | { t: 'move'; room: RoomKind; x: number; y: number; facing: Facing; moving: boolean; sprint: boolean; carrying: boolean; hp: number; stunned: boolean }
  | { t: 'character'; character: CharacterId }
  // In a match: shared world changes, relayed to everyone in it.
  | { t: 'door'; id: string; open: boolean }
  | { t: 'loot'; id: string }
  /** The Saboteur fires a trap plate. */
  | { t: 'trap'; id: string }
  /** A Runner jams a trap plate (Trap Jam). */
  | { t: 'jam'; id: string }
  /** Latch heals another Runner (First Aid). */
  | { t: 'heal'; target: string }
  /** An ability was used (for effects others should see). */
  | { t: 'ability'; ability: AbilityId }
  | { t: 'leave' };

/** Server -> game */
export type ServerMsg =
  | { t: 'welcome'; id: string }
  /** You are in the lobby now, standing at (x, y) in its art pixels. */
  | { t: 'lobby'; x: number; y: number; character: CharacterId }
  /** Your character, as the server decided it (picks can be refused: one of each per server). */
  | { t: 'character'; character: CharacterId }
  /** All five crew members are taken: the server can't fit another player right now. */
  | { t: 'full' }
  /** A portal filled up: you are in a new match with these players. */
  | { t: 'match'; matchId: string; size: number; players: PlayerState[]; saboteur: string }
  | { t: 'snapshot'; room: RoomKind; players: PlayerState[]; portals: PortalState[]; online: number; taken: Taken[] }
  | { t: 'door'; id: string; open: boolean }
  | { t: 'loot'; id: string; by: string }
  | { t: 'ability'; ability: AbilityId; by: string }
  /** A trap plate fired just now: it arms, then shocks whoever is standing on it. */
  | { t: 'trap'; id: string }
  /** A trap plate is jammed for `ms`: it can't fire, and a pending shock is cancelled. */
  | { t: 'jam'; id: string; ms: number }
  /** Another Runner healed you to full (First Aid). */
  | { t: 'healed'; by: string }
  /** Someone in your match left. */
  | { t: 'left'; id: string };

/** Seconds a portal waits, once full, before the heist starts. */
export const PORTAL_COUNTDOWN = 3;
/** How often the server sends snapshots, and the game sends its position. */
export const NET_HZ = 20;
