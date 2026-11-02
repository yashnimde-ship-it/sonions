import type { CharacterId } from '../config';
import { type Ability, abilityFor, type AbilityId, type Role } from '../data/characters.ts';
import type { Bandit } from '../entities/Bandit';
import { HEAL_REACH, MAX_HP, OVERCLOCK_MS, TRAPS, type TrapSpot } from '../data/traps.ts';
import type { ClientMsg } from '../net/protocol';

// Quickstep: a dash of 64 art px (4 tiles, about 3-4 steps) in 14 frames (under a quarter second).
export const QUICKSTEP_FRAMES = 14;
const QUICKSTEP_DISTANCE = 64;
/** Abilities the server must accept before a use is spent and the cooldown starts. */
const PENDING = new Set<AbilityId>(['trapJam', 'wingman', 'clone', 'mend', 'empKnife', 'diamondScan', 'signalDivide', 'trackerPing', 'lootShift', 'shockwave', 'burnZone']);
/** The Saboteur abilities aimed with the cursor at a point (they all go out as 'sabAbility'). */
const AIMED = new Set<AbilityId>(['signalDivide', 'trackerPing', 'shockwave', 'burnZone']);
const NEEDS_LABEL = { traps: 'traps', energy: 'energy', loot: 'loot carrying', stuns: 'trap stuns', health: 'health', doors: 'door locks', abilities: 'a unique ability' };

/** What an ability can act on. */
export interface AbilityContext {
  me: Bandit;
  send: (msg: ClientMsg) => void;
  /** I'm knocked out (waiting to get back up). */
  knockedOut?: boolean;
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
  /** The furniture Wingman would search (nearest unsearched, the way I'm facing). */
  wingmanTarget?: { id: string; name: string };
  /** The furniture under the Saboteur's cursor (Loot Shift), and why Loot Shift can't use it:
   *  as the diamond to move (`from` null) or as where it goes. Null when it can. */
  targetSpot?: { id: string; name: string };
  lootCheck?: (from: string | null, to: string) => string | null;
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
  /** When Trap Jam or Wingman started waiting for the server; after a while it stops waiting. */
  private waitingSince = 0;
  /** Wingman out searching, or Mend channelling, until then (for the slot's state). */
  private busyUntil = 0;
  private busyLabel = 'SEARCHING';
  /** What the slot says with no uses left, when it isn't the end of the round (Clone: bank to recharge). */
  private spentNote: string | null = null;
  /** A passive's own state line (Shield: up, or broken and recharging), shown instead of "Passive". */
  private status: { text: string; on: boolean } | null = null;
  private overclock: { startsAt: number; endsAt: number } | null = null;
  /** Loot Shift: the furniture whose diamond was picked (the next Q says where it goes). */
  private shiftFrom: { id: string; name: string } | null = null;
  private root = document.getElementById('ability')!;
  private roleEl = document.getElementById('ability-role')!;
  private nameEl = document.getElementById('ability-name')!;
  private stateEl = document.getElementById('ability-state')!;
  private cdEl = document.getElementById('ability-cd')!;
  /** A bar under the name (Velvet's energy); hidden for everyone else. */
  private meter = document.createElement('div');
  private meterFill = document.createElement('i');

  constructor() {
    this.meter.className = 'ability-meter';
    this.meter.hidden = true;
    this.meter.append(this.meterFill);
    this.root.querySelector('.ability-body')!.append(this.meter);
  }

  /** Call at the start of every round: picks the ability and resets its cooldown and uses. */
  setRound(character: CharacterId, role: Role) {
    this.ability = abilityFor(character, role);
    this.readyAt = 0;
    this.usesLeft = this.ability.perRound ?? Infinity;
    this.waitingForServer = false;
    this.busyUntil = 0;
    this.status = null;
    this.spentNote = null;
    this.meter.hidden = true;
    this.overclock = null;
    this.shiftFrom = null;
    this.root.dataset.role = role;
    // The ability's painted medallion in the socket (public/assets/ui/kit/, by its id).
    this.root.style.setProperty('--ability-icon', `url('/assets/ui/kit/icon-${this.ability.id}.png')`);
    this.roleEl.textContent = role === 'runner' ? 'RUNNER' : 'SABOTEUR';
    this.nameEl.textContent = this.ability.name;
  }

  /** Is this the ability in play this round (for passives like Heavy Carry)? */
  has(id: Ability['id']) {
    return this.ability?.id === id;
  }

