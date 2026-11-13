// 사건 1: 급식실의 전설적인 거대 돈가스 (GAME_DESIGN.md 6장)
// 선택지 버튼 없이, 실제 행동으로 세 가지 해결에 닿는다.
//  A. 안전 절단기로 잘라 친구 여섯 명 식판에 나눠 담기   → cut_and_share
//  B. 창고 구석 「음식 크기 조절기」 전선·숫자 퍼즐로 100% 복원 → shrink_machine
//  C. 방송실 마이크 → 조리사 선생님 허락 → 복도에 테이블 3개 → 친구 3명 초대 → 축제 방송 → festival
// 두 가지 이상을 섞으면 mixed. 결과는 SaveData.cafeteriaSolution과 플래그로 남는다.
import * as THREE from 'three';
import type { Morning } from './Morning';
import type { MainNpcId } from '../core/Game';
import type { ItemId } from '../data/items';
import type { Npc } from '../npc/Npc';
import type { Interactable } from '../interact/Interaction';
import { ownMaterials } from '../interact/Interaction';
import { CUTLET_H, CUTLET_W as CUTLET_W_ } from '../world/SchoolMap';
import { CAFE, FEST_SPOTS, cafe } from '../world/rooms';
import { DINERS, cutPieces, decideSolution, isFair, splitArea, trayDone, tryAddToTray, type Solution } from './cutletLogic';
import { openAnnounce, openCutter, openMachine, openSplit } from '../minigames/Cafeteria';
import { wa } from '../ui/dom';
import type { StoryEvent } from './StoryEvent';

// 급식실 기준 좌표 (1층 급식실 동): rooms.ts의 CAFE. 높이는 CAFE.y(1층 바닥)를 더한다
const Y = CAFE.y;
const TABLE = { x: CAFE.workTable.x, z: CAFE.workTable.z, top: CAFE.workTable.top };
const PASS = CAFE.passTable;
/** 이송대 위 조각은 조금 작게 보여 준다 (이송대가 작업대보다 좁다) */
const PIECE_SCALE = 0.7;
const STUDENT_IDS: MainNpcId[] = ['minjae', 'seoa', 'junho', 'harin'];
/** 식탁 자리 0~5에 앉는 사람 (0~2 서쪽 식탁, 3~5 동쪽 식탁) */
const DINER_OF = ['minjae', 'seoa', 'filler0', 'junho', 'harin', 'filler1'] as const;
type DinerId = (typeof DINER_OF)[number];

export const SOLUTION_LABEL: Record<Solution, string> = {
  cut_and_share: '안전 절단기로 잘라 친구들에게 나눠 줌',
  shrink_machine: '크기 조절기를 고쳐 원래 크기로 되돌림',
  festival: '복도에서 「거대 돈가스 축제」를 엶',
  mixed: '자르기·기계·축제를 섞어서 해결',
};

interface State {
  observed: boolean;
  talkedCook: boolean;
  installed: boolean;
  cut: boolean;
  misses: number;
  /** 월드에 놓인 조각: 아이템 키 → 크기 */
  pieceArea: Map<string, number>;
  carried: number | null;
  trays: number[]; // -1 = 식판 없음
  traysOnTable: [boolean, boolean];
  anyServed: boolean;
  machineFixed: boolean;
  machineTooSmall: number;
  festIdea: boolean;
  cookOk: boolean;
  tables: boolean[];
  invited: Set<MainNpcId>;
  festivalHeld: boolean;
  resolved: boolean;
  hintLevel: number;
}

const fresh = (): State => ({
  observed: false,
  talkedCook: false,
  installed: false,
  cut: false,
  misses: 0,
  pieceArea: new Map(),
  carried: null,
  trays: Array(DINERS).fill(-1),
  traysOnTable: [false, false],
  anyServed: false,
  machineFixed: false,
  machineTooSmall: 0,
  festIdea: false,
  cookOk: false,
  tables: [false, false, false],
  invited: new Set(),
  festivalHeld: false,
  resolved: false,
  hintLevel: 0,
});

export class CutletEvent implements StoryEvent {
  st: State = fresh();
  private pieceN = 0;
  /** 사건 중에만 보이는 물건들 (식판, 담긴 조각, 축제 테이블, 바닥 X 표시) */
  private deco = new THREE.Group();
  private trayMeshes: THREE.Object3D[] = [];
  private festTables: THREE.Object3D[] = [];
  private festMarks: THREE.Object3D[] = [];
  private inter: Record<string, Interactable> = {};
  private hat: THREE.Object3D | null = null;

  constructor(private m: Morning) {
    const g = m.g;
    g.scene.add(this.deco);
    this.buildDeco();
    this.register();
  }

  private get g() {
    return this.m.g;
  }
  private get active() {
    return this.m.period === 'cutlet' && !this.st.resolved;
  }
  private npcOf(d: DinerId): Npc {
    return d.startsWith('filler') ? this.g.fillers[Number(d.slice(6))] : this.m.n(d as MainNpcId);
  }
  private dinerIndex(npc: Npc): number {
    return DINER_OF.findIndex((d) => this.npcOf(d) === npc);
  }

