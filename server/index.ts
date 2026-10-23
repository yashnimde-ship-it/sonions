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
}

const clients = new Map<string, Client>();
const matches = new Map<string, Set<string>>();
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

function toLobby(c: Client) {
  c.room = 'lobby';
  c.portalSince.clear();
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
  if (!match.size) matches.delete(c.room);
}

function startMatch(size: number, crew: Client[]) {
  const matchId = `heist-${nextMatch++}`;
  matches.set(matchId, new Set(crew.map((c) => c.state.id)));
  crew.forEach((c, i) => {
    c.room = matchId;
    c.portalSince.clear();
    c.state.x = MATCH_SPAWN.x + (i - (crew.length - 1) / 2) * 36;
    c.state.y = MATCH_SPAWN.y;
    c.state.facing = 'up';
    c.state.moving = false;
    c.state.carrying = false;
  });
  // Round one's saboteur is picked at random; the round system rotates it from there.
  const saboteur = crew[Math.floor(Math.random() * crew.length)].state.id;
  const players = crew.map((c) => ({ ...c.state }));
  for (const c of crew) send(c, { t: 'match', matchId, size, players, saboteur });
  console.log(`${matchId}: ${size}-player heist with ${players.map((p) => p.name).join(', ')}`);
}

/** Who is in which portal, and starts a heist once a portal has been full for a few seconds. */
function updatePortals(now: number): PortalState[] {
  const lobby = inRoom('lobby');
  return PORTALS.map((portal) => {
    const inside: Client[] = [];
    for (const c of lobby) {
      if (portalAt(c.state) === portal) {
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
    const players = [...ids].map((id) => clients.get(id)?.state).filter((s): s is PlayerState => !!s);
    for (const id of ids) {
      const c = clients.get(id);
      if (c) send(c, { t: 'snapshot', room: 'match', players, portals: [], online, taken: [] });
    }
    if (!players.length) matches.delete(matchId);
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
      s.x = msg.x;
      s.y = msg.y;
      s.facing = msg.facing;
      s.moving = msg.moving;
      s.sprint = msg.sprint;
      s.carrying = !!msg.carrying;
      break;
    case 'character':
      // Refused if someone else has it; either way the player hears what they ended up with.
      if (CHARACTERS.includes(msg.character) && !takenBy(msg.character, c)) s.character = msg.character;
      send(c, { t: 'character', character: s.character });
      break;
    case 'door':
    case 'loot':
    case 'ability': {
      const match = matches.get(c.room);
      if (!match) break;
      const out: ServerMsg =
        msg.t === 'loot' ? { t: 'loot', id: msg.id, by: s.id } : msg.t === 'ability' ? { t: 'ability', ability: msg.ability, by: s.id } : msg;
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
    state: { id, name: '', character: 'maya', x: LOBBY_SPAWN.x, y: LOBBY_SPAWN.y, facing: 'down', moving: false, sprint: false, carrying: false },
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
