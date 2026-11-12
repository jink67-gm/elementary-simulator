// 사건 3: 초대형 피구공 대회 (GAME_DESIGN.md 7.2)
// 「피구공은 진짜 안 잃어버렸으면!」 → AI가 공을 분실 불가능한 크기(1,000%)로 키웠다. 체육관 한가운데를 막고 있다.
//  1. 물리 실험: 받침대·경사판·밀어내기 패드를 설치 → 각도·힘을 맞춰 발사 → 뜀틀을 피해 공 창고 입구로 → physics
//  2. 크기 조절 리모컨: 사건 1에서 크기 조절기를 고쳤을 때만. 100%로 줄이고 공 수레에 → shrink
//  3. 새 경기: 규칙 카드 세 장 → 친구들과 공을 밀어 골대 두 곳에 → sport (newSportInvented)
import * as THREE from 'three';
import type { Morning } from './Morning';
import type { MainNpcId } from '../core/Game';
import type { ItemId } from '../data/items';
import type { Npc } from '../npc/Npc';
import type { Interactable } from '../interact/Interaction';
import type { StoryEvent } from './StoryEvent';
import type { Circle } from '../world/Collision';
import { CanvasTex } from '../world/canvasTex';
import { openLauncher, openRules } from '../minigames/Gym';
import { openMachine } from '../minigames/Cafeteria';
import {
  BALL_R, BALL_START, GOALS, RULE_CARDS, decideDodge, launchAdvice, simulateLaunch, stepBall,
  type BallState, type DodgeSolution,
} from './dodgeLogic';

const PARTS: ItemId[] = ['standPart', 'rampPart', 'padPart'];
const PART_NAMES: Record<string, string> = { standPart: '받침대', rampPart: '경사판', padPart: '밀어내기 패드' };
const TEAM: MainNpcId[] = ['junho', 'minjae'];

export const DODGE_LABEL: Record<DodgeSolution, string> = {
  physics: '발사대 각도·힘을 맞춰 공을 창고로 굴려 보냄',
  shrink: '크기 조절 리모컨으로 공을 원래 크기로 되돌림',
  sport: '거대 공으로 새 경기를 만들어 골 두 개 성공',
  mixed: '실험·리모컨·새 경기를 섞어서 해결',
};

interface State {
  parts: number; // 설치한 부품 수
  launches: number;
  last: { angle: number; power: number };
  rolling: { path: { x: number; z: number }[]; i: number; result: string } | null;
  stored: boolean;
  shrinkTried: boolean;
  shrunk: boolean;
  shrunkInCart: boolean;
  rules: string[];
  goals: number;
  goalDone: Set<string>;
  resolved: boolean;
  hintLevel: number;
  helperT: number;
}

const fresh = (): State => ({
  parts: 0,
  launches: 0,
  last: { angle: 0, power: 5 },
  rolling: null,
  stored: false,
  shrinkTried: false,
  shrunk: false,
  shrunkInCart: false,
  rules: [],
  goals: 0,
  goalDone: new Set(),
  resolved: false,
  hintLevel: 0,
  helperT: 0,
});

export class DodgeEvent implements StoryEvent {
  st: State = fresh();
  ball: BallState = { x: BALL_START.x, z: BALL_START.z, vx: 0, vz: 0 };
  private mesh: THREE.Mesh;
  private circle: Circle = { x: 0, z: 0, r: BALL_R };
  private inter: Record<string, Interactable> = {};
  private lastPlayer = new THREE.Vector3();

