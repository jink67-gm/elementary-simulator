export interface Settings {
  sensitivity: number; // 0.3 ~ 2
  volume: number; // 0 ~ 1
  quality: 'low' | 'mid' | 'high';
  shake: boolean;
  grade: 4 | 5 | 6;
  textSpeed: 'slow' | 'normal' | 'fast';
}

const KEY = 'elementary-simulator.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  volume: 0.7,
  quality: 'mid',
  shake: true,
  grade: 6,
  textSpeed: 'normal',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function storeSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 저장 못 해도 게임은 계속 */
  }
}
