// localStorage 저장 + JSON 내보내기/가져오기. 개인 정보는 저장하지 않는다(별명만).
import { parseSave, SaveFormatError, type SaveData } from './SaveData';

const KEY = 'elementary-simulator.save.v1';

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export class SaveManager {
  lastError: string | null = null;

  constructor(private store: StorageLike | null = safeLocalStorage()) {}

  write(data: SaveData): boolean {
    data.savedAt = new Date().toISOString();
    try {
      if (!this.store) throw new Error('no storage');
      this.store.setItem(KEY, JSON.stringify(data));
      this.lastError = null;
      return true;
    } catch {
      this.lastError = '이 브라우저에 저장하지 못했어요. (저장 공간 또는 개인정보 보호 모드 확인) 「저장 파일 내보내기」로 따로 보관할 수 있어요.';
      return false;
    }
  }

  read(): SaveData | null {
    try {
      const raw = this.store?.getItem(KEY);
      if (!raw) return null;
      return parseSave(JSON.parse(raw));
    } catch {
      this.lastError = '저장 기록이 손상되어 불러오지 못했어요.';
      return null;
    }
  }

  clear() {
    try {
      this.store?.removeItem(KEY);
    } catch {
      /* 무시 */
    }
  }

  static exportJson(data: SaveData): string {
    return JSON.stringify(data, null, 2);
  }

  /** 가져오기: 성공하면 SaveData, 실패하면 한국어 안내 문구를 던진다. */
  static importJson(text: string): SaveData {
    let obj: unknown;
    try {
      obj = JSON.parse(text);
    } catch {
      throw new SaveFormatError('JSON 파일을 읽을 수 없어요.');
    }
    return parseSave(obj);
  }
}

function safeLocalStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const t = '__t';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    return null;
  }
}
