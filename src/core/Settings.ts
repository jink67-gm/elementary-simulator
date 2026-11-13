import { looksLowSpec } from './Device';

export interface Settings {
  sensitivity: number; // 0.3 ~ 2
  volume: number; // 0 ~ 1
  quality: 'low' | 'mid' | 'high';
  shake: boolean;
  grade: 4 | 5 | 6;
  textSpeed: 'slow' | 'normal' | 'fast';
  /** 조작 방식: 자동(마지막으로 쓴 입력) / 터치 버튼 / 키보드·마우스 */
  controls: 'auto' | 'touch' | 'keyboard';
  /** 화면이 느려지면 해상도를 저절로 낮춘다 */
  autoRes: boolean;
  /** 터치 버튼 크기 배율 */
  touchScale: number;
}

const KEY = 'elementary-simulator.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  volume: 0.7,
  quality: 'mid',
  shake: true,
  grade: 6,
  textSpeed: 'normal',
  controls: 'auto',
  autoRes: true,
  touchScale: 1,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    // 처음 켠 기기: 태블릿·크롬북·웨일북·저사양 컴퓨터는 그래픽 '낮음'으로 시작
    if (!raw) return { ...DEFAULT_SETTINGS, quality: looksLowSpec() ? 'low' : 'mid' };
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
