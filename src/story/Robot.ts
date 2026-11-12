// 사건 2: 자동 청소 로봇의 역습 (GAME_DESIGN.md 7.1)
// 로봇이 친구들 물건까지 「정리 대상」으로 수거해 버렸다. 세 가지 방법으로 되돌린다.
//  1. 원격 조종: 태블릿 충전함 위 제어 패드 → 로봇을 직접 몰아 수거함에서 집어 분실물 보관함 칸에 분류 → remote
//  2. 청소 금지 구역: 고깔 3개를 표시 위에 놓고 제어 패드에서 저장 → 로봇이 스스로 돌려놓음 → zones (robotReprogrammed)
//  3. 비상정지: 친구 세 명에게 코드 숫자를 듣고 로봇 숫자판에 입력 → 수거함에서 꺼내 주인에게 직접 돌려줌 → stopcode
// 앞 사건 연결: sharedFairly → 지우가 도와줌, festivalHeld → 축제 포스터도 수거됨, 부스러기 많음 → 어수선함 +1
import * as THREE from 'three';
import type { Morning } from './Morning';
import type { MainNpcId, RemoteControl } from '../core/Game';
import type { ItemId } from '../data/items';
import { itemDef } from '../data/items';
import type { Npc } from '../npc/Npc';
import type { Interactable } from '../interact/Interaction';
import type { StoryEvent } from './StoryEvent';
import { makeItemMesh } from '../world/itemMesh';
import { openKeypad } from '../minigames/RobotPanels';
import { wa } from '../ui/dom';
import {
  CODE_HINTS, LOST_CAT_NAMES, ZONES, ZONE_LOST, ZONE_NAMES, compartmentOk, decideRobot, messLevel, startingBin,
  type LostCat, type LostItem, type Owner, type RobotSolution, type ZoneId,
} from './robotLogic';

const DOCK = { x: 4.3, z: 4.75 };
const BIN = { x: 5.3, z: 5.7 };
const COMPARTMENTS: { cat: LostCat; key: string; z: number }[] = [
  { cat: 'books', key: 'lostBooks', z: -4.0 },
  { cat: 'tools', key: 'lostTools', z: -3.4 },
  { cat: 'paper', key: 'lostPaper', z: -2.8 },
];
const SHELF_FRONT_X = 5.85;
const ZONE_SPOT: Record<ZoneId, [number, number]> = { desk: [-1.05, 0.4], board: [-3.6, 5.85], locker: [1.5, 5.85] };

export const ROBOT_LABEL: Record<RobotSolution, string> = {
  remote: '로봇을 원격 조종해 물건을 보관함에 분류함',
  zones: '청소 금지 구역을 정해 로봇이 스스로 돌려놓게 함',
  stopcode: '비상정지 코드로 멈추고 직접 돌려줌',
  mixed: '조종·구역 설정·비상정지를 섞어서 해결',
};

interface State {
  bin: LostItem[];
  clawItem: LostItem | null;
  hand: LostItem[];
  dropped: Map<string, LostItem>;
  grabbedZones: Set<ZoneId>;
  zonesPlaced: Set<ZoneId>;
  zonesSaved: boolean;
  stopped: boolean;
  codeKnown: (string | undefined)[];
  sortedByRemote: number;
  sortedByRobot: number;
  returnedByHand: number;
  restoredByFriend: number;
  extraGrabs: number;
  remoteUsed: boolean;
  resolved: boolean;
  hintLevel: number;
  autoToken: number;
}

const fresh = (): State => ({
  bin: [],
  clawItem: null,
  hand: [],
  dropped: new Map(),
  grabbedZones: new Set(),
  zonesPlaced: new Set(),
  zonesSaved: false,
  stopped: false,
  codeKnown: [undefined, undefined, undefined],
  sortedByRemote: 0,
  sortedByRobot: 0,
  returnedByHand: 0,
  restoredByFriend: 0,
  extraGrabs: 0,
  remoteUsed: false,
  resolved: false,
  hintLevel: 0,
  autoToken: 0,
});

export class RobotEvent implements StoryEvent {
  st: State = fresh();
  private inter: Record<string, Interactable> = {};
  private clawMesh: THREE.Object3D | null = null;
  private cones: Partial<Record<ZoneId, THREE.Object3D>> = {};
  private sorted = new THREE.Group();

