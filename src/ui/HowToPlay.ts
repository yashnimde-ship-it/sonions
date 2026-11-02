// "How to play": a short card for the role you've just been given, shown when a round starts
// (after the role banner) so a first-time player knows the goal and the keys in ten seconds.
// GOT IT closes it; the ? button beside the contract card brings it back.

import type { GameMode } from '../data/hideSeek';

export type HowToRole = 'runner' | 'saboteur' | 'thief' | 'insider' | 'hider' | 'seeker';

interface Card {
  title: string;
  color: string;
  goal: string;
  steps: [string, string][];
  keys: [string, string][];
  touchKeys: [string, string][];
}

const CARDS: Record<HowToRole, Card> = {
  runner: {
    title: 'RUNNER',
    color: '#2ec4b6',
    goal: 'Pull off the mission, in order, before the clock runs out.',
    steps: [
      ['💻', 'HACK the security terminal (green screen): hold E'],
      ['🔑', 'Find the KEYCARD (marked gold after the hack), open the VAULT'],
      ['👑', 'Grab the CROWN JEWEL inside'],
      ['🚐', 'Carry it to the GETAWAY to win'],
    ],
    keys: [['WASD', 'move'], ['Shift', 'sprint'], ['E', 'open · search · hack'], ['Q', 'ability'], ['H', 'pass loot'], ['G', 'ping']],
    touchKeys: [['Stick', 'move'], ['E', 'open · search · hack'], ['Q', 'ability']],
  },
  saboteur: {
    title: 'SABOTEUR',
    color: '#ff4d6a',
    goal: 'Stop the Runners finishing the mission before time runs out.',
    steps: [
      ['💎', 'SETUP: click furniture to hide the diamonds'],
      ['🪤', 'SETUP: pick a trap below, click the floor to place it (costs energy)'],
      ['⚡', 'HEIST: click a fuse box to cut the lights (40 energy)'],
      ['🎯', 'HEIST: click trap plates to fire them; right-click a trap to move it once'],
    ],
    keys: [['WASD', 'move camera'], ['Click', 'hide · place · fire'], ['Right-click', 'remove · move'], ['Q', 'ability']],
    touchKeys: [['Drag', 'move camera'], ['Pinch', 'zoom'], ['Tap', 'hide · place · fire']],
  },
  thief: {
    title: 'THIEF',
    color: '#2ec4b6',
    goal: 'Bank the diamonds, or find the Insider hiding among you.',
    steps: [
      ['🔍', 'Search furniture (hold E) and bank diamonds at the GETAWAY'],
      ['🔫', 'You have 1 bullet: F or right-click shoots. Shoot a thief and it costs you'],
      ['📢', 'You have 1 meeting: M. Talk it out, vote someone out'],
      ['👀', 'Watch for disturbed furniture: the Insider stashes diamonds'],
    ],
    keys: [['WASD', 'move'], ['E', 'search'], ['F', 'shoot'], ['M', 'meeting']],
    touchKeys: [['Stick', 'move'], ['E', 'search'], ['Tap ×2', 'shoot'], ['📢', 'meeting']],
  },
  insider: {
    title: 'THE INSIDER',
    color: '#ff4d6a',
    goal: 'Act like a thief. Keep the diamonds in the house; take thieves out.',
    steps: [
      ['🤫', 'Nobody knows. Search and walk like everyone else'],
      ['💎', 'Carry a diamond to other furniture and hold E to stash it'],
      ['🔫', '3 bullets, one every 25s: F or right-click'],
      ['🗳️', 'Survive the meetings: blame someone else'],
    ],
    keys: [['WASD', 'move'], ['E', 'search · stash'], ['F', 'shoot'], ['M', 'meeting']],
    touchKeys: [['Stick', 'move'], ['E', 'search · stash'], ['Tap ×2', 'shoot']],
  },
  hider: {
    title: 'HIDER',
    color: '#2ec4b6',
    goal: 'Survive the hunt in the dark. Near the end, the main entrance opens.',
    steps: [
      ['🫥', 'Hide in a wardrobe, curtain or bar: E'],
      ['🔦', 'Stay out of the Seeker\'s flashlight'],
      ['💨', 'Q boosts you away (it makes noise)'],
      ['🚪', 'When the entrance opens, escape through it'],
    ],
    keys: [['WASD', 'move'], ['E', 'hide'], ['Q', 'boost'], ['G', 'ping']],
    touchKeys: [['Stick', 'move'], ['E', 'hide'], ['Q', 'boost']],
  },
  seeker: {
    title: 'SEEKER',
    color: '#ff4d6a',
    goal: 'Find and catch every Hider before time runs out.',
    steps: [
      ['⏳', 'Count in the Staff Room while they hide'],
      ['🔦', 'Hunt with your flashlight; E searches a hiding place'],
      ['🔫', 'Right-click or F to shoot (two hits catch); a miss costs you'],
      ['✨', 'Q fires a flare, C a heartbeat scan'],
    ],
    keys: [['WASD', 'move'], ['Right-click / F', 'shoot'], ['E', 'search'], ['Q / C', 'flare / scan'], ['R', 'reload']],
    touchKeys: [['Stick', 'move'], ['Tap ×2', 'shoot'], ['E', 'search']],
  },
};

