// Messages between the game and the server (server/index.ts), sent as JSON over one WebSocket.

import type { CharacterId } from '../config.ts'; // .ts: also loaded by the Node server

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
  | { t: 'move'; room: RoomKind; x: number; y: number; facing: Facing; moving: boolean; sprint: boolean }
  | { t: 'character'; character: CharacterId }
  // In a match: shared world changes, relayed to everyone in it.
  | { t: 'door'; id: string; open: boolean }
  | { t: 'loot'; id: string }
  | { t: 'leave' };

/** Server -> game */
export type ServerMsg =
  | { t: 'welcome'; id: string }
  /** You are in the lobby now, standing at (x, y) in its art pixels. */
  | { t: 'lobby'; x: number; y: number }
  /** A portal filled up: you are in a new match with these players. */
  | { t: 'match'; matchId: string; size: number; players: PlayerState[]; saboteur: string }
  | { t: 'snapshot'; room: RoomKind; players: PlayerState[]; portals: PortalState[]; online: number }
  | { t: 'door'; id: string; open: boolean }
  | { t: 'loot'; id: string; by: string }
  /** Someone in your match left. */
  | { t: 'left'; id: string };

/** Seconds a portal waits, once full, before the heist starts. */
export const PORTAL_COUNTDOWN = 3;
/** How often the server sends snapshots, and the game sends its position. */
export const NET_HZ = 20;
