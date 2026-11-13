// 최종 사건: AI 학교생활 도우미 (GAME_DESIGN.md 7.4)
// AI: 「학생들이 학교에 오기 싫다고 말했습니다. 최적 해결책은 학교의 삭제입니다.」
// 1) 컴퓨터 3대에서 기록 모으기 (교사용 노트북: 모둠 포스터 / 급식실 앞 키오스크: 급식 기록 / 방송실 노트북: 소원 설문)
// 2) 방송실 AI 제어 패널: 소원 ↔ 진짜 바람 짝짓기로 잘못된 해석 고치기
// 3) 엔딩은 행동으로: 빨간 초기화 버튼 두 번 → A / 개선 기준 바르게 적용 → B / B + 숨은 미션 전부 → C
// 대결·공격은 없다. 도와준 친구들이 힌트를 더 주지만, 도움 없이도 끝낼 수 있다.
import * as THREE from 'three';
import type { Morning } from './Morning';
import type { MainNpcId } from '../core/Game';
import type { ItemId } from '../data/items';
import type { Interactable } from '../interact/Interaction';
import type { StoryEvent } from './StoryEvent';
import { CanvasTex, font } from '../world/canvasTex';
import { openInfo } from '../minigames/SmallGames';
import { openCriteria, openMatch } from '../minigames/Final';
import { WISH_LABELS } from '../minigames/Tablet';
import { SOLUTION_LABEL } from './Cutlet';
import {
  HIDDEN, RECORD_NAMES, checkMatch, criteriaFeedback, decideEnding, epilogue, hiddenProgress,
  type Criteria, type Ending, type RealId, type RecordId,
} from './finalLogic';

const POSTER_SLOGAN: Record<string, string> = {
  food: '급식 메뉴, 우리가 같이 정해요!',
  rest: '쉬는 시간에 쉴 공간이 더 있으면 좋겠어요',
  play: '운동장에서 함께 노는 시간을 늘려요',
  friends: '서로 인사하는 우리 학교',
};

interface State {
  records: Set<RecordId>;
  pairs: Record<string, RealId | undefined>;
  wrong: string[];
  matched: boolean;
  feedback: string | null;
  resetArmed: boolean;
  resolved: boolean;
  hintLevel: number;
  criteria: Criteria | null;
}
const fresh = (): State => ({ records: new Set(), pairs: {}, wrong: [], matched: false, feedback: null, resetArmed: false, resolved: false, hintLevel: 0, criteria: null });

export class FinalEvent implements StoryEvent {
  st: State = fresh();
  private deco = new THREE.Group();
  private inter: Record<string, Interactable> = {};
  private consoleTex!: CanvasTex;
  private noteTex!: CanvasTex;
  private objs: Record<string, THREE.Object3D> = {};

  constructor(private m: Morning) {
    m.g.scene.add(this.deco);
    this.deco.visible = false;
    this.build();
    this.register();
  }

  private get g() {
    return this.m.g;
  }
  private get active() {
    return this.m.period === 'final' && !this.st.resolved;
  }

