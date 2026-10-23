// Messages between the game and the server (server/index.ts), sent as JSON over one WebSocket.

import type { CharacterId } from '../config.ts'; // .ts: also loaded by the Node server
import type { AbilityId } from '../data/characters.ts';
import type { MapId } from '../data/maps.ts';
import type { Phase } from '../data/round.ts';
import type { PlacedTrap, TrapKindId } from '../data/trapKinds.ts';

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
  /** The map this crew would play (their majority pick), or null while the portal is empty. */
  map: MapId | null;
}

/** Game -> server */
export type ClientMsg =
  | { t: 'hello'; name: string; character: CharacterId }
  // `room` says where the sender was; a lobby move that arrives after a teleport is dropped.
  | { t: 'move'; room: RoomKind; x: number; y: number; facing: Facing; moving: boolean; sprint: boolean; carrying: boolean; hp: number; stunned: boolean }
  /** Explicit lobby portal selection (also used when the player clicks a portal pad). */
  | { t: 'portal'; size: number | null }
  /** Saboteur confirms setup early. */
  | { t: 'ready' }
  /** Saboteur relocates a diamond during setup, in art pixels. */
  | { t: 'diamond'; id: string; x: number; y: number }
  | { t: 'character'; character: CharacterId }
  /** The map this player wants to play next (the crew's majority decides). */
  | { t: 'map'; map: MapId }
  // In a match: shared world changes, relayed to everyone in it.
  | { t: 'door'; id: string; open: boolean }
  | { t: 'loot'; id: string }
  /** The Saboteur fires a trap plate. */
  | { t: 'trap'; id: string }
  /** Dev's Tripwire: rig a Shock Plate to fire when a Runner steps on it. */
  | { t: 'tripwire'; id: string }
  /** Rex's once-per-round Trap Refresh, aimed at a cooling Shock Plate. */
  | { t: 'trapRefresh'; id: string }
  /** Iris's Saboteur ability: slam a targeted door shut and lock it briefly. */
  | { t: 'doorJam'; id: string }
  /** The Saboteur puts a trap down, or picks one up. */
  | { t: 'place'; trap: PlacedTrap }
  | { t: 'unplace'; id: string }
  /** A Runner jams a trap plate (Trap Jam). */
  | { t: 'jam'; id: string }
  /** I (a Runner) just got caught by a trap, and where; the server tells the whole crew. */
  | { t: 'trapHit'; trap: string; area: string }
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
  /**
   * A portal filled up: you are in a new match with these players. `role` is only your own:
   * nobody is told who the Saboteur is (except the Saboteur).
   */
  | { t: 'match'; matchId: string; size: number; map: MapId; players: PlayerState[]; role: 'runner' | 'saboteur'; phase: Phase; ms: number; energy?: number; maxEnergy?: number; diamonds?: { id: string; x: number; y: number }[] }
  /** The server rejected an optimistic trap placement. */
  | { t: 'placementRejected'; id: string; reason: string }
  /** Current Saboteur trap energy after a placement or pickup. */
  | { t: 'energy'; current: number; max: number }
  /** Server acknowledgement of a Saboteur's diamond move. */
  | { t: 'diamond'; id: string; x: number; y: number }
  /** The round moved on (setup -> live -> over); `ms` is how long this phase lasts. */
  | { t: 'phase'; phase: Phase; ms: number; diamonds?: { id: string; x: number; y: number }[] }
  | { t: 'snapshot'; room: RoomKind; players: PlayerState[]; portals: PortalState[]; online: number; taken: Taken[] }
  | { t: 'door'; id: string; open: boolean }
  | { t: 'loot'; id: string; by: string }
  | { t: 'ability'; ability: AbilityId; by: string }
  /** A trap plate fired just now: it arms, then shocks whoever is standing on it. */
  | { t: 'trap'; id: string }
  /** A hidden Saboteur trap auto-triggered on contact. */
  | { t: 'placedTrapHit'; kind: TrapKindId; damage: number; stunMs: number; knockback?: { x: number; y: number } }
  /** The Saboteur's Tripwire was accepted; private to that Saboteur. */
  | { t: 'tripwireArmed'; id: string }
  /** The Saboteur's Trap Refresh was accepted; private to that Saboteur. */
  | { t: 'trapRefreshed'; id: string }
  /** A door is locked against opening for `ms`. */
  | { t: 'doorLocked'; id: string; ms: number }
  /** Private acknowledgement to Iris that Door Jam was accepted. */
  | { t: 'doorJammed' }
  /** The Saboteur put a trap down, or picked one up. */
  | { t: 'place'; trap: PlacedTrap }
  | { t: 'unplace'; id: string }
  /** A trap plate is jammed for `ms`: it can't fire, and a pending shock is cancelled. */
  | { t: 'jam'; id: string; ms: number }
  /** Someone in the heist got caught by a trap: shown to everyone as a pop-up. */
  | { t: 'trapAlert'; id: string; name: string; trap: string; area: string }
  /** Another Runner healed you to full (First Aid). */
  | { t: 'healed'; by: string }
  /** Someone in your match left. */
  | { t: 'left'; id: string };

/** Seconds a portal waits, once full, before the heist starts. */
export const PORTAL_COUNTDOWN = 3;
/** How often the server sends snapshots, and the game sends its position. */
export const NET_HZ = 20;
