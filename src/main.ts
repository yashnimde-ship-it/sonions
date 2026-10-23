import '@fontsource/press-start-2p';
import { ART_TILE, CHAR_GLOW, CHARACTERS, type CharacterId, characterSheet, HITBOX, ZOOM } from './config';
import { CHARACTER_INFO } from './data/characters';
import { MAP_IDS, type MapId, MAPS } from './data/maps';
import { inTrapArea, JAM_REACH, MAX_HP, TRAP_RADIUS, trapIsReady, trapPosition, trapRules, type TrapSpot } from './data/traps';
import { drawExhibitEffect, drawExhibitIdle } from './systems/ExhibitTraps';
import { Profile } from './data/profile';
import { type Phase, placementRefusal, SABOTEUR_BASE_ENERGY } from './data/round';
import { type PlacedTrap, TRAP_KINDS, type TrapKind, trapKind } from './data/trapKinds';
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
import { drawTrap } from './systems/TrapArt';
import { HUD } from './ui/HUD';
import { LobbyUI, type MapInfo, type StartState } from './ui/LobbyUI';
import { Settings } from './ui/Settings';
import { TrapBar } from './ui/TrapBar';
import { DiamondBar } from './ui/DiamondBar';
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

/** What the map picker says about a map, straight from its map data. */
function mapInfo(id: MapId, data: EstateJson): MapInfo {
  const def = MAPS[id];
  const names = data.areas.names;
  const indoor = new Set<string>();
  // Area 0 is the default (walls and lawn), so it never counts as a room.
  data.areas.data.forEach((a, i) => {
    if (data.indoor[i] && a !== 0) indoor.add(names[a]);
  });
  return {
    id,
    name: def.name,
    description: def.description,
    difficulty: def.difficulty,
    width: data.width,
    height: data.height,
    rooms: names.filter((n) => indoor.has(n)),
    outdoor: names.filter((n) => !indoor.has(n)),
    doors: data.doors.length,
    loot: data.interactables.filter((i) => i.loot).map((i) => ({ name: i.name, value: i.loot! })),
    preview: def.preview,
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
const PORTAL_COLORS: Record<number, string> = { 2: '#3ee6d4', 3: '#ffb02e', 4: '#ff4fb0' };
const BANNER_MS = 4000;

async function boot() {
  const loadWorld = async (id: MapId) => {
    const d = MAPS[id];
    const [data, tiles, doors] = await Promise.all([fetchJson<EstateJson>(d.json), loadImage(d.tileset), loadImage(d.doors)]);
    return { data, tiles, doors };
  };
  const [worldList, lobbyData, lobbyImage, ...sheetList] = await Promise.all([
    Promise.all(MAP_IDS.map(loadWorld)),
    fetchJson<LobbyJson>('/assets/lobby/lobby.json'),
    loadImage('/assets/lobby/lobby.png'),
    ...CHARACTERS.map((id) => loadImage(characterSheet(id))),
  ]);
  const sheets = Object.fromEntries(CHARACTERS.map((id, i) => [id, sheetList[i]])) as Record<CharacterId, HTMLImageElement>;

  const lobbyMap = new LobbyMap(lobbyData, lobbyImage);
  const worlds = Object.fromEntries(MAP_IDS.map((id, i) => [id, worldList[i]])) as Record<MapId, (typeof worldList)[number]>;
  // The heist's map (`estate` is whichever map the crew is playing, the mansion or the
  // museum). It's rebuilt for every heist, so doors and loot start fresh.
  let mapId: MapId = 'estate';
  let estateData = worlds.estate.data;
  let traps: TrapSpot[] = MAPS.estate.traps;
  let getaway = MAPS.estate.getaway;
  /** The map I'd like to play next (the crew's majority decides). */
  let myMap: MapId = 'estate';
  try {
    const saved = localStorage.getItem('bandit-map');
    if (saved === 'estate' || saved === 'museum') myMap = saved;
  } catch {
    // Storage blocked: the estate.
  }
  const createInteractables = () => estateData.interactables.map((item) => {
    const rect = [...item.rect] as [number, number, number, number];
    const lootPos = item.loot ? { x: ((rect[0] + rect[2] + 1) / 2) * ART_TILE, y: ((rect[1] + rect[3] + 1) / 2) * ART_TILE } : undefined;
    return { ...item, name: item.loot ? 'Diamond' : item.name, text: item.loot ? 'You pocket the hidden diamond.' : item.text, rect, lootPos };
  });
  let estate = new TileMap(estateData, worlds.estate.tiles, worlds.estate.doors);
  let interactions = new InteractionSystem(createInteractables(), estateData.doors);
  let lighting = new LightingSystem(estate);

  const camera = new CameraSystem(lobbyMap.widthPx, lobbyMap.heightPx);
  const hud = new HUD();
  const title = new TitleUI();
  const settings = new Settings();
  const profile = new Profile();
  const lobby = new LobbyUI(MAP_IDS.map((id) => mapInfo(id, worlds[id].data)), settings);
  const net = new NetClient();
  const abilities = new AbilitySystem();
  let selectedDiamondId: string | null = null;
  const trapBar = new TrapBar((kind) => selectTrap(selectedTrap?.id === kind.id ? null : kind));
  const diamondBar = new DiamondBar(createInteractables().filter((item) => item.loot), (id) => selectDiamond(selectedDiamondId === id ? null : id), () => net.send({ t: 'ready' }));

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const hudEl = document.getElementById('hud')!;
  // The Saboteur clicks to place the selected trap (right-click picks one up), or, with none
  // selected, to fire a trap plate.
  const toWorld = (e: PointerEvent | MouseEvent): [number, number] => [(e.clientX * dpr) / scale + camera.x, (e.clientY * dpr) / scale + camera.y];
  canvas.addEventListener('pointermove', (e) => ([mouseX, mouseY] = toWorld(e)));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (scene !== 'match' || !match?.saboteur) return;
    const [x, y] = toWorld(e);
    if (phase === 'setup' && e.button === 2) {
      if (selectedDiamondId) return selectDiamond(null);
      if (selectedTrap) return selectTrap(null);
      const hit = placedUnder(x, y);
      if (hit) {
        placed.delete(hit.id);
        net.send({ t: 'unplace', id: hit.id });
        updateTrapBar();
      }
      return;
    }
    if (phase === 'setup') {
      if (selectedDiamondId) return placeDiamond(selectedDiamondId, x, y);
      return selectedTrap && placeTrap(selectedTrap, x, y);
    }
    if (phase !== 'live') return;
    const trap = trapUnder(x, y);
    if (trap && trapReady(trap.id)) net.send({ t: 'trap', id: trap.id });
  });
  // The Saboteur's free camera zooms with the mouse wheel.
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (scene !== 'match' || !match?.saboteur) return;
      e.preventDefault();
      sabScale = (sabScale || fitScale()) * (e.deltaY < 0 ? 1.15 : 1 / 1.15);
    },
    { passive: false },
  );
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
  let trapEnergy = SABOTEUR_BASE_ENERGY;
  let maxTrapEnergy = SABOTEUR_BASE_ENERGY;
  /** My health (Runners only), and when each trap plate last fired (performance.now ms). */
  let hp = MAX_HP;
  let knockedOut = false;
  const trapFiredAt = new Map<string, number>();
  const trapHits = new Set<string>();
  /** Plates jammed by Trap Jam, until when (performance.now ms). */
  const trapJammedUntil = new Map<string, number>();
  const tripwireArmed = new Set<string>();
  const doorJammedUntil = new Map<string, number>();
  /** When traps were last checked, so a slow frame can't skip over a plate's live window. */
  let lastTrapCheck = 0;
  let lastIconPaint = 0;
  /** The traps the Saboteur has put down this heist, and the one they're about to place. */
  const placed = new Map<string, PlacedTrap>();
  let selectedTrap: TrapKind | null = null;
  let placedCount = 0;
  /** Where the round is (server's clock), and when this phase ends (performance.now ms). */
  let phase: Phase = 'setup';
  let phaseEndsAt = 0;
  /** The Saboteur's free camera: where it looks (art px) and its zoom (0 = whole house). */
  let freeX = 0;
  let freeY = 0;
  let sabScale = 0;
  let toastUntil = 0;
  let trapNotice = '';
  let trapNoticeUntil = 0;
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
    // The safehouse fits the window when it can; the estate is played up close. The Saboteur
    // looks round the whole house with a free camera; waiting Runners see all of it.
    let [tx, ty] = [me.x, me.y - DRAW_H / 2];
    if (scene !== 'match') scale = Math.max(1.5 * dpr, Math.min(canvas.width / w, canvas.height / h));
    else if (match?.saboteur) {
      sabScale = sabScale && Math.min(ZOOM * dpr, Math.max(fitScale(), sabScale));
      scale = sabScale || fitScale();
      [tx, ty] = [freeX, freeY];
    } else if (phase === 'setup') {
      scale = fitScale();
      [tx, ty] = [w / 2, h / 2];
    } else scale = ZOOM * dpr;
    camera.resize(canvas.width / scale, canvas.height / scale);
    if (scene === 'title') {
      tx = w / 2;
      ty = h / 2;
    }
    if (snap) camera.snap(tx, ty);
    else camera.update(tx, ty);
  }

  /** The zoom that fits the whole estate in the window. */
  function fitScale() {
    return Math.min(canvas.width / estate.widthPx, canvas.height / estate.heightPx);
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
    mapId = msg.map ?? 'estate';
    const world = worlds[mapId];
    estateData = world.data;
    traps = MAPS[mapId].traps;
    getaway = MAPS[mapId].getaway;
    abilities.traps = traps;
    estate = new TileMap(estateData, world.tiles, world.doors);
    interactions = new InteractionSystem(createInteractables(), estateData.doors);
    spottedUntil.clear();
    dazzledUntil = 0;
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
    tripwireArmed.clear();
    doorJammedUntil.clear();
    trapEnergy = msg.energy ?? SABOTEUR_BASE_ENERGY;
    maxTrapEnergy = msg.maxEnergy ?? SABOTEUR_BASE_ENERGY;
    placed.clear();
    selectTrap(null);
    selectDiamond(null);
    if (msg.diamonds) applyDiamonds(msg.diamonds);
    phase = msg.phase;
    phaseEndsAt = performance.now() + msg.ms;
    trapBar.show(msg.role === 'saboteur' && phase === 'setup');
    diamondBar.show(msg.role === 'saboteur' && phase === 'setup');
    trapBar.setEnergy(trapEnergy, maxTrapEnergy);
    updateTrapBar();
    sabScale = 0;
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
      freeX = p.x;
      freeY = p.y;
    }
    abilities.setRound(myCharacter, msg.role);
    const role = msg.role === 'saboteur' ? '<b class="saboteur">THE SABOTEUR</b>' : '<b class="runner">A RUNNER</b>';
    const job =
      msg.role === 'saboteur'
        ? 'Hide 9 diamonds and place up to 10 traps. Confirm when your setup is ready.'
        : 'The Saboteur is rigging the house. Get ready to go in.';
    banner.innerHTML = `<span class="kicker">${msg.size}-PLAYER HEIST</span><span>You are ${role}</span><span class="crew-list">${job}</span>`;
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
        // The server forgets nothing between heists, but tell it again after (re)joining.
        lobby.setMap(myMap);
        net.send({ t: 'map', map: myMap });
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
      case 'doorLocked':
        doorJammedUntil.set(msg.id, performance.now() + msg.ms);
        break;
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
      case 'place':
        placed.set(msg.trap.id, msg.trap);
        break;
      case 'diamond':
        applyDiamonds([msg]);
        break;
      case 'phase':
        if (msg.diamonds) applyDiamonds(msg.diamonds);
        phase = msg.phase;
        phaseEndsAt = performance.now() + msg.ms;
        selectTrap(null);
        selectDiamond(null);
        trapBar.show(false);
        diamondBar.show(false);
        banner.innerHTML =
          phase === 'live'
            ? `<span class="kicker">SETUP OVER</span><span>THE HEIST IS ON</span><span class="crew-list">${match?.saboteur ? 'Watch them. Your traps are set.' : 'Get in, grab the loot, get out.'}</span>`
            : `<span class="kicker">TIME'S UP</span><span>ROUND OVER</span><span class="crew-list">Results are coming soon. Esc for the safehouse.</span>`;
        banner.hidden = false;
        bannerUntil = performance.now() + BANNER_MS;
        break;
      case 'unplace':
        placed.delete(msg.id);
        break;
      case 'placementRejected':
        placed.delete(msg.id);
        updateTrapBar();
        toast(msg.reason);
        break;
      case 'energy':
        trapEnergy = msg.current;
        maxTrapEnergy = msg.max;
        updateTrapBar();
        break;
      case 'trap':
        trapFiredAt.set(msg.id, performance.now());
        tripwireArmed.delete(msg.id);
        break;
      case 'placedTrapHit':
        applyPlacedTrapHit(msg.kind, msg.damage, msg.stunMs, msg.knockback);
        break;
      case 'tripwireArmed':
        tripwireArmed.add(msg.id);
        break;
      case 'trapRefreshed':
        trapFiredAt.delete(msg.id);
        tripwireArmed.delete(msg.id);
        break;
      case 'doorJammed':
        toast('Door jammed');
        break;
      case 'healed':
        if (match && !match.saboteur) healMe();
        break;
      case 'jam': {
        const now = performance.now();
        trapJammedUntil.set(msg.id, now + msg.ms);
        // A plate that was still flashing or live is defused: its shock never lands.
        const firedAt = trapFiredAt.get(msg.id);
        const spot = spotById(msg.id);
        if (firedAt !== undefined && spot && now < firedAt + trapRules(spot).armMs + trapRules(spot).activeMs) trapHits.add(`${msg.id}@${firedAt}`);
        tripwireArmed.delete(msg.id);
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
  // The map picker: tell the server (it goes with the crew's majority when a portal fills).
  lobby.onMap = (id) => {
    myMap = id;
    try {
      localStorage.setItem('bandit-map', id);
    } catch {
      // Not remembered; still applies now.
    }
    net.send({ t: 'map', map: id });
  };
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
      net.send({ t: 'portal', size: null });
    } else {
      const seat = Math.min(portals.find((s) => s.size === size)?.count ?? 0, size - 1);
      me.x = (p.x + 1.2 + (seat % 3) * ((p.w - 2.4) / 2)) * ART_TILE;
      me.y = (p.y + 2.4 + Math.floor(seat / 3) * 1.3) * ART_TILE;
      me.facing = 'down';
      net.send({ t: 'portal', size });
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
    Object.assign(window, { game: { me, remotes, net, lobbyMap, abilities, get estate() { return estate; }, get scene() { return scene; }, get portals() { return portals; }, get view() { return { x: viewX, y: viewY, scale, dpr }; }, lobby, settings, profile, placed, get phase() { return phase; }, get mapId() { return mapId; }, get hp() { return hp; }, get carrying() { return carrying; }, get banked() { return banked; }, get spottedUntil() { return spottedUntil; }, interactionsRef: () => interactions } }); // for playtests

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
    const targetTrap = trapUnder(mouseX, mouseY);
    const targetDoor = estateData.doors.find((door) => mouseX >= door.x && mouseX <= door.x + door.w && mouseY >= door.y && mouseY <= door.y + door.h);
    return { me, send: (m: ClientMsg) => net.send(m), hp, setHp: healMe, crew, targetTrapId: targetTrap?.id, targetTrapReady: targetTrap ? trapIsReady(trapFiredAt.get(targetTrap.id), performance.now(), abilities.overclockWindow, trapRules(targetTrap)) : undefined, targetTrapJammed: targetTrap ? trapJammed(targetTrap.id) : undefined, targetDoorId: targetDoor?.id };
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

  function selectTrap(kind: TrapKind | null) {
    selectedTrap = kind;
    trapBar.select(kind?.id ?? null);
    if (kind) selectDiamond(null);
  }

  function selectDiamond(id: string | null) {
    selectedDiamondId = id;
    diamondBar.select(id);
    if (id) {
      selectedTrap = null;
      trapBar.select(null);
      diamondBar.message('Click an open floor spot to hide the selected diamond.');
    } else {
      diamondBar.message('Select a diamond, then click an open spot in the house.');
    }
  }

  function applyDiamonds(positions: { id: string; x: number; y: number }[]) {
    for (const position of positions) {
      const item = interactions.items.find((candidate) => candidate.id === position.id && candidate.loot);
      if (item) item.lootPos = { x: position.x, y: position.y };
    }
  }

  function placeDiamond(id: string, mx: number, my: number) {
    const x = snap(mx);
    const y = snap(my);
    if (estate.boxBlocked(x - 7, y - 7, x + 7, y + 7)) return toast('Hide diamonds on clear, reachable floor');
    const item = interactions.items.find((candidate) => candidate.id === id && candidate.loot);
    if (!item) return selectDiamond(null);
    item.lootPos = { x, y };
    net.send({ t: 'diamond', id, x, y });
    selectDiamond(null);
    toast('Diamond hidden');
  }

  const placedKinds = () => [...placed.values()].map((t) => t.kind);

  function updateTrapBar() {
    trapBar.setCounts(placedKinds());
    trapBar.setEnergy(trapEnergy, maxTrapEnergy);
  }

  function applyPlacedTrapHit(kind: PlacedTrap['kind'], damage: number, stunMs: number, knockback?: { x: number; y: number }) {
    if (!match || match.saboteur) return;
    hp = Math.max(0, hp - damage);
    if (stunMs > 0) me.stun(Math.round((stunMs / 1000) * 60));
    if (knockback && !estate.boxBlocked(knockback.x + HITBOX.left, knockback.y + HITBOX.top, knockback.x + HITBOX.right, knockback.y + HITBOX.bottom)) {
      me.x = knockback.x;
      me.y = knockback.y;
    }
    if (hp === 0) {
      knockedOut = true;
      me.stun(KO_FRAMES);
    }
    hud.setHealth(hp);
    const name = trapKind(kind)?.name ?? 'Trap';
    trapNotice = `${name} triggered${damage ? ` · ${damage} damage` : ''}${stunMs ? ` · ${stunMs / 1000}s stun` : ''}`;
    trapNoticeUntil = performance.now() + 2000;
  }

  /** A short note for the Saboteur in the prompt box. */
  function toast(text: string) {
    hud.setPrompt(text);
    toastUntil = performance.now() + 2000;
  }

  /** Placement snaps to half tiles so layouts stay tidy. */
  const snap = (v: number) => Math.round(v / (ART_TILE / 2)) * (ART_TILE / 2);

  /** Can this trap sit at (x, y)? Its middle (up to 1.5 tiles across) must be open floor, so
   *  a big patch can spill under furniture and a laser can span a corridor wall to wall. */
  function canPlace(kind: TrapKind, x: number, y: number) {
    const hw = Math.min(kind.w - 6, 24) / 2;
    const hh = Math.min(kind.h - 6, 24) / 2;
    return !estate.boxBlocked(x - hw, y - hh, x + hw, y + hh);
  }

  function placeTrap(kind: TrapKind, mx: number, my: number) {
    if (trapEnergy < kind.cost) return toast('Not enough trap energy');
    const x = snap(mx);
    const y = snap(my);
    const refused = placementRefusal(placedKinds(), kind.id) ?? (canPlace(kind, x, y) ? null : 'It needs open floor');
    if (refused) return toast(refused);
    const trap: PlacedTrap = { id: `${myId}-${++placedCount}`, kind: kind.id, x, y };
    placed.set(trap.id, trap);
    trapEnergy -= kind.cost;
    net.send({ t: 'place', trap });
    updateTrapBar();
  }

  /** The placed trap under (x, y), topmost first. */
  function placedUnder(x: number, y: number) {
    return [...placed.values()]
      .reverse()
      .find((t) => {
        const k = trapKind(t.kind)!;
        return Math.abs(x - t.x) <= k.w / 2 && Math.abs(y - t.y) <= k.h / 2;
      });
  }

  const spotById = (id: string) => traps.find((t) => t.id === id);
  const trapUnder = (x: number, y: number) => traps.find((t) => inTrapArea(t, x, y) || Math.hypot(t.x - x, t.y - y) <= TRAP_RADIUS + 4);
  const trapJammed = (id: string) => performance.now() < (trapJammedUntil.get(id) ?? 0);
  const trapReady = (id: string) => {
    const spot = spotById(id);
    return !!spot && !trapJammed(id) && trapIsReady(trapFiredAt.get(id), performance.now(), abilities.overclockWindow, trapRules(spot));
  };
  const isPlate = (t: TrapSpot) => !t.kind || t.kind === 'plate';
  /** Spotlight: who's been caught (marked for everyone), and until when; and my own dazzle. */
  const spottedUntil = new Map<string, number>();
  let dazzledUntil = 0;

  /** Who a spotlight catches is worked out by every game from the shared positions. */
  function checkSpotlights(now: number) {
    for (const t of traps) {
      if (t.kind !== 'spotlight') continue;
      const firedAt = trapFiredAt.get(t.id);
      if (firedAt === undefined || trapJammed(t.id)) continue;
      const r = trapRules(t);
      if (now < firedAt + r.armMs || now > firedAt + r.armMs + r.activeMs) continue;
      for (const [id, rm] of remotes) if (inTrapArea(t, rm.bandit.x, rm.bandit.y)) catchSpotted(id, rm.state.name, now + r.revealMs);
      if (!match?.saboteur && inTrapArea(t, me.x, me.y)) catchSpotted(myId, myName, now + r.revealMs);
    }
  }
  function catchSpotted(id: string, name: string, until: number) {
    if ((spottedUntil.get(id) ?? 0) < performance.now() && match?.saboteur) toast(`SPOTTED: ${name}`);
    spottedUntil.set(id, until);
    if (id === myId) dazzledUntil = Math.max(dazzledUntil, performance.now() + 2000);
  }

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
    for (const t of traps) {
      const firedAt = trapFiredAt.get(t.id);
      if (firedAt === undefined || t.kind === 'spotlight') continue;
      const r = trapRules(t);
      // Live if its window [arm end, arm end + active] overlaps the time since the last check.
      const liveFrom = firedAt + r.armMs;
      const live = liveFrom <= now && liveFrom + r.activeMs > since;
      const key = `${t.id}@${firedAt}`;
      const progress = (now - liveFrom) / r.activeMs;
      if (!live || trapHits.has(key) || !inTrapArea(t, me.x, me.y, progress)) continue;
      trapHits.add(key);
      hp = Math.max(0, hp - r.damage);
      if (r.stunMs) me.stun(Math.round((r.stunMs / 1000) * 60));
      if (r.knock) {
        // Away from the trap: a painting swings out from its wall; a rolling stand shoves you
        // off its track; the sarcophagus blasts you back.
        const [cx, cy] = trapPosition(t, progress);
        const [dx, dy] = t.kind === 'painting' ? [0, 1] : t.kind === 'rolling' ? [0, me.y >= cy ? 1 : -1] : [me.x - cx || 0.01, me.y - cy || 1];
        me.shove(dx, dy, r.knock, 10);
      }
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
    const left = Math.max(0, phaseEndsAt - performance.now());
    hud.setTimer(phase === 'over' ? null : phase === 'setup' ? 'SETUP' : 'HEIST', left);
    const sab = !!match?.saboteur;
    if (input.ability && !hud.messageOpen && phase === 'live') abilities.use(abilityContext());
    abilities.render();
    if (sab) {
      saboteurUpdate(input);
      sendPosition();
      frameCamera(false);
      return;
    }
    if (phase !== 'live') {
      // Runners wait outside during setup, and stop when time's up.
      me.update({ dx: 0, dy: 0, sprint: false }, estate);
      hud.setPrompt(null);
      sendPosition();
      frameCamera(false);
      return;
    }
    if (hud.messageOpen) {
      if (input.action) hud.hideMessage();
      me.update({ dx: 0, dy: 0, sprint: false }, estate);
    } else {
      me.carryMult = (carrying ? 1 - CARRY_SLOW * (abilities.has('steadyCarry') ? 0.5 : 1) : 1) * (performance.now() < dazzledUntil ? 0.5 : 1);
      me.update(input, estate);
      checkTraps();
      checkSpotlights(performance.now());
      if (carrying && LobbyMap.inside(getaway, me.x, me.y)) {
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
      if (me.bumped && near?.kind === 'door' && !estate.isOpen(near.door) && !near.door.keypad) {
        estate.setDoor(near.door, true);
        net.send({ t: 'door', id: near.door.id, open: true });
      }
      const handsFull = !!carrying && near?.kind === 'item' && !!near.item.loot && !interactions.looted.has(near.item.id);
      const doorLockLeft = near?.kind === 'door' ? Math.max(0, (doorJammedUntil.get(near.door.id) ?? 0) - performance.now()) : 0;
      hud.setPrompt(performance.now() < trapNoticeUntil ? trapNotice : near ? (doorLockLeft ? `LOCKED ${Math.ceil(doorLockLeft / 1000)}s` : handsFull ? 'Hands full: bank your loot at the GETAWAY first' : interactions.promptFor(near, estate)) : null);
      if (near && input.action && !handsFull) {
        if (near.kind === 'door') {
          const refused = interactions.toggleDoor(near.door, estate, me, HITBOX);
          if (refused) hud.showMessage(refused);
          else {
            net.send({ t: 'door', id: near.door.id, open: estate.isOpen(near.door) });
            if (near.door.keypad && estate.isOpen(near.door)) toast(`Keypad cracked: the ${near.door.name} slides open`);
          }
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

  /** The Saboteur isn't in the house: they fly a camera round it and pick traps. */
  function saboteurUpdate(input: { dx: number; dy: number; sprint: boolean }) {
    if (phase === 'setup' && !hud.messageOpen) for (const kind of TRAP_KINDS) if (keyPressed(kind.key)) selectTrap(selectedTrap?.id === kind.id ? null : kind);
    if (trapBar.visible && performance.now() - lastIconPaint > 120) {
      lastIconPaint = performance.now();
      trapBar.paintIcons(lastIconPaint);
    }
    const speed = ((input.sprint ? 12 : 6) * dpr) / scale;
    freeX = Math.min(estate.widthPx, Math.max(0, freeX + input.dx * speed * 2));
    freeY = Math.min(estate.heightPx, Math.max(0, freeY + input.dy * speed * 2));
    hud.setArea(estate.areaAt(freeX, freeY));
    if (performance.now() > toastUntil) hud.setPrompt(null);
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
    // In a heist the Saboteur isn't in the house, so they're not drawn.
    const inHouse = (id: string) => scene !== 'match' || (match?.saboteur ? id !== myId : true);
    const actors =
      scene === 'title'
        ? []
        : [...(inHouse(myId) ? [me] : []), ...[...remotes.entries()].filter(([id]) => inHouse(id)).map(([, r]) => r.bandit)].sort((a, b) => a.y - b.y);

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
    drawPlacedTraps(camX, camY);
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
    if (phase === 'setup' && !match?.saboteur) drawBlueprint(camX, camY);
    if (match?.saboteur) drawTrapMarkers(camX, camY);
  }

  /** The Saboteur's own traps, outlined in their card colour so they're easy to find zoomed out. */
  function drawTrapMarkers(camX: number, camY: number) {
    ctx.save();
    ctx.lineWidth = 2 * dpr;
    for (const t of placed.values()) {
      const k = trapKind(t.kind);
      if (!k) continue;
      ctx.strokeStyle = k.color;
      ctx.globalAlpha = 0.85;
      ctx.strokeRect(Math.round((t.x - k.w / 2 - camX) * scale), Math.round((t.y - k.h / 2 - camY) * scale), Math.round(k.w * scale), Math.round(k.h * scale));
    }
    ctx.restore();
  }

  /** Waiting Runners see the house as a blue plan while the Saboteur works. */
  function drawBlueprint(camX: number, camY: number) {
    ctx.save();
    ctx.fillStyle = 'rgba(24, 64, 150, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(160, 210, 255, 0.12)';
    const step = ART_TILE * 2;
    for (let x = -camX % step; x < camera.viewW; x += step) ctx.fillRect(Math.round(x * scale), 0, 1, canvas.height);
    for (let y = -camY % step; y < camera.viewH; y += step) ctx.fillRect(0, Math.round(y * scale), canvas.width, 1);
    ctx.restore();
  }

  /** Traps the Saboteur placed: Runners see the disguised ones as harmless; the Saboteur sees them all. */
  function drawPlacedTraps(camX: number, camY: number) {
    const sab = !!match?.saboteur;
    if (!sab) return;
    const view = 'saboteur';
    const now = performance.now();
    ctx.imageSmoothingEnabled = false;
    for (const t of [...placed.values()].sort((a, b) => a.y - b.y)) {
      const kind = trapKind(t.kind);
      if (kind) drawTrap(ctx, kind, view, t.x - camX, t.y - camY, now);
    }
    if (sab && selectedTrap && phase === 'setup') {
      // A ghost under the cursor: green where it fits, red where it doesn't.
      const x = snap(mouseX);
      const y = snap(mouseY);
      const ok = canPlace(selectedTrap, x, y) && !placementRefusal(placedKinds(), selectedTrap.id);
      ctx.save();
      ctx.globalAlpha = 0.6;
      drawTrap(ctx, selectedTrap, 'saboteur', x - camX, y - camY, now);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ok ? '#5cff8a' : '#ff4a5a';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(Math.round(x - selectedTrap.w / 2 - camX) + 0.5, Math.round(y - selectedTrap.h / 2 - camY) + 0.5, selectedTrap.w, selectedTrap.h);
      ctx.restore();
    }
  }

  /** Metal plates with hazard edges; dim while recharging, outlined for the Saboteur's cursor. */
  function drawTrapPlates(camX: number, camY: number) {
    const sab = !!match?.saboteur;
    if (!sab) return;
    const hover = sab ? trapUnder(mouseX, mouseY) : undefined;
    const now = performance.now();
    for (const t of traps) {
      if (!isPlate(t)) {
        drawExhibitIdle(ctx, t, camX, camY, { now, firedAt: trapFiredAt.get(t.id), ready: trapReady(t.id), jammed: trapJammed(t.id), saboteur: sab, hover: hover === t });
        continue;
      }
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
      if (tripwireArmed.has(t.id)) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#b45cff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 3.5, y - 3.5, s + 7, s + 7);
      }
      ctx.restore();
    }
  }

  /** Red warning flash while arming, then crackling sparks while live; drawn over the lighting. */
  function drawTrapEffects(camX: number, camY: number) {
    const now = performance.now();
    if (match?.saboteur === false || match?.saboteur) checkSpotlights(now); // the Saboteur has no update loop for this
    for (const t of traps) {
      if (!isPlate(t)) {
        drawExhibitEffect(ctx, t, camX, camY, { now, firedAt: trapFiredAt.get(t.id), ready: trapReady(t.id), jammed: trapJammed(t.id), saboteur: !!match?.saboteur, hover: false });
        continue;
      }
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
      const rules = trapRules(t);
      if (phase < rules.armMs) {
        ctx.fillStyle = `rgba(255, 60, 60, ${Math.floor(phase / 100) % 2 ? 0.25 : 0.6})`;
        ctx.fillRect(x - TRAP_RADIUS, y - TRAP_RADIUS, TRAP_RADIUS * 2, TRAP_RADIUS * 2);
      } else if (phase < rules.armMs + rules.activeMs) {
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
    const x = getaway.x * ART_TILE - camX;
    const y = getaway.y * ART_TILE - camY;
    const w = getaway.w * ART_TILE;
    const h = getaway.h * ART_TILE;
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
    const sx = ((getaway.x + getaway.w / 2) * ART_TILE - camX) * scale;
    const sy = ((getaway.y + getaway.h / 2) * ART_TILE - camY) * scale;
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
    const sab = !!match?.saboteur;
    if (!sab && phase !== 'live') return;
    for (const item of interactions.lootables) {
      if (interactions.looted.has(item.id)) continue;
      const pos = item.lootPos ?? { x: ((item.rect[0] + item.rect[2] + 1) / 2) * ART_TILE, y: ((item.rect[1] + item.rect[3] + 1) / 2) * ART_TILE };
      if (!sab && Math.hypot(me.x - pos.x, me.y - pos.y) > ART_TILE * 3) continue;
      const cx = pos.x - camX;
      const cy = pos.y - camY;
      const phase = (frame + item.id.length * 13) % 90;
      if (phase > 30) continue;
      const s = phase < 15 ? phase / 15 : (30 - phase) / 15;
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * s;
      ctx.fillStyle = '#7ceaff';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 6);
      ctx.lineTo(cx + 5, cy);
      ctx.lineTo(cx, cy + 6);
      ctx.lineTo(cx - 5, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#edfcff';
      ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 3, 2, 3);
      ctx.restore();
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
    const inMatch = scene === 'match';
    const tag = (b: Bandit, id: string, name: string, character: CharacterId, bag = false, health = MAX_HP) => {
      const color = CHARACTER_INFO[character].color;
      const sx = (b.x - camX) * scale;
      const sy = (b.y - DRAW_H - (bag ? 15 : 3) - camY) * scale;
      // No role on the tag: who the Saboteur is stays a secret (each player sees only their own role).
      const spotted = inMatch && performance.now() < (spottedUntil.get(id) ?? 0);
      textTag(spotted ? `! ${name} !` : name, sx, sy, spotted ? (frame % 20 < 10 ? '#ff4a4a' : '#fff4e6') : id === myId ? '#ffe39a' : color, size);
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
    const hidden = (id: string) => inMatch && (match?.saboteur ? id === myId : false);
    for (const [id, r] of remotes) if (!hidden(id)) tag(r.bandit, id, r.state.name, r.state.character, inMatch && r.state.carrying, inMatch ? r.state.hp : MAX_HP);
    if (!hidden(myId)) tag(me, myId, myName, myCharacter, inMatch && !!carrying, inMatch ? hp : MAX_HP);
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
