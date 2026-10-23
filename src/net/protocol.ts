// Messages between the game and the server (server/index.ts), sent as JSON over one WebSocket.

import type { CharacterId } from '../config.ts'; // .ts: also loaded by the Node server
import type { AbilityId } from '../data/characters.ts';
import type { MapId } from '../data/maps.ts';
import type { Diamond } from '../data/diamonds.ts';
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
  /** Their connection dropped: the server is holding their seat while they reconnect. */
  offline?: boolean;
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
  /** `key` is this tab's secret player key: sending a known one resumes that player. */
  | { t: 'hello'; name: string; character: CharacterId; key?: string }
  // `room` says where the sender was; a lobby move that arrives after a teleport is dropped.
  | { t: 'move'; room: RoomKind; x: number; y: number; facing: Facing; moving: boolean; sprint: boolean; carrying: boolean; hp: number; stunned: boolean }
  /** Explicit lobby portal selection (also used when the player clicks a portal pad). */
  | { t: 'portal'; size: number | null }
  /** Saboteur confirms setup early. */
  | { t: 'ready' }
  /** Setup: the Saboteur hides a diamond in a piece of furniture (null takes it back out). */
  | { t: 'hideDiamond'; id: string; spot: string | null }
  /** A Runner finished searching a piece of furniture (held E). */
  | { t: 'search'; spot: string }
  /** A Runner picks up a dropped diamond. */
  | { t: 'pickup'; id: string }
  /** A Runner carrying a diamond is in the getaway. */
  | { t: 'bank' }
  | { t: 'character'; character: CharacterId }
  /** The map this player wants to play next (the crew's majority decides). */
  | { t: 'map'; map: MapId }
  // In a match: shared world changes, relayed to everyone in it.
  | { t: 'door'; id: string; open: boolean }
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
  /** Your player id. `resumed`: the server knew your key and put you back where you were. */
  | { t: 'welcome'; id: string; resumed?: boolean }
  /** This player key was picked up by another tab: this one is no longer playing. */
  | { t: 'replaced' }
  /** Catch-up after a reconnect: what changed in the heist while you were away. */
  | { t: 'resync'; doors: { id: string; open: boolean }[]; placed: PlacedTrap[] }
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
  | { t: 'match'; matchId: string; size: number; map: MapId; players: PlayerState[]; role: 'runner' | 'saboteur'; phase: Phase; ms: number; energy?: number; maxEnergy?: number; resume?: boolean; round: number; rounds: number }
  /** The server rejected an optimistic trap placement. */
  | { t: 'placementRejected'; id: string; reason: string }
  /** Current Saboteur trap energy after a placement or pickup. */
  | { t: 'energy'; current: number; max: number }
  /**
   * Where the diamonds are. The Saboteur sees every hiding spot; Runners only see what's been
   * found, dropped or banked, and which furniture has already been searched and was empty.
   */
  | { t: 'diamonds'; items: Diamond[]; searched: string[]; banked: number; need: number; total: number }
  /** Hiding spots near you that hold a diamond (Runners): they glint. */
  | { t: 'glints'; spots: string[] }
  /** Your search finished: the diamond you found, or null if the furniture was empty. */
  | { t: 'searchResult'; spot: string; found: string | null }
  /** Someone found, banked or dropped a diamond: a pop-up for everyone. */
  | { t: 'diamondEvent'; kind: 'found' | 'banked' | 'dropped'; id: string; name: string; area: string }
  /** The heist is over: who won, and where every diamond and trap really was. */
  | {
      t: 'result';
      /** 'none': the Saboteur left, so the round was called off. */
      winner: 'runners' | 'saboteur' | 'none';
      banked: number;
      need: number;
      total: number;
      diamonds: Diamond[];
      placed: PlacedTrap[];
      round: number;
      rounds: number;
      /** Points each player scored this round, and the running totals. */
      points: { id: string; name: string; points: number; saboteur: boolean }[];
      standings: Standing[];
      /** Until the next round starts, or until the final results (last round). */
      nextMs: number;
      last: boolean;
    }
  /** The match is over: everyone's totals, and what happened each round. */
  | { t: 'final'; standings: Standing[]; rounds: { map: MapId; saboteur: string; winner: 'runners' | 'saboteur' | 'none' }[] }
  /** The round moved on (setup -> live -> over); `ms` is how long this phase lasts. */
  | { t: 'phase'; phase: Phase; ms: number }
  | { t: 'snapshot'; room: RoomKind; players: PlayerState[]; portals: PortalState[]; online: number; taken: Taken[] }
  | { t: 'door'; id: string; open: boolean }
  | { t: 'ability'; ability: AbilityId; by: string }
  /** A trap plate fired just now: it arms, then shocks whoever is standing on it. */
  | { t: 'trap'; id: string }
  /** A placed trap went off (everyone sees it): which one, where, and who set it off. */
  | { t: 'trapFired'; id: string; kind: TrapKindId; x: number; y: number; victim: string }
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

/** A player's place in the match. */
export interface Standing {
  id: string;
  name: string;
  character: CharacterId;
  total: number;
  /** Points per round so far. */
  perRound: number[];
  /** Still in the match (not left). */
  here: boolean;
}

/** Seconds a portal waits, once full, before the heist starts. */
export const PORTAL_COUNTDOWN = 3;
/** How often the server sends snapshots, and the game sends its position. */
export const NET_HZ = 20;
