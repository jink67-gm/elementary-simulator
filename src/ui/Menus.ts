// 타이틀 · 캐릭터 고르기 · 알람 · 일시정지 · 설정 · 1장 끝 화면
import { el, button } from './dom';
import { Panel } from './Panel';
import type { Game } from '../core/Game';
import { newSave, type SaveData } from '../core/SaveData';
import { SaveManager } from '../core/SaveManager';
import { PLAYER_LOOKS } from '../world/Character';
import { SCHEDULE } from '../story/schedule';

export const NICKNAMES = ['번개', '콩떡', '별똥별', '감자칩', '뭉게구름', '도토리', '젤리곰', '초코칩', '해바라기', '꼬마용', '솜사탕', '비빔밥'];
const LOOK_NAMES = ['주황 티셔츠', '하늘 티셔츠', '초록 티셔츠', '보라 티셔츠'];

function colorHex(n: number) {
  return '#' + n.toString(16).padStart(6, '0');
}

export function downloadText(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export function pickFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      resolve(f ? await f.text() : null);
    });
    input.click();
  });
}

export class Menus {
  private screen: HTMLElement | null = null;

  constructor(private g: Game, private onStart: (save: SaveData) => void) {}

  private setScreen(node: HTMLElement | null) {
    this.screen?.remove();
    this.screen = node;
    if (node) this.g.layer.append(node);
  }

  title() {
    this.g.hud.show(false);
    const saved = this.g.saves.read();
    const box = el('div', { class: 'title-box' });
    box.append(
      el('div', { class: 'title-small' }, '초등학생 시뮬레이터'),
      el('h1', { class: 'title-main' }, '오늘도 무사히 하교하기'),
      el('div', { class: 'title-sub' }, '1장 · 평범한 월요일 오전'),
    );
    const btns = el('div', { class: 'title-btns' });
    if (saved) {
      btns.append(
        button(`이어하기 — ${saved.avatar.nickname} · ${saved.chapter >= 2 ? '1장 끝' : SCHEDULE[saved.period].label}`, () => {
          this.setScreen(null);
          this.onStart(saved);
        }, 'btn primary big'),
      );
    }
    btns.append(
      button(saved ? '처음부터 새로 시작' : '새로 시작', () => {
        if (saved && !confirm('지금 저장된 기록 위에 새로 시작할까요?')) return;
        this.characterSelect();
      }, saved ? 'btn big' : 'btn primary big'),
      button('저장 파일 불러오기', () => void this.importSave(), 'btn'),
      button('설정', () => this.settings(), 'btn'),
      button('만든 재료·라이선스', () => this.credits(), 'btn ghost'),
    );
    box.append(btns, el('div', { class: 'title-foot' }, '실명·사진 같은 개인 정보는 저장하지 않아요. 기록은 이 브라우저에만 남아요.'));
    this.setScreen(el('div', { class: 'screen title-screen' }, box));
  }

  private async importSave() {
    const text = await pickFile();
    if (!text) return;
    try {
      const save = SaveManager.importJson(text);
      this.g.saves.write(save);
      this.g.hud.toast('저장 파일을 불러왔어요!', 'good');
      this.title();
    } catch (e) {
      alert((e as Error).message || '불러오지 못했어요.');
    }
  }

