import { CHARACTERS, characterSheet, CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAMES } from '../config';
import { CHARACTER_INFO } from '../data/characters';
import type { GameMode } from '../data/hideSeek';
import { QUICK_PLAY_SIZE, ROOM_MAX, ROOM_MIN, type RoomSummary } from '../data/rooms';

/** What Create Room asks for. */
export interface CreateOptions {
  private: boolean;
  size: number;
  mode: GameMode;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const LINEUP_SCALE = 2.5;
const NAME_KEY = 'vault-breakers-name';

/**
 * The title screen: logo, crew lineup, name box, and the ways online: Quick Play, Create Room,
 * Browse Rooms and Join with a code (plus How to Play).
 */
export class TitleUI {
  private root = document.getElementById('title')!;
  private howto = document.getElementById('howto')!;
  private nameInput = document.getElementById('name-input') as HTMLInputElement;
  private playBtn = document.getElementById('play-btn') as HTMLButtonElement;
  private codeInput = document.getElementById('code-input') as HTMLInputElement;
  private createModal = document.getElementById('create-modal')!;
  private browseModal = document.getElementById('browse-modal')!;
  private roomList = document.getElementById('room-list')!;
  private error = document.getElementById('title-error')!;
  private create: CreateOptions = { private: true, size: QUICK_PLAY_SIZE, mode: 'heist' };
  /** Did this browser remember a name from last time? (An invite link joins straight away then.) */
  readonly hasSavedName: boolean;
  /** Map names, for the room list. */
  mapName: (id: string) => string = (id) => id;
  /** Quick Play: into an open public room, or a new one. */
  onPlay: () => void = () => {};
  onCreate: (o: CreateOptions) => void = () => {};
  onJoin: (code: string) => void = () => {};
  /** The room browser opened (true) or closed. */
  onBrowse: (open: boolean) => void = () => {};

