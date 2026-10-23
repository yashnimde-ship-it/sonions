// Test bots for the lobby: they join the server, wander, then walk into a portal.
// Handy for trying a party alone. Sizes 4-9 stand on the CUSTOM pad and pick that size.
//
// Usage: npm run bots -- [count=1] [portal size=2] [server=ws://localhost:3001/ws] [mode=heist|hideSeek]

import fs from 'node:fs';
import { CHARACTERS } from '../src/config.ts';
import { CUSTOM_MIN, CUSTOM_PAD } from '../src/data/round.ts';
import { TRAPS } from '../src/data/traps.ts';
import type { ClientMsg, ServerMsg } from '../src/net/protocol.ts';

const count = Number(process.argv[2] ?? 1);
const portalSize = Number(process.argv[3] ?? 2);
const url = process.argv[4] ?? 'ws://localhost:3001/ws';
const mode = process.argv[5] === 'hideSeek' ? 'hideSeek' : 'heist';
const TILE = 16;

const cruise = JSON.parse(fs.readFileSync(new URL('../public/assets/maps/cruise-f1/map.json', import.meta.url), 'utf8'));
const lobby = JSON.parse(fs.readFileSync(new URL('../public/assets/lobby/lobby.json', import.meta.url), 'utf8'));
const portal = lobby.portals.find((p: { size: number }) => p.size === (portalSize >= CUSTOM_MIN ? CUSTOM_PAD : portalSize));
if (!portal || portalSize > 9) throw new Error(`No ${portalSize}-player party`);

