// On-screen controls for phones and tablets: a thumbstick that appears wherever the left thumb
// lands, and buttons on the right that change with what you're doing (Runner, Saboteur, Hider,
// Seeker, safehouse). They stand in for the keyboard, so the game reads them like keys. They
// show on touch-first devices, and on any device once the screen is touched.

import { setTouchMove, touchKey } from './Controls';

export interface TouchButton {
  id: string;
  /** The key it presses (e.g. 'KeyE'), or '' for a button the game handles itself. */
  key: string;
  label: string;
  /** Bigger, for the main action. */
  big?: boolean;
  /** A switch (on/off) rather than a button you press. */
  toggle?: boolean;
}

const STICK_R = 52; // how far the knob travels, CSS px

export class TouchControls {
  private root = document.createElement('div');
  private zone = document.createElement('div');
  private base = document.createElement('div');
  private knob = document.createElement('div');
  private pad = document.createElement('div');
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private lastButtons = '';
  private toggles = new Set<string>();
  /** Touch controls are in use on this device. */
  enabled = matchMedia('(pointer: coarse)').matches;
  /** A button without a key was pressed. */
  onPress: (id: string) => void = () => {};

  constructor() {
    this.root.id = 'touch';
    this.root.hidden = true;
    this.zone.className = 'touch-zone';
    this.base.className = 'touch-stick';
    this.knob.className = 'touch-knob';
    this.base.append(this.knob);
    this.zone.append(this.base);
    this.pad.className = 'touch-pad';
    this.root.append(this.zone, this.pad);
    // Just above the game canvas and below the menus and HUD: their buttons win where they
    // overlap, and a touch anywhere else reaches the stick.
    document.getElementById('game')!.after(this.root);
    window.addEventListener('touchstart', () => (this.enabled = true), { passive: true, once: true });

    // The stick: it appears under the thumb and follows it.
    this.zone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      this.zone.setPointerCapture(e.pointerId);
      this.origin = { x: e.clientX, y: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.classList.add('on');
      this.moveStick(e.clientX, e.clientY);
    });
    this.zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.moveStick(e.clientX, e.clientY);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.base.classList.remove('on');
      this.knob.style.transform = '';
      setTouchMove(0, 0);
    };
    this.zone.addEventListener('pointerup', release);
    this.zone.addEventListener('pointercancel', release);

    // Buttons: held while the finger is on them.
    const button = (e: PointerEvent) => (e.target as HTMLElement).closest<HTMLButtonElement>('[data-id]');
    this.pad.addEventListener('pointerdown', (e) => {
      const b = button(e);
      if (!b) return;
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.classList.add('down');
      const id = b.dataset.id!;
      if (b.dataset.toggle) {
        if (this.toggles.has(id)) this.toggles.delete(id);
        else this.toggles.add(id);
        b.classList.toggle('on', this.toggles.has(id));
        // A switch with a key holds it down while on (RUN holds Shift).
        if (b.dataset.key) touchKey(b.dataset.key, this.toggles.has(id));
      } else if (b.dataset.key) touchKey(b.dataset.key, true);
      else this.onPress(id);
    });
    const up = (e: PointerEvent) => {
      const b = button(e);
      if (!b) return;
      b.classList.remove('down');
      if (b.dataset.key && !b.dataset.toggle) touchKey(b.dataset.key, false);
    };
    this.pad.addEventListener('pointerup', up);
    this.pad.addEventListener('pointercancel', up);
    this.pad.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private moveStick(x: number, y: number) {
    let dx = x - this.origin.x;
    let dy = y - this.origin.y;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      dx = (dx / d) * STICK_R;
      dy = (dy / d) * STICK_R;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // A little dead zone in the middle, so resting a thumb doesn't drift.
    const m = Math.min(1, d / STICK_R);
    setTouchMove(m < 0.2 ? 0 : dx / STICK_R, m < 0.2 ? 0 : dy / STICK_R);
  }

  /** Is this switch on? */
  isOn(id: string) {
    return this.toggles.has(id);
  }

  /** Show the controls (or not), with these buttons, and the stick unless `stick` is false. */
  set(visible: boolean, buttons: TouchButton[] = [], stick = true) {
    const show = visible && this.enabled;
    this.zone.hidden = !stick;
    document.body.classList.toggle('touch', this.enabled);
    if (this.root.hidden === show) {
      this.root.hidden = !show;
      if (!show) {
        setTouchMove(0, 0);
        this.stickId = null;
        this.base.classList.remove('on');
      }
    }
    if (!show) return;
    const key = JSON.stringify(buttons);
    if (key === this.lastButtons) return;
    // The old buttons go: let go of what they held (a finger on one won't get its pointerup),
    // except switches that stay. Switches that went away are off again.
    const was = JSON.parse(this.lastButtons || '[]') as TouchButton[];
    for (const old of was) {
      const stays = old.toggle && this.toggles.has(old.id) && buttons.some((b) => b.id === old.id && b.toggle);
      if (stays) continue;
      this.toggles.delete(old.id);
      if (old.key) touchKey(old.key, false);
    }
    this.pad.innerHTML = buttons
      .map((b) => `<button type="button" class="tbtn${b.big ? ' big' : ''}${this.toggles.has(b.id) ? ' on' : ''}" data-id="${b.id}" data-key="${b.key}"${b.toggle ? ' data-toggle="1"' : ''}>${b.label}</button>`)
      .join('');
    this.lastButtons = key;
  }
}