  constructor(private m: Morning) {
    m.g.scene.add(this.sorted);
    this.register();
  }

  private get g() {
    return this.m.g;
  }
  private get robot() {
    return this.m.g.robot;
  }
  private get active() {
    return this.m.period === 'robot' && !this.st.resolved;
  }
  private ownerNpc(o: Owner): Npc | null {
    if (o === 'me') return null;
    return o.startsWith('filler') ? this.g.fillers[Number(o.slice(6))] : this.m.n(o as MainNpcId);
  }
  private ownerOf(npc: Npc): Owner | null {
    for (const o of ['seoa', 'junho', 'harin', 'minjae', 'filler0', 'filler1'] as Owner[]) if (this.ownerNpc(o) === npc) return o;
    return null;
  }
  private name(it: LostItem) {
    return itemDef(it.id).name;
  }

  // ───────── 상호작용 ─────────
  private register() {
    const g = this.g;
    const map = g.map;
    const add = (i: Interactable, glow = true) => (this.inter[i.id] = g.addInteractable(i, glow));
    add({
      id: 'robotPad',
      obj: map.objs.robotPad,
      radius: 1.5,
      promptY: 0.3,
      prompt: () => {
        if (!this.active) return null;
        if (this.st.zonesPlaced.size === 3 && !this.st.zonesSaved) return '청소 금지 구역 저장하기';
        if (this.st.zonesSaved) return null;
        return this.st.stopped ? '로봇 원격 조종하기 (비상정지 풀림)' : '로봇 원격 조종하기';
      },
      onInteract: () => (this.st.zonesPlaced.size === 3 && !this.st.zonesSaved ? void this.saveZones() : this.startRemote()),
    });
    add(
      {
        id: 'robotBody',
        obj: this.robot.root,
        radius: 1.3,
        promptY: 0.7,
        noGlow: true,
        prompt: () => (this.active && !this.st.stopped && !this.st.zonesSaved && !g.remote ? '로봇 비상정지 숫자판' : null),
        onInteract: () => void this.keypad(),
      },
      false,
    );
    add({
      id: 'robotBin',
      obj: map.objs.robotBin,
      radius: 1.4,
      promptY: 0.8,
      prompt: () => (this.active && this.st.bin.length ? (this.robot.mode === 'auto' ? '로봇 수거함 열어 보기' : '수거함에서 물건 꺼내기') : null),
      onInteract: () => this.takeFromBin(),
    });
    add({
      id: 'coneBox',
      obj: map.objs.coneBox,
      radius: 1.3,
      promptY: 0.6,
      prompt: () => (this.active && !this.st.zonesSaved && this.st.zonesPlaced.size < 3 && !g.inventory.has('zoneCone') ? '청소 금지 고깔 꺼내기' : null),
      onInteract: () => {
        g.give('zoneCone');
        this.m.toast('고깔을 들었다! 보호할 곳의 주황색 원 위에서 F.');
        this.updateObjective();
      },
    });
    for (const z of ZONES) {
      add(
        {
          id: 'zone_' + z,
          obj: map.objs['zone_' + z],
          radius: 1.3,
          promptY: 0.3,
          noGlow: true,
          usePrompt: (item) => (this.active && item === 'zoneCone' && !this.st.zonesPlaced.has(z) ? `${ZONE_NAMES[z]}에 고깔 놓기` : null),
          onUse: () => this.placeCone(z),
        },
        false,
      );
    }
  }

