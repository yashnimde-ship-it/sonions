import { kindLimit, trapSlots } from '../data/round';
import { TRAP_KINDS, type TrapKind, type TrapKindId } from '../data/trapKinds';
import { drawTrapIcon } from '../systems/TrapArt';

/** The icon canvases' own size (px): drawn sharp for 2x screens, shown at the CSS size. */
const ICON = 96;

const KEY_LABEL: Record<string, string> = { Minus: '-', Equal: '=' };

/** The Saboteur's trap cards along the bottom of the screen: icon, key, name and energy cost. */
export class TrapBar {
  private el = document.createElement('div');
  private cards = new Map<string, HTMLElement>();
  private slots = document.createElement('div');
  private energy = document.createElement('span');
  private slotCount = document.createElement('span');

  constructor(onPick: (kind: TrapKind) => void) {
    this.el.id = 'trapbar';
    this.el.hidden = true;
    this.slots.className = 'trap-slots';
    this.energy.className = 'trap-energy';
    this.slotCount.className = 'trap-slot-count';
    this.energy.textContent = 'ENERGY 0/200';
    // The count gets its own element: rewriting the whole box would wipe the energy readout.
    this.slots.append(this.slotCount, this.energy);
    this.el.append(this.slots);
    for (const kind of TRAP_KINDS) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'trap-card';
      card.style.setProperty('--c', kind.color);
      card.title = `${kind.name}: ${kind.cost} energy`;
      const key = document.createElement('span');
      key.className = 'trap-key';
      key.textContent = KEY_LABEL[kind.key] ?? kind.key.replace('Digit', '');
      const icon = document.createElement('canvas');
      icon.width = ICON;
      icon.height = ICON;
      icon.className = 'trap-icon';
      const name = document.createElement('span');
      name.className = 'trap-name';
      name.textContent = kind.name;
      const cost = document.createElement('span');
      cost.className = 'trap-cost';
      cost.textContent = String(kind.cost);
      const count = document.createElement('span');
      count.className = 'trap-count';
      card.append(key, icon, name, cost, count);
      card.addEventListener('pointerdown', (e) => e.stopPropagation());
      card.addEventListener('click', () => onPick(kind));
      this.el.append(card);
      this.cards.set(kind.id, card);
    }
    document.getElementById('hud')!.append(this.el);
  }

  /** Redraw the icons (the art is animated, so call this now and then while shown). */
  paintIcons(nowMs: number) {
    for (const kind of TRAP_KINDS) {
      const icon = this.cards.get(kind.id)!.querySelector('canvas')!;
      const g = icon.getContext('2d')!;
      g.clearRect(0, 0, ICON, ICON);
      // The whole sprite fitted into the square, centred (the wide ones sit in a band across it).
      drawTrapIcon(g, kind, ICON, nowMs);
    }
  }

  /** How many of each are down, against the round's limits. */
  setCounts(placed: TrapKindId[], crew: number) {
    const slots = trapSlots(crew);
    this.slotCount.innerHTML = `TRAPS<b>${placed.length}/${slots}</b>`;
    for (const kind of TRAP_KINDS) {
      const n = placed.filter((k) => k === kind.id).length;
      const card = this.cards.get(kind.id)!;
      card.querySelector('.trap-count')!.textContent = `${n}/${kindLimit(kind.id, crew)}`;
      card.classList.toggle('maxed', n >= kindLimit(kind.id, crew) || placed.length >= slots);
    }
  }

  setEnergy(current: number, maximum: number) {
    this.energy.textContent = `ENERGY ${current}/${maximum}`;
    for (const kind of TRAP_KINDS) this.cards.get(kind.id)!.classList.toggle('unaffordable', current < kind.cost);
  }

  show(on: boolean) {
    this.el.hidden = !on;
  }

  get visible() {
    return !this.el.hidden;
  }

  select(id: string | null) {
    for (const [k, card] of this.cards) card.classList.toggle('selected', k === id);
  }
}
