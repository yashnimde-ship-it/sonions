import type { GameMode } from '../data/hideSeek';
import { QUICK_PLAY_SIZE, ROOM_MAX, ROOM_MIN, type RoomSummary } from '../data/rooms';
import { play as sfx } from '../systems/Sound';

/** What Create Room asks for. */
export interface CreateOptions {
  private: boolean;
  size: number;
  mode: GameMode;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const NAME_KEY = 'vault-breakers-name';

/**
 * The title screen: the vault key art with PLAY (Quick Play) on its plate, the name, the other
 * ways online (Create Room, Browse Rooms, Join with a code) and How to Play on the art's strip.
 */
export class TitleUI {
  private root = document.getElementById('title')!;
  private howto = document.getElementById('howto')!;
  private nameInput = document.getElementById('name-input') as HTMLInputElement;
  private playBtn = document.getElementById('play-btn') as HTMLButtonElement;
  private playLabel = this.playBtn.querySelector<HTMLElement>('.title-play-label')!;
  private codeInput = document.getElementById('code-input') as HTMLInputElement;
  private links = this.root.querySelector<HTMLElement>('.title-links')!;
  private joinRow = this.root.querySelector<HTMLElement>('.title-join')!;
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
    try {
      this.nameInput.value = localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      // Storage can be blocked; the name box just starts empty.
    }
    this.hasSavedName = !!this.nameInput.value;
    if (!this.nameInput.value) this.nameInput.value = `Bandit${Math.floor(100 + Math.random() * 900)}`;
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.unlock();
    });
    this.playBtn.addEventListener('click', () => this.unlock());
    // Join with a code: the links make way for the code box.
    const join = () => this.onJoin(this.codeInput.value);
    document.getElementById('join-open')!.addEventListener('click', () => this.showJoin(true));
    document.getElementById('join-cancel')!.addEventListener('click', () => this.showJoin(false));
    document.getElementById('join-btn')!.addEventListener('click', join);
    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') join();
      else if (e.key === 'Escape') this.showJoin(false);
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
    this.root.classList.toggle('howto-open', open);
  }

  /** A ?room= link or a pasted code: show it in the box. */
  setCode(code: string) {
    this.codeInput.value = code;
    if (code) this.showJoin(true, false);
  }

  /** Swap the room links for the code box (or back). */
  showJoin(open: boolean, focus = true) {
    this.joinRow.hidden = !open;
    this.links.hidden = open;
    if (open && focus) this.codeInput.focus();
    if (!open) document.getElementById('join-open')!.focus();
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

  /** PLAY: the vault lock turns (a clunk, the keyhole flares, the plate flashes), then Quick Play,
   *  a beat later so the unlock is seen before the safehouse replaces the title. */
  private unlock() {
    if (this.playBtn.disabled || this.root.classList.contains('unlocking')) return;
    sfx('unlock');
    this.root.classList.add('unlocking');
    setTimeout(() => this.onPlay(), 380);
    setTimeout(() => this.root.classList.remove('unlocking'), 900);
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
    for (const id of ['create-btn', 'browse-btn', 'join-open', 'join-btn']) (document.getElementById(id) as HTMLButtonElement).disabled = busy;
    this.playLabel.textContent = busy ? 'CONNECTING...' : 'PLAY';
    this.playBtn.classList.toggle('busy', busy);
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
