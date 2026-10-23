import type { CharacterId } from '../config';
import { type Ability, abilityFor, type Role } from '../data/characters';
import type { Bandit } from '../entities/Bandit';
import type { ClientMsg } from '../net/protocol';

// Quickstep: a dash of 64 art px (4 tiles, about 3-4 steps) in 14 frames (under a quarter second).
export const QUICKSTEP_FRAMES = 14;
const QUICKSTEP_DISTANCE = 64;
const NEEDS_LABEL = { traps: 'traps', energy: 'energy', loot: 'loot carrying', stuns: 'trap stuns', health: 'health', doors: 'door locks' };

/** What an ability can act on. */
export interface AbilityContext {
  me: Bandit;
  send: (msg: ClientMsg) => void;
}

/**
 * The local player's ability for the current round: the character's Runner or Saboteur
 * ability, its cooldown and uses, and the HUD slot that shows them.
 */
export class AbilitySystem {
  private ability: Ability | null = null;
  private readyAt = 0;
  private usesLeft = Infinity;
  private noteUntil = 0;
  private root = document.getElementById('ability')!;
  private roleEl = document.getElementById('ability-role')!;
  private nameEl = document.getElementById('ability-name')!;
  private stateEl = document.getElementById('ability-state')!;
  private cdEl = document.getElementById('ability-cd')!;

  /** Call at the start of every round: picks the ability and resets its cooldown and uses. */
  setRound(character: CharacterId, role: Role) {
    this.ability = abilityFor(character, role);
    this.readyAt = 0;
    this.usesLeft = this.ability.perRound ?? Infinity;
    this.root.dataset.role = role;
    this.roleEl.textContent = role === 'runner' ? 'RUNNER' : 'SABOTEUR';
    this.nameEl.textContent = this.ability.name;
  }

  /** Is this the ability in play this round (for passives like Steady Carry)? */
  has(id: Ability['id']) {
    return this.ability?.id === id;
  }

  /** Q was pressed. */
  use(ctx: AbilityContext) {
    const a = this.ability;
    if (!a) return;
    const now = performance.now();
    if (a.needs) return this.note(`Needs ${NEEDS_LABEL[a.needs]} (coming)`);
    if (a.passive) return this.note('Always on');
    if (now < this.readyAt || this.usesLeft <= 0) return;
    const fail = this.apply(a, ctx);
    if (fail) return this.note(fail);
    this.readyAt = now + a.cooldown * 1000;
    this.usesLeft--;
    ctx.send({ t: 'ability', ability: a.id });
  }

  /** Runs the effect; returns why it couldn't, if it couldn't. */
  private apply(a: Ability, ctx: AbilityContext): string | null {
    switch (a.id) {
      case 'quickstep':
        ctx.me.dash(QUICKSTEP_DISTANCE, QUICKSTEP_FRAMES);
        return null;
      default:
        return 'Not ready yet';
    }
  }

  private note(text: string) {
    this.stateEl.textContent = text;
    this.noteUntil = performance.now() + 1500;
  }

  /** Updates the HUD slot: cooldown sweep and seconds, or READY. */
  render() {
    const a = this.ability;
    if (!a) return;
    const now = performance.now();
    const left = Math.max(0, this.readyAt - now);
    const spent = this.usesLeft <= 0;
    this.cdEl.style.height = spent ? '100%' : `${(left / (a.cooldown * 1000 || 1)) * 100}%`;
    this.root.classList.toggle('ready', !left && !spent && !a.needs);
    if (now < this.noteUntil) return;
    this.stateEl.textContent = a.needs
      ? 'Coming soon'
      : a.passive
        ? 'Passive'
        : spent
          ? 'Used this round'
          : left
            ? `${Math.ceil(left / 1000)}s`
            : 'READY';
  }
}

