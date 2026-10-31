// Messages between the game and the server (server/index.ts), sent as JSON over one WebSocket.

import type { ChaosId } from '../data/chaos';
import type { RoomError, RoomInfo, RoomSummary } from '../data/rooms';
import type { CharacterId } from '../config.ts'; // .ts: also loaded by the Node server
import type { AbilityId } from '../data/characters.ts';
import type { MapId } from '../data/maps.ts';
import type { Diamond } from '../data/diamonds.ts';
import type { GameMode } from '../data/hideSeek.ts';
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
  /** On the cruise ship: the deck they're on (maps with one floor leave it unset). */
  deck?: MapId;
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
  /** What they'd play: a heist, or Hide & Seek (needs 3+ players). */
  mode?: GameMode;
}

/** Game -> server */
export type ClientMsg =
  /** `key` is this tab's secret player key: sending a known one resumes that player. */
  | { t: 'hello'; name: string; character: CharacterId; key?: string }
  // `room` says where the sender was; a lobby move that arrives after a teleport is dropped.
  | { t: 'move'; room: RoomKind; x: number; y: number; facing: Facing; moving: boolean; sprint: boolean; carrying: boolean; hp: number; stunned: boolean }
  /** Explicit lobby portal selection (also used when the player clicks a portal pad). */
  | { t: 'portal'; size: number | null }
  /** Rooms: create one (you're its host), join by code, Quick Play, or leave for the menu. */
  | { t: 'createRoom'; private: boolean; size: number; mode: GameMode; map: MapId }
  | { t: 'joinRoom'; code: string }
  | { t: 'quickPlay' }
  | { t: 'leaveRoom' }
  /** The room browser is open (true): send me the public rooms whenever they change. */
  | { t: 'browse'; on: boolean }
  /** In a room: I'm ready (or not); the host changes settings, removes someone, or starts. */
  | { t: 'roomReady'; ready: boolean }
  | { t: 'roomSettings'; size?: number; mode?: GameMode; map?: MapId; private?: boolean }
  | { t: 'kick'; id: string }
  | { t: 'startGame' }
  /** Crowd Chaos: watch a room (no seat; `screen` = the projector, which doesn't vote), and vote. */
  | { t: 'watchRoom'; code: string; screen?: boolean }
  | { t: 'vote'; card: ChaosId }
  /** A wave in the safehouse: `line` picks what it says (WAVE_LINES). */
  | { t: 'emote'; kind: 'wave'; line: number }
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
  /** The game mode this player wants next (the crew's majority decides). */
  | { t: 'mode'; mode: GameMode }
  /** Hide & Seek: the Seeker fires at (x, y), art px on their deck; or reloads. */
  | { t: 'shoot'; x: number; y: number }
  | { t: 'reload' }
  /** Hide & Seek: a Hider gets into a hiding place (or back out); the Seeker searches one. */
  | { t: 'hideIn'; spot: string }
  | { t: 'unhide' }
  | { t: 'seekSpot'; spot: string }
  /** Hide & Seek: use an ability (Seeker: flare, scan; Hider: boost). */
  | { t: 'hsAbility'; ability: 'flare' | 'scan' | 'boost' }
  /** Took the stairs to another deck of the ship, arriving at (x, y) there. */
  | { t: 'deck'; deck: MapId; x: number; y: number }
  // In a match: shared world changes, relayed to everyone in it.
  | { t: 'door'; id: string; open: boolean }
  /** The Saboteur fires a trap plate. */
  | { t: 'trap'; id: string }
  /** Dev's Tripwire: lay a hidden trip line (a free snare) on open floor, mid-heist. */
  | { t: 'tripwire'; x: number; y: number }
  /** Rex's Trap Refresh, aimed at a trap that's cooling down (placed or part of the map). */
  | { t: 'trapRefresh'; id: string }
  /** Iris's Saboteur ability: slam a targeted door shut and lock it briefly. */
  | { t: 'doorJam'; id: string }
  /** The Saboteur puts a trap down, or picks one up. */
  | { t: 'place'; trap: PlacedTrap }
  | { t: 'unplace'; id: string }
  /** The Saboteur repositions one unused trap once during the live phase. */
  | { t: 'moveTrap'; id: string; x: number; y: number; deck?: MapId }
  /** A Runner jams every trap in reach (Trap Jam). */
  | { t: 'jam'; x: number; y: number }
  /** I (a Runner) just got caught by a trap, and where; the server tells the whole crew. */
  | { t: 'trapHit'; trap: string; area: string; x?: number; y?: number }
  /** Latch heals another Runner (First Aid). */
  | { t: 'heal'; target: string }
  /** Held E long enough beside a knocked-out teammate. */
  | { t: 'revive'; target: string }
  /** The keycard: pick it up off the floor; use it on a vault door. */
  | { t: 'pickupKey' }
  /** Hand the diamond I'm carrying to a teammate next to me. */
  | { t: 'handoff'; target: string }
  | { t: 'unlock'; door: string }
  /** A quick ping on the map for my teammates (TRAP / DIAMOND / LOOK HERE). */
  | { t: 'ping'; x: number; y: number; label: string }
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
  /** Your room (null: you're not in one, back to the menu). */
  | { t: 'room'; room: RoomInfo | null }
  /** The host started: the game begins in `ms` (the 3-2-1). `ms` 0: the start was called off, and why. */
  /** The host started: the 3-2-1 (ms), then for a heist the getaway scene (depart, ms). 0: called off. */
  | { t: 'roomStarting'; ms: number; reason?: string; depart?: number }
  /** Someone in my safehouse waved. */
  | { t: 'emote'; id: string; kind: 'wave'; line: number }
  /** A room request didn't work. */
  | { t: 'roomError'; reason: RoomError }
  /** The public rooms (for the room browser). */
  | { t: 'rooms'; list: RoomSummary[] }
  /** Crowd Chaos, for watchers: the room they watch (null: it closed), and the live map. */
  | { t: 'watch'; info: WatchInfo | null }
  | { t: 'watchFrame'; map: MapId; mode: GameMode; phase: Phase | 'none'; msLeft: number; banked: number; need: number; players: WatchPlayer[] }
  /** A crowd vote (to watchers and players): its cards and live tallies; no options = it closed. */
  | { t: 'chaosVote'; id: number; options: ChaosId[]; ms: number; tallies: number[]; voters: number; mine?: ChaosId | null }
  /** The crowd chose: it happens now. `spots` (Runners, Treasure Map): where the diamonds are. */
  | { t: 'chaos'; card: ChaosId; votes: number; total: number; spots?: string[] }
  /** Your character, as the server decided it (picks can be refused: one of each per server). */
  | { t: 'character'; character: CharacterId }
  /** All five crew members are taken: the server can't fit another player right now. */
  | { t: 'full' }
  /**
   * A portal filled up: you are in a new match with these players. `role` is only your own:
   * nobody is told who the Saboteur is (except the Saboteur).
   */
  | { t: 'match'; matchId: string; size: number; map: MapId; deck?: MapId; players: PlayerState[]; role: 'runner' | 'saboteur'; phase: Phase; ms: number; energy?: number; maxEnergy?: number; resume?: boolean; round: number; rounds: number; mode: GameMode; seeker?: string }
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
  | { t: 'searchResult'; spot: string; found: string | null; keycard?: boolean }
  /** The vault's keycard: where it's hidden (the room, as a hint; the furniture only for the
   *  Saboteur), who holds it or where it was dropped, and whether the vault is open. */
  | { t: 'keycard'; deck: MapId; vaultRoom: string; doors: string[]; hintRoom: string; spot?: string; holder: string | null; holderName?: string; floor: { x: number; y: number } | null; unlocked: boolean }
  | { t: 'keycardEvent'; kind: 'found' | 'dropped' | 'unlocked'; id: string; name: string }
  /** A diamond passed from one Runner to another. */
  | { t: 'handoff'; from: string; fromName: string; to: string; toName: string }
  /** Someone found, banked or dropped a diamond: a pop-up for everyone. */
  | { t: 'diamondEvent'; kind: 'found' | 'banked' | 'dropped' | 'alarm'; id: string; name: string; area: string }
  /** You're knocked out: the server's wait before you may respawn, and why it's that long. */
  | { t: 'knockout'; ms: number; reasons: string[] }
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
      /** Hide & Seek rounds: who was caught, who escaped, who just survived. */
      hunt?: { caught: string[]; escaped: string[]; survived: string[] };
    }
  /** The match is over: everyone's totals, and what happened each round. */
  | { t: 'final'; standings: Standing[]; rounds: { map: MapId; saboteur: string; winner: 'runners' | 'saboteur' | 'none' }[]; mode?: GameMode; awards?: Award[] }
  /** The round moved on (setup -> live -> over); `ms` is how long this phase lasts. */
  | { t: 'phase'; phase: Phase; ms: number }
  | { t: 'snapshot'; room: RoomKind; players: PlayerState[]; portals: PortalState[]; online: number; taken: Taken[] }
  | { t: 'door'; id: string; open: boolean }
  | { t: 'ability'; ability: AbilityId; by: string }
  /** A trap plate fired just now: it arms, then shocks whoever is standing on it. */
  | { t: 'trap'; id: string }
  /** A placed trap went off: who set it off (only they and the Saboteur see its reveal). */
  | { t: 'trapFired'; id: string; kind: TrapKindId; x: number; y: number; victim: string }
  /** A live laser tagged this Runner after its initial reveal. */
  | { t: 'trapReveal'; trap: PlacedTrap }
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
  /** A placed trap was repositioned, or the Saboteur's move was refused. */
  | { t: 'trapMoved'; trap: PlacedTrap }
  | { t: 'trapMoveRejected'; id: string; reason: string }
  /** A trap plate is jammed for `ms`: it can't fire, and a pending shock is cancelled. */
  | { t: 'jam'; id: string; ms: number; trap?: PlacedTrap }
  /** Hide & Seek: a shot was fired (everyone on that deck sees the flash and the tracer). */
  | { t: 'gunshot'; x0: number; y0: number; x1: number; y1: number; hit: string | null; deck?: MapId }
  /** Hide & Seek: you were shot (Hiders), for `damage`. */
  | { t: 'shot'; damage: number; hp: number }
  /** Hide & Seek: the Seeker's gun and health (sent to the Seeker). */
  | { t: 'gun'; ammo: number; reloadMs: number; hp: number }
  /** Hide & Seek: a Hider was caught (two hits): they're a ghost for the rest of the round. */
  | { t: 'caught'; id: string; name: string; left: number }
  /** Hide & Seek: a Hider got out through the main entrance (safe; a ghost from now on). */
  | { t: 'escaped'; id: string; name: string; left: number }
  /** Hide & Seek: you're now in this hiding place (null: out of it), at (x, y). */
  | { t: 'hidden'; spot: string | null; x: number; y: number }
  /** Hide & Seek: the Seeker opened a hiding place; `found` is who was in it, if anyone. */
  | { t: 'searched'; spot: string; found: string | null; name: string }
  /** Hide & Seek (Seeker): someone sprinting, heard at (x, y). */
  /** A noise only the Saboteur/Seeker hears: sprinting, a door, a search (heists), on `deck`. */
  | { t: 'noise'; x: number; y: number; kind?: 'step' | 'door' | 'search'; deck?: MapId }
  /** Your ability went off: ready again in readyMs; `left` uses (the Flare). */
  | { t: 'hsAbility'; ability: 'flare' | 'scan' | 'boost'; readyMs: number; left?: number }
  /** The Seeker fired a flare: this deck is lit for ms. */
  | { t: 'flare'; deck: string; ms: number }
  /** The Seeker's scan: these hiding places have someone in them (to the Seeker), or you were scanned. */
  | { t: 'scanned'; spots: string[]; ms: number; you?: boolean }
  /** Someone in the heist got caught by a trap: shown to everyone as a pop-up. */
  /** Someone was caught; (x, y) on `deck` is where (for the 4-second minimap flash). */
  | { t: 'trapAlert'; id: string; name: string; trap: string; area: string; x: number; y: number; deck: MapId }
  /** Another Runner healed you to full (First Aid). */
  | { t: 'healed'; by: string }
  /** A knocked-out Runner was got back up by a teammate. */
  | { t: 'revived'; id: string; name: string; by: string; byName: string }
  /** A teammate pinged a spot. */
  | { t: 'ping'; x: number; y: number; label: string; id: string; name: string; deck: string }
  /** Someone in your match left. */
  | { t: 'left'; id: string };

/** A player's place in the match. */
/** An end-of-match award: who did the most of something. */
export interface Award {
  key: string;
  title: string;
  id: string;
  name: string;
  detail: string;
}

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

/** A room as its watchers see it. */
export interface WatchInfo {
  code: string;
  hostName: string;
  map: MapId;
  mode: GameMode;
  status: 'waiting' | 'playing';
  players: { name: string; character: CharacterId }[];
  watchers: number;
}

/** A player on the watchers' live map. */
export interface WatchPlayer {
  id: string;
  name: string;
  character: CharacterId;
  x: number;
  y: number;
  deck?: MapId;
  hp: number;
  carrying: boolean;
}
