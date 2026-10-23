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
import { DIAMONDS_PER_ROOM, type Diamond, diamondCount, diamondsToWin, distToSpot, type HidingSpot, GLINT_REACH, PICKUP_REACH, runnerView, SEARCH_REACH, spotRoom } from '../src/data/diamonds.ts';
import { CUSTOM_MIN, CUSTOM_PAD, FINAL_DELAY_MS, INTERMISSION_MS, LIVE_MS, roundsFor, SCORE, MAX_CREW, MIN_CREW, type Phase, placementRefusal, saboteurMaxEnergy, SETUP_MS } from '../src/data/round.ts';
import { trapKind, type PlacedTrap, type TrapKindId } from '../src/data/trapKinds.ts';
import { isMapId, MAP_IDS, type MapId, MAPS } from '../src/data/maps.ts';
import { JAM_MS, MAX_HP, OVERCLOCK_COOLDOWN_MS, OVERCLOCK_MS, TRAP_RADIUS, TRIPWIRE_COOLDOWN_MS, trapIsReady, trapRules, type TrapSpot } from '../src/data/traps.ts';
import { NET_HZ, PORTAL_COUNTDOWN, type ClientMsg, type PlayerState, type PortalState, type ServerMsg, type Standing, type Taken } from '../src/net/protocol.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT ?? 3001);
// For playtests: SETUP_SECONDS=10 HEIST_SECONDS=30 npm run server makes rounds quick.
const SETUP_TIME = Number(process.env.SETUP_SECONDS ?? 0) * 1000 || SETUP_MS;
const LIVE_TIME = Number(process.env.HEIST_SECONDS ?? 0) * 1000 || LIVE_MS;
const TILE = 16;

const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const lobbyMap = readJson('public/assets/lobby/lobby.json');
// Every heist map's data: its spawn point and door ids are all the server needs.
const mapData = Object.fromEntries(MAP_IDS.map((id) => [id, readJson(`public${MAPS[id].json}`)])) as Record<MapId, { width: number; height: number; spawn: { x: number; y: number }; doors: { id: string }[]; interactables: HidingSpot[]; areas: { names: string[]; data: number[] } }>;
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
  /** This tab's secret player key (from hello), so a dropped player can come back as themselves. */
  key: string | null;
  /** While the connection is down: when the held seat is given up. */
  dropTimer: ReturnType<typeof setTimeout> | null;
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
const trapsOf = (matchId: string): TrapSpot[] => MAPS[matchMaps.get(matchId) ?? 'estate'].traps;
const spotOf = (matchId: string, id: string) => trapsOf(matchId).find((t) => t.id === id);
const doorsOf = (matchId: string) => mapData[matchMaps.get(matchId) ?? 'estate'].doors;
/** The crew's map: the most-picked one; a tie goes to whoever got there first (crew is in arrival order). */
function crewMap(crew: Client[]): MapId {
  const votes = new Map<MapId, number>();
  for (const c of crew) votes.set(c.mapPref, (votes.get(c.mapPref) ?? 0) + 1);
  let best = crew[0]?.mapPref ?? 'estate';
  for (const c of crew) if ((votes.get(c.mapPref) ?? 0) > (votes.get(best) ?? 0)) best = c.mapPref;
  return best;
}
/** Per match: who the Saboteur is, and each trap plate's state (ms timestamps). */
const saboteurs = new Map<string, string>();
const trapState = new Map<string, Map<string, { firedAt: number | null; jammedUntil: number; tripwired: boolean }>>();
/** Saboteur-only Overclock window; the ability cooldown prevents overlapping windows. */
const overclockWindows = new Map<string, { startsAt: number; endsAt: number }>();
const overclockReadyAt = new Map<string, number>();
const tripwireReadyAt = new Map<string, number>();
const trapRefreshUsed = new Map<string, boolean>();
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
    case 'laser': return { damage: 20, stunMs: 300 };
    case 'boulder': return { damage: 30, stunMs: 800 };
    case 'fakeLoot': return { damage: 30, stunMs: 2000 };
    default: return { damage: 0, stunMs: 0 };
  }
}

