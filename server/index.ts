// The game server: one lobby everyone joins, three portals (2, 3 and 4 players), and a
// separate match room for each crew that fills a portal. Positions come from the players'
// games; the server relays them and decides who goes into which match.
//
// Run: npm run server   (PORT defaults to 3001; also serves dist/ when it's built)

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { CHARACTERS, type CharacterId } from '../src/config.ts';
import { ABILITIES, type AbilityId, CHARACTER_INFO, DOOR_JAM_DURATION_MS } from '../src/data/characters.ts';
import { DIAMONDS_PER_ROOM, type Diamond, diamondCount, diamondsToWin, distToSpot, type HidingSpot, isHidingSpot, GLINT_REACH, PICKUP_REACH, runnerView, SEARCH_REACH, spotRoom } from '../src/data/diamonds.ts';
import { cleanName } from '../src/data/names.ts';
import { BOOST, FLARE, isHsAbility, SCAN, distToHideSpot, ESCAPE_MS, ESCAPE_ZONE, type GameMode, GUN, HS_SCORE, HIDE_MS, HIDE_REACH, type HideSpot, hideSpotCenter, NOISE_MS, NOISE_RANGE, HIDE_SEEK_MAP, HIDE_SEEK_MIN_PLAYERS, HIDER_SEES_SEEKER, HUNT_MS, isGameMode, SEEKER_HP, SEEKER_SEES_HIDERS, SEEKER_START } from '../src/data/hideSeek.ts';
import { CUSTOM_MIN, CUSTOM_PAD, FINAL_DELAY_MS, INTERMISSION_MS, LIVE_MS, roundsFor, SCORE, MAX_CREW, MIN_CREW, type Phase, placementRefusal, saboteurMaxEnergy, SETUP_MS } from '../src/data/round.ts';
import { trapKind, type PlacedTrap, type TrapKindId } from '../src/data/trapKinds.ts';
import { decksOf, isMapId, MAP_IDS, type MapId, MAPS } from '../src/data/maps.ts';
import { JAM_MS, JAM_REACH, MAX_HP, OVERCLOCK_COOLDOWN_MS, OVERCLOCK_MS, TRAP_RADIUS, TRIPWIRE_COOLDOWN_MS, trapIsReady, trapRules, type TrapSpot } from '../src/data/traps.ts';
import { NET_HZ, PORTAL_COUNTDOWN, type ClientMsg, type PlayerState, type PortalState, type ServerMsg, type Standing, type Taken } from '../src/net/protocol.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT ?? 3001);
// For playtests: SETUP_SECONDS=10 HEIST_SECONDS=30 npm run server makes rounds quick.
const SETUP_TIME = Number(process.env.SETUP_SECONDS ?? 0) * 1000 || SETUP_MS;
const LIVE_TIME = Number(process.env.HEIST_SECONDS ?? 0) * 1000 || LIVE_MS;
// The same playtest overrides shorten Hide & Seek's count and hunt.
const HIDE_TIME = Number(process.env.SETUP_SECONDS ?? 0) * 1000 || HIDE_MS;
const HUNT_TIME = Number(process.env.HEIST_SECONDS ?? 0) * 1000 || HUNT_MS;
const TILE = 16;

const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const lobbyMap = readJson('public/assets/lobby/lobby.json');
// Every heist map's data: its spawn point and door ids are all the server needs.
const mapData = Object.fromEntries(MAP_IDS.map((id) => [id, readJson(`public${MAPS[id].json}`)])) as Record<MapId, { width: number; height: number; spawn: { x: number; y: number }; doors: { id: string }[]; interactables: HidingSpot[]; areas: { names: string[]; data: number[] }; collision: { cell: number; width: number; height: number; data: string } }>;
const mapCollision = Object.fromEntries(MAP_IDS.map((id) => [id, Uint8Array.from(Buffer.from(mapData[id].collision.data, 'base64'))])) as Record<MapId, Uint8Array>;
const PADS: { size: number; x: number; y: number; w: number; h: number }[] = lobbyMap.portals;
// A party per size from 2 to MAX_CREW. Sizes 2 and 3 have their own pads; 4 and up all
// gather on the CUSTOM pad, each player in the size they picked.
const padFor = (size: number) => PADS.find((p) => p.size === (size >= CUSTOM_MIN ? CUSTOM_PAD : size)) ?? null;
interface Portal { size: number; pad: (typeof PADS)[number] | null }
const PORTALS: Portal[] = Array.from({ length: MAX_CREW - MIN_CREW + 1 }, (_, i) => MIN_CREW + i).map((size) => ({ size, pad: padFor(size) }));
const LOBBY_SPAWN = { x: lobbyMap.spawn.x * TILE, y: lobbyMap.spawn.y * TILE };

interface Client {
  ws: WebSocket;
  state: PlayerState;
  /** 'lobby' or the id of the match the player is in. */
  room: string;
  /** When the player stepped into the portal they are standing in (ms), keyed by portal size. */
  portalSince: Map<number, number>;
  /** Portal chosen from the lobby UI; positional walk-in detection remains supported. */
  portalChoice: number | null;
  /** The map they picked in the lobby. */
  mapPref: MapId;
  /** The game mode they'd like (heist or Hide & Seek). */
  modePref: GameMode;
  /** This tab's secret player key (from hello), so a dropped player can come back as themselves. */
  key: string | null;
  /** While the connection is down: when the held seat is given up. */
  dropTimer: ReturnType<typeof setTimeout> | null;
}

interface TrapRuntime {
  firedAt: number | null;
  jammedUntil: number;
  tripwired: boolean;
  moved?: boolean;
  /** Players who personally discovered this otherwise hidden trap. */
  revealedTo?: Set<string>;
  /** Laser grid stays hot after its first crossing. */
  activeFrom?: number;
  activeUntil?: number;
  pendingLaser?: { playerId: string; fromX: number; fromY: number; hitAt: number };
}

/** How long a dropped player's seat (heist, role, character) is held for them to reconnect. */
const RECONNECT_GRACE_MS = 30_000;
/** Players by key, connected or holding a seat. */
const byKey = new Map<string, Client>();

const clients = new Map<string, Client>();
const matches = new Map<string, Set<string>>();
/** Which map each heist is on. */
const matchMaps = new Map<string, MapId>();
/** Per match: the crew size it started with, and the shared world state a reconnecting player needs. */
const matchSizes = new Map<string, number>();
const doorStates = new Map<string, Map<string, boolean>>();
/** The decks this heist spans (the ship's decks on a cruise; otherwise just its map). */
const decksIn = (matchId: string): MapId[] => decksOf(matchMaps.get(matchId) ?? 'estate');
/** The deck a player is on. */
const deckOf = (c: Client): MapId => (c.state.deck && decksIn(c.room).includes(c.state.deck) ? c.state.deck : matchMaps.get(c.room) ?? 'estate');
/** Which deck a placed trap or dropped diamond is on. */
const onDeck = (matchId: string, deck: string | undefined): MapId => (deck && decksIn(matchId).includes(deck as MapId) ? (deck as MapId) : matchMaps.get(matchId) ?? 'estate');
const trapsOf = (matchId: string): TrapSpot[] => decksIn(matchId).flatMap((d) => MAPS[d].traps);
/** The map's fixed traps on one deck. */
const trapsOn = (matchId: string, deck: MapId): TrapSpot[] => (decksIn(matchId).includes(deck) ? MAPS[deck].traps : []);
const spotOf = (matchId: string, id: string) => trapsOf(matchId).find((t) => t.id === id);
/** Match the client floor check: the full trap footprint must land inside open collision cells. */
function openFloor(map: MapId, x: number, y: number, halfW = 10, halfH = 8) {
  const { cell, width, height } = mapData[map].collision;
  const x0 = x - halfW;
  const y0 = y - halfH;
  const x1 = x + halfW;
  const y1 = y + halfH;
  const minX = Math.floor(x0 / cell);
  const minY = Math.floor(y0 / cell);
  const maxX = Math.ceil(x1 / cell) - 1;
  const maxY = Math.ceil(y1 / cell) - 1;
  if (minX < 0 || minY < 0 || maxX >= width || maxY >= height) return false;
  const collision = mapCollision[map];
  for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
    if (collision[cy * width + cx] !== 0) return false;
  }
  return true;
}
const doorsOf = (matchId: string) => decksIn(matchId).flatMap((d) => mapData[d].doors);
/** The crew's map: the most-picked one; a tie goes to whoever got there first (crew is in arrival order). */
/** The crew's mode: Hide & Seek if most of them want it and there are enough of them. */
function crewMode(crew: Client[]): GameMode {
  const want = crew.filter((c) => c.modePref === 'hideSeek').length;
  return crew.length >= HIDE_SEEK_MIN_PLAYERS && want * 2 > crew.length ? 'hideSeek' : 'heist';
}
/** Per match: a heist or Hide & Seek. */
const matchModes = new Map<string, GameMode>();
const isHideSeek = (matchId: string) => matchModes.get(matchId) === 'hideSeek';

/** Per Hide & Seek round: the Seeker's gun and health, each Hider's health, who's caught. */
interface Hunt {
  ammo: number;
  reloadUntil: number;
  lastShot: number;
  seekerHp: number;
  hp: Map<string, number>;
  caught: Set<string>;
  /** Got out through the main entrance. */
  escaped: Set<string>;
  /** Who's in which hiding place. */
  hidden: Map<string, string>;
  /** When each Hider last made a noise the Seeker heard. */
  noise: Map<string, number>;
  /** Seeker abilities: flares left, when each is ready again, the lit deck and until when. */
  flaresLeft: number;
  flareReady: number;
  flareUntil: number;
  flareDeck: string;
  scanReady: number;
  /** Hiders' Boost: ready again at, and running until. */
  boostReady: Map<string, number>;
  boostUntil: Map<string, number>;
}
/** A deck's hiding places (from its layout). */
const hideSpotsOn = (deck: MapId): HideSpot[] => (mapData[deck] as { hiding?: HideSpot[] }).hiding ?? [];
/** Still in play: not caught, not escaped. */
const inPlay = (hunt: Hunt, id: string) => !hunt.caught.has(id) && !hunt.escaped.has(id);
/** Hiders still in play. */
function huntersLeft(matchId: string, hunt: Hunt) {
  const sab = saboteurs.get(matchId);
  return [...(matches.get(matchId) ?? [])].filter((id) => id !== sab && inPlay(hunt, id)).length;
}
const hunts = new Map<string, Hunt>();

/** Is (x, y) on this deck solid for a bullet? Walls, furniture and closed doors are. */
function blocksShot(matchId: string, deck: MapId, x: number, y: number) {
  const data = mapData[deck];
  const { cell, width, height } = data.collision;
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  if (cx < 0 || cy < 0 || cx >= width || cy >= height) return true;
  const i = cy * width + cx;
  if (mapCollision[deck][i] === 0) return false;
  // An open door lets the shot through.
  const states = doorStates.get(matchId);
  return !data.doors.some((d) => states?.get(d.id) && (d as { cells?: number[] }).cells?.includes(i));
}

