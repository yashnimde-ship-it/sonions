import { CHARACTERS, type CharacterId } from '../config';
import { abilityFor, CHARACTER_INFO } from '../data/characters';
import type { PortalState, Taken } from '../net/protocol';

const abilityLine = (id: CharacterId, role: 'runner' | 'saboteur') => {
  const a = abilityFor(id, role);
  return `<span class="ability"><span class="role ${role}">${role === 'runner' ? 'RUN' : 'SAB'}</span> ${a.name} <span class="blurb">${a.blurb}</span></span>`;
};

const cardHtml = (id: CharacterId, title: string) => {
  const info = CHARACTER_INFO[id];
  return `
    <img class="portrait" src="/assets/characters/${id}-portrait.png" alt="">
    <div class="info">
      <span class="slot">${title}</span>
      <span class="nick">${info.nick} <span class="muted">${info.name}</span></span>
      ${abilityLine(id, 'runner')}
      ${abilityLine(id, 'saboteur')}
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
  /** Characters other players have, and who has them. */
  private taken = new Map<CharacterId, string>();
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
      el.innerHTML = `<img src="/assets/characters/${id}-portrait.png" alt=""><span>${CHARACTER_INFO[id].nick}</span><small><b class="runner">RUN</b> ${abilityFor(id, 'runner').name}</small><small><b class="saboteur">SAB</b> ${abilityFor(id, 'saboteur').name}</small><em class="owner"></em>`;
      el.addEventListener('click', () => {
        if (this.taken.has(id)) return;
        this.choice = i;
        this.confirmPick();
      });
      el.addEventListener('mouseenter', () => {
        if (!this.taken.has(id)) this.select(i);
      });
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