  /** Could Q go off right now (off cooldown, uses left, not waiting, nothing out)? */
  get ready() {
    const now = performance.now();
    return !!this.ability && !this.waitingForServer && now >= this.readyAt && now >= this.busyUntil && this.usesLeft > 0;
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
    // No answer from the server in 2s (the round ended, the connection blipped): try again.
    if (this.waitingForServer && now - this.waitingSince > 2000) this.waitingForServer = false;
    if (this.usesLeft <= 0 && this.spentNote) return this.note(this.spentNote);
    if (this.waitingForServer || now < this.readyAt || this.usesLeft <= 0) return;
    // Stunned bandits can't use abilities, except the one that breaks the stun.
    if (ctx.me.stunned && a.id !== 'shakeItOff') return this.note('Stunned!');
    const fail = this.apply(a, ctx);
    if (fail) return this.note(fail);
    // Loot Shift's first Q only picks the diamond.
    if (fail === false) return;
    // Trap Jam's target is hidden from the client, and Wingman's might be gone by now. Wait for
    // the server to confirm before spending a use or starting cooldown; a refusal can be retried.
    if (PENDING.has(a.id)) {
      this.waitingForServer = true;
      this.waitingSince = now;
      return;
    }
    this.readyAt = now + a.cooldown * 1000;
    this.usesLeft--;
    if (a.id !== 'tripwire' && a.id !== 'trapRefresh' && a.id !== 'doorJam') ctx.send({ t: 'ability', ability: a.id });
  }

  /** Resolve an attempt the server had to accept first (Trap Jam, Wingman, Clone, Mend, EMP Knife, Diamond Scan, the aimed Saboteur abilities). */
  resolvePending(success: boolean) {
    if (!this.waitingForServer || !this.ability || !PENDING.has(this.ability.id)) return;
    this.waitingForServer = false;
    if (!success) return;
    this.readyAt = performance.now() + this.ability.cooldown * 1000;
    // Clone charges come from the server (they refill by banking).
    if (this.ability.id !== 'clone') this.usesLeft = Math.max(0, this.usesLeft - 1);
  }

  /** The server's answer to a Saboteur ability: spent (cooldown starts), or why not. Either way
   *  a Loot Shift starts again from picking a diamond. */
  sabResult(ok: boolean, reason?: string) {
    this.resolvePending(ok);
    this.dropShift();
    if (!ok) this.note(reason ?? 'Refused');
  }

  /** The furniture whose diamond Loot Shift picked, if one is picked. */
  get lootShiftFrom() {
    return this.shiftFrom?.id ?? null;
  }

  private dropShift() {
    if (!this.shiftFrom) return;
    this.shiftFrom = null;
    this.status = null;
  }

  /** Runs the effect; returns why it couldn't, if it couldn't (false: nothing sent yet). */
  private apply(a: Ability, ctx: AbilityContext): string | null | false {
    if (AIMED.has(a.id)) {
      // Signal Divide, Shockwave and Burn Zone need floor to stand on; Tracker Ping goes anywhere.
      if (!ctx.targetPoint) return 'Aim with the mouse';
      if (a.id !== 'trackerPing' && !ctx.targetPoint.open) return 'Aim at open floor';
      ctx.send({ t: 'sabAbility', ability: a.id, x: ctx.targetPoint.x, y: ctx.targetPoint.y });
      return null;
    }
    switch (a.id) {
      case 'lootShift': {
        // Two aims: the furniture hiding the diamond, then the furniture it goes to. Q on the
        // picked one again (or on nothing) lets go of it.
        const spot = ctx.targetSpot;
        const from = this.shiftFrom;
        if (!spot || spot.id === from?.id) {
          if (!from) return 'Aim at furniture hiding a diamond';
          this.dropShift();
          return 'Let go of the diamond';
        }
        const why = ctx.lootCheck?.(from?.id ?? null, spot.id) ?? null;
        if (why) return why;
        if (!from) {
          this.shiftFrom = spot;
          this.setStatus('NOW AIM WHERE IT GOES', true);
          return false;
        }
        ctx.send({ t: 'sabAbility', ability: 'lootShift', from: from.id, to: spot.id });
        return null;
      }
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
        // Not while knocked out: the dash would slide the downed body (and spend a use).
        if (ctx.knockedOut) return 'Knocked out';
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
      case 'wingman':
        if (ctx.knockedOut) return 'Knocked out';
        if (!ctx.wingmanTarget) return 'No unsearched furniture in reach';
        ctx.send({ t: 'ability', ability: 'wingman', spot: ctx.wingmanTarget.id });
        return null;
      case 'diamondScan':
        if (ctx.knockedOut) return 'Knocked out';
        // Thrown the way she faces; the server lands it and scans there.
        ctx.send({ t: 'ability', ability: 'diamondScan', facing: ctx.me.facing });
        return null;
      case 'empKnife':
        // Straight ahead; the server flies it and sets off the EMP where it lands.
        if (ctx.knockedOut) return 'Knocked out';
        ctx.send({ t: 'ability', ability: 'empKnife', facing: ctx.me.facing });
        return null;
      case 'mend':
        // The server checks for hurt teammates in reach, then heals them while she stands still.
        if (ctx.knockedOut) return 'Knocked out';
        ctx.send({ t: 'ability', ability: 'mend' });
        return null;
      case 'clone':
        // Straight ahead, the way I'm facing; the server runs it and says what it finds.
        if (ctx.knockedOut) return 'Knocked out';
        ctx.send({ t: 'ability', ability: 'clone', facing: ctx.me.facing });
        return null;
      case 'trapJam':
        // Every trap in reach, seen or not; the server works out which (and shows them to you).
        ctx.send({ t: 'jam', x: ctx.me.x, y: ctx.me.y });
        return null;
      default:
        return 'Not ready yet';
    }
  }

