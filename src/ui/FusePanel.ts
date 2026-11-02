// The fuse box's repair panel (Among Us's "Fix Lights"): a row of switches, some knocked off by
// the Saboteur's cut. Flip every one to ON (click or tap them, or press 1-5) and the lights come
// back. Esc, or walking away, closes it.

import { BREAKER } from '../data/breakers';

export class FusePanel {
  private root: HTMLElement;
  private row: HTMLElement;
  private on: boolean[] = [];
  private box = '';
  onDone: (box: string) => void = () => {};
  onFlip: () => void = () => {};

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'fuse-panel';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="fuse-card"><span class="fuse-title">⚡ FIX THE LIGHTS</span><div class="fuse-row"></div><span class="fuse-hint">Flip every switch to ON · click, tap or press 1-${BREAKER.switches} · Esc closes</span></div>`;
    document.body.append(this.root);
    this.row = this.root.querySelector('.fuse-row')!;
    this.row.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (b) this.flip(Number(b.dataset.i));
    });
    window.addEventListener('keydown', (e) => {
      if (this.root.hidden) return;
      const n = Number(e.key);
      if (n >= 1 && n <= BREAKER.switches) this.flip(n - 1);
      if (e.key === 'Escape') this.close();
    });
  }

  get open() {
    return !this.root.hidden;
  }

  get boxId() {
    return this.box;
  }

  /** Open for this box, with a few switches knocked off (never all on). */
  show(box: string) {
    this.box = box;
    this.on = Array.from({ length: BREAKER.switches }, () => Math.random() < 0.4);
    if (this.on.every(Boolean)) this.on[Math.floor(Math.random() * this.on.length)] = false;
    if (this.on.filter((x) => !x).length < 2) this.on[this.on.findIndex(Boolean)] = false;
    this.root.hidden = false;
    this.render();
  }

  close() {
    this.root.hidden = true;
    this.box = '';
  }

  private flip(i: number) {
    if (this.root.hidden || i < 0 || i >= this.on.length) return;
    this.on[i] = !this.on[i];
    this.onFlip();
    this.render();
    if (this.on.every(Boolean)) {
      const box = this.box;
      this.root.classList.add('fixed');
      setTimeout(() => {
        this.root.classList.remove('fixed');
        this.close();
        this.onDone(box);
      }, 350);
    }
  }

  private render() {
    this.row.innerHTML = this.on.map((v, i) => `<button type="button" class="fuse-switch ${v ? 'on' : 'off'}" data-i="${i}"><span class="lamp"></span><span class="lever"></span><span class="n">${i + 1}</span></button>`).join('');
  }
}