function sendGun(c: Client, hunt: Hunt) {
  send(c, { t: 'gun', ammo: hunt.ammo, reloadMs: Math.max(0, hunt.reloadUntil - Date.now()), hp: hunt.seekerHp });
}

/** The Seeker pulls the trigger at (tx, ty): first wall or Hider along the line takes it. */
function shoot(c: Client, tx: number, ty: number) {
  const matchId = c.room;
  const hunt = hunts.get(matchId);
  const now = Date.now();
  if (!hunt || !isHideSeek(matchId) || saboteurs.get(matchId) !== c.state.id || phases.get(matchId)?.phase !== 'live') return;
  if (hunt.reloadUntil > now) return sendGun(c, hunt);
  if (hunt.reloadUntil && hunt.ammo === 0) hunt.ammo = GUN.ammo; // a finished reload
  if (hunt.ammo <= 0 || now - hunt.lastShot < GUN.fireMs) return sendGun(c, hunt);
  hunt.ammo--;
  hunt.lastShot = now;
  if (hunt.ammo === 0) hunt.reloadUntil = now + GUN.reloadMs;
  const deck = deckOf(c);
  const x0 = c.state.x;
  const y0 = c.state.y - 14;
  const len = Math.hypot(tx - x0, ty - y0) || 1;
  const dx = (tx - x0) / len;
  const dy = (ty - y0) / len;
  // Walk the bullet out; the first Hider whose body it passes, or the first wall, stops it.
  const targets = [...(matches.get(matchId) ?? [])]
    .map((id) => clients.get(id))
    .filter((t): t is Client => !!t && t !== c && inPlay(hunt, t.state.id) && deckOf(t) === deck);
  // A bullet through a hiding place hits whoever is inside it.
  const spots = hideSpotsOn(deck);
  const insideSpot = (t: Client, x: number, y: number) => {
    const sp = spots.find((h) => h.id === hunt.hidden.get(t.state.id));
    return !!sp && x >= sp.box[0] * TILE - 2 && x <= sp.box[2] * TILE + 2 && y >= sp.box[1] * TILE - 2 && y <= sp.box[3] * TILE + 2;
  };
  let hit: Client | null = null;
  let d = 6;
  for (; d < GUN.range && !hit; d += 2) {
    const x = x0 + dx * d;
    const y = y0 + dy * d;
    hit = targets.find((t) => insideSpot(t, x, y)) ?? null;
    if (hit) break;
    if (blocksShot(matchId, deck, x, y)) break;
    hit = targets.find((t) => !hunt.hidden.has(t.state.id) && Math.hypot(t.state.x - x, t.state.y - 12 - y) <= GUN.hitRadius) ?? null;
  }
  const end = hit ? { x: hit.state.x, y: hit.state.y - 12 } : { x: x0 + dx * d, y: y0 + dy * d };
  for (const id of matches.get(matchId) ?? []) {
    const m = clients.get(id);
    if (m && deckOf(m) === deck) send(m, { t: 'gunshot', x0, y0, x1: end.x, y1: end.y, hit: hit?.state.id ?? null, deck });
  }
  if (hit) {
    const hp = Math.max(0, (hunt.hp.get(hit.state.id) ?? MAX_HP) - GUN.damage);
    hunt.hp.set(hit.state.id, hp);
    send(hit, { t: 'shot', damage: GUN.damage, hp });
    if (hp === 0) catchHider(matchId, hit);
    else if (hunt.hidden.has(hit.state.id)) unhide(matchId, hit); // shot out of their hiding place
  } else {
    // A miss costs the Seeker; out of health, they've lost.
    hunt.seekerHp = Math.max(0, hunt.seekerHp - GUN.missPenalty);
    if (hunt.seekerHp === 0) finish(matchId, 'runners');
  }
  sendGun(c, hunt);
}

/** A Hider is caught: a ghost for the rest of the round. All caught: the Seeker wins. */
function catchHider(matchId: string, hider: Client) {
  const hunt = hunts.get(matchId);
  if (!hunt || hunt.caught.has(hider.state.id)) return;
  hunt.caught.add(hider.state.id);
  hunt.hidden.delete(hider.state.id);
  const left = huntersLeft(matchId, hunt);
  for (const id of matches.get(matchId) ?? []) {
    const m = clients.get(id);
    if (m) send(m, { t: 'caught', id: hider.state.id, name: hider.state.name, left });
  }
  endHuntIfDone(matchId, hunt);
}

/** Nobody left to find: the Seeker wins if they caught everyone, the Hiders if anyone got out. */
function endHuntIfDone(matchId: string, hunt: Hunt) {
  if (huntersLeft(matchId, hunt) > 0) return;
  finish(matchId, hunt.escaped.size > 0 ? 'runners' : 'saboteur');
}

/** Out of a hiding place, standing right in front of it. */
function unhide(matchId: string, c: Client) {
  const hunt = hunts.get(matchId);
  const spot = hideSpotsOn(deckOf(c)).find((h) => h.id === hunt?.hidden.get(c.state.id));
  hunt?.hidden.delete(c.state.id);
  if (spot) {
    c.state.x = hideSpotCenter(spot).x;
    c.state.y = spot.box[3] * TILE + 6;
  }
  send(c, { t: 'hidden', spot: null, x: c.state.x, y: c.state.y });
}

/** In the last stretch of the hunt, a Hider on the main entrance gangway gets away. */
function checkEscape(matchId: string, c: Client) {
  const hunt = hunts.get(matchId);
  const round = phases.get(matchId);
  if (!hunt || !round || round.phase !== 'live' || round.endsAt - Date.now() > ESCAPE_MS || !inPlay(hunt, c.state.id)) return;
  if (deckOf(c) !== HIDE_SEEK_MAP) return;
  const z = ESCAPE_ZONE;
  if (c.state.x < z.x * TILE || c.state.x > (z.x + z.w) * TILE || c.state.y < z.y * TILE || c.state.y > (z.y + z.h) * TILE) return;
  hunt.escaped.add(c.state.id);
  const left = huntersLeft(matchId, hunt);
  for (const id of matches.get(matchId) ?? []) {
    const m = clients.get(id);
    if (m) send(m, { t: 'escaped', id: c.state.id, name: c.state.name, left });
  }
  endHuntIfDone(matchId, hunt);
}

function crewMap(crew: Client[]): MapId {
  const votes = new Map<MapId, number>();
  for (const c of crew) votes.set(c.mapPref, (votes.get(c.mapPref) ?? 0) + 1);
  let best = crew[0]?.mapPref ?? 'estate';
  for (const c of crew) if ((votes.get(c.mapPref) ?? 0) > (votes.get(best) ?? 0)) best = c.mapPref;
  return best;
}
/** Per match: who the Saboteur is, and each trap plate's state (ms timestamps). */
const saboteurs = new Map<string, string>();
const trapState = new Map<string, Map<string, TrapRuntime>>();
/** Saboteur-only Overclock window; the ability cooldown prevents overlapping windows. */
const overclockWindows = new Map<string, { startsAt: number; endsAt: number }>();
const overclockReadyAt = new Map<string, number>();
const tripwireReadyAt = new Map<string, number>();
const doorJamReadyAt = new Map<string, number>();
const doorLocks = new Map<string, Map<string, number>>();
const saboteurEnergy = new Map<string, { current: number; max: number }>();
/** Per match: the traps the Saboteur has placed (id -> kind), and where the round's clock is. */
const placedTraps = new Map<string, Map<string, PlacedTrap>>();
/** Per match: the diamonds, furniture already searched and found empty, and how many are banked. */
interface Vault {
  diamonds: Diamond[];
  searched: Set<string>;
  banked: number;
  need: number;
  winner: 'runners' | 'saboteur' | 'none' | null;
  /** Trap hits this round (the Saboteur scores for each). */
  hits: number;
  /** Hiding spots near each Runner last time we told them (to send glints only on change). */
  glints: Map<string, string>;
  lastSearch: Map<string, number>;
}
const vaults = new Map<string, Vault>();

/** Per match: the rounds. Each round has its own Saboteur (in `order`) and map (in `maps`). */
interface Series {
  order: string[];
  maps: MapId[];
  round: number;
  rounds: number;
  /** Everyone who started the match, with their points per round (kept if they leave). */
  players: Map<string, { name: string; character: CharacterId; perRound: number[] }>;
  history: { map: MapId; saboteur: string; winner: 'runners' | 'saboteur' | 'none' }[];
  /** When the break after a round ends (next round, or the final results). */
  nextAt: number | null;
  done: boolean;
}
const series = new Map<string, Series>();
const phases = new Map<string, { phase: Phase; endsAt: number }>();
/** When each player last reported a trap hit (ms), so a flood of reports can't spam the crew. */
const lastTrapHit = new Map<string, number>();
/** Per match: ability uses spent this round, keyed by player id and ability. */
const abilityUses = new Map<string, Map<string, number>>();

/** Spend one use of an ability; false once its uses for the round are gone. */
function spendUse(c: Client, ability: AbilityId) {
  const limit = ABILITIES[ability].perRound;
  const uses = abilityUses.get(c.room);
  if (!uses || limit === undefined) return true;
  const key = `${c.state.id}:${ability}`;
  const used = uses.get(key) ?? 0;
  if (used >= limit) return false;
  uses.set(key, used + 1);
  return true;
}
const portalEnds = new Map<number, number>(); // portal size -> when its countdown ends (ms)
let nextId = 1;
let nextMatch = 1;

/** Players who have joined (said hello), wherever they are: lobby or a heist. */
const joined = () => [...clients.values()].filter((c) => c.state.name);
/** One of each character per server, like colours in an Among Us lobby. */
const takenBy = (character: CharacterId, except?: Client) => joined().find((c) => c !== except && c.state.character === character);

const send = (c: Client, msg: ServerMsg) => {
  if (!c.state.offline && c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
};
const inRoom = (room: string) => [...clients.values()].filter((c) => c.room === room && c.state.name);

function portalAt(s: PlayerState) {
  return PADS.find((p) => s.x >= p.x * TILE && s.x < (p.x + p.w) * TILE && s.y >= p.y * TILE && s.y < (p.y + p.h) * TILE);
}

function chosenPortal(c: Client) {
  // On a fixed pad, its size; on the CUSTOM pad, the size you picked (4 until you pick).
  const pad = portalAt(c.state);
  if (!pad) return undefined;
  const size = pad.size !== CUSTOM_PAD ? pad.size : c.portalChoice !== null && c.portalChoice >= CUSTOM_MIN ? c.portalChoice : CUSTOM_PAD;
  return PORTALS.find((p) => p.size === size);
}

function distanceToSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq)) : 0;
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/**
 * What a placed trap does to the Runner who sets it off. Damage and stuns are applied by that
 * Runner's game; the rest (roots, slow, slip, reversed controls, darkness, the crusher's
 * delayed slam, the magnet's pull) is worked out by each game from the 'trapFired' message.
 */
