import type { Interactable } from '../map/TileMap';

/** Saboteur setup controls for positioning the nine diamonds and opening the heist early. */
export class DiamondBar {
  private root = document.createElement('section');
  private note = document.createElement('div');
  private buttons = new Map<string, HTMLButtonElement>();
  private ready: HTMLButtonElement;

  constructor(items: Interactable[], onSelect: (id: string) => void, onReady: () => void) {
    this.root.id = 'diamond-bar';
    this.root.hidden = true;
    const head = document.createElement('header');
    head.textContent = `HIDE THE TREASURE · ${items.length} DIAMONDS`;
    this.root.append(head);

    const gems = document.createElement('div');
    gems.className = 'diamond-slots';
    items.forEach((item, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'diamond-slot';
      button.textContent = String(i + 1);
      button.title = `Select diamond ${i + 1} to move it`;
      button.setAttribute('aria-label', `Select diamond ${i + 1}`);
      button.addEventListener('click', () => onSelect(item.id));
      gems.append(button);
      this.buttons.set(item.id, button);
    });
    this.root.append(gems);

    this.note.className = 'diamond-note';
    this.note.textContent = 'Select a diamond, then click an open spot in the house.';
    this.root.append(this.note);

    this.ready = document.createElement('button');
    this.ready.type = 'button';
    this.ready.className = 'ready-heist';
    this.ready.textContent = 'SETUP DONE · START HEIST';
    this.ready.addEventListener('click', onReady);
    this.root.append(this.ready);
    document.getElementById('hud')!.append(this.root);
  }

  show(on: boolean) { this.root.hidden = !on; }
  select(id: string | null) {
    for (const [key, button] of this.buttons) button.classList.toggle('selected', id === key);
  }
  message(text: string) { this.note.textContent = text; }
}