  // ───────── 시작 ─────────
  begin(fromLoad: boolean) {
    const g = this.g;
    const map = g.map;
    const m = this.m;
    this.st = fresh();
    for (const k of ['robotReprogrammed', 'robotResolved', 'adultsHelpedRobot']) delete g.save.flags[k];
    delete g.save.results.robot;
    // 소지품은 비우고 시작 (물건들은 각자 책상에)
    g.inventory.load([]);
    for (const k of [...g.items.keys()]) if (k.startsWith('drop')) g.removeItem(k);
    map.setRobotCorner(true);
    for (const z of ZONES) {
      this.cones[z]?.removeFromParent();
      delete this.cones[z];
    }
    this.sorted.clear();
    this.setClaw(null);
    g.nav.rebuild(map.colliders, 0.3);
    this.st.bin = startingBin(m.f('festivalHeld'));
    this.renderBin();
    const r = this.robot;
    r.root.visible = true;
    r.place(DOCK.x, DOCK.z, Math.PI);
    r.setMode('idle');
    r.speed = 1.0;
    // 인물
    const seats = map.seats;
    for (const id of ['seoa', 'minjae', 'junho', 'harin'] as MainNpcId[]) m.n(id).sitAt(seats[id]);
    g.fillers.forEach((f, i) => f.sitAt(seats['filler' + i]));
    const t = m.n('teacher');
    t.char.root.visible = true;
    t.place(0, -4.9, 0);
    g.player.teleport(5.6, 2.4, Math.PI);
    g.tpc.behind(g.player.yaw);
    g.setObjective('친구들 물건을 되찾아 주세요', null);
    void this.intro(fromLoad);
  }

  private async intro(fromLoad: boolean) {
    const m = this.m;
    const g = this.g;
    if (fromLoad) m.toast('사건 2는 처음부터 다시 시작해요.');
    await m.sleep(0.5);
    g.sfx.chime();
    await m.say([
      m.L('teacher', '자, 점심 맛있게 먹었죠? 청소 시간이에요. 각자 자리 주변만 정리!'),
      m.L('ai', m.save.playerWish === 'clean' ? `접수된 소원 「청소 자동」(신청: ${m.me})을 적용합니다.` : '접수된 소원 「청소는 로봇이 다 해 주면 좋겠다」를 적용합니다.'),
      m.L('ai', '정리 대상을 교실의 모든 물건으로 확장합니다. 위이잉—'),
      m.L('seoa', '어?! 내 국어책! 저 로봇이 가져갔어!'),
      m.L('minjae', '내 태블릿도!! 그건 쓰레기 아니야!'),
      ...(m.f('festivalHeld') ? [m.L('harin', '우리 축제 포스터까지 가져갔어… 「일회용 장식」이래.')] : []),
      ...((m.save.stats.cutletCrumbs ?? 0) >= 4 ? [m.L('ai', '급식실 부스러기 감지. 교실 청소 강도를 높입니다.')] : []),
    ]);
    if (m.f('sharedFairly') && this.active) {
      const helper = g.fillers[0];
      const ruler = this.st.bin.findIndex((b) => b.id === 'ruler');
      if (ruler >= 0) {
        this.st.bin.splice(ruler, 1);
        this.st.restoredByFriend++;
        this.renderBin();
        await m.say([{ who: helper.name, text: '아까 돈가스 공평하게 나눠 줘서 고마웠어! 내 자는 내가 찾아왔어. 나머지도 힘내!' }]);
      }
    }
    this.updateObjective();
    // 15초 뒤부터 로봇이 다른 물건도 치우러 다닌다
    this.robot.setMode('auto');
    void this.autoLoop(++this.st.autoToken);
  }

  // ───────── 로봇 자동 순찰 ─────────
  private async autoLoop(token: number) {
    const m = this.m;
    const r = this.robot;
    const alive = () => this.active && r.mode === 'auto' && this.st.autoToken === token;
    await m.sleep(15);
    for (const z of ZONES) {
      if (!alive()) return;
      if (this.st.zonesPlaced.has(z)) continue;
      this.g.bark(this.m.n('teacher'), `어? 로봇이 ${ZONE_NAMES[z]} 쪽으로 간다!`, 2600);
      const [x, zz] = ZONE_SPOT[z];
      if (!(await r.goTo(x + 0.5, zz - 0.4)) || !alive()) return;
      if (this.st.zonesPlaced.has(z)) {
        this.g.hud.toast('로봇: 「청소 금지 표시 감지. 지나갑니다.」');
        continue;
      }
      const item = ZONE_LOST[z];
      this.st.grabbedZones.add(z);
      this.st.extraGrabs++;
      this.setClaw(item);
      this.g.sfx.whoosh();
      this.g.hud.toast(`로봇이 ${this.name(item)}까지 가져갔어요!`, 'warn');
      if (!(await r.goTo(BIN.x, BIN.z - 0.85)) || !alive()) return;
      this.setClaw(null);
      this.st.bin.push(item);
      this.renderBin();
      this.updateObjective();
      await m.sleep(8);
    }
    if (alive()) await r.goTo(DOCK.x, DOCK.z);
  }

