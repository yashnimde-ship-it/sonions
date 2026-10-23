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
import { ABILITIES, CHARACTER_INFO, DOOR_JAM_DURATION_MS } from '../src/data/characters.ts';
import { LIVE_MS, type Phase, placementRefusal, saboteurMaxEnergy, SETUP_MS } from '../src/data/round.ts';
import { trapKind, type PlacedTrap, type TrapKindId } from '../src/data/trapKinds.ts';
import { JAM_MS, MAX_HP, OVERCLOCK_COOLDOWN_MS, OVERCLOCK_MS, TRAP_RADIUS, TRAPS, TRIPWIRE_COOLDOWN_MS, trapIsReady } from '../src/data/traps.ts';
import { NET_HZ, PORTAL_COUNTDOWN, type ClientMsg, type PlayerState, type PortalState, type ServerMsg, type Taken } from '../src/net/protocol.ts';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT ?? 3001);
const TILE = 16;

const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const lobbyMap = readJson('public/assets/lobby/lobby.json');
const estate = readJson('public/assets/map/estate.json');
const PORTALS: { size: number; x: number; y: number; w: number; h: number }[] = lobbyMap.portals;
const LOBBY_SPAWN = { x: lobbyMap.spawn.x * TILE, y: lobbyMap.spawn.y * TILE };
const MATCH_SPAWN = { x: estate.spawn.x * TILE, y: estate.spawn.y * TILE };

interface Client {
  ws: WebSocket;
  state: PlayerState;
  /** 'lobby' or the id of the match the player is in. */
  room: string;
  /** When the player stepped into the portal they are standing in (ms), keyed by portal size. */
  portalSince: Map<number, number>;
  /** Portal chosen from the lobby UI; positional walk-in detection remains supported. */
  portalChoice: number | null;
}

const clients = new Map<string, Client>();
const matches = new Map<string, Set<string>>();
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
const diamondPositions = new Map<string, Map<string, { x: number; y: number }>>();
const phases = new Map<string, { phase: Phase; endsAt: number }>();
const portalEnds = new Map<number, number>(); // portal size -> when its countdown ends (ms)
let nextId = 1;
let nextMatch = 1;

/** Players who have joined (said hello), wherever they are: lobby or a heist. */
const joined = () => [...clients.values()].filter((c) => c.state.name);
/** One of each character per server, like colours in an Among Us lobby. */
const takenBy = (character: CharacterId, except?: Client) => joined().find((c) => c !== except && c.state.character === character);

const send = (c: Client, msg: ServerMsg) => {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
};
const inRoom = (room: string) => [...clients.values()].filter((c) => c.room === room && c.state.name);

function portalAt(s: PlayerState) {
  return PORTALS.find((p) => s.x >= p.x * TILE && s.x < (p.x + p.w) * TILE && s.y >= p.y * TILE && s.y < (p.y + p.h) * TILE);
}

function chosenPortal(c: Client) {
  return PORTALS.find((p) => p.size === c.portalChoice) ?? portalAt(c.state);
}

function distanceToSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq)) : 0;
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

