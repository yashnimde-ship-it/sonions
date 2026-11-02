/**
 * The local player's input: WASD or the arrow keys, Shift to sprint, E / Enter / Space for
 * action, plus the first connected gamepad. Every player has their own screen online.
 */
export interface ControlState {
  dx: number;
  dy: number;
  sprint: boolean;
  /** Action was pressed this frame (customize, steal, open doors). */
  action: boolean;
  /** Ability was pressed this frame (Q, or X on a gamepad). */
  ability: boolean;
  /** Q (or the pad's ability button) is down right now (Beacon holds it to move her anchor). */
  abilityHeld: boolean;
  /** Action is being held down (searching furniture takes a long press). */
  actionHeld: boolean;
}

const MOVE: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const ACTION = new Set(['KeyE', 'Enter', 'Space']);
const ABILITY = 'KeyQ';
// Digits, - and = pick the Saboteur's trap; M calls an Inside Job meeting.
const OTHER = new Set(['Escape', ABILITY, 'KeyR', 'KeyF', 'KeyC', 'KeyG', 'KeyH', 'KeyM', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal']);

const held = new Set<string>();
let pressed = new Set<string>();
let pressedNext = new Set<string>();
let padKeys = new Set<string>();
let padActionWasDown = false;
let padAction = false;
let padAbilityWasDown = false;
let padAbility = false;

/** Typing in a text field (the name box) must not move the bandit. */
const typing = () => document.activeElement instanceof HTMLInputElement;

window.addEventListener('keydown', (e) => {
  if (typing()) return;
  if (!(e.code in MOVE) && !SPRINT.has(e.code) && !ACTION.has(e.code) && !OTHER.has(e.code)) return;
  e.preventDefault();
  if (!e.repeat) pressedNext.add(e.code);
  held.add(e.code);
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());

const pad = () => [...(navigator.getGamepads?.() ?? [])].find((p): p is Gamepad => !!p);

/** Call once at the start of every fixed update. */
export function pollInput() {
  const gp = pad();
  // Xbox/XInput layout (including the Kreo Surge XB): expose the useful buttons as the same
  // virtual keys the game already understands, so every existing mechanic works on a pad.
  const nextPadKeys = new Set<string>();
  const pressedButton = (n: number) => !!gp?.buttons[n]?.pressed;
  if (pressedButton(0)) nextPadKeys.add('KeyE'); // A: interact / confirm
  if (pressedButton(1) || pressedButton(7)) nextPadKeys.add('KeyF'); // B or RT: fire
  if (pressedButton(2)) nextPadKeys.add('KeyQ'); // X: ability / flare / boost
  if (pressedButton(3)) nextPadKeys.add('KeyM'); // Y: Inside Job meeting
  if (pressedButton(4)) nextPadKeys.add('KeyR'); // LB: reload
  if (pressedButton(5) || pressedButton(10)) nextPadKeys.add('ShiftRight'); // RB or LS: sprint
  if (pressedButton(8) || pressedButton(9)) nextPadKeys.add('Escape'); // View / Menu: back
  pressed = new Set([...pressedNext, ...[...nextPadKeys].filter((key) => !padKeys.has(key))]);
  pressedNext = new Set();
  padKeys = nextPadKeys;
  const down = pressedButton(0);
  padAction = down && !padActionWasDown;
  padActionWasDown = down;
  const abilityDown = pressedButton(2);
  padAbility = abilityDown && !padAbilityWasDown;
  padAbilityWasDown = abilityDown;
}

/** Was this key pressed this frame? */
/** Is this key down right now? */
export const keyHeld = (code: string) => held.has(code) || padKeys.has(code);

/** Right-stick aim, normalized to -1..1. Null means the player is using mouse/touch aim. */
export function gamepadAim(): [number, number] | null {
  const gp = pad();
  if (!gp) return null;
  const dead = (v: number) => (Math.abs(v) < 0.22 ? 0 : v);
  const x = dead(gp.axes[2] ?? 0);
  const y = dead(gp.axes[3] ?? 0);
  return x || y ? [x, y] : null;
}

/** The on-screen thumbstick (see Touch.ts): -1..1 each way. */
let touchMove: [number, number] = [0, 0];
export function setTouchMove(dx: number, dy: number) {
  touchMove = [dx, dy];
}

/** An on-screen button pressing (or letting go of) the key it stands for. */
export function touchKey(code: string, down: boolean) {
  if (down) {
    if (!held.has(code)) pressedNext.add(code);
    held.add(code);
  } else held.delete(code);
}

export function keyPressed(code: string) {
  return pressed.has(code);
}

export function readControls(): ControlState {
  let dx = 0;
  let dy = 0;
  for (const code of held) {
    const m = MOVE[code];
    if (m) {
      dx += m[0];
      dy += m[1];
    }
  }
  dx = Math.sign(dx);
  dy = Math.sign(dy);
  let sprint = [...held, ...padKeys].some((c) => SPRINT.has(c));
  const gp = pad();
  if (gp && !dx && !dy) {
    const dead = (v: number) => (Math.abs(v) < 0.3 ? 0 : v);
    dx = (gp.buttons[15]?.pressed ? 1 : 0) - (gp.buttons[14]?.pressed ? 1 : 0) || dead(gp.axes[0] ?? 0);
    dy = (gp.buttons[13]?.pressed ? 1 : 0) - (gp.buttons[12]?.pressed ? 1 : 0) || dead(gp.axes[1] ?? 0);
    sprint ||= !!(gp.buttons[7]?.pressed || gp.buttons[5]?.pressed);
  }
  if (!dx && !dy) [dx, dy] = touchMove;
  return { dx, dy, sprint, action: [...pressed].some((c) => ACTION.has(c)) || padAction, ability: pressed.has(ABILITY) || padAbility, abilityHeld: held.has(ABILITY) || padAbilityWasDown, actionHeld: [...held].some((c) => ACTION.has(c)) || padActionWasDown };
}