function trapEffect(kind: TrapKindId) {
  switch (kind) {
    case 'shock': return { damage: 25, stunMs: 2000 };
    case 'laser': return { damage: 20, stunMs: 0 };
    case 'boulder': return { damage: 30, stunMs: 800 };
    case 'fakeLoot': return { damage: 30, stunMs: 2000 };
    default: return { damage: 0, stunMs: 0 };
  }
}

/** Traps that knock a carried diamond out of your hands. */
const DROPS_DIAMOND = new Set<TrapKindId>(['spring', 'magnet']);
/** How far the magnet reaches, art px (4 tiles). */
const MAGNET_REACH = 64;

/** A placed trap went off: everyone sees it (and it's no longer secret), the victim feels it. */
function firePlaced(matchId: string, trap: PlacedTrap, victim: Client, fromX: number, fromY: number) {
  const s = victim.state;
  const effect = trapEffect(trap.kind);
  // Spring launches you 4 tiles on along your way; the boulder rolls you down its lane.
  const dx = s.x - fromX || s.x - trap.x || 0.01;
  const dy = s.y - fromY || s.y - trap.y;
  const len = Math.hypot(dx, dy) || 1;
  const knockback = trap.kind === 'spring' ? { x: s.x + (dx / len) * 64, y: s.y + (dy / len) * 64 } : trap.kind === 'boulder' ? { x: s.x + 56, y: s.y } : undefined;
  if (trap.kind !== 'laser') send(victim, { t: 'placedTrapHit', kind: trap.kind, ...effect, ...(knockback ? { knockback } : {}) });
  const runtime = trapState.get(matchId)?.get(trap.id);
  if (runtime) (runtime.revealedTo ??= new Set()).add(s.id);
  for (const id of matches.get(matchId) ?? []) {
    const member = clients.get(id);
    if (member) send(member, { t: 'trapFired', id: trap.id, kind: trap.kind, x: trap.x, y: trap.y, victim: s.id });
  }
  if (trap.kind === 'magnet') {
    // Yanks the diamonds out of every Runner's hands nearby (Mule's Steady Carry holds on).
    for (const id of matches.get(matchId) ?? []) {
      const c = clients.get(id);
      if (!c || id === saboteurs.get(matchId) || (c.state.character === 'zoya' && CHARACTER_INFO.zoya.runner === 'steadyCarry')) continue;
      if (deckOf(c) === onDeck(matchId, trap.deck) && Math.hypot(c.state.x - trap.x, c.state.y - trap.y) <= MAGNET_REACH) dropDiamond(matchId, id, trap.x, trap.y + 10);
    }
  } else if (DROPS_DIAMOND.has(trap.kind)) dropDiamond(matchId, s.id, knockback?.x ?? s.x, knockback?.y ?? s.y);
  if (trap.kind === 'fakeLoot') {
    // A decoy blows up once.
    placedTraps.get(matchId)?.delete(trap.id);
    for (const id of matches.get(matchId) ?? []) {
      const member = clients.get(id);
      if (member) send(member, { t: 'unplace', id: trap.id });
    }
  }
}

/** The laser's beams run post to post across its whole footprint, so it catches anyone in that
 *  box (not just near its middle). Feet within the box, art px around the trap's centre. */
const LASER_BOX = { x0: -21, x1: 21, y0: -8, y1: 10 };
const inLaser = (trap: PlacedTrap, x: number, y: number) => x >= trap.x + LASER_BOX.x0 && x <= trap.x + LASER_BOX.x1 && y >= trap.y + LASER_BOX.y0 && y <= trap.y + LASER_BOX.y1;
/** Did a move from (x0, y0) to (x1, y1) cross into the laser box? Sampled along the way. */
function enteredLaser(trap: PlacedTrap, x0: number, y0: number, x1: number, y1: number) {
  if (inLaser(trap, x0, y0)) return false;
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
  for (let i = 1; i <= steps; i++) if (inLaser(trap, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps)) return true;
  return false;
}

/** Every live beam crossing hurts and drops carried loot back on the runner's approach side. */
function laserHit(matchId: string, trap: PlacedTrap, victim: Client, fromX: number, fromY: number) {
  const s = victim.state;
  const runtime = trapState.get(matchId)?.get(trap.id);
  if (runtime) (runtime.revealedTo ??= new Set()).add(s.id);
  send(victim, { t: 'trapReveal', trap });
  send(victim, { t: 'placedTrapHit', kind: 'laser', damage: 20, stunMs: 0 });
  const dx = s.x - fromX || s.x - trap.x || 0.01;
  const dy = s.y - fromY || s.y - trap.y;
  const len = Math.hypot(dx, dy) || 1;
  dropDiamond(matchId, s.id, fromX - (dx / len) * 12, fromY - (dy / len) * 12);
}

function toLobby(c: Client) {
  c.room = 'lobby';
  c.portalSince.clear();
  c.portalChoice = null;
  c.state.x = LOBBY_SPAWN.x + (Math.random() - 0.5) * 64;
  c.state.y = LOBBY_SPAWN.y;
  c.state.facing = 'down';
  send(c, { t: 'lobby', x: c.state.x, y: c.state.y, character: c.state.character });
}

function leaveMatch(c: Client) {
  const match = matches.get(c.room);
  if (!match) return;
  const matchId = c.room;
  dropDiamond(matchId, c.state.id, c.state.x, c.state.y);
  match.delete(c.state.id);
  for (const id of match) {
    const other = clients.get(id);
    if (other) send(other, { t: 'left', id: c.state.id });
  }
  if (!match.size) return endMatch(matchId);
  const sr = series.get(matchId);
  if (!sr || sr.done) return;
  // Too few left to play on: straight to the results. The Saboteur gone: this round is off.
  if (match.size < 2) {
    if (phases.get(matchId)?.phase !== 'over') finish(matchId, 'none');
    return finishSeries(matchId);
  }
  if (saboteurs.get(matchId) === c.state.id && phases.get(matchId)?.phase !== 'over') finish(matchId, 'none');
}

function endMatch(matchId: string) {
  matches.delete(matchId);
  matchMaps.delete(matchId);
  matchSizes.delete(matchId);
  doorStates.delete(matchId);
  saboteurs.delete(matchId);
  trapState.delete(matchId);
  overclockWindows.delete(matchId);
  overclockReadyAt.delete(matchId);
  tripwireReadyAt.delete(matchId);
  doorJamReadyAt.delete(matchId);
  doorLocks.delete(matchId);
  saboteurEnergy.delete(matchId);
  placedTraps.delete(matchId);
  vaults.delete(matchId);
  phases.delete(matchId);
  abilityUses.delete(matchId);
  series.delete(matchId);
  matchModes.delete(matchId);
  hunts.delete(matchId);
}

function startMatch(size: number, crew: Client[]) {
  const matchId = `heist-${nextMatch++}`;
  const mode = crewMode(crew);
  const first = crewMap(crew);
  // Saboteur turns in a random order; the map starts with the crew's pick and then rotates.
  // Hide & Seek always plays on the cruise ship.
  const order = crew.map((c) => c.state.id).sort(() => Math.random() - 0.5);
  const rounds = roundsFor(crew.length);
  const maps = Array.from({ length: rounds }, (_, i) => (mode === 'hideSeek' ? HIDE_SEEK_MAP : MAP_IDS[(MAP_IDS.indexOf(first) + i) % MAP_IDS.length]));
  matchModes.set(matchId, mode);
  matches.set(matchId, new Set(crew.map((c) => c.state.id)));
  matchSizes.set(matchId, size);
  series.set(matchId, {
    order,
    maps,
    round: 0,
    rounds,
    players: new Map(crew.map((c) => [c.state.id, { name: c.state.name, character: c.state.character, perRound: [] }])),
    history: [],
    nextAt: null,
    done: false,
  });
  for (const c of crew) {
    c.room = matchId;
    c.portalSince.clear();
    c.portalChoice = null;
  }
  console.log(`${matchId}: ${size}-player ${mode === 'hideSeek' ? 'Hide & Seek' : 'heist'} match, ${rounds} rounds, with ${crew.map((c) => c.state.name).join(', ')}`);
  startRound(matchId);
}

/** A round: everyone back at the spawn, a fresh house, the next Saboteur in the order. */
function startRound(matchId: string) {
  const sr = series.get(matchId);
  const ids = [...(matches.get(matchId) ?? [])];
  if (!sr || !ids.length) return;
  // The next Saboteur still in the match (anyone who left loses their turn).
  while (sr.round < sr.rounds && !ids.includes(sr.order[sr.round])) sr.round++;
  if (sr.round >= sr.rounds || ids.length < 2) return finishSeries(matchId);
  const map = sr.maps[sr.round];
  const saboteur = sr.order[sr.round];
  const crew = ids.map((id) => clients.get(id)).filter((c): c is Client => !!c);
  const spawn = mapData[map].spawn;
  matchMaps.set(matchId, map);
  doorStates.set(matchId, new Map());
  crew.forEach((c, i) => {
    // Rows of five, so a big crew doesn't spawn inside the walls.
    const row = Math.floor(i / 5);
    const inRow = Math.min(5, crew.length - row * 5);
    c.state.x = spawn.x * TILE + ((i % 5) - (inRow - 1) / 2) * 36;
    c.state.y = spawn.y * TILE + row * 28;
    c.state.deck = map;
    c.state.facing = 'up';
    c.state.moving = false;
    c.state.carrying = false;
    c.state.hp = MAX_HP;
    c.state.stunned = false;
  });
  saboteurs.set(matchId, saboteur);
  const hs = isHideSeek(matchId);
  if (hs) hunts.set(matchId, { ammo: GUN.ammo, reloadUntil: 0, lastShot: 0, seekerHp: SEEKER_HP, hp: new Map(), caught: new Set(), escaped: new Set(), hidden: new Map(), noise: new Map(), flaresLeft: FLARE.uses, flareReady: 0, flareUntil: 0, flareDeck: '', scanReady: 0, boostReady: new Map(), boostUntil: new Map() });
  if (hs) {
    // Hide & Seek: the Seeker counts in the Staff Room while everyone else scatters.
    const seeker = clients.get(saboteur)!.state;
    seeker.x = SEEKER_START.x * TILE;
    seeker.y = SEEKER_START.y * TILE;
  }
  const sabCharacter = clients.get(saboteur)!.state.character;
  const size = matchSizes.get(matchId) ?? crew.length;
  const maxEnergy = saboteurMaxEnergy(sabCharacter, size);
  saboteurEnergy.set(matchId, { current: maxEnergy, max: maxEnergy });
  placedTraps.set(matchId, new Map());
  // The diamonds start in the Saboteur's hands; they hide them during setup.
  const total = hs ? 0 : diamondCount(size);
  vaults.set(matchId, { diamonds: Array.from({ length: total }, (_, i) => ({ id: `d${i + 1}`, place: { at: 'tray' } })), searched: new Set(), banked: 0, need: diamondsToWin(total), winner: null, hits: 0, glints: new Map(), lastSearch: new Map() });
  phases.set(matchId, { phase: 'setup', endsAt: Date.now() + (hs ? HIDE_TIME : SETUP_TIME) });
  trapState.set(matchId, new Map(MAPS[map].traps.map((t) => [t.id, { firedAt: null, jammedUntil: 0, tripwired: false }])));
  overclockWindows.delete(matchId);
  overclockReadyAt.set(matchId, 0);
  tripwireReadyAt.set(matchId, 0);
  doorJamReadyAt.set(matchId, 0);
  doorLocks.set(matchId, new Map());
  abilityUses.set(matchId, new Map());
  sr.nextAt = null;
  for (const c of crew) {
    send(c, matchMsg(c, matchId));
    send(c, diamondsMsg(c, matchId));
  }
  console.log(`${matchId}: round ${sr.round + 1}/${sr.rounds} on ${MAPS[map].name}, Saboteur ${clients.get(saboteur)?.state.name}`);
}

