// What the Gadget Lab's cards say about each Saboteur trap. Every number here is the game's own:
// damage and stuns from trapEffect() and firePlaced() in server/index.ts, the slow, root, slip,
// reversed controls, darkness and the crusher's slam from applyPlacedTrapHit(), trapFired() and
// checkCrushers() in src/main.ts, the re-arm time from trapIsReady() in data/traps.ts. If one of
// those changes, change it here too.

import type { TrapKindId } from './trapKinds';

export interface GadgetInfo {
  /** What it does to a Runner, in a sentence or two. */
  does: string;
  /** The numbers, as short chips. */
  stats: string[];
  /** How to use it well. */
  tip: string;
}

/** A placed trap is ready to go off again this long after it fired (arm + cooldown), in seconds. */
const REARM_S = 4.6;

export const GADGETS: Record<TrapKindId, GadgetInfo> = {
  shock: {
    does: 'Zaps whoever steps on it.',
    stats: ['25 DAMAGE', '2s STUN'],
    tip: 'Cheap and quick to re-arm: put it in a doorway every Runner has to use.',
  },
  spring: {
    does: 'Throws the Runner 4 tiles on, the way they were going, and knocks their diamond out of their hands.',
    stats: ['THROWN 4 TILES', 'DROPS LOOT'],
    tip: 'Set it just before a door: they sail through and leave the diamond behind.',
  },
  snare: {
    does: "Holds the Runner where they stand: they can't move.",
    stats: ['ROOTED 2.5s'],
    tip: 'The cheapest trap. Put it on the way to the GETAWAY, where Runners carry diamonds.',
  },
  glue: {
    does: 'Sticky floor: the Runner moves at 40% speed.',
    stats: ['40% SPEED', '5s'],
    tip: 'It covers 3 x 3 tiles: lay it across a corridor so there is no way round.',
  },
  oil: {
    does: 'Slick floor: the Runner loses their grip and slides.',
    stats: ['NO GRIP', '5s'],
    tip: 'Also 3 x 3 tiles. Right before a corner or another trap, they can’t steer clear.',
  },
  crusher: {
    does: 'Its shadow grows for 1.5s, then it slams down. Still under it means a heavy hit.',
    stats: ['1.5s WARNING', '50 DAMAGE', '3s STUN'],
    tip: 'The hardest hit, but there’s time to step out: Glue or a Snare next to it keeps them under.',
  },
  laser: {
    does: 'Flickers for 0.8s, then its beams stay live for 4s. Every crossing hurts and drops carried loot back on the side they came from.',
    stats: ['LIVE 4s', '20 DAMAGE A CROSSING', 'DROPS LOOT'],
    tip: 'Lay it across a doorway: each trip through it costs them again.',
  },
  boulder: {
    does: 'Rolls into the Runner and carries them 3.5 tiles down its lane.',
    stats: ['30 DAMAGE', '0.8s STUN', 'PUSHED 3.5 TILES'],
    tip: 'One of the biggest hits: use it on a busy route.',
  },
  magnet: {
    does: 'When someone sets it off, it pulls every Runner within 4 tiles toward it and yanks a diamond out of their hands.',
    stats: ['REACH 4 TILES', 'DROPS LOOT'],
    tip: 'Best by a vault or the GETAWAY route.',
  },
  gas: {
    does: 'A cloud that reverses the controls of every Runner within about 3 tiles.',
    stats: ['CONTROLS REVERSED', '4s'],
    tip: 'Next to stairs, narrow doors or other traps, they walk straight the wrong way.',
  },
  blackout: {
    does: 'Puts the lights out in the whole room for every Runner in it: they only see a small circle around themselves.',
    stats: ['WHOLE ROOM DARK', '6s'],
    tip: 'Use it in a room with hiding spots: searching in the dark is slow.',
  },
  fakeLoot: {
    does: 'Looks like a loot chest to Runners. Searching it sets it off.',
    stats: ['30 DAMAGE', '2s STUN', 'ONE USE'],
    tip: 'Runners can see it: put it where a real diamond could be hidden.',
  },
};

/** The line under every card: who sees it, and when it's ready again. */
export const gadgetFooter = (id: TrapKindId) =>
  id === 'fakeLoot' ? 'Runners see it on purpose · gone once it goes off' : `Hidden from Runners until it goes off · ready again ${REARM_S}s later`;
