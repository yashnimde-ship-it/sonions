// Player settings, kept in this browser (localStorage). Every option here changes something
// the game actually draws; main.ts reads them each frame.

export interface SettingsValues {
  /** Names above players' heads. */
  nameTags: boolean;
  /** Lamplight and dusk shading over the lobby and the estate. */
  lighting: boolean;
  /** Whole-number pixel scaling: crisper pixels, the lobby camera follows you. */
  pixelPerfect: boolean;
  /** Trap, diamond and round sound effects. */
  sound: boolean;
  /** The lobby's waiting music. */
  music: boolean;
}

const KEY = 'bandit-settings';
const DEFAULTS: SettingsValues = { nameTags: true, lighting: true, pixelPerfect: false, sound: true, music: true };

export const SETTING_LABELS: Record<keyof SettingsValues, [string, string]> = {
  nameTags: ['Name tags', 'Show names above players'],
  lighting: ['Lighting effects', 'Lamplight and dusk shading'],
  pixelPerfect: ['Sharp pixels', 'Whole-number scaling; the camera follows you'],
  sound: ['Sound effects', 'Traps, diamonds and round results'],
  music: ['Lobby music', 'A theme while you wait in the lobby'],
};

export class Settings {
  values: SettingsValues = { ...DEFAULTS };
  private listeners = new Set<() => void>();

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      for (const k of Object.keys(DEFAULTS) as (keyof SettingsValues)[]) if (typeof saved[k] === 'boolean') this.values[k] = saved[k];
    } catch {
      // Storage blocked or corrupt: defaults.
    }
  }

  set(key: keyof SettingsValues, value: boolean) {
    this.values[key] = value;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.values));
    } catch {
      // Not remembered next time; still applies now.
    }
    this.listeners.forEach((f) => f());
  }

  onChange(f: () => void) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
}