function trapEffect(kind: TrapKindId) {
  switch (kind) {
    case 'spring': return { damage: 0, stunMs: 0 };
    case 'snare': return { damage: 0, stunMs: 2500 };
    case 'crusher': return { damage: 50, stunMs: 3000 };
    case 'laser': return { damage: 20, stunMs: 0 };
    case 'boulder': return { damage: 30, stunMs: 800 };
    case 'glue':
    case 'oil':
    case 'magnet':
    case 'gas':
    case 'blackout': return { damage: 0, stunMs: 800 };
    case 'fakeLoot': return { damage: 30, stunMs: 2000 };
    case 'shock': return { damage: 25, stunMs: 2000 };
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
  match.delete(c.state.id);
  for (const id of match) {
    const other = clients.get(id);
    if (other) send(other, { t: 'left', id: c.state.id });
  }
  if (!match.size) endMatch(c.room);
}

function endMatch(matchId: string) {
  matches.delete(matchId);
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
  diamondPositions.delete(matchId);
  phases.delete(matchId);
}

function startMatch(size: number, crew: Client[]) {
  const matchId = `heist-${nextMatch++}`;
  matches.set(matchId, new Set(crew.map((c) => c.state.id)));
  crew.forEach((c, i) => {
    c.room = matchId;
    c.portalSince.clear();
    c.portalChoice = null;
    c.state.x = MATCH_SPAWN.x + (i - (crew.length - 1) / 2) * 36;
    c.state.y = MATCH_SPAWN.y;
    c.state.facing = 'up';
    c.state.moving = false;
    c.state.carrying = false;
    c.state.hp = MAX_HP;
    c.state.stunned = false;
  });
  // Round one's saboteur is picked at random; the round system rotates it from there.
  const saboteur = crew[Math.floor(Math.random() * crew.length)].state.id;
  saboteurs.set(matchId, saboteur);
  const sabCharacter = crew.find((c) => c.state.id === saboteur)!.state.character;
  const maxEnergy = saboteurMaxEnergy(sabCharacter);
  saboteurEnergy.set(matchId, { current: maxEnergy, max: maxEnergy });
  placedTraps.set(matchId, new Map());
  diamondPositions.set(matchId, new Map(estate.interactables.filter((i: { loot?: number }) => i.loot).map((i: { id: string; rect: number[] }) => [i.id, { x: ((i.rect[0] + i.rect[2] + 1) / 2) * TILE, y: ((i.rect[1] + i.rect[3] + 1) / 2) * TILE }])));
  phases.set(matchId, { phase: 'setup', endsAt: Date.now() + SETUP_MS });
  trapState.set(matchId, new Map(TRAPS.map((t) => [t.id, { firedAt: null, jammedUntil: 0, tripwired: false }])));
  overclockWindows.delete(matchId);
  overclockReadyAt.set(matchId, 0);
  tripwireReadyAt.set(matchId, 0);
  trapRefreshUsed.set(matchId, false);
  doorJamReadyAt.set(matchId, 0);
  doorLocks.set(matchId, new Map());
  const players = crew.map((c) => ({ ...c.state }));
  // Each player learns only their own role, so the Saboteur stays secret.
  for (const c of crew) {
    const visiblePlayers = players.filter((p) => p.id !== saboteur || c.state.id === saboteur);
    const isSaboteur = c.state.id === saboteur;
    send(c, { t: 'match', matchId, size, players: visiblePlayers, role: isSaboteur ? 'saboteur' : 'runner', phase: 'setup', ms: SETUP_MS, ...(isSaboteur ? { energy: maxEnergy, maxEnergy, diamonds: [...(diamondPositions.get(matchId) ?? [])].map(([id, pos]) => ({ id, ...pos })) } : {}) });
  }
  console.log(`${matchId}: ${size}-player heist with ${players.map((p) => p.name).join(', ')}`);
}

/** Who is in which portal, and starts a heist once a portal has been full for a few seconds. */
function updatePortals(now: number): PortalState[] {
  const lobby = inRoom('lobby');
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
      return { size: portal.size, count: inside.length, countdown: null };
    }
    if (!portalEnds.has(portal.size)) portalEnds.set(portal.size, now + PORTAL_COUNTDOWN * 1000);
    const left = (portalEnds.get(portal.size)! - now) / 1000;
    if (left <= 0) {
      // First in, first out: the earliest arrivals make up the crew.
      inside.sort((a, b) => a.portalSince.get(portal.size)! - b.portalSince.get(portal.size)!);
      startMatch(portal.size, inside.slice(0, portal.size));
      portalEnds.delete(portal.size);
      return { size: portal.size, count: 0, countdown: null };
    }
    return { size: portal.size, count: inside.length, countdown: Math.ceil(left) };
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
      p.phase = p.phase === 'setup' ? 'live' : 'over';
      const ms = p.phase === 'live' ? LIVE_MS : 0;
      p.endsAt = Date.now() + ms;
      for (const id of ids) {
        const c = clients.get(id);
        if (c) send(c, { t: 'phase', phase: p.phase, ms, ...(p.phase === 'live' ? { diamonds: [...(diamondPositions.get(matchId) ?? [])].map(([diamondId, pos]) => ({ id: diamondId, ...pos })) } : {}) });
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
      // Your last character if it's free, otherwise the first free one; nobody gets a duplicate.
      const free = [msg.character, ...CHARACTERS].find((id) => CHARACTERS.includes(id) && !takenBy(id));
      if (!free) {
        send(c, { t: 'full' });
        c.ws.close();
        break;
      }
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
      if (c.room === 'lobby' && c.portalChoice !== null && portalAt(s)?.size !== c.portalChoice) c.portalChoice = null;
      s.facing = msg.facing;
      s.moving = msg.moving;
      s.sprint = msg.sprint;
      s.carrying = !!msg.carrying;
      s.hp = Math.max(0, Math.min(MAX_HP, Number(msg.hp) || 0));
      s.stunned = !!msg.stunned;
      if (c.room !== 'lobby') {
        const now = Date.now();
        const saboteurId = saboteurs.get(c.room);
        if (saboteurId !== s.id && phases.get(c.room)?.phase === 'live') {
          for (const plate of TRAPS) {
            const state = trapState.get(c.room)?.get(plate.id);
            if (!state || now < state.jammedUntil || !trapIsReady(state.firedAt, now, overclockWindows.get(c.room) ?? null)) continue;
            if (Math.hypot(fromX - plate.x, fromY - plate.y) <= TRAP_RADIUS || distanceToSegment(plate.x, plate.y, fromX, fromY, s.x, s.y) > TRAP_RADIUS) continue;
            state.tripwired = false;
            state.firedAt = now;
            for (const id of matches.get(c.room) ?? []) {
              const member = clients.get(id);
              if (member) send(member, { t: 'trap', id: plate.id });
            }
          }
          for (const trap of placedTraps.get(c.room)?.values() ?? []) {
            const state = trapState.get(c.room)?.get(trap.id);
            const radius = Math.max(12, Math.min(trapKind(trap.kind)!.w, trapKind(trap.kind)!.h) / 2);
            if (!state || now < state.jammedUntil || !trapIsReady(state.firedAt, now, overclockWindows.get(c.room) ?? null)) continue;
            if (Math.hypot(fromX - trap.x, fromY - trap.y) <= radius || distanceToSegment(trap.x, trap.y, fromX, fromY, s.x, s.y) > radius) continue;
            state.firedAt = now;
            const effect = trapEffect(trap.kind);
            const dx = s.x - trap.x;
            const dy = s.y - trap.y;
            const length = Math.hypot(dx, dy) || Math.hypot(s.x - fromX, s.y - fromY) || 1;
            const knockback = trap.kind === 'spring' || trap.kind === 'boulder'
              ? { x: s.x + (dx / length) * 64, y: s.y + (dy / length) * 64 }
              : undefined;
            send(c, { t: 'placedTrapHit', kind: trap.kind, ...effect, ...(knockback ? { knockback } : {}) });
          }
        }
        for (const plate of TRAPS) {
          const state = trapState.get(c.room)?.get(plate.id);
          if (!state?.tripwired || now < state.jammedUntil || !trapIsReady(state.firedAt, now, overclockWindows.get(c.room) ?? null)) continue;
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
      const round = phases.get(matchId)!;
      round.phase = 'live';
      round.endsAt = Date.now() + LIVE_MS;
      const diamonds = [...(diamondPositions.get(matchId) ?? [])].map(([id, pos]) => ({ id, ...pos }));
      for (const id of matches.get(matchId) ?? []) {
        const member = clients.get(id);
        if (member) send(member, { t: 'phase', phase: 'live', ms: LIVE_MS, diamonds });
      }
      break;
    }
    case 'diamond': {
      const matchId = c.room;
      const positions = diamondPositions.get(matchId);
      const round = phases.get(matchId);
      if (saboteurs.get(matchId) !== s.id || round?.phase !== 'setup' || !positions?.has(msg.id) || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) break;
      if (msg.x < 0 || msg.y < 0 || msg.x > estate.width * TILE || msg.y > estate.height * TILE) break;
      positions.set(msg.id, { x: msg.x, y: msg.y });
      send(c, msg);
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
      const now = Date.now();
      if (!trap || !trapIsReady(trap.firedAt, now, overclockWindows.get(c.room) ?? null) || now < trap.jammedUntil) break;
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
      if (!trap || trap.tripwired || trap.jammedUntil > now || !trapIsReady(trap.firedAt, now, overclockWindows.get(c.room) ?? null)) break;
      trap.tripwired = true;
      tripwireReadyAt.set(c.room, now + TRIPWIRE_COOLDOWN_MS);
      send(c, { t: 'tripwireArmed', id: msg.id });
      break;
    }
    case 'trapRefresh': {
      if (saboteurs.get(c.room) !== s.id || CHARACTER_INFO[s.character].saboteur !== 'trapRefresh' || phases.get(c.room)?.phase !== 'live' || trapRefreshUsed.get(c.room)) break;
      const now = Date.now();
      const trap = trapState.get(c.room)?.get(msg.id);
      if (!trap || trap.jammedUntil > now || trapIsReady(trap.firedAt, now, overclockWindows.get(c.room) ?? null)) break;
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
      if (!estate.doors.some((door: { id: string }) => door.id === msg.id)) break;
      const locks = doorLocks.get(c.room);
      if (!locks) break;
      locks.set(msg.id, now + DOOR_JAM_DURATION_MS);
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
        if (placementRefusal([...placed.values()].map((p) => p.kind), trap.kind)) break;
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
    case 'heal': {
      // Runner to Runner, in the same heist; the healer's game checks reach and cooldown.
      const sab = saboteurs.get(c.room);
      const target = clients.get(msg.target);
      if (!sab || sab === s.id || !target || target.room !== c.room || msg.target === sab) break;
      send(target, { t: 'healed', by: s.id });
      break;
    }
    case 'jam': {
      // Runners only (not the Saboteur). The game checks reach and the ability's cooldown.
      if (!saboteurs.has(c.room) || saboteurs.get(c.room) === s.id) break;
      const trap = trapState.get(c.room)?.get(msg.id);
      if (!trap) break;
      trap.jammedUntil = Date.now() + JAM_MS;
      trap.tripwired = false;
      for (const id of matches.get(c.room) ?? []) {
        const member = clients.get(id);
        if (member) send(member, { t: 'jam', id: msg.id, ms: JAM_MS });
      }
      break;
    }
    case 'character':
      // Refused if someone else has it; either way the player hears what they ended up with.
      if (CHARACTERS.includes(msg.character) && !takenBy(msg.character, c)) s.character = msg.character;
      send(c, { t: 'character', character: s.character });
      break;
    case 'ability': {
      const match = matches.get(c.room);
      if (!match) break;
      const isSaboteur = saboteurs.get(c.room) === s.id;
      if (isSaboteur) {
        if (msg.ability !== 'overclock' || CHARACTER_INFO[s.character].saboteur !== 'overclock' || phases.get(c.room)?.phase !== 'live') break;
        const startsAt = Date.now();
        if (startsAt < (overclockReadyAt.get(c.room) ?? 0)) break;
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
      if (!match || !estate.doors.some((door: { id: string }) => door.id === msg.id)) break;
      const lockUntil = doorLocks.get(c.room)?.get(msg.id) ?? 0;
      if (msg.open && lockUntil > Date.now()) {
        send(c, { t: 'door', id: msg.id, open: false });
        send(c, { t: 'doorLocked', id: msg.id, ms: lockUntil - Date.now() });
        break;
      }
      if (lockUntil) doorLocks.get(c.room)?.delete(msg.id);
      for (const id of match) {
        const other = clients.get(id);
        if (other && other !== c) send(other, msg);
      }
      break;
    }
    case 'loot': {
      const match = matches.get(c.room);
      if (!match) break;
      const out: ServerMsg = { t: 'loot', id: msg.id, by: s.id };
      for (const id of match) {
        const other = clients.get(id);
        if (other && other !== c) send(other, out);
      }
      break;
    }
    case 'leave':
      leaveMatch(c);
      toLobby(c);
      break;
  }
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
    state: { id, name: '', character: 'maya', x: LOBBY_SPAWN.x, y: LOBBY_SPAWN.y, facing: 'down', moving: false, sprint: false, carrying: false, hp: MAX_HP, stunned: false },
  };
  clients.set(id, c);
  send(c, { t: 'welcome', id });
  ws.on('message', (raw) => {
    try {
      handle(c, JSON.parse(String(raw)) as ClientMsg);
    } catch (err) {
      console.warn('bad message', err);
    }
  });
  ws.on('close', () => {
    leaveMatch(c);
    clients.delete(id);
    if (c.state.name) console.log(`${c.state.name} left (${clients.size} connected)`);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Vault Breakers server on http://localhost:${PORT} (WebSocket at /ws)`));