/** Which card a round's role gets. */
export function howToRole(mode: GameMode, saboteur: boolean, insider: boolean): HowToRole {
  if (mode === 'insideJob') return insider ? 'insider' : 'thief';
  if (mode === 'hideSeek') return saboteur ? 'seeker' : 'hider';
  return saboteur ? 'saboteur' : 'runner';
}

export class HowToPlay {
  private root: HTMLElement;
  private help: HTMLButtonElement;
  private role: HowToRole | null = null;
  private touch = false;
  private showTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'how-to';
    this.root.hidden = true;
    document.body.append(this.root);
    this.help = document.createElement('button');
    this.help.id = 'how-to-btn';
    this.help.type = 'button';
    this.help.title = 'How to play';
    this.help.textContent = '?';
    this.help.hidden = true;
    document.body.append(this.help);
    this.help.addEventListener('click', () => (this.root.hidden ? this.open() : this.close()));
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-close]')) this.close();
    });
  }

  get isOpen() {
    return !this.root.hidden;
  }

  /** A new round: the card for this role, after `delayMs` (the role banner shows first). */
  start(role: HowToRole, touch: boolean, delayMs: number) {
    this.role = role;
    this.touch = touch;
    this.help.hidden = false;
    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = setTimeout(() => this.open(), delayMs);
  }

  open() {
    if (!this.role) return;
    const c = CARDS[this.role];
    const keys = this.touch ? c.touchKeys : c.keys;
    this.root.style.setProperty('--how-color', c.color);
    this.root.innerHTML = `
      <div class="how-card">
        <span class="how-kicker">HOW TO PLAY · YOU ARE</span>
        <h2>${c.title}</h2>
        <p class="how-goal">${c.goal}</p>
        <ol>${c.steps.map(([icon, text], i) => `<li><span class="how-n">${i + 1}</span><span class="how-icon">${icon}</span><span>${text}</span></li>`).join('')}</ol>
        <div class="how-keys">${keys.map(([k, what]) => `<span><kbd>${k}</kbd>${what}</span>`).join('')}</div>
        <button type="button" class="how-go" data-close>GOT IT</button>
        <span class="how-hint">Press the ? button (top right) to see this again</span>
      </div>`;
    this.root.hidden = false;
    this.help.classList.add('on');
  }

  close() {
    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = null;
    this.root.hidden = true;
    this.help.classList.remove('on');
  }

  /** Out of the match: no card, no button. */
  hide() {
    this.close();
    this.role = null;
    this.help.hidden = true;
  }
}
