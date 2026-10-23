import '@fontsource/press-start-2p';
import { ART_TILE, CHAR_GLOW, CHARACTERS, type CharacterId, characterSheet, HITBOX, ZOOM } from './config';
import { CHARACTER_INFO } from './data/characters';
import { JAM_REACH, MAX_HP, TRAP_ACTIVE_MS, TRAP_ARM_MS, TRAP_COOLDOWN_MS, TRAP_DAMAGE, TRAP_RADIUS, TRAP_STUN_MS, TRAPS } from './data/traps';
import { Profile } from './data/profile';
import { Bandit, DRAW_H } from './entities/Bandit';
import { keyPressed, pollInput, readControls } from './input/Controls';
import { type LobbyJson, LobbyMap } from './map/LobbyMap';
import { type EstateJson, type Interactable, TileMap } from './map/TileMap';
import { NetClient } from './net/NetClient';
import { type ClientMsg, NET_HZ, type PlayerState, type PortalState, type ServerMsg } from './net/protocol';
import { CameraSystem } from './systems/CameraSystem';
import { InteractionSystem } from './systems/InteractionSystem';
import { AbilitySystem, QUICKSTEP_FRAMES } from './systems/AbilitySystem';
import { LightingSystem } from './systems/LightingSystem';
import { HUD } from './ui/HUD';
import { LobbyUI, type MapInfo, type StartState } from './ui/LobbyUI';
import { Settings } from './ui/Settings';
import { TitleUI } from './ui/TitleUI';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Missing ${src}. Run: npm run assets && npm run lobby`));
    img.src = src;
  });
}

const fetchJson = <T,>(src: string) =>
  fetch(src).then((r) => {
    if (!r.ok) throw new Error(`Missing ${src}. Run: npm run assets && npm run lobby`);
    return r.json() as Promise<T>;
  });

type Scene = 'title' | 'lobby' | 'match';

/** What the Map Info panel says about the estate, straight from its map data. */
function mapInfo(data: EstateJson): MapInfo {
  const names = data.areas.names;
  const indoor = new Set<string>();
  // Area 0 is the default (walls and lawn), so it never counts as a room.
  data.areas.data.forEach((a, i) => {
    if (data.indoor[i] && a !== 0) indoor.add(names[a]);
  });
  return {
    name: data.name,
    width: data.width,
    height: data.height,
    rooms: names.filter((n) => indoor.has(n)),
    outdoor: names.filter((n) => !indoor.has(n)),
    doors: data.doors.length,
    loot: data.interactables.filter((i) => i.loot).map((i) => ({ name: i.name, value: i.loot! })),
    preview: '/assets/map/preview.png',
  };
}

interface Remote {
  state: PlayerState;
  bandit: Bandit;
}

// Loot: one item in your hands at a time, 35% slower while carrying (Steady Carry halves
// that). Bank it by walking into the GETAWAY zone on the street, in tiles.
const CARRY_SLOW = 0.35;
// Knocked out at 0 HP: down for 4 s, then back up with half health.
const KO_FRAMES = 240;
const KO_HP = 50;
const GETAWAY = { x: 39.5, y: 55.6, w: 12, h: 3.8 };
const PORTAL_COLORS: Record<number, string> = { 2: '#3ee6d4', 3: '#ffb02e', 4: '#ff4fb0' };
const BANNER_MS = 4000;

async function boot() {
  const [estateData, tileset, doorAtlas, lobbyData, lobbyImage, ...sheetList] = await Promise.all([
    fetchJson<EstateJson>('/assets/map/estate.json'),
    loadImage('/assets/tiles/tileset.png'),
    loadImage('/assets/map/doors.png'),
    fetchJson<LobbyJson>('/assets/lobby/lobby.json'),
    loadImage('/assets/lobby/lobby.png'),
    ...CHARACTERS.map((id) => loadImage(characterSheet(id))),
  ]);
  const sheets = Object.fromEntries(CHARACTERS.map((id, i) => [id, sheetList[i]])) as Record<CharacterId, HTMLImageElement>;

  const lobbyMap = new LobbyMap(lobbyData, lobbyImage);
  // The estate is rebuilt for every heist, so doors and loot start fresh.
  let estate = new TileMap(estateData, tileset, doorAtlas);
  let interactions = new InteractionSystem(estateData.interactables, estateData.doors);
  let lighting = new LightingSystem(estate);

  const camera = new CameraSystem(lobbyMap.widthPx, lobbyMap.heightPx);
  const hud = new HUD();
  const title = new TitleUI();
  const settings = new Settings();
  const profile = new Profile();
  const lobby = new LobbyUI(mapInfo(estateData), settings);
  const net = new NetClient();
  const abilities = new AbilitySystem();

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const hudEl = document.getElementById('hud')!;
  // The Saboteur fires a trap plate by clicking it.
  const toWorld = (e: PointerEvent): [number, number] => [(e.clientX * dpr) / scale + camera.x, (e.clientY * dpr) / scale + camera.y];
  canvas.addEventListener('pointermove', (e) => ([mouseX, mouseY] = toWorld(e)));
  canvas.addEventListener('pointerdown', (e) => {
    if (scene !== 'match' || !match?.saboteur) return;
    const [x, y] = toWorld(e);
    const trap = trapUnder(x, y);
    if (trap && trapReady(trap.id)) net.send({ t: 'trap', id: trap.id });
  });
  const banner = document.getElementById('match-banner')!;
  let dpr = 1;
  let scale = ZOOM;
  let scene: Scene = 'title';

  let myId = '';
  let myName = '';
  let myCharacter: CharacterId = 'maya';
  const me = new Bandit(sheets.maya, 0, 0, 'down');
  const remotes = new Map<string, Remote>();
  let portals: PortalState[] = [];
  let online = 0;
  /** The portal under the mouse, and until when START HEIST's "pick a portal" flash runs. */
  let hoverPortal: number | null = null;
  let flashUntil = 0;
  let viewX = 0;
  let viewY = 0;
  /** The heist you're in; `saboteur` is whether *you* are it (nobody is told who else is). */
  let match: { id: string; size: number; saboteur: boolean } | null = null;
  let bannerUntil = 0;
  let serverFull = false;
  /** Loot in my hands, and what I've banked this heist. */
  let carrying: Interactable | null = null;
  let banked = 0;
  let bankedCount = 0;
  /** My health (Runners only), and when each trap plate last fired (performance.now ms). */
  let hp = MAX_HP;
  let knockedOut = false;
  const trapFiredAt = new Map<string, number>();
  const trapHits = new Set<string>();
  /** Plates jammed by Trap Jam, until when (performance.now ms). */
  const trapJammedUntil = new Map<string, number>();
  /** When traps were last checked, so a slow frame can't skip over a plate's live window. */
  let lastTrapCheck = 0;
  /** The mouse in world (art) pixels, for the Saboteur picking traps. */
  let mouseX = -1;
  let mouseY = -1;
  let sendTimer = 0;
  let lastSprint = false;

  // ---------- Camera ----------

  function world() {
    return scene === 'match' ? { w: estate.widthPx, h: estate.heightPx } : { w: lobbyMap.widthPx, h: lobbyMap.heightPx };
  }

  function frameCamera(snap: boolean) {
    const { w, h } = world();
    camera.setWorld(w, h);
    // The safehouse fills the window (UI panels sit over its edges); the estate is played up
    // close. Sharp pixels rounds the lobby's scale up to a whole number.
    if (scene === 'match') scale = ZOOM * dpr;
    else {
      scale = Math.max(canvas.width / w, canvas.height / h);
      if (settings.values.pixelPerfect) scale = Math.max(1, Math.ceil(scale));
    }
    camera.resize(canvas.width / scale, canvas.height / scale);
    let [tx, ty] = [me.x, me.y - DRAW_H / 2];
    if (scene === 'title') {
      tx = w / 2;
      ty = h / 2;
    }
    if (snap) camera.snap(tx, ty);
    else camera.update(tx, ty);
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    frameCamera(true);
  }

  // ---------- Scenes ----------

  function setScene(next: Scene) {
    scene = next;
    title.show(scene === 'title');
    lobby.show(scene === 'lobby');
    hudEl.hidden = scene !== 'match';
    if (scene !== 'match') banner.hidden = true;
    frameCamera(true);
  }

  function setCharacter(id: CharacterId) {
    myCharacter = id;
    me.sheet = sheets[id];
    lobby.setMe(myName, id, profile);
  }

  async function play() {
    if (net.connected) return;
    serverFull = false;
    title.setBusy(true);
    try {
      await net.connect();
    } catch (err) {
      title.setBusy(false, (err as Error).message);
      return;
    }
    myName = title.name || 'Bandit';
    setCharacter(myCharacter);
    net.send({ t: 'hello', name: myName, character: myCharacter });
  }

  function addRemote(p: PlayerState) {
    remotes.set(p.id, { state: p, bandit: new Bandit(sheets[p.character], p.x, p.y, p.facing) });
  }

  function startMatch(msg: Extract<ServerMsg, { t: 'match' }>) {
    estate = new TileMap(estateData, tileset, doorAtlas);
    interactions = new InteractionSystem(estateData.interactables, estateData.doors);
    lighting = new LightingSystem(estate);
    carrying = null;
    banked = 0;
    bankedCount = 0;
    hp = MAX_HP;
    knockedOut = false;
    me.stunFrames = 0;
    trapFiredAt.clear();
    trapHits.clear();
    trapJammedUntil.clear();
    lastTrapCheck = 0;
    hud.setHealth(msg.role === 'saboteur' ? null : hp);
    hud.setLoot(0, 0, interactions.lootables.length);
    hud.setCarrying(null);
    hud.hideMessage();
    match = { id: msg.matchId, size: msg.size, saboteur: msg.role === 'saboteur' };
    profile.recordHeist();
    lobby.setMe(myName, myCharacter, profile);
    remotes.clear();
    for (const p of msg.players) {
      if (p.id !== myId) {
        addRemote(p);
        continue;
      }
      me.x = p.x;
      me.y = p.y;
      me.facing = p.facing;
    }
    abilities.setRound(myCharacter, msg.role);
    const role = msg.role === 'saboteur' ? '<b class="saboteur">THE SABOTEUR</b>' : '<b class="runner">A RUNNER</b>';
    const crew = msg.players.map((p) => p.name).join(' · ');
    banner.innerHTML = `<span class="kicker">${msg.size}-PLAYER HEIST</span><span>You are ${role}</span><span class="crew-list">${crew}</span>`;
    banner.hidden = false;
    bannerUntil = performance.now() + BANNER_MS;
    setScene('match');
  }

  net.onMessage = (msg) => {
    switch (msg.t) {
      case 'welcome':
        myId = msg.id;
        break;
      case 'lobby':
        match = null;
        remotes.clear();
        setCharacter(msg.character);
        me.x = msg.x;
        me.y = msg.y;
        me.facing = 'down';
        title.setBusy(false);
        setScene('lobby');
        break;
      case 'match':
        startMatch(msg);
        break;
      case 'character':
        setCharacter(msg.character);
        break;
      case 'full':
        serverFull = true;
        title.setBusy(false, 'All 5 crew members are taken. Try again when someone leaves.');
        break;
      case 'snapshot': {
        if ((msg.room === 'match') !== (scene === 'match')) break;
        portals = msg.portals;
        online = msg.online;
        if (msg.room === 'lobby') lobby.setTaken(msg.taken, myCharacter);
        const seen = new Set<string>();
        for (const p of msg.players) {
          if (p.id === myId) continue;
          seen.add(p.id);
          const r = remotes.get(p.id);
          if (!r) addRemote(p);
          else {
            if (r.state.character !== p.character) r.bandit.sheet = sheets[p.character];
            r.state = p;
          }
        }
        for (const id of remotes.keys()) if (!seen.has(id)) remotes.delete(id);
        break;
      }
      case 'door': {
        const door = estate.data.doors.find((d) => d.id === msg.id);
        if (door) estate.setDoor(door, msg.open);
        break;
      }
      case 'loot':
        // Someone else picked it up: it's gone from the house for everyone.
        interactions.looted.add(msg.id);
        break;
      case 'ability': {
        // Show other players' abilities; the effect itself arrives through their positions.
        const r = remotes.get(msg.by);
        if (r && msg.ability === 'quickstep') r.bandit.showTrail(QUICKSTEP_FRAMES + 8);
        break;
      }
      case 'trap':
        trapFiredAt.set(msg.id, performance.now());
        break;
      case 'healed':
        if (match && !match.saboteur) healMe();
        break;
      case 'jam': {
        const now = performance.now();
        trapJammedUntil.set(msg.id, now + msg.ms);
        // A plate that was still flashing or live is defused: its shock never lands.
        const firedAt = trapFiredAt.get(msg.id);
        if (firedAt !== undefined && now < firedAt + TRAP_ARM_MS + TRAP_ACTIVE_MS) trapHits.add(`${msg.id}@${firedAt}`);
        break;
      }
      case 'left':
        remotes.delete(msg.id);
        break;
    }
  };
  net.onClose = () => {
    if (scene !== 'title' && !serverFull) lobby.showDisconnected();
  };

  title.onPlay = play;
  // The server confirms (or refuses) the pick with a 'character' message.
  lobby.onPick = (id) => net.send({ t: 'character', character: id });
  lobby.onLoadout = () => lobby.openPicker(myCharacter);
  lobby.onPortal = (size) => joinPortal(size);
  lobby.onStart = () => {
    const s = startState();
    if (s.kind === 'none') {
      flashUntil = performance.now() + 1500;
      lobby.nudgeStart('Choose a party size first: click a portal below the table, or walk into one.');
    } else if (s.kind === 'waiting') {
      const missing = s.size - s.count;
      lobby.nudgeStart(`Can't start yet: ${missing} more crew member${missing > 1 ? 's' : ''} needed in the ${s.size}-player portal.`);
    } else if (s.kind === 'countdown') {
      lobby.nudgeStart(`Starting in ${s.seconds}... hold tight!`);
    } else {
      lobby.nudgeStart('Not connected to the game server.');
    }
  };
  // Exit: leave the server on purpose and go back to the title screen.
  lobby.onExit = () => {
    setScene('title');
    net.disconnect();
    remotes.clear();
    portals = [];
    online = 0;
    title.setBusy(false);
  };
  settings.onChange(() => frameCamera(true));

  /** The party size you're standing in, if any. */
  function myPortal(): number | null {
    return lobbyData.portals.find((p) => LobbyMap.inside(p, me.x, me.y))?.size ?? null;
  }

  /**
   * Picking a portal (click, or a row in the Heist Lobby panel): step into its next free
   * seat. Picking the one you're in steps you back out. The server counts whoever stands
   * in a portal, so this is the same as walking in.
   */
  function joinPortal(size: number) {
    if (scene !== 'lobby' || lobby.panelOpen) return;
    const p = lobbyData.portals.find((q) => q.size === size);
    if (!p) return;
    if (myPortal() === size) {
      me.x = (p.x + p.w / 2) * ART_TILE;
      me.y = (p.y - 0.9) * ART_TILE;
      me.facing = 'up';
    } else {
      const seat = Math.min(portals.find((s) => s.size === size)?.count ?? 0, size - 1);
      me.x = (p.x + 1.2 + (seat % 3) * ((p.w - 2.4) / 2)) * ART_TILE;
      me.y = (p.y + 2.4 + Math.floor(seat / 3) * 1.3) * ART_TILE;
      me.facing = 'down';
    }
    frameCamera(true);
  }

  function startState(): StartState {
    if (!net.connected) return { kind: 'offline' };
    const size = myPortal();
    const state = portals.find((s) => s.size === size);
    if (size === null || !state) return { kind: 'none' };
    if (state.countdown !== null) return { kind: 'countdown', size, seconds: state.countdown };
    return { kind: 'waiting', size, count: state.count };
  }

  // Portals are real controls: hover highlights one, click joins (or leaves) it.
  const portalAtScreen = (clientX: number, clientY: number) => {
    const wx = viewX + (clientX * dpr) / scale;
    const wy = viewY + (clientY * dpr) / scale;
    // The pad and its sign above it.
    return lobbyData.portals.find((p) => LobbyMap.inside({ x: p.x, y: p.y - 1.1, w: p.w, h: p.h + 1.1 }, wx, wy))?.size ?? null;
  };
  canvas.addEventListener('mousemove', (e) => {
    hoverPortal = scene === 'lobby' && !lobby.panelOpen ? portalAtScreen(e.clientX, e.clientY) : null;
    canvas.style.cursor = hoverPortal ? 'pointer' : '';
  });
  canvas.addEventListener('mouseleave', () => {
    hoverPortal = null;
    canvas.style.cursor = '';
  });
  canvas.addEventListener('click', (e) => {
    const size = scene === 'lobby' ? portalAtScreen(e.clientX, e.clientY) : null;
    if (size) joinPortal(size);
  });
  setScene('title');
  window.addEventListener('resize', resize);
  resize();

  if (import.meta.env.DEV)
    Object.assign(window, { game: { me, remotes, net, lobbyMap, abilities, get estate() { return estate; }, get scene() { return scene; }, get portals() { return portals; }, get view() { return { x: viewX, y: viewY, scale, dpr }; }, lobby, settings, profile } }); // for playtests

  // ---------- Update ----------

  const nearWardrobe = () => LobbyMap.inside(lobbyData.wardrobe, me.x, me.y);

  /** About NET_HZ times a second; the server relays it to everyone in the same room. */
  function sendPosition() {
    if (++sendTimer < 60 / NET_HZ) return;
    sendTimer = 0;
    net.send({ t: 'move', room: scene === 'match' ? 'match' : 'lobby', x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, facing: me.facing, moving: me.moving, sprint: lastSprint, carrying: !!carrying, hp, stunned: me.stunned });
  }

  /** Everything an ability may need, gathered fresh when Q is pressed. */
  function abilityContext() {
    // Everyone else; the Saboteur (whoever it is) never loses HP, so First Aid never picks them.
    const crew = [...remotes.entries()]
      .map(([id, r]) => ({ id, x: r.bandit.x, y: r.bandit.y, hp: r.state.hp }));
    return { me, send: (m: ClientMsg) => net.send(m), hp, setHp: healMe, crew };
  }

  /** Back to full health (First Aid); also gets a knocked-out Runner straight back up. */
  function healMe(to = MAX_HP) {
    hp = to;
    if (knockedOut) {
      knockedOut = false;
      me.stunFrames = 0;
    }
    hud.setHealth(hp);
  }

  // ---------- Traps ----------

  const trapUnder = (x: number, y: number) => TRAPS.find((t) => Math.hypot(t.x - x, t.y - y) <= TRAP_RADIUS + 4);
  const trapJammed = (id: string) => performance.now() < (trapJammedUntil.get(id) ?? 0);
  const trapReady = (id: string) => !trapJammed(id) && performance.now() >= (trapFiredAt.get(id) ?? -Infinity) + TRAP_ARM_MS + TRAP_COOLDOWN_MS;

  /** A Runner standing on a plate while it's live gets shocked: damage and a stun. */
  function checkTraps() {
    if (!match || match.saboteur) return;
    const now = performance.now();
    const since = lastTrapCheck || now;
    lastTrapCheck = now;
    if (knockedOut && !me.stunned) {
      knockedOut = false;
      hp = KO_HP;
      hud.setHealth(hp);
    }
    for (const t of TRAPS) {
      const firedAt = trapFiredAt.get(t.id);
      if (firedAt === undefined) continue;
      // Live if its window [arm end, arm end + active] overlaps the time since the last check.
      const liveFrom = firedAt + TRAP_ARM_MS;
      const live = liveFrom <= now && liveFrom + TRAP_ACTIVE_MS > since;
      const key = `${t.id}@${firedAt}`;
      if (!live || trapHits.has(key) || Math.hypot(me.x - t.x, me.y - t.y) > TRAP_RADIUS) continue;
      trapHits.add(key);
      hp = Math.max(0, hp - TRAP_DAMAGE);
      me.stun(Math.round((TRAP_STUN_MS / 1000) * 60));
      if (hp === 0) {
        knockedOut = true;
        me.stun(KO_FRAMES);
      }
      hud.setHealth(hp);
    }
  }

  function update() {
    pollInput();
    const input = readControls();
    lastSprint = input.sprint;

    if (scene === 'title') {
      if (keyPressed('Escape')) title.showHowTo(false);
      return;
    }

    for (const r of remotes.values()) r.bandit.follow(r.state.x, r.state.y, r.state.facing, r.state.moving, r.state.sprint, r.state.stunned);

    if (scene === 'lobby') {
      if (lobby.panelOpen) {
        // A panel is open (Loadout, Map Info, Settings, Exit): the player stands still.
        if (keyPressed('Escape')) lobby.navigate('lobby');
        else if (lobby.pickerOpen) {
          if (keyPressed('KeyA') || keyPressed('ArrowLeft')) lobby.movePick(-1);
          else if (keyPressed('KeyD') || keyPressed('ArrowRight')) lobby.movePick(1);
          else if (input.action) lobby.confirmPick();
        }
        me.update({ dx: 0, dy: 0, sprint: false }, lobbyMap);
      } else {
        me.update(input, lobbyMap);
        if (input.action && nearWardrobe()) lobby.openPicker(myCharacter);
      }
      lobby.setPortals(portals, online, myPortal());
      lobby.setStart(startState());
      sendPosition();
      frameCamera(false);
      return;
    }

    // Match: the heist. Rounds, traps and roles come from the Runner and Saboteur systems.
    if (keyPressed('Escape')) {
      net.send({ t: 'leave' });
      return;
    }
    if (performance.now() > bannerUntil) banner.hidden = true;
    if (input.ability && !hud.messageOpen) abilities.use(abilityContext());
    abilities.render();
    if (hud.messageOpen) {
      if (input.action) hud.hideMessage();
      me.update({ dx: 0, dy: 0, sprint: false }, estate);
    } else {
      me.carryMult = carrying ? 1 - CARRY_SLOW * (abilities.has('steadyCarry') ? 0.5 : 1) : 1;
      me.update(input, estate);
      checkTraps();
      if (carrying && LobbyMap.inside(GETAWAY, me.x, me.y)) {
        banked += carrying.loot ?? 0;
        bankedCount++;
        hud.showMessage(`Banked the ${carrying.name}: +$${carrying.loot}. Total $${banked.toLocaleString()}.`);
        carrying = null;
        me.carryMult = 1;
        hud.setCarrying(null);
        hud.setLoot(banked, bankedCount, interactions.lootables.length);
      }
      const near = interactions.nearby(me);
      // Walking into a closed door pushes it open, so nobody stops dead in a doorway.
      if (me.bumped && near?.kind === 'door' && !estate.isOpen(near.door)) {
        estate.setDoor(near.door, true);
        net.send({ t: 'door', id: near.door.id, open: true });
      }
      const handsFull = !!carrying && near?.kind === 'item' && !!near.item.loot && !interactions.looted.has(near.item.id);
      hud.setPrompt(near ? (handsFull ? 'Hands full: bank your loot at the GETAWAY first' : interactions.promptFor(near, estate)) : null);
      if (near && input.action && !handsFull) {
        if (near.kind === 'door') {
          const refused = interactions.toggleDoor(near.door, estate, me, HITBOX);
          if (refused) hud.showMessage(refused);
          else net.send({ t: 'door', id: near.door.id, open: estate.isOpen(near.door) });
        } else {
          const fresh = !!near.item.loot && !interactions.looted.has(near.item.id);
          hud.showMessage(interactions.interact(near.item));
          hud.setPrompt(null);
          if (fresh) {
            // It's in your hands now; it only counts once it reaches the GETAWAY.
            carrying = near.item;
            hud.setCarrying(`CARRYING ${near.item.name.toUpperCase()} $${near.item.loot}`);
            net.send({ t: 'loot', id: near.item.id });
          }
        }
      }
    }
    hud.setArea(estate.areaAt(me.x, me.y - 4));
    sendPosition();
    frameCamera(false);
  }

  // ---------- Draw ----------

  let frame = 0;
  function draw() {
    frame++;
    // Snap the camera to whole screen pixels so the art stays crisp.
    const camX = Math.round(camera.x * scale) / scale;
    const camY = Math.round(camera.y * scale) / scale;
    viewX = camX;
    viewY = camY;
    const vw = camera.viewW;
    const vh = camera.viewH;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0e1014';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Only the visible part of a layer is drawn (camera culling).
    const blit = (layer: CanvasImageSource, lw: number, lh: number) => {
      const sx = Math.max(0, camX);
      const sy = Math.max(0, camY);
      const sw = Math.min(lw - sx, vw - (sx - camX));
      const sh = Math.min(lh - sy, vh - (sy - camY));
      if (sw <= 0 || sh <= 0) return;
      ctx.drawImage(layer, sx, sy, sw, sh, (sx - camX) * scale, (sy - camY) * scale, sw * scale, sh * scale);
    };

    // Characters are drawn back to front so nearer ones overlap farther ones.
    const actors = scene === 'title' ? [] : [me, ...[...remotes.values()].map((r) => r.bandit)].sort((a, b) => a.y - b.y);

    if (scene !== 'match') {
      blit(lobbyMap.image, lobbyMap.widthPx, lobbyMap.heightPx);
      if (scene === 'lobby') {
        ctx.save();
        ctx.scale(scale, scale);
        drawPortalFloors(camX, camY);
        actors.forEach((b) => b.draw(ctx, camX, camY));
        ctx.restore();
      }
      // Lamplight over the room (and the players in it).
      if (settings.values.lighting) {
        blit(lobbyMap.shade, lobbyMap.widthPx, lobbyMap.heightPx);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        blit(lobbyMap.glow, lobbyMap.widthPx, lobbyMap.heightPx);
        ctx.restore();
      }
      if (scene === 'title') return;
      ctx.save();
      ctx.scale(scale, scale);
      drawPortalFrames(camX, camY);
      ctx.globalAlpha = CHAR_GLOW;
      actors.forEach((b) => b.draw(ctx, camX, camY, false));
      ctx.restore();
      drawPortalLabels(camX, camY);
      drawWardrobePrompt(camX, camY);
      if (settings.values.nameTags) drawNameTags(camX, camY);
      return;
    }

    blit(estate.below, estate.widthPx, estate.heightPx);
    ctx.save();
    ctx.scale(scale, scale);
    drawTwinkles(camX, camY);
    drawGetaway(camX, camY);
    drawTrapPlates(camX, camY);
    actors.forEach((b) => b.draw(ctx, camX, camY));
    ctx.restore();
    blit(estate.above, estate.widthPx, estate.heightPx);
    if (settings.values.lighting) lighting.draw(ctx, camX, camY, vw, vh, scale);
    // Characters again over the darkness, so players can always see each other.
    ctx.save();
    ctx.scale(scale, scale);
    ctx.globalAlpha = CHAR_GLOW;
    actors.forEach((b) => b.draw(ctx, camX, camY, false));
    ctx.globalAlpha = 1;
    drawTrapEffects(camX, camY);
    if (carrying) lootBag(me, camX, camY);
    for (const r of remotes.values()) if (r.state.carrying) lootBag(r.bandit, camX, camY);
    ctx.restore();
    drawGetawayLabel(camX, camY);
    if (settings.values.nameTags) drawNameTags(camX, camY);
  }

  /** Metal plates with hazard edges; dim while recharging, outlined for the Saboteur's cursor. */
  function drawTrapPlates(camX: number, camY: number) {
    const sab = !!match?.saboteur;
    const hover = sab ? trapUnder(mouseX, mouseY) : undefined;
    for (const t of TRAPS) {
      const x = Math.round(t.x - TRAP_RADIUS - camX);
      const y = Math.round(t.y - TRAP_RADIUS - camY);
      const s = TRAP_RADIUS * 2;
      ctx.save();
      ctx.globalAlpha = trapReady(t.id) ? 1 : 0.5;
      ctx.fillStyle = '#16121c';
      ctx.fillRect(x, y, s, s);
      // Hazard stripes around the edge, a grille in the middle.
      for (let i = 0; i < s; i += 4) {
        ctx.fillStyle = (i / 4) % 2 ? '#16121c' : '#e8b440';
        ctx.fillRect(x + i, y, 4, 2);
        ctx.fillRect(x + i, y + s - 2, 4, 2);
        ctx.fillRect(x, y + i, 2, 4);
        ctx.fillRect(x + s - 2, y + i, 2, 4);
      }
      ctx.fillStyle = '#5e6068';
      ctx.fillRect(x + 4, y + 4, s - 8, s - 8);
      ctx.fillStyle = '#33353d';
      for (let i = 6; i < s - 6; i += 3) ctx.fillRect(x + 6, y + i, s - 12, 1);
      if (abilities.has('trapJam') && Math.hypot(t.x - me.x, t.y - me.y) <= JAM_REACH && !trapJammed(t.id)) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#9fd0ff';
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(x - 2.5, y - 2.5, s + 5, s + 5);
        ctx.setLineDash([]);
      }
      if (hover === t) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = trapReady(t.id) ? '#ff4fb0' : '#6a6c78';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 2.5, y - 2.5, s + 5, s + 5);
      }
      ctx.restore();
    }
  }

  /** Red warning flash while arming, then crackling sparks while live; drawn over the lighting. */
  function drawTrapEffects(camX: number, camY: number) {
    const now = performance.now();
    for (const t of TRAPS) {
      // Jammed: a blue lock-out with a wrench and the seconds left.
      if (trapJammed(t.id)) {
        const x = t.x - camX;
        const y = t.y - camY;
        ctx.fillStyle = 'rgba(80, 160, 255, 0.45)';
        ctx.fillRect(x - TRAP_RADIUS, y - TRAP_RADIUS, TRAP_RADIUS * 2, TRAP_RADIUS * 2);
        ctx.strokeStyle = '#9fd0ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - TRAP_RADIUS + 0.5, y - TRAP_RADIUS + 0.5, TRAP_RADIUS * 2 - 1, TRAP_RADIUS * 2 - 1);
        ctx.fillStyle = '#e6f8ff';
        ctx.fillRect(x - 5, y - 1, 10, 2); // wrench handle
        ctx.fillRect(x + 3, y - 3, 3, 6); // wrench head
        ctx.fillRect(x - 6, y - 2, 2, 4);
        continue;
      }
      const firedAt = trapFiredAt.get(t.id);
      if (firedAt === undefined) continue;
      const phase = now - firedAt;
      const x = t.x - camX;
      const y = t.y - camY;
      if (trapHits.has(`${t.id}@${firedAt}`) && trapJammed(t.id)) continue; // defused mid-flash
      if (phase < TRAP_ARM_MS) {
        ctx.fillStyle = `rgba(255, 60, 60, ${Math.floor(phase / 100) % 2 ? 0.25 : 0.6})`;
        ctx.fillRect(x - TRAP_RADIUS, y - TRAP_RADIUS, TRAP_RADIUS * 2, TRAP_RADIUS * 2);
      } else if (phase < TRAP_ARM_MS + TRAP_ACTIVE_MS) {
        ctx.fillStyle = 'rgba(140, 220, 255, 0.45)';
        ctx.fillRect(x - TRAP_RADIUS, y - TRAP_RADIUS, TRAP_RADIUS * 2, TRAP_RADIUS * 2);
        ctx.strokeStyle = '#e6f8ff';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * 9 + (Math.random() - 0.5) * 6, y + Math.sin(a) * 9 - 6);
          ctx.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16 - 10);
          ctx.stroke();
        }
      }
    }
  }

  /** The zone on the street where loot is banked. */
  function drawGetaway(camX: number, camY: number) {
    const x = GETAWAY.x * ART_TILE - camX;
    const y = GETAWAY.y * ART_TILE - camY;
    const w = GETAWAY.w * ART_TILE;
    const h = GETAWAY.h * ART_TILE;
    ctx.save();
    ctx.fillStyle = '#6fe07a';
    ctx.globalAlpha = carrying ? 0.22 + 0.15 * Math.sin(frame / 8) : 0.12;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#6fe07a';
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  function drawGetawayLabel(camX: number, camY: number) {
    const sx = ((GETAWAY.x + GETAWAY.w / 2) * ART_TILE - camX) * scale;
    const sy = ((GETAWAY.y + GETAWAY.h / 2) * ART_TILE - camY) * scale;
    ctx.font = `${Math.round(10 * dpr)}px "Press Start 2P"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0e0a1a';
    ctx.fillText('GETAWAY', sx + 2 * dpr, sy + 2 * dpr);
    ctx.fillStyle = '#6fe07a';
    ctx.fillText('GETAWAY', sx, sy);
  }

  /** A sack of loot held over a bandit's head, in art pixels. */
  function lootBag(b: Bandit, camX: number, camY: number) {
    const x = Math.round(b.x - camX);
    const y = Math.round(b.y - DRAW_H - 4 - camY + Math.sin(frame / 10));
    ctx.fillStyle = '#16121c';
    ctx.fillRect(x - 6, y - 7, 12, 10);
    ctx.fillStyle = '#9a6236';
    ctx.fillRect(x - 5, y - 6, 10, 8);
    ctx.fillStyle = '#b97c46';
    ctx.fillRect(x - 4, y - 6, 4, 3);
    ctx.fillStyle = '#5a3420';
    ctx.fillRect(x - 2, y - 9, 4, 3);
    ctx.fillStyle = '#ffe39a';
    ctx.fillRect(x - 1, y - 4, 2, 5);
    ctx.fillRect(x - 2, y - 3, 4, 1);
    ctx.fillRect(x - 2, y - 1, 4, 1);
  }

  function drawTwinkles(camX: number, camY: number) {
    for (const item of interactions.lootables) {
      if (interactions.looted.has(item.id)) continue;
      const cx = ((item.rect[0] + item.rect[2] + 1) / 2) * ART_TILE - camX;
      const cy = item.rect[1] * ART_TILE + 4 - camY;
      const phase = (frame + item.id.length * 13) % 90;
      if (phase > 30) continue;
      const s = phase < 15 ? phase / 15 : (30 - phase) / 15;
      ctx.fillStyle = `rgba(255, 246, 200, ${0.9 * s})`;
      ctx.fillRect(Math.round(cx) - 2, Math.round(cy), 5, 1);
      ctx.fillRect(Math.round(cx), Math.round(cy) - 2, 1, 5);
    }
  }

  /** The "E  CUSTOMIZE" plate over the wardrobe; it lights up when you're close enough. */
  function drawWardrobePrompt(camX: number, camY: number) {
    if (lobby.pickerOpen) return;
    const w = lobbyData.wardrobe;
    const at = w.prompt ?? { x: w.x + w.w / 2, y: w.y - 1 };
    const near = nearWardrobe();
    const size = Math.round(9 * dpr);
    const sx = (at.x * ART_TILE - camX) * scale;
    const sy = (at.y * ART_TILE - camY) * scale + (near ? Math.sin(frame / 8) * 2 * dpr : 0);
    ctx.save();
    ctx.globalAlpha = near ? 1 : 0.75;
    keyTag('E', 'CUSTOMIZE', sx, sy, near ? '#ffc94a' : '#fff4e6', size);
    ctx.restore();
  }

  /** The tinted pad under the players. */
  function drawPortalFloors(camX: number, camY: number) {
    const mine = myPortal();
    const flashing = performance.now() < flashUntil;
    for (const p of lobbyData.portals) {
      const state = portals.find((s) => s.size === p.size);
      const counting = state?.countdown != null;
      ctx.save();
      ctx.fillStyle = PORTAL_COLORS[p.size] ?? '#ffffff';
      let alpha = 0.26;
      if (p.size === mine) alpha = 0.38 + 0.08 * Math.sin(frame / 10);
      else if (p.size === hoverPortal) alpha = 0.34;
      if (flashing) alpha = 0.3 + 0.3 * Math.abs(Math.sin(frame / 5));
      ctx.globalAlpha = counting ? 0.35 + 0.3 * Math.abs(Math.sin(frame / 6)) : alpha;
      ctx.fillRect(p.x * ART_TILE - camX, p.y * ART_TILE - camY, p.w * ART_TILE, p.h * ART_TILE);
      ctx.restore();
    }
  }

  /** Neon frames, a crew icon per seat, and a sign plate; drawn over the lamplight so they glow. */
  function drawPortalFrames(camX: number, camY: number) {
    const pulse = 0.65 + 0.35 * Math.sin(frame / 15);
    const mine = myPortal();
    for (const p of lobbyData.portals) {
      const state = portals.find((s) => s.size === p.size);
      const color = PORTAL_COLORS[p.size] ?? '#ffffff';
      const selected = p.size === mine;
      const hovered = p.size === hoverPortal;
      const x = Math.round(p.x * ART_TILE - camX);
      const y = Math.round(p.y * ART_TILE - camY) - (hovered && !selected ? 1 : 0);
      const w = p.w * ART_TILE;
      const h = p.h * ART_TILE;
      ctx.save();
      // Dark bezel, then a glowing double neon line.
      ctx.strokeStyle = '#0e0a1a';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);
      ctx.shadowColor = color;
      ctx.shadowBlur = 10 * dpr * (selected || hovered ? 1.4 : pulse);
      ctx.strokeStyle = color;
      ctx.lineWidth = selected ? 3 : 2;
      ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
      if (selected) {
        // Marching dashes inside the frame: this is your party.
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -frame / 3;
        ctx.globalAlpha = 0.9;
        ctx.strokeRect(x + 9.5, y + 9.5, w - 19, h - 19);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 6.5, y + 6.5, w - 13, h - 13);
      ctx.shadowBlur = 0;
      // Bright corner brackets.
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff4e6';
      for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
        ctx.fillRect(dx > 0 ? cx + 1 : cx - 9, dy > 0 ? cy + 1 : cy - 3, 8, 2);
        ctx.fillRect(dx > 0 ? cx + 1 : cx - 3, dy > 0 ? cy + 1 : cy - 9, 2, 8);
      }
      // One little person per seat: lit when taken.
      const count = state?.count ?? 0;
      const gap = 13;
      const left = x + w / 2 - ((p.size - 1) * gap) / 2;
      for (let i = 0; i < p.size; i++) person(left + i * gap, y + h * 0.38, i < count ? color : 'rgba(255,244,230,0.3)');
      // The sign plate above the pad, hung on two posts.
      ctx.fillStyle = '#6b4529';
      ctx.fillRect(x + 10, y - 4, 2, 4);
      ctx.fillRect(x + w - 12, y - 4, 2, 4);
      ctx.fillStyle = '#16101e';
      ctx.fillRect(x + 4, y - 15, w - 8, 12);
      ctx.shadowColor = color;
      ctx.shadowBlur = 6 * dpr;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 4.5, y - 14.5, w - 9, 11);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  /** A tiny pixel person (head and shoulders) centred on (x, y), in art pixels. */
  function person(x: number, y: number, color: string) {
    const px = Math.round(x);
    const py = Math.round(y);
    ctx.fillStyle = color;
    ctx.fillRect(px - 3, py - 8, 6, 6);
    ctx.fillRect(px - 2, py - 9, 4, 1);
    ctx.fillRect(px - 5, py, 10, 5);
    ctx.fillRect(px - 4, py - 1, 8, 1);
  }

  function drawPortalLabels(camX: number, camY: number) {
    for (const p of lobbyData.portals) {
      const state = portals.find((s) => s.size === p.size);
      const color = PORTAL_COLORS[p.size] ?? '#ffffff';
      const cx = ((p.x + p.w / 2) * ART_TILE - camX) * scale;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(8 * dpr)}px "Press Start 2P"`;
      ctx.fillStyle = color;
      ctx.fillText(`${p.size} PLAYERS`, cx, (p.y * ART_TILE - 9 - camY) * scale);
      const countY = ((p.y + p.h * 0.75) * ART_TILE - camY) * scale;
      if (state?.countdown != null) {
        const midY = ((p.y + p.h / 2) * ART_TILE - camY) * scale;
        ctx.font = `${Math.round(30 * dpr)}px "Press Start 2P"`;
        ctx.fillStyle = '#0e0a1a';
        ctx.fillText(String(state.countdown), cx + 3 * dpr, midY + 3 * dpr);
        ctx.fillStyle = '#fff4e6';
        ctx.fillText(String(state.countdown), cx, midY);
      } else {
        ctx.font = `${Math.round(13 * dpr)}px "Press Start 2P"`;
        ctx.fillStyle = '#0e0a1a';
        ctx.fillText(`${state?.count ?? 0}/${p.size}`, cx + 2 * dpr, countY + 2 * dpr);
        ctx.fillStyle = '#fff4e6';
        ctx.fillText(`${state?.count ?? 0}/${p.size}`, cx, countY);
      }
      // Under the count: your party, or what a click will do.
      const mine = myPortal() === p.size;
      const note = mine ? (hoverPortal === p.size ? 'CLICK TO LEAVE' : 'YOUR PARTY') : hoverPortal === p.size ? 'CLICK TO JOIN' : '';
      if (note) {
        ctx.font = `${Math.round(7 * dpr)}px "Press Start 2P"`;
        ctx.fillStyle = '#0e0a1a';
        ctx.fillText(note, cx + dpr, ((p.y + p.h - 0.4) * ART_TILE - camY) * scale + dpr);
        ctx.fillStyle = mine ? color : '#fff4e6';
        ctx.fillText(note, cx, ((p.y + p.h - 0.4) * ART_TILE - camY) * scale);
      }
    }
  }

  /** A key cap followed by a label, on a dark plate, centred at (sx, sy) in screen pixels. */
  function keyTag(key: string, text: string, sx: number, sy: number, color: string, size: number) {
    ctx.font = `${size}px "Press Start 2P"`;
    ctx.textBaseline = 'middle';
    const pad = size * 0.8;
    const capW = size * 2;
    const textW = ctx.measureText(text).width;
    const w = pad + capW + pad + textW + pad;
    const h = size * 2.6;
    const x = sx - w / 2;
    ctx.fillStyle = 'rgba(14, 10, 26, 0.9)';
    ctx.fillRect(x, sy - h / 2, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.strokeRect(x + 0.5, sy - h / 2 + 0.5, w - 1, h - 1);
    ctx.fillStyle = '#fff4e6';
    ctx.fillRect(x + pad, sy - size, capW, size * 2);
    ctx.fillStyle = '#0e0a1a';
    ctx.textAlign = 'center';
    ctx.fillText(key, x + pad + capW / 2, sy + 1);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(text, x + pad * 2 + capW, sy + 1);
  }

  /** A text label with a dark backing, in screen pixels; sy is its bottom edge. */
  function textTag(text: string, sx: number, sy: number, color: string, size: number) {
    ctx.font = `${size}px "Press Start 2P"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const w = ctx.measureText(text).width + size;
    ctx.fillStyle = 'rgba(14, 10, 26, 0.85)';
    ctx.fillRect(sx - w / 2, sy - size * 1.7, w, size * 1.7);
    ctx.fillStyle = color;
    ctx.fillText(text, sx, sy - size * 0.35);
  }

  function drawNameTags(camX: number, camY: number) {
    const size = Math.round(8 * dpr);
    const tag = (b: Bandit, id: string, name: string, character: CharacterId, bag = false, health = MAX_HP) => {
      const color = CHARACTER_INFO[character].color;
      const sx = (b.x - camX) * scale;
      const sy = (b.y - DRAW_H - (bag ? 15 : 3) - camY) * scale;
      // No role on the tag: who the Saboteur is stays a secret (each player sees only their own role).
      textTag(name, sx, sy, id === myId ? '#ffe39a' : color, size);
      // Hurt Runners show a small health bar over the name.
      if (health < MAX_HP) {
        const w = 40 * dpr;
        const by = sy - size * 1.7 - 6 * dpr;
        ctx.fillStyle = '#0e0a1a';
        ctx.fillRect(sx - w / 2 - dpr, by - dpr, w + 2 * dpr, 5 * dpr);
        ctx.fillStyle = health > 50 ? '#6fe07a' : health > 25 ? '#ffc94a' : '#ff5a5a';
        ctx.fillRect(sx - w / 2, by, (w * health) / MAX_HP, 3 * dpr);
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(sx - 4 * dpr, sy);
      ctx.lineTo(sx + 4 * dpr, sy);
      ctx.lineTo(sx, sy + 4 * dpr);
      ctx.fill();
    };
    const inMatch = scene === 'match';
    for (const [id, r] of remotes) tag(r.bandit, id, r.state.name, r.state.character, inMatch && r.state.carrying, inMatch ? r.state.hp : MAX_HP);
    tag(me, myId, myName, myCharacter, inMatch && !!carrying, inMatch ? hp : MAX_HP);
  }

  // Fixed 60 updates per second; draw once per animation frame.
  let last = performance.now();
  let acc = 0;
  function tick(now: number) {
    acc += Math.min(now - last, 250);
    last = now;
    while (acc >= 1000 / 60) {
      update();
      acc -= 1000 / 60;
    }
    draw();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

boot().catch((err) => {
  document.body.insertAdjacentHTML('afterbegin', `<pre style="position:fixed;z-index:9;color:#f88;padding:16px">${String(err)}</pre>`);
});
