import { CHARACTERS, type CharacterId } from '../config';
import { CHARACTER_INFO } from '../data/characters';
import type { PortalState } from '../net/protocol';

const cardHtml = (id: CharacterId, title: string) => {
  const info = CHARACTER_INFO[id];
  return `
    <img class="portrait" src="/assets/characters/${id}-portrait.png" alt="">
    <div class="info">
      <span class="slot">${title}</span>
      <span class="nick">${info.nick} <span class="muted">${info.name}</span></span>
      <span class="ability">${info.ability} <span class="role ${info.role.toLowerCase()}">${info.role}</span></span>
      <span class="blurb">${info.blurb}</span>
    </div>`;
};

/** The safehouse HUD: portal status, who's online, your crew card, and the wardrobe picker. */
export class LobbyUI {
  private root = document.getElementById('lobby')!;
  private portalList = document.getElementById('portal-list')!;
  private online = document.getElementById('online-count')!;
  private myCard = document.getElementById('my-card')!;
  private picker = document.getElementById('picker')!;
  private pickerCards = document.getElementById('picker-cards')!;
  private disconnected = document.getElementById('disconnected')!;
  private startBtn = document.getElementById('start-btn') as HTMLButtonElement;
  private lastPortals = '';
  private lastCard = '';
  private choice = 0;
  /** Called with the chosen character when the picker is confirmed. */
  onPick: (id: CharacterId) => void = () => {};
  /** START HEIST: jump into the portal closest to filling up. */
  onQuickJoin: () => void = () => {};

  constructor() {
    this.startBtn.addEventListener('click', () => {
      this.onQuickJoin();
      this.startBtn.blur();
    });
    CHARACTERS.forEach((id, i) => {
      const el = document.createElement('button');
      el.className = 'pick';
      el.style.setProperty('--accent', CHARACTER_INFO[id].color);
      el.innerHTML = `<img src="/assets/characters/${id}-portrait.png" alt=""><span>${CHARACTER_INFO[id].nick}</span><small>${CHARACTER_INFO[id].ability}</small>`;
      el.addEventListener('click', () => {
        this.choice = i;
        this.confirmPick();
      });
      el.addEventListener('mouseenter', () => this.movePick(i - this.choice));
      this.pickerCards.append(el);
    });
  }

  show(visible: boolean) {
    this.root.hidden = !visible;
    if (!visible) this.closePicker();
  }

  showDisconnected() {
    this.root.hidden = false;
    this.disconnected.hidden = false;
  }

  setPortals(portals: PortalState[], online: number) {
    this.online.textContent = String(online);
    const key = JSON.stringify(portals);
    if (key === this.lastPortals) return;
    this.lastPortals = key;
    this.portalList.innerHTML = portals
      .map((p) => {
        const status = p.countdown !== null ? `<span class="go">GO ${p.countdown}</span>` : `<span class="count">${p.count}/${p.size}</span>`;
        const dots = Array.from({ length: p.size }, (_, i) => `<i class="${i < p.count ? 'on' : ''}"></i>`).join('');
        return `<div class="portal-row p${p.size}"><span class="size">${p.size}P</span><span class="dots">${dots}</span>${status}</div>`;
      })
      .join('');
  }

  setMe(name: string, id: CharacterId) {
    const key = name + id;
    if (key === this.lastCard) return;
    this.lastCard = key;
    this.myCard.style.setProperty('--accent', CHARACTER_INFO[id].color);
    this.myCard.innerHTML = cardHtml(id, name);
  }

  // ---------- Wardrobe picker ----------

  get pickerOpen() {
    return !this.picker.hidden;
  }

  openPicker(current: CharacterId) {
    this.choice = CHARACTERS.indexOf(current);
    this.picker.hidden = false;
    this.movePick(0);
  }

  closePicker() {
    this.picker.hidden = true;
  }

  movePick(delta: number) {
    this.choice = (this.choice + delta + CHARACTERS.length) % CHARACTERS.length;
    [...this.pickerCards.children].forEach((el, i) => el.classList.toggle('selected', i === this.choice));
  }

  confirmPick() {
    this.onPick(CHARACTERS[this.choice]);
    this.closePicker();
  }
}