  characterSelect() {
    let look = 0;
    let nick = NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)];
    const box = el('div', { class: 'title-box' });
    const looks = el('div', { class: 'look-row' });
    const nickRow = el('div', { class: 'nick-row' });
    const nickShow = el('div', { class: 'nick-show' });
    const render = () => {
      looks.innerHTML = '';
      PLAYER_LOOKS.forEach((l, i) => {
        const card = el('button', { class: 'look-card' + (i === look ? ' sel' : ''), type: 'button' });
        const fig = el('div', { class: 'look-fig' });
        fig.append(el('div', { class: 'lf-hair' }), el('div', { class: 'lf-head' }), el('div', { class: 'lf-body' }), el('div', { class: 'lf-legs' }));
        (fig.children[0] as HTMLElement).style.background = colorHex(l.hair);
        (fig.children[1] as HTMLElement).style.background = colorHex(l.skin);
        (fig.children[2] as HTMLElement).style.background = colorHex(l.shirt);
        (fig.children[3] as HTMLElement).style.background = colorHex(l.pants);
        card.append(fig, el('div', {}, LOOK_NAMES[i]));
        card.addEventListener('click', () => {
          look = i;
          render();
        });
        looks.append(card);
      });
      nickRow.innerHTML = '';
      NICKNAMES.forEach((n) => nickRow.append(button(n, () => {
        nick = n;
        render();
      }, 'chip' + (n === nick ? ' sel' : ''))));
      nickShow.textContent = `별명: ${nick}`;
    };
    box.append(
      el('h2', {}, '나는 어떤 학생일까?'),
      looks,
      el('h3', {}, '별명 고르기 (진짜 이름은 쓰지 않아요)'),
      nickRow,
      nickShow,
      el('div', { class: 'title-btns' }, button('학교 갈 준비 완료!', () => this.alarm(nick, look), 'btn primary big'), button('뒤로', () => this.title(), 'btn ghost')),
    );
    render();
    this.setScreen(el('div', { class: 'screen title-screen' }, box));
  }

  /** 08:25 알람. E로 일어나기 / Space로 5분 더 */
  alarm(nick: string, look: number) {
    const box = el('div', { class: 'alarm-box' });
    const clock = el('div', { class: 'alarm-clock' }, '08:25');
    const text = el('div', { class: 'alarm-text' }, '띠리리리리~ 띠리리리리~');
    let snoozes = 0;
    let done = false;
    const finish = (overslept: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', key);
      const save = newSave({ nickname: nick, look });
      if (overslept) save.flags.overslept = true;
      this.setScreen(null);
      this.onStart(save);
    };
    const up = () => {
      text.textContent = snoozes ? '헉! 벌써 8시 37분?! 뛰어!' : '벌떡! 오늘은 월요일. 가방 챙겨서 출발~';
      setTimeout(() => finish(snoozes > 0), 1300);
    };
    const snooze = () => {
      snoozes++;
      if (snoozes >= 2) return up();
      clock.textContent = '08:30';
      text.textContent = '(5분만 더… zzZ) 띠리리리리~!!';
    };
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'KeyE' || e.code === 'Enter') up();
      else if (e.code === 'Space') {
        e.preventDefault();
        snooze();
      }
    };
    window.addEventListener('keydown', key);
    box.append(
      clock,
      text,
      el('div', { class: 'title-btns row' }, button('[E] 일어나기', up, 'btn primary big'), button('[Space] 5분만 더…', snooze, 'btn big')),
    );
    this.setScreen(el('div', { class: 'screen alarm-screen' }, box));
  }

  pause() {
    const g = this.g;
    if (g.paused) return;
    g.setPaused(true);
    const p = new Panel(g.layer, {
      title: '잠깐 멈춤',
      onClose: () => g.setPaused(false),
    });
    const resume = () => p.close();
    p.body.append(
      el('div', { class: 'menu-col' },
        button('계속하기', resume, 'btn primary big'),
        button('자리로 돌아가기 (길을 잃었을 때)', () => {
          g.story.helpReturnToSeat();
          resume();
        }),
        button('필요한 물건 다시 챙기기', () => {
          g.recoverItems();
          resume();
        }),
        button('설정', () => this.settings()),
        button('저장 파일 내보내기 (다른 컴퓨터에서 이어하기)', () => {
          const s = g.saves.read();
          if (s) downloadText(`초등학생시뮬레이터_${s.avatar.nickname}.json`, SaveManager.exportJson(s));
          else g.hud.toast('아직 저장된 기록이 없어요.', 'warn');
        }),
        button('처음 화면으로', () => {
          p.close();
          g.running = false;
          this.title();
        }, 'btn ghost'),
      ),
      el('div', { class: 'keys-hint' }, '저장은 교시가 시작될 때마다 자동으로 돼요. 이어하기는 그 교시 처음부터 시작해요.'),
      el('div', { class: 'help-grid' },
        ...[
          ['WASD', '이동'], ['Shift', '달리기'], ['마우스 / 방향키', '둘러보기'], ['휠', '카메라 거리'], ['E', '조사·줍기·대화'], ['F', '사용·놓기'],
          ['Space', '점프 / 종이비행기 던지기'], ['1~4', '소지품 고르기'], ['Tab', '소지품 설명'], ['Enter / Q', '대사 넘기기 / 모두 넘기기'],
        ].map(([k, v]) => el('div', { class: 'help-item' }, el('span', { class: 'key' }, k), v)),
      ),
    );
  }

  settings() {
    const g = this.g;
    const s = g.settings;
    const p = new Panel(g.layer, { title: '설정' });
    const row = (label: string, control: HTMLElement) => el('label', { class: 'set-row' }, el('span', {}, label), control);
    const range = (min: number, max: number, step: number, val: number, on: (v: number) => void) => {
      const r = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val) });
      r.addEventListener('input', () => {
        on(Number(r.value));
        g.applySettings();
      });
      return r;
    };
    const select = <T extends string | number>(opts: [T, string][], val: T, on: (v: T) => void) => {
      const sel = el('select');
      for (const [v, l] of opts) {
        const o = el('option', { value: String(v) }, l);
        if (v === val) o.selected = true;
        sel.append(o);
      }
      sel.addEventListener('change', () => {
        const found = opts.find(([v]) => String(v) === sel.value);
        if (found) on(found[0]);
        g.applySettings();
      });
      return sel;
    };
    const shake = el('input', { type: 'checkbox' });
    shake.checked = s.shake;
    shake.addEventListener('change', () => {
      s.shake = shake.checked;
      g.applySettings();
    });
    p.body.append(
      row('마우스 감도', range(0.3, 2, 0.1, s.sensitivity, (v) => (s.sensitivity = v))),
      row('소리 크기', range(0, 1, 0.05, s.volume, (v) => (s.volume = v))),
      row('그래픽 품질', select<'low' | 'mid' | 'high'>([['low', '낮음 (느린 컴퓨터)'], ['mid', '보통'], ['high', '높음']], s.quality, (v) => (s.quality = v))),
      row('대사 속도', select<'slow' | 'normal' | 'fast'>([['slow', '천천히'], ['normal', '보통'], ['fast', '빠르게']], s.textSpeed, (v) => (s.textSpeed = v))),
      row('퀴즈 학년', select<4 | 5 | 6>([[4, '4학년'], [5, '5학년'], [6, '6학년']], s.grade, (v) => (s.grade = v))),
      row('화면 흔들림', shake),
      el('div', { class: 'keys-hint' }, `그래픽 '낮음'은 그림자를 끄고 해상도를 줄여요. 지금 ${g.fps || '-'} FPS`),
      el('div', { class: 'row center' }, button('확인', () => p.close(), 'btn primary')),
    );
  }

  credits() {
    const p = new Panel(this.g.layer, { title: '만든 재료·라이선스', wide: true });
    p.body.append(
      el('div', { class: 'info-lines' },
        el('div', { class: 'info-line' }, '3D 엔진: three.js (MIT License)'),
        el('div', { class: 'info-line' }, '빌드: Vite · TypeScript (MIT / Apache-2.0)'),
        el('div', { class: 'info-line' }, '3D 모델: 이 게임에서 기본 도형으로 직접 만든 임시 모델 (외부 에셋 없음)'),
        el('div', { class: 'info-line' }, '효과음: 브라우저 WebAudio로 직접 합성 (외부 소리 파일 없음)'),
        el('div', { class: 'info-line' }, '글꼴: 컴퓨터에 설치된 기본 한글 글꼴 사용'),
        el('div', { class: 'info-line' }, '자세한 목록: 저장소의 assets/SOURCES.md'),
      ),
    );
  }

  chapterEnd(save: SaveData, recap: string[]) {
    const g = this.g;
    g.running = false;
    g.cutscene = false;
    g.hud.show(false);
    g.input.releaseLock();
    const box = el('div', { class: 'title-box chapter' });
    box.append(
      el('div', { class: 'title-small' }, '1장 완료'),
      el('h1', { class: 'title-main' }, '오전 생존 성공!'),
      el('div', { class: 'title-sub' }, `${save.avatar.nickname}의 오전 기록`),
    );
    const list = el('ul', { class: 'recap' });
    recap.forEach((r) => list.append(el('li', {}, r)));
    box.append(
      list,
      el('div', { class: 'next-box' }, el('b', {}, '다음 이야기 — 사건 1: 급식실의 전설적인 거대 돈가스'), el('div', {}, '오전에 한 행동이 친구들의 말과 해결 방법에 이어져요. (다음 업데이트에서 계속)')),
      el('div', { class: 'title-btns' },
        button('저장 파일 내보내기', () => downloadText(`초등학생시뮬레이터_${save.avatar.nickname}_1장.json`, SaveManager.exportJson(save)), 'btn'),
        button('처음 화면으로', () => this.title(), 'btn primary big'),
      ),
    );
    this.setScreen(el('div', { class: 'screen title-screen' }, box));
  }
}