/** Everyone's totals, best first. */
function standings(matchId: string): Standing[] {
  const sr = series.get(matchId);
  if (!sr) return [];
  const here = matches.get(matchId) ?? new Set();
  return [...sr.players]
    .map(([id, p]) => ({ id, name: p.name, character: p.character, total: p.perRound.reduce((a, b) => a + b, 0), perRound: p.perRound, here: here.has(id) }))
    .sort((a, b) => b.total - a.total);
}

/** The match is over: the final results, then everyone heads back to the safehouse themselves. */
function finishSeries(matchId: string) {
  const sr = series.get(matchId);
  if (!sr || sr.done) return;
  sr.done = true;
  sr.nextAt = null;
  const round = phases.get(matchId);
  if (round) round.phase = 'over';
  const msg: ServerMsg = { t: 'final', standings: standings(matchId), rounds: sr.history, mode: matchModes.get(matchId) };
  for (const id of matches.get(matchId) ?? []) {
    const c = clients.get(id);
    if (c) send(c, msg);
  }
  console.log(`${matchId}: match over, ${msg.standings[0]?.name ?? 'nobody'} wins`);
}

/**
 * The heist as this player should see it: on the start of a round, or when they reconnect
 * (`resume`). Each player learns only their own role, so the Saboteur stays secret.
 */
function matchMsg(c: Client, matchId: string, resume = false): ServerMsg {
  const saboteur = saboteurs.get(matchId);
  const isSaboteur = c.state.id === saboteur;
  const players = [...(matches.get(matchId) ?? [])]
    .map((id) => clients.get(id)?.state)
    .filter((p): p is PlayerState => !!p && (p.id !== saboteur || isSaboteur || isHideSeek(matchId)))
    .map((p) => ({ ...p }));
  const round = phases.get(matchId);
  const energy = saboteurEnergy.get(matchId);
  return {
    t: 'match',
    matchId,
    size: matchSizes.get(matchId) ?? players.length,
    map: matchMaps.get(matchId) ?? 'estate',
    deck: c.state.deck,
    players,
    role: isSaboteur ? 'saboteur' : 'runner',
    phase: round?.phase ?? 'setup',
    ms: Math.max(0, (round?.endsAt ?? Date.now()) - Date.now()),
    ...(isSaboteur && energy ? { energy: energy.current, maxEnergy: energy.max } : {}),
    ...(resume ? { resume: true } : {}),
    round: (series.get(matchId)?.round ?? 0) + 1,
    rounds: series.get(matchId)?.rounds ?? 1,
    mode: matchModes.get(matchId) ?? 'heist',
    // Hide & Seek's Seeker is no secret: everyone knows the owner has the gun.
    ...(isHideSeek(matchId) && saboteur ? { seeker: saboteur } : {}),
  };
}

/** What a reconnecting player missed: doors, and the traps they're allowed to know about. */
function resyncMsg(matchId: string, c: Client): ServerMsg {
  const sab = saboteurs.get(matchId) === c.state.id;
  const known = (t: PlacedTrap) => sab || t.kind === 'fakeLoot' || !!trapState.get(matchId)?.get(t.id)?.revealedTo?.has(c.state.id);
  return {
    t: 'resync',
    doors: [...(doorStates.get(matchId) ?? [])].map(([id, open]) => ({ id, open })),
    placed: [...(placedTraps.get(matchId)?.values() ?? [])].filter(known),
  };
}

/** The connection dropped: hold their seat for a while instead of dropping them at once. */
function dropped(c: Client) {
  if (!c.key || !c.state.name) return forget(c);
  c.state.offline = true;
  c.state.moving = false;
  c.dropTimer = setTimeout(() => forget(c), RECONNECT_GRACE_MS);
  console.log(`${c.state.name} dropped; holding their seat for ${RECONNECT_GRACE_MS / 1000}s`);
}

/** Gone for good: out of the heist and off the server. */
function forget(c: Client) {
  if (c.dropTimer) clearTimeout(c.dropTimer);
  c.dropTimer = null;
  leaveMatch(c);
  clients.delete(c.state.id);
  if (c.key && byKey.get(c.key) === c) byKey.delete(c.key);
  if (c.state.name) console.log(`${c.state.name} left (${clients.size} connected)`);
}

const sortByArrival = (inside: Client[], size: number) => [...inside].sort((a, b) => a.portalSince.get(size)! - b.portalSince.get(size)!);

/** Who is in which portal, and starts a heist once a portal has been full for a few seconds. */
function updatePortals(now: number): PortalState[] {
  const lobby = inRoom('lobby').filter((c) => !c.state.offline);
  return PORTALS.map((portal) => {
    const inside: Client[] = [];
    for (const c of lobby) {
      if (chosenPortal(c) === portal) {
        if (!c.portalSince.has(portal.size)) c.portalSince.set(portal.size, now);
        inside.push(c);
      } else c.portalSince.delete(portal.size);
    }
    if (inside.length < portal.size) {
      portalEnds.delete(portal.size);
      return { size: portal.size, count: inside.length, countdown: null, map: inside.length ? crewMap(sortByArrival(inside, portal.size)) : null, mode: inside.length ? crewMode(sortByArrival(inside, portal.size).slice(0, portal.size)) : undefined };
    }
    if (!portalEnds.has(portal.size)) portalEnds.set(portal.size, now + PORTAL_COUNTDOWN * 1000);
    const left = (portalEnds.get(portal.size)! - now) / 1000;
    if (left <= 0) {
      // First in, first out: the earliest arrivals make up the crew.
      inside.sort((a, b) => a.portalSince.get(portal.size)! - b.portalSince.get(portal.size)!);
      startMatch(portal.size, inside.slice(0, portal.size));
      portalEnds.delete(portal.size);
      return { size: portal.size, count: 0, countdown: null, map: null };
    }
    const crew = sortByArrival(inside, portal.size).slice(0, portal.size);
    return { size: portal.size, count: inside.length, countdown: Math.ceil(left), map: crewMap(crew), mode: crewMode(crew) };
  });
}

function tick() {
  const now = Date.now();
  const portals = updatePortals(now);
  const online = joined().length;
  const taken: Taken[] = joined().map((c) => ({ character: c.state.character, name: c.state.name }));
  const lobbyPlayers = inRoom('lobby').map((c) => c.state);
  for (const c of inRoom('lobby')) send(c, { t: 'snapshot', room: 'lobby', players: lobbyPlayers, portals, online, taken });
  for (const [matchId, ids] of matches) {
    const players = [...ids].map((id) => clients.get(id)?.state).filter((s): s is PlayerState => !!s && s.id !== saboteurs.get(matchId));
    const seeker = isHideSeek(matchId) ? clients.get(saboteurs.get(matchId) ?? '')?.state : undefined;
    for (const id of ids) {
      const c = clients.get(id);
      if (!c) continue;
      let seen = players;
      if (seeker) {
        // Hide & Seek in the dark: you only hear where someone is if you could see them.
        // Hiders always know where their crew is; the Seeker only when they're in reach.
        const near = (a: PlayerState, b: PlayerState, r: number) => (a.deck ?? '') === (b.deck ?? '') && Math.hypot(a.x - b.x, a.y - b.y) <= r;
        const hunt = hunts.get(matchId);
        const ghost = !!hunt && !inPlay(hunt, id);
        seen = id === seeker.id
          ? players.filter((p) => (near(p, seeker, SEEKER_SEES_HIDERS) || (!!hunt && now < hunt.flareUntil && (p.deck ?? '') === hunt.flareDeck)) && (!hunt || (inPlay(hunt, p.id) && !hunt.hidden.has(p.id))))
          : ghost || near(c.state, seeker, HIDER_SEES_SEEKER) ? [...players, seeker] : players;
      }
      send(c, { t: 'snapshot', room: 'match', players: seen, portals: [], online, taken: [] });
    }
    if (!players.length) {
      endMatch(matchId);
      continue;
    }
    // A laser gives its 0.8s flicker warning, then hits the Runner who triggered it only if
    // they're still in the beam when it becomes live.
    for (const trap of placedTraps.get(matchId)?.values() ?? []) {
      if (trap.kind !== 'laser') continue;
      const state = trapState.get(matchId)?.get(trap.id);
      const pending = state?.pendingLaser;
      if (!state || !pending || now < pending.hitAt) continue;
      state.pendingLaser = undefined;
      const victim = clients.get(pending.playerId);
      if (victim?.room !== matchId || now >= (state.activeUntil ?? 0) || now < state.jammedUntil) continue;
      if (inLaser(trap, victim.state.x, victim.state.y)) laserHit(matchId, trap, victim, pending.fromX, pending.fromY);
    }
    // The round's clock: setup, then the heist, then time's up.
    const p = phases.get(matchId);
    if (p && p.phase !== 'over' && now >= p.endsAt) {
      // Setup over: the heist starts. Heist over: the Saboteur held on to enough diamonds.
      // (Hide & Seek: running out the clock means the Hiders survived.)
      if (p.phase === 'setup') goLive(matchId);
      else finish(matchId, isHideSeek(matchId) ? 'runners' : 'saboteur');
    }
    if (p?.phase === 'live') sendGlints(matchId);
    // The break after a round: then the next round, or after the last one the final results.
    const sr = series.get(matchId);
    if (sr && !sr.done && sr.nextAt !== null && now >= sr.nextAt) {
      sr.nextAt = null;
      if (sr.round + 1 >= sr.rounds) finishSeries(matchId);
      else {
        sr.round++;
        startRound(matchId);
      }
    }
  }
}
setInterval(tick, 1000 / NET_HZ);

