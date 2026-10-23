/** The fixed on-screen HUD (DOM elements over the canvas, so it never scrolls). */
export class HUD {
  private lootTotal = document.getElementById('loot-total')!;
  private lootCount = document.getElementById('loot-count')!;
  private area = document.getElementById('area')!;
  private prompt = document.getElementById('prompt')!;
  private message = document.getElementById('message')!;
  private messageText = document.getElementById('message-text')!;
  private carrying = document.getElementById('carrying')!;
  private lastArea = '';

  setLoot(total: number, taken: number, available: number) {
    this.lootTotal.textContent = `$${total.toLocaleString()}`;
    this.lootCount.textContent = `${taken}/${available}`;
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
