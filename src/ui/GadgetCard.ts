import { gadgetFooter, GADGETS } from '../data/gadgets';
import type { TrapKind } from '../data/trapKinds';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The Gadget Lab's card: stand on a test pad and it slides in on the right with that trap's
 * name, cost, what it does, its numbers and a tip, and E to fire a demo on the pad.
 */
export class GadgetCard {
  private el = Object.assign(document.createElement('aside'), { className: 'gadget-card px-panel', hidden: true });
  private shown: TrapKind['id'] | null = null;

  constructor() {
    this.el.setAttribute('aria-live', 'polite');
    document.getElementById('lobby')!.append(this.el);
  }

  /** The trap whose pad you're on, or null to put the card away. */
  show(kind: TrapKind | null) {
    if ((kind?.id ?? null) === this.shown) return;
    this.shown = kind?.id ?? null;
    if (!kind) {
      this.el.hidden = true;
      return;
    }
    const info = GADGETS[kind.id];
    this.el.style.setProperty('--c', kind.color);
    this.el.innerHTML = `
      <header><i class="gc-swatch"></i><div><b>${esc(kind.name.toUpperCase())}</b><small>SABOTEUR TRAP · ${kind.cost} ENERGY</small></div></header>
      <p class="gc-does">${esc(info.does)}</p>
      <ul class="gc-stats">${info.stats.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      <p class="gc-tip"><span>TIP</span>${esc(info.tip)}</p>
      <p class="gc-foot">${esc(gadgetFooter(kind.id))}</p>
      <p class="gc-key"><kbd>E</kbd> fire a demo on the pad</p>`;
    // Slide in again for each new pad.
    this.el.hidden = false;
    this.el.classList.remove('in');
    void this.el.offsetWidth;
    this.el.classList.add('in');
  }
}