function handle(c: Client, msg: ClientMsg) {
  const s = c.state;
  switch (msg.t) {
    case 'hello': {
      if (s.name) break;
      // Your last character if it's free, otherwise the first free one. Once all five are
      // taken (big parties of up to 9), characters repeat: the least-used one is shared.
      const uses = (id: CharacterId) => joined().filter((o) => o.state.character === id).length;
      const free = [msg.character, ...CHARACTERS].find((id) => CHARACTERS.includes(id) && !takenBy(id)) ?? [...CHARACTERS].sort((a, b) => uses(a) - uses(b))[0];
      // Nothing offensive in the lobby: a blocked name becomes a plain one.
      s.name = cleanName(msg.name, `Bandit ${s.id}`);
      s.character = free;
      toLobby(c);
      console.log(`${s.name} joined as ${s.character} (${clients.size} connected)`);
      break;
    }
    case 'move':
      if ((msg.room === 'lobby') !== (c.room === 'lobby')) break;
      const fromX = s.x;
      const fromY = s.y;
      if (c.room !== 'lobby') {
        const round = phases.get(c.room);
        const seekerHere = isHideSeek(c.room) && saboteurs.get(c.room) === s.id;
        if (!round || round.phase === 'over') break;
        if (isHideSeek(c.room) ? round.phase === 'setup' && seekerHere : round.phase !== 'live' || saboteurs.get(c.room) === s.id) break;
      }
      s.x = msg.x;
      s.y = msg.y;
      // Once a selected-party player walks off the chosen pad, leave that party.
      if (c.room === 'lobby' && c.portalChoice !== null && padFor(c.portalChoice) !== portalAt(s)) c.portalChoice = null;
      s.facing = msg.facing;
      s.moving = msg.moving;
      s.sprint = msg.sprint;
      // The server knows who holds a diamond; a Runner knocked out drops theirs.
      const held = c.room !== 'lobby' ? carrierOf(vaults.get(c.room), s.id) : undefined;
      s.carrying = !!held;
      s.hp = Math.max(0, Math.min(MAX_HP, Number(msg.hp) || 0));
      s.stunned = !!msg.stunned;
      if (held && s.hp === 0) dropDiamond(c.room, s.id, s.x, s.y);
      const hunt = hunts.get(c.room);
      if (hunt && saboteurs.get(c.room) !== s.id) {
        // Hide & Seek: in a hiding place you stay put; on the gangway at the end you get out;
        // sprinting is loud enough for the Seeker to hear.
        const spot = hideSpotsOn(deckOf(c)).find((h) => h.id === hunt.hidden.get(s.id));
        if (spot) [s.x, s.y] = [hideSpotCenter(spot).x, hideSpotCenter(spot).y];
        checkEscape(c.room, c);
        const seeker = clients.get(saboteurs.get(c.room) ?? '');
        if (seeker && inPlay(hunt, s.id) && (msg.sprint || Date.now() < (hunt.boostUntil.get(s.id) ?? 0)) && msg.moving && !spot && Date.now() - (hunt.noise.get(s.id) ?? 0) >= NOISE_MS && deckOf(seeker) === deckOf(c) && Math.hypot(seeker.state.x - s.x, seeker.state.y - s.y) <= NOISE_RANGE) {
          hunt.noise.set(s.id, Date.now());
          send(seeker, { t: 'noise', x: s.x, y: s.y });
        }
      }
      if (c.room !== 'lobby') {
        const now = Date.now();
        const saboteurId = saboteurs.get(c.room);
        const deck = deckOf(c);
        if (saboteurId !== s.id && phases.get(c.room)?.phase === 'live') {
          for (const plate of trapsOn(c.room, deck)) {
            if (plate.kind && plate.kind !== 'plate') continue;
            const state = trapState.get(c.room)?.get(plate.id);
            if (!state || now < state.jammedUntil || !trapIsReady(state.firedAt, now, overclockWindows.get(c.room) ?? null, trapRules(plate))) continue;
            if (Math.hypot(fromX - plate.x, fromY - plate.y) <= TRAP_RADIUS || distanceToSegment(plate.x, plate.y, fromX, fromY, s.x, s.y) > TRAP_RADIUS) continue;
            state.tripwired = false;
            state.firedAt = now;
            for (const id of matches.get(c.room) ?? []) {
              const member = clients.get(id);
              if (member) send(member, { t: 'trap', id: plate.id });
            }
          }
          for (const trap of placedTraps.get(c.room)?.values() ?? []) {
            // Fake Loot isn't stepped on: it goes off when someone searches it.
            if (trap.kind === 'fakeLoot' || onDeck(c.room, trap.deck) !== deck) continue;
            const state = trapState.get(c.room)?.get(trap.id);
            const radius = Math.max(12, Math.min(trapKind(trap.kind)!.w, trapKind(trap.kind)!.h) / 2);
            if (!state || now < state.jammedUntil) continue;
            const entered = trap.kind === 'laser' ? enteredLaser(trap, fromX, fromY, s.x, s.y) : Math.hypot(fromX - trap.x, fromY - trap.y) > radius && distanceToSegment(trap.x, trap.y, fromX, fromY, s.x, s.y) <= radius;
            if (trap.kind === 'laser' && state.activeUntil !== undefined) {
              if (now < state.activeUntil) {
                if (now >= (state.activeFrom ?? 0) && entered) laserHit(c.room, trap, c, fromX, fromY);
                continue;
              }
              state.activeFrom = undefined;
              state.activeUntil = undefined;
            }
            if (!trapIsReady(state.firedAt, now, overclockWindows.get(c.room) ?? null) || !entered) continue;
            state.firedAt = now;
            if (trap.kind === 'laser') {
              // Flicker a warning for 0.8s, then keep the beam live for 4s.
              state.activeFrom = now + 800;
              state.activeUntil = now + 4800;
              state.pendingLaser = { playerId: s.id, fromX, fromY, hitAt: now + 800 };
            }
            firePlaced(c.room, trap, c, fromX, fromY);
          }
        }
        for (const plate of trapsOn(c.room, deck)) {
          if (plate.kind && plate.kind !== 'plate') continue;
          const state = trapState.get(c.room)?.get(plate.id);
          if (!state?.tripwired || now < state.jammedUntil || !trapIsReady(state.firedAt, now, overclockWindows.get(c.room) ?? null, trapRules(plate))) continue;
          if (Math.hypot(fromX - plate.x, fromY - plate.y) <= TRAP_RADIUS) continue;
          if (distanceToSegment(plate.x, plate.y, fromX, fromY, s.x, s.y) > TRAP_RADIUS) continue;
          state.tripwired = false;
          state.firedAt = now;
          for (const id of matches.get(c.room) ?? []) {
            const member = clients.get(id);
            if (member) send(member, { t: 'trap', id: plate.id });
          }
        }
      }
      break;
    case 'ready': {
      const matchId = c.room;
      if (saboteurs.get(matchId) !== s.id || phases.get(matchId)?.phase !== 'setup' || isHideSeek(matchId)) break;
      goLive(matchId);
      break;
    }
    case 'hideDiamond': {
      // Setup only, the Saboteur only: into a free piece of furniture, two per room at most.
      const vault = vaults.get(c.room);
      const d = vault?.diamonds.find((x) => x.id === msg.id);
      if (!vault || !d || saboteurs.get(c.room) !== s.id || phases.get(c.room)?.phase !== 'setup') break;
      if (msg.spot === null) d.place = { at: 'tray' };
      else {
        const spot = spotsOf(c.room).find((x) => x.id === msg.spot);
        if (!spot || vault.diamonds.some((x) => x !== d && x.place.at === 'spot' && x.place.spot === spot.id)) break;
        if (roomCount(c.room, vault, roomKey(c.room, spot), d) >= DIAMONDS_PER_ROOM) break;
        d.place = { at: 'spot', spot: spot.id };
      }
      sendDiamonds(c.room);
      break;
    }
    case 'search': {
      // A Runner who held E next to a piece of furniture: is a diamond in there?
      const vault = vaults.get(c.room);
      if (!vault || saboteurs.get(c.room) === s.id || phases.get(c.room)?.phase !== 'live' || carrierOf(vault, s.id)) break;
      const spot = spotsOf(c.room).find((x) => x.id === msg.spot && spotDeck(c.room, x) === deckOf(c));
      const now = Date.now();
      // A Fake Loot chest looks like somewhere to search. It isn't.
      const decoy = placedTraps.get(c.room)?.get(msg.spot);
      if (decoy?.kind === 'fakeLoot' && Math.hypot(decoy.x - s.x, decoy.y - s.y) <= SEARCH_REACH + 24) {
        firePlaced(c.room, decoy, c, s.x, s.y);
        break;
      }
      if (!spot || distToSpot(spot, s.x, s.y) > SEARCH_REACH + 10 || now - (vault.lastSearch.get(s.id) ?? 0) < 900) break;
      vault.lastSearch.set(s.id, now);
      const d = vault.diamonds.find((x) => x.place.at === 'spot' && x.place.spot === spot.id);
      if (d) {
        d.place = { at: 'carried', by: s.id };
        announce(c.room, 'found', c, spotRoomOf(c.room, spot));
      } else vault.searched.add(spot.id);
      send(c, { t: 'searchResult', spot: spot.id, found: d?.id ?? null });
      sendDiamonds(c.room);
      break;
    }
    case 'pickup': {
      const vault = vaults.get(c.room);
      const d = vault?.diamonds.find((x) => x.id === msg.id);
      if (!vault || !d || d.place.at !== 'floor' || saboteurs.get(c.room) === s.id || phases.get(c.room)?.phase !== 'live' || carrierOf(vault, s.id)) break;
      if (onDeck(c.room, d.place.deck) !== deckOf(c) || Math.hypot(d.place.x - s.x, d.place.y - s.y) > PICKUP_REACH + 10) break;
      d.place = { at: 'carried', by: s.id };
      sendDiamonds(c.room);
      break;
    }
    case 'bank': {
      // Carrying a diamond into the getaway banks it; enough banked wins the heist.
      const vault = vaults.get(c.room);
      const d = vault && carrierOf(vault, s.id);
      const g = MAPS[deckOf(c)].getaway;
      if (!vault || !d || phases.get(c.room)?.phase !== 'live') break;
      if (s.x < g.x * TILE || s.x > (g.x + g.w) * TILE || s.y < g.y * TILE || s.y > (g.y + g.h) * TILE) break;
      d.place = { at: 'banked', by: s.id };
      vault.banked++;
      // The new count first, so the pop-up that follows shows it.
      sendDiamonds(c.room);
      announce(c.room, 'banked', c, 'the getaway');
      if (vault.banked >= vault.need) finish(c.room, 'runners');
      break;
    }
    case 'portal': {
      if (c.room !== 'lobby') break;
      c.portalChoice = msg.size !== null && PORTALS.some((portal) => portal.size === msg.size) ? msg.size : null;
      c.portalSince.clear();
      break;
    }
    case 'trap': {
      // Only this heist's Saboteur fires traps, and only plates that are ready and not jammed.
      if (saboteurs.get(c.room) !== s.id || phases.get(c.room)?.phase !== 'live') break;
      const trap = trapState.get(c.room)?.get(msg.id);
      const spot = spotOf(c.room, msg.id);
      const now = Date.now();
      if (!trap || !spot || !trapIsReady(trap.firedAt, now, overclockWindows.get(c.room) ?? null, trapRules(spot)) || now < trap.jammedUntil) break;
      trap.tripwired = false;
      trap.firedAt = now;
      for (const id of matches.get(c.room) ?? []) {
        const member = clients.get(id);
        if (member) send(member, { t: 'trap', id: msg.id });
      }
      break;
    }
    case 'tripwire': {
      // Dev's Saboteur ability: a hidden trip line laid mid-heist, on top of the setup traps.
      if (saboteurs.get(c.room) !== s.id || CHARACTER_INFO[s.character].saboteur !== 'tripwire' || phases.get(c.room)?.phase !== 'live') break;
      const now = Date.now();
      const map = deckOf(c);
      if (now < (tripwireReadyAt.get(c.room) ?? 0) || !Number.isFinite(msg.x) || !Number.isFinite(msg.y) || msg.x < 0 || msg.y < 0 || msg.x > mapData[map].width * TILE || msg.y > mapData[map].height * TILE || !openFloor(map, msg.x, msg.y)) break;
      if (!spendUse(c, 'tripwire')) break;
      const trap: PlacedTrap = { id: `tw-${s.id}-${now}`, kind: 'snare', x: Math.round(msg.x), y: Math.round(msg.y), deck: map };
      placedTraps.get(c.room)?.set(trap.id, trap);
      trapState.get(c.room)?.set(trap.id, { firedAt: null, jammedUntil: 0, tripwired: false });
      tripwireReadyAt.set(c.room, now + TRIPWIRE_COOLDOWN_MS);
      send(c, { t: 'place', trap });
      send(c, { t: 'tripwireArmed', id: trap.id });
      break;
    }
    case 'trapRefresh': {
      // Rex's Saboteur ability: a trap that's cooling down is ready again (placed or map).
      if (saboteurs.get(c.room) !== s.id || CHARACTER_INFO[s.character].saboteur !== 'trapRefresh' || phases.get(c.room)?.phase !== 'live') break;
      const now = Date.now();
      const trap = trapState.get(c.room)?.get(msg.id);
      const spot = spotOf(c.room, msg.id);
      const rules = spot ? trapRules(spot) : undefined;
      if (!trap || trap.firedAt == null || trap.jammedUntil > now || (trap.activeUntil !== undefined && now < trap.activeUntil) || trapIsReady(trap.firedAt, now, overclockWindows.get(c.room) ?? null, rules)) break;
      if (!spendUse(c, 'trapRefresh')) break;
      trap.firedAt = null;
      trap.tripwired = false;
      trap.activeFrom = undefined;
      trap.activeUntil = undefined;
      trap.pendingLaser = undefined;
      for (const id of matches.get(c.room) ?? []) {
        const member = clients.get(id);
        if (member) send(member, { t: 'trapRefreshed', id: msg.id });
      }
      break;
    }
    case 'doorJam': {
      if (saboteurs.get(c.room) !== s.id || CHARACTER_INFO[s.character].saboteur !== 'doorJam' || phases.get(c.room)?.phase !== 'live') break;
      const now = Date.now();
      if (now < (doorJamReadyAt.get(c.room) ?? 0)) break;
      if (!doorsOf(c.room).some((door) => door.id === msg.id)) break;
      const locks = doorLocks.get(c.room);
      if (!locks || !spendUse(c, 'doorJam')) break;
      locks.set(msg.id, now + DOOR_JAM_DURATION_MS);
      doorStates.get(c.room)?.set(msg.id, false);
      doorJamReadyAt.set(c.room, now + ABILITIES.doorJam.cooldown * 1000);
      for (const id of matches.get(c.room) ?? []) {
        const member = clients.get(id);
        if (member) {
          send(member, { t: 'door', id: msg.id, open: false });
          send(member, { t: 'doorLocked', id: msg.id, ms: DOOR_JAM_DURATION_MS });
        }
      }
      send(c, { t: 'doorJammed' });
      break;
    }
    case 'place':
    case 'unplace': {
      // Only the Saboteur lays traps, only during setup, within the slot limits; everyone
      // else in the heist is told.
      if (saboteurs.get(c.room) !== s.id || phases.get(c.room)?.phase !== 'setup') break;
      const placed = placedTraps.get(c.room);
      if (!placed) break;
      if (msg.t === 'place') {
        const trap = msg.trap;
        if (!trap || !trapKind(trap.kind) || !Number.isFinite(trap.x) || !Number.isFinite(trap.y) || typeof trap.id !== 'string' || placed.has(trap.id)) break;
        if (placementRefusal([...placed.values()].map((p) => p.kind), trap.kind, matches.get(c.room)?.size ?? 2)) break;
        const energy = saboteurEnergy.get(c.room);
        if (!energy || energy.current < trapKind(trap.kind)!.cost) {
          send(c, { t: 'placementRejected', id: trap.id, reason: 'Not enough energy' });
          break;
        }
        energy.current -= trapKind(trap.kind)!.cost;
        trap.deck = onDeck(c.room, trap.deck);
        placed.set(trap.id, trap);
        trapState.get(c.room)?.set(trap.id, { firedAt: null, jammedUntil: 0, tripwired: false });
      } else {
        const placedTrap = placed.get(msg.id);
        if (!placedTrap || !placed.delete(msg.id)) break;
        trapState.get(c.room)?.delete(msg.id);
        const energy = saboteurEnergy.get(c.room);
        if (energy) energy.current = Math.min(energy.max, energy.current + trapKind(placedTrap.kind)!.cost);
      }
      send(c, msg);
      const energy = saboteurEnergy.get(c.room);
      if (energy) send(c, { t: 'energy', current: energy.current, max: energy.max });
      break;
    }
    case 'moveTrap': {
      if (saboteurs.get(c.room) !== s.id || phases.get(c.room)?.phase !== 'live' || isHideSeek(c.room)) break;
      const reject = (reason: string) => send(c, { t: 'trapMoveRejected', id: msg.id, reason });
      const placed = placedTraps.get(c.room);
      const trap = placed?.get(msg.id);
      const state = trapState.get(c.room)?.get(msg.id);
      if (!trap || !state) {
        reject('That trap is no longer available');
        break;
      }
      if (state.firedAt !== null) {
        reject('A trap that has fired cannot be moved');
        break;
      }
      if (state.moved) {
        reject('Each trap can only be repositioned once');
        break;
      }
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) {
        reject('Choose a valid floor tile');
        break;
      }
      if (msg.deck !== undefined && (!isMapId(msg.deck) || !decksIn(c.room).includes(msg.deck))) {
        reject('That floor is not part of this map');
        break;
      }
      const deck = onDeck(c.room, msg.deck);
      const kind = trapKind(trap.kind)!;
      const x = Math.round(msg.x / (TILE / 2)) * (TILE / 2);
      const y = Math.round(msg.y / (TILE / 2)) * (TILE / 2);
      const halfW = Math.min(kind.w - 6, 24) / 2;
      const halfH = Math.min(kind.h - 6, 24) / 2;
      if (!openFloor(deck, x, y, halfW, halfH)) {
        reject('That spot is blocked · choose open floor');
        break;
      }
      if ((trap.deck ?? matchMaps.get(c.room)) === deck && Math.hypot(trap.x - x, trap.y - y) < 1) {
        reject('Choose a new spot for the trap');
        break;
      }
      trap.x = x;
      trap.y = y;
      if (deck === matchMaps.get(c.room)) delete trap.deck;
      else trap.deck = deck;
      state.moved = true;
      const moved = { ...trap };
      send(c, { t: 'trapMoved', trap: moved });
      // Fake Loot is intentionally visible; hidden traps remain private to the Saboteur.
      if (trap.kind === 'fakeLoot') {
        for (const id of matches.get(c.room) ?? []) {
          if (id === s.id) continue;
          const member = clients.get(id);
          if (member) send(member, { t: 'trapMoved', trap: moved });
        }
      }
      break;
    }
    case 'trapHit': {
      // A Runner was caught: the whole crew (and the Saboteur) gets a pop-up naming them.
      const now = Date.now();
      if (!saboteurs.has(c.room) || saboteurs.get(c.room) === s.id || phases.get(c.room)?.phase !== 'live') break;
      if (now - (lastTrapHit.get(s.id) ?? 0) < 400) break;
      lastTrapHit.set(s.id, now);
      const vault = vaults.get(c.room);
      if (vault) vault.hits++;
      // Where it happened: where the Runner says, if that's close to where we last saw them.
      const close = Number.isFinite(msg.x) && Number.isFinite(msg.y) && Math.hypot(msg.x! - s.x, msg.y! - s.y) <= 48;
      const [ax, ay] = close ? [Math.round(msg.x!), Math.round(msg.y!)] : [Math.round(s.x), Math.round(s.y)];
      const alert: ServerMsg = { t: 'trapAlert', id: s.id, name: s.name, trap: String(msg.trap).slice(0, 24), area: String(msg.area).slice(0, 32), x: ax, y: ay, deck: deckOf(c) };
      for (const id of matches.get(c.room) ?? []) {
        const member = clients.get(id);
        if (member) send(member, alert);
      }
      break;
    }
    case 'heal': {
      // Runner to Runner, in the same heist; the healer's game checks reach and cooldown.
      const sab = saboteurs.get(c.room);
      const target = clients.get(msg.target);
      if (!sab || sab === s.id || !target || target.room !== c.room || msg.target === sab || !spendUse(c, 'firstAid')) break;
      send(target, { t: 'healed', by: s.id });
      break;
    }
    case 'jam': {
      // Patch's Runner ability: every trap in reach stops working for a while. Placed traps
      // the Runner couldn't see are shown to them (so it doubles as a trap detector).
      if (!saboteurs.has(c.room) || saboteurs.get(c.room) === s.id || phases.get(c.room)?.phase !== 'live') break;
      const now = Date.now();
      const states = trapState.get(c.room);
      // Where the Runner pressed it (their last move may still be on its way), if that's close.
      const near = Number.isFinite(msg.x) && Number.isFinite(msg.y) && Math.hypot(msg.x - s.x, msg.y - s.y) <= 48;
      const [jx, jy] = near ? [msg.x, msg.y] : [s.x, s.y];
      const deck = deckOf(c);
      const placed = [...(placedTraps.get(c.room)?.values() ?? [])].filter((t) => onDeck(c.room, t.deck) === deck && Math.hypot(t.x - jx, t.y - jy) <= JAM_REACH);
      const fixed = trapsOn(c.room, deck).filter((t) => Math.hypot(t.x - jx, t.y - jy) <= JAM_REACH);
      if (!states || (!placed.length && !fixed.length) || !spendUse(c, 'trapJam')) {
        send(c, { t: 'jam', id: '', ms: 0 });
        break;
      }
      for (const t of [...placed, ...fixed]) {
        const st = states.get(t.id);
        if (!st) continue;
        st.jammedUntil = now + JAM_MS;
        st.tripwired = false;
        st.activeFrom = undefined;
        st.activeUntil = undefined;
        st.pendingLaser = undefined;
      }
      for (const id of matches.get(c.room) ?? []) {
        const member = clients.get(id);
        if (!member) continue;
        for (const t of fixed) send(member, { t: 'jam', id: t.id, ms: JAM_MS });
        for (const t of placed) send(member, { t: 'jam', id: t.id, ms: JAM_MS, ...(member === c || id === saboteurs.get(c.room) ? { trap: t } : {}) });
      }
      break;
    }
    case 'map':
      if (isMapId(msg.map)) c.mapPref = msg.map;
      break;
    case 'mode':
      if (isGameMode(msg.mode)) c.modePref = msg.mode;
      break;
    case 'shoot':
      if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) shoot(c, msg.x, msg.y);
      break;
    case 'hideIn': {
      // A Hider (still in play) gets into a free hiding place within reach.
      const hunt = hunts.get(c.room);
      if (!hunt || saboteurs.get(c.room) === s.id || phases.get(c.room)?.phase === 'over' || !inPlay(hunt, s.id) || hunt.hidden.has(s.id)) break;
      const spot = hideSpotsOn(deckOf(c)).find((h) => h.id === msg.spot);
      if (!spot || distToHideSpot(spot, s.x, s.y) > HIDE_REACH + 12 || [...hunt.hidden.values()].includes(spot.id)) break;
      hunt.hidden.set(s.id, spot.id);
      const at = hideSpotCenter(spot);
      s.x = at.x;
      s.y = at.y;
      send(c, { t: 'hidden', spot: spot.id, x: at.x, y: at.y });
      break;
    }
    case 'unhide': {
      const hunt = hunts.get(c.room);
      if (hunt?.hidden.has(s.id)) unhide(c.room, c);
      break;
    }
    case 'seekSpot': {
      // The Seeker opens a hiding place: whoever's inside is out, and seen.
      const hunt = hunts.get(c.room);
      if (!hunt || saboteurs.get(c.room) !== s.id || phases.get(c.room)?.phase !== 'live') break;
      const spot = hideSpotsOn(deckOf(c)).find((h) => h.id === msg.spot);
      if (!spot || distToHideSpot(spot, s.x, s.y) > HIDE_REACH + 12) break;
      const inside = [...hunt.hidden].find(([, id]) => id === spot.id)?.[0];
      const hider = inside ? clients.get(inside) : undefined;
      if (hider) unhide(c.room, hider);
      for (const id of matches.get(c.room) ?? []) {
        const m = clients.get(id);
        if (m) send(m, { t: 'searched', spot: spot.id, found: hider?.state.id ?? null, name: hider?.state.name ?? '' });
      }
      break;
    }
    case 'hsAbility': {
      // Hide & Seek abilities, live phase only; the server keeps the cooldowns.
      const hunt = hunts.get(c.room);
      const now = Date.now();
      if (!hunt || !isHsAbility(msg.ability) || phases.get(c.room)?.phase !== 'live') break;
      const seeker = saboteurs.get(c.room) === s.id;
      if (msg.ability === 'flare' && seeker && hunt.flaresLeft > 0 && now >= hunt.flareReady) {
        hunt.flaresLeft--;
        hunt.flareReady = now + FLARE.cooldownMs;
        hunt.flareUntil = now + FLARE.ms;
        hunt.flareDeck = s.deck ?? '';
        send(c, { t: 'hsAbility', ability: 'flare', readyMs: hunt.flaresLeft ? FLARE.cooldownMs : -1, left: hunt.flaresLeft });
        for (const id of matches.get(c.room) ?? []) {
          const m = clients.get(id);
          if (m && (m.state.deck ?? '') === hunt.flareDeck) send(m, { t: 'flare', deck: hunt.flareDeck, ms: FLARE.ms });
        }
      } else if (msg.ability === 'scan' && seeker && now >= hunt.scanReady) {
        hunt.scanReady = now + SCAN.cooldownMs;
        const spots = hideSpotsOn(deckOf(c)).filter((h) => [...hunt.hidden.values()].includes(h.id) && Math.hypot(hideSpotCenter(h).x - s.x, hideSpotCenter(h).y - s.y) <= SCAN.range);
        send(c, { t: 'hsAbility', ability: 'scan', readyMs: SCAN.cooldownMs });
        send(c, { t: 'scanned', spots: spots.map((h) => h.id), ms: SCAN.ms });
        for (const [id, spot] of hunt.hidden) {
          const m = clients.get(id);
          if (m && spots.some((h) => h.id === spot)) send(m, { t: 'scanned', spots: [spot], ms: SCAN.ms, you: true });
        }
      } else if (msg.ability === 'boost' && !seeker && inPlay(hunt, s.id) && !hunt.hidden.has(s.id) && now >= (hunt.boostReady.get(s.id) ?? 0)) {
        hunt.boostReady.set(s.id, now + BOOST.cooldownMs);
        hunt.boostUntil.set(s.id, now + BOOST.ms);
        send(c, { t: 'hsAbility', ability: 'boost', readyMs: BOOST.cooldownMs });
      }
      break;
    }
    case 'reload': {
      const hunt = hunts.get(c.room);
      if (!hunt || saboteurs.get(c.room) !== s.id || hunt.reloadUntil > Date.now() || hunt.ammo === GUN.ammo) break;
      hunt.ammo = 0;
      hunt.reloadUntil = Date.now() + GUN.reloadMs;
      sendGun(c, hunt);
      break;
    }
    case 'deck': {
      // Stairs to another deck of the ship: from now on the player is there, at (x, y).
      if (!matches.has(c.room) || !isMapId(msg.deck) || !decksIn(c.room).includes(msg.deck)) break;
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) break;
      s.deck = msg.deck;
      s.x = Math.max(0, Math.min(mapData[msg.deck].width * TILE, msg.x));
      s.y = Math.max(0, Math.min(mapData[msg.deck].height * TILE, msg.y));
      break;
    }
    case 'character':
      // Refused if someone else has it while a free one exists; either way the player hears
      // what they ended up with.
      if (CHARACTERS.includes(msg.character) && (!takenBy(msg.character, c) || CHARACTERS.every((id) => takenBy(id, c)))) s.character = msg.character;
      send(c, { t: 'character', character: s.character });
      break;
    case 'ability': {
      const match = matches.get(c.room);
      if (!match) break;
      const isSaboteur = saboteurs.get(c.room) === s.id;
      if (isSaboteur) {
        if (msg.ability !== 'overclock' || CHARACTER_INFO[s.character].saboteur !== 'overclock' || phases.get(c.room)?.phase !== 'live') break;
        const startsAt = Date.now();
        if (startsAt < (overclockReadyAt.get(c.room) ?? 0) || !spendUse(c, 'overclock')) break;
        overclockWindows.set(c.room, { startsAt, endsAt: startsAt + OVERCLOCK_MS });
        overclockReadyAt.set(c.room, startsAt + OVERCLOCK_COOLDOWN_MS);
        break;
      }
      if (msg.ability === 'overclock') break;
      const out: ServerMsg = { t: 'ability', ability: msg.ability, by: s.id };
      for (const id of match) {
        const other = clients.get(id);
        if (other && other !== c) send(other, out);
      }
      break;
    }
    case 'door': {
      const match = matches.get(c.room);
      if (!match || !doorsOf(c.room).some((door) => door.id === msg.id)) break;
      const lockUntil = doorLocks.get(c.room)?.get(msg.id) ?? 0;
      if (msg.open && lockUntil > Date.now()) {
        send(c, { t: 'door', id: msg.id, open: false });
        send(c, { t: 'doorLocked', id: msg.id, ms: lockUntil - Date.now() });
        break;
      }
      if (lockUntil) doorLocks.get(c.room)?.delete(msg.id);
      doorStates.get(c.room)?.set(msg.id, !!msg.open);
      for (const id of match) {
        const other = clients.get(id);
        if (other && other !== c) send(other, msg);
      }
      break;
    }
    case 'leave':
      leaveMatch(c);
      toLobby(c);
      break;
  }
}