  // ───────── 1. 원격 조종 ─────────
  private startRemote() {
    const g = this.g;
    if (this.st.zonesSaved) return;
    this.st.autoToken++;
    if (this.st.stopped) this.m.toast('제어 패드로 비상정지를 풀고 조종해요.');
    this.st.stopped = false;
    this.robot.setMode('remote');
    this.st.remoteUsed = true;
    const ctl: RemoteControl = {
      target: () => this.robot.pos.clone().add(new THREE.Vector3(0, 0.4, 0)),
      onAction: () => this.clawAction(),
      onExit: () => this.stopRemote(),
    };
    g.remote = ctl;
    g.tpc.yaw = this.robot.yaw + Math.PI;
    g.setObjective('[조종 중] WASD 이동 · Space(클릭) 집게 · 수거함에서 집어 분실물 보관함 칸에 · E/Esc 그만', null);
    this.m.toast('로봇 조종 시작! 교실 뒤 수거함 → 앞쪽 분실물 보관함', 'info');
  }

  private stopRemote() {
    const g = this.g;
    if (g.remote) g.remote = null;
    if (this.robot.mode === 'remote') this.robot.setMode('idle');
    g.tpc.behind(g.player.yaw);
    this.updateObjective();
  }

  private clawAction() {
    const g = this.g;
    const r = this.robot;
    const cp = r.clawPoint();
    const nearBin = Math.hypot(cp.x - BIN.x, cp.z - BIN.z) < 0.85;
    const comp = COMPARTMENTS.map((c) => ({ ...c, d: Math.hypot(cp.x - 6.53, cp.z - c.z) })).sort((a, b) => a.d - b.d)[0];
    if (!this.st.clawItem) {
      if (nearBin && this.st.bin.length) {
        const it = this.st.bin.shift()!;
        this.setClaw(it);
        this.renderBin();
        g.sfx.pickup();
        g.hud.toast(`집게: ${this.name(it)} — 「${LOST_CAT_NAMES[it.cat]}」 칸으로!`);
      } else {
        g.sfx.blip();
        g.hud.toast(nearBin ? '수거함이 비었어요.' : '집을 게 없어요. 로봇 수거함(교실 뒤) 앞에서 Space!');
      }
      return;
    }
    const it = this.st.clawItem;
    if (comp.d < 0.55) {
      if (!compartmentOk(it, comp.cat)) {
        g.sfx.oops();
        g.hud.toast(`삐빅! ${this.name(it)}${wa(this.name(it)) === '과' ? '은' : '는'} 「${LOST_CAT_NAMES[it.cat]}」 칸이에요.`, 'warn');
        return;
      }
      this.putOnShelf(it, comp.cat);
      this.setClaw(null);
      this.st.sortedByRemote++;
      g.sfx.place();
      const owner = this.ownerNpc(it.owner);
      if (owner) g.bark(owner, ['찾았다! 고마워!', '로봇 운전 잘하는데?', '휴, 살았다~'][this.st.sortedByRemote % 3]);
      this.check();
      return;
    }
    if (nearBin) {
      this.st.bin.unshift(it);
      this.setClaw(null);
      this.renderBin();
      g.sfx.place();
      return;
    }
    g.sfx.blip();
    g.hud.toast('분실물 보관함(교실 앞 오른쪽) 칸 앞에서 Space!');
  }

  private putOnShelf(it: LostItem, cat: LostCat) {
    const anchor = this.g.map.objs[COMPARTMENTS.find((c) => c.cat === cat)!.key];
    const mesh = makeItemMesh(it.id);
    mesh.scale.setScalar(0.8);
    const n = anchor.children.length;
    mesh.position.set(0, 0.02 + n * 0.04, -0.12 + (n % 3) * 0.12);
    anchor.add(mesh);
  }

  private setClaw(it: LostItem | null) {
    this.st.clawItem = it;
    this.clawMesh?.removeFromParent();
    this.clawMesh = null;
    if (it) {
      const mesh = makeItemMesh(it.id);
      mesh.scale.setScalar(0.8);
      mesh.position.y = -0.1;
      this.robot.claw.add(mesh);
      this.clawMesh = mesh;
    }
  }

