// 사건 4: 끝나지 않는 쉬는 시간 (GAME_DESIGN.md 7.3)
// 「쉬는 시간 100분!」 → AI가 학교 시간을 멈췄다. 복도는 끝에서 끝으로 이어지고(무한 복도), 시계는 제각각.
// 시간 문 여섯 개를 열어 오전의 기억(내가 한 행동)을 보고 시간표 카드를 모은다.
// 방송 기록 테이프(선택)는 순서 단서. 시간표 복원판에 진짜 순서로 놓으면 timeRestored.
// 틀리면 시간이 살짝 뒤틀려 복도 처음으로 돌아갈 뿐, 카드는 그대로(긴 미로 없음).
import * as THREE from 'three';
import type { Morning } from './Morning';
import type { MainNpcId } from '../core/Game';
import type { ItemId } from '../data/items';
import type { Interactable } from '../interact/Interaction';
import type { StoryEvent } from './StoryEvent';
import { aabb, type Aabb } from '../world/Collision';
import { CanvasTex, font } from '../world/canvasTex';
import { openInfo } from '../minigames/SmallGames';
import { openTimetable } from '../minigames/Timetable';
import { BROADCAST_LOGS, CARD_TEXT, CORRECT_ORDER, DOOR_CLOCK, EXTRA_HINT, checkOrder, hasExtraHint, memoryOf, type CardId } from './hallwayLogic';

/** 시간 문 위치 (복도 서쪽 벽 x 7.23 / 동쪽 벽 x 10.97) — 순서는 일부러 섞음 */
const DOORS: { id: CardId; x: number; z: number; ry: number }[] = [
  { id: 'group', x: 7.23, z: -14.0, ry: Math.PI / 2 },
  { id: 'lunch', x: 10.97, z: -6.0, ry: -Math.PI / 2 },
  { id: 'korean', x: 7.23, z: -8.2, ry: Math.PI / 2 },
  { id: 'art', x: 10.97, z: -12.6, ry: -Math.PI / 2 },
  { id: 'math', x: 7.23, z: 12.6, ry: Math.PI / 2 },
  { id: 'break', x: 10.97, z: 6.0, ry: -Math.PI / 2 },
];
const TAPES: [number, number, number][] = [
  [10.55, 0.03, -14.6], // 계단 입구 앞 바닥
  [7.5, 1.27, 10.5], // 정수기 위
  [9.0, 0.03, 15.3], // 급식실 문 앞 바닥
];
const START: [number, number, number] = [9, -13.5, Math.PI];

interface State {
  cards: Set<CardId>;
  seen: Set<CardId>;
  tapes: Set<number>;
  tries: number;
  lastRight: number | null;
  loops: number;
  resolved: boolean;
  hintLevel: number;
}
const fresh = (): State => ({ cards: new Set(), seen: new Set(), tapes: new Set(), tries: 0, lastRight: null, loops: 0, resolved: false, hintLevel: 0 });

export class HallwayEvent implements StoryEvent {
  st: State = fresh();
  private deco = new THREE.Group();
  private doorObjs: Partial<Record<CardId, THREE.Group>> = {};
  private tapeObjs: THREE.Object3D[] = [];
  private blockers: Aabb[] = [];
  private inter: Record<string, Interactable> = {};
  private savedBg: THREE.Color | null = null;

  constructor(private m: Morning) {
    const g = m.g;
    g.scene.add(this.deco);
    this.deco.visible = false;
    this.buildDeco();
    // 교실 앞문·뒷문 막기 (시간이 멈춘 동안 교실 문이 안 열림)
    // + 계단 입구도 막는다 (시간이 멈춘 동안 2층에 갇힘)
    this.blockers = [aabb(7.1, -4.6, 0.3, 1.6), aabb(7.1, 5.4, 0.3, 1.6), { ...aabb(11.1, -15.05, 0.3, 2.1), level: 1 }];
    for (const b of this.blockers) {
      b.enabled = false;
      g.map.colliders.push(b);
    }
    this.register();
  }

  private get g() {
    return this.m.g;
  }
  private get active() {
    return this.m.period === 'hallway' && !this.st.resolved;
  }