/** Traps that knock a carried diamond out of your hands. */
const DROPS_DIAMOND = new Set<TrapKindId>(['spring', 'laser', 'magnet']);
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
  send(victim, { t: 'placedTrapHit', kind: trap.kind, ...effect, ...(knockback ? { knockback } : {}) });
  for (const id of matches.get(matchId) ?? []) {
    const member = clients.get(id);
    if (member) send(member, { t: 'trapFired', id: trap.id, kind: trap.kind, x: trap.x, y: trap.y, victim: s.id });
  }
  if (trap.kind === 'magnet') {
    // Yanks the diamonds out of every Runner's hands nearby (Mule's Steady Carry holds on).
    for (const id of matches.get(matchId) ?? []) {
      const c = clients.get(id);
      if (!c || id === saboteurs.get(matchId) || (c.state.character === 'zoya' && CHARACTER_INFO.zoya.runner === 'steadyCarry')) continue;
      if (Math.hypot(c.state.x - trap.x, c.state.y - trap.y) <= MAGNET_REACH) dropDiamond(matchId, id, trap.x, trap.y + 10);
    }
  } else if (trap.kind === 'laser') {
    // Knocked back the way you came, so the diamond doesn't land in the beam.
    dropDiamond(matchId, s.id, fromX - (dx / len) * 12, fromY - (dy / len) * 12);
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
  trapRefreshUsed.delete(matchId);
  doorJamReadyAt.delete(matchId);
  doorLocks.delete(matchId);
  saboteurEnergy.delete(matchId);
  placedTraps.delete(matchId);
  vaults.delete(matchId);
  phases.delete(matchId);
  abilityUses.delete(matchId);
  series.delete(matchId);
}

function startMatch(size: number, crew: Client[]) {
  const matchId = `heist-${nextMatch++}`;
  const first = crewMap(crew);
  // Saboteur turns in a random order; the map starts with the crew's pick and then rotates.
  const order = crew.map((c) => c.state.id).sort(() => Math.random() - 0.5);
  const rounds = roundsFor(crew.length);
  const maps = Array.from({ length: rounds }, (_, i) => MAP_IDS[(MAP_IDS.indexOf(first) + i) % MAP_IDS.length]);
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
  console.log(`${matchId}: ${size}-player match, ${rounds} rounds, with ${crew.map((c) => c.state.name).join(', ')}`);
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
    c.state.facing = 'up';
    c.state.moving = false;
    c.state.carrying = false;
    c.state.hp = MAX_HP;
    c.state.stunned = false;
  });
  saboteurs.set(matchId, saboteur);
  const sabCharacter = clients.get(saboteur)!.state.character;
  const size = matchSizes.get(matchId) ?? crew.length;
  const maxEnergy = saboteurMaxEnergy(sabCharacter, size);
  saboteurEnergy.set(matchId, { current: maxEnergy, max: maxEnergy });
  placedTraps.set(matchId, new Map());
  // The diamonds start in the Saboteur's hands; they hide them during setup.
  const total = diamondCount(size);
  vaults.set(matchId, { diamonds: Array.from({ length: total }, (_, i) => ({ id: `d${i + 1}`, place: { at: 'tray' } })), searched: new Set(), banked: 0, need: diamondsToWin(total), winner: null, hits: 0, glints: new Map(), lastSearch: new Map() });
  phases.set(matchId, { phase: 'setup', endsAt: Date.now() + SETUP_TIME });
  trapState.set(matchId, new Map(MAPS[map].traps.map((t) => [t.id, { firedAt: null, jammedUntil: 0, tripwired: false }])));
  overclockWindows.delete(matchId);
  overclockReadyAt.set(matchId, 0);
  tripwireReadyAt.set(matchId, 0);
  trapRefreshUsed.set(matchId, false);
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
  const msg: ServerMsg = { t: 'final', standings: standings(matchId), rounds: sr.history };
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
    .filter((p): p is PlayerState => !!p && (p.id !== saboteur || isSaboteur))
    .map((p) => ({ ...p }));
  const round = phases.get(matchId);
  const energy = saboteurEnergy.get(matchId);
  return {
    t: 'match',
    matchId,
    size: matchSizes.get(matchId) ?? players.length,
    map: matchMaps.get(matchId) ?? 'estate',
    players,
    role: isSaboteur ? 'saboteur' : 'runner',
    phase: round?.phase ?? 'setup',
    ms: Math.max(0, (round?.endsAt ?? Date.now()) - Date.now()),
    ...(isSaboteur && energy ? { energy: energy.current, maxEnergy: energy.max } : {}),
    ...(resume ? { resume: true } : {}),
    round: (series.get(matchId)?.round ?? 0) + 1,
    rounds: series.get(matchId)?.rounds ?? 1,
  };
}

/** What a reconnecting player missed: doors, and the traps they're allowed to know about. */
function resyncMsg(matchId: string, c: Client): ServerMsg {
  const sab = saboteurs.get(matchId) === c.state.id;
  const live = phases.get(matchId)?.phase !== 'setup';
  const known = (t: PlacedTrap) => sab || (live && (t.kind === 'fakeLoot' || trapState.get(matchId)?.get(t.id)?.firedAt != null));
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
      return { size: portal.size, count: inside.length, countdown: null, map: inside.length ? crewMap(sortByArrival(inside, portal.size)) : null };
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
    return { size: portal.size, count: inside.length, countdown: Math.ceil(left), map: crewMap(sortByArrival(inside, portal.size).slice(0, portal.size)) };
  });
}

