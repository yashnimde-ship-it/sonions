import '@fontsource/press-start-2p';
import { ART_TILE, CHAR_GLOW, CHARACTERS, type CharacterId, characterSheet, HITBOX, ZOOM } from './config';
import { CHARACTER_INFO } from './data/characters';
import { decksOf, isMapId, MAP_IDS, type MapId, MAPS } from './data/maps';
import { inTrapArea, JAM_REACH, MAX_HP, TRAP_RADIUS, trapIsReady, trapPosition, trapRules, type TrapSpot } from './data/traps';
import { drawExhibitEffect, drawExhibitIdle } from './systems/ExhibitTraps';
import { Profile } from './data/profile';
import { type Diamond, distToSpot, type HidingSpot, isHidingSpot, PICKUP_REACH, SEARCH_MS, SEARCH_REACH, spotBox, spotCenter, spotRoom } from './data/diamonds';
import { cleanName } from './data/names';
import { BOOST, FLARE, type HsAbility, distToHideSpot, ESCAPE_MS, ESCAPE_ZONE, FLASHLIGHT_HALF_ANGLE, FLASHLIGHT_RANGE, type GameMode, GUN, HIDE_REACH, HIDER_LIGHT, type HideSpot, hideSpotCenter, hideSpotName, isGameMode, SEEKER_GLOW, SEEKER_HP } from './data/hideSeek';
import { CUSTOM_MIN, CUSTOM_PAD, type Phase, placementRefusal, saboteurMaxEnergy, trapSlots } from './data/round';
import { type PlacedTrap, TRAP_KINDS, type TrapKind, trapKind } from './data/trapKinds';
import { Bandit, DRAW_H } from './entities/Bandit';
import { keyPressed, pollInput, readControls } from './input/Controls';
import { type LobbyJson, LobbyMap } from './map/LobbyMap';
import { type EstateJson, TileMap, type Stairwell } from './map/TileMap';
import { NetClient } from './net/NetClient';
import { type ClientMsg, NET_HZ, type PlayerState, type PortalState, type ServerMsg } from './net/protocol';
import { CameraSystem } from './systems/CameraSystem';
import { InteractionSystem } from './systems/InteractionSystem';
import { AbilitySystem, QUICKSTEP_FRAMES } from './systems/AbilitySystem';
import { LightingSystem } from './systems/LightingSystem';
import { drawTrap } from './systems/TrapArt';
import { setLobbyMusic, setMusicEnabled } from './systems/Music';
import { play as sfx, setSoundEnabled, unlockSound } from './systems/Sound';
import { CRUSHER_WARN_MS, drawFired, type Fired, FX_MS } from './systems/TrapFx';
import { HUD } from './ui/HUD';
import { LobbyUI, type MapInfo, type StartState } from './ui/LobbyUI';
import { Settings } from './ui/Settings';
import { TrapBar } from './ui/TrapBar';
import { ResultScreen } from './ui/ResultScreen';
import { SetupPanel } from './ui/SetupPanel';
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
// A Runner respawns at the map entrance after a short knockout.
const KO_RESPAWN_MS = 1500;
const KO_FRAMES = Math.ceil((KO_RESPAWN_MS / 1000) * 60);
const KO_HP = 50;
const PORTAL_COLORS: Record<number, string> = { 2: '#3ee6d4', 3: '#ffb02e', 4: '#ff4fb0' };
// ---------- This tab's player, across reloads and dropped connections ----------
// The key is per tab (sessionStorage): it survives a reload, and two tabs on one laptop are two
// players. Sent with hello, it lets the server give a dropped player their seat back.
const session = {
  get(name: string) {
    try {
      return sessionStorage.getItem(`bandit-${name}`);
    } catch {
      return null;
    }
  },
  set(name: string, value: string | null) {
    try {
      if (value === null) sessionStorage.removeItem(`bandit-${name}`);
      else sessionStorage.setItem(`bandit-${name}`, value);
    } catch {
      // Storage blocked: a reload starts fresh.
    }
  },
};
function playerKey() {
  let key = session.get('key');
  if (!key || !/^[\w-]{16,64}$/.test(key)) {
    // getRandomValues, not randomUUID: LAN pages (http://10.x...) aren't a secure context.
    key = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    session.set('key', key);
  }
  return key;
}
/** How long the game keeps trying to reconnect (the server holds the seat about as long). */
const RECONNECT_FOR_MS = 30_000;

