/**
 * The Saboteur's setup checklist, top centre: step 1 hide the diamonds (one gem per diamond),
 * step 2 guard them with traps, then start the heist.
 */
export class SetupPanel {
  private root = document.createElement('section');
  private step1 = document.createElement('div');
  private step2 = document.createElement('div');
  private gems = document.createElement('div');
  private count1 = document.createElement('b');
  private hint1 = document.createElement('p');
  private count2 = document.createElement('b');
  private hint2 = document.createElement('p');
  private ready = document.createElement('button');
  private last = '';

  constructor(onReady: () => void) {
    this.root.id = 'setup-panel';
    this.root.hidden = true;
    this.step1.className = 'setup-step';
    this.step1.innerHTML = '<span class="num">1</span><span class="what">HIDE THE DIAMONDS</span>';
    this.gems.className = 'setup-gems';
    this.hint1.className = 'setup-hint';
    this.step1.append(this.count1, this.gems, this.hint1);
    this.step2.className = 'setup-step';
    this.step2.innerHTML = '<span class="num">2</span><span class="what">GUARD THEM WITH TRAPS</span>';
    this.hint2.className = 'setup-hint';
    this.step2.append(this.count2, this.hint2);
    this.ready.type = 'button';
    this.ready.className = 'setup-ready';
    this.ready.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.ready.addEventListener('click', () => {
      if (!this.ready.disabled) onReady();
    });
    this.root.append(this.step1, this.step2, this.ready);
    document.getElementById('hud')!.append(this.root);
  }

  show(on: boolean) {
    this.root.hidden = !on;
  }

  update(s: { hidden: number; total: number; traps: number; slots: number; guarded: number; selected: number | null }) {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    const allHidden = s.hidden >= s.total;
    this.step1.classList.toggle('active', !allHidden);
    this.step1.classList.toggle('done', allHidden);
    this.step2.classList.toggle('active', allHidden);
    this.count1.textContent = `${s.hidden}/${s.total}`;
    this.gems.innerHTML = Array.from({ length: s.total }, (_, i) => `<i class="gem ${i < s.hidden ? 'hidden-in' : 'tray'}"></i>`).join('');
    // Only the step you're on explains itself, so the panel stays small.
    this.hint1.textContent = allHidden ? '' : 'Click furniture with a gold outline to hide a diamond inside. Max 2 per room.';
    this.hint1.hidden = allHidden;
    this.count2.textContent = `${s.traps}/${s.slots} · GUARDED ${s.guarded}/${s.total}`;
    this.hint2.textContent = allHidden ? 'Pick a trap below (keys 1-9, 0, -, =) and put it next to a diamond: a shield shows it is guarded.' : '';
    this.hint2.hidden = !allHidden;
    this.ready.disabled = !allHidden;
    this.ready.textContent = allHidden ? 'SETUP DONE · START HEIST' : `HIDE ${s.total - s.hidden} MORE DIAMOND${s.total - s.hidden === 1 ? '' : 'S'} FIRST`;
  }
}
