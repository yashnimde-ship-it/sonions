// Test bots for the lobby: they join the server, wander, then walk into a portal.
// Handy for trying a 3- or 4-player portal alone.
//
// Usage: npm run bots -- [count=1] [portal size=2] [server=ws://localhost:3001/ws]

import fs from 'node:fs';
import { CHARACTERS } from '../src/config.ts';
import type { ClientMsg, ServerMsg } from '../src/net/protocol.ts';

const count = Number(process.argv[2] ?? 1);
const portalSize = Number(process.argv[3] ?? 2);
const url = process.argv[4] ?? 'ws://localhost:3001/ws';
const TILE = 16;

const lobby = JSON.parse(fs.readFileSync(new URL('../public/assets/lobby/lobby.json', import.meta.url), 'utf8'));
const portal = lobby.portals.find((p: { size: number }) => p.size === portalSize);
if (!portal) throw new Error(`No ${portalSize}-player portal`);

for (let i = 0; i < count; i++) {
  const ws = new WebSocket(url);
  const send = (msg: ClientMsg) => ws.send(JSON.stringify(msg));
  let x = 0;
  let y = 0;
  let inMatch = false;
  // Each bot heads to its own spot inside the portal.
  const tx = (portal.x + 1 + (i % 3) * 1.4) * TILE;
  const ty = (portal.y + 1.5 + Math.floor(i / 3) * 1.4) * TILE;

  ws.onopen = () => send({ t: 'hello', name: `Bot ${i + 1}`, character: CHARACTERS[(i + 1) % CHARACTERS.length] });
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data)) as ServerMsg;
    if (msg.t === 'lobby') {
      x = msg.x;
      y = msg.y;
      inMatch = false;
    }
    if (msg.t === 'match') {
      inMatch = true;
      console.log(`Bot ${i + 1} entered ${msg.matchId}`);
    }
  };
  setTimeout(() => {
    setInterval(() => {
      if (inMatch || ws.readyState !== WebSocket.OPEN) return;
      const dx = tx - x;
      const dy = ty - y;
      const d = Math.hypot(dx, dy);
      const moving = d > 2;
      if (moving) {
        x += (dx / d) * Math.min(d, 4);
        y += (dy / d) * Math.min(d, 4);
      }
      const facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
      send({ t: 'move', room: 'lobby', x, y, facing, moving, sprint: false });
    }, 50);
  }, 1500 + i * 700);
}
