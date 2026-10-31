import { kindLimit, trapSlots } from '../data/round';
import { TRAP_KINDS, type TrapKind, type TrapKindId } from '../data/trapKinds';
import { drawTrapIcon } from '../systems/TrapArt';

/** The icon canvases' own size (px): a band wider than tall, so wide traps get room; drawn at 2x
 *  the CSS size so it's sharp on 2x screens. */
const ICON_W = 104;
const ICON_H = 80;
/** Ambient sparks drifting up behind the cards: left (% of the bar), rise time, delay (s). */
const SPARKS = [[8, 7, 0], [23, 9, 3.1], [37, 8, 5.6], [52, 10, 1.4], [66, 7.5, 4.2], [79, 9.5, 2.3], [92, 8.5, 6.4]];

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
    // A few slow sparks behind the cards (purely decoration; the CSS keeps them quiet).
    for (const [x, d, delay] of SPARKS) {
      const spark = document.createElement('i');
      spark.className = 'trap-spark';
      spark.setAttribute('aria-hidden', 'true');
      spark.style.cssText = `--x:${x}%;--d:${d}s;--delay:-${delay}s`;
      this.el.append(spark);
    }
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
      icon.width = ICON_W;
      icon.height = ICON_H;
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
      g.clearRect(0, 0, ICON_W, ICON_H);
      // The whole sprite fitted into the band, centred: square ones fill its height, wide ones its width.
      drawTrapIcon(g, kind, ICON_W, ICON_H, nowMs);
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

  /** A trap just went down: its card flashes in its colour for a moment. */
  flash(id: string) {
    const card = this.cards.get(id);
    if (!card) return;
    card.classList.remove('placed-flash');
    void card.offsetWidth;
    card.classList.add('placed-flash');
  }

  select(id: string | null) {
    for (const [k, card] of this.cards) card.classList.toggle('selected', k === id);
  }
}
