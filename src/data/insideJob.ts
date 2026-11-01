// Inside Job: a heist with a traitor in the crew. One player is secretly the Insider: they look
// and play like any thief, but they want the diamonds to stay in the house. Everyone carries a
// gun: a thief has one bullet, the Insider a few (slow to reload). Each player can call one
// meeting, where the crew talks and votes someone out. Shared by the game and the server.

/** Inside Job plays with any crew (it never turns into a heist); it's best with this many or
 *  more, where the Insider has somewhere to hide. */
export const INSIDE_JOB_MIN_PLAYERS = 2;
export const INSIDE_JOB_BEST = 4;

export const INSIDE = {
  /** The role reveal before the doors open (the diamonds are hidden by the house). */
  briefMs: 8_000,
  liveMs: 240_000,
  rounds: 3,
  /** Thieves bank about half the diamonds to win (no traps in the house, but a thief among them). */
  needShare: 0.5,
  /** Bullets: a thief's one, the Insider's three, with a wait between the Insider's shots. */
  thiefAmmo: 1,
  insiderAmmo: 3,
  insiderCooldownMs: 25_000,
  /** How far a shot carries, and how close to a body it must pass to hit (art px). */
  range: 200,
  hitRadius: 11,
  /** Who sees a shot (the shooter and the tracer) and who only hears it (a ring where it was). */
  seeRange: 230,
  hearRange: 600,
  /** Meetings: one per player; talk and vote, then the result is shown before play goes on. */
  meetingsEach: 1,
  meetingMs: 50_000,
  revealMs: 5_000,
  /** Typed lines in a meeting: this long at most, this often at most. */
  chatMax: 80,
  chatGapMs: 1_200,
  /** The Insider stashes a carried diamond back in furniture by holding E (like a search). */
  stashMs: 1_500,
  /** Within this distance when it happens, you notice the furniture was disturbed (art px). */
  disturbSeeRange: 170,
  disturbedMs: 30_000,
  /** The Insider's nose for diamonds: their glints reach further. */
  insiderGlint: 2,
};

/** Points: thieves bank (the heist's SCORE.bank) and share a win; catching the Insider pays;
 *  gunning down a fellow thief costs. The Insider scores per thief taken out, and on a win for
 *  every diamond still in the house too. */
export const INSIDE_SCORE = { thievesWin: 75, shotInsider: 150, votedInsider: 50, wrongShot: -75, elimination: 75, unbanked: 25, insiderWin: 200 };

/** Quick lines for a meeting; `@` is the player picked in the list. */
export const MEETING_LINES = [
  'I saw @ with a diamond',
  '@ shot at someone',
  '@ was near the furniture that moved',
  '@ is acting sus',
  '@ was with me the whole time',
  'Where were you, @?',
  'I trust @',
  'Skip, not enough proof',
] as const;
