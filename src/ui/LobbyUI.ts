import { CHARACTERS, type CharacterId } from '../config';
import { abilityFor, CHARACTER_INFO } from '../data/characters';
import type { Profile } from '../data/profile';
import type { GameMode } from '../data/hideSeek';
import type { MapId } from '../data/maps';
import { HIDE_SEEK_MIN_PLAYERS } from '../data/hideSeek';
import { ROOM_MAX, ROOM_MIN, type RoomInfo } from '../data/rooms';
import type { Taken } from '../net/protocol';
import { iconHtml, type IconName } from './pixelIcons';
import { SETTING_LABELS, type Settings, type SettingsValues } from './Settings';

export type NavId = 'lobby' | 'loadout' | 'map' | 'settings' | 'exit';

/** What the map picker shows about a heist map (from its map data). */
export interface MapInfo {
  id: MapId;
  name: string;
  description: string;
  /** 1 to 3 stars. */
  difficulty: number;
  width: number;
  height: number;
  rooms: string[];
  outdoor: string[];
  doors: number;
  loot: { name: string; value: number }[];
  preview: string;
}

const NAV: { id: NavId; label: string; icon: IconName }[] = [
  { id: 'lobby', label: 'LOBBY', icon: 'home' },
  { id: 'loadout', label: 'LOADOUT', icon: 'loadout' },
  { id: 'map', label: 'MAP INFO', icon: 'map' },
  { id: 'settings', label: 'SETTINGS', icon: 'settings' },
  { id: 'exit', label: 'EXIT', icon: 'exit' },
];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The safehouse UI over the lobby scene: title badge, menu, Heist Lobby panel, profile card,
 * Start Heist box, and the Loadout (wardrobe), Map Info, Settings and Exit panels. It only
 * shows state and reports clicks; main.ts owns the game and network state.
 */
export class LobbyUI {
  private root = $('lobby');
  private nav = $('lobby-nav');
  private portalList = $('portal-list');
  private online = $('online-count');
  private partyStatus = $('party-status');
  private profileCard = $('my-card');
  private picker = $('picker');
  private pickerCards = $('picker-cards');
  private mapPanel = $('map-panel');
  private settingsPanel = $('settings-panel');
  private exitPanel = $('exit-panel');
  private disconnected = $('disconnected');
  private startBtn = $<HTMLButtonElement>('start-btn');
  private startStatus = $('start-status');
  private partyTitle = $('party-title');
  private lobbyHint = $('lobby-hint');
  private abort = new AbortController();
  /** My room (from the server), and who I am in it. */
  private room: RoomInfo | null = null;
  private myId = '';
  private lastRoom = '';
  /** The room's map and mode as last heard from the server. */
  private roomPick = '';
  private roomBar = document.createElement('div');
  private sizeRow = document.createElement('div');
  /** The game mode I want: a heist, or Hide & Seek (3+ players, on the cruise ship). */
  private mode: GameMode = 'heist';
  private modeRow = document.createElement('div');
  /** The mode switch was clicked. */
  onMode: (mode: GameMode) => void = () => {};
  private lastCard = '';
  /** A START HEIST explanation stays up until then (ms), instead of the live status. */
  private nudgeUntil = 0;
  private choice = 0;
  /** Characters other players have, and who has them. */
  private taken = new Map<CharacterId, string>();
  private selectedNav: NavId = 'lobby';

  /** The wardrobe or Loadout picker confirmed a character. */
  onPick: (id: CharacterId) => void = () => {};
  /** The host pressed START. */
  onStart: () => void = () => {};
  /** A player (not the host) pressed READY / NOT READY. */
  onReady: (ready: boolean) => void = () => {};
  /** The host changed the room: size or who can join (mode and map have their own). */
  onRoomSettings: (s: { size?: number; private?: boolean }) => void = () => {};
  /** The host removed a player. */
  onKick: (id: string) => void = () => {};
  /** Exit was confirmed. */
  onExit: () => void = () => {};
  /** A map was picked in the map picker. */
  onMap: (id: MapId) => void = () => {};
  /** Loadout was opened from the menu: the picker needs the current character. */
  onLoadout: () => void = () => {};

  private settings: Settings;

  private maps: MapInfo[];
  private selectedMap: MapId;