/** Escapes player-typed text before it goes into HTML. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
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
  /** The game mode I'd like next: a heist, or Hide & Seek. */
  let myMode: GameMode = 'heist';
  try {
    const saved = localStorage.getItem('bandit-mode');
    if (isGameMode(saved)) myMode = saved;
  } catch {
    // Storage blocked: a heist.
  }
  /** The mode of the match I'm in (set as soon as a round starts). */
  let modeNow: GameMode = 'heist';
  /** Hide & Seek: who the Seeker is this round. */
  let seekerNow = '';
  /** The Seeker's gun as the server last told us, and recent shots (flash and tracer). */
  let gun = { ammo: GUN.ammo, reloadEnd: 0, hp: SEEKER_HP };
  // Hide & Seek abilities: when each is ready again (performance.now; Infinity = used up),
  // flares left, and what's running now.
  const hsReady: Record<HsAbility, number> = { flare: 0, scan: 0, boost: 0 };
  let flaresLeft = FLARE.uses;
  let flareUntil = 0;
  let boostUntil = 0;
  let scan = { spots: [] as string[], until: 0 };
  let hsSentAt = 0;
  let lastStage = '';
  const shots: { x0: number; y0: number; x1: number; y1: number; hit: boolean; at: number }[] = [];
  /** Hiders caught or escaped this round (ghosts from then on). */
  const caught = new Set<string>();
  const escaped = new Set<string>();
  const isGhost = (id: string) => caught.has(id) || escaped.has(id);
  /** The hiding place I'm in, if any; sprint noises the Seeker heard; when I last searched. */
  let hiddenIn: string | null = null;
  const noises: { x: number; y: number; at: number }[] = [];
  let lastSeek = 0;
  /** This deck's hiding places (Hide & Seek only). */
  const hidePlaces = (): HideSpot[] => (hideSeek() ? estateData.hiding ?? [] : []);
  const seekerId = () => seekerNow;
  /** Hide & Seek: is this round one? (The Saboteur is then the Seeker, with a body and a gun.) */
  const hideSeek = () => modeNow === 'hideSeek';
  try {
    const saved = localStorage.getItem('bandit-map');
    if (isMapId(saved)) myMap = saved;
  } catch {
    // Storage blocked: the estate.
  }
  const createInteractables = () => estateData.interactables;
  let estate = new TileMap(estateData, worlds.estate.tiles, worlds.estate.doors);
  let interactions = new InteractionSystem(createInteractables(), estateData.doors);
  let lighting = new LightingSystem(estate);
  /**
   * The cruise ship's decks are separate maps in one heist: the deck I'm on, each deck's map
   * (so its doors keep their state while I'm elsewhere), and every hiding spot on the ship
   * with the deck it's on. Other maps have a single deck, the map itself.
   */
  let deckId: MapId = 'estate';
  let deckMaps = new Map<MapId, TileMap>();
  let allSpots: HidingSpot[] = [];
  const spotDecks = new Map<string, MapId>();
  /** Is something on this deck (things without one are on the heist's map)? */
  const here = (deck: string | undefined) => (deck ?? mapId) === deckId;
  const multiDeck = () => decksOf(mapId).length > 1;
  const deckShort = (id: MapId) => (id.startsWith('cruise-') ? id.slice(7).toUpperCase() : '');

  const camera = new CameraSystem(lobbyMap.widthPx, lobbyMap.heightPx);
  const hud = new HUD();
  const title = new TitleUI();
  const settings = new Settings();
  const profile = new Profile();
  const lobby = new LobbyUI(MAP_IDS.map((id) => mapInfo(id, worlds[id].data)), settings);
  const net = new NetClient();
  const abilities = new AbilitySystem();
  const trapBar = new TrapBar((kind) => selectTrap(selectedTrap?.id === kind.id ? null : kind));
  const setupPanel = new SetupPanel(() => net.send({ t: 'ready' }));
  const resultScreen = new ResultScreen(() => net.send({ t: 'leave' }));

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const hudEl = document.getElementById('hud')!;
  // The Saboteur clicks to place the selected trap (right-click picks one up), or, with none
  // selected, to fire a trap plate.
  const toWorld = (e: PointerEvent | MouseEvent): [number, number] => [(e.clientX * dpr) / scale + camera.x, (e.clientY * dpr) / scale + camera.y];
  canvas.addEventListener('pointermove', (e) => ([mouseX, mouseY] = toWorld(e)));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (scene === 'match' && hideSeek()) {
      // The Seeker's gun: click where to shoot.
      if (match?.saboteur && phase === 'live' && e.button === 0 && !result) {
        const [x, y] = toWorld(e);
        if (performance.now() < gun.reloadEnd || gun.ammo <= 0) sfx('click');
        else net.send({ t: 'shoot', x, y });
      }
      return;
    }
    if (scene !== 'match' || !match?.saboteur) return;
    const [x, y] = toWorld(e);
    if (phase === 'setup' && e.button === 2) {
      if (selectedTrap) return selectTrap(null);
      const hit = placedUnder(x, y);
      if (hit) {
        placed.delete(hit.id);
        net.send({ t: 'unplace', id: hit.id });
        updateTrapBar();
        return;
      }
      // Right-click a hiding spot: take its diamond back out.
      const spot = spotUnder(x, y);
      const d = spot && diamondIn(spot.id);
      if (d) net.send({ t: 'hideDiamond', id: d.id, spot: null });
      return;
    }
    if (phase === 'setup') {
      if (selectedTrap) return placeTrap(selectedTrap, x, y);
      return hideAt(x, y);
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
  const reconnectEl = document.getElementById('reconnecting')!;
  /** Another tab took over this player: don't fight it by reconnecting. */
  let replaced = false;
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
  /** The party size last told to the server, so it hears when we step on or off a pad. */
  let sentPortal: number | null = null;
  let flashUntil = 0;
  let viewX = 0;
  let viewY = 0;
  /** The heist you're in; `saboteur` is whether *you* are it (nobody is told who else is). */
  let match: { id: string; size: number; saboteur: boolean; mode: GameMode } | null = null;
  let bannerUntil = 0;
  let serverFull = false;
  /** The diamonds as the server tells us (the Saboteur sees where each is hidden). */
  let spots: HidingSpot[] = [];
  let diamonds: Diamond[] = [];
  const searched = new Set<string>();
  let glints = new Set<string>();
  let bankedN = 0;
  let needN = 0;
  let totalN = 0;
  /** The furniture I'm searching (holding E), and since when. */
  let searching: { spot: string; since: number } | null = null;
  /** Little animations: a diamond dropping into furniture, popping out, an empty search. */
  const fx: { kind: 'hide' | 'found' | 'empty'; x: number; y: number; at: number }[] = [];
  let lastBank = 0;
  /** Placed traps going off right now (everyone draws them), and the ones Runners now know about. */
  const firing: Fired[] = [];
  const revealed = new Set<string>();
  /** What traps are doing to me: until when (performance.now ms). */
  let slowUntil = 0;
  let reverseUntil = 0;
  let blackoutUntil = 0;
  /** A crusher I set off: if I'm still under it when it slams, it hurts. */
  const crushers: { x: number; y: number; at: number }[] = [];
  let lastTickSec = 0;
  /** Which round of the match this is. */
  let roundNo = 1;
  let roundsTotal = 1;
  /** The end of the heist, once the server says who won. */
  let result: Extract<ServerMsg, { t: 'result' }> | null = null;
  /** The diamond in my hands, if any. */
  const myDiamond = () => diamonds.find((d) => d.place.at === 'carried' && d.place.by === myId);
  const diamondIn = (spotId: string) => diamonds.find((d) => d.place.at === 'spot' && d.place.spot === spotId);
  let trapEnergy = 0;
  let maxTrapEnergy = 0;
  /** My health (Runners only), and when each trap plate last fired (performance.now ms). */
  let hp = MAX_HP;
  let knockedOut = false;
  let respawnAt = 0;
  const trapFiredAt = new Map<string, number>();
  const trapHits = new Set<string>();
  /**
   * The minimap flash: when anyone is caught, a small round map of where it happened shows at
   * the top left for MINIMAP_MS, then goes. Nothing stays marked, so Runners have to remember.
   */
  let trapFlash: { x: number; y: number; deck: MapId; trap: string; area: string; at: number } | null = null;
  const MINIMAP_MS = 4000;
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
  let impactStarted = 0;
  let impactUntil = 0;
  let impactColor = '#ff4557';
  let impactShake = 0;
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
    else if (phase === 'over' && result) {
      // The reveal: everyone sees the whole map, with every diamond's spot marked.
      scale = fitScale();
      [tx, ty] = [w / 2, h / 2];
    } else if (match?.saboteur && !hideSeek()) {
      sabScale = sabScale && Math.min(ZOOM * dpr, Math.max(fitScale(), sabScale));
      scale = sabScale || fitScale();
      [tx, ty] = [freeX, freeY];
    } else if (phase === 'setup' && !hideSeek()) {
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
    setLobbyMusic(scene === 'lobby');
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
    myName = cleanName(session.get('name') ?? title.name, `Bandit${Math.floor(100 + Math.random() * 900)}`);
    session.set('name', myName);
    session.set('playing', '1');
    setCharacter(myCharacter);
    sayHello();
  }

  function sayHello() {
    net.send({ t: 'hello', name: myName, character: myCharacter, key: playerKey() });
  }

  /** The connection dropped by accident: keep trying for a while, the server is holding our seat. */
  let reconnecting = false;
  async function reconnect() {
    if (reconnecting) return;
    reconnecting = true;
    reconnectEl.hidden = false;
    const giveUp = performance.now() + RECONNECT_FOR_MS;
    while (performance.now() < giveUp && scene !== 'title') {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        await net.connect();
        sayHello();
        break;
      } catch {
        // Not back yet; try again.
      }
    }
    reconnecting = false;
    reconnectEl.hidden = true;
    if (!net.connected && scene !== 'title') lobby.showDisconnected();
  }

  function addRemote(p: PlayerState) {
    remotes.set(p.id, { state: p, bandit: new Bandit(sheets[p.character], p.x, p.y, p.facing) });
  }

  /** Switches to a deck of the heist: its map, doors, traps, furniture and getaway. */
  function useDeck(id: MapId) {
    deckId = id;
    estateData = worlds[id].data;
    estate = deckMaps.get(id) ?? new TileMap(estateData, worlds[id].tiles, worlds[id].doors);
    deckMaps.set(id, estate);
    interactions = new InteractionSystem(createInteractables(), estateData.doors);
    lighting = new LightingSystem(estate);
    traps = MAPS[id].traps;
    getaway = MAPS[id].getaway;
    abilities.traps = traps;
    // No diamonds in Hide & Seek: no furniture to search.
    spots = hideSeek() ? [] : estateData.interactables.filter(isHidingSpot);
    // Players on the other decks drop out of view until we meet again.
    remotes.clear();
  }

  /** Takes a stairwell to another deck: I arrive at the stairs it leads to over there. */
  function takeStairs(stair: Stairwell) {
    const target = stair.to.deck as MapId;
    const arrival = worlds[target].data.stairs?.find((st) => st.id === stair.to.arrive);
    const [ax, ay] = arrival?.arrive ?? [worlds[target].data.spawn.x, worlds[target].data.spawn.y];
    useDeck(target);
    me.x = ax * ART_TILE;
    me.y = ay * ART_TILE;
    me.facing = 'down';
    net.send({ t: 'deck', deck: target, x: me.x, y: me.y });
    frameCamera(true);
    toast(`${MAPS[target].name}`);
  }

  function startMatch(msg: Extract<ServerMsg, { t: 'match' }>) {
    modeNow = msg.mode ?? 'heist';
    seekerNow = msg.seeker ?? '';
    if (!msg.resume) {
      gun = { ammo: GUN.ammo, reloadEnd: 0, hp: SEEKER_HP };
      Object.assign(hsReady, { flare: 0, scan: 0, boost: 0 });
      flaresLeft = FLARE.uses;
      flareUntil = boostUntil = 0;
      scan = { spots: [], until: 0 };
      shots.length = 0;
      caught.clear();
      escaped.clear();
      hiddenIn = null;
      noises.length = 0;
    }
    mapId = msg.map ?? 'estate';
    deckMaps = new Map(decksOf(mapId).map((d) => [d, new TileMap(worlds[d].data, worlds[d].tiles, worlds[d].doors)]));
    allSpots = [];
    spotDecks.clear();
    for (const d of decksOf(mapId))
      for (const sp of worlds[d].data.interactables.filter(isHidingSpot)) {
        allSpots.push(sp);
        spotDecks.set(sp.id, d);
      }
    useDeck(msg.deck && decksOf(mapId).includes(msg.deck) ? msg.deck : mapId);
    diamonds = [];
    searched.clear();
    glints = new Set();
    bankedN = needN = totalN = 0;
    searching = null;
    fx.length = 0;
    firing.length = 0;
    revealed.clear();
    crushers.length = 0;
    slowUntil = reverseUntil = blackoutUntil = 0;
    impactStarted = impactUntil = impactShake = 0;
    me.rootFrames = me.slipFrames = 0;
    result = null;
    resultScreen.hide();
    spottedUntil.clear();
    dazzledUntil = 0;
    lighting = new LightingSystem(estate);
    hp = MAX_HP;
    knockedOut = false;
    respawnAt = 0;
    me.stunFrames = 0;
    trapFiredAt.clear();
    trapHits.clear();
    trapJammedUntil.clear();
    tripwireArmed.clear();
    doorJammedUntil.clear();
    match = { id: msg.matchId, size: msg.size, saboteur: msg.role === 'saboteur', mode: msg.mode ?? 'heist' };
    roundNo = msg.round;
    roundsTotal = msg.rounds;
    maxTrapEnergy = msg.maxEnergy ?? saboteurMaxEnergy(myCharacter, msg.size);
    trapEnergy = msg.energy ?? maxTrapEnergy;
    placed.clear();
    selectTrap(null);
    phase = msg.phase;
    phaseEndsAt = performance.now() + msg.ms;
    trapBar.show(msg.role === 'saboteur' && phase === 'setup' && !hideSeek());
    setupPanel.show(msg.role === 'saboteur' && phase === 'setup' && !hideSeek());
    trapBar.setEnergy(trapEnergy, maxTrapEnergy);
    updateTrapBar();
    sabScale = 0;
    lastTrapCheck = 0;
    hud.setHealth(msg.role === 'saboteur' && msg.mode !== 'hideSeek' ? null : hp);
    hud.setCarrying(null);
    hud.hideMessage();
    profile.recordHeist();
    lobby.setMe(myName, myCharacter, profile);
    remotes.clear();
    for (const p of msg.players) {
      if (p.id !== myId) {
        if (here(p.deck)) addRemote(p);
        continue;
      }
      me.x = p.x;
      me.y = p.y;
      me.facing = p.facing;
      freeX = p.x;
      freeY = p.y;
      // The server's word on who I'm playing (after a reload this tab hasn't heard it yet).
      if (p.character !== myCharacter) setCharacter(p.character);
    }
    abilities.setRound(myCharacter, msg.role);
    const hs = hideSeek();
    // The Seeker has no Saboteur ability in Hide & Seek: their gun is their tool.
    // Abilities are heist tools (traps, diamonds): Hide & Seek plays without them.
    document.getElementById('ability')!.style.display = hs ? 'none' : '';
    const help = document.querySelector<HTMLElement>('#hud .help');
    if (help) help.textContent = hs ? (msg.role === 'saboteur' ? 'WASD move · Click shoot · R reload · Q Flare · C Heartbeat · E search · Esc safehouse' : 'WASD move · Shift sprint · E hide · Q Boost · Esc safehouse') : 'WASD move · Shift sprint · E action · Q ability · Esc safehouse';
    const role = hs
      ? msg.role === 'saboteur' ? '<b class="saboteur">THE SEEKER</b>' : '<b class="runner">A HIDER</b>'
      : msg.role === 'saboteur' ? '<b class="saboteur">THE SABOTEUR</b>' : '<b class="runner">A RUNNER</b>';
    const job = hs
      ? msg.role === 'saboteur'
        ? 'Count to 30 in the Staff Room while they hide. Then hunt them in the dark: aim with the mouse, click to shoot.'
        : 'The lights are out and the owner has a gun. Hide! Survive the hunt; at the end the main entrance opens.'
      : msg.role === 'saboteur'
        ? `Hide the diamonds and place up to ${trapSlots(msg.size)} traps. Confirm when your setup is ready.`
        : 'The Saboteur is rigging the house. Get ready to go in.';
    banner.innerHTML = `<span class="kicker">ROUND ${msg.round} OF ${msg.rounds} · ${hs ? 'HIDE &amp; SEEK · ' : ''}${MAPS[mapId].name}</span><span>You are ${role}</span><span class="crew-list">${job}</span>`;
    banner.hidden = false;
    bannerUntil = performance.now() + BANNER_MS;
    setScene('match');
  }

  net.onMessage = (msg) => {
    switch (msg.t) {
      case 'welcome':
        myId = msg.id;
        break;
      case 'replaced':
        // The same player opened in another tab; that one plays now.
        replaced = true;
        break;
      case 'resync':
        // What changed while we were away.
        for (const d of msg.doors)
          for (const m of deckMaps.size ? deckMaps.values() : [estate]) {
            const door = m.data.doors.find((x) => x.id === d.id);
            if (door) m.setDoor(door, d.open);
          }
        for (const t of msg.placed) {
          placed.set(t.id, t);
          // A Runner is only told about traps that have gone off (and Fake Loot).
          if (!match?.saboteur) revealed.add(t.id);
        }
        updateTrapBar();
        break;
      case 'lobby':
        match = null;
        sentPortal = null;
        result = null;
        resultScreen.hide();
        remotes.clear();
        setCharacter(msg.character);
        me.x = msg.x;
        me.y = msg.y;
        me.facing = 'down';
        title.setBusy(false);
        setScene('lobby');
        const help = document.querySelector<HTMLElement>('#hud .help');
        if (help) help.textContent = 'WASD move · Shift sprint · E action · Q ability · Esc safehouse';
        // The server forgets nothing between heists, but tell it again after (re)joining.
        lobby.setMap(myMap);
        net.send({ t: 'map', map: myMap });
        lobby.setMode(myMode);
        net.send({ t: 'mode', mode: myMode });
        modeNow = 'heist';
        break;
      case 'match':
        if (msg.resume && match?.id === msg.matchId) {
          // Back after a short drop with the game still open: just catch up on the clock.
          phase = msg.phase;
          phaseEndsAt = performance.now() + msg.ms;
          if (msg.energy !== undefined) trapEnergy = msg.energy;
          trapBar.setEnergy(trapEnergy, maxTrapEnergy);
          break;
        }
        startMatch(msg);
        if (msg.resume) {
          // After a reload: our health is what the server last heard; the rest is in this tab.
          const mine = msg.players.find((p) => p.id === myId);
          if (mine && !match?.saboteur) {
            hp = mine.hp;
            hud.setHealth(hp);
          }
          banner.hidden = true;
        }
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
          if (p.id === myId || (msg.room === 'match' && !here(p.deck))) continue;
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
        for (const m of deckMaps.size ? deckMaps.values() : [estate]) {
          const door = m.data.doors.find((d) => d.id === msg.id);
          if (door) m.setDoor(door, msg.open);
        }
        break;
      }
      case 'doorLocked':
        doorJammedUntil.set(msg.id, performance.now() + msg.ms);
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
      case 'diamonds': {
        // Diamonds that just went into furniture get a little drop-in animation.
        const before = new Map(diamonds.map((d) => [d.id, d.place.at === 'spot' ? d.place.spot : null]));
        diamonds = msg.items;
        for (const d of diamonds) {
          if (d.place.at !== 'spot' || before.get(d.id) === d.place.spot) continue;
          const spot = spots.find((x) => x.id === (d.place as { spot: string }).spot);
          if (spot && scene === 'match') {
            fx.push({ kind: 'hide', ...spotCenter(spot), at: performance.now() });
            if (match?.saboteur) sfx('hide');
          }
        }
        searched.clear();
        for (const id of msg.searched) searched.add(id);
        bankedN = msg.banked;
        needN = msg.need;
        totalN = msg.total;
        if (!myDiamond()) hud.setCarrying(null);
        break;
      }
      case 'glints':
        glints = new Set(msg.spots);
        break;
      case 'searchResult': {
        const spot = spots.find((x) => x.id === msg.spot);
        if (spot) fx.push({ kind: msg.found ? 'found' : 'empty', ...spotCenter(spot), at: performance.now() });
        if (msg.found) hud.setCarrying('CARRYING A DIAMOND · TAKE IT TO THE GETAWAY');
        else toast(`Nothing in the ${spot?.name ?? 'furniture'}`);
        sfx(msg.found ? 'found' : 'empty');
        break;
      }
      case 'diamondEvent': {
        const who = msg.id === myId ? 'You' : esc(msg.name);
        const what = msg.kind === 'found' ? 'found a diamond' : msg.kind === 'banked' ? `banked a diamond · ${bankedN}/${needN}` : 'dropped a diamond';
        if (msg.kind === 'banked') sfx('banked');
        else if (msg.kind === 'dropped') sfx('dropped');
        else if (msg.id !== myId) sfx('alert');
        hud.alert(`<span class="who">${who}</span> <b>${what}</b><span class="where">${esc(msg.area)}</span>`, msg.kind === 'dropped' ? 'danger' : 'good');
        break;
      }
      case 'result': {
        result = msg;
        diamonds = msg.diamonds;
        for (const t of msg.placed) placed.set(t.id, t);
        resultScreen.show(msg, myId, !!match?.saboteur);
        if (msg.winner !== 'none') sfx((msg.winner === 'saboteur') === !!match?.saboteur ? 'win' : 'lose');
        frameCamera(true);
        break;
      }
      case 'final':
        resultScreen.showFinal(msg, myId);
        sfx(msg.standings[0]?.id === myId ? 'win' : 'alert');
        break;
      case 'phase':
        phase = msg.phase;
        phaseEndsAt = performance.now() + msg.ms;
        selectTrap(null);
        trapBar.show(false);
        setupPanel.show(false);
        searching = null;
        if (phase === 'live') {
          banner.innerHTML = `<span class="kicker">SETUP OVER</span><span>THE HEIST IS ON</span><span class="crew-list">${match?.saboteur ? 'Watch them. Your traps guard the diamonds.' : `Search the furniture (hold E), find the diamonds, bank ${needN || 'them'} at the GETAWAY.`}</span>`;
          banner.hidden = false;
          bannerUntil = performance.now() + BANNER_MS;
        }
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
      case 'trapAlert': {
        const who = msg.id === myId ? 'You' : esc(msg.name);
        const deckNote = multiDeck() && msg.deck !== deckId ? ` \u00b7 ${deckShort(msg.deck)}` : '';
        hud.alert(`<span class="who">${who}</span> got caught by a <b>${esc(msg.trap)}</b><span class="where">${esc(msg.area)}${deckNote}</span>`);
        trapFlash = { x: msg.x, y: msg.y, deck: msg.deck, trap: msg.trap, area: msg.area, at: performance.now() };
        break;
      }
      case 'placedTrapHit':
        applyPlacedTrapHit(msg.kind, msg.damage, msg.stunMs, msg.knockback);
        break;
      case 'trapReveal':
        placed.set(msg.trap.id, msg.trap);
        revealed.add(msg.trap.id);
        break;
      case 'trapFired':
        trapFired(msg);
        break;
      case 'gunshot':
        shots.push({ x0: msg.x0, y0: msg.y0, x1: msg.x1, y1: msg.y1, hit: !!msg.hit, at: performance.now() });
        sfx('gunshot');
        break;
      case 'gun': {
        const wasReloading = performance.now() < gun.reloadEnd;
        const previousHp = gun.hp;
        gun = { ammo: msg.ammo, reloadEnd: performance.now() + msg.reloadMs, hp: msg.hp };
        if (msg.reloadMs > 0 && !wasReloading) sfx('reload');
        if (match?.saboteur) {
          hud.setHealth(gun.hp);
          if (gun.hp < previousHp) sfx('hurt');
        }
        break;
      }
      case 'shot':
        // The Seeker got me.
        hp = msg.hp;
        hud.setHealth(hp);
        trapImpact('#ff3b4a', 7);
        sfx('hurt');
        trapNotice = hp > 0 ? `SHOT! ${hp} HP left: one more and you're caught` : 'CAUGHT!';
        trapNoticeUntil = performance.now() + 2500;
        break;
      case 'hidden':
        hiddenIn = msg.spot;
        sfx(msg.spot ? 'hideIn' : 'hideOut');
        me.x = msg.x;
        me.y = msg.y;
        if (!msg.spot) toast('Out of hiding');
        break;
      case 'searched': {
        const name = hideSpotName(msg.spot);
        sfx(msg.found ? 'caught' : 'empty');
        hud.alert(msg.found ? `<span class="who">The Seeker</span> <b>found ${msg.found === myId ? 'you' : esc(msg.name)}</b><span class="where">in the ${esc(name)}</span>` : `<span class="who">The Seeker</span> searched the ${esc(name)}<span class="where">nobody there</span>`, msg.found ? 'danger' : 'good');
        break;
      }
      case 'escaped': {
        escaped.add(msg.id);
        hiddenIn = msg.id === myId ? null : hiddenIn;
        sfx('banked');
        const who = msg.id === myId ? 'You' : esc(msg.name);
        hud.alert(`<span class="who">${who}</span> <b>escaped the ship!</b><span class="where">${msg.left} hider${msg.left === 1 ? '' : 's'} left</span>`, 'good');
        break;
      }
      case 'noise':
        noises.push({ x: msg.x, y: msg.y, at: performance.now() });
        sfx('footstep');
        break;
      case 'hsAbility':
        hsReady[msg.ability] = msg.readyMs < 0 ? Infinity : performance.now() + msg.readyMs;
        if (msg.left !== undefined) flaresLeft = msg.left;
        if (msg.ability === 'boost') {
          boostUntil = performance.now() + BOOST.ms;
          toast('Boost!');
        }
        if (msg.ability === 'boost') sfx('boost');
        break;
      case 'flare':
        flareUntil = performance.now() + msg.ms;
        sfx('flare');
        if (!match?.saboteur) hud.alert('<span class="who">The Seeker</span> <b>fired a flare!</b><span class="where">run or hide</span>', 'danger');
        break;
      case 'scanned':
        sfx('heartbeat');
        if (msg.you) hud.alert('<span class="who">You</span> <b>were scanned!</b><span class="where">the Seeker knows someone is here</span>', 'danger');
        else {
          scan = { spots: msg.spots, until: performance.now() + msg.ms };
          toast(msg.spots.length ? `Heartbeat: ${msg.spots.length} hiding place${msg.spots.length === 1 ? '' : 's'} nearby` : 'Heartbeat: nobody hiding nearby');
        }
        break;
      case 'caught': {
        caught.add(msg.id);
        if (msg.id === myId) hiddenIn = null;
        sfx('caught');
        const who = msg.id === myId ? 'You were' : `${esc(msg.name)} was`;
        hud.alert(`<span class="who">${who}</span> <b>caught by the Seeker</b><span class="where">${msg.left} hider${msg.left === 1 ? '' : 's'} left</span>`);
        break;
      }
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
        if (!msg.id) {
          abilities.resolveTrapJam(false);
          toast('No traps in reach');
          break;
        }
        abilities.resolveTrapJam(true);
        if (msg.trap) {
          // Trap Jam found a trap we couldn't see.
          placed.set(msg.trap.id, msg.trap);
          revealed.add(msg.trap.id);
        }
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
    if (scene === 'title' || serverFull) return;
    if (replaced) lobby.showDisconnected('You opened this player in another tab, so this one stopped. Reconnect to play here instead.');
    else void reconnect();
  };

  title.onPlay = play;
  // A reload while playing goes straight back in: the server still holds this tab's seat.
  if (session.get('playing')) void play();
  // The server confirms (or refuses) the pick with a 'character' message.
  lobby.onPick = (id) => net.send({ t: 'character', character: id });
  lobby.onLoadout = () => lobby.openPicker(myCharacter);
  lobby.setPadSizes(lobbyData.portals.map((p) => p.size).filter((size) => size !== CUSTOM_PAD));
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
  lobby.onMode = (mode) => {
    myMode = mode;
    try {
      localStorage.setItem('bandit-mode', mode);
    } catch {
      // Not remembered; still applies now.
    }
    net.send({ t: 'mode', mode });
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
    session.set('playing', null);
    setScene('title');
    net.disconnect();
    remotes.clear();
    portals = [];
    online = 0;
    title.setBusy(false);
  };
  setSoundEnabled(settings.values.sound);
  setMusicEnabled(settings.values.music);
  // Web Audio must be started during a real user gesture; most game sounds arrive later via WS.
  window.addEventListener('pointerdown', unlockSound, { once: true });
  window.addEventListener('keydown', unlockSound, { once: true });
  settings.onChange(() => {
    setSoundEnabled(settings.values.sound);
    if (settings.values.sound) unlockSound();
    setMusicEnabled(settings.values.music);
    frameCamera(true);
  });

  /** The party size you're standing in, if any. */
  function myPortal(): number | null {
    const pad = lobbyData.portals.find((p) => LobbyMap.inside(p, me.x, me.y));
    return pad ? padSize(pad) : null;
  }

  /** The CUSTOM pad (the map's 4-player pad) is whatever size you picked; the others are fixed. */
  const padSize = (p: { size: number }) => (p.size === CUSTOM_PAD ? lobby.customSize : p.size);
  const padFor = (size: number) => lobbyData.portals.find((q) => q.size === (size >= CUSTOM_MIN ? CUSTOM_PAD : size));

  /**
   * Picking a portal (click, or a row in the Heist Lobby panel): step into its next free
   * seat. Picking the one you're in steps you back out. The server counts whoever stands
   * in a portal, so this is the same as walking in.
   */
  function joinPortal(size: number) {
    if (scene !== 'lobby' || lobby.panelOpen) return;
    const p = padFor(size);
    if (!p) return;
    if (myPortal() === size) {
      me.x = (p.x + p.w / 2) * ART_TILE;
      me.y = (p.y - 0.9) * ART_TILE;
      me.facing = 'up';
      net.send({ t: 'portal', size: null });
    } else {
      if (size >= CUSTOM_MIN) lobby.customSize = size;
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
    const p = lobbyData.portals.find((q) => LobbyMap.inside({ x: q.x, y: q.y - 1.1, w: q.w, h: q.h + 1.1 }, wx, wy));
    return p ? padSize(p) : null;
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
    Object.assign(window, { game: { me, remotes, net, lobbyMap, abilities, get estate() { return estate; }, get scene() { return scene; }, get portals() { return portals; }, get view() { return { x: viewX, y: viewY, scale, dpr }; }, lobby, settings, profile, placed, get phase() { return phase; }, get mapId() { return mapId; }, get hp() { return hp; }, get diamonds() { return diamonds; }, get result() { return result; }, get spottedUntil() { return spottedUntil; }, interactionsRef: () => interactions, get deckId() { return deckId; }, deckMaps: () => deckMaps } }); // for playtests

  // ---------- Update ----------

  const nearWardrobe = () => LobbyMap.inside(lobbyData.wardrobe, me.x, me.y);

  /** About NET_HZ times a second; the server relays it to everyone in the same room. */
  function sendPosition() {
    if (++sendTimer < 60 / NET_HZ) return;
    sendTimer = 0;

    net.send({ t: 'move', room: scene === 'match' ? 'match' : 'lobby', x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, facing: me.facing, moving: me.moving, sprint: lastSprint, carrying: !!myDiamond(), hp, stunned: me.stunned });
  }

  /** Everything an ability may need, gathered fresh when Q is pressed. */
  function abilityContext() {
    // Everyone else; the Saboteur (whoever it is) never loses HP, so First Aid never picks them.
    const crew = [...remotes.entries()]
      .map(([id, r]) => ({ id, x: r.bandit.x, y: r.bandit.y, hp: r.state.hp }));
    // A placed trap under the cursor counts as a target too (Trap Refresh).
    const placedTarget = placedUnder(mouseX, mouseY);
    const targetTrap = trapUnder(mouseX, mouseY);
    const tripOpen = !estate.boxBlocked(mouseX - 10, mouseY - 8, mouseX + 10, mouseY + 8);
    const targetDoor = estateData.doors.find((door) => mouseX >= door.x && mouseX <= door.x + door.w && mouseY >= door.y && mouseY <= door.y + door.h);
    const placedFiredAt = placedTarget ? trapFiredAt.get(placedTarget.id) : undefined;
    const placedReady = placedTarget
      ? trapIsReady(placedFiredAt, performance.now(), abilities.overclockWindow) && !(placedTarget.kind === 'laser' && placedFiredAt !== undefined && performance.now() < placedFiredAt + FX_MS.laser)
      : undefined;
    return {
      me,
      send: (m: ClientMsg) => net.send(m),
      hp,
      setHp: healMe,
      crew,
      targetTrapId: placedTarget?.id ?? targetTrap?.id,
      targetTrapReady: placedTarget ? placedReady : targetTrap ? trapIsReady(trapFiredAt.get(targetTrap.id), performance.now(), abilities.overclockWindow, trapRules(targetTrap)) : undefined,
      targetTrapJammed: placedTarget ? trapJammed(placedTarget.id) : targetTrap ? trapJammed(targetTrap.id) : undefined,
      targetDoorId: targetDoor?.id,
      targetPoint: { x: Math.round(mouseX), y: Math.round(mouseY), open: tripOpen },
    };
  }

  /** Back to full health (First Aid); also gets a knocked-out Runner straight back up. */
  function healMe(to = MAX_HP) {
    hp = to;
    if (knockedOut) {
      knockedOut = false;
      respawnAt = 0;
      me.stunFrames = 0;
    }
    hud.setHealth(hp);
  }

  // ---------- Traps ----------

  function selectTrap(kind: TrapKind | null) {
    selectedTrap = kind;
    trapBar.select(kind?.id ?? null);
  }

  // ---------- Diamonds ----------

  /** The hiding spot under (x, y) (a little padding so small furniture is easy to click). */
  function spotUnder(x: number, y: number) {
    return spots.find((sp) => distToSpot(sp, x, y) <= 3);
  }

  const roomOf = (sp: HidingSpot) => {
    const data = worlds[spotDecks.get(sp.id) ?? deckId].data;
    return spotRoom(sp, data.areas, data.width);
  };
  const roomKeyOf = (sp: HidingSpot) => `${spotDecks.get(sp.id) ?? deckId}:${roomOf(sp)}`;
  /** Diamonds already hidden in the same room as this spot (on its deck). */
  const hiddenInRoom = (spot: HidingSpot) =>
    diamonds.filter((d) => {
      if (d.place.at !== 'spot') return false;
      const sp = allSpots.find((x) => x.id === (d.place as { spot: string }).spot);
      return !!sp && roomKeyOf(sp) === roomKeyOf(spot);
    }).length;

  /** Setup: click furniture to hide the next diamond in it. */
  function hideAt(x: number, y: number) {
    const spot = spotUnder(x, y);
    if (!spot) return toast('Click a piece of furniture (gold outline) to hide a diamond in it');
    if (diamondIn(spot.id)) return toast(`The ${spot.name} already holds a diamond. Right-click to take it out.`);
    const next = diamonds.find((d) => d.place.at === 'tray');
    if (!next) return toast('All diamonds are hidden. Right-click one to move it.');
    if (hiddenInRoom(spot) >= 2) return toast(`${roomOf(spot)} already has 2 diamonds. Spread them out.`);
    net.send({ t: 'hideDiamond', id: next.id, spot: spot.id });
  }

  /** Fake Loot chests, as Runners see them: one more thing to search. */
  const decoys = (): HidingSpot[] =>
    [...placed.values()]
      .filter((t) => t.kind === 'fakeLoot' && here(t.deck))
      .map((t) => ({ id: t.id, name: 'treasure chest', rect: [Math.floor((t.x - 12) / ART_TILE), Math.floor((t.y - 10) / ART_TILE), Math.floor((t.x + 11) / ART_TILE), Math.floor((t.y + 9) / ART_TILE)] as [number, number, number, number] }));

  /** A trap close enough to a hidden diamond guards it. */
  const guarded = (spot: HidingSpot) => [...placed.values()].some((t) => (t.deck ?? mapId) === (spotDecks.get(spot.id) ?? mapId) && distToSpot(spot, t.x, t.y) <= 40);

  const placedKinds = () => [...placed.values()].map((t) => t.kind);

  function updateTrapBar() {
    trapBar.setCounts(placedKinds(), match?.size ?? 2);
    trapBar.setEnergy(trapEnergy, maxTrapEnergy);
  }

  /** Map traps' names for the trap-hit pop-up. */
  const SPOT_NAMES: Record<string, string> = { plate: 'Shock Plate', skeleton: 'Falling Skeleton', painting: 'Swinging Painting', rolling: 'Rolling Stand', sarcophagus: 'Sarcophagus' };

  /** Tell the crew I got caught: the server turns it into a pop-up for everyone. */
  function reportHit(trap: string) {
    net.send({ t: 'trapHit', trap, area: estate.areaAt(me.x, me.y - 4) || 'the house', x: Math.round(me.x), y: Math.round(me.y) });
  }

  /** Damage and a stun; at 0 HP you're knocked out (and the server takes your diamond). */
  function hurt(damage: number, stunMs: number) {
    hp = Math.max(0, hp - damage);
    if (stunMs > 0) me.stun(Math.round((stunMs / 1000) * 60));
    if (hp === 0) {
      beginKnockout();
    }
    hud.setHealth(hp);
  }

  function beginKnockout() {
    knockedOut = true;
    respawnAt = performance.now() + KO_RESPAWN_MS;
    me.stun(KO_FRAMES);
  }

  function respawnRunner() {
    const { spawn } = estateData;
    me.respawn(spawn.x * ART_TILE, spawn.y * ART_TILE, spawn.facing);
    freeX = me.x;
    freeY = me.y;
    hp = KO_HP;
    knockedOut = false;
    respawnAt = 0;
    hud.setHealth(hp);
    toast('Respawned at the entrance · dropped diamonds stay behind');
  }

  /** Short camera thump and colored edge flash make a trap hit read without hiding play. */
  function trapImpact(color: string, shake = 3, duration = 260) {
    impactStarted = performance.now();
    if (impactStarted >= impactUntil) impactShake = 0;
    impactUntil = impactStarted + duration;
    impactColor = color;
    impactShake = Math.max(impactShake, shake);
  }

  /** I set off a placed trap: what it does to me, by kind. */
  function applyPlacedTrapHit(kind: PlacedTrap['kind'], damage: number, stunMs: number, knockback?: { x: number; y: number }) {
    if (!match || match.saboteur) return;
    const now = performance.now();
    const hitColors: Record<PlacedTrap['kind'], string> = {
      shock: '#8fe8ff', spring: '#ffd25a', snare: '#e0bd75', glue: '#ffbd4a', oil: '#67d8ff', crusher: '#ff515d',
      laser: '#ff5264', boulder: '#c0c4d0', magnet: '#55f4ee', gas: '#c379ff', blackout: '#a783ff', fakeLoot: '#ff9a38',
    };
    trapImpact(hitColors[kind], damage >= 30 || kind === 'crusher' || kind === 'spring' ? 6 : 3.5);
    hurt(damage, stunMs);
    let effect = '';
    switch (kind) {
      case 'spring':
        // Thrown through the air, 4 tiles on.
        if (knockback) me.launch(knockback.x - me.x, knockback.y - me.y, Math.hypot(knockback.x - me.x, knockback.y - me.y), 26);
        effect = 'launched!';
        break;
      case 'boulder':
        if (knockback) me.shove(knockback.x - me.x, knockback.y - me.y, Math.hypot(knockback.x - me.x, knockback.y - me.y), 14);
        break;
      case 'snare':
        me.rootFrames = 150;
        effect = "caught: can't move for 2.5s";
        break;
      case 'glue':
        slowUntil = now + 5000;
        effect = 'stuck: 40% speed for 5s';
        break;
      case 'oil':
        me.slipFrames = 300;
        effect = 'slipping: no grip for 5s';
        break;
      case 'crusher':
        effect = 'GET OUT FROM UNDER IT!';
        break;
    }
    const name = trapKind(kind)?.name ?? 'Trap';
    reportHit(name);
    trapNotice = `${name}${damage ? ` · ${damage} damage` : ''}${stunMs >= 1000 ? ` · ${stunMs / 1000}s stun` : ''}${effect ? ` · ${effect}` : ''}`;
    trapNoticeUntil = now + 2500;
  }

  /** Resolve a placed-trap event. Only its victim and the Saboteur see the trap itself. */
  function trapFired(msg: Extract<ServerMsg, { t: 'trapFired' }>) {
    const now = performance.now();
    const seesTrap = !!match?.saboteur || msg.victim === myId;
    if (seesTrap) {
      firing.push({ id: msg.id, kind: msg.kind, x: msg.x, y: msg.y, at: now });
      trapFiredAt.set(msg.id, now);
      revealed.add(msg.id);
      if (!placed.has(msg.id)) placed.set(msg.id, { id: msg.id, kind: msg.kind, x: msg.x, y: msg.y });
    }
    // The Saboteur hears every trap; only the Saboteur and its victim hear this one clearly.
    if (match?.saboteur || msg.victim === myId) sfx(msg.kind);
    if (!match || match.saboteur || phase !== 'live') return;
    const d = Math.hypot(me.x - msg.x, me.y - msg.y);
    if (msg.kind === 'crusher' && msg.victim === myId) crushers.push({ x: msg.x, y: msg.y, at: now + CRUSHER_WARN_MS });
    if (msg.kind === 'magnet' && d <= 64 && d > 6) me.shove(msg.x - me.x, msg.y - me.y, d - 6, 60);
    if (msg.kind === 'gas' && d <= 44) {
      trapImpact('#b45cff', 3);
      reverseUntil = now + 4000;
      trapNotice = 'Confusion Gas · your controls are reversed for 4s';
      trapNoticeUntil = now + 2500;
    }
    if (msg.kind === 'blackout' && estate.areaAt(msg.x, msg.y) === estate.areaAt(me.x, me.y - 4)) {
      trapImpact('#9b6cff', 3.5);
      blackoutUntil = now + 6000;
      trapNotice = 'Blackout · the lights are out in here';
      trapNoticeUntil = now + 2500;
    }
  }

  /** The crusher slams: still under it means 50 damage and a 3s stun. */
  function checkCrushers(now: number) {
    for (let i = crushers.length - 1; i >= 0; i--) {
      const c = crushers[i];
      if (now < c.at) continue;
      crushers.splice(i, 1);
      if (Math.abs(me.x - c.x) <= 16 && Math.abs(me.y - c.y) <= 16) {
        trapImpact('#ff4b58', 7);
        hurt(50, 3000);
        trapNotice = 'Crusher · 50 damage · 3s stun';
        trapNoticeUntil = now + 2500;
      }
    }
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
    const refused = placementRefusal(placedKinds(), kind.id, match?.size ?? 2) ?? (canPlace(kind, x, y) ? null : 'It needs open floor');
    if (refused) return toast(refused);
    const trap: PlacedTrap = { id: `${myId}-${++placedCount}`, kind: kind.id, x, y, ...(multiDeck() ? { deck: deckId } : {}) };
    placed.set(trap.id, trap);
    trapEnergy -= kind.cost;
    net.send({ t: 'place', trap });
    updateTrapBar();
  }

  /** The placed trap under (x, y), topmost first. */
  function placedUnder(x: number, y: number) {
    return [...placed.values()]
      .filter((t) => here(t.deck))
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
    if (knockedOut) return;
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
      trapImpact(r.damage > 0 ? '#ff5264' : '#a783ff', r.damage >= 25 ? 5 : 3);
      reportHit(SPOT_NAMES[t.kind ?? 'plate'] ?? 'Trap');
      sfx(isPlate(t) ? 'shock' : 'boulder');
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
        beginKnockout();
        break;
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
      // Until you pick a size yourself, the CUSTOM pad shows the busiest custom party waiting,
      // so walking in joins them.
      const onCustom = lobbyData.portals.some((p) => p.size === CUSTOM_PAD && LobbyMap.inside(p, me.x, me.y));
      if (!onCustom && !lobby.customPicked) {
        const busiest = portals.filter((p) => p.size >= CUSTOM_MIN && p.count > 0).sort((a, b) => b.count - a.count)[0];
        if (busiest) lobby.customSize = busiest.size;
      }
      // Tell the server which party we're standing in (the CUSTOM pad's size is ours to pick).
      const mine = myPortal();
      if (mine !== sentPortal) {
        sentPortal = mine;
        net.send({ t: 'portal', size: mine });
      }
      lobby.setPortals(portals, online, mine);
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
    const stage = hideSeek() ? (phase === 'setup' ? 'HIDE' : left <= ESCAPE_MS ? 'ESCAPE' : 'HUNT') : phase === 'setup' ? 'SETUP' : 'HEIST';
    hud.setTimer(phase === 'over' ? null : `R${roundNo}/${roundsTotal} · ${stage}`, left);
    // Hide & Seek: a cue when the hunt starts and when the main entrance opens.
    if (hideSeek() && phase !== 'over' && stage !== lastStage) {
      if (stage === 'HUNT' && lastStage === 'HIDE') sfx('huntStart');
      if (stage === 'ESCAPE' && lastStage) {
        sfx('gateOpen');
        hud.alert(`<span class="who">The main entrance</span> <b>is open!</b><span class="where">${match?.saboteur ? 'stop them escaping' : 'get to the gangway'}</span>`, 'good');
      }
      lastStage = stage;
    }
    if (phase === 'over') lastStage = '';
    // A tick each second for the last ten.
    const secs = Math.ceil(left / 1000);
    if (phase === 'live' && secs <= 10 && secs > 0 && secs !== lastTickSec) sfx('tick');
    lastTickSec = secs;
    resultScreen.tick();
    updateObjective();
    const sab = !!match?.saboteur;
    const hs = hideSeek();
    if (hs && sab && phase === 'live' && keyPressed('KeyR')) net.send({ t: 'reload' });
    // A finished reload: the gun is full again (the server agrees on its next shot).
    if (hs && sab && gun.ammo === 0 && gun.reloadEnd && performance.now() >= gun.reloadEnd) gun = { ...gun, ammo: GUN.ammo, reloadEnd: 0 };
    if (input.ability && !hud.messageOpen && phase === 'live' && !hs) abilities.use(abilityContext());
    // Hide & Seek abilities: Seeker Q flare, C heartbeat scan; Hider Q boost (the server checks).
    if (hs && phase === 'live' && !hud.messageOpen && !isGhost(myId) && performance.now() - hsSentAt > 300) {
      const want: HsAbility | null = keyPressed('KeyQ') ? (sab ? 'flare' : hiddenIn ? null : 'boost') : sab && keyPressed('KeyC') ? 'scan' : null;
      if (want && performance.now() >= hsReady[want]) {
        hsSentAt = performance.now();
        net.send({ t: 'hsAbility', ability: want });
      }
    }
    renderHsBar(hs && phase !== 'over' && !isGhost(myId), sab);
    abilities.render();
    if (sab && !hs) {
      saboteurUpdate(input);
      sendPosition();
      frameCamera(false);
      return;
    }
    // Heist: Runners wait outside during setup. Hide & Seek: the Hiders scatter while the
    // Seeker counts. Everyone stops when time's up.
    if (hs ? phase === 'over' || (sab && phase === 'setup') : phase !== 'live') {
      hud.setArea(areaName(me.x, me.y - 4));
      // Runners wait outside during setup, and stop when time's up.
      me.update({ dx: 0, dy: 0, sprint: false }, estate);
      hud.setPrompt(null);
      sendPosition();
      frameCamera(false);
      return;
    }
    if (knockedOut) {
      if (performance.now() >= respawnAt) respawnRunner();
      else {
        me.update({ dx: 0, dy: 0, sprint: false }, estate);
        sendPosition();
        frameCamera(false);
        return;
      }
    }
    if (hud.messageOpen) {
      if (input.action) hud.hideMessage();
      me.update({ dx: 0, dy: 0, sprint: false }, estate);
    } else {
      const now = performance.now();
      me.carryMult = (now < boostUntil ? BOOST.speed : 1) * (myDiamond() ? 1 - CARRY_SLOW * (abilities.has('steadyCarry') ? 0.5 : 1) : 1) * (now < dazzledUntil ? 0.5 : 1) * (now < slowUntil ? 0.4 : 1);
      // Confusion Gas: left is right and up is down.
      // (In a hiding place you can't move.)
      const move = hiddenIn ? { ...input, dx: 0, dy: 0, sprint: false } : input;
      me.update(now < reverseUntil ? { ...move, dx: -move.dx, dy: -move.dy } : move, estate);
      checkCrushers(now);
      checkTraps();
      checkSpotlights(performance.now());
      if (!hideSeek() || !hideSeekControls(input)) runnerDiamonds(input);
    }
    hud.setArea(areaName(me.x, me.y - 4));
    sendPosition();
    frameCamera(false);
  }

  /** The objective panel, top left: one gem per diamond, and what this side has to do. */
  function updateObjective() {
    if (hideSeek()) {
      const sab = !!match?.saboteur;
      const escape = phase === 'live' && phaseEndsAt - performance.now() <= ESCAPE_MS;
      hud.setObjective(
        sab ? 'FIND THEM' : 'HIDE',
        [],
        isGhost(myId)
          ? escaped.has(myId) ? 'You got away! Watch the rest of the hunt' : "Caught. You're a ghost now: watch the hunt"
          : hiddenIn
            ? `Hidden in the ${hideSpotName(hiddenIn)}. Stay still.`
            : phase === 'setup'
          ? sab ? 'Counting in the Staff Room...' : 'Find a hiding place (E at a wardrobe, the bar, the curtains...)'
          : escape
            ? sab ? 'The main entrance is open: stop them escaping' : 'The main entrance is open: escape!'
            : sab ? 'Hunt them down in the dark' : 'Stay out of the flashlight. Q: Boost to get away (it makes noise)',
      );
      if (sab && phase === 'live') {
        const reloading = performance.now() < gun.reloadEnd;
        hud.setObjective('FIND THEM', [], reloading ? 'RELOADING...' : `AMMO ${'|'.repeat(gun.ammo)}${'.'.repeat(GUN.ammo - gun.ammo)}  ·  click shoot · R reload · Q Flare · C Heartbeat · a miss costs ${GUN.missPenalty} HP`);
      }
      return;
    }
    const mine = myDiamond();
    const order = { banked: 0, mine: 1, carried: 2, floor: 3, hidden: 4 } as const;
    const gems = diamonds
      .map((d) => (d.place.at === 'banked' ? 'banked' : d.place.at === 'carried' ? (d === mine ? 'mine' : 'carried') : d.place.at === 'floor' ? 'floor' : 'hidden') as keyof typeof order)
      .sort((a, b) => order[a] - order[b]);
    const sab = !!match?.saboteur;
    const text =
      phase === 'setup'
        ? sab
          ? `Hide all ${totalN}, then guard them with traps`
          : `The Saboteur is hiding ${totalN} diamonds...`
        : sab
          ? `Stop them banking ${needN} · ${bankedN}/${needN} banked`
          : `Bank ${needN} of ${totalN} at the GETAWAY · ${bankedN}/${needN}`;
    hud.setObjective(sab ? 'GUARD THE DIAMONDS' : 'FIND THE DIAMONDS', gems, text);
  }

  /** Runners: open doors, search furniture (hold E), pick up dropped diamonds, bank at the getaway. */
  function runnerDiamonds(input: { action: boolean; actionHeld: boolean }) {
    const now = performance.now();
    const holding = myDiamond();
    if (holding && LobbyMap.inside(getaway, me.x, me.y) && now - lastBank > 500) {
      lastBank = now;
      net.send({ t: 'bank' });
    }
    const near = interactions.nearby(me);
    let door = near?.kind === 'door' ? near.door : null;
    if (me.bumped && !door) door = interactions.blockingDoor(me, estate, HITBOX);
    // Walking into a closed door pushes it open, so nobody stops dead in a doorway.
    if (me.bumped && door && !estate.isOpen(door) && !door.keypad) {
      estate.setDoor(door, true);
      net.send({ t: 'door', id: door.id, open: true });
    }
    // A dropped diamond on the floor nearby: press E to grab it.
    const dropped = holding ? undefined : diamonds.find((d) => d.place.at === 'floor' && here(d.place.deck) && Math.hypot(d.place.x - me.x, d.place.y - me.y) <= PICKUP_REACH);
    // The nearest piece of furniture in reach (a Fake Loot chest looks just like one).
    let spot: HidingSpot | null = null;
    let best = SEARCH_REACH;
    for (const sp of [...spots, ...decoys()]) {
      const d = distToSpot(sp, me.x, me.y - 4);
      if (d <= best) [spot, best] = [sp, d];
    }
    // Furniture right beside a door: E goes to whichever is closer.
    if (door && spot) {
      const dd = Math.hypot(Math.max(door.x - me.x, 0, me.x - (door.x + door.w)), Math.max(door.y - me.y, 0, me.y - (door.y + door.h)));
      if (best < dd) door = null;
    }
    let prompt: string | null = null;
    // A stairwell to another deck. Decks are separate maps and travel between them isn't
    // built yet, so it says where it goes instead of moving anyone.
    const stair = door ? undefined : estateData.stairs?.find((st) => {
      const [x0, y0, x1, y1] = st.zone.map((v) => v * ART_TILE);
      return me.x >= x0 - 6 && me.x <= x1 + 6 && me.y >= y0 - 6 && me.y <= y1 + 6;
    });
    if (stair) {
      const connected = isMapId(stair.to.deck) && decksOf(mapId).includes(stair.to.deck);
      prompt = connected ? `E  Take the ${stair.name}` : `E  Climb the ${stair.name}`;
      if (input.action) {
        if (connected) takeStairs(stair);
        else hud.showMessage(stairMessage(stair.to.deck));
      }
    } else if (door) {
      const lockLeft = Math.max(0, (doorJammedUntil.get(door.id) ?? 0) - now);
      prompt = lockLeft ? `LOCKED ${Math.ceil(lockLeft / 1000)}s` : near?.kind === 'door' && near.door.id === door.id
        ? interactions.promptFor(near, estate)
        : `E  ${estate.isOpen(door) ? 'Close' : 'Open'} ${door.name}`;
      if (input.action && !lockLeft) {
        const refused = interactions.toggleDoor(door, estate, me, HITBOX);
        if (refused) hud.showMessage(refused);
        else {
          net.send({ t: 'door', id: door.id, open: estate.isOpen(door) });
          if (door.keypad && estate.isOpen(door)) toast(`Keypad cracked: the ${door.name} slides open`);
        }
      }
    } else if (dropped) {
      prompt = 'E  Grab the dropped diamond';
      if (input.action) net.send({ t: 'pickup', id: dropped.id });
    } else if (spot) {
      if (holding) prompt = 'Hands full: bank your diamond at the GETAWAY';
      else if (searched.has(spot.id)) prompt = `${spot.name}: already searched, empty`;
      else {
        prompt = `Hold E  Search the ${spot.name}`;
        // Holding E on the same furniture, standing still, for SEARCH_MS searches it.
        if (input.actionHeld && !me.stunned) {
          if (searching?.spot !== spot.id) searching = { spot: spot.id, since: now };
          else if (now - searching.since >= SEARCH_MS) {
            net.send({ t: 'search', spot: spot.id });
            searching = null;
          }
          prompt = `Searching the ${spot.name}...`;
        }
      }
    }
    if (!input.actionHeld || me.moving || !spot || searching?.spot !== spot.id) searching = null;
    hud.setPrompt(now < trapNoticeUntil ? trapNotice : now < toastUntil ? hud.promptText : prompt);
  }

  /** The area under (x, y) for the HUD; on the ship, with the deck in front. */
  function areaName(x: number, y: number) {
    const area = estate.areaAt(x, y);
    return multiDeck() ? `${deckShort(deckId)} \u00b7 ${area}` : area;
  }

  /** What a stairwell to a deck that isn't part of this heist says. */
  function stairMessage(deck: string) {
    if (deck === 'cruise-f2') return 'Top Deck (F2) is coming soon.';
    const def = isMapId(deck) ? MAPS[deck] : null;
    return def ? `These stairs lead to ${def.name}. Travel between decks isn't connected yet: pick it in Map Info to play that deck.` : 'These stairs are closed.';
  }

  /**
   * Hide & Seek's own E: a Hider hides in (or comes out of) a hiding place; the Seeker searches
   * one. Ghosts just watch. Returns true when it handled this frame (no doors or stairs then).
   */
  function hideSeekControls(input: { action: boolean }): boolean {
    const now = performance.now();
    if (isGhost(myId)) {
      hud.setPrompt(now < trapNoticeUntil ? trapNotice : escaped.has(myId) ? 'You escaped! Watch the rest of the hunt' : "You're a ghost: watch the rest of the hunt");
      return true;
    }
    const seeker = !!match?.saboteur;
    if (hiddenIn) {
      hud.setPrompt(now < trapNoticeUntil ? trapNotice : `Hidden in the ${hideSpotName(hiddenIn)} · E to come out (bullets still find you)`);
      if (input.action) net.send({ t: 'unhide' });
      return true;
    }
    let best: HideSpot | null = null;
    let bestD = HIDE_REACH;
    for (const sp of hidePlaces()) {
      const d = distToHideSpot(sp, me.x, me.y - 4);
      if (d <= bestD) [best, bestD] = [sp, d];
    }
    if (!best || (seeker && phase !== 'live')) return false;
    const name = hideSpotName(best.id);
    hud.setPrompt(now < trapNoticeUntil ? trapNotice : seeker ? `E  Search the ${name}` : `E  Hide in the ${name}`);
    if (input.action) {
      if (seeker && now - lastSeek > 600) {
        lastSeek = now;
        net.send({ t: 'seekSpot', spot: best.id });
      } else if (!seeker) net.send({ t: 'hideIn', spot: best.id });
    }
    return true;
  }

  /** The Saboteur isn't in the house: they fly a camera round it and pick traps. */
  function saboteurUpdate(input: { dx: number; dy: number; sprint: boolean }) {
    if (phase === 'setup' && !hud.messageOpen) for (const kind of TRAP_KINDS) if (keyPressed(kind.key)) selectTrap(selectedTrap?.id === kind.id ? null : kind);
    if (trapBar.visible && performance.now() - lastIconPaint > 120) {
      lastIconPaint = performance.now();
      trapBar.paintIcons(lastIconPaint);
    }
    if (multiDeck() && keyPressed('KeyF')) {
      const decks = decksOf(mapId);
      const next = decks[(decks.indexOf(deckId) + 1) % decks.length];
      useDeck(next);
      freeX = Math.min(freeX, estate.widthPx);
      freeY = Math.min(freeY, estate.heightPx);
      net.send({ t: 'deck', deck: next, x: freeX, y: freeY });
      frameCamera(true);
      toast(`Watching ${MAPS[next].name}  (F: other deck)`);
    }
    const speed = ((input.sprint ? 12 : 6) * dpr) / scale;
    freeX = Math.min(estate.widthPx, Math.max(0, freeX + input.dx * speed * 2));
    freeY = Math.min(estate.heightPx, Math.max(0, freeY + input.dy * speed * 2));
    hud.setArea(areaName(freeX, freeY));
    if (performance.now() > toastUntil) hud.setPrompt(null);
    if (phase === 'setup') {
      const hiddenSpots = allSpots.filter((sp) => diamondIn(sp.id));
      setupPanel.update({ hidden: hiddenSpots.length, total: totalN, traps: placed.size, slots: trapSlots(match?.size ?? 2), guarded: hiddenSpots.filter(guarded).length, selected: null });
    }
  }

  // ---------- Draw ----------

  let frame = 0;
  /** Hide & Seek's ghosts this frame (drawn see-through). */
  let ghostsToDraw: Bandit[] = [];
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
    const inHouse = (id: string) => scene !== 'match' || hideSeek() || (match?.saboteur ? id !== myId : true);
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

    const impactProgress = impactUntil > performance.now() ? (performance.now() - impactStarted) / (impactUntil - impactStarted) : 1;
    const shake = impactProgress < 1 ? impactShake * dpr * (1 - impactProgress) ** 2 : 0;
    ctx.save();
    ctx.translate(Math.sin(frame * 2.7) * shake, Math.cos(frame * 3.4) * shake * 0.7);
    // Hide & Seek: whoever's hiding isn't drawn; ghosts are see-through (drawn separately).
    if (hideSeek()) {
      const hiddenMe = hiddenIn ? me : null;
      const ghostBandits = new Set([...(isGhost(myId) ? [me] : []), ...[...remotes.entries()].filter(([id]) => isGhost(id)).map(([, r]) => r.bandit)]);
      for (let i = actors.length - 1; i >= 0; i--) if (actors[i] === hiddenMe || ghostBandits.has(actors[i])) actors.splice(i, 1);
      ghostsToDraw = [...ghostBandits];
    } else ghostsToDraw = [];
    blit(estate.below, estate.widthPx, estate.heightPx);
    ctx.save();
    ctx.scale(scale, scale);
    drawGetaway(camX, camY);
    drawPlacedTraps(camX, camY);
    drawTrapPlates(camX, camY);
    actors.forEach((b) => b.draw(ctx, camX, camY));
    ctx.globalAlpha = 0.4;
    ghostsToDraw.forEach((b) => b.draw(ctx, camX, camY, false));
    ctx.globalAlpha = 1;
    if (hiddenIn) {
      // My hiding place: a small eye, so I know where I am.
      const sp = hidePlaces().find((h) => h.id === hiddenIn);
      if (sp) {
        const c = hideSpotCenter(sp);
        ctx.fillStyle = '#e8fffa';
        ctx.fillRect(Math.round(c.x - 4 - camX), Math.round(c.y - 2 - camY), 8, 4);
        ctx.fillStyle = '#1ad0c0';
        ctx.fillRect(Math.round(c.x - 1 - camX), Math.round(c.y - 2 - camY), 3, 4);
      }
    }
    ctx.restore();
    blit(estate.above, estate.widthPx, estate.heightPx);
    if (settings.values.lighting) lighting.draw(ctx, camX, camY, vw, vh, scale);
    // Characters again over the darkness, so players can always see each other (not in
    // Hide & Seek: there, the dark is the point).
    ctx.save();
    ctx.scale(scale, scale);
    ctx.globalAlpha = CHAR_GLOW;
    if (!hideSeek()) actors.forEach((b) => b.draw(ctx, camX, camY, false));
    ctx.globalAlpha = 1;
    drawTrapEffects(camX, camY);
    drawFiring(camX, camY);
    drawSpots(camX, camY);
    drawFloorDiamonds(camX, camY);
    drawDiamondFx(camX, camY);
    if (myDiamond()) carriedGem(me, camX, camY);
    for (const r of remotes.values()) if (r.state.carrying) carriedGem(r.bandit, camX, camY);
    ctx.restore();
    drawGetawayLabel(camX, camY);
    if (hideSeek() && !result && !isGhost(myId)) drawDarkness(camX, camY);
    if (hideSeek() && !result) drawHideSeekMarks(camX, camY);
    if (settings.values.nameTags && !result) drawNameTags(camX, camY);
    drawTrapMinimap();
    if (phase === 'setup' && !match?.saboteur && !hideSeek()) drawBlueprint(camX, camY);
    if (match?.saboteur && !result) drawTrapMarkers(camX, camY);
    if (match?.saboteur && phase === 'setup') drawSpotLabel(camX, camY);
    if (performance.now() < blackoutUntil && !match?.saboteur) drawBlackout(camX, camY);
    if (!result && impactProgress < 1) drawImpactOverlay(impactProgress);
    if (result) drawReveal(camX, camY);
    ctx.restore();
  }

  /** A soft colored vignette fades with the camera shake; the canvas world stays readable. */
  function drawImpactOverlay(progress: number) {
    const rgb = impactColor.match(/[\da-f]{2}/gi)?.slice(0, 3).map((part) => parseInt(part, 16)) ?? [255, 69, 87];
    const alpha = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI) * 0.2;
    const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.18, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.72);
    grad.addColorStop(0, `rgba(${rgb.join(',')},0)`);
    grad.addColorStop(1, `rgba(${rgb.join(',')},${alpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /** Placed traps going off: each kind has its own animation, seen by everyone. */
  function drawFiring(camX: number, camY: number) {
    const now = performance.now();
    for (let i = firing.length - 1; i >= 0; i--) {
      const f = firing[i];
      if (trapJammed(f.id) || now - f.at > FX_MS[f.kind]) firing.splice(i, 1);
      else drawFired(ctx, f, camX, camY, now);
    }
  }

  /** Blackout: the room goes dark; you only see a small circle around yourself. */
  function drawBlackout(camX: number, camY: number) {
    const left = blackoutUntil - performance.now();
    const sx = (me.x - camX) * scale;
    const sy = (me.y - 18 - camY) * scale;
    const r = 34 * scale;
    ctx.save();
    const grad = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(4,2,10,${Math.min(0.96, left / 400)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  /** The Saboteur's own traps, outlined in their card colour so they're easy to find zoomed out. */
  function drawTrapMarkers(camX: number, camY: number) {
    ctx.save();
    ctx.lineWidth = 2 * dpr;
    for (const t of placed.values()) {
      const k = trapKind(t.kind);
      if (!k || !here(t.deck)) continue;
      ctx.strokeStyle = k.color;
      ctx.globalAlpha = 0.85;
      ctx.strokeRect(Math.round((t.x - k.w / 2 - camX) * scale), Math.round((t.y - k.h / 2 - camY) * scale), Math.round(k.w * scale), Math.round(k.h * scale));
    }
    ctx.restore();
  }

  /** Hide & Seek's dark, drawn as its own layer so lights can be cut out of it. */
  const dark = document.createElement('canvas');
  const darkCtx = dark.getContext('2d')!;

  /**
   * Hide & Seek: the ship is pitch black. A Hider sees a small circle round themselves; the
   * Seeker a flashlight cone towards the mouse (and a little glow at their feet). While the
   * Seeker counts, their screen is black.
   */
  function drawDarkness(camX: number, camY: number) {
    if (dark.width !== canvas.width || dark.height !== canvas.height) {
      dark.width = canvas.width;
      dark.height = canvas.height;
    }
    const g = darkCtx;
    const seeker = !!match?.saboteur;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, dark.width, dark.height);
    g.fillStyle = 'rgba(2, 2, 8, 0.97)';
    g.fillRect(0, 0, dark.width, dark.height);
    const counting = seeker && phase === 'setup';
    // A flare: the whole deck flashes bright, then fades back to dark.
    const flare = (flareUntil - performance.now()) / FLARE.ms;
    if (!counting && flare > 0) {
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = `rgba(0,0,0,${Math.min(0.9, flare * 1.4)})`;
      g.fillRect(0, 0, dark.width, dark.height);
    }
    if (!counting) {
      g.globalCompositeOperation = 'destination-out';
      const sx = (me.x - camX) * scale;
      const sy = (me.y - 14 - camY) * scale;
      // Light stops at walls, closed doors and furniture: rays from my eyes out to `range`.
      const ox = me.x;
      const oy = me.y - 14;
      const lit = (range: number, from: number, to: number, rays: number, soft: number) => {
        const r = range * scale;
        const grad = g.createRadialGradient(sx, sy, r * soft, sx, sy, r);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.beginPath();
        if (to - from < Math.PI * 2) g.moveTo(sx, sy);
        for (let i = 0; i <= rays; i++) {
          const a = from + ((to - from) * i) / rays;
          const dx = Math.cos(a);
          const dy = Math.sin(a);
          // Out of whatever I'm standing against first, then on until the next wall.
          let d = 2;
          let out = false;
          while (d < range) {
            const solid = estate.solidAt(ox + dx * d, oy + dy * d);
            if (!solid) out = true;
            else if (out || d > 24) break;
            d += 3;
          }
          // A little past the wall's face, so the wall itself is lit.
          d = Math.min(range, d + 4);
          const px = sx + dx * d * scale;
          const py = sy + dy * d * scale;
          if (i === 0 && to - from >= Math.PI * 2) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.fill();
      };
      if (seeker) {
        // The flashlight: a cone towards the mouse, and a little glow round my feet.
        const angle = Math.atan2(mouseY - oy, mouseX - ox);
        lit(FLASHLIGHT_RANGE, angle - FLASHLIGHT_HALF_ANGLE, angle + FLASHLIGHT_HALF_ANGLE, 72, 0.6);
        lit(SEEKER_GLOW, 0, Math.PI * 2, 32, 0.3);
      } else {
        lit(HIDER_LIGHT, 0, Math.PI * 2, 64, 0.35);
      }
    }
    // Muzzle flashes light up the shooter (and where the shot landed) for a moment.
    const now = performance.now();
    g.globalCompositeOperation = 'destination-out';
    for (const sh of shots) {
      const t = (now - sh.at) / 260;
      if (t >= 1) continue;
      for (const [x, y, r] of [[sh.x0, sh.y0, 70], [sh.x1, sh.y1, 26]] as const) {
        const px = (x - camX) * scale;
        const py = (y - camY) * scale;
        const grad = g.createRadialGradient(px, py, 0, px, py, r * scale);
        grad.addColorStop(0, `rgba(0,0,0,${1 - t})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(px - r * scale, py - r * scale, r * 2 * scale, r * 2 * scale);
      }
    }
    ctx.drawImage(dark, 0, 0);
    drawShots(camX, camY);
    if (counting) {
      // The Seeker's count, big in the middle of a black screen.
      const n = Math.max(0, Math.ceil((phaseEndsAt - performance.now()) / 1000));
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffe39a';
      ctx.font = `${Math.round(40 * dpr)}px "Press Start 2P"`;
      ctx.fillText(String(n), canvas.width / 2, canvas.height / 2);
      ctx.fillStyle = '#9a94b0';
      ctx.font = `${Math.round(9 * dpr)}px "Press Start 2P"`;
      ctx.fillText('COUNTING... THE HIDERS ARE HIDING', canvas.width / 2, canvas.height / 2 + 40 * dpr);
      ctx.restore();
    }
  }

  /** The Hide & Seek ability bar: key, name and cooldown for each of my abilities. */
  const hsBar = document.createElement('div');
  hsBar.id = 'hs-abilities';
  hsBar.hidden = true;
  document.getElementById('hud')!.append(hsBar);
  let hsBarHtml = '';
  function renderHsBar(show: boolean, seeker: boolean) {
    hsBar.hidden = !show;
    if (!show) return;
    const now = performance.now();
    const slot = (key: string, name: string, a: HsAbility, extra = '') => {
      const wait = hsReady[a] - now;
      const state = a === 'boost' && now < boostUntil ? 'ACTIVE' : wait === Infinity ? 'USED UP' : wait > 0 ? `${Math.ceil(wait / 1000)}s` : 'READY';
      return `<div class="hs-slot${state === 'READY' || state === 'ACTIVE' ? ' ready' : ''}"><b>${key}</b><span>${name}</span><em>${state}${extra}</em></div>`;
    };
    const html = seeker ? slot('Q', 'Flare', 'flare', ` · ${flaresLeft} left`) + slot('C', 'Heartbeat', 'scan') : slot('Q', 'Boost', 'boost');
    if (html !== hsBarHtml) hsBar.innerHTML = hsBarHtml = html;
  }

  /** Hide & Seek over the dark: the Seeker sees noise rings; everyone sees the open exit. */
  function drawHideSeekMarks(camX: number, camY: number) {
    const now = performance.now();
    for (let i = noises.length - 1; i >= 0; i--) {
      const n = noises[i];
      const t = (now - n.at) / 700;
      if (t >= 1) {
        noises.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = 0.8 * (1 - t);
      ctx.strokeStyle = '#ffe39a';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc((n.x - camX) * scale, (n.y - 6 - camY) * scale, (6 + t * 22) * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // The Seeker's heartbeat scan: occupied hiding places near them pulse red.
    if (now < scan.until) {
      for (const sp of estate.data.hiding ?? []) {
        if (!scan.spots.includes(sp.id)) continue;
        const [x0, y0, x1, y1] = sp.box.map((v) => v * ART_TILE);
        ctx.save();
        ctx.globalAlpha = 0.45 + 0.35 * Math.sin(now / 90);
        ctx.strokeStyle = '#ff4d6a';
        ctx.fillStyle = 'rgba(255, 77, 106, 0.25)';
        ctx.lineWidth = 2 * dpr;
        ctx.fillRect((x0 - camX) * scale, (y0 - camY) * scale, (x1 - x0) * scale, (y1 - y0) * scale);
        ctx.strokeRect((x0 - camX) * scale, (y0 - camY) * scale, (x1 - x0) * scale, (y1 - y0) * scale);
        ctx.restore();
      }
    }
    // The gangway glows green once the main entrance is open.
    if (phase === 'live' && phaseEndsAt - now <= ESCAPE_MS && deckId === mapId) {
      const z = ESCAPE_ZONE;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(frame / 8);
      ctx.fillStyle = '#6fe07a';
      ctx.fillRect((z.x * ART_TILE - camX) * scale, (z.y * ART_TILE - camY) * scale, z.w * ART_TILE * scale, z.h * ART_TILE * scale);
      ctx.restore();
      textTag('ESCAPE', ((z.x + z.w / 2) * ART_TILE - camX) * scale, (z.y * ART_TILE - camY) * scale, '#6fe07a', Math.round(9 * dpr));
    }
    // Ghost: a purple tint, so it's clear you're only watching.
    if (isGhost(myId)) {
      ctx.save();
      ctx.fillStyle = 'rgba(90, 50, 160, 0.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
  }

  /** Bullet tracers and the flash at the muzzle. */
  function drawShots(camX: number, camY: number) {
    const now = performance.now();
    for (let i = shots.length - 1; i >= 0; i--) {
      const sh = shots[i];
      const t = (now - sh.at) / 220;
      if (t >= 1) {
        if (now - sh.at > 400) shots.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#fff2b0';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo((sh.x0 - camX) * scale, (sh.y0 - camY) * scale);
      ctx.lineTo((sh.x1 - camX) * scale, (sh.y1 - camY) * scale);
      ctx.stroke();
      ctx.fillStyle = sh.hit ? '#ff3b4a' : '#ffd25a';
      ctx.beginPath();
      ctx.arc((sh.x1 - camX) * scale, (sh.y1 - camY) * scale, (sh.hit ? 7 : 4) * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
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
    const now = performance.now();
    ctx.imageSmoothingEnabled = false;
    // Runners only see a trap once it has gone off (and Fake Loot, which is meant to be seen).
    const visible = (t: PlacedTrap) => sab || !!result || (phase !== 'setup' && (revealed.has(t.id) || t.kind === 'fakeLoot'));
    for (const t of [...placed.values()].sort((a, b) => a.y - b.y)) {
      const kind = trapKind(t.kind);
      if (!kind || !visible(t) || !here(t.deck)) continue;
      ctx.save();
      if (!sab && !result && t.kind !== 'fakeLoot') ctx.globalAlpha = 0.85;
      drawTrap(ctx, kind, sab || result ? 'saboteur' : 'runner', t.x - camX, t.y - camY, now);
      if (trapJammed(t.id)) {
        // Jammed (Trap Jam): a blue lock-out over it.
        ctx.globalAlpha = 0.45 + 0.15 * Math.sin(frame / 6);
        ctx.fillStyle = '#5098ff';
        ctx.fillRect(Math.round(t.x - kind.w / 2 - camX), Math.round(t.y - kind.h / 2 - camY), kind.w, kind.h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#9fd0ff';
        ctx.strokeRect(Math.round(t.x - kind.w / 2 - camX) + 0.5, Math.round(t.y - kind.h / 2 - camY) + 0.5, kind.w - 1, kind.h - 1);
      }
      ctx.restore();
    }
    if (sab && selectedTrap && phase === 'setup') {
      // A ghost under the cursor: green where it fits, red where it doesn't.
      const x = snap(mouseX);
      const y = snap(mouseY);
      const ok = canPlace(selectedTrap, x, y) && !placementRefusal(placedKinds(), selectedTrap.id, match?.size ?? 2);
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
    if (hideSeek()) return; // no getaway in Hide & Seek (the escape is the main entrance)
    const x = getaway.x * ART_TILE - camX;
    const y = getaway.y * ART_TILE - camY;
    const w = getaway.w * ART_TILE;
    const h = getaway.h * ART_TILE;
    ctx.save();
    ctx.fillStyle = '#6fe07a';
    ctx.globalAlpha = myDiamond() ? 0.22 + 0.15 * Math.sin(frame / 8) : 0.12;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#6fe07a';
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  function drawGetawayLabel(camX: number, camY: number) {
    if (hideSeek()) return;
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

  /** A pixel diamond centred on (x, y), art px; `r` is its half-height. */
  function gem(x: number, y: number, r: number, body = '#7ceaff', alpha = 1) {
    x = Math.round(x);
    y = Math.round(y);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#0e1630';
    ctx.beginPath();
    ctx.moveTo(x, y - r - 1);
    ctx.lineTo(x + r + 1, y - r * 0.2);
    ctx.lineTo(x, y + r + 1);
    ctx.lineTo(x - r - 1, y - r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y - r * 0.2);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y - r * 0.2);
    ctx.closePath();
    ctx.fill();
    // Facets: a light crown, a white glint.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y - r * 0.2);
    ctx.lineTo(x - r, y - r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - Math.ceil(r / 3), y - Math.ceil(r * 0.7), Math.max(1, Math.round(r / 3)), Math.max(1, Math.round(r / 3)));
    ctx.restore();
  }

  /** A four-point twinkle. */
  function twinkle(x: number, y: number, size: number, color = '#edfcff', alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - size), Math.round(y), Math.round(size * 2 + 1), 1);
    ctx.fillRect(Math.round(x), Math.round(y - size), 1, Math.round(size * 2 + 1));
    ctx.restore();
  }

  /** The diamond a bandit carries, held up over their head. */
  function carriedGem(b: Bandit, camX: number, camY: number) {
    const x = b.x - camX;
    const y = b.y - DRAW_H - 6 - camY + Math.sin(frame / 10) * 1.5;
    gem(x, y, 5);
    if (frame % 40 < 10) twinkle(x + 4, y - 4, 2);
  }

  /** Hiding spots: outlined for the Saboteur in setup, with their diamonds; glints and searched marks for Runners. */
  function drawSpots(camX: number, camY: number) {
    if (result) return;
    const sab = !!match?.saboteur;
    const now = performance.now();
    const hover = sab && phase === 'setup' && !selectedTrap ? spotUnder(mouseX, mouseY) : undefined;
    for (const sp of spots) {
      const b = spotBox(sp);
      const x = b.x0 - camX;
      const y = b.y0 - camY;
      const w = b.x1 - b.x0;
      const h = b.y1 - b.y0;
      const c = spotCenter(sp);
      const d = diamondIn(sp.id);
      ctx.save();
      if (sab) {
        if (phase === 'setup') {
          const full = !d && hiddenInRoom(sp) >= 2;
          ctx.strokeStyle = d ? '#7ceaff' : full ? '#ff6a6a' : '#ffc94a';
          ctx.globalAlpha = sp === hover ? 1 : d ? 0.9 : full ? 0.4 : 0.65 + 0.25 * Math.sin(frame / 12);
          ctx.lineWidth = sp === hover ? 2.5 : 1.5;
          ctx.setLineDash(d ? [] : [3, 2]);
          ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
          if (sp === hover && !d && !full) {
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = '#ffc94a';
            ctx.fillRect(x, y, w, h);
          }
        }
        if (d) {
          // The Saboteur sees each hidden diamond, and a shield when a trap guards it.
          gem(c.x - camX, c.y - camY + Math.sin(frame / 14 + c.x) * 1, 4, '#7ceaff', phase === 'setup' ? 1 : 0.8);
          if (guarded(sp)) shield(c.x - camX + 7, c.y - camY - 7);
        }
      } else if (phase === 'live') {
        if (searched.has(sp.id)) {
          // Searched and empty, for the whole crew: a grey cross.
          ctx.strokeStyle = 'rgba(200,200,210,0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(c.x - camX - 4, c.y - camY - 4);
          ctx.lineTo(c.x - camX + 4, c.y - camY + 4);
          ctx.moveTo(c.x - camX + 4, c.y - camY - 4);
          ctx.lineTo(c.x - camX - 4, c.y - camY + 4);
          ctx.stroke();
        } else if (glints.has(sp.id)) {
          // Something in there catches the light.
          const t = (now / 900 + c.x * 0.013) % 1;
          if (t < 0.35) twinkle(c.x - camX + Math.sin(c.y) * w * 0.25, c.y - camY - 3, 1 + Math.sin((t / 0.35) * Math.PI) * 2.5, '#bff6ff', 0.9);
        }
        if (searching?.spot === sp.id) {
          // Rummaging: the furniture's outline shakes.
          const jx = Math.sin(now / 30) * 1;
          ctx.strokeStyle = '#ffe39a';
          ctx.globalAlpha = 0.8;
          ctx.strokeRect(x + 0.5 + jx, y + 0.5, w - 1, h - 1);
        }
      }
      ctx.restore();
    }
  }

  /** A small blue shield: this diamond has a trap next to it. */
  function shield(x: number, y: number) {
    x = Math.round(x);
    y = Math.round(y);
    ctx.fillStyle = '#0e1630';
    ctx.fillRect(x - 4, y - 4, 9, 8);
    ctx.fillRect(x - 3, y + 4, 7, 2);
    ctx.fillStyle = '#5cc8ff';
    ctx.fillRect(x - 3, y - 3, 7, 6);
    ctx.fillRect(x - 2, y + 3, 5, 1);
    ctx.fillRect(x - 1, y + 4, 3, 1);
    ctx.fillStyle = '#d8f4ff';
    ctx.fillRect(x - 2, y - 2, 2, 3);
  }

  /** Diamonds dropped on the floor: anyone can grab them. */
  function drawFloorDiamonds(camX: number, camY: number) {
    for (const d of diamonds) {
      if (d.place.at !== 'floor' || !here(d.place.deck)) continue;
      const x = d.place.x - camX;
      const y = d.place.y - camY;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(frame / 8);
      ctx.fillStyle = '#7ceaff';
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      gem(x, y - 3 - Math.abs(Math.sin(frame / 12)) * 2, 4);
    }
  }

  /** Hide: a diamond drops into the furniture. Found: it pops out. Empty: a puff of dust. And the search ring. */
  function drawDiamondFx(camX: number, camY: number) {
    const now = performance.now();
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      const t = (now - f.at) / 700;
      if (t >= 1) {
        fx.splice(i, 1);
        continue;
      }
      const x = f.x - camX;
      const y = f.y - camY;
      if (f.kind === 'hide') {
        // Falls in from above, then a burst of sparkles as it disappears inside.
        const fall = Math.min(1, t / 0.55);
        if (t < 0.55) gem(x, y - 30 * (1 - fall * fall), 5);
        else for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const r = 4 + (t - 0.55) * 40;
          twinkle(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6, 2, '#bff6ff', 1 - (t - 0.55) / 0.45);
        }
      } else if (f.kind === 'found') {
        // Pops out of the furniture in an arc, sparkling.
        const up = Math.sin(t * Math.PI) * 26;
        gem(x + t * 6, y - up, 5 + Math.sin(t * Math.PI) * 2);
        for (let k = 0; k < 4; k++) twinkle(x + Math.cos(k * 1.6 + t * 6) * 12, y - up + Math.sin(k * 1.6 + t * 6) * 8, 2, '#ffffff', 1 - t);
      } else {
        // Nothing: a grey puff of dust.
        ctx.save();
        for (let k = 0; k < 5; k++) {
          ctx.globalAlpha = 0.5 * (1 - t);
          ctx.fillStyle = '#b8b0a4';
          ctx.beginPath();
          ctx.arc(x + Math.cos(k * 1.3) * t * 14, y - t * 10 + Math.sin(k * 1.3) * t * 6, 2 + t * 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
    if (searching) {
      // The search ring over my head fills as E is held.
      const p = Math.min(1, (now - searching.since) / SEARCH_MS);
      const x = me.x - camX;
      const y = me.y - DRAW_H - 8 - camY;
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(14,10,26,0.8)';
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ffc94a';
      ctx.beginPath();
      ctx.arc(x, y, 7, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffe39a';
      ctx.font = '7px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', x + 0.5, y + 1);
      ctx.restore();
    }
  }

  /** Setup: the name of the furniture under the Saboteur's cursor. */
  function drawSpotLabel(camX: number, camY: number) {
    if (selectedTrap) return;
    const sp = spotUnder(mouseX, mouseY);
    if (!sp) return;
    const b = spotBox(sp);
    const d = diamondIn(sp.id);
    const full = !d && hiddenInRoom(sp) >= 2;
    const text = d ? `${sp.name.toUpperCase()} · HIDDEN (right-click to take out)` : full ? `${roomOf(sp).toUpperCase()} IS FULL (2 max)` : `HIDE IN ${sp.name.toUpperCase()}`;
    // Kept on screen even for furniture at the edge of the map.
    const size = Math.round(8 * dpr);
    ctx.font = `${size}px "Press Start 2P"`;
    const half = ctx.measureText(text).width / 2 + 8 * dpr;
    const sx = Math.min(canvas.width - half, Math.max(half, ((b.x0 + b.x1) / 2 - camX) * scale));
    textTag(text, sx, Math.max(size * 2, (b.y0 - 4 - camY) * scale), d ? '#7ceaff' : full ? '#ff6a6a' : '#ffc94a', size);
  }

  /** The end of the heist: every diamond's real spot, marked over the whole map. */
  function drawReveal(camX: number, camY: number) {
    if (!result) return;
    ctx.save();
    for (const d of result.diamonds) {
      let pos: { x: number; y: number } | null = null;
      let color = '#7ceaff';
      let label = '';
      if (d.place.at === 'spot') {
        const sp = spots.find((x) => x.id === (d.place as { spot: string }).spot);
        if (sp) pos = spotCenter(sp);
        color = '#ff8a94';
        label = 'NEVER FOUND';
      } else if (d.place.at === 'floor' && here(d.place.deck)) {
        pos = { x: d.place.x, y: d.place.y };
        color = '#ffb02e';
        label = 'DROPPED';
      }
      if (!pos) continue;
      const sx = (pos.x - camX) * scale;
      const sy = (pos.y - camY) * scale;
      const pulse = 1 + 0.25 * Math.sin(frame / 8);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(sx, sy, 14 * dpr * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.scale(scale, scale);
      gem(pos.x - camX, pos.y - camY, Math.max(4, 6 / scale * dpr), color === '#ff8a94' ? '#7ceaff' : '#ffd27a');
      ctx.restore();
      textTag(label, sx, sy - 20 * dpr, color, Math.round(7 * dpr));
    }
    ctx.restore();
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
  /** The CUSTOM pad glows purple; the fixed pads keep their colours. */
  const portalColor = (p: { size: number }) => (p.size === CUSTOM_PAD ? '#9b6cff' : PORTAL_COLORS[p.size] ?? '#ffffff');

  function drawPortalFloors(camX: number, camY: number) {
    const mine = myPortal();
    const flashing = performance.now() < flashUntil;
    for (const p of lobbyData.portals) {
      const size = padSize(p);
      const state = portals.find((s) => s.size === size);
      const counting = state?.countdown != null;
      ctx.save();
      ctx.fillStyle = portalColor(p);
      let alpha = 0.26;
      if (size === mine) alpha = 0.38 + 0.08 * Math.sin(frame / 10);
      else if (size === hoverPortal) alpha = 0.34;
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
      const size = padSize(p);
      const state = portals.find((s) => s.size === size);
      const color = portalColor(p);
      const selected = size === mine;
      const hovered = size === hoverPortal;
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
      // Up to 9 seats on the CUSTOM pad, so they squeeze together to fit.
      const gap = Math.min(13, (w - 20) / Math.max(1, size - 1));
      const left = x + w / 2 - ((size - 1) * gap) / 2;
      for (let i = 0; i < size; i++) person(left + i * gap, y + h * 0.38, i < count ? color : 'rgba(255,244,230,0.3)');
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
      const size = padSize(p);
      const state = portals.find((s) => s.size === size);
      const color = portalColor(p);
      const cx = ((p.x + p.w / 2) * ART_TILE - camX) * scale;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(8 * dpr)}px "Press Start 2P"`;
      ctx.fillStyle = color;
      ctx.fillText(p.size === CUSTOM_PAD ? `CUSTOM ${size}P` : `${size} PLAYERS`, cx, (p.y * ART_TILE - 9 - camY) * scale);
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
        ctx.fillText(`${state?.count ?? 0}/${size}`, cx + 2 * dpr, countY + 2 * dpr);
        ctx.fillStyle = '#fff4e6';
        ctx.fillText(`${state?.count ?? 0}/${size}`, cx, countY);
      }
      // Under the count: your party, or what a click will do.
      const mine = myPortal() === size;
      const note = mine ? (hoverPortal === size ? 'CLICK TO LEAVE' : 'YOUR PARTY') : hoverPortal === size ? 'CLICK TO JOIN' : '';
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

  /** The round minimap at the top left, centred on the trap that just caught someone. */
  function drawTrapMinimap() {
    if (!trapFlash || scene !== 'match' || result) return;
    const t = performance.now() - trapFlash.at;
    if (t >= MINIMAP_MS) {
      trapFlash = null;
      return;
    }
    const map = deckMaps.get(trapFlash.deck) ?? (trapFlash.deck === deckId ? estate : null);
    if (!map) return;
    // Under the objective panel, on the left.
    const panel = document.querySelector('.objective')?.getBoundingClientRect();
    const MINI_R = 110; // radius, CSS px
    const R = MINI_R * dpr;
    const cx = (16 + MINI_R + 4) * dpr;
    const cy = ((panel && panel.height ? panel.bottom : 16) + 18 + MINI_R) * dpr;
    const SPAN = 14 * ART_TILE; // world px from the centre to the rim (zoomed in so the room reads)
    const k = R / SPAN;
    // Fade in and out at the ends.
    const alpha = Math.min(1, t / 180, (MINIMAP_MS - t) / 350);
    ctx.save();
    ctx.globalAlpha = alpha;
    // Frame and shadow.
    ctx.fillStyle = 'rgba(8, 6, 16, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, R + 7 * dpr, 0, Math.PI * 2);
    ctx.fill();
    // The map round the trap, clipped to the circle (only the part inside the world is drawn).
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0e1014';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    const sx0 = Math.max(0, trapFlash.x - SPAN);
    const sy0 = Math.max(0, trapFlash.y - SPAN);
    const sx1 = Math.min(map.widthPx, trapFlash.x + SPAN);
    const sy1 = Math.min(map.heightPx, trapFlash.y + SPAN);
    if (sx1 > sx0 && sy1 > sy0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(map.below, sx0, sy0, sx1 - sx0, sy1 - sy0, cx + (sx0 - trapFlash.x) * k, cy + (sy0 - trapFlash.y) * k, (sx1 - sx0) * k, (sy1 - sy0) * k);
    }
    ctx.fillStyle = 'rgba(10, 8, 24, 0.25)';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    // Where I am, if I'm on that deck: a dot, or an arrow on the rim pointing my way.
    if (trapFlash.deck === deckId && !match?.saboteur) {
      const dx = (me.x - trapFlash.x) * k;
      const dy = (me.y - trapFlash.y) * k;
      const d = Math.hypot(dx, dy);
      if (d < R - 6 * dpr) {
        ctx.fillStyle = '#0e0a1a';
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, 5 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6fe0ff';
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, 3.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const a = Math.atan2(dy, dx);
        const rx = cx + Math.cos(a) * (R - 8 * dpr);
        const ry = cy + Math.sin(a) * (R - 8 * dpr);
        ctx.fillStyle = '#6fe0ff';
        ctx.beginPath();
        ctx.moveTo(rx + Math.cos(a) * 7 * dpr, ry + Math.sin(a) * 7 * dpr);
        ctx.lineTo(rx + Math.cos(a + 2.4) * 6 * dpr, ry + Math.sin(a + 2.4) * 6 * dpr);
        ctx.lineTo(rx + Math.cos(a - 2.4) * 6 * dpr, ry + Math.sin(a - 2.4) * 6 * dpr);
        ctx.fill();
      }
    }
    // The trap: a pulsing red ping with a cross in the middle.
    const p = (t % 900) / 900;
    ctx.strokeStyle = `rgba(255, 70, 70, ${1 - p})`;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, (9 + p * 30) * dpr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ff3b4a';
    ctx.beginPath();
    ctx.arc(cx, cy, 9 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff4e6';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx - 4.5 * dpr, cy - 4.5 * dpr);
    ctx.lineTo(cx + 4.5 * dpr, cy + 4.5 * dpr);
    ctx.moveTo(cx + 4.5 * dpr, cy - 4.5 * dpr);
    ctx.lineTo(cx - 4.5 * dpr, cy + 4.5 * dpr);
    ctx.stroke();
    ctx.restore();
    // The rim, and the time left draining round it.
    ctx.strokeStyle = '#ffc94a';
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 1.5 * dpr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ff3b4a';
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 5 * dpr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - t / MINIMAP_MS));
    ctx.stroke();
    // What and where, under the circle.
    const label = `${trapFlash.trap.toUpperCase()} \u00b7 ${trapFlash.area.toUpperCase()}${multiDeck() ? ` \u00b7 ${deckShort(trapFlash.deck)}` : ''}`;
    const size = Math.round(9 * dpr);
    ctx.font = `${size}px "Press Start 2P"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const w = ctx.measureText(label).width + size * 1.6;
    ctx.fillStyle = 'rgba(8, 6, 16, 0.85)';
    ctx.fillRect(cx - w / 2, cy + R + 11 * dpr, w, size * 2.2);
    ctx.fillStyle = '#ff8a8a';
    ctx.fillText(label, cx, cy + R + 11 * dpr + size * 0.6);
    ctx.restore();
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
    const hidden = (id: string) =>
      inMatch && (hideSeek() ? !!match?.saboteur || id === seekerId() : match?.saboteur ? id === myId : false);
    for (const [id, r] of remotes) if (!hidden(id)) tag(r.bandit, id, r.state.offline ? `${r.state.name} (reconnecting)` : r.state.name, r.state.character, inMatch && r.state.carrying, inMatch ? r.state.hp : MAX_HP);
    if (!hidden(myId)) tag(me, myId, myName, myCharacter, inMatch && !!myDiamond(), inMatch ? hp : MAX_HP);
  }

  // Fixed 60 updates per second; draw once per animation frame.
  let last = performance.now();
  let acc = 0;
  function tick(now: number) {
    // Ask for the next frame first, so one bad frame can't stop the game for good.
    requestAnimationFrame(tick);
    acc += Math.min(now - last, 250);
    last = now;
    while (acc >= 1000 / 60) {
      update();
      acc -= 1000 / 60;
    }
    draw();
  }
  requestAnimationFrame(tick);
}

boot().catch((err) => {
  document.body.insertAdjacentHTML('afterbegin', `<pre style="position:fixed;z-index:9;color:#f88;padding:16px">${String(err)}</pre>`);
});
