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
  private lastArea = '';

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