  constructor(maps: MapInfo[], settings: Settings) {
    this.maps = maps;
    this.selectedMap = maps[0].id;
    this.settings = settings;
    const opts = { signal: this.abort.signal };
    this.nav.innerHTML = NAV.map(
      (n) => `<button class="nav-item" data-nav="${n.id}" type="button">${iconHtml(n.icon)}<span>${n.label}</span></button>`,
    ).join('');
    this.nav.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-nav]');
      if (item) this.navigate(item.dataset.nav as NavId);
      item?.blur();
    }, opts);
    // The member list: the host's remove (x) buttons.
    this.portalList.addEventListener('click', (e) => {
      const kick = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-kick]');
      if (kick) this.onKick(kick.dataset.kick!);
    }, opts);
    // The room's code (copy it, or a link to it) and who can join.
    this.roomBar.className = 'room-bar';
    this.partyTitle.closest('.party-head')!.after(this.roomBar);
    this.roomBar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b || !this.room) return;
      if (b.dataset.copy) {
        const text = b.dataset.copy === 'link' ? `${location.origin}/?room=${this.room.code}` : this.room.code;
        void copyText(text).then((ok) => this.nudgeStart(ok ? (b.dataset.copy === 'link' ? 'Invite link copied: send it to your friends.' : `Code ${this.room!.code} copied.`) : `Couldn't copy: the code is ${this.room!.code}.`));
      } else if (b.dataset.privacy && this.isHost) this.onRoomSettings({ private: !this.room.private });
      b.blur();
    }, opts);
    // The room's size (host only).
    this.sizeRow.className = 'size-row';
    this.sizeRow.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-step]');
      if (!b || !this.room || !this.isHost) return;
      this.onRoomSettings({ size: Math.max(ROOM_MIN, Math.min(ROOM_MAX, this.room.size + Number(b.dataset.step))) });
      b.blur();
    }, opts);
    // Which game: a heist, or Hide & Seek on the cruise ship.
    this.modeRow.className = 'mode-row';
    this.modeRow.innerHTML = `<span class="label">MODE</span><button type="button" data-mode="heist">HEIST</button><button type="button" data-mode="hideSeek">HIDE &amp; SEEK</button><span class="mode-note">Hide &amp; Seek: 3+ players, on the cruise ship</span>`;
    this.portalList.before(this.modeRow);
    this.portalList.before(this.sizeRow);
    this.modeRow.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
      if (!btn) return;
      if (this.room && !this.isHost) this.nudgeStart('Only the host picks the mode.');
      else this.onMode(btn.dataset.mode as GameMode);
      btn.blur();
    }, opts);
    this.renderMode();
    // The host starts; everyone else readies up.
    this.startBtn.addEventListener('click', () => {
      if (this.isHost) this.onStart();
      else if (this.room) this.onReady(!this.room.members.find((m) => m.id === this.myId)?.ready);
      this.startBtn.blur();
    }, opts);
    this.root.addEventListener('click', (e) => {
      const close = (e.target as HTMLElement).closest('[data-close]');
      if (close) this.navigate('lobby');
    }, opts);
    $('exit-confirm').addEventListener('click', () => {
      this.navigate('lobby');
      this.onExit();
    }, opts);

    CHARACTERS.forEach((id, i) => {
      const el = document.createElement('button');
      el.className = 'pick';
      el.type = 'button';
      el.style.setProperty('--accent', CHARACTER_INFO[id].color);
      el.innerHTML = `<img src="/assets/characters/${id}-portrait.png" alt=""><span>${CHARACTER_INFO[id].nick}</span><small><b class="runner">RUN</b> ${abilityFor(id, 'runner').name}</small><small><b class="saboteur">SAB</b> ${abilityFor(id, 'saboteur').name}</small><em class="owner"></em>`;
      el.addEventListener('click', () => {
        if (this.taken.has(id)) return;
        this.choice = i;
        this.confirmPick();
      }, opts);
      el.addEventListener('mouseenter', () => {
        if (!this.taken.has(id)) this.select(i);
      }, opts);
      this.pickerCards.append(el);
    });

    this.renderMaps();
    $('map-panel-body').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const pick = el.closest<HTMLElement>('[data-map]');
      if (!pick) return;
      this.setMap(pick.dataset.map as MapId);
      if (el.closest('[data-play]')) {
        this.onMap(this.selectedMap);
        this.navigate('lobby');
      }
    }, opts);
    this.renderSettings();
    this.selectNav('lobby');
  }

  /** Removes every listener this UI added (if the lobby is ever torn down). */
  destroy() {
    this.abort.abort();
  }

  show(visible: boolean) {
    this.root.hidden = !visible;
    if (!visible) this.navigate('lobby');
  }

  showDisconnected(reason = 'Lost the connection to the game server.') {
    this.root.hidden = false;
    this.disconnected.hidden = false;
    this.disconnected.querySelector('p')!.textContent = reason;
  }

  /** Is any panel open over the lobby (so the player shouldn't move)? */
  get panelOpen() {
    return this.pickerOpen || !this.mapPanel.hidden || !this.settingsPanel.hidden || !this.exitPanel.hidden;
  }

  // ---------- Menu ----------

  navigate(id: NavId) {
    this.picker.hidden = id !== 'loadout';
    this.mapPanel.hidden = id !== 'map';
    this.settingsPanel.hidden = id !== 'settings';
    this.exitPanel.hidden = id !== 'exit';
    if (id === 'loadout') this.onLoadout();
    this.selectNav(id);
  }

  private selectNav(id: NavId) {
    this.selectedNav = id;
    this.nav.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) => {
      const on = el.dataset.nav === id;
      el.classList.toggle('selected', on);
      el.setAttribute('aria-pressed', String(on));
    });
  }

  get selected() {
    return this.selectedNav;
  }

  // ---------- Heist Lobby panel ----------

  /** Live portal counts from the server; `mine` is the party size you're standing in. */
  /** The map I'll vote for; the panel and the Heist Lobby show it. */
  setMap(id: MapId) {
    this.selectedMap = id;
    this.renderMaps();
    this.lastRoom = '';
  }

  private mapName = (id: MapId | null) => this.maps.find((m) => m.id === id)?.name ?? '';

  get gameMode() {
    return this.mode;
  }

  setMode(mode: GameMode) {
    this.mode = mode;
    this.renderMode();
    this.lastRoom = '';
  }

  private renderMode() {
    const hideSeek = this.mode === 'hideSeek';
    for (const b of this.modeRow.querySelectorAll<HTMLButtonElement>('[data-mode]')) b.classList.toggle('on', b.dataset.mode === this.mode);
    this.partyTitle.closest('section')?.setAttribute('aria-label', hideSeek ? 'Hide & Seek room' : 'Heist room');
    this.modeRow.querySelector('.mode-note')!.textContent = hideSeek
      ? '3+ players on the cruise ship · smaller crews play Heist'
      : '2–9 players · set traps, hide diamonds, and escape';
    this.lobbyHint.textContent = hideSeek
      ? 'Hide & Seek aboard the cruise ship needs 3 or more. Smaller crews play Heist.'
      : 'Share the code, wait for your crew to get ready, then the host starts.';
  }

  private get isHost() {
    return !!this.room && this.room.host === this.myId;
  }

  /**
   * My room, from the server: its code and who can join, the players (host crown, ready
   * ticks; the host can remove them), its size and mode, and the START / READY button.
   */
  setRoom(room: RoomInfo, myId: string, online: number) {
    this.room = room;
    this.myId = myId;
    this.online.textContent = String(online);
    // The pickers follow the room only when its map or mode changes on the server (this runs
    // every frame, and browsing other maps in Map Info mustn't snap back).
    const pick = `${room.map}|${room.mode}`;
    if (pick !== this.roomPick) {
      this.roomPick = pick;
      this.setMode(room.mode);
      this.setMap(room.map);
    }
    const key = JSON.stringify([room, myId]);
    if (key === this.lastRoom) return;
    this.lastRoom = key;
    const host = this.isHost;
    this.partyTitle.innerHTML = `ROOM <span class="room-code">${room.code}</span>`;
    this.roomBar.innerHTML = `<button type="button" data-copy="code">COPY CODE</button><button type="button" data-copy="link">COPY LINK</button><button type="button" class="privacy${host ? ' host' : ''}" data-privacy="1" title="${host ? 'Click to change who can join' : 'The host decides who can join'}">${room.private ? 'PRIVATE' : 'PUBLIC'}</button>`;
    this.sizeRow.innerHTML = `<span class="label">PLAYERS</span>${host ? '<button type="button" data-step="-1" aria-label="Fewer players">-</button>' : ''}<b>${room.members.length}/${room.size}</b>${host ? '<button type="button" data-step="1" aria-label="More players">+</button>' : ''}`;
    for (const b of this.modeRow.querySelectorAll<HTMLButtonElement>('[data-mode]')) b.classList.toggle('locked', !host);
    this.portalList.innerHTML = room.members
      .map((m) => {
        const info = CHARACTER_INFO[m.character as CharacterId];
        const isHost = m.id === room.host;
        const status = m.offline ? 'RECONNECTING' : m.inGame ? 'IN GAME' : isHost ? 'HOST' : m.ready ? 'READY' : 'NOT READY';
        return `<div class="member${m.id === myId ? ' me' : ''}">
          <img src="/assets/characters/${m.character}-portrait.png" alt="">
          <span class="mname" style="color:${info?.color ?? '#fff'}">${isHost ? '<span class="crown" title="Host">\u265B</span> ' : ''}${esc(m.name)}${m.id === myId ? ' <small>(you)</small>' : ''}</span>
          <span class="mstate ${m.ready || isHost ? 'ok' : ''}">${m.ready && !isHost ? '\u2714 ' : ''}${status}</span>
          ${host && m.id !== myId ? `<button type="button" class="kick" data-kick="${m.id}" title="Remove ${esc(m.name)}">\u2715</button>` : ''}
        </div>`;
      })
      .join('');
    const map = room.mode === 'hideSeek' ? 'the cruise ship' : this.mapName(room.map);
    this.partyStatus.innerHTML = `Map: <b class="map-pick">${esc(map)}</b>${host ? ' · change it in MAP INFO' : ''}`;
    // START (host) or READY (everyone else), and what it's waiting for.
    const here = room.members.filter((m) => !m.inGame && !m.offline);
    const waiting = here.filter((m) => m.id !== room.host && !m.ready);
    const me = room.members.find((m) => m.id === myId);
    const canStart = room.status === 'waiting' && here.length >= ROOM_MIN && !waiting.length;
    const label = room.mode === 'hideSeek' && here.length >= HIDE_SEEK_MIN_PLAYERS ? 'HIDE & SEEK' : 'HEIST';
    let button: string;
    let go: boolean;
    let status: string;
    if (room.status === 'playing') {
      [button, go, status] = ['IN GAME', false, 'Your room is still playing: you will all be back here after.'];
    } else if (host) {
      [button, go] = [`START ${label}`, canStart];
      status = here.length < ROOM_MIN ? `Waiting for players: share code ${room.code}.` : waiting.length ? `Waiting for ${waiting.map((m) => m.name).join(', ')} to get ready.` : 'Everyone is ready. Start when you like!';
    } else {
      [button, go] = [me?.ready ? 'NOT READY' : 'READY', !me?.ready];
      status = me?.ready ? `Ready! Waiting for the host to start.` : 'Press READY when you are set.';
    }
    this.startBtn.classList.toggle('blocked', !go);
    this.startBtn.classList.toggle('go', go);
    this.startBtn.setAttribute('aria-disabled', String(!go));
    this.startBtn.innerHTML = `${button} <span class="arrow">&gt;</span>`;
    if (performance.now() >= this.nudgeUntil) {
      this.startStatus.className = 'start-status';
      this.startStatus.textContent = status;
    }
  }

  /** Who has which character (from the server); `mine` is never shown as taken. */
  setTaken(list: Taken[], mine: CharacterId) {
    this.taken = new Map(list.filter((t) => t.character !== mine).map((t) => [t.character, t.name]));
    CHARACTERS.forEach((id, i) => {
      const el = this.pickerCards.children[i] as HTMLButtonElement;
      const owner = this.taken.get(id);
      el.classList.toggle('taken', !!owner);
      el.disabled = !!owner;
      el.querySelector('.owner')!.textContent = owner ? `TAKEN: ${owner}` : '';
    });
    // Never leave the cursor on someone else's character.
    if (this.pickerOpen && this.taken.has(CHARACTERS[this.choice])) this.select(CHARACTERS.indexOf(mine));
  }

  // ---------- Profile ----------

  setMe(name: string, character: CharacterId, profile: Profile) {
    const info = CHARACTER_INFO[character];
    const key = [name, character, profile.level, profile.tag].join('|');
    if (key === this.lastCard) return;
    this.lastCard = key;
    const rank = profile.rank;
    this.profileCard.style.setProperty('--accent', info.color);
    this.profileCard.innerHTML = `
      <div class="avatar"><img src="/assets/characters/${character}-portrait.png" alt=""><span class="level">Lv. ${profile.level}</span></div>
      <div class="who">
        <span class="name">${esc(name)}<span class="tag">#${profile.tag}</span></span>
        <span class="title">${rank.title}</span>
        <span class="crewline">${info.nick} · ${abilityFor(character, 'runner').name} / ${abilityFor(character, 'saboteur').name}</span>
        <span class="quote">"${rank.quote}"</span>
      </div>`;
  }

  // ---------- Start ----------

  /** Pressing START HEIST when it can't start: say why, a little louder. */
  nudgeStart(reason: string) {
    this.nudgeUntil = performance.now() + 2500;
    this.startStatus.textContent = reason;
    this.startStatus.classList.remove('shake');
    void this.startStatus.offsetWidth; // restart the animation
    this.startStatus.classList.add('shake');
    this.lastRoom = '';
  }

  // ---------- Map Info ----------

  /** Map cards to pick from, then the selected map's details. */
  private renderMaps() {
    const m = this.maps.find((x) => x.id === this.selectedMap) ?? this.maps[0];
    const total = m.loot.reduce((s, l) => s + l.value, 0);
    const stars = (n: number) => '\u2605'.repeat(n) + '\u2606'.repeat(3 - n);
    const cards = this.maps
      .map(
        (x) => `<button type="button" class="map-card${x.id === m.id ? ' selected' : ''}" data-map="${x.id}">
          <img src="${x.preview}" alt="" loading="lazy">
          <span class="map-card-name">${esc(x.name)}</span>
          <span class="map-card-stars" title="Difficulty">${stars(x.difficulty)}</span>
        </button>`,
      )
      .join('');
    $('map-panel-body').innerHTML = `
      <div class="map-cards">${cards}</div>
      <p class="map-desc">${esc(m.description)}</p>
      <div class="map-info">
        <img class="map-preview" src="${m.preview}" alt="Map of ${esc(m.name)}" loading="lazy">
        <div class="map-facts">
          <h3>${esc(m.name)}</h3>
          <dl>
            <dt>Size</dt><dd>${m.width} x ${m.height} tiles</dd>
            <dt>Rooms</dt><dd>${m.rooms.length}</dd>
            <dt>Doors</dt><dd>${m.doors}</dd>
            <dt>Loot</dt><dd>${m.loot.length} items · $${total.toLocaleString('en-US')}</dd>
            <dt>Difficulty</dt><dd>${stars(m.difficulty)}</dd>
            <dt>Crew</dt><dd>2 to 4 players</dd>
          </dl>
        </div>
      </div>
      <p class="map-list"><b>Inside:</b> ${m.rooms.map(esc).join(', ')}</p>
      <p class="map-list"><b>Grounds:</b> ${m.outdoor.map(esc).join(', ')}</p>
      <p class="map-list"><b>Worth stealing:</b> ${m.loot.map((l) => `${esc(l.name)} ($${l.value})`).join(', ')}</p>
      <div class="modal-actions"><button type="button" class="btn small primary-play" data-map="${m.id}" data-play>${this.room && !this.isHost ? 'ONLY THE HOST PICKS THE MAP' : `PLAY ${esc(m.name)}`}</button></div>`;
  }

  // ---------- Settings ----------

  private renderSettings() {
    const body = $('settings-panel-body');
    body.innerHTML = (Object.keys(SETTING_LABELS) as (keyof SettingsValues)[])
      .map((k) => {
        const [label, help] = SETTING_LABELS[k];
        return `<label class="setting"><input type="checkbox" data-setting="${k}" ${this.settings.values[k] ? 'checked' : ''}><span class="switch"></span><span class="label">${label}<small>${help}</small></span></label>`;
      })
      .join('');
    body.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (input.dataset.setting) this.settings.set(input.dataset.setting as keyof SettingsValues, input.checked);
    }, { signal: this.abort.signal });
  }

  // ---------- Wardrobe / Loadout picker ----------

  get pickerOpen() {
    return !this.picker.hidden;
  }

  openPicker(current: CharacterId) {
    this.choice = CHARACTERS.indexOf(current);
    if (this.picker.hidden) this.navigate('loadout');
    this.movePick(0);
  }

  closePicker() {
    if (!this.picker.hidden) this.navigate('lobby');
  }

  /** Moves the cursor left or right, skipping characters other players have. */
  movePick(delta: number) {
    let next = this.choice;
    for (let i = 0; i < CHARACTERS.length; i++) {
      next = (next + Math.sign(delta || 1) + CHARACTERS.length) % CHARACTERS.length;
      if (!this.taken.has(CHARACTERS[next])) break;
    }
    if (delta) this.select(next);
    else this.select(this.choice);
  }

  private select(i: number) {
    this.choice = i;
    [...this.pickerCards.children].forEach((el, j) => el.classList.toggle('selected', j === i));
  }

  confirmPick() {
    const id = CHARACTERS[this.choice];
    if (this.taken.has(id)) return;
    this.onPick(id);
    this.closePicker();
  }
}

/** Copies text to the clipboard (with a fallback for plain-http pages on the local network). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}
