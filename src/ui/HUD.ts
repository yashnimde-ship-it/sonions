/** The fixed on-screen HUD (DOM elements over the canvas, so it never scrolls). */
export class HUD {
  private lootTotal = document.getElementById('loot-total')!;
  private lootCount = document.getElementById('loot-count')!;
  private area = document.getElementById('area')!;
  private prompt = document.getElementById('prompt')!;
  private message = document.getElementById('message')!;
  private messageText = document.getElementById('message-text')!;
  private carrying = document.getElementById('carrying')!;
  private health = document.getElementById('health')!;
  private healthFill = document.getElementById('health-fill')!;
  private healthText = document.getElementById('health-text')!;
  private timer = document.getElementById('timer')!;
  private alerts = document.getElementById('alerts')!;
  private lastArea = '';
  private lastTimer = '';

  setLoot(total: number, taken: number, available: number) {
    this.lootTotal.textContent = `$${total.toLocaleString()}`;
    this.lootCount.textContent = `${taken}/${available}`;
  }

  /** The Runner's health bar; null hides it (the Saboteur has none). */
  setHealth(hp: number | null) {
    this.health.hidden = hp === null;
    if (hp === null) return;
    this.healthFill.style.width = `${hp}%`;
    this.healthFill.className = hp > 50 ? 'ok' : hp > 25 ? 'low' : 'critical';
    this.healthText.textContent = hp === 0 ? 'KO' : String(hp);
  }

  /** What the player is holding, or null when empty-handed. */
  setCarrying(text: string | null) {
    this.carrying.hidden = !text;
    if (text) this.carrying.textContent = text;
  }

  /** A pop-up everyone sees when someone is caught by a trap; it fades out on its own. */
  alert(html: string) {
    const el = document.createElement('div');
    el.className = 'trap-alert';
    el.innerHTML = html;
    this.alerts.prepend(el);
    while (this.alerts.children.length > 3) this.alerts.lastElementChild!.remove();
    setTimeout(() => el.classList.add('gone'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  /** The round clock, e.g. SETUP 1:15; null hides it. */
  setTimer(label: string | null, ms: number) {
    const secs = Math.ceil(ms / 1000);
    const text = label ? `${label} ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '';
    if (text === this.lastTimer) return;
    this.lastTimer = text;
    this.timer.hidden = !label;
    this.timer.textContent = text;
    this.timer.classList.toggle('urgent', !!label && secs <= 10);
  }

  setArea(name: string) {
    if (name === this.lastArea) return;
    this.lastArea = name;
    this.area.textContent = name || 'The Estate';
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