  constructor(private m: Morning) {
    const tex = new CanvasTex(256, 128);
    tex.draw((c, w, h) => {
      c.fillStyle = '#e63946';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) c.fillRect(i * 64 + 26, 0, 12, h);
      c.fillRect(0, h / 2 - 6, w, 12);
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 28, 18), new THREE.MeshLambertMaterial({ map: tex.tex }));
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    m.g.scene.add(this.mesh);
    this.register();
  }

  private get g() {
    return this.m.g;
  }
  private get active() {
    return this.m.period === 'dodgeball' && !this.st.resolved;
  }

  private register() {
    const g = this.g;
    const map = g.map;
    const add = (i: Interactable, glow = true) => (this.inter[i.id] = g.addInteractable(i, glow));
    add(
      {
        id: 'giantBall',
        obj: this.mesh,
        radius: 2.4,
        promptY: 1.6,
        noGlow: true,
        prompt: () => (this.active && !this.st.shrunk && !this.st.rolling ? '거대 피구공 살펴보기' : null),
        onInteract: () => void this.observe(),
        usePrompt: (item) => (this.active && item === 'sizeRemote' && !this.st.shrunk ? '크기 조절 리모컨 쓰기' : null),
        onUse: () => void this.shrink(),
      },
      false,
    );
    add({
      id: 'gymParts',
      obj: map.objs.gymParts,
      radius: 1.6,
      promptY: 1.4,
      prompt: () => (this.active && this.st.parts < 3 && !PARTS.some((p) => g.inventory.has(p)) ? `${PART_NAMES[PARTS[this.st.parts]]} 꺼내기` : null),
      onInteract: () => {
        const part = PARTS[this.st.parts];
        g.give(part);
        this.m.toast(`${PART_NAMES[part]}! 공 옆 노란 원(발사대 자리)에서 F로 설치.`);
        this.updateObjective();
      },
    });
    add({
      id: 'launcher',
      obj: map.objs.launcher,
      radius: 1.6,
      promptY: 0.9,
      prompt: () => (this.active && this.st.parts >= 3 && !this.st.rolling && !this.st.stored && !this.st.shrunk && !this.st.rules.length ? '발사대 각도·힘 맞추기' : null),
      onInteract: () => void this.launch(),
      usePrompt: (item) => {
        if (!this.active || !item || !PARTS.includes(item)) return null;
        return `${PART_NAMES[item]} 설치하기`;
      },
      onUse: (item) => this.install(item as ItemId),
    });
    add({
      id: 'ruleBoard',
      obj: map.objs.ruleBoard,
      at: new THREE.Vector3(13.5, 0, -29.6),
      radius: 2.0,
      promptY: 1.6,
      prompt: () => (this.active && !this.st.rules.length && !this.st.stored && !this.st.shrunk ? '새 경기 규칙 정하기' : null),
      onInteract: () => void this.makeRules(),
    });
    add({
      id: 'ballCart',
      obj: map.objs.ballCart,
      radius: 1.5,
      promptY: 0.9,
      usePrompt: (item) => (this.active && item === 'dodgeball' ? '피구공 넣기' : null),
      onUse: () => this.putInCart(),
    });
  }

  // ───────── 시작 ─────────
  begin(fromLoad: boolean) {
    const g = this.g;
    const m = this.m;
    const map = g.map;
    this.st = fresh();
    for (const k of ['ballResolvedByPhysics', 'newSportInvented', 'ballShrunk', 'adultsHelpedGym']) delete g.save.flags[k];
    delete g.save.results.dodgeball;
    g.inventory.load([]);
    for (const k of [...g.items.keys()]) if (/^(drop|dball)/.test(k)) g.removeItem(k);
    map.setGymDoor(1);
    map.objs.launcherStand.visible = map.objs.launcherRamp.visible = map.objs.launcherPad.visible = false;
    map.setRuleBoard([]);
    map.objs.ballCartBalls.children.forEach((b, i) => (b.visible = i < 3));
    g.nav.rebuild(map.colliders, 0.3);
    this.resetBall();
    this.mesh.visible = true;
    this.mesh.scale.setScalar(1);
    if (!g.extraCircles.includes(this.circle)) g.extraCircles.push(this.circle);
    // 인물: 남쪽 벽에 줄
    const people: Npc[] = [m.n('seoa'), m.n('minjae'), m.n('junho'), m.n('harin'), ...g.fillers];
    people.forEach((n, i) => n.place(3.2 + i * 0.85, -17.0, Math.PI));
    const t = m.n('teacher');
    t.char.root.visible = true;
    t.place(9.6, -17.6, Math.PI);
    g.player.teleport(8.4, -18.4, Math.PI);
    g.tpc.behind(g.player.yaw);
    this.lastPlayer.copy(g.player.pos);
    g.setObjective('체육관에서 피구를 할 수 있게 해 주세요', null);
    void this.intro(fromLoad);
  }

  private resetBall() {
    this.ball = { x: BALL_START.x, z: BALL_START.z, vx: 0, vz: 0 };
    this.syncBall(0);
  }

  private async intro(fromLoad: boolean) {
    const m = this.m;
    const g = this.g;
    if (fromLoad) m.toast('사건 3은 처음부터 다시 시작해요.');
    await m.sleep(0.5);
    g.sfx.chime();
    g.tpc.shake(0.06, 1.2);
    await m.say([
      m.L('teacher', '5교시 체육! 오늘은 피구… 를… 하려고 했는데요.'),
      m.L('ai', m.save.playerWish === 'sport' ? `접수된 소원 「체육 매일」과 「피구공 분실 방지」를 함께 적용합니다.` : '접수된 소원 「피구공은 진짜 안 잃어버렸으면!」을 적용합니다.'),
      m.L('ai', '분실이 불가능한 크기로 확대했습니다. 1,000%.'),
      m.L('junho', '…저걸로 피구 하면 한 명 맞으면 반 전체가 아웃이야.'),
      ...(m.f('fixedMachine') ? [m.L('teacher', `${m.me}, 조리사 선생님이 이거 전해 달래요. 아까 고친 크기 조절기 리모컨이래요!`)] : []),
    ]);
    if (m.f('fixedMachine') && this.active) {
      g.give('sizeRemote');
      m.toast('크기 조절 리모컨을 받았어요! 거대 피구공 앞에서 F.', 'good');
    }
    this.updateObjective();
  }

  private async observe() {
    const m = this.m;
    await m.say([
      m.L('narr', '지름 2미터 반. 손으로 밀면 아주 조금 움직인다.'),
      m.L('seoa', m.f('fixedMachine') ? '리모컨으로 줄이거나, 발사대로 공 창고에 굴려 보내거나…' : '체육 창고 옆 선반에 발사대 부품이 있대. 공 창고 입구가 서쪽 벽에 있어.'),
      m.L('junho', '아니면… 이걸로 새 경기 만들자! 규칙판이 북쪽 벽에 있잖아!'),
    ]);
    this.updateObjective();
  }

  // ───────── 1. 발사 실험 ─────────
  private install(item: ItemId) {
    const g = this.g;
    const map = g.map;
    const need = PARTS[this.st.parts];
    if (item !== need) {
      g.sfx.oops();
      this.m.toast(`${PART_NAMES[need]}부터 설치해야 해요!`, 'warn');
      return;
    }
    g.take(item);
    this.st.parts++;
    [map.objs.launcherStand, map.objs.launcherRamp, map.objs.launcherPad][this.st.parts - 1].visible = true;
    g.sfx.place();
    this.m.toast(`발사대 ${this.st.parts}/3`, 'good');
    this.updateObjective();
  }

  private async launch() {
    const g = this.g;
    const m = this.m;
    const set = await m.guard(openLauncher(g.ui, this.st.last, this.st.launches >= 3));
    if (!set || !this.active) return;
    this.st.last = set;
    this.st.launches++;
    const r = simulateLaunch(set.angle, set.power);
    this.st.rolling = { path: r.path, i: 0, result: r.result };
    g.sfx.kick();
    g.tpc.shake(0.05, 0.5);
    await m.until(() => !this.st.rolling);
    if (r.result === 'stored') {
      this.st.stored = true;
      m.set('ballResolvedByPhysics');
      g.sfx.success();
      g.bark(m.n('junho'), '들어갔다!!! 물리 천재!');
      this.check();
      return;
    }
    g.bark(m.n(this.st.launches % 2 ? 'junho' : 'seoa'), launchAdvice(set.angle, set.power, r));
    await m.sleep(1.6);
    if (!this.active) return;
    this.m.toast('데굴데굴… 공이 다시 가운데로 돌아왔다.');
    this.resetBall();
    if (this.st.launches === 3) m.toast('친구들이 같이 계산해 준대요! 다음 발사부터 예상 경로가 보여요.', 'good');
  }

  // ───────── 2. 크기 조절 리모컨 ─────────
  private async shrink() {
    const g = this.g;
    const m = this.m;
    this.st.shrinkTried = true;
    const ok = await m.guard(openMachine(g.ui, () => g.bark(m.n('minjae'), '야 너무 작아! 구슬이 됐어ㅋㅋ'), { title: '크기 조절 리모컨 — 거대 피구공', skipWires: true }));
    if (!ok || !this.active) return;
    g.take('sizeRemote');
    g.sfx.rumble();
    for (let i = 0; i <= 24; i++) {
      this.mesh.scale.setScalar(1 - (i / 24) * 0.915);
      this.mesh.position.y = BALL_R * this.mesh.scale.x;
      await m.sleep(0.03);
    }
    this.mesh.visible = false;
    this.st.shrunk = true;
    m.set('ballShrunk');
    this.circle.r = 0;
    g.spawnItem('dball', 'dodgeball', this.ball.x, 0, this.ball.z);
    g.sfx.chime();
    g.bark(m.n('seoa'), '원래 크기다! 이제 공 수레에 넣자.');
    g.setObjective('작아진 피구공을 주워(E) 남서쪽 공 수레에 넣기(F)', this.inter.ballCart);
  }

  private putInCart() {
    const g = this.g;
    if (!g.take('dodgeball')) return;
    this.st.shrunkInCart = true;
    g.map.objs.ballCartBalls.children.forEach((b) => (b.visible = true));
    g.sfx.place();
    this.check();
  }

  // ───────── 3. 새 경기 ─────────
  private async makeRules() {
    const g = this.g;
    const m = this.m;
    const rules = await m.guard(openRules(g.ui, () => g.bark(m.n('teacher'), '안전 제일!')));
    if (!rules || !this.active) return;
    this.st.rules = rules;
    m.set('newSportRules');
    g.map.setRuleBoard(rules.map((id) => RULE_CARDS.find((c) => c.id === id)!.text));
    await m.say([
      m.L('teacher', '오, 좋은 규칙이네요! 경기 이름은… 「다 같이 굴려 굴려」?'),
      m.L('junho', m.f('pencilReturned') ? '필통 은인이랑 같은 팀이다! 가자!' : '좋아, 나 밀기 담당!'),
      m.L('minjae', m.save.results.robot === 'remote' ? '로봇도 그렇게 잘 몰더니, 공도 잘 몰겠지?' : '골대 두 곳! 북쪽이랑 동쪽!'),
    ]);
    for (const id of TEAM) m.n(id).char.setPose('cheer');
    this.updateObjective();
  }

  // ───────── 매 프레임 ─────────
  update(dt: number) {
    if (this.m.period !== 'dodgeball' || !this.mesh.visible) return;
    const g = this.g;
    const st = this.st;
    if (st.rolling) {
      // 계산해 둔 경로 재생 (30fps 기준)
      st.rolling.i += dt * 30;
      const i = Math.min(st.rolling.path.length - 1, Math.floor(st.rolling.i));
      const q = st.rolling.path[i];
      const prev = st.rolling.path[Math.max(0, i - 1)];
      this.ball.x = q.x;
      this.ball.z = q.z;
      this.syncBall(Math.hypot(q.x - prev.x, q.z - prev.z), q.x - prev.x, q.z - prev.z);
      if (i >= st.rolling.path.length - 1) {
        if (st.rolling.result === 'stored') {
          this.ball.x = -0.6;
          this.syncBall(0);
        }
        st.rolling = null;
      }
      return;
    }
    if (st.rules.length && !st.resolved && !st.stored && !st.shrunk) {
      const pushes: { dx: number; dz: number }[] = [];
      const p = g.player.pos;
      // 몸으로 밀기: 공에 붙어서(충돌로 막혀 있어도) 공 쪽으로 걷고 있으면
      const dx = this.ball.x - p.x, dz = this.ball.z - p.z;
      const d = Math.hypot(dx, dz);
      const f = g.player.forward();
      const facing = (f.x * dx + f.z * dz) / Math.max(d, 1e-3);
      if (d < BALL_R + 0.6 && g.player.speed > 0.5 && facing > 0.5) {
        const along = this.ball.vx * (dx / d) + this.ball.vz * (dz / d);
        const want = 2.6;
        if (along < want) pushes.push({ dx: (dx / d) * (want - along) * 0.5, dz: (dz / d) * (want - along) * 0.5 });
      }
      // 친구들이 영차! (다음 골대 쪽으로 살짝)
      st.helperT += dt;
      const goal = GOALS.find((gl) => !st.goalDone.has(gl.id));
      if (goal && st.helperT > 2.5) {
        st.helperT = 0;
        const [gx, gz] = goal.id === 'north' ? [9, -30] : [17, -23];
        const l = Math.hypot(gx - this.ball.x, gz - this.ball.z);
        pushes.push({ dx: ((gx - this.ball.x) / l) * 0.45, dz: ((gz - this.ball.z) / l) * 0.45 });
        const helper = this.m.n(TEAM[Math.floor(Math.random() * 2)]);
        void helper.walkTo(this.ball.x - ((gx - this.ball.x) / l) * 1.8, this.ball.z - ((gz - this.ball.z) / l) * 1.8, undefined, 2.6);
        g.bark(helper, ['영차!', '굴려 굴려~', '조금만 더!'][Math.floor(Math.random() * 3)], 1200);
      }
      const ox = this.ball.x, oz = this.ball.z;
      const ev = stepBall(this.ball, dt, pushes);
      if (ev === 'stored') {
        this.m.toast('창고 말고 골대로!', 'warn');
        this.ball = { x: 3.5, z: -26, vx: 0.8, vz: 0 };
      }
      this.syncBall(Math.hypot(this.ball.x - ox, this.ball.z - oz), this.ball.x - ox, this.ball.z - oz);
      for (const gl of GOALS) {
        if (!st.goalDone.has(gl.id) && gl.test(this.ball)) {
          st.goalDone.add(gl.id);
          st.goals++;
          g.sfx.cheer();
          g.tpc.shake(0.05, 0.6);
          for (const n of [...TEAM.map((id) => this.m.n(id)), this.m.n('seoa'), this.m.n('harin')]) {
            n.char.setPose('cheer');
            setTimeout(() => n.char.setPose('stand'), 1500);
          }
          this.m.toast(`골! ${gl.name} (${st.goals}/2) — 다 같이 「영차!」`, 'good');
          this.resetBall();
          this.updateObjective();
          this.check();
        }
      }
    }
    this.lastPlayer.copy(g.player.pos);
  }

  private syncBall(dist: number, dx = 0, dz = 0) {
    this.mesh.position.set(this.ball.x, BALL_R * this.mesh.scale.x, this.ball.z);
    if (dist > 0) {
      const axis = new THREE.Vector3(dz, 0, -dx).normalize();
      this.mesh.rotateOnWorldAxis(axis, dist / BALL_R);
    }
    this.circle.x = this.ball.x;
    this.circle.z = this.ball.z;
    this.circle.r = this.mesh.visible && !this.st.shrunk && this.ball.x > 0.5 ? BALL_R : 0;
  }

  // ───────── 판정 ─────────
  private check() {
    if (this.st.resolved) return;
    const st = this.st;
    const sol = decideDodge({ stored: st.stored, shrunkInCart: st.shrunkInCart, goals: st.goals, launches: st.launches, shrinkTried: st.shrinkTried, rulesSet: st.rules.length > 0 });
    this.updateObjective();
    if (sol) void this.resolve(sol, false);
  }

  private async resolve(sol: DodgeSolution, adults: boolean) {
    const g = this.g;
    const m = this.m;
    this.st.resolved = true;
    g.save.results.dodgeball = sol;
    if (adults) m.set('adultsHelpedGym');
    if (this.st.goals >= 2) m.set('newSportInvented');
    g.save.stats.launches = this.st.launches;
    await m.sleep(1);
    g.cutscene = true;
    g.tpc.override = { pos: new THREE.Vector3(9, 5, -15.5), look: new THREE.Vector3(8, 0.5, -24) };
    g.sfx.success();
    const ends: Record<DodgeSolution, [MainNpcId | 'ai', string][]> = {
      physics: [['seoa', `${this.st.launches}번 만에 성공! 각도랑 힘을 바꿔 가면서 실험한 거잖아.`], ['teacher', '과학 시간에 발표해도 되겠어요!']],
      shrink: [['minjae', '돈가스 기계 고친 게 여기서 쓰일 줄이야…'], ['ai', '크기 100% 복원. 분실 방지는 이름표로 대신하겠습니다.']],
      sport: [['junho', '「다 같이 굴려 굴려」 체육 대회 정식 종목으로 하자!'], ['teacher', '이건 다음 체육 시간에도 해요. 피구보다 다들 웃네요.']],
      mixed: [['harin', '실험도 하고, 경기도 하고! 오늘 체육 제일 재밌었다.'], ['ai', '여러 해결 방법을 기록했습니다.']],
    };
    await m.say([...ends[sol].map(([w, t]) => m.L(w, t)), m.L('ai', '삐빅. 다음 소원 「쉬는 시간 100분!」 처리를 준비합니다…')]);
    m.achievement('사건 3 해결: ' + DODGE_LABEL[sol]);
    g.tpc.override = null;
    g.cutscene = false;
    g.checkpoint();
    m.advance();
  }

  updateObjective() {
    const g = this.g;
    const st = this.st;
    if (!this.active) return;
    if (st.shrunk) return g.setObjective('작아진 피구공을 주워(E) 남서쪽 공 수레에 넣기(F)', g.inventory.has('dodgeball') ? this.inter.ballCart : null);
    if (st.rules.length) return g.setObjective(`새 경기! 공을 밀어서 골대에 — ${st.goals}/2 (북쪽 벽·동쪽 벽 분홍 골대)`, null);
    if (st.parts >= 3) return g.setObjective('발사대에서 각도·힘을 맞춰 공 창고(서쪽 파란 입구)로 굴려 보내기', this.inter.launcher);
    if (st.parts > 0 || PARTS.some((p) => g.inventory.has(p)))
      return g.setObjective(`발사대 조립 ${st.parts}/3 — 남동쪽 선반에서 부품을 꺼내 공 옆 노란 원에 설치`, PARTS.some((p) => g.inventory.has(p)) ? this.inter.launcher : this.inter.gymParts);
    g.setObjective(`체육관을 되찾기! (발사대 실험 · 새 경기 규칙${g.inventory.has('sizeRemote') ? ' · 크기 조절 리모컨' : ''})`, null);
  }

  // ───────── 대화 ─────────
  talk(id: MainNpcId): boolean {
    if (!this.active) return false;
    const m = this.m;
    const c = m.n(id).talkCount++;
    const pick = (a: string[]) => a[c % a.length];
    const lines: Partial<Record<MainNpcId, string>> = {
      seoa: m.f('fixedMachine') ? pick(['리모컨 있잖아! 공 앞에서 F 눌러 봐.', '뜀틀이 가운데 있어서 똑바로는 안 갈 거야. 비스듬히!']) : pick(['돈가스 때 그 기계를 고쳤으면 리모컨을 쓸 수 있었을 텐데…', '뜀틀이 가운데 있어서 똑바로는 안 갈 거야. 비스듬히!']),
      junho: pick(['규칙판 북쪽 벽에 있어! 새 경기 만들자!', '발사대 부품은 남동쪽 선반! 받침대 → 경사판 → 패드 순서야.']),
      minjae: pick(['이 공에 맞으면 집까지 날아갈 듯ㅋㅋ', m.f('festivalHeld') ? '돈가스 축제처럼 이것도 축제로 만들자!' : '피구 하고 싶었는데…']),
      harin: pick(['공 창고 입구는 서쪽 벽 파란 표시!', '너무 세게 하면 벽에 튕겨 나와. 적당히~']),
      teacher: pick(['위험한 건 안 돼요. 공이 사람 쪽으로 가지 않게!', '실험은 여러 번 해도 괜찮아요. 실패도 기록이에요.']),
    };
    const line = lines[id];
    if (!line) return false;
    void m.say([m.L(id, line)]);
    return true;
  }

  fillerTalk(i: number): boolean {
    if (!this.active) return false;
    const npc = this.g.fillers[i];
    this.g.bark(npc, ['저 공 위에 올라가 보고 싶다…', '체육 선생님 오시면 깜짝 놀라시겠다.', '난 응원 담당 할게!'][npc.talkCount++ % 3]);
    return true;
  }

  usePromptOn(): string | null {
    return null;
  }
  useOn() {}

  async onSoftLimit() {
    if (!this.active) return;
    const m = this.m;
    await m.say([m.L('teacher', '시간이 다 됐네요. 다 같이 공 창고로 밀어 봅시다! 하나, 둘, 셋!')]);
    if (this.st.resolved) return;
    this.st.rolling = { path: simulateLaunch(30, 8).path, i: 0, result: 'stored' };
    await m.until(() => !this.st.rolling);
    this.st.stored = true;
    await this.resolve(decideDodge({ stored: true, shrunkInCart: false, goals: this.st.goals, launches: this.st.launches, shrinkTried: this.st.shrinkTried, rulesSet: this.st.rules.length > 0 }) ?? 'physics', true);
  }

  hint(t: number) {
    if (!this.active || this.g.dialogue.active) return;
    const lvl = t > 220 ? 2 : t > 100 ? 1 : 0;
    if (lvl <= this.st.hintLevel) return;
    this.st.hintLevel = lvl;
    if (lvl === 1) this.g.bark(this.m.n('junho'), '발사대 부품은 남동쪽 선반! 아니면 북쪽 규칙판에서 새 경기!');
    else this.m.toast('힌트: 발사대 30° · 힘 8 정도면 뜀틀을 피해 창고로 간대요. 새 경기는 공을 몸으로 밀어서!', 'warn');
  }

  canPickup(): string | null {
    return null;
  }
  onPickup() {}
  onDropped() {}
  requiredItems(): ItemId[] {
    return this.g.inventory.has('sizeRemote') || !this.m.f('fixedMachine') || this.st.shrunk ? [] : ['sizeRemote'];
  }
  returnSpot(): [number, number, number] {
    return [8.4, -18.4, Math.PI];
  }

  /** 사건이 끝나면 공은 그대로 두되 충돌만 끈다 */
  leave() {
    this.mesh.visible = false;
    this.circle.r = 0;
  }

  recap(): string[] {
    const s = this.g.save;
    const sol = s.results.dodgeball as DodgeSolution | undefined;
    if (!sol) return [];
    const out = [`🏐 사건 3: ${DODGE_LABEL[sol]}`];
    if (s.stats.launches) out.push(`🚀 발사 실험 ${s.stats.launches}번`);
    if (this.m.f('newSportInvented')) out.push('🏆 새 종목 「다 같이 굴려 굴려」 발명');
    if (this.m.f('adultsHelpedGym')) out.push('🧑‍🏫 시간이 오래 걸려 다 같이 밀어서 마무리');
    return out;
  }
}