// ---------- Diamonds ----------

const spotsOf = (matchId: string): HidingSpot[] => decksIn(matchId).flatMap((d) => mapData[d].interactables.filter(isHidingSpot));
/** The deck a piece of furniture is on (spot ids are unique across a ship's decks). */
const spotDeck = (matchId: string, spot: HidingSpot): MapId => decksIn(matchId).find((d) => mapData[d].interactables.some((x) => x.id === spot.id)) ?? matchMaps.get(matchId) ?? 'estate';
const spotRoomOf = (matchId: string, spot: HidingSpot) => {
  const data = mapData[spotDeck(matchId, spot)];
  return spotRoom(spot, data.areas, data.width);
};
/** A room's key for the two-per-room rule: on the ship, rooms on different decks are different. */
const roomKey = (matchId: string, spot: HidingSpot) => `${spotDeck(matchId, spot)}:${spotRoomOf(matchId, spot)}`;
const carrierOf = (vault: Vault | undefined, playerId: string) => vault?.diamonds.find((d) => d.place.at === 'carried' && d.place.by === playerId);
/** Diamonds hidden in a room, not counting `except`. */
function roomCount(matchId: string, vault: Vault, room: string, except?: Diamond) {
  return vault.diamonds.filter((d) => d !== except && d.place.at === 'spot' && roomKey(matchId, spotsOf(matchId).find((x) => x.id === (d.place as { spot: string }).spot)!) === room).length;
}