  private renderBin() {
    const grp = this.g.map.objs.robotBinItems;
    grp.clear();
    this.st.bin.forEach((it, i) => {
      const mesh = makeItemMesh(it.id);
      mesh.scale.setScalar(0.75);
      mesh.position.set(-0.25 + (i % 4) * 0.17, Math.floor(i / 4) * 0.06, -0.1 + (i % 2) * 0.18);
      mesh.rotation.y = i * 0.7;
      grp.add(mesh);
    });
  }

  // ───────── 2. 청소 금지 구역 ─────────
  private placeCone(z: ZoneId) {
    const g = this.g;
    if (!g.take('zoneCone')) return;
    this.st.zonesPlaced.add(z);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 14), new THREE.MeshLambertMaterial({ color: 0xff6b35 }));
    const [x, zz] = ZONE_SPOT[z];
    cone.position.set(x, 0.2, zz);
    cone.castShadow = true;
    g.scene.add(cone);
    this.cones[z] = cone;
    g.sfx.place();
    this.m.toast(`청소 금지 구역 ${this.st.zonesPlaced.size}/3 — ${ZONE_NAMES[z]}`, 'good');
    this.updateObjective();
  }

  private async saveZones() {
    const g = this.g;
    const m = this.m;
    this.stopRemote();
    this.st.zonesSaved = true;
    this.st.stopped = false;
    m.set('robotReprogrammed');
    g.sfx.chime();
    await m.say([
      m.L('ai', '청소 금지 구역 3곳을 저장했습니다. 정리 기준을 다시 계산합니다…'),
      m.L('ai', '「학생 물건은 정리 대상이 아님」을 학습했습니다. 잘못 수거한 물건을 분실물 보관함에 돌려놓겠습니다.'),
    ]);
    // 로봇이 스스로 하나씩 돌려놓는다 (빠르게)
    const r = this.robot;
    r.setMode('auto');
    r.speed = 3.0;
    const token = ++this.st.autoToken;
    g.setObjective('로봇이 물건을 돌려놓는 중…', null);
    while (this.st.bin.length && this.active && this.st.autoToken === token) {
      await r.goTo(BIN.x, BIN.z - 0.85);
      const it = this.st.bin.shift()!;
      this.renderBin();
      this.setClaw(it);
      const c = COMPARTMENTS.find((cc) => cc.cat === it.cat)!;
      await r.goTo(SHELF_FRONT_X, c.z);
      this.setClaw(null);
      this.putOnShelf(it, it.cat);
      this.st.sortedByRobot++;
      g.sfx.place();
    }
    if (this.st.clawItem) {
      this.putOnShelf(this.st.clawItem, this.st.clawItem.cat);
      this.setClaw(null);
    }
    r.speed = 1.0;
    void r.goTo(DOCK.x, DOCK.z);
    this.check();
  }

  // ───────── 3. 비상정지 + 직접 돌려주기 ─────────
  private async keypad() {
    const g = this.g;
    const ok = await this.m.guard(
      openKeypad(g.ui, this.st.codeKnown as string[], () => {
        this.robot.speed = Math.min(2.2, this.robot.speed + 0.3);
        g.tpc.shake(0.04, 0.4);
      }),
    );
    if (!ok) return;
    this.st.autoToken++;
    this.st.stopped = true;
    this.setClawToBin();
    this.robot.setMode('stopped');
    this.m.set('robotStopped');
    await this.m.say([this.m.L('ai', '비상정지. 청소를… 잠시… 쉬겠습니다…'), this.m.L('teacher', '휴, 멈췄다! 이제 수거함에서 꺼내서 주인한테 돌려주자.')]);
    this.updateObjective();
  }

  private setClawToBin() {
    if (this.st.clawItem) {
      this.st.bin.push(this.st.clawItem);
      this.setClaw(null);
      this.renderBin();
    }
  }

  private takeFromBin() {
    const g = this.g;
    if (this.robot.mode === 'auto') {
      g.sfx.oops();
      this.m.toast('로봇이 작동 중이라 수거함 뚜껑이 잠겨 있다. 멈추거나(비상정지) 직접 조종해 보자.', 'warn');
      return;
    }
    const it = this.st.bin.shift();
    if (!it) return;
    this.renderBin();
    if (it.owner === 'me') {
      this.st.returnedByHand++;
      g.sfx.pickup();
      this.m.toast(it.id === 'bag' ? '내 가방을 다시 책상 옆에 걸었다.' : it.id === 'miniPoster' ? '내 미니 포스터를 게시판에 다시 붙였다.' : '체육복을 사물함에 다시 넣었다.', 'good');
      this.check();
      return;
    }
    this.st.hand.push(it);
    g.give(it.id);
    const owner = this.ownerNpc(it.owner)!;
    this.m.toast(`${this.name(it)} — ${owner.name}에게 가서 F로 돌려주자.`);
    this.updateObjective();
  }

  usePromptOn(npc: Npc, item: ItemId | null): string | null {
    if (!this.active || !item) return null;
    const it = this.st.hand.find((h) => h.id === item);
    if (!it) return null;
    return this.ownerOf(npc) === it.owner ? `${this.name(it)} 돌려주기` : `${npc.name}에게 ${this.name(it)} 보여 주기`;
  }

  useOn(npc: Npc) {
    const g = this.g;
    const item = g.inventory.held;
    const idx = this.st.hand.findIndex((h) => h.id === item);
    if (idx < 0) return;
    const it = this.st.hand[idx];
    if (this.ownerOf(npc) !== it.owner) {
      const real = this.ownerNpc(it.owner)!;
      g.bark(npc, `그거 내 거 아니야~ ${real.name} 거 같은데?`);
      return;
    }
    g.take(it.id);
    this.st.hand.splice(idx, 1);
    this.st.returnedByHand++;
    g.sfx.success();
    const lines: Partial<Record<Owner, string>> = {
      seoa: '내 국어책! 86쪽에 낙서 안 생겼지? …다행이다, 고마워!',
      junho: this.m.f('pencilReturned') ? '또 내 필통 찾아 줬네?! 너 필통 전담 해라ㅋㅋ' : '내 필통! 고마워!',
      harin: it.id === 'festPoster' ? '축제 포스터! 이건 내 보물이야. 고마워!' : '풀 돌아왔다~ 이번엔 내가 빌려줄 차례!',
      minjae: '내 태블릿!! 쓰레기 아니라고 했잖아 로봇아… 고마워!',
      filler0: '내 자 찾아 줘서 고마워!',
      filler1: '사인펜 세트! 검정 아직 살아 있다!',
    };
    g.bark(npc, lines[it.owner] ?? '고마워!');
    this.check();
  }

  // ───────── 판정 ─────────
  private check() {
    if (this.st.resolved) return;
    const st = this.st;
    const sol = decideRobot({
      binLeft: st.bin.length + (st.clawItem ? 1 : 0),
      sortedByRemote: st.sortedByRemote,
      zonesSaved: st.zonesSaved,
      stopped: st.stopped,
      returnedByHand: st.returnedByHand,
      pendingHand: st.hand.length + st.dropped.size,
    });
    this.updateObjective();
    if (sol) void this.resolve(sol, false);
  }

  private async resolve(sol: RobotSolution, adults: boolean) {
    const g = this.g;
    const m = this.m;
    const st = this.st;
    st.resolved = true;
    this.stopRemote();
    st.autoToken++;
    g.save.results.robot = sol;
    m.set('robotResolved');
    if (adults) m.set('adultsHelpedRobot');
    g.save.stats.itemsRestored = st.sortedByRemote + st.sortedByRobot + st.returnedByHand + st.restoredByFriend;
    g.save.stats.messLevel = messLevel(g.save.stats.cutletCrumbs ?? 0, st.extraGrabs);
    await m.sleep(1);
    g.cutscene = true;
    g.tpc.override = { pos: new THREE.Vector3(3.5, 2.6, 1.0), look: new THREE.Vector3(5.3, 0.4, 5.0) };
    g.sfx.success();
    const ends: Record<RobotSolution, [MainNpcId | 'ai' | 'narr', string][]> = {
      remote: [['junho', '로봇 운전 진짜 잘한다! 나중에 피구공도 그렇게 몰아 줘ㅋㅋ'], ['ai', '수동 조종 기록을 학습했습니다. 다음부터 분류 칸을 확인하겠습니다.']],
      zones: [['seoa', '「여기는 치우지 마」를 알려 주니까 바로 알아듣네.'], ['ai', '청소 금지 구역 3곳 저장 완료. 학생 물건은 보호 대상입니다.']],
      stopcode: [['harin', '셋이 숫자 하나씩 알고 있었던 거, 완전 방탈출 같았어!'], ['teacher', '다들 물건 주인 찾아 주느라 수고했어요.']],
      mixed: [['minjae', '조종하고, 멈추고, 고깔까지… 너 로봇 담당 해라!'], ['ai', '여러 가지 방법을 기록했습니다.']],
    };
    await m.say([...ends[sol].map(([w, t]) => m.L(w, t)), m.L('ai', '삐빅. 다음 소원 「피구공은 진짜 안 잃어버렸으면!」 처리를 준비합니다…')]);
    m.achievement('사건 2 해결: ' + ROBOT_LABEL[sol]);
    g.tpc.override = null;
    g.cutscene = false;
    this.robot.setMode('idle');
    g.checkpoint();
    m.advance();
  }

  updateObjective() {
    const g = this.g;
    const st = this.st;
    if (!this.active || g.remote) return;
    const left = st.bin.length + (st.clawItem ? 1 : 0) + st.hand.length;
    if (st.zonesSaved) return g.setObjective('로봇이 물건을 돌려놓는 중…', null);
    if (st.stopped) {
      if (st.hand.length) return g.setObjective(`들고 있는 물건을 주인에게 돌려주기 (F) — 남은 물건 ${left}개`, null);
      return g.setObjective(`로봇 수거함에서 물건 꺼내기 (E) — 남은 물건 ${left}개`, this.inter.robotBin);
    }
    if (st.zonesPlaced.size === 3) return g.setObjective('제어 패드(태블릿 충전함 위)에서 청소 금지 구역 저장하기', this.inter.robotPad);
    if (st.zonesPlaced.size > 0 || g.inventory.has('zoneCone'))
      return g.setObjective(`청소 금지 고깔 놓기 ${st.zonesPlaced.size}/3 (내 책상 옆·뒤 게시판·사물함 앞 주황색 원)`, g.inventory.has('zoneCone') ? null : this.inter.coneBox);
    if (st.sortedByRemote > 0 || st.remoteUsed) return g.setObjective(`남은 물건 ${left}개 — 제어 패드로 로봇 조종해 분실물 보관함에 분류`, this.inter.robotPad);
    const known = st.codeKnown.filter(Boolean).length;
    g.setObjective(`친구들 물건 ${left}개를 되찾기! (방법: 로봇 조종 · 청소 금지 구역 · 비상정지 코드${known ? ` ${known}/3` : ''})`, null);
  }

  // ───────── 대화 ─────────
  talk(id: MainNpcId): boolean {
    if (!this.active) return false;
    const m = this.m;
    const st = this.st;
    const hint = CODE_HINTS.find((h) => h.who === id);
    if (hint) {
      const i = CODE_HINTS.indexOf(hint);
      const first = !st.codeKnown[i];
      st.codeKnown[i] = hint.digit;
      const lost = st.bin.find((b) => b.owner === id) || st.hand.find((b) => b.owner === id);
      void m.say([
        m.L(id, first ? hint.line : `비상정지 코드 ${i + 1}번째 자리는 ${hint.digit}! 잊지 마~`),
        ...(lost ? [m.L(id, `그리고 내 ${this.name(lost)}… 꼭 찾아 줘!`)] : []),
      ]);
      if (first) m.toast(`비상정지 코드 ${i + 1}번째 자리: ${hint.digit}  (${st.codeKnown.filter(Boolean).length}/3)`, 'good');
      this.updateObjective();
      return true;
    }
    if (id === 'minjae') {
      void m.say([m.L('minjae', ['태블릿 충전함 위에 로봇 리모컨 있던데? 그걸로 직접 몰면 되잖아!', '로봇아 내 태블릿 돌려줘… 그거 아직 할부… 아니 학교 거지.'][m.n('minjae').talkCount++ % 2])]);
      return true;
    }
    if (id === 'teacher') {
      void m.say([m.L('teacher', ['로봇 수거함 옆 상자에 「청소 금지 고깔」이 있어요. 지킬 곳에 세워 두면 피해 간대요.', '비상정지 코드는… 선생님도 기억이 안 나네. 친구들이 알지도?'][m.n('teacher').talkCount++ % 2])]);
      return true;
    }
    return false;
  }

  fillerTalk(i: number): boolean {
    if (!this.active) return false;
    const npc = this.g.fillers[i];
    const lost = this.st.hand.find((h) => h.owner === `filler${i}`) || this.st.bin.find((h) => h.owner === `filler${i}`);
    this.g.bark(npc, lost ? `내 ${this.name(lost)} 로봇이 가져갔어…` : ['로봇이 내 지우개 가루까지 가져갔어ㅋㅋ', '저 로봇 귀엽긴 한데 무서워.', '청소 시간 이렇게 시끄러운 거 처음이야.'][npc.talkCount++ % 3]);
    return true;
  }

  // ───────── 공통 ─────────
  async onSoftLimit() {
    if (!this.active) return;
    const m = this.m;
    await m.say([m.L('teacher', '시간이 많이 지났네요. 선생님이 비상정지 누를게요! 남은 건 다 같이 돌려주자.')]);
    if (this.st.resolved) return;
    this.st.autoToken++;
    this.stopRemote();
    this.setClawToBin();
    this.robot.setMode('stopped');
    this.st.stopped = true;
    this.st.restoredByFriend += this.st.bin.length + this.st.hand.length;
    for (const h of this.st.hand) this.g.take(h.id);
    this.st.bin = [];
    this.st.hand = [];
    this.renderBin();
    this.st.returnedByHand = Math.max(1, this.st.returnedByHand);
    await this.resolve(decideRobot({ binLeft: 0, sortedByRemote: this.st.sortedByRemote, zonesSaved: this.st.zonesSaved, stopped: true, returnedByHand: 1, pendingHand: 0 }) ?? 'stopcode', true);
  }

  hint(t: number) {
    if (!this.active || this.g.dialogue.active || this.g.remote) return;
    const lvl = t > 220 ? 2 : t > 100 ? 1 : 0;
    if (lvl <= this.st.hintLevel) return;
    this.st.hintLevel = lvl;
    if (lvl === 1) this.g.bark(this.m.n('minjae'), '태블릿 충전함 위 리모컨! 아니면 친구들한테 비상정지 코드 물어봐!');
    else this.m.toast('힌트: 제어 패드(태블릿 충전함 위)로 로봇 조종 / 고깔 3개 + 저장 / 서아·준호·하린에게 코드 듣고 로봇 숫자판', 'warn');
  }

  canPickup(): string | null {
    return null;
  }
  onPickup(id: ItemId, key: string) {
    const it = this.st.dropped.get(key);
    if (it) {
      this.st.dropped.delete(key);
      this.st.hand.push(it);
    }
    void id;
  }
  onDropped(id: ItemId, key: string) {
    // 떨어뜨린 물건도 아직 돌려줄 물건으로 센다 (판정의 pendingHand)
    const idx = this.st.hand.findIndex((h) => h.id === id);
    if (idx >= 0) this.st.dropped.set(key, this.st.hand.splice(idx, 1)[0]);
  }
  requiredItems(): ItemId[] {
    return [];
  }
  returnSpot(): [number, number, number] {
    return [5.6, 2.4, Math.PI];
  }

  recap(): string[] {
    const s = this.g.save;
    const sol = s.results.robot as RobotSolution | undefined;
    if (!sol) return [];
    const out = [`🤖 사건 2: ${ROBOT_LABEL[sol]}`];
    if (s.stats.itemsRestored) out.push(`📦 되찾은 물건 ${s.stats.itemsRestored}개`);
    if (s.stats.messLevel) out.push(`🧹 교실 어수선함 ${s.stats.messLevel}/5`);
    if (this.m.f('adultsHelpedRobot')) out.push('🧑‍🏫 시간이 오래 걸려 선생님이 비상정지를 도와줌');
    return out;
  }
}
