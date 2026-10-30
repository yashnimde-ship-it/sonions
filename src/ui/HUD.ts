const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Restart a one-shot CSS animation class on `el`. */
function flash(el: Element, cls: string) {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

/** The fixed on-screen HUD (DOM elements over the canvas, so it never scrolls). */
export class HUD {
  private objTitle = document.getElementById('obj-title')!;
  private objGems = document.getElementById('obj-gems')!;
  private objText = document.getElementById('obj-text')!;
  /** A second line under the objective (the vault and its keycard). */
  private objSub = Object.assign(document.createElement('div'), { className: 'obj-sub', hidden: true });
  private lastObjective = '';
  private area = document.getElementById('area')!;
  private prompt = document.getElementById('prompt')!;
  private message = document.getElementById('message')!;
  private messageText = document.getElementById('message-text')!;
  private carrying = document.getElementById('carrying')!;
  private health = document.getElementById('health')!;
  private healthFill = document.getElementById('health-fill')!;
  private healthText = document.getElementById('health-text')!;
  /** What the bar showed before a hit: it lingers, then drains down to the new value. */
  private healthTrail = (() => {
    const el = Object.assign(document.createElement('div'), { id: 'health-trail' });
    this.healthFill.before(el);
    return el;
  })();
  private lastHp: number | null = null;
  private timer = document.getElementById('timer')!;
  private alerts = document.getElementById('alerts')!;
  /** Big centre-screen words (streaks, ONE MORE TO WIN, 30 SECONDS), one at a time. */
  private calloutEl = (() => {
    const el = Object.assign(document.createElement('div'), { id: 'callout', hidden: true });
    document.getElementById('hud')!.append(el);
    return el;
  })();
  private callouts: { text: string; tone: string; sub: string }[] = [];
  private calloutBusy = false;
  private lastSecs = -1;
  private lastArea = '';
  private lastTimer = '';

  /** The heist's goal, always on screen: one gem per diamond (banked, carried, dropped, hidden). */
  /** `gems`: each diamond's state class, plus 'red' or 'cursed' when it's special. */
  setObjective(title: string, gems: string[], text: string, sub = '') {
    const key = title + gems.join() + text + sub;
    if (key === this.lastObjective) return;
    this.lastObjective = key;
    this.objTitle.textContent = title;
    this.objGems.innerHTML = gems.map((g) => `<i class="gem ${g}"></i>`).join('');
    this.objText.textContent = text;
    if (!this.objSub.isConnected) this.objText.after(this.objSub);
    this.objSub.hidden = !sub;
    this.objSub.textContent = sub;
  }

  /** The Runner's health bar; null hides it (the Saboteur has none). */
  setHealth(hp: number | null) {
    this.health.hidden = hp === null;
    const prev = this.lastHp;
    this.lastHp = hp;
    if (hp === null || hp === prev) return;
    this.healthFill.style.width = `${hp}%`;
    this.healthFill.className = hp > 50 ? 'ok' : hp > 25 ? 'low' : 'critical';
    this.healthText.textContent = hp === 0 ? 'KO' : String(hp);
    this.health.classList.toggle('critical', hp > 0 && hp <= 25);
    if (prev !== null && hp < prev) {
      // A hit: the panel jolts and flashes; the lost chunk stays lit, then drains away.
      this.healthTrail.style.width = `${hp}%`;
      flash(this.health, 'hit');
    } else {
      // A heal (or a fresh round): the trail keeps up at once.
      this.healthTrail.style.transition = 'none';
      this.healthTrail.style.width = `${hp}%`;
      void this.healthTrail.offsetWidth;
      this.healthTrail.style.transition = '';
      if (prev !== null && prev > 0) flash(this.health, 'heal');
    }
  }

  /**
   * A banked diamond flies from (x, y) on the page up into the objective's last banked slot,
   * which pops when it lands. `lost`: the Saboteur's view (their diamond is gone).
   */
  flyGem(x: number, y: number, red: boolean, lost: boolean, onLand?: () => void) {
    const banked = this.objGems.querySelectorAll('.gem.banked');
    const target = (banked[banked.length - 1] as HTMLElement | undefined) ?? this.objGems;
    const land = () => {
      const slot = this.objGems.querySelectorAll('.gem.banked');
      const el = (slot[slot.length - 1] as HTMLElement | undefined) ?? target;
      flash(el, lost ? 'gem-lost' : 'gem-pop');
      flash(this.objText, 'bump');
      onLand?.();
    };
    const r = target.getBoundingClientRect();
    if (reducedMotion.matches || !r.width) return land();
    const dx = r.left + r.width / 2 - x;
    const dy = r.top + r.height / 2 - y;
    const gem = Object.assign(document.createElement('i'), { className: `gem-fly${red ? ' red' : ''}` });
    gem.style.left = `${x}px`;
    gem.style.top = `${y}px`;
    document.getElementById('hud')!.append(gem);
    // Up and out first, then a swoop into the slot, spinning as it goes.
    gem
      .animate(
        [
          { transform: 'translate(-50%, -50%) rotate(45deg) scale(0.6)' },
          { transform: `translate(calc(-50% + ${dx * 0.25}px), calc(-50% + ${dy * 0.25 - 60}px)) rotate(225deg) scale(1.8)`, offset: 0.35 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(405deg) scale(0.9)` },
        ],
        { duration: 720, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
      )
      .finished.then(() => {
        gem.remove();
        land();
      }, () => gem.remove());
  }

  /** A big word in the middle of the screen; several queue up and play one after another. */
  callout(text: string, tone: 'gold' | 'red' | 'teal' = 'gold', sub = '') {
    this.callouts.push({ text, tone, sub });
    if (!this.calloutBusy) this.nextCallout();
  }

  private nextCallout() {
    const c = this.callouts.shift();
    if (!c) {
      this.calloutBusy = false;
      this.calloutEl.hidden = true;
      return;
    }
    this.calloutBusy = true;
    const big = Object.assign(document.createElement('b'), { textContent: c.text });
    const sub = Object.assign(document.createElement('span'), { textContent: c.sub, hidden: !c.sub });
    this.calloutEl.replaceChildren(big, sub);
    this.calloutEl.hidden = false;
    this.calloutEl.className = '';
    void this.calloutEl.offsetWidth;
    this.calloutEl.className = `tone-${c.tone} play`;
    setTimeout(() => this.nextCallout(), 1500);
  }

  /** What the player is holding, or null when empty-handed. */
  setCarrying(text: string | null) {
    this.carrying.hidden = !text;
    if (text) this.carrying.textContent = text;
  }

  /** A pop-up everyone sees when someone is caught by a trap; it fades out on its own. */
  alert(html: string, kind: 'danger' | 'good' = 'danger') {
    const el = document.createElement('div');
    el.className = `trap-alert ${kind}`;
    el.innerHTML = html;
    this.alerts.prepend(el);
    while (this.alerts.children.length > 3) this.alerts.lastElementChild!.remove();
    setTimeout(() => el.classList.add('gone'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  /** The round clock, e.g. SETUP 1:15; null hides it. */
  /** `live`: the heist itself is on, so the last 30 seconds build pressure. */
  setTimer(label: string | null, ms: number, live = false) {
    const secs = Math.ceil(ms / 1000);
    const text = label ? `${label} ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '';
    if (text === this.lastTimer) return;
    this.lastTimer = text;
    this.timer.hidden = !label;
    this.timer.textContent = text;
    this.timer.classList.toggle('urgent', !!label && secs <= 10);
    this.timer.classList.toggle('pressure', !!label && live && secs <= 30 && secs > 10);
    // Each of the final ten seconds knocks the timer bigger for a moment.
    if (label && live && secs <= 10 && secs !== this.lastSecs) flash(this.timer, 'tick');
    this.lastSecs = secs;
  }

  setArea(name: string) {
    if (name === this.lastArea) return;
    this.lastArea = name;
    this.area.textContent = name || 'The Estate';
  }

  /** What the prompt box says right now. */
  get promptText() {
    return this.prompt.hidden ? null : this.prompt.textContent;
  }

  setPrompt(text: string | null) {
    this.prompt.hidden = !text;
    if (text) this.prompt.textContent = text;
  }

  showMessage(text: string) {
    this.messageText.textContent = text;
    this.message.hidden = false;
  }

  hideMessage() {
    this.message.hidden = true;
  }

  get messageOpen() {
    return !this.message.hidden;
  }
}
