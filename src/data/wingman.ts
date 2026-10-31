// Patch's Wingman: a little drone that flies to a piece of furniture and searches it.

/** How far away (art px, centre to centre) furniture can be picked: 12 tiles. */
export const WINGMAN_RANGE = 192;
/** Flying speed, art px per second: the same as walking (1.6 px a frame at 60 fps). */
export const WINGMAN_SPEED = 96;
/** The longest flight it will take (art px): 10 seconds of flying. */
export const WINGMAN_MAX_PATH = WINGMAN_SPEED * 10;

/** What a Wingman search turned up; `fizzled` means it never searched. */
export type WingmanResult = 'diamond' | 'keycard' | 'empty' | 'decoy' | 'fizzled';
