// Lobby music: one looping track while players wait in the lobby, faded in and out. The file
// lives in public/local-assets/ (kept out of git), so a checkout without it just stays quiet.

const SRC = '/local-assets/music/lobby.mp3';
const VOLUME = 0.3;
const FADE_MS = 1200;

let el: HTMLAudioElement | null = null;
let missing = false;
let want = false;
let enabled = true;
let fade = 0;

function track() {
  if (!el && !missing) {
    el = new Audio(SRC);
    el.loop = true;
    el.volume = 0;
    el.addEventListener('error', () => {
      missing = true;
      el = null;
    });
  }
  return el;
}

function fadeTo(target: number, then?: () => void) {
  const a = el;
  if (!a) return;
  cancelAnimationFrame(fade);
  const from = a.volume;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / FADE_MS);
    a.volume = from + (target - from) * t;
    if (t < 1) fade = requestAnimationFrame(step);
    else then?.();
  };
  fade = requestAnimationFrame(step);
}

function update() {
  const a = track();
  if (!a) return;
  if (want && enabled) {
    if (a.paused) a.play().catch(() => {}); // blocked until the first click; retried below
    fadeTo(VOLUME);
  } else if (!a.paused) {
    fadeTo(0, () => a.pause());
  }
}

/** Play the lobby track (true) or fade it out (false). */
export function setLobbyMusic(on: boolean) {
  want = on;
  update();
}

export function setMusicEnabled(on: boolean) {
  enabled = on;
  update();
}

// Browsers only allow audio after a click or key press: try again on the first one.
for (const type of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(type, () => { if (want && enabled && el?.paused) update(); });
}