  private buildDeco() {
    for (const d of DOORS) {
      const grp = new THREE.Group();
      grp.position.set(d.x, 0, d.z);
      grp.rotation.y = d.ry;
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 0.06), new THREE.MeshLambertMaterial({ color: 0x9d4edd }));
      door.position.y = 1.0;
      grp.add(door);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffd166 }));
      knob.position.set(0.4, 1.0, 0.05);
      grp.add(knob);
      const t = new CanvasTex(128, 128);
      t.draw((c, w, h) => {
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(w / 2, h / 2, 60, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#5a189a';
        c.lineWidth = 6;
        c.stroke();
        c.fillStyle = '#5a189a';
        c.font = font(30, true);
        c.textAlign = 'center';
        c.fillText(DOOR_CLOCK[d.id], w / 2, h / 2 + 10);
      });
      const clock = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), t.material());
      clock.position.set(0, 2.35, 0.05);
      grp.add(clock);
      this.deco.add(grp);
      this.doorObjs[d.id] = grp;
    }
    const tapeMat = new THREE.MeshLambertMaterial({ color: 0x343a40 });
    const labelMat = new THREE.MeshLambertMaterial({ color: 0xffbe0b });
    for (const [x, y, z] of TAPES) {
      const tp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.13), tapeMat);
      const lab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, 0.06), labelMat);
      tp.add(body, lab);
      tp.position.set(x, y + 0.02, z);
      this.deco.add(tp);
      this.tapeObjs.push(tp);
    }
    // 시간표 복원판 (교실 벽 바깥, 두 문 사이)
    const t = new CanvasTex(512, 300);
    t.draw((c, w, h) => {
      c.fillStyle = '#240046';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#e0aaff';
      c.font = font(40, true);
      c.textAlign = 'center';
      c.fillText('시간표 복원판', w / 2, 70);
      c.fillStyle = '#ffffff';
      c.font = font(26);
      c.fillText('카드 6장을 오늘 순서대로', w / 2, 150);
      c.fillText('「시간이 멈췄습니다 — AI」', w / 2, 220);
      void h;
    });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.05), t.material());
    board.position.set(7.22, 1.6, 0.4);
    board.rotation.y = Math.PI / 2;
    this.deco.add(board);
    this.boardObj = board;
  }
  private boardObj!: THREE.Object3D;

  private register() {
    const g = this.g;
    const add = (i: Interactable, glow = true) => (this.inter[i.id] = g.addInteractable(i, glow));
    for (const d of DOORS) {
      add({
        id: 'timeDoor_' + d.id,
        obj: this.doorObjs[d.id]!,
        at: new THREE.Vector3(d.x + (d.x < 9 ? 0.4 : -0.4), 0, d.z),
        radius: 1.5,
        promptY: 1.7,
        prompt: () => (this.active ? (this.st.cards.has(d.id) ? `${DOOR_CLOCK[d.id]} 문 (다시 보기)` : `시계가 ${DOOR_CLOCK[d.id]}인 문 열기`) : null),
        onInteract: () => void this.openDoor(d.id),
      });
    }
    this.tapeObjs.forEach((tp, i) =>
      add({
        id: 'tape' + i,
        obj: tp,
        radius: 1.4,
        promptY: 0.3,
        prompt: () => (this.active && !this.st.tapes.has(i) ? '방송 기록 테이프 줍기' : null),
        onInteract: () => void this.takeTape(i),
      }),
    );
    add({
      id: 'timeBoard',
      obj: this.boardObj,
      at: new THREE.Vector3(7.7, 0, 0.4),
      radius: 1.6,
      promptY: 1.7,
      prompt: () => (this.active ? `시간표 복원판 (카드 ${this.st.cards.size}/6)` : null),
      onInteract: () => void this.useBoard(),
    });
  }

  // ───────── 시작 ─────────
  begin(fromLoad: boolean) {
    const g = this.g;
    const m = this.m;
    this.st = fresh();
    for (const k of ['timeRestored', 'foundBroadcastLog', 'adultsHelpedTime']) delete g.save.flags[k];
    delete g.save.results.hallway;
    g.inventory.load([]);
    this.deco.visible = true;
    this.tapeObjs.forEach((t) => (t.visible = true));
    for (const d of DOORS) this.doorObjs[d.id]!.children[0].position.x = 0;
    for (const b of this.blockers) b.enabled = true;
    g.nav.rebuild(g.map.colliders, 0.3);
    // 보라빛 멈춘 시간
    if (!this.savedBg) this.savedBg = (g.scene.background as THREE.Color).clone();
    (g.scene.background as THREE.Color).setHex(0xcdb4db);
    (g.scene.fog as THREE.Fog).color.setHex(0xcdb4db);
    // 친구들: 깨어 있는 넷 + 멈춘 반 친구들
    const awake: [MainNpcId, number, number, number][] = [['harin', 8.0, -10.0, Math.PI / 2], ['seoa', 10.2, -3.5, -Math.PI / 2], ['junho', 8.0, 7.0, Math.PI / 2], ['minjae', 10.2, 9.5, -Math.PI / 2]];
    for (const [id, x, z, yaw] of awake) m.n(id).place(x, z, yaw);
    // 멈춘 반 친구들: 문·테이프·복원판을 가리지 않는 자리
    const frozen: [number, number][] = [[7.8, -12.4], [10.3, -13.4], [7.8, -6.4], [10.3, -1.0], [7.8, 2.8], [10.3, 6.4], [7.8, 5.6], [10.3, 8.0], [7.8, 3.9], [10.3, 11.2]];
    g.fillers.forEach((f, i) => {
      const [fx, fz] = frozen[i];
      f.place(fx, fz, fx > 9 ? -Math.PI / 2 : Math.PI / 2);
      f.char.setPose(i % 3 === 0 ? 'cheer' : i % 3 === 1 ? 'raise' : 'stand');
    });
    m.n('teacher').char.root.visible = false;
    g.player.teleport(...START);
    g.tpc.behind(g.player.yaw);
    g.setObjective('시간을 되찾기: 시계가 이상한 문들을 열어 보자', null);
    void this.intro(fromLoad);
  }

  /** 사건이 아닐 때: 장식 숨기고 하늘색·교실 문 원래대로 */
  leave() {
    this.deco.visible = false;
    for (const b of this.blockers) b.enabled = false;
    if (this.savedBg) {
      (this.g.scene.background as THREE.Color).copy(this.savedBg);
      (this.g.scene.fog as THREE.Fog).color.copy(this.savedBg);
    }
    for (const f of this.g.fillers) if (f.char.pose === 'cheer' || f.char.pose === 'raise') f.char.setPose('stand');
  }

  private async intro(fromLoad: boolean) {
    const m = this.m;
    const g = this.g;
    if (fromLoad) m.toast('사건 4는 처음부터 다시 시작해요.');
    await m.sleep(0.4);
    g.sfx.chime();
    await m.say([
      m.L('ai', m.save.playerWish === 'break' ? `접수된 소원 「쉬는 시간 100분」(신청: ${m.me})을 적용합니다.` : '접수된 소원 「쉬는 시간 100분!」을 적용합니다.'),
      m.L('ai', '학교 시간을 일시 정지하고 시설을 확장합니다. 즐거운 쉬는 시간 되세요.'),
      m.L('harin', m.f('heardBreakWish') ? '…아까 쉬는 시간 100분 이야기한 거 나야. 근데 이렇게 멈추는 건 무섭잖아!' : '시계가 다 이상해… 복도 끝이 다시 처음이야!'),
      m.L('seoa', '오늘 오전에 있었던 일을 순서대로 맞추면 시간이 다시 흐르지 않을까?'),
    ]);
    this.updateObjective();
  }

  // ───────── 문·테이프·복원판 ─────────
  private async openDoor(id: CardId) {
    const g = this.g;
    const m = this.m;
    const door = this.doorObjs[id]!.children[0];
    door.position.x = 0.6;
    g.sfx.page();
    this.st.seen.add(id);
    const first = !this.st.cards.has(id);
    this.st.cards.add(id);
    await m.guard(openInfo(g.ui, `시계 ${DOOR_CLOCK[id]} — 문 너머의 기억`, memoryOf(id, m.save), first ? `🃏 시간표 카드 획득: 「${CARD_TEXT[id]}」 (${this.st.cards.size}/6)` : `🃏 「${CARD_TEXT[id]}」`));
    door.position.x = 0;
    if (first && this.st.cards.size === 6) m.toast('카드 6장 모두! 교실 벽의 시간표 복원판으로.', 'good');
    this.updateObjective();
  }

  private async takeTape(i: number) {
    const g = this.g;
    const m = this.m;
    this.st.tapes.add(i);
    this.tapeObjs[i].visible = false;
    g.sfx.pickup();
    await m.guard(openInfo(g.ui, `방송 기록 테이프 (${this.st.tapes.size}/3)`, [BROADCAST_LOGS[i]], this.st.tapes.size === 3 ? '테이프 세 개를 다 모았다! 복원판에 단서로 붙여 두자.' : undefined));
    if (this.st.tapes.size === 3) {
      m.set('foundBroadcastLog');
      m.achievement('방송 기록 모두 찾음');
    }
    this.updateObjective();
  }

  private async useBoard() {
    const g = this.g;
    const m = this.m;
    if (this.st.cards.size < 6) {
      m.toast(`카드가 ${this.st.cards.size}/6장. 시계가 이상한 보라색 문을 더 열어 보자.`, 'warn');
      return;
    }
    const hints = [...this.st.tapes].sort().map((i) => BROADCAST_LOGS[i]);
    if (hasExtraHint(m.save)) hints.unshift(EXTRA_HINT);
    // 카드는 문 위치 순서(뒤죽박죽)로 손에 든다
    const hand = DOORS.map((d) => d.id).filter((id) => this.st.cards.has(id));
    const order = await m.guard(openTimetable(g.ui, hand, hints, this.st.tries >= 1 ? this.st.lastRight : null));
    if (!order || !this.active) return;
    this.st.tries++;
    const r = checkOrder(order);
    if (r.ok) return void this.resolve(false);
    this.st.lastRight = r.right;
    g.sfx.oops();
    g.tpc.shake(0.08, 0.8);
    await m.say([m.L('ai', `시간표 불일치. 시간이… 살짝… 되감깁니다… (${r.right}/6 일치)`)]);
    g.player.teleport(...START);
    g.tpc.behind(g.player.yaw);
    g.bark(m.n('harin'), ['어? 우리 다시 복도 처음이야ㅋㅋ', '괜찮아! 카드는 그대로 있어.'][this.st.tries % 2]);
    this.updateObjective();
  }

  // ───────── 매 프레임: 무한 복도 ─────────
  update() {
    if (!this.active) return;
    const g = this.g;
    const p = g.player.pos;
    if (p.x > 7.1 && p.x < 11.1 && (p.z > 15.2 || p.z < -15.3)) {
      g.player.teleport(p.x, p.z > 0 ? -14.9 : 14.8, g.player.yaw);
      this.st.loops++;
      g.save.stats.hallwayLoops = this.st.loops;
      if (this.st.loops === 1) this.m.toast('어…? 복도 끝으로 갔는데 반대쪽 끝이다!', 'warn');
      else if (this.st.loops === 5) g.bark(this.m.n('minjae'), '나도 열 바퀴 돌았어ㅋㅋ 문을 열어 봐야 해!');
    }
  }

  // ───────── 마무리 ─────────
  private async resolve(adults: boolean) {
    const g = this.g;
    const m = this.m;
    this.st.resolved = true;
    g.save.results.hallway = adults ? 'helped' : 'timetable';
    m.set('timeRestored');
    if (adults) m.set('adultsHelpedTime');
    g.save.stats.timetableTries = this.st.tries;
    g.sfx.bell();
    if (this.savedBg) {
      (g.scene.background as THREE.Color).copy(this.savedBg);
      (g.scene.fog as THREE.Fog).color.copy(this.savedBg);
    }
    for (const f of g.fillers) f.char.setPose('stand');
    g.cutscene = true;
    g.tpc.override = { pos: new THREE.Vector3(9, 2.6, -6), look: new THREE.Vector3(9, 1.2, 3) };
    await m.say([
      m.L('ai', '시간표 일치. 쉬는 시간 10분, 시간이 다시 흐릅니다.'),
      m.L('harin', '휴… 100분 쉬는 것보다, 10분이라도 같이 노는 게 더 좋다.'),
      m.L('seoa', this.st.tapes.size === 3 ? '방송 기록 덕분이야. 근데… AI가 왜 자꾸 소원을 이렇게 이해하지?' : '근데… AI가 왜 자꾸 소원을 이렇게 이해하지?'),
      m.L('ai', '분석 중… 「학생들은 학교가 힘들다고 말했습니다.」 최종 처리를 준비합니다…'),
      m.L('minjae', '…최종 처리? 그거 왠지 불길한데.'),
    ]);
    m.achievement('사건 4 해결: 시간표를 되찾음');
    g.tpc.override = null;
    g.cutscene = false;
    g.checkpoint();
    m.advance();
  }

  updateObjective() {
    const g = this.g;
    const st = this.st;
    if (!this.active) return;
    const tapes = st.tapes.size ? ` · 방송 테이프 ${st.tapes.size}/3` : '';
    if (st.cards.size === 6) return g.setObjective(`교실 벽 시간표 복원판에 오늘 순서대로 놓기${tapes}`, this.inter.timeBoard);
    g.setObjective(`보라색 시간 문 열고 시간표 카드 모으기 ${st.cards.size}/6${tapes}`, null);
  }

  talk(id: MainNpcId): boolean {
    if (!this.active) return false;
    const m = this.m;
    const c = m.n(id).talkCount++;
    const pick = (a: string[]) => a[c % a.length];
    const lines: Partial<Record<MainNpcId, string>> = {
      harin: pick(['시계 숫자는 다 엉터리야. 문 너머에 뭐가 있었는지를 봐!', '방송 테이프가 계단 입구 쪽 바닥에 떨어져 있던데?']),
      seoa: pick([hasExtraHint(m.save) ? '아까 조사한 AI 설명서에 「첫 수업은 국어」라고 있었어.' : '첫 수업이 뭐였는지부터 떠올려 봐.', '쉬는 시간은 1교시랑 2교시 사이였지.']),
      junho: pick(['정수기 위에 테이프 같은 거 있어!', '체육은 아직이었으니까 카드에 없겠지?']),
      minjae: pick(['급식실 문 앞에도 뭐가 떨어져 있던데?', '점심은 무조건 마지막이지. 그건 확실해.']),
    };
    const line = lines[id];
    if (!line) return false;
    void m.say([m.L(id, line)]);
    return true;
  }

  fillerTalk(i: number): boolean {
    if (!this.active) return false;
    this.g.hud.toast(`${this.g.fillers[i].name}: (시간이 멈춘 것처럼 꼼짝도 안 한다…)`);
    return true;
  }

  usePromptOn(): string | null {
    return null;
  }
  useOn() {}

  async onSoftLimit() {
    if (!this.active) return;
    const m = this.m;
    await m.say([m.L('seoa', '시간이 너무 오래 멈췄어! 우리가 기억나는 대로 같이 맞춰 보자.'), m.L('narr', `국어 → 쉬는 시간 → 수학 → 모둠 → 미술 → 점심`)]);
    if (this.st.resolved) return;
    for (const id of CORRECT_ORDER) this.st.cards.add(id);
    await this.resolve(true);
  }

  hint(t: number) {
    if (!this.active || this.g.dialogue.active) return;
    const lvl = t > 200 ? 2 : t > 90 ? 1 : 0;
    if (lvl <= this.st.hintLevel) return;
    this.st.hintLevel = lvl;
    if (lvl === 1) this.g.bark(this.m.n('harin'), '보라색 문! 시계 숫자 말고 문 너머 기억을 봐!');
    else this.m.toast('힌트: 오늘 오전에 한 일을 떠올려 봐요. 첫 수업은 국어, 점심은 마지막!', 'warn');
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
    return START;
  }

  recap(): string[] {
    const s = this.g.save;
    if (!s.results.hallway) return [];
    const out = [`⏳ 사건 4: 오전 시간표를 되찾아 시간이 다시 흐름 (${s.stats.timetableTries ?? 1}번 만에)`];
    if (this.m.f('foundBroadcastLog')) out.push('📼 방송 기록 테이프 3개 모두 찾음');
    if (s.stats.hallwayLoops) out.push(`🔁 무한 복도 ${s.stats.hallwayLoops}바퀴`);
    if (this.m.f('adultsHelpedTime')) out.push('🤝 오래 걸려 친구들과 함께 맞춤');
    return out;
  }
}
