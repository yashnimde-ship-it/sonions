import { CHARACTERS, characterSheet, CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAMES } from '../config';
import { CHARACTER_INFO } from '../data/characters';

const LINEUP_SCALE = 2.5;
const NAME_KEY = 'vault-breakers-name';

/** The title screen: logo, crew lineup, name box, Play and How to Play. */
export class TitleUI {
  private root = document.getElementById('title')!;
  private howto = document.getElementById('howto')!;
  private nameInput = document.getElementById('name-input') as HTMLInputElement;
  private playBtn = document.getElementById('play-btn') as HTMLButtonElement;
  private error = document.getElementById('title-error')!;
  onPlay: () => void = () => {};

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
    if (!this.nameInput.value) this.nameInput.value = `Bandit${Math.floor(100 + Math.random() * 900)}`;
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.onPlay();
    });
    this.playBtn.addEventListener('click', () => this.onPlay());
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

  setBusy(busy: boolean, error = '') {
    this.playBtn.disabled = busy;
    this.playBtn.textContent = busy ? 'CONNECTING...' : 'PLAY ONLINE';
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