  private build() {
    const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => {
      const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
      mm.position.set(x, y + h / 2, z);
      mm.castShadow = true;
      this.deco.add(mm);
      return mm;
    };
    // 급식실 앞 키오스크
    const kiosk = box(0.5, 1.3, 0.4, 0xdee2e6, 10.6, 0, 14.6);
    const ks = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.26), new THREE.MeshBasicMaterial({ color: 0x4ea8de }));
    ks.position.set(-0.26, 0.35, 0);
    ks.rotation.y = -Math.PI / 2;
    kiosk.add(ks);
    this.objs.kiosk = kiosk;
    // 교사용 노트북 표시 (빛나는 화면)
    const tl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshBasicMaterial({ color: 0x80ffdb }));
    tl.position.set(-4.3, 0.98, -4.95);
    tl.visible = false; // 상호작용 위치용 (노트북 모델은 지도에 있음)
    this.deco.add(tl);
    this.objs.teacherLaptop = tl;
    // 방송실 노트북 표시
    const bl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), new THREE.MeshBasicMaterial({ color: 0x80ffdb }));
    bl.position.set(13.9, 0.98, 4.9);
    bl.rotation.y = -Math.PI / 2;
    bl.visible = false;
    this.deco.add(bl);
    this.objs.broadcastLaptop = bl;
    // AI 제어 패널
    const panel = box(1.1, 1.15, 0.45, 0x343a40, 12.4, 0, 6.15);
    this.consoleTex = new CanvasTex(512, 256);
    const cs = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.47), this.consoleTex.material());
    cs.position.set(0, 0.3, -0.235);
    cs.rotation.y = Math.PI;
    panel.add(cs);
    this.objs.console = panel;
    // 빨간 초기화 버튼
    const ped = box(0.4, 0.9, 0.4, 0x6c757d, 13.7, 0, 2.95);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 18), new THREE.MeshLambertMaterial({ color: 0xe63946 }));
    btn.position.y = 0.49;
    ped.add(btn);
    this.objs.resetButton = ped;
    // 고마움 노트 (숨은 미션 진행)
    this.noteTex = new CanvasTex(384, 384);
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), this.noteTex.material());
    note.position.set(11.9, 1.6, 2.62);
    this.deco.add(note);
    this.objs.note = note;
  }

  private drawConsole(pct: number, text: string) {
    this.consoleTex.draw((c, w, h) => {
      c.fillStyle = '#1b0f0f';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ff6b6b';
      c.font = font(30, true);
      c.textAlign = 'center';
      c.fillText('AI 학교생활 도우미', w / 2, 46);
      c.fillStyle = '#444';
      c.fillRect(40, 100, w - 80, 34);
      c.fillStyle = pct >= 99 ? '#ff6b6b' : '#80ffdb';
      c.fillRect(40, 100, ((w - 80) * pct) / 100, 34);
      c.fillStyle = '#fff';
      c.font = font(24, true);
      c.fillText(text, w / 2, 190);
      void h;
    });
  }

  private drawNote() {
    const { done } = hiddenProgress(this.g.save);
    this.noteTex.draw((c, w, h) => {
      c.fillStyle = '#fff7c2';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#6a4c93';
      c.font = font(28, true);
      c.textAlign = 'center';
      c.fillText('친구들의 고마움 노트', w / 2, 44);
      c.textAlign = 'left';
      c.font = font(20);
      HIDDEN.forEach((hd, i) => {
        c.fillStyle = done.includes(hd.id) ? '#2a9d8f' : '#999';
        c.fillText(`${done.includes(hd.id) ? '♥' : '○'} ${hd.label}`, 20, 100 + i * 52);
      });
    });
  }

  private register() {
    const g = this.g;
    const add = (i: Interactable, glow = true) => (this.inter[i.id] = g.addInteractable(i, glow));
    const comp = (id: string, rec: RecordId, at: THREE.Vector3) =>
      add({
        id,
        obj: this.objs[id],
        at,
        radius: 1.5,
        promptY: 1.2,
        prompt: () => (this.active ? (this.st.records.has(rec) ? `${RECORD_NAMES[rec]} 다시 보기` : `컴퓨터 켜기 — ${RECORD_NAMES[rec]}`) : null),
        onInteract: () => void this.readRecord(rec),
      });
    comp('teacherLaptop', 'poster', new THREE.Vector3(-4.3, 0, -3.95));
    comp('kiosk', 'lunch', new THREE.Vector3(10.0, 0, 14.6));
    comp('broadcastLaptop', 'wishes', new THREE.Vector3(13.3, 0, 4.9));
    add({
      id: 'aiConsole',
      obj: this.objs.console,
      at: new THREE.Vector3(12.4, 0, 5.5),
      radius: 1.5,
      promptY: 1.5,
      prompt: () => {
        if (!this.active) return null;
        if (this.st.records.size < 3) return `AI 제어 패널 (기록 ${this.st.records.size}/3)`;
        return this.st.matched ? 'AI에게 개선 기준 알려 주기' : 'AI 해석 고치기';
      },
      onInteract: () => void this.useConsole(),
    });
    add({
      id: 'resetButton',
      obj: this.objs.resetButton,
      radius: 1.3,
      promptY: 1.1,
      prompt: () => (this.active && this.st.matched ? (this.st.resetArmed ? '정말 초기화하기 (한 번 더)' : '빨간 AI 초기화 버튼') : null),
      onInteract: () => void this.pressReset(),
    });
    add({
      id: 'thanksNote',
      obj: this.objs.note,
      at: new THREE.Vector3(11.9, 0, 3.2),
      radius: 1.3,
      promptY: 1.7,
      prompt: () => (this.active ? '고마움 노트 읽기' : null),
      onInteract: () => {
        const { done, total } = hiddenProgress(g.save);
        void openInfo(g.ui, '친구들의 고마움 노트', HIDDEN.map((h) => `${done.includes(h.id) ? '♥' : '○'} ${h.label}`), `${done.length}/${total} — 다 모으면 무언가 특별한 일이…?`);
      },
    });
  }

  // ───────── 시작 ─────────
  begin(fromLoad: boolean) {
    const g = this.g;
    const m = this.m;
    this.st = fresh();
    for (const k of ['aiCorrected', 'endingA', 'endingB', 'endingC']) delete g.save.flags[k];
    delete g.save.results.ending;
    g.inventory.load([]);
    this.deco.visible = true;
    g.map.setBroadcastDoor(1);
    g.nav.rebuild(g.map.colliders, 0.3);
    g.setSkyTint(0xf4b6b6);
    this.drawConsole(99, '학교 삭제 준비 99%… (멈춤)');
    this.drawNote();
    const pos: [MainNpcId, number, number, number][] = [['seoa', 10.3, 3.0, -Math.PI / 2], ['junho', 7.9, 2.0, Math.PI / 2], ['harin', 10.3, 6.4, -Math.PI / 2], ['minjae', 7.9, 7.6, Math.PI / 2]];
    for (const [id, x, z, yaw] of pos) m.n(id).place(x, z, yaw);
    g.fillers.forEach((f, i) => f.sitAt(g.map.seats['filler' + i]));
    const t = m.n('teacher');
    t.char.root.visible = true;
    t.place(-3.2, -4.0, 0);
    g.player.teleport(9, 1.0, 0);
    g.tpc.behind(g.player.yaw);
    g.setObjective('컴퓨터 3대에서 기록 모으기 (교실 선생님 노트북 · 급식실 앞 키오스크 · 방송실 노트북)', null);
    void this.intro(fromLoad);
  }

  leave() {
    this.deco.visible = false;
    this.g.setSkyTint(null);
  }

  private async intro(fromLoad: boolean) {
    const m = this.m;
    const g = this.g;
    if (fromLoad) m.toast('최종 사건은 처음부터 다시 시작해요.');
    await m.sleep(0.4);
    g.sfx.rumble();
    g.tpc.shake(0.05, 1.5);
    await m.say([
      m.L('ai', '분석 완료. 학생들은 「돈가스」「청소」「피구공」「쉬는 시간」이 불만이라고 말했습니다.'),
      m.L('ai', '학생들이 학교에 오기 싫다고 말했습니다. 최적 해결책은 학교의 삭제입니다.'),
      m.L('minjae', '삭제?! 아니 그런 뜻이 아니었는데!'),
      m.L('seoa', 'AI가 우리 소원을 계속 문자 그대로만 받아들였잖아. 진짜 뜻을 보여 주면 되지 않을까?'),
      m.L('teacher', '교실 선생님 노트북, 급식실 앞 키오스크, 방송실 노트북에 오늘 기록이 다 있어요. 모아서 방송실 제어 패널로!'),
    ]);
    this.updateObjective();
  }

  private async readRecord(rec: RecordId) {
    const g = this.g;
    const m = this.m;
    const s = g.save;
    let lines: string[];
    if (rec === 'poster') {
      const theme = s.schoolPosterTheme ?? 'friends';
      lines = [`3교시 모둠 포스터: 「${POSTER_SLOGAN[theme]}」`, s.groupRole ? `내 역할: ${{ speaker: '발표', maker: '제작', researcher: '자료', organizer: '정리' }[s.groupRole]}` : '모둠 친구들과 함께 만듦', '→ 학생들은 학교를 없애자고 하지 않았다. 「더 재미있게 바꾸자」고 했다.'];
    } else if (rec === 'lunch') {
      lines = [s.cafeteriaSolution ? `점심: ${SOLUTION_LABEL[s.cafeteriaSolution]}` : '점심: 거대 돈가스 사건', s.flags.sharedFairly ? '여섯 명이 공평하게 나눠 먹음' : s.flags.festivalHeld ? '복도 축제에 반 전체가 모임' : '다 같이 점심을 먹음', '→ 학생들은 급식이 싫은 게 아니라 다 같이 맛있게 먹고 싶었다.'];
    } else {
      lines = [
        '민재: 「돈가스 왕 크게!」',
        '하린: 「쉬는 시간 100분이었으면」',
        '준호: 「피구공은 진짜 안 잃어버렸으면!」',
        `${m.me}: 「${s.playerWish ? WISH_LABELS[s.playerWish] : '(비워 둠)'}」`,
        '→ 소원마다 「더 즐겁게」라는 마음이 숨어 있다.',
      ];
    }
    const first = !this.st.records.has(rec);
    this.st.records.add(rec);
    g.sfx.page();
    await m.guard(openInfo(g.ui, `기록: ${RECORD_NAMES[rec]}`, lines, first ? `📁 기록 획득 (${this.st.records.size}/3)` : undefined));
    if (first && this.st.records.size === 3) {
      m.toast('기록 세 개 모두! 방송실 AI 제어 패널로.', 'good');
      this.drawConsole(99, '기록 확인 대기 중…');
    }
    this.updateObjective();
  }

  private async useConsole() {
    const g = this.g;
    const m = this.m;
    if (this.st.records.size < 3) {
      m.toast(`AI: 「근거 자료가 부족합니다.」 기록 ${this.st.records.size}/3 — 컴퓨터를 더 찾아보자.`, 'warn');
      return;
    }
    if (!this.st.matched) {
      const pairs = await m.guard(openMatch(g.ui, this.st.pairs, this.st.wrong));
      if (!pairs || !this.active) return;
      this.st.pairs = pairs;
      const r = checkMatch(pairs);
      if (!r.ok) {
        this.st.wrong = r.wrong;
        g.sfx.oops();
        await m.say([m.L('ai', pairs.break === 'erase' || Object.values(pairs).includes('erase') ? '「학교가 사라졌으면」… 그 문장은 어떤 기록에도 없습니다.' : `해석 ${r.wrong.length}개가 기록과 맞지 않습니다.`)]);
        return;
      }
      this.st.matched = true;
      m.set('aiCorrected');
      g.sfx.chime();
      this.drawConsole(40, '삭제 계획 취소. 기준 설정 대기');
      await m.say([
        m.L('ai', '…재분석 완료. 학생들은 학교가 싫은 것이 아니라, 학교가 더 즐겁기를 바랐습니다.'),
        m.L('ai', '학교 삭제 계획을 취소합니다. 새 개선 기준을 알려 주세요. 또는 저를 처음 상태로 초기화할 수 있습니다.'),
        m.L('harin', '빨간 버튼은 초기화래. 아니면 제어 패널에서 기준을 정해 주자!'),
      ]);
      this.updateObjective();
      return;
    }
    const c = await m.guard(openCriteria(g.ui, this.st.feedback));
    if (!c || !this.active) return;
    const fb = criteriaFeedback(c);
    if (fb) {
      this.st.feedback = fb;
      g.sfx.oops();
      await m.say([m.L('ai', fb)]);
      return;
    }
    this.st.criteria = c;
    const { done, total } = hiddenProgress(g.save);
    const e = decideEnding({ reset: false, criteriaOk: true, hiddenAll: done.length === total })!;
    await this.finish(e);
  }

  private async pressReset() {
    const m = this.m;
    if (!this.st.resetArmed) {
      this.st.resetArmed = true;
      this.g.sfx.blip();
      await m.say([m.L('ai', '경고: 초기화하면 오늘 생긴 모든 변화가 사라집니다. 정말 누르려면 한 번 더 눌러 주세요.')]);
      return;
    }
    await this.finish(decideEnding({ reset: true, criteriaOk: false, hiddenAll: false })!);
  }

  private async finish(e: Ending) {
    const g = this.g;
    const m = this.m;
    this.st.resolved = true;
    g.save.results.ending = e;
    m.set('ending' + e);
    g.sfx.success();
    this.drawConsole(e === 'A' ? 0 : 100, e === 'A' ? '초기화 완료' : '개선 기준 적용 완료!');
    g.setSkyTint(null);
    g.cutscene = true;
    g.tpc.override = { pos: new THREE.Vector3(9, 2.4, -1), look: new THREE.Vector3(12, 1.2, 4.5) };
    for (const id of ['seoa', 'junho', 'harin', 'minjae'] as MainNpcId[]) m.n(id).char.setPose(e === 'A' ? 'stand' : 'cheer');
    const talk: Record<Ending, [MainNpcId | 'ai', string][]> = {
      A: [['ai', '초기화 완료. 안녕하세요, 저는 평범한 학교 안내 프로그램입니다.'], ['minjae', '돈가스도 원래대로겠지… 그래도 재밌었다.']],
      B: [['ai', '개선 기준 적용: 만날 공간 유지 · 적당한 쉬는 시간 · 안전하고 즐거운 수업.'], ['seoa', '우리가 말한 게 진짜로 반영됐어!'], ['teacher', '다음 학급 회의 때 이 기준 그대로 발표해 볼까요?']],
      C: [['ai', '개선 기준 적용. 그리고… 오늘 친구를 도운 기록이 모두 확인되었습니다.'], ['ai', '숨은 보상: 「비밀 놀이 공간」 잠금을 해제합니다.'], ['harin', '뭐?! 진짜 비밀 공간이 있었어?!']],
    };
    await m.say(talk[e].map(([w, t]) => m.L(w, t)));
    g.tpc.override = null;
    g.cutscene = false;
    m.set('storyEnd');
    g.checkpoint();
    m.onEnding(g.save, e, epilogue(g.save, e, this.st.criteria?.rest ?? null));
  }

  updateObjective() {
    const g = this.g;
    const st = this.st;
    if (!this.active) return;
    if (st.records.size < 3) {
      const leftIds = (['poster', 'lunch', 'wishes'] as RecordId[]).filter((r) => !st.records.has(r));
      const left = leftIds.map((r) => RECORD_NAMES[r]).join(' · ');
      const target = { poster: 'teacherLaptop', lunch: 'kiosk', wishes: 'broadcastLaptop' }[leftIds[0]];
      return g.setObjective(`기록 모으기 ${st.records.size}/3 — 남은 것: ${left}`, this.inter[target]);
    }
    if (!st.matched) return g.setObjective('방송실 AI 제어 패널에서 잘못된 해석 고치기', this.inter.aiConsole);
    g.setObjective('마지막 선택: 제어 패널에서 개선 기준 정하기 · 또는 빨간 초기화 버튼', this.inter.aiConsole);
  }

  talk(id: MainNpcId): boolean {
    if (!this.active) return false;
    const m = this.m;
    const f = (k: string) => m.f(k);
    const c = m.n(id).talkCount++;
    const pick = (a: string[]) => a[c % a.length];
    const lines: Partial<Record<MainNpcId, string>> = {
      seoa: f('helpedPageFriend') ? pick(['86쪽 알려 준 거 고마웠어. 힌트: 「쉬는 시간 100분」의 진짜 뜻은 「같이 놀 시간이 조금 더」야.', '「학교가 사라지기」는 누구도 쓴 적 없는 소원이야.']) : pick(['소원마다 진짜 바람이 숨어 있을 거야.', '기록부터 모으자!']),
      junho: f('pencilReturned') ? pick(['필통 은인한테만 알려 줄게. 피구공 소원은 「체육이 더 재밌었으면」이란 뜻이었어.', '쉬는 시간 기준은 100분은 안 돼. 아까 시간 멈춘 거 봤잖아!']) : pick(['피구 하고 싶다…', '키오스크는 급식실 문 옆에 있어.']),
      harin: f('returnedGlue') ? pick(['풀 바로 돌려준 너라면 할 수 있어. 공간은 꼭 「유지」로!', '고마움 노트 봤어? 방송실 벽에 붙어 있어.']) : pick(['쉬는 시간 100분 소원… 미안해ㅠ', '빨간 버튼은 다 원래대로 되돌린대.']),
      minjae: pick(['돈가스 소원은 그냥 「다 같이 맛있게 먹고 싶다」였어. 진짜야!', '나 이제 소원 쓸 때 「적당히」 꼭 붙일게.']),
      teacher: pick(['선생님 노트북은 책상 위에 있어요. 켜 봐요.', '어떤 선택을 해도 괜찮아요. 오늘 다들 정말 잘했어요.']),
    };
    const line = lines[id];
    if (!line) return false;
    void m.say([m.L(id, line)]);
    return true;
  }

  fillerTalk(i: number): boolean {
    if (!this.active) return false;
    const npc = this.g.fillers[i];
    this.g.bark(npc, ['학교 삭제라니… 내 사물함 정리도 안 했는데!', '힘내! 우리 반 대표!', '방송실이 빨갛게 번쩍거려.'][npc.talkCount++ % 3]);
    return true;
  }

  usePromptOn(): string | null {
    return null;
  }
  useOn() {}

  async onSoftLimit() {
    if (!this.active) return;
    const m = this.m;
    this.m.toast('힌트: 기록 3개 → 방송실 제어 패널 → 소원과 진짜 바람 짝짓기 → 기준 정하기(또는 초기화). 시간 제한은 없어요!', 'warn');
    void m;
  }

  hint(t: number) {
    if (!this.active || this.g.dialogue.active) return;
    const lvl = t > 240 ? 2 : t > 120 ? 1 : 0;
    if (lvl <= this.st.hintLevel) return;
    this.st.hintLevel = lvl;
    if (lvl === 1) this.g.bark(this.m.n('seoa'), this.st.records.size < 3 ? '선생님 노트북, 급식실 앞 키오스크, 방송실 노트북!' : '방송실 제어 패널로 가자!');
    else this.m.toast('힌트: 「학교가 사라지기」 카드는 어떤 소원과도 짝이 아니에요.', 'warn');
  }

  canPickup(): string | null {
    return null;
  }
  onPickup() {}
  onDropped() {}
  requiredItems(): ItemId[] {
    return [];
  }
  returnSpot(): [number, number, number] {
    return [9, 1.0, 0];
  }
  recap(): string[] {
    const e = this.g.save.results.ending as Ending | undefined;
    if (!e) return [];
    const { done, total } = hiddenProgress(this.g.save);
    return [`🤖 최종 사건: ${e === 'A' ? 'AI를 초기화함' : 'AI의 해석을 고치고 개선 기준을 정함'}`, `💌 숨은 미션 ${done.length}/${total}`];
  }
}