function tick() {
  const portals = updatePortals(Date.now());
  const online = joined().length;
  const taken: Taken[] = joined().map((c) => ({ character: c.state.character, name: c.state.name }));
  const lobbyPlayers = inRoom('lobby').map((c) => c.state);
  for (const c of inRoom('lobby')) send(c, { t: 'snapshot', room: 'lobby', players: lobbyPlayers, portals, online, taken });
  for (const [matchId, ids] of matches) {
    const players = [...ids].map((id) => clients.get(id)?.state).filter((s): s is PlayerState => !!s && s.id !== saboteurs.get(matchId));
    for (const id of ids) {
      const c = clients.get(id);
      if (c) send(c, { t: 'snapshot', room: 'match', players, portals: [], online, taken: [] });
    }
    if (!players.length) {
      endMatch(matchId);
      continue;
    }
    // The round's clock: setup, then the heist, then time's up.
    const p = phases.get(matchId);
    if (p && p.phase !== 'over' && Date.now() >= p.endsAt) {
      // Setup over: the heist starts. Heist over: the Saboteur held on to enough diamonds.
      if (p.phase === 'setup') goLive(matchId);
      else finish(matchId, 'saboteur');
    }
    if (p?.phase === 'live') sendGlints(matchId);
    // The break after a round: then the next round, or after the last one the final results.
    const sr = series.get(matchId);
    if (sr && !sr.done && sr.nextAt !== null && Date.now() >= sr.nextAt) {
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
      s.name = String(msg.name).slice(0, 14) || `Bandit ${s.id}`;
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
        if (!round || round.phase !== 'live' || saboteurs.get(c.room) === s.id) break;
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
      if (c.room !== 'lobby') {
        const now = Date.now();
        const saboteurId = saboteurs.get(c.room);
        if (saboteurId !== s.id && phases.get(c.room)?.phase === 'live') {
          for (const plate of trapsOf(c.room)) {
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
            if (trap.kind === 'fakeLoot') continue;
            const state = trapState.get(c.room)?.get(trap.id);
            const radius = Math.max(12, Math.min(trapKind(trap.kind)!.w, trapKind(trap.kind)!.h) / 2);
            if (!state || now < state.jammedUntil || !trapIsReady(state.firedAt, now, overclockWindows.get(c.room) ?? null)) continue;
            if (Math.hypot(fromX - trap.x, fromY - trap.y) <= radius || distanceToSegment(trap.x, trap.y, fromX, fromY, s.x, s.y) > radius) continue;
            state.firedAt = now;
            firePlaced(c.room, trap, c, fromX, fromY);
          }
        }
        for (const plate of trapsOf(c.room)) {
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
      if (saboteurs.get(matchId) !== s.id || phases.get(matchId)?.phase !== 'setup') break;
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
        if (roomCount(c.room, vault, spotRoomOf(c.room, spot), d) >= DIAMONDS_PER_ROOM) break;
        d.place = { at: 'spot', spot: spot.id };
      }
      sendDiamonds(c.room);
      break;
    }
    case 'search': {
      // A Runner who held E next to a piece of furniture: is a diamond in there?
      const vault = vaults.get(c.room);
      if (!vault || saboteurs.get(c.room) === s.id || phases.get(c.room)?.phase !== 'live' || carrierOf(vault, s.id)) break;
      const spot = spotsOf(c.room).find((x) => x.id === msg.spot);
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
      if (Math.hypot(d.place.x - s.x, d.place.y - s.y) > PICKUP_REACH + 10) break;
      d.place = { at: 'carried', by: s.id };
      sendDiamonds(c.room);
      break;
    }
    case 'bank': {
      // Carrying a diamond into the getaway banks it; enough banked wins the heist.
      const vault = vaults.get(c.room);
      const d = vault && carrierOf(vault, s.id);
      const g = MAPS[matchMaps.get(c.room) ?? 'estate'].getaway;
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
      if (saboteurs.get(c.room) !== s.id || CHARACTER_INFO[s.character].saboteur !== 'tripwire' || phases.get(c.room)?.phase !== 'live') break;
      const now = Date.now();
      if (now < (tripwireReadyAt.get(c.room) ?? 0)) break;
      const trap = trapState.get(c.room)?.get(msg.id);
      const spot = spotOf(c.room, msg.id);
      if (!trap || !spot || (spot.kind && spot.kind !== 'plate') || trap.tripwired || trap.jammedUntil > now || !trapIsReady(trap.firedAt, now, overclockWindows.get(c.room) ?? null, trapRules(spot))) break;
      if (!spendUse(c, 'tripwire')) break;
      trap.tripwired = true;
      tripwireReadyAt.set(c.room, now + TRIPWIRE_COOLDOWN_MS);
      send(c, { t: 'tripwireArmed', id: msg.id });
      break;
    }
    case 'trapRefresh': {
      if (saboteurs.get(c.room) !== s.id || CHARACTER_INFO[s.character].saboteur !== 'trapRefresh' || phases.get(c.room)?.phase !== 'live' || trapRefreshUsed.get(c.room)) break;
      const now = Date.now();
      const trap = trapState.get(c.room)?.get(msg.id);
      const spot = spotOf(c.room, msg.id);
      if (!trap || !spot || trap.jammedUntil > now || trapIsReady(trap.firedAt, now, overclockWindows.get(c.room) ?? null, trapRules(spot))) break;
      trap.firedAt = null;
      trap.tripwired = false;
      trapRefreshUsed.set(c.room, true);
      send(c, { t: 'trapRefreshed', id: msg.id });
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
    case 'trapHit': {
      // A Runner was caught: the whole crew (and the Saboteur) gets a pop-up naming them.
      const now = Date.now();
      if (!saboteurs.has(c.room) || saboteurs.get(c.room) === s.id || phases.get(c.room)?.phase !== 'live') break;
      if (now - (lastTrapHit.get(s.id) ?? 0) < 400) break;
      lastTrapHit.set(s.id, now);
      const vault = vaults.get(c.room);
      if (vault) vault.hits++;
      const alert: ServerMsg = { t: 'trapAlert', id: s.id, name: s.name, trap: String(msg.trap).slice(0, 24), area: String(msg.area).slice(0, 32) };
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
      // Runners only (not the Saboteur). The game checks reach and the ability's cooldown.
      if (!saboteurs.has(c.room) || saboteurs.get(c.room) === s.id) break;
      const trap = trapState.get(c.room)?.get(msg.id);
      if (!trap || !spendUse(c, 'trapJam')) break;
      trap.jammedUntil = Date.now() + JAM_MS;
      trap.tripwired = false;
      for (const id of matches.get(c.room) ?? []) {
        const member = clients.get(id);
        if (member) send(member, { t: 'jam', id: msg.id, ms: JAM_MS });
      }
      break;
    }
    case 'map':
      if (isMapId(msg.map)) c.mapPref = msg.map;
      break;
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

const spotsOf = (matchId: string): HidingSpot[] => mapData[matchMaps.get(matchId) ?? 'estate'].interactables;
const spotRoomOf = (matchId: string, spot: HidingSpot) => {
  const data = mapData[matchMaps.get(matchId) ?? 'estate'];
  return spotRoom(spot, data.areas, data.width);
};
const carrierOf = (vault: Vault | undefined, playerId: string) => vault?.diamonds.find((d) => d.place.at === 'carried' && d.place.by === playerId);
/** Diamonds hidden in a room, not counting `except`. */
function roomCount(matchId: string, vault: Vault, room: string, except?: Diamond) {
  return vault.diamonds.filter((d) => d !== except && d.place.at === 'spot' && spotRoomOf(matchId, spotsOf(matchId).find((x) => x.id === (d.place as { spot: string }).spot)!) === room).length;
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
  d.place = { at: 'floor', x, y };
  const c = clients.get(playerId);
  if (c) {
    c.state.carrying = false;
    const data = mapData[matchMaps.get(matchId) ?? 'estate'];
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
    const free = spots.find((sp) => !vault.diamonds.some((x) => x.place.at === 'spot' && x.place.spot === sp.id) && roomCount(matchId, vault, spotRoomOf(matchId, sp)) < DIAMONDS_PER_ROOM)
      ?? spots.find((sp) => !vault.diamonds.some((x) => x.place.at === 'spot' && x.place.spot === sp.id));
    if (free) d.place = { at: 'spot', spot: free.id };
  }
  round.phase = 'live';
  round.endsAt = Date.now() + LIVE_TIME;
  // Placed traps stay secret from the Runners, except Fake Loot chests, which are meant to be seen.
  const decoys = [...(placedTraps.get(matchId)?.values() ?? [])].filter((t) => t.kind === 'fakeLoot');
  for (const id of matches.get(matchId) ?? []) {
    const member = clients.get(id);
    if (!member) continue;
    send(member, { t: 'phase', phase: 'live', ms: LIVE_TIME });
    if (id !== saboteurs.get(matchId)) for (const trap of decoys) send(member, { t: 'place', trap });
  }
  sendDiamonds(matchId);
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
    for (const [id, p] of sr.players) {
      let pts = 0;
      if (id === sab) {
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
    if (sr?.done) send(known, { t: 'final', standings: standings(known.room), rounds: sr.history });
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