/** The diamonds as this player may see them. */
function diamondsMsg(c: Client, matchId: string): ServerMsg {
  const vault = vaults.get(matchId)!;
  const sab = saboteurs.get(matchId) === c.state.id;
  return { t: 'diamonds', items: vault.diamonds.map((d) => (sab ? d : runnerView(d))), searched: [...vault.searched], banked: vault.banked, need: vault.need, total: vault.diamonds.length };
}

function sendDiamonds(matchId: string) {
  if (!vaults.has(matchId)) return;
  for (const id of matches.get(matchId) ?? []) {
    const member = clients.get(id);
    if (member) send(member, diamondsMsg(member, matchId));
  }
}

function announce(matchId: string, kind: 'found' | 'banked' | 'dropped', c: Client, area: string) {
  for (const id of matches.get(matchId) ?? []) {
    const member = clients.get(id);
    if (member) send(member, { t: 'diamondEvent', kind, id: c.state.id, name: c.state.name, area });
  }
}

/** A Runner loses their diamond: it lands on the floor where they were. */
function dropDiamond(matchId: string, playerId: string, x: number, y: number) {
  const vault = vaults.get(matchId);
  const d = carrierOf(vault, playerId);
  if (!vault || !d) return;
  const c = clients.get(playerId);
  const deck = c ? deckOf(c) : matchMaps.get(matchId) ?? 'estate';
  d.place = { at: 'floor', x, y, deck };
  if (c) {
    c.state.carrying = false;
    const data = mapData[deck];
    const room = data.areas.names[data.areas.data[Math.floor(y / TILE) * data.width + Math.floor(x / TILE)]] ?? '';
    announce(matchId, 'dropped', c, room);
  }
  sendDiamonds(matchId);
}

