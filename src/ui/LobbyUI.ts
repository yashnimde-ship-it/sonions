import { CHARACTERS, type CharacterId } from '../config';
import { abilityFor, CHARACTER_INFO } from '../data/characters';
import type { Profile } from '../data/profile';
import { MAX_CREW, MIN_CREW } from '../data/round';
import type { MapId } from '../data/maps';
import type { PortalState, Taken } from '../net/protocol';
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

/** Where your party stands, for the Start Heist box. */
export type StartState =
  | { kind: 'none' }
  | { kind: 'waiting'; size: number; count: number }
  | { kind: 'countdown'; size: number; seconds: number }
  | { kind: 'offline' };

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
  private abort = new AbortController();
  private lastPortals = '';
  /** Party sizes that have a pad in the safehouse; other sizes are custom parties. */
  private padSizes = new Set<number>();
  private customSize = 5;
  private custom = document.createElement('div');
  private lastCard = '';
  private lastStart = '';
  /** A START HEIST explanation stays up until then (ms), instead of the live status. */
  private nudgeUntil = 0;
  private nudgeKind = '';
  private startKind = '';
  private choice = 0;
  /** Characters other players have, and who has them. */
  private taken = new Map<CharacterId, string>();
  private selectedNav: NavId = 'lobby';

  /** The wardrobe or Loadout picker confirmed a character. */
  onPick: (id: CharacterId) => void = () => {};
  /** A party row was clicked: join (or leave) that portal. */
  onPortal: (size: number) => void = () => {};
  /** START HEIST was pressed. */
  onStart: () => void = () => {};
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
    this.portalList.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-size]');
      if (row) this.onPortal(Number(row.dataset.size));
      row?.blur();
    }, opts);
    // Custom party: any size from MIN_CREW to MAX_CREW, joined from here (no pad needed).
    this.custom.className = 'custom-party';
    this.custom.innerHTML = `<span class="label">CUSTOM</span><button type="button" data-step="-1" aria-label="Fewer players">-</button><b class="n"></b><button type="button" data-step="1" aria-label="More players">+</button><button type="button" class="join">JOIN</button>`;
    this.portalList.after(this.custom);
    this.renderCustom();
    this.custom.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!btn) return;
      if (btn.dataset.step) {
        this.customSize = Math.min(MAX_CREW, Math.max(MIN_CREW, this.customSize + Number(btn.dataset.step)));
        this.renderCustom();
      } else this.onPortal(this.customSize);
      btn.blur();
    }, opts);
    this.startBtn.addEventListener('click', () => {
      this.onStart();
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

  showDisconnected() {
    this.root.hidden = false;
    this.disconnected.hidden = false;
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
    this.lastPortals = '';
  }

  private mapName = (id: MapId | null) => this.maps.find((m) => m.id === id)?.name ?? '';

  /** The pads in the safehouse; their rows always show. */
  setPadSizes(sizes: number[]) {
    this.padSizes = new Set(sizes);
    this.lastPortals = '';
  }

  private renderCustom() {
    this.custom.querySelector('.n')!.textContent = `${this.customSize}P`;
  }

  setPortals(all: PortalState[], online: number, mine: number | null) {
    // Pads always show; a custom size only once someone is waiting in it (or it's yours).
    const portals = all.filter((p) => this.padSizes.has(p.size) || p.count > 0 || p.size === mine);
    this.online.textContent = String(online);
    const key = JSON.stringify([portals, mine]);
    if (key === this.lastPortals) return;
    this.lastPortals = key;
    // Rows are updated in place (not rebuilt), so a click isn't lost when a count changes under it.
    portals.forEach((p, i) => {
      let row = this.portalList.children[i] as HTMLButtonElement | undefined;
      if (!row || row.dataset.size !== String(p.size)) {
        row = document.createElement('button');
        row.type = 'button';
        row.dataset.size = String(p.size);
        row.innerHTML = `<span class="size">${p.size}P</span><span class="dots"></span><span class="status"></span>`;
        this.portalList.insertBefore(row, this.portalList.children[i] ?? null);
      }
      const me = p.size === mine;
      row.className = `portal-row p${p.size}${this.padSizes.has(p.size) ? '' : ' custom'}${me ? ' mine' : ''}`;
      row.title = `${me ? 'Leave' : 'Join'} the ${p.size}-player party`;
      row.querySelector('.dots')!.innerHTML = Array.from({ length: p.size }, (_, k) => `<i class="${k < p.count ? 'on' : ''}"></i>`).join('');
      const status = row.querySelector('.status')!;
      status.className = `status ${p.countdown !== null ? 'go' : 'count'}`;
      status.textContent = p.countdown !== null ? `GO ${p.countdown}` : `${p.count}/${p.size}`;
    });
    while (this.portalList.children.length > portals.length) this.portalList.lastElementChild!.remove();
    const mineState = portals.find((p) => p.size === mine);
    const pick = `Your map: <b class="map-pick">${esc(this.mapName(this.selectedMap))}</b>`;
    this.partyStatus.innerHTML = mineState
      ? `Party: <b class="c${mineState.size}">${mineState.size}P</b> · ${mineState.count}/${mineState.size} ready · map <b class="map-pick">${esc(this.mapName(mineState.map))}</b>`
      : `No party yet · ${pick}`;
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

  // ---------- Start Heist ----------

  setStart(state: StartState) {
    // An explanation is dropped as soon as your party situation changes.
    if (state.kind !== this.nudgeKind) this.nudgeUntil = 0;
    this.startKind = state.kind;
    const nudging = performance.now() < this.nudgeUntil;
    const key = JSON.stringify(state) + (nudging ? '!' : '');
    if (key === this.lastStart) return;
    this.lastStart = key;
    const ready = state.kind === 'countdown';
    this.startBtn.classList.toggle('blocked', !ready);
    this.startBtn.classList.toggle('go', ready);
    this.startBtn.setAttribute('aria-disabled', String(!ready));
    this.startBtn.innerHTML = ready ? `STARTING ${state.seconds} <span class="arrow">&gt;</span>` : 'START HEIST <span class="arrow">&gt;</span>';
    if (nudging) return; // the explanation stays up for a moment
    this.startStatus.className = `start-status ${state.kind}`;
    this.startStatus.textContent =
      state.kind === 'none'
        ? 'Pick a party size: click a portal or walk into one.'
        : state.kind === 'waiting'
          ? `Waiting for your crew: ${state.count}/${state.size} in the ${state.size}-player portal.`
          : state.kind === 'countdown'
            ? `Crew ready! The heist starts in ${state.seconds}...`
            : 'Not connected to the game server.';
  }

  /** Pressing START HEIST when it can't start: say why, a little louder. */
  nudgeStart(reason: string) {
    this.nudgeUntil = performance.now() + 2500;
    this.nudgeKind = this.startKind;
    this.startStatus.textContent = reason;
    this.startStatus.classList.remove('shake');
    void this.startStatus.offsetWidth; // restart the animation
    this.startStatus.classList.add('shake');
    this.lastStart = '';
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
          <img src="${x.preview}" alt="">
          <span class="map-card-name">${esc(x.name)}</span>
          <span class="map-card-stars" title="Difficulty">${stars(x.difficulty)}</span>
        </button>`,
      )
      .join('');
    $('map-panel-body').innerHTML = `
      <div class="map-cards">${cards}</div>
      <p class="map-desc">${esc(m.description)}</p>
      <div class="map-info">
        <img class="map-preview" src="${m.preview}" alt="Map of ${esc(m.name)}">
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
      <div class="modal-actions"><button type="button" class="btn small primary-play" data-map="${m.id}" data-play>PLAY ${esc(m.name)}</button></div>`;
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
