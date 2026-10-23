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
// Digits, - and = pick the Saboteur's trap.
const OTHER = new Set(['Escape', ABILITY, 'KeyF', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal']);

const held = new Set<string>();
let pressed = new Set<string>();
let pressedNext = new Set<string>();
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
  pressed = pressedNext;
  pressedNext = new Set();
  const down = !!pad()?.buttons[0]?.pressed;
  padAction = down && !padActionWasDown;
  padActionWasDown = down;
  const abilityDown = !!pad()?.buttons[2]?.pressed;
  padAbility = abilityDown && !padAbilityWasDown;
  padAbilityWasDown = abilityDown;
}

/** Was this key pressed this frame? */
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
  let sprint = [...held].some((c) => SPRINT.has(c));
  const gp = pad();
  if (gp && !dx && !dy) {
    const dead = (v: number) => (Math.abs(v) < 0.3 ? 0 : v);
    dx = (gp.buttons[15]?.pressed ? 1 : 0) - (gp.buttons[14]?.pressed ? 1 : 0) || dead(gp.axes[0] ?? 0);
    dy = (gp.buttons[13]?.pressed ? 1 : 0) - (gp.buttons[12]?.pressed ? 1 : 0) || dead(gp.axes[1] ?? 0);
    sprint ||= !!(gp.buttons[7]?.pressed || gp.buttons[5]?.pressed);
  }
  return { dx, dy, sprint, action: [...pressed].some((c) => ACTION.has(c)) || padAction, ability: pressed.has(ABILITY) || padAbility, actionHeld: [...held].some((c) => ACTION.has(c)) || padActionWasDown };
}