for (let i = 0; i < count; i++) {
  const ws = new WebSocket(url);
  const send = (msg: ClientMsg) => ws.send(JSON.stringify(msg));
  let x = 0;
  let y = 0;
  let inMatch = false;
  let myId = '';
  let saboteur = false;
  let others: { id: string; x: number; y: number; hp: number }[] = [];
  // As a Runner in a heist: stand at the spawn pretending to be hurt (40 HP) until healed.
  let hp = 40;
  let spot = { x: 0, y: 0 };
  let lastCarriers = '';
  let lastHurt = '';
  // Each bot heads to its own spot inside the portal.
  const tx = (portal.x + 1 + (i % 3) * 1.4) * TILE;
  const ty = (portal.y + 1.5 + Math.floor(i / 3) * 1.4) * TILE;
  let picked = false;

  ws.onopen = () => send({ t: 'hello', name: `Bot ${i + 1}`, character: CHARACTERS[(i + 1) % CHARACTERS.length] });
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data)) as ServerMsg;
    if (msg.t === 'welcome') myId = msg.id;
    if (msg.t === 'lobby') {
      x = msg.x;
      y = msg.y;
      inMatch = false;
      picked = false;
      send({ t: 'mode', mode });
    }
    if (msg.t === 'match') {
      inMatch = true;
      saboteur = msg.role === 'saboteur';
      hp = 40;
      const meThere = msg.players.find((p) => p.id === myId);
      if (meThere) spot = { x: meThere.x, y: meThere.y };
      console.log(`Bot ${i + 1} entered ${msg.matchId} as ${saboteur ? 'SABOTEUR' : 'runner'}`);
      // A Saboteur bot doesn't hide anything itself: it ends setup, and the server hides the diamonds.
      if (saboteur) setTimeout(() => send({ t: 'ready' }), 3000);
      // Hide & Seek, as a Hider: walk to a hiding place (one each) and get in.
      if (!saboteur && msg.mode === 'hideSeek') {
        const h = cruise.hiding[(i * 3 + 1) % cruise.hiding.length];
        spot = { x: ((h.box[0] + h.box[2]) / 2) * TILE, y: (h.box[3] + 0.5) * TILE };
        setTimeout(() => send({ t: 'hideIn', spot: h.id }), 2500);
        console.log(`Bot ${i + 1} hides in ${h.id}`);
      }
    }
    if (msg.t === 'ability') console.log(`Bot ${i + 1} saw player ${msg.by} use ${msg.ability}`);
    // When a crewmate leaves the heist, head back to the safehouse and queue again.
    if (msg.t === 'left') send({ t: 'leave' });
    if (msg.t === 'healed') {
      hp = 100;
      console.log(`Bot ${i + 1} was healed to full by player ${msg.by}`);
    }
    if (msg.t === 'trap') console.log(`Bot ${i + 1} saw trap ${msg.id} fire`);
    if (msg.t === 'place') console.log(`Bot ${i + 1} saw a ${msg.trap.kind} placed at ${msg.trap.x},${msg.trap.y}`);
    if (msg.t === 'unplace') console.log(`Bot ${i + 1} saw trap ${msg.id} picked up`);
    if (msg.t === 'phase') console.log(`Bot ${i + 1}: round is now ${msg.phase}`);
    if (msg.t === 'jam') console.log(`Bot ${i + 1} saw trap ${msg.id} jammed for ${msg.ms}ms`);
    if (msg.t === 'snapshot' && msg.room === 'match') {
      others = msg.players.filter((p) => p.id !== myId);
      const hurt = msg.players.filter((p) => p.hp < 100 || p.stunned).map((p) => `${p.name} hp=${p.hp}${p.stunned ? ' stunned' : ''}`).join(', ');
      if (hurt && hurt !== lastHurt) console.log(`Bot ${i + 1} sees: ${hurt}`);
      lastHurt = hurt;
      const carriers = msg.players.filter((p) => p.carrying).map((p) => p.name).join(', ');
      if (carriers !== lastCarriers) console.log(`Bot ${i + 1} sees carrying loot: ${carriers || 'nobody'}`);
      lastCarriers = carriers;
    }
  };
  // As the Saboteur, fire the plate nearest any other player every 3 seconds.
  setInterval(() => {
    if (!inMatch || !saboteur || !others.length || ws.readyState !== WebSocket.OPEN) return;
    let best = TRAPS[0];
    let bestD = Infinity;
    for (const t of TRAPS)
      for (const o of others) {
        const d = Math.hypot(t.x - o.x, t.y - o.y);
        if (d < bestD) [best, bestD] = [t, d];
      }
    send({ t: 'trap', id: best.id });
  }, 3000);
  // Hide & Seek, as the Seeker: shoot at whoever it can see (the server only sends Hiders in
  // reach), once a second.
  setInterval(() => {
    if (!inMatch || !saboteur || mode !== 'hideSeek' || !others.length || ws.readyState !== WebSocket.OPEN) return;
    const o = others[0];
    send({ t: 'shoot', x: o.x, y: o.y - 12 });
  }, 1000);
  // As a Runner: report position and health, and play medic for any hurt Runner every 4 s.
  setInterval(() => {
    if (!inMatch || saboteur || ws.readyState !== WebSocket.OPEN) return;
    send({ t: 'move', room: 'match', x: spot.x, y: spot.y, facing: 'up', moving: false, sprint: false, carrying: false, hp, stunned: false });
  }, 250);
  setInterval(() => {
    if (!inMatch || saboteur || ws.readyState !== WebSocket.OPEN) return;
    const hurt = others.find((o) => o.hp < 100);
    if (hurt) {
      send({ t: 'heal', target: hurt.id });
      console.log(`Bot ${i + 1} sends First Aid to player ${hurt.id} (hp ${hurt.hp})`);
    }
  }, 4000);
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
      send({ t: 'move', room: 'lobby', x, y, facing, moving, sprint: false, carrying: false, hp: 100, stunned: false });
      // On the pad: pick the party size (the CUSTOM pad needs it; the others ignore it).
      if (!moving && !picked) {
        picked = true;
        send({ t: 'portal', size: portalSize });
      }
    }, 50);
  }, 1500 + i * 700);
}