/** Setup is over: anything the Saboteur didn't hide is hidden for them, then the heist starts. */
function goLive(matchId: string) {
  const vault = vaults.get(matchId);
  const round = phases.get(matchId);
  if (!vault || !round) return;
  const spots = [...spotsOf(matchId)].sort(() => Math.random() - 0.5);
  for (const d of vault.diamonds) {
    if (d.place.at !== 'tray') continue;
    const free = spots.find((sp) => !vault.diamonds.some((x) => x.place.at === 'spot' && x.place.spot === sp.id) && roomCount(matchId, vault, roomKey(matchId, sp)) < DIAMONDS_PER_ROOM)
      ?? spots.find((sp) => !vault.diamonds.some((x) => x.place.at === 'spot' && x.place.spot === sp.id));
    if (free) d.place = { at: 'spot', spot: free.id };
  }
  round.phase = 'live';
  round.endsAt = Date.now() + (isHideSeek(matchId) ? HUNT_TIME : LIVE_TIME);
  // Placed traps stay secret from the Runners, except Fake Loot chests, which are meant to be seen.
  const decoys = [...(placedTraps.get(matchId)?.values() ?? [])].filter((t) => t.kind === 'fakeLoot');
  for (const id of matches.get(matchId) ?? []) {
    const member = clients.get(id);
    if (!member) continue;
    send(member, { t: 'phase', phase: 'live', ms: isHideSeek(matchId) ? HUNT_TIME : LIVE_TIME });
    if (id !== saboteurs.get(matchId)) for (const trap of decoys) send(member, { t: 'place', trap });
  }
  sendDiamonds(matchId);
}

/** Hide & Seek's round: who was caught, who escaped, and who simply stayed hidden. */
function huntSummary(matchId: string) {
  const hunt = hunts.get(matchId)!;
  const sab = saboteurs.get(matchId);
  const names = (ids: Iterable<string>) => [...ids].map((id) => series.get(matchId)?.players.get(id)?.name ?? clients.get(id)?.state.name ?? '?');
  const survived = [...(matches.get(matchId) ?? [])].filter((id) => id !== sab && inPlay(hunt, id));
  return { caught: names(hunt.caught), escaped: names(hunt.escaped), survived: names(survived) };
}

/** The heist is over: score it, tell everyone who won and where everything was, start the break. */
function finish(matchId: string, winner: 'runners' | 'saboteur' | 'none') {
  const vault = vaults.get(matchId);
  const round = phases.get(matchId);
  const sr = series.get(matchId);
  if (!vault || !round || round.phase === 'over') return;
  vault.winner = winner;
  round.phase = 'over';
  round.endsAt = Date.now();
  if (sr) {
    const sab = saboteurs.get(matchId);
    const hunt = hunts.get(matchId);
    for (const [id, p] of sr.players) {
      let pts = 0;
      if (hunt) {
        // Hide & Seek: the Seeker scores catches and the win; Hiders score for surviving.
        if (id === sab) pts = hunt.caught.size * HS_SCORE.catch + (winner === 'saboteur' ? HS_SCORE.seekerWin : 0);
        else if (matches.get(matchId)?.has(id) && !hunt.caught.has(id) && winner !== 'none') pts = HS_SCORE.survive + (hunt.escaped.has(id) ? HS_SCORE.escape : 0);
      } else if (id === sab) {
        pts = vault.hits * SCORE.trapHit + (vault.diamonds.length - vault.banked) * SCORE.unbanked + (winner === 'saboteur' ? SCORE.saboteurWin : 0);
      } else if (matches.get(matchId)?.has(id)) {
        pts = vault.diamonds.filter((d) => d.place.at === 'banked' && d.place.by === id).length * SCORE.bank + (winner === 'runners' ? SCORE.runnersWin : 0);
      }
      p.perRound[sr.round] = pts;
    }
    sr.history[sr.round] = { map: matchMaps.get(matchId) ?? 'estate', saboteur: sr.players.get(sab ?? '')?.name ?? '?', winner };
    const last = sr.round + 1 >= sr.rounds;
    sr.nextAt = Date.now() + (last ? FINAL_DELAY_MS : INTERMISSION_MS);
  }
  for (const id of matches.get(matchId) ?? []) {
    const member = clients.get(id);
    if (!member) continue;
    send(member, { t: 'phase', phase: 'over', ms: 0 });
    send(member, resultMsg(matchId));
  }
  console.log(`${matchId}: round ${(sr?.round ?? 0) + 1} ${winner === 'none' ? 'called off' : `${winner} win`} (${vault.banked}/${vault.need} banked)`);
}

function resultMsg(matchId: string): ServerMsg {
  const vault = vaults.get(matchId)!;
  const sr = series.get(matchId);
  const sab = saboteurs.get(matchId);
  const r = sr?.round ?? 0;
  return {
    t: 'result',
    winner: vault.winner ?? 'saboteur',
    banked: vault.banked,
    need: vault.need,
    total: vault.diamonds.length,
    diamonds: vault.diamonds,
    placed: [...(placedTraps.get(matchId)?.values() ?? [])],
    round: r + 1,
    rounds: sr?.rounds ?? 1,
    points: [...(sr?.players ?? [])].map(([id, p]) => ({ id, name: p.name, points: p.perRound[r] ?? 0, saboteur: id === sab })).sort((a, b) => b.points - a.points),
    standings: standings(matchId),
    nextMs: Math.max(0, (sr?.nextAt ?? Date.now()) - Date.now()),
    last: !sr || r + 1 >= sr.rounds,
    ...(hunts.has(matchId) ? { hunt: huntSummary(matchId) } : {}),
  };
}

/** Each Runner hears which hiding spots near them hold a diamond (so only those can glint). */
function sendGlints(matchId: string) {
  const vault = vaults.get(matchId);
  if (!vault) return;
  const hidden = new Map(vault.diamonds.filter((d) => d.place.at === 'spot').map((d) => [(d.place as { spot: string }).spot, d]));
  const spots = spotsOf(matchId).filter((sp) => hidden.has(sp.id));
  for (const id of matches.get(matchId) ?? []) {
    const c = clients.get(id);
    if (!c || id === saboteurs.get(matchId)) continue;
    const near = spots.filter((sp) => distToSpot(sp, c.state.x, c.state.y) <= GLINT_REACH).map((sp) => sp.id);
    const key = near.join(',');
    if (vault.glints.get(id) === key) continue;
    vault.glints.set(id, key);
    send(c, { t: 'glints', spots: near });
  }
}

/**
 * The first message on a connection. A key the server knows (a dropped player, or the same
 * tab reloading) resumes that player: same id, character, heist and role. Otherwise it's a
 * new player.
 */
function hello(fresh: Client, msg: Extract<ClientMsg, { t: 'hello' }>): Client {
  const key = typeof msg.key === 'string' && /^[\w-]{16,64}$/.test(msg.key) ? msg.key : null;
  const known = key ? byKey.get(key) : undefined;
  if (!known) {
    fresh.key = key;
    if (key) byKey.set(key, fresh);
    handle(fresh, msg);
    return fresh;
  }
  // Take the seat back. If the old connection is somehow still open (a second tab), it loses.
  clients.delete(fresh.state.id);
  if (known.dropTimer) clearTimeout(known.dropTimer);
  known.dropTimer = null;
  if (!known.state.offline && known.ws !== fresh.ws) {
    send(known, { t: 'replaced' });
    known.ws.close();
  }
  known.ws = fresh.ws;
  known.state.offline = false;
  send(known, { t: 'welcome', id: known.state.id, resumed: true });
  if (known.room === 'lobby' || !matches.has(known.room)) {
    known.room = 'lobby';
    send(known, { t: 'lobby', x: known.state.x, y: known.state.y, character: known.state.character });
  } else {
    send(known, matchMsg(known, known.room, true));
    send(known, resyncMsg(known.room, known));
    send(known, diamondsMsg(known, known.room));
    if (phases.get(known.room)?.phase === 'over') send(known, resultMsg(known.room));
    const sr = series.get(known.room);
    // Hide & Seek: who's out, my hiding place, the Seeker's gun.
    const hunt = hunts.get(known.room);
    if (hunt) {
      const left = huntersLeft(known.room, hunt);
      for (const id of hunt.caught) send(known, { t: 'caught', id, name: clients.get(id)?.state.name ?? '', left });
      for (const id of hunt.escaped) send(known, { t: 'escaped', id, name: clients.get(id)?.state.name ?? '', left });
      if (hunt.hidden.has(known.state.id)) send(known, { t: 'hidden', spot: hunt.hidden.get(known.state.id)!, x: known.state.x, y: known.state.y });
      if (saboteurs.get(known.room) === known.state.id) sendGun(known, hunt);
    }
    if (sr?.done) send(known, { t: 'final', standings: standings(known.room), rounds: sr.history, mode: matchModes.get(known.room) });
    vaults.get(known.room)?.glints.delete(known.state.id);
  }
  console.log(`${known.state.name} reconnected (${known.room})`);
  return known;
}

// ---------- HTTP (the built game) and WebSocket ----------

const DIST = path.join(ROOT, 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const file = path.join(DIST, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('Not found. Run `npm run build` to serve the game from here.');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  const id = String(nextId++);
  const c: Client = {
    ws,
    room: 'lobby',
    portalSince: new Map(),
    portalChoice: null,
    mapPref: 'estate',
    modePref: 'heist',
    key: null,
    dropTimer: null,
    state: { id, name: '', character: 'maya', x: LOBBY_SPAWN.x, y: LOBBY_SPAWN.y, facing: 'down', moving: false, sprint: false, carrying: false, hp: MAX_HP, stunned: false },
  };
  clients.set(id, c);
  send(c, { t: 'welcome', id });
  // Which player this connection is: a new one, until a hello brings back a known key.
  let player = c;
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as ClientMsg;
      if (msg.t === 'hello' && !player.state.name) player = hello(player, msg);
      else handle(player, msg);
    } catch (err) {
      console.warn('bad message', err);
    }
  });
  ws.on('close', () => {
    // A tab that was replaced by another one with the same key has nothing to clean up.
    if (player.ws !== ws) return;
    dropped(player);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Vault Breakers server on http://localhost:${PORT} (WebSocket at /ws)`));