  /** Fill the slot's bar (0-1); `on` shows it draining. */
  setMeter(fraction: number, on: boolean) {
    this.meter.hidden = false;
    this.meter.classList.toggle('on', on);
    this.meterFill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
  }

  /** Seconds-or-so until the cooldown is over (ms; 0 when ready). */
  get cooldownLeft() {
    return Math.max(0, this.readyAt - performance.now());
  }

  /** Start the cooldown now (Beacon's warp, which main.ts runs itself). */
  startCooldown() {
    if (this.ability) this.readyAt = performance.now() + this.ability.cooldown * 1000;
  }

  /** A short note in the slot (for abilities main.ts drives itself). */
  say(text: string) {
    this.note(text);
  }

  /** Latch's clone charges (from the server), and what to bank for more once they're gone. */
  setCharges(charges: number, bankMore: number) {
    this.usesLeft = charges;
    this.spentNote = `BANK ${bankMore} MORE`;
  }

  /** A passive's state for the slot, or what an active one does next (Beacon); `on` lights it up. */
  setStatus(text: string, on: boolean) {
    this.status = { text, on };
  }

  /** Wingman is out, or Mend is running, for `ms` (0: it's over). */
  busy(ms: number, label = 'SEARCHING') {
    this.busyUntil = performance.now() + ms;
    this.busyLabel = label;
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
    // Asked the server and heard nothing back (it's down, or running older code that doesn't
    // know this ability): say so instead of looking like the key does nothing.
    if (this.waitingForServer && now - this.waitingSince > 2000) {
      this.waitingForServer = false;
      this.note('No answer from the server');
    }
    const left = Math.max(0, this.readyAt - now);
    const spent = this.usesLeft <= 0;
    this.cdEl.style.height = spent ? '100%' : `${(left / (a.cooldown * 1000 || 1)) * 100}%`;
    this.root.classList.toggle('ready', !left && !spent && !a.needs);
    const overclockLeft = this.overclock ? Math.max(0, this.overclock.endsAt - now) : 0;
    const busyLeft = Math.max(0, this.busyUntil - now);
    this.root.classList.toggle('active', (a.id === 'overclock' && overclockLeft > 0) || busyLeft > 0 || !!this.status?.on);
    if (now < this.noteUntil) return;
    const usesNote = Number.isFinite(this.usesLeft) && !spent ? ` · ${this.usesLeft} LEFT` : '';
    this.stateEl.textContent = (a.id === 'overclock' && overclockLeft > 0
      ? `ACTIVE ${Math.ceil(overclockLeft / 1000)}s`
      : busyLeft
      ? `${this.busyLabel} ${Math.ceil(busyLeft / 1000)}s`
      : a.needs
      ? 'Coming soon'
      : a.passive
        ? this.status?.text ?? 'Passive'
        : spent
          ? this.spentNote ?? 'No uses left'
          : left
            ? `${Math.ceil(left / 1000)}s`
            : this.status?.text ?? 'READY') + usesNote;
  }
}

