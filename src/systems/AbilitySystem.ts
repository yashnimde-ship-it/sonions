import type { CharacterId } from '../config';
import { type Ability, abilityFor, type Role } from '../data/characters.ts';
import type { Bandit } from '../entities/Bandit';
import { HEAL_REACH, MAX_HP, OVERCLOCK_MS, TRAPS, type TrapSpot } from '../data/traps.ts';
import type { ClientMsg } from '../net/protocol';

// Quickstep: a dash of 64 art px (4 tiles, about 3-4 steps) in 14 frames (under a quarter second).
export const QUICKSTEP_FRAMES = 14;
const QUICKSTEP_DISTANCE = 64;
const NEEDS_LABEL = { traps: 'traps', energy: 'energy', loot: 'loot carrying', stuns: 'trap stuns', health: 'health', doors: 'door locks' };

/** What an ability can act on. */
export interface AbilityContext {
  me: Bandit;
  send: (msg: ClientMsg) => void;
  /** My health, and a way to set it (First Aid on myself). */
  hp?: number;
  setHp?: (hp: number) => void;
  /** The other Runners in the heist (not the Saboteur). */
  crew?: { id: string; x: number; y: number; hp: number }[];
  /** Shock Plate under the Saboteur's cursor, for targeted abilities. */
  targetTrapId?: string;
  targetTrapReady?: boolean;
  targetTrapJammed?: boolean;
  /** Door under the Saboteur's cursor, for Door Jam. */
  targetDoorId?: string;
  /** Where the Saboteur's cursor is (art px), and whether a trip line fits there (Tripwire). */
  targetPoint?: { x: number; y: number; open: boolean };
}

/**
 * The local player's ability for the current round: the character's Runner or Saboteur
 * ability, its cooldown and uses, and the HUD slot that shows them.
 */
export class AbilitySystem {
  /** The current heist map's fixed traps (Trap Jam picks the nearest). */
  traps: TrapSpot[] = TRAPS;
  private ability: Ability | null = null;
  private readyAt = 0;
  private usesLeft = Infinity;
  private noteUntil = 0;
  private waitingForServer = false;
  private overclock: { startsAt: number; endsAt: number } | null = null;
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
    this.waitingForServer = false;
    this.overclock = null;
    this.root.dataset.role = role;
    this.roleEl.textContent = role === 'runner' ? 'RUNNER' : 'SABOTEUR';
    this.nameEl.textContent = this.ability.name;
  }

  /** Is this the ability in play this round (for passives like Steady Carry)? */
  has(id: Ability['id']) {
    return this.ability?.id === id;
  }

  get overclockWindow() {
    return this.overclock;
  }

  /** Q was pressed. */
  use(ctx: AbilityContext) {
    const a = this.ability;
    if (!a) return;
    const now = performance.now();
    if (a.needs) return this.note(`Needs ${NEEDS_LABEL[a.needs]} (coming)`);
    if (a.passive) return this.note('Always on');
    if (this.waitingForServer || now < this.readyAt || this.usesLeft <= 0) return;
    // Stunned bandits can't use abilities, except the one that breaks the stun.
    if (ctx.me.stunned && a.id !== 'shakeItOff') return this.note('Stunned!');
    const fail = this.apply(a, ctx);
    if (fail) return this.note(fail);
    // Trap Jam's target is hidden from the client. Wait for the server to confirm it found a
    // trap before spending a use or starting cooldown; a failed attempt can then be retried.
    if (a.id === 'trapJam') {
      this.waitingForServer = true;
      return;
    }
    this.readyAt = now + a.cooldown * 1000;
    this.usesLeft--;
    if (a.id !== 'tripwire' && a.id !== 'trapRefresh' && a.id !== 'doorJam') ctx.send({ t: 'ability', ability: a.id });
  }

  /** Resolve a server-validated Trap Jam attempt. */
  resolveTrapJam(success: boolean) {
    if (!this.waitingForServer || this.ability?.id !== 'trapJam') return;
    this.waitingForServer = false;
    if (!success) return;
    this.readyAt = performance.now() + this.ability.cooldown * 1000;
    this.usesLeft = Math.max(0, this.usesLeft - 1);
  }

  /** Runs the effect; returns why it couldn't, if it couldn't. */
  private apply(a: Ability, ctx: AbilityContext): string | null {
    switch (a.id) {
      case 'overclock':
        this.overclock = { startsAt: performance.now(), endsAt: performance.now() + OVERCLOCK_MS };
        return null;
      case 'tripwire':
        if (!ctx.targetPoint?.open) return 'Aim at open floor';
        ctx.send({ t: 'tripwire', x: ctx.targetPoint.x, y: ctx.targetPoint.y });
        return null;
      case 'trapRefresh':
        if (!ctx.targetTrapId || ctx.targetTrapReady !== false || ctx.targetTrapJammed) return 'Aim at a trap that is cooling down';
        ctx.send({ t: 'trapRefresh', id: ctx.targetTrapId });
        return null;
      case 'doorJam':
        if (!ctx.targetDoorId) return 'Aim at a door';
        ctx.send({ t: 'doorJam', id: ctx.targetDoorId });
        return null;
      case 'quickstep':
        ctx.me.dash(QUICKSTEP_DISTANCE, QUICKSTEP_FRAMES);
        return null;
      case 'firstAid': {
        // Whoever needs it most: me, or a hurt Runner within reach.
        const hurt = (ctx.crew ?? []).filter((r) => r.hp < MAX_HP && Math.hypot(r.x - ctx.me.x, r.y - ctx.me.y) <= HEAL_REACH);
        const selfHp = ctx.hp ?? MAX_HP;
        const worst = hurt.sort((a, b) => a.hp - b.hp)[0];
        if (worst && worst.hp < selfHp) {
          ctx.send({ t: 'heal', target: worst.id });
          return null;
        }
        if (selfHp < MAX_HP) {
          ctx.setHp?.(MAX_HP);
          return null;
        }
        return 'Nobody hurt nearby';
      }
      case 'shakeItOff':
        if (!ctx.me.stunned) return 'Not stunned';
        ctx.me.stunFrames = 0;
        return null;
      case 'trapJam':
        // Every trap in reach, seen or not; the server works out which (and shows them to you).
        ctx.send({ t: 'jam', x: ctx.me.x, y: ctx.me.y });
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
    const overclockLeft = this.overclock ? Math.max(0, this.overclock.endsAt - now) : 0;
    this.root.classList.toggle('active', a.id === 'overclock' && overclockLeft > 0);
    if (now < this.noteUntil) return;
    const usesNote = Number.isFinite(this.usesLeft) && !spent ? ` · ${this.usesLeft} LEFT` : '';
    this.stateEl.textContent = (a.id === 'overclock' && overclockLeft > 0
      ? `ACTIVE ${Math.ceil(overclockLeft / 1000)}s`
      : a.needs
      ? 'Coming soon'
      : a.passive
        ? 'Passive'
        : spent
          ? 'No uses left'
          : left
            ? `${Math.ceil(left / 1000)}s`
            : 'READY') + usesNote;
  }
}

