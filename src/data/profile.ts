// The player's profile. There are no accounts yet, so it lives in this browser: a random
// 4-digit tag (shown as Name#1234) and how many heists you've started, which sets your
// level and title. The titles and quotes below are DEVELOPMENT DEFAULTS until real
// profiles exist.

const KEY = 'bandit-profile';

interface Saved {
  version: number;
  tag: string;
  heists: number;
}

/** Title and quote by level (development defaults). */
const RANKS: { from: number; title: string; quote: string }[] = [
  { from: 1, title: 'The Rookie', quote: 'Small steps, big heists.' },
  { from: 3, title: 'The Lookout', quote: 'Eyes open, hands quick.' },
  { from: 5, title: 'The Safecracker', quote: 'Every lock has a song.' },
  { from: 8, title: 'The Mastermind', quote: 'The plan was always the prize.' },
];

export class Profile {
  private saved: Saved;

  constructor() {
    let saved: Partial<Saved> = {};
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    } catch {
      // Storage blocked: a fresh profile for this visit.
    }
    // Earlier builds counted a heist as soon as a match started, which gave players
    // inflated levels even when they never finished a match. Keep their tag, but reset
    // that unreliable development count once when upgrading the profile format.
    const currentVersion = saved.version === 2;
    this.saved = {
      version: 2,
      tag: typeof saved.tag === 'string' && /^\d{4}$/.test(saved.tag) ? saved.tag : String(1000 + Math.floor(Math.random() * 9000)),
      heists: currentVersion && typeof saved.heists === 'number' && saved.heists >= 0 ? saved.heists : 0,
    };
    this.save();
  }

  get tag() {
    return this.saved.tag;
  }

  get heists() {
    return this.saved.heists;
  }

  /** Level 1, plus one for every 3 heists started. */
  get level() {
    return 1 + Math.floor(this.saved.heists / 3);
  }

  get rank() {
    return [...RANKS].reverse().find((r) => this.level >= r.from) ?? RANKS[0];
  }

  recordHeist() {
    this.saved.heists++;
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.saved));
    } catch {
      // Not remembered next time.
    }
  }
}