  constructor() {
    const lineup = document.getElementById('lineup')!;
    const crew: HTMLDivElement[] = [];
    const fitLineup = () => {
      const gap = Math.min(28, Math.max(4, window.innerWidth * 0.02));
      const available = Math.max(0, window.innerWidth - 32 - gap * (CHARACTERS.length - 1));
      const scale = Math.min(LINEUP_SCALE, available / (CHAR_FRAME_W * CHARACTERS.length));
      crew.forEach((el) => {
        const sprite = el.querySelector<HTMLDivElement>('.sprite')!;
        sprite.style.width = `${CHAR_FRAME_W * scale}px`;
        sprite.style.height = `${CHAR_FRAME_H * scale}px`;
        sprite.style.backgroundSize = `${CHAR_FRAME_W * CHAR_FRAMES * scale}px ${CHAR_FRAME_H * scale}px`;
      });
    };
    CHARACTERS.forEach((id, i) => {
      const info = CHARACTER_INFO[id];
      const el = document.createElement('div');
      el.className = 'crew';
      el.style.setProperty('--delay', `${i * 0.15}s`);
      el.innerHTML = `<div class="sprite"></div><span style="color:${info.color}">${info.nick}</span>`;
      const sprite = el.querySelector<HTMLDivElement>('.sprite')!;
      sprite.style.backgroundImage = `url(${characterSheet(id)})`;
      lineup.append(el);
      crew.push(el);
    });
    fitLineup();
    window.addEventListener('resize', fitLineup);

    try {
      this.nameInput.value = localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      // Storage can be blocked; the name box just starts empty.
    }
    this.hasSavedName = !!this.nameInput.value;
    if (!this.nameInput.value) this.nameInput.value = `Bandit${Math.floor(100 + Math.random() * 900)}`;
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.onPlay();
    });
    this.playBtn.addEventListener('click', () => this.onPlay());
    // Join with a code.
    const join = () => this.onJoin(this.codeInput.value);
    document.getElementById('join-btn')!.addEventListener('click', join);
    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') join();
    });
    this.codeInput.addEventListener('input', () => (this.codeInput.value = this.codeInput.value.toUpperCase()));
    // Create Room: private/public, size, mode.
    document.getElementById('create-btn')!.addEventListener('click', () => {
      this.renderCreate();
      this.createModal.hidden = false;
    });
    this.createModal.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b) return;
      if (b.dataset.priv) this.create.private = b.dataset.priv === '1';
      else if (b.dataset.step) this.create.size = Math.max(ROOM_MIN, Math.min(ROOM_MAX, this.create.size + Number(b.dataset.step)));
      else if (b.dataset.cmode) this.create.mode = b.dataset.cmode as GameMode;
      else if (b.id === 'create-go') {
        this.createModal.hidden = true;
        this.onCreate({ ...this.create });
      } else if (b.hasAttribute('data-close')) this.createModal.hidden = true;
      this.renderCreate();
    });
    // Browse Rooms: the public rooms, live.
    document.getElementById('browse-btn')!.addEventListener('click', () => {
      this.roomList.innerHTML = '<p class="empty">Looking for rooms...</p>';
      this.browseModal.hidden = false;
      this.onBrowse(true);
    });
    this.browseModal.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const row = el.closest<HTMLButtonElement>('[data-code]');
      if (row && !row.disabled) {
        this.closeBrowse();
        this.onJoin(row.dataset.code!);
      } else if (el.closest('#browse-quick')) {
        this.closeBrowse();
        this.onPlay();
      } else if (el.closest('[data-close]')) this.closeBrowse();
    });
    document.getElementById('howto-btn')!.addEventListener('click', () => this.showHowTo(true));
    document.getElementById('howto-close')!.addEventListener('click', () => this.showHowTo(false));
  }

  get name() {
    const name = this.nameInput.value.trim().slice(0, 14);
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // Not remembered next time; that's fine.
    }
    return name;
  }

  get howToOpen() {
    return !this.howto.hidden;
  }

  showHowTo(open: boolean) {
    this.howto.hidden = !open;
  }

  /** A ?room= link or a pasted code: show it in the box. */
  setCode(code: string) {
    this.codeInput.value = code;
  }

  /** An invite link for someone new: their name first, then JOIN. */
  askNameFor(code: string) {
    this.setCode(code);
    this.error.hidden = false;
    this.error.textContent = `You're invited to room ${code}: type your name, then press JOIN.`;
    this.nameInput.select();
    this.nameInput.focus();
  }

  get modalOpen() {
    return !this.createModal.hidden || !this.browseModal.hidden || this.howToOpen;
  }

  private closeBrowse() {
    this.browseModal.hidden = true;
    this.onBrowse(false);
  }

  private renderCreate() {
    for (const b of this.createModal.querySelectorAll<HTMLButtonElement>('[data-priv]')) b.classList.toggle('on', (b.dataset.priv === '1') === this.create.private);
    for (const b of this.createModal.querySelectorAll<HTMLButtonElement>('[data-cmode]')) b.classList.toggle('on', b.dataset.cmode === this.create.mode);
    document.getElementById('create-size')!.textContent = String(this.create.size);
  }

  /** The public rooms (from the server, whenever they change). */
  showRooms(list: RoomSummary[]) {
    if (this.browseModal.hidden) return;
    const order = (r: RoomSummary) => (r.status === 'waiting' && r.count < r.size ? 0 : 1);
    this.roomList.innerHTML = list.length
      ? [...list]
          .sort((a, b) => order(a) - order(b) || b.count - a.count)
          .map((r) => {
            const busy = r.status === 'playing' ? 'PLAYING' : r.count >= r.size ? 'FULL' : '';
            return `<button type="button" class="room-row" data-code="${r.code}"${busy ? ' disabled' : ''}>
              <span class="code">${r.code}</span>
              <span class="who">${esc(r.hostName)}'s room<br><span class="what">${r.mode === 'hideSeek' ? 'HIDE &amp; SEEK' : esc(this.mapName(r.map))}</span></span>
              <span class="count">${r.count}/${r.size}</span>
              <span class="state${busy ? ' busy' : ''}">${busy || 'JOIN'}</span>
            </button>`;
          })
          .join('')
      : '<p class="empty">No public rooms right now.<br>Create one, or press Quick Play to start one.</p>';
  }

  setBusy(busy: boolean, error = '') {
    this.playBtn.disabled = busy;
    for (const id of ['create-btn', 'browse-btn', 'join-btn']) (document.getElementById(id) as HTMLButtonElement).disabled = busy;
    this.playBtn.textContent = busy ? 'CONNECTING...' : 'QUICK PLAY';
    this.error.hidden = !error;
    this.error.textContent = error;
  }

  show(visible: boolean) {
    this.root.hidden = !visible;
    if (!visible) {
      this.showHowTo(false);
      this.nameInput.blur();
    }
  }
}