  // ───────── 소품 ─────────
  private buildDeco() {
    const map = this.g.map;
    const trayMat = new THREE.MeshLambertMaterial({ color: 0xd7dde3 });
    for (let i = 0; i < DINERS; i++) {
      const s = map.seats['diner' + i];
      const t = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.32), trayMat);
      t.add(base);
      t.position.set(s.deskX, (s.y ?? 0) + 0.755, s.deskZ);
      t.rotation.y = s.yaw;
      t.visible = false;
      this.deco.add(t);
      this.trayMeshes.push(t);
    }
    const tableMat = new THREE.MeshLambertMaterial({ color: 0xe9e4d4 });
    const legMat = new THREE.MeshLambertMaterial({ color: 0x8a8f99 });
    const markMat = new THREE.MeshBasicMaterial({ color: 0xff8a5b, transparent: true, opacity: 0.85 });
    for (const [x, z] of FEST_SPOTS) {
      const t = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 1.2), tableMat);
      top.position.y = 0.7;
      top.castShadow = true;
      t.add(top);
      for (const [lx, lz] of [[-0.25, -0.5], [0.25, -0.5], [-0.25, 0.5], [0.25, 0.5]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.04), legMat);
        leg.position.set(lx, 0.35, lz);
        t.add(leg);
      }
      t.position.set(x, Y, z);
      t.visible = false;
      this.deco.add(t);
      this.festTables.push(t);
      const mark = new THREE.Group();
      for (const r of [0.6, -0.6]) {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.08), markMat);
        bar.rotation.set(-Math.PI / 2, 0, r);
        mark.add(bar);
      }
      mark.position.set(x, Y + 0.006, z);
      mark.visible = false;
      this.deco.add(mark);
      this.festMarks.push(mark);
    }
  }

  /** 조리사 선생님 모자·앞치마 (한 번만) */
  private dressCook() {
    if (this.hat) return;
    const cook = this.m.n('cook');
    const head = (cook.char as unknown as { head?: THREE.Object3D | null }).head;
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.16, 14), white);
    if (head) {
      // 머리 뼈 기준(로컬 크기가 다를 수 있어 월드 크기로 맞춘다)
      head.add(hat);
      const s = new THREE.Vector3();
      head.getWorldScale(s);
      hat.scale.setScalar(1 / (s.x || 1));
      hat.position.set(0, ((head as THREE.Bone).isBone ? 0.2 : 0.44) / (s.x || 1), 0.0);
    } else {
      cook.char.root.add(hat);
      hat.position.y = 1.75;
    }
    this.hat = hat;
  }

  // ───────── 상호작용 ─────────
  private register() {
    const g = this.g;
    const map = g.map;
    const add = (i: Interactable, glow = true) => (this.inter[i.id] = g.addInteractable(i, glow));

    add({
      id: 'cutletTable',
      obj: map.objs.giantCutlet,
      // 작업대 동쪽 끝 (안전 작업 구역 난간에서 손이 닿는 곳)
      at: cafe(TABLE.x + CAFE.workTable.w / 2 - 0.3, TABLE.z - CAFE.workTable.d / 2 + 0.4),
      radius: 3.1,
      promptY: 1.3,
      bias: 1.5,
      noGlow: true,
      prompt: () => (this.active && !this.st.cut && !this.st.machineFixed ? '거대 돈가스 살펴보기' : null),
      onInteract: () => void this.observe(),
      usePrompt: (item) => {
        if (!this.active || this.st.cut || this.st.machineFixed) return null;
        if (item === 'cutterUnit') return '안전 절단기 레일 걸기';
        if (item === 'ladle') return '국자로 잘라 보기…?';
        return null;
      },
      onUse: (item) => {
        if (item === 'cutterUnit') this.install();
        else if (item === 'ladle') void this.m.say([this.m.L('cook', '얘야, 국자로는 안 잘려~ 식재료 창고 선반에 「안전 절단기」가 있단다. 그걸 조리실 작업대에 걸자!')]);
      },
    });
    add({
      id: 'cutterPanel',
      obj: map.objs.cutterPanel,
      radius: 1.6,
      promptY: 1.3,
      prompt: () => (this.active && this.st.installed && !this.st.cut ? '절단기 패널 조작하기' : this.active && this.st.cut ? '절단기 패널 (큰 조각은 들고 F)' : null),
      onInteract: () => {
        if (!this.st.cut) void this.runCutter();
        else this.m.toast('식판보다 큰 조각은 들고 와서 F를 누르면 반으로 나눠 줘요.');
      },
      usePrompt: (item) => (this.active && item === 'cutletPiece' && (this.st.carried ?? 0) > 1 ? `조각 반으로 나누기 (크기 ${this.st.carried})` : null),
      onUse: () => void this.splitCarried(),
    });
    add({
      id: 'sizeMachine',
      obj: map.objs.sizeMachine,
      radius: 1.7,
      promptY: 1.5,
      prompt: () => (this.active && !this.st.machineFixed ? '크기 조절기 조작하기' : null),
      onInteract: () => void this.runMachine(),
    });
    add({
      id: 'foldStack',
      obj: map.objs.foldStack,
      radius: 1.6,
      promptY: 0.8,
      prompt: () => (this.active && !this.st.festivalHeld ? '접이식 테이블 꺼내기' : null),
      onInteract: () => {
        if (this.st.tables.every(Boolean)) return this.m.toast('테이블은 세 개면 충분해요.');
        if (this.g.inventory.has('foldTable')) return this.m.toast('하나씩 옮기자. 들고 있는 테이블부터 펼쳐요!');
        this.g.give('foldTable');
        this.m.toast(this.st.festIdea ? '접이식 테이블을 들었다. 급식실 앞 1층 복도의 X 표시에 펼치자!' : '접이식 테이블… 어디에 쓰면 좋을까?');
        this.showMarks();
      },
    });
    add({
      id: 'trayCart',
      obj: map.objs.trayCart,
      radius: 1.6,
      promptY: 1.0,
      prompt: () => (this.active && !this.st.traysOnTable.every(Boolean) && !this.g.inventory.has('trayStack') ? '식판 챙기기' : null),
      onInteract: () => {
        this.g.give('trayStack');
        this.m.toast('식판 여섯 개! 친구들 식탁에서 F를 눌러 하나씩 놓아 주자.');
        this.m.g.setObjective('친구들 식탁에 식판 놓기 (식판 들고 식탁에서 F)', this.inter.dinerTable0);
      },
    });
    for (let ti = 0; ti < 2; ti++) {
      add({
        id: 'dinerTable' + ti,
        obj: map.objs['dinerTable' + ti],
        radius: 2.0,
        promptY: 0.4,
        noGlow: true,
        usePrompt: (item) => (this.active && item === 'trayStack' && !this.st.traysOnTable[ti] ? '식판 세 개 놓기' : null),
        onUse: () => this.placeTrays(ti),
      });
    }
    add({
      id: 'mic',
      obj: map.objs.mic,
      radius: 1.5,
      promptY: 0.6,
      prompt: () => (this.active && !this.st.festivalHeld ? (this.festivalReady() ? '축제 안내 방송하기' : '방송 마이크 살펴보기') : null),
      onInteract: () => void this.useMic(),
    });
    FEST_SPOTS.forEach(([x, z], i) =>
      add(
        {
          id: 'festSpot' + i,
          obj: this.festMarks[i],
          at: cafe(x, z),
          radius: 1.4,
          promptY: 0.5,
          noGlow: true,
          usePrompt: (item) => (this.active && item === 'foldTable' && !this.st.tables[i] ? '테이블 펼치기' : null),
          onUse: () => this.placeFestTable(i),
        },
        false,
      ),
    );
  }

  // ───────── 사건 시작 ─────────
  begin(fromLoad: boolean) {
    const g = this.g;
    const map = g.map;
    this.st = fresh();
    // 다시 하기: 지난번 사건 결과는 지우고 새로 판정
    for (const k of ['sharedFairly', 'leftovers', 'fixedMachine', 'festivalHeld', 'festivalIdea', 'cookAgreedFestival', 'festivalAnnouncedWell', 'cutletResolved', 'adultsHelpedLunch']) delete g.save.flags[k];
    delete g.save.stats.cutletCrumbs;
    delete g.save.stats.leftoverPieces;
    g.save.cafeteriaSolution = null;
    this.dressCook();
    // 지난번 사건에서 남은 것 치우기
    for (const k of [...g.items.keys()]) if (/^(piece|cut_|tray_|fold_|ladle_)/.test(k)) g.removeItem(k);
    for (const id of ['cutterUnit', 'ladle', 'trayStack', 'cutletPiece', 'foldTable'] as ItemId[]) while (g.inventory.has(id)) g.inventory.remove(id);
    for (const t of this.trayMeshes) {
      t.visible = false;
      while (t.children.length > 1) t.remove(t.children[1]);
    }
    this.festTables.forEach((t) => (t.visible = false));
    this.festMarks.forEach((t) => (t.visible = false));
    const cut = map.objs.giantCutlet;
    cut.visible = true;
    cut.scale.setScalar(1);
    cut.getObjectByName('slab')!.visible = true;
    map.objs.cutterGantry.visible = false;
    map.objs.cutterPanel.visible = false;
    map.objs.cutletStack.visible = false;
    map.setMachineScreen('1000%');
    // 문 열기
    map.setCafeteriaDoor(1);
    map.cafeteriaDoor.collider.enabled = false;
    map.setBroadcastDoor(1);
    g.nav.rebuild(map.colliders, 0.3);
    // 창고 물건
    const si = CAFE.shelfItems;
    g.spawnItem('cut_unit', 'cutterUnit', si.x, Y + si.top, si.z, 0.2);
    g.spawnItem('ladle_1', 'ladle', si.x, Y + si.top, si.z2, 0.6);
    this.placeCast(fromLoad);
    g.setObjective('어떻게든 모두가 점심을 먹을 수 있게 하세요', null);
    void this.intro(fromLoad);
  }

  private placeCast(fromLoad: boolean) {
    const g = this.g;
    const seats = g.map.seats;
    const cook = this.m.n('cook');
    cook.char.root.visible = true;
    cook.place(CAFE.cook.x, CAFE.cook.z, CAFE.cook.yaw, Y);
    DINER_OF.forEach((d, i) => this.npcOf(d).sitAt(seats['diner' + i]));
    g.fillers.forEach((f, i) => {
      if (i < 2) return;
      f.place(10.3, 20.6 + (i - 2) * 0.7, -Math.PI / 2, Y); // 식탁 사이 통로에서 구경
    });
    const t = this.m.n('teacher');
    t.char.root.visible = true;
    t.place(9.9, 18.2, Math.PI * 0.85, Y);
    if (fromLoad) g.player.teleport(CAFE.entry.x, CAFE.entry.z, 0, Y);
    g.tpc.behind(g.player.yaw);
  }

  private async intro(fromLoad: boolean) {
    const m = this.m;
    if (fromLoad) m.toast('사건 1은 처음부터 다시 시작해요. (앞에서 한 오전 일은 그대로!)');
    await m.sleep(0.6);
    await m.say([
      m.L('teacher', '자자, 일단 다들 자리에 앉아요. 선생님이랑 조리사 선생님이 방법을…'),
      m.L('minjae', m.save.playerWish === 'lunch' ? `${m.me}${wa(m.me) === '과' ? '아' : '야'}, 너도 급식 소원 썼잖아. 우리 둘 다 범인이야ㅋㅋ` : '…이거 내 소원 때문이지? 나 진짜 그냥 농담으로 쓴 건데.'),
      m.L('narr', '목표: 어떻게든 모두가 점심을 먹을 수 있게 하자. (조리사 선생님과 이야기해 보거나, 급식실을 둘러보자)'),
    ]);
    this.g.setObjective('어떻게든 모두가 점심을 먹을 수 있게! (조리사 선생님과 이야기·급식실 둘러보기)', this.m.n('cook'));
  }

  // ───────── 관찰·대화 ─────────
  private async observe() {
    const m = this.m;
    this.st.observed = true;
    await m.say([
      m.L('narr', '돈가스 길이 5미터, 폭 3미터. 식판은… 손바닥 두 개만 하다.'),
      m.L('me', '이대로는 식판에 절대 안 들어가겠다.'),
    ]);
    if (!this.st.talkedCook) this.g.setObjective('조리사 선생님께 방법 여쭤보기', this.m.n('cook'));
  }

  /** 사건 중 주요 인물 대화. 처리했으면 true */
  talk(id: MainNpcId): boolean {
    if (!this.active) return false;
    const m = this.m;
    const st = this.st;
    const say = (lines: [MainNpcId | 'me', string][]) => void m.say(lines.map(([w, t]) => m.L(w, t)));
    if (id === 'cook') {
      if (st.festIdea && !st.cookOk) {
        st.cookOk = true;
        m.set('cookAgreedFestival');
        say([
          ['me', '복도에서 다 같이 나눠 먹는 「돈가스 축제」를 하면 어때요? 방송실 마이크도 켜져 있어요!'],
          ['cook', '축제? …하하, 좋다! 대신 줄 서서 차례대로, 뛰지 않기!'],
          ['cook', '식재료 창고에 접이식 테이블이 있어. 급식실 앞 복도에 세 개 펼치고, 도와줄 친구 세 명만 불러 오렴.'],
        ]);
        this.showMarks();
        this.updateObjective();
        return true;
      }
      const first = !st.talkedCook;
      st.talkedCook = true;
      if (first) {
        say([
          ['cook', '이걸 어떻게 학생들한테 나눠 주니?! 기계가 「1,000% 증가」래.'],
          ['cook', m.f('lunchExpert') ? '오, 네가 아침에 급식표 세 번 봤다는 급식 전문가구나! 도와줄래?' : '얘, 손 좀 빌려줄 수 있겠니?'],
          ['cook', '식재료 창고 선반에 「안전 절단기」가 있어. 조리실 문 안쪽 노란 난간까지만 들어와서 레일을 작업대에 걸면 버튼으로 자를 수 있지. 칼날 근처엔 오지 말고!'],
          ['cook', '아, 창고 구석엔 AI가 들여놓은 「크기 조절기」라는 것도 있던데… 나는 무서워서 안 만져 봤단다.'],
        ]);
        this.updateObjective();
        return true;
      }
      if (st.machineTooSmall > 0 && !st.machineFixed) {
        say([['cook', '아까 그건 도시락 반찬보다 작더라! 처음으로 돌리고 다시 맞춰 보자.']]);
        return true;
      }
      if (st.cut && !st.traysOnTable.every(Boolean)) {
        say([['cook', '식판은 식사 공간 동쪽 벽 수레에 있어. 친구들 식탁에 먼저 깔아 주렴.']]);
        return true;
      }
      if (st.cut) {
        say([['cook', '조각 하나 집어서(E) 친구한테 가서 F! 너무 크면 패널에서 반으로 나눠 줄게.']]);
        return true;
      }
      say([['cook', ['절단기는 창고 선반 위! 노란 상자야.', '국자랑 집게는 이번엔 쉬자~', '크기 조절기는… 설명 스티커라도 붙어 있으면 좋겠는데.'][m.n('cook').talkCount++ % 3]]]);
      return true;
    }
    if (st.festIdea && st.cookOk && STUDENT_IDS.includes(id) && !st.invited.has(id) && st.invited.size < 3) {
      void this.invite(id);
      return true;
    }
    const c = m.n(id).talkCount++;
    const pick = (a: string[]) => a[c % a.length];
    if (id === 'seoa')
      say([['seoa', m.f('foundAIManual') ? '아까 설명서에 「소원은 문자 그대로 처리됩니다」라고 했잖아. 그럼 크기를 숫자로 100%에 맞추면 되지 않을까?' : pick(['식판 하나에 들어가려면… 여섯 명이니까 여섯 조각 이상!', '창고에 이상한 기계 있다던데. 숫자 같은 거 나오는?'])]]);
    else if (id === 'minjae') say([['minjae', pick(['미안… 다음부턴 소원 쓸 때 「적당히」라고 쓸게.', '나 반성의 의미로 제일 작은 조각 먹을게. …아니 중간 거.'])]]);
    else if (id === 'junho')
      say([['junho', m.f('pencilReturned') ? '필통 찾아 준 거 고마웠어! 근데 방송실 문 열려 있던데? 거기서 축제 하자고 방송하면 재밌겠다!' : pick(['방송실 문 열려 있던데? 「돈가스 축제」 방송하면 웃기겠다ㅋㅋ', '배고파서 피구공도 돈가스로 보여…'])]]);
    else if (id === 'harin')
      say([['harin', m.save.groupRole === 'organizer' ? '정리 담당이었잖아! 식판은 배식대 옆 수레에 있어. 식판부터 깔아야 받지~' : pick(['식판 수레 저기 있어. 식판이 있어야 담지!', '조각 크기 똑같이 해야 돼. 안 그러면 민재가 큰 거 가져가.'])]]);
    else if (id === 'teacher') say([['teacher', pick(['선생님은 줄 정리할게요. 기계는 조리사 선생님이랑 같이!', '뛰지 말고 걸어서~ 바닥 미끄러워요.'])]]);
    else return false;
    return true;
  }

  fillerTalk(i: number): boolean {
    if (!this.active) return false;
    const npc = this.g.fillers[i];
    const line = i < 2 ? ['배고파… 식판이라도 먼저 줘~', '돈가스 냄새 때문에 더 배고파!'][npc.talkCount++ % 2] : ['줄 언제 줄어들어?', '저거 진짜 돈가스야? 침대 아니고?', '나 사진 찍고 싶다… 아 폰 없지.'][npc.talkCount++ % 3];
    this.g.bark(npc, line);
    return true;
  }

  // ───────── A. 자르기 ─────────
  private install() {
    const g = this.g;
    if (!g.take('cutterUnit')) return;
    this.st.installed = true;
    g.map.objs.cutterGantry.visible = true;
    g.map.objs.cutterPanel.visible = true;
    g.sfx.place();
    void this.m.say([this.m.L('cook', '레일 걸었구나! 이제 난간 옆 노란 패널에서 같이 자르자. 자른 조각은 내가 이송대에 올려 줄게!')]);
    g.setObjective('조리실 안전 작업 구역(노란 난간 안)의 절단기 패널 조작하기 (E)', this.inter.cutterPanel);
  }

  private async runCutter() {
    const g = this.g;
    if (this.st.machineFixed) return;
    const res = await this.m.guard(openCutter(g.ui, g.settings.quality === 'low'));
    if (!res || this.st.cut) return;
    this.st.cut = true;
    this.st.misses += res.misses;
    g.save.stats.cutletCrumbs = (g.save.stats.cutletCrumbs ?? 0) + res.misses;
    const map = g.map;
    map.objs.giantCutlet.getObjectByName('slab')!.visible = false;
    g.sfx.kick();
    g.tpc.shake(0.05, 0.4);
    // 자른 조각은 조리사 선생님이 배식 이송대(안전 구역 안)로 옮겨 준다 → 학생이 집어서 식사 공간으로
    const pieces = cutPieces(res.cuts, res.halved);
    const perRow = Math.ceil(pieces.length / 2);
    pieces.forEach((p, i) => {
      const col = Math.floor(i / 2), row = i % 2;
      const x = PASS.x - PASS.w / 2 + 0.15 + ((col + 0.5) * (PASS.w - 0.3)) / perRow;
      this.spawnPiece(p.area, x, PASS.z + (row ? 0.11 : -0.11), p.c1 - p.c0, p.half);
    });
    void this.m.n('cook').walkTo(PASS.x - 1.4, PASS.z + 0.6, Math.PI / 2, 2.2, Y);
    const fine = cutPieces(res.cuts, res.halved).every((p) => p.area <= 5);
    await this.m.say([
      this.m.L('cook', fine ? '와, 잘랐다! 이제 조각을 하나씩 집어서(E) 친구 식판에 담아 주렴(F).' : '잘랐다! 그런데 몇 개는 아직 식판보다 크네. 큰 건 들고 와서 패널에 F, 반으로 나눠 줄게.'),
      ...(this.st.misses >= 4 ? [this.m.L('minjae', '부스러기 엄청 튀었다ㅋㅋ 청소 당번 누구야…')] : []),
    ]);
    this.updateObjective();
  }

  private spawnPiece(area: number, x: number, z: number, cols: number, half: boolean) {
    const g = this.g;
    const key = `piece${this.pieceN++}`;
    const obj = g.spawnItem(key, 'cutletPiece', x, 0, z, 0);
    obj.clear();
    obj.add(g.map.cutletPieceMesh(cols, half));
    obj.position.y = Y + PASS.top + (CUTLET_H / 2) * PIECE_SCALE;
    obj.scale.setScalar(PIECE_SCALE);
    ownMaterials(obj);
    const it = g.interactions.get('item:' + key);
    if (it) {
      it.radius = 2.5;
      it.promptY = 0.35;
    }
    this.st.pieceArea.set(key, area);
  }

  private async splitCarried() {
    const g = this.g;
    const area = this.st.carried;
    if (!area || area < 2) return;
    const ok = await this.m.guard(openSplit(g.ui, area, g.settings.quality === 'low'));
    if (!ok || !g.take('cutletPiece')) return;
    this.st.carried = null;
    const [a, b] = splitArea(area);
    const cols = Math.max(1, Math.round(area / 2));
    this.spawnPiece(a, PASS.x + 0.55, PASS.z - 0.1, Math.max(1, Math.ceil(cols / 2)), true);
    this.spawnPiece(b, PASS.x + 0.55, PASS.z + 0.12, Math.max(1, Math.floor(cols / 2)), true);
    this.m.toast(`크기 ${a} + ${b}로 나눴어요. 배식 이송대 끝에 놓아 뒀어요.`);
  }

  /** 들고 있는 조각으로 친구 식판에 담기 */
  usePromptOn(npc: Npc, item: ItemId | null): string | null {
    if (!this.active || item !== 'cutletPiece') return null;
    const i = this.dinerIndex(npc);
    if (i < 0) return null;
    return `${npc.name} 식판에 담기 (크기 ${this.st.carried ?? '?'})`;
  }

  useOn(npc: Npc) {
    const g = this.g;
    const m = this.m;
    const i = this.dinerIndex(npc);
    const area = this.st.carried;
    if (i < 0 || area === null) return;
    if (this.st.trays[i] < 0) {
      g.bark(npc, '식판이 없어~ 배식대 옆 수레에서 식판부터!');
      return;
    }
    const r = tryAddToTray(this.st.trays[i], area);
    const d = DINER_OF[i];
    if (!r.ok) {
      g.sfx.oops();
      g.bark(npc, r.verdict === 'tooBig' ? '야ㅋㅋ 식판보다 크잖아!' : '나 이만큼은 다 못 먹어~ 다른 친구 줘!');
      if (r.verdict === 'tooBig') m.toast('너무 큰 조각은 조리실 안전 구역의 절단기 패널에서 F로 반으로 나눠요.');
      return;
    }
    g.take('cutletPiece');
    this.st.carried = null;
    this.st.trays[i] = r.total;
    this.st.anyServed = true;
    // 식판 위 조각
    const piece = g.map.cutletPieceMesh(Math.max(1, Math.round(area / 2)), true);
    const k = 0.32 / Math.max(0.32, (Math.max(1, Math.round(area / 2)) / 12) * CUTLET_W_);
    piece.scale.set(k, 0.25, k * 0.6);
    piece.position.set((this.trayMeshes[i].children.length - 1) * 0.08 - 0.04, 0.03, 0);
    this.trayMeshes[i].add(piece);
    g.sfx.place();
    if (r.verdict === 'small') {
      g.bark(npc, ['에게… 한 조각 더 주면 안 될까?', '이건 맛보기 크기네ㅋㅋ 하나만 더!'][i % 2]);
      return;
    }
    npc.char.setPose('cheer');
    setTimeout(() => npc.char.setPose('sit'), 1400);
    const happy: Record<DinerId, string> = {
      minjae: '이게 바로 내 소원의 맛…! 아 미안 미안, 고마워!',
      seoa: '딱 식판 크기네. 계산 잘했다!',
      junho: m.f('pencilReturned') ? '필통도 찾아 주고 돈가스도 주고! 너 오늘 최고다' : '오 바삭해! 고마워!',
      harin: m.f('returnedGlue') ? '풀 바로 돌려준 사람은 돈가스도 잘 나눠 주네~' : '와 고마워! 잘 먹을게!',
      filler0: '드디어 점심이다!! 고마워!',
      filler1: '이 정도면 딱 좋아. 땡큐!',
    };
    g.bark(npc, happy[d]);
    const done = this.st.trays.filter(trayDone).length;
    m.toast(`배식 ${done}/${DINERS}`, 'good');
    this.updateObjective();
    this.check();
  }

  private placeTrays(ti: number) {
    const g = this.g;
    this.st.traysOnTable[ti] = true;
    for (let k = 0; k < 3; k++) {
      const i = ti * 3 + k;
      this.st.trays[i] = 0;
      this.trayMeshes[i].visible = true;
    }
    g.sfx.place();
    if (this.st.traysOnTable.every(Boolean)) g.take('trayStack');
    this.g.bark(this.npcOf(DINER_OF[ti * 3 + 1]), ti ? '식판 왔다! 이제 돈가스만 오면 돼~' : '오, 식판! 고마워~');
    this.updateObjective();
  }

  // ───────── B. 크기 조절기 ─────────
  private async runMachine() {
    const g = this.g;
    const m = this.m;
    const ok = await m.guard(
      openMachine(g.ui, () => {
        this.st.machineTooSmall++;
        g.map.setMachineScreen('너무 작음!', '#ffb703');
        if (this.st.machineTooSmall === 1) g.bark(m.n('cook'), '어머, 이건 도시락 반찬보다 작네!');
      }),
    );
    if (!ok || this.st.machineFixed) {
      g.map.setMachineScreen('1000%');
      return;
    }
    this.st.machineFixed = true;
    m.set('fixedMachine');
    g.map.setMachineScreen('100% ✓');
    await this.shrinkAnimation();
    // 남은 조각도 원래 크기로
    for (const key of [...this.st.pieceArea.keys()]) if (g.items.has(key)) g.removeItem(key);
    if (g.inventory.has('cutletPiece')) g.take('cutletPiece');
    this.st.carried = null;
    g.map.objs.cutletStack.visible = true;
    await m.say([
      m.L('ai', '음식 크기 100% — 원래 크기로 복원했습니다. 돈가스 1장 → 돈가스 300장.'),
      m.L('cook', '세상에, 원래대로 돌아왔다! 자, 다들 줄 서라~ 한 장씩!'),
    ]);
    // 식판에 원래 크기 돈가스
    this.trayMeshes.forEach((t, i) => {
      t.visible = true;
      if (this.st.trays[i] < 3) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 12).scale(1.3, 1, 0.9), (g.map.objs.cutletStack.children[0] as THREE.Mesh).material);
        c.position.y = 0.03;
        t.add(c);
        this.st.trays[i] = Math.max(this.st.trays[i], 4);
      }
    });
    this.check();
  }

  private async shrinkAnimation() {
    const g = this.g;
    const cut = g.map.objs.giantCutlet;
    g.cutscene = true;
    // 안전 구역 쪽에서 작업대를 내려다본다
    g.tpc.override = { pos: cafe(13.6, 24.4, 2.6), look: cafe(TABLE.x, TABLE.z, 0.8) };
    g.sfx.rumble();
    for (let i = 0; i <= 30; i++) {
      const k = 1 - (i / 30) * 0.96;
      cut.scale.set(k, 1, k);
      await this.m.sleep(0.03);
    }
    cut.visible = false;
    g.sfx.chime();
    g.tpc.override = null;
    g.cutscene = false;
  }

  // ───────── C. 축제 ─────────
  private festivalReady() {
    return this.st.festIdea && this.st.cookOk && this.st.tables.every(Boolean) && this.st.invited.size >= 3;
  }

  private showMarks() {
    this.festMarks.forEach((mk, i) => (mk.visible = !this.st.tables[i]));
  }

  private async useMic() {
    const m = this.m;
    const st = this.st;
    if (!st.festIdea) {
      st.festIdea = true;
      m.set('festivalIdea');
      await m.say([
        m.L('narr', '방송 장비가 켜져 있다. 「AI 학교생활 개선 도우미 — 방송 대기 중」'),
        m.L('me', '여기서 「돈가스 축제」를 열자고 방송하면… 다 같이 나눠 먹을 수 있지 않을까?'),
        m.L('me', '그래도 먼저 조리사 선생님께 여쭤봐야겠다.'),
      ]);
      this.updateObjective();
      return;
    }
    if (!this.festivalReady()) {
      const need = [!st.cookOk && '조리사 선생님 허락', !st.tables.every(Boolean) && `복도 테이블 ${st.tables.filter(Boolean).length}/3`, st.invited.size < 3 && `도와줄 친구 ${st.invited.size}/3`].filter(Boolean).join(', ');
      m.toast(`아직 준비 중: ${need}`, 'warn');
      return;
    }
    const res = await m.guard(openAnnounce(this.g.ui, m.me));
    if (!res) return;
    if (res.good) m.set('festivalAnnouncedWell');
    await this.holdFestival(res.good);
  }

  private placeFestTable(i: number) {
    const g = this.g;
    if (!g.take('foldTable')) return;
    this.st.tables[i] = true;
    this.festTables[i].visible = true;
    this.festMarks[i].visible = false;
    g.sfx.place();
    const n = this.st.tables.filter(Boolean).length;
    this.m.toast(`축제 테이블 ${n}/3`, 'good');
    this.updateObjective();
  }

  private async invite(id: MainNpcId) {
    const m = this.m;
    const npc = m.n(id);
    this.st.invited.add(id);
    const lines: Record<string, string> = {
      minjae: '축제?! 내 소원이 축제가 되는 거야? 당연히 돕지!',
      seoa: '좋아. 줄 서는 순서 안내판 내가 만들게.',
      junho: m.f('pencilReturned') ? '필통 은인 부탁이면 무조건이지! 테이블 나르는 거 맡길게!' : '오 축제! 나 줄 세우기 잘해!',
      harin: m.save.groupRole === 'maker' ? '포스터 담당 출동~ 「돈가스 축제」 글씨 크게 써 줄게!' : '재밌겠다! 나도 갈래!',
    };
    await m.say([m.L('me', '우리 복도에서 돈가스 축제 하는데, 같이 도와줄래?'), m.L(id, lines[id])]);
    const k = this.st.invited.size - 1;
    const [x, z] = FEST_SPOTS[k];
    npc.char.setPose('stand');
    npc.seat = null;
    void npc.walkTo(x + 0.75, z, -Math.PI / 2, 2.4, Y); // 테이블 동쪽에 서서 서쪽(테이블)을 본다
    this.updateObjective();
  }

  private async holdFestival(good: boolean) {
    const g = this.g;
    const m = this.m;
    this.st.festivalHeld = true;
    m.set('festivalHeld');
    g.cutscene = true;
    g.sfx.cheer();
    g.tpc.override = { pos: cafe(10.4, 8.6, 2.6), look: cafe(8.2, 12.4, 0.9) };
    // 축제 테이블에 한입 조각
    const mat = (g.map.cutletPieceMesh(1, true).material as THREE.Material);
    for (const t of this.festTables)
      for (let k = 0; k < 4; k++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.12), mat);
        p.position.set(-0.1 + (k % 2) * 0.2, 0.75, -0.3 + Math.floor(k / 2) * 0.5);
        t.add(p);
      }
    g.map.objs.giantCutlet.getObjectByName('slab')!.visible = false;
    for (const key of [...this.st.pieceArea.keys()]) if (g.items.has(key)) g.removeItem(key);
    if (g.inventory.has('cutletPiece')) g.take('cutletPiece');
    this.st.carried = null;
    for (const id of this.st.invited) m.n(id).char.setPose('cheer');
    await m.say([
      m.L('ai', good ? '안내 방송을 확인했습니다. 「거대 돈가스 축제」를 시작합니다!' : '안내 방송… 순서는 조금 이상하지만 의도를 이해했습니다. 축제를 시작합니다!'),
      m.L('cook', '자, 한 줄로! 한입 조각부터 차례대로~ 뛰지 않기!'),
    ]);
    for (const id of this.st.invited) m.n(id).char.setPose('stand');
    g.tpc.override = null;
    g.cutscene = false;
    this.trayMeshes.forEach((t, i) => {
      t.visible = true;
      this.st.trays[i] = Math.max(this.st.trays[i], 4);
    });
    this.check();
  }

  // ───────── 판정·마무리 ─────────
  private check() {
    if (this.st.resolved) return;
    const st = this.st;
    const sol = decideSolution({ servedTrays: st.trays.filter(trayDone).length, anyServed: st.anyServed, machineFixed: st.machineFixed, festivalHeld: st.festivalHeld });
    if (sol) void this.resolve(sol, false);
  }

  private async resolve(sol: Solution, adults: boolean) {
    const g = this.g;
    const m = this.m;
    const st = this.st;
    st.resolved = true;
    g.save.cafeteriaSolution = sol;
    m.set('cutletResolved');
    if (adults) m.set('adultsHelpedLunch');
    if (st.anyServed && isFair(st.trays)) m.set('sharedFairly');
    const left = [...st.pieceArea.keys()].filter((k) => g.items.has(k)).length;
    if (left > 0 && sol === 'cut_and_share') {
      m.set('leftovers');
      g.save.stats.leftoverPieces = left;
    }
    g.setObjective('점심 해결!', null);
    await m.sleep(1.2);
    g.cutscene = true;
    g.tpc.override = { pos: cafe(9, 16.6, 2.6), look: cafe(9, 20.5, 0.8) };
    g.sfx.success();
    const ends: Record<Solution, [MainNpcId | 'ai' | 'narr', string][]> = {
      cut_and_share: [
        ['cook', m.f('sharedFairly') ? '여섯 명 다 공평하게! 너 배식 당번 해도 되겠다.' : '조금씩 크기는 달라도, 다들 먹었으니 됐다!'],
        ['seoa', '근데 남은 돈가스는…?'],
        ['cook', m.f('leftovers') ? '남은 건 다른 반에 나눠 줄게. 고마워!' : '하나도 안 남았네! 완벽해.'],
      ],
      shrink_machine: [
        ['seoa', '「소원은 문자 그대로」… 그럼 숫자로 되돌리면 되는 거였네.'],
        ['cook', '고마워라. 이 기계, 고친 사람만 쓸 줄 알겠다~'],
      ],
      festival: [
        ['minjae', '내 소원이 축제가 됐어…! 이건 성공한 거지?'],
        ['teacher', '이렇게 나누니까 오히려 더 즐겁네요. 다음 회의 안건으로 올려야겠어요.'],
      ],
      mixed: [
        ['cook', '자르고, 고치고, 나누고… 너 혼자 급식실 하나 운영하겠다!'],
        ['junho', '다음엔 뭐가 커질까? …농담이야!'],
      ],
    };
    await m.say([...ends[sol].map(([w, t]) => m.L(w, t)), m.L('ai', '삐빅. 다음 소원 「청소는 로봇이 다 해 주면 좋겠다」를 처리할 준비 중…')]);
    m.achievement('사건 1 해결: ' + SOLUTION_LABEL[sol]);
    g.tpc.override = null;
    g.cutscene = false;
    m.set('chapter1Done');
    g.save.chapter = 2;
    g.checkpoint();
    m.advance();
  }

  // ───────── 진행 안내 ─────────
  updateObjective() {
    const g = this.g;
    const st = this.st;
    if (st.resolved) return;
    const done = st.trays.filter(trayDone).length;
    if (st.festIdea && !st.festivalHeld && (st.cookOk || st.tables.some(Boolean) || st.invited.size)) {
      const parts = [st.cookOk ? null : '조리사 선생님 허락', `복도 테이블 ${st.tables.filter(Boolean).length}/3`, `도와줄 친구 ${st.invited.size}/3`].filter(Boolean).join(' · ');
      if (this.festivalReady()) return g.setObjective('방송실 마이크로 축제 안내 방송하기!', this.inter.mic);
      const target = !st.cookOk ? this.m.n('cook') : !st.tables.every(Boolean) ? (g.inventory.has('foldTable') ? this.inter['festSpot' + st.tables.indexOf(false)] : this.inter.foldStack) : null;
      return g.setObjective(`돈가스 축제 준비: ${parts}`, target);
    }
    if (st.festIdea && !st.cookOk) return g.setObjective('조리사 선생님께 「돈가스 축제」 여쭤보기', this.m.n('cook'));
    if (st.cut) {
      if (!st.traysOnTable.every(Boolean)) return g.setObjective(`식판 수레에서 식판 챙겨 친구들 식탁에 놓기 (${st.traysOnTable.filter(Boolean).length}/2)`, g.inventory.has('trayStack') ? this.inter['dinerTable' + st.traysOnTable.indexOf(false)] : this.inter.trayCart);
      return g.setObjective(`조각 집어서(E) 친구 식판에 담기(F) — ${done}/${DINERS}`, null);
    }
    if (st.installed) return g.setObjective('조리실 안전 작업 구역(노란 난간 안)의 절단기 패널 조작하기 (E)', this.inter.cutterPanel);
    if (st.talkedCook) return g.setObjective('방법 찾기: 식재료 창고 「안전 절단기」 · 창고 구석 기계 · 그 밖의 아이디어', null);
  }

  /** 막힘 방지: 시간이 지나면 친구·어른이 힌트를 주고, 10분이 넘으면 함께 마무리 */
  async onSoftLimit() {
    if (!this.active) return;
    const m = this.m;
    await m.say([m.L('teacher', '시간이 많이 지났네요. 선생님이랑 조리사 선생님이 남은 걸 도와줄게요!')]);
    if (this.st.resolved) return;
    this.trayMeshes.forEach((t, i) => {
      t.visible = true;
      this.st.trays[i] = Math.max(this.st.trays[i], 4);
    });
    const sol = decideSolution({ servedTrays: DINERS, anyServed: this.st.anyServed || true, machineFixed: this.st.machineFixed, festivalHeld: this.st.festivalHeld }) ?? 'cut_and_share';
    await this.resolve(this.st.anyServed || this.st.machineFixed || this.st.festivalHeld ? sol : 'cut_and_share', true);
  }

  hint(t: number) {
    if (!this.active || this.g.dialogue.active) return;
    const st = this.st;
    const lvl = t > 300 ? 2 : t > 150 ? 1 : 0;
    if (lvl <= st.hintLevel) return;
    st.hintLevel = lvl;
    if (lvl === 1 && !st.talkedCook) this.g.bark(this.m.n('cook'), '얘! 이리 와 보렴, 같이 방법을 찾자!');
    else if (lvl === 1) this.g.bark(this.m.n('harin'), st.cut ? '조각 들고 우리한테 와서 F!' : '창고 선반에 노란 상자 있던데? 절단기 아니야?');
    else if (lvl === 2) this.m.toast('힌트: 식재료 창고 선반의 「안전 절단기」를 들고 → 조리실 문 안 안전 구역에서 작업대에 F → 노란 패널에서 자르기', 'warn');
  }

  // ───────── 소지품 규칙 ─────────
  canPickup(id: ItemId, key: string): string | null {
    if (id === 'cutletPiece' && this.g.inventory.has('cutletPiece')) return '(뜨거워요! 한 번에 한 조각씩)';
    void key;
    return null;
  }

  onPickup(id: ItemId, key: string) {
    if (id === 'cutletPiece') {
      this.st.carried = this.st.pieceArea.get(key) ?? 4;
      this.st.pieceArea.delete(key);
      this.m.toast(`돈가스 조각 (크기 ${this.st.carried}) — 친구에게 가서 F`, 'info');
    }
    if (id === 'cutterUnit') this.g.setObjective('조리실 작업대에 절단기 레일 걸기 (조리실 문 안 안전 구역에서 작업대 쪽으로 F)', this.inter.cutletTable);
    if (id === 'foldTable') this.showMarks();
  }

  onDropped(id: ItemId, key: string) {
    if (id === 'cutletPiece' && this.st.carried !== null) {
      this.st.pieceArea.set(key, this.st.carried);
      this.st.carried = null;
    }
  }

  requiredItems(): ItemId[] {
    return [];
  }

  returnSpot(): [number, number, number, number] {
    return [CAFE.entry.x, CAFE.entry.z, 0, Y];
  }

  recap(): string[] {
    const s = this.g.save;
    if (!s.cafeteriaSolution) return [];
    const out = [`🍖 사건 1: ${SOLUTION_LABEL[s.cafeteriaSolution]}`];
    if (this.m.f('sharedFairly')) out.push('⚖️ 여섯 명에게 공평하게 배식');
    if (this.m.f('leftovers')) out.push(`🍱 남은 조각 ${s.stats.leftoverPieces ?? 0}개는 다른 반으로`);
    if (this.m.f('fixedMachine')) out.push('🔧 크기 조절기 수리 (나중에 쓸모가 있을지도?)');
    if (this.m.f('festivalHeld')) out.push('🎉 복도 「돈가스 축제」 개최');
    if (s.stats.cutletCrumbs) out.push(`🍞 튄 부스러기 ${s.stats.cutletCrumbs}번 (청소 당번 주의)`);
    if (this.m.f('adultsHelpedLunch')) out.push('🧑‍🍳 시간이 오래 걸려 어른들이 마무리를 도와줌');
    return out;
  }
}
