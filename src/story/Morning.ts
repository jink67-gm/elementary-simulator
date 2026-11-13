// 1장: 오전 학교생활 (등교 → 1교시 국어 → 쉬는 시간 → 2교시 수학 → 3교시 모둠 → 4교시 미술 → 급식실 전환)
// 행동 → NPC 반응 → 플래그 → 실패 복구 순서로 설계. 선택지 버튼 대신 실제 월드 행동으로 진행한다.
import { ChatPicker, type ChatNpc, type ChatPeriod, type ChatStage } from '../data/chatter';
import type { Gesture } from '../world/Character';
import { CAFE, CAFE_FRONT, FLOOR1_Y as F1, cafe } from '../world/rooms';
import { GROUP_TABLE } from '../world/classroomLayout';
import * as THREE from 'three';
import type { Game, MainNpcId, StoryHooks } from '../core/Game';
import type { GroupRole, PeriodId, PosterTheme, SaveData, Wish } from '../core/SaveData';
import { itemDef, type ItemId } from '../data/items';
import type { Line } from '../ui/Dialogue';
import type { Npc } from '../npc/Npc';
import type { Interactable } from '../interact/Interaction';
import { SCHEDULE, clockMinutes, formatClock, nextPeriod } from './schedule';
import { makeItemMesh } from '../world/itemMesh';
import { openTextbookClue, openTextbookFind } from '../minigames/Textbook';
import { openTablet, WISH_LABELS } from '../minigames/Tablet';
import { pickQuestions } from '../minigames/quizLogic';
import { openPoster, STICKERS } from '../minigames/Poster';
import { openFolding, openInfo, openRps, openSpeech, SPEECH_CARDS } from '../minigames/SmallGames';
import { panelsOpen } from '../ui/Panel';
import { wa } from '../ui/dom';
import { CutletEvent } from './Cutlet';
import { FLOOR1_Y } from '../world/SchoolMap';
import { RobotEvent } from './Robot';
import { DodgeEvent } from './Dodgeball';
import { HallwayEvent } from './Hallway';
import { FinalEvent } from './Final';
import type { Ending } from './finalLogic';
import type { StoryEvent } from './StoryEvent';

const never = () => new Promise<never>(() => {});
/** 등교 시작: 1층 현관 앞 마당 (서쪽 현관을 바라봄) */
const SPAWN = { x: 23.2, z: -1.5, y: FLOOR1_Y, yaw: -Math.PI / 2 }; // 정문 앞 보도블록 길 (캐노피·간판이 한눈에 보이게)
const ROLE_ITEMS: Record<GroupRole, ItemId> = { speaker: 'roleSpeaker', maker: 'roleMaker', researcher: 'roleResearcher', organizer: 'roleOrganizer' };
const ROLE_NAMES: Record<GroupRole, string> = { speaker: '발표', maker: '제작', researcher: '자료', organizer: '정리' };
const WISH_THEME: Record<Wish, PosterTheme> = { lunch: 'food', break: 'rest', sport: 'play', clean: 'friends' };
const THEME_SLOGAN: Record<PosterTheme, string> = {
  food: '급식 메뉴, 우리가 같이 정해요!',
  rest: '쉬는 시간에 쉴 공간이 더 있으면 좋겠어요',
  play: '운동장에서 함께 노는 시간을 늘려요',
  friends: '서로 인사하는 우리 학교',
};
const ORGANIZE: ItemId[] = ['scissors', 'ruler', 'glueStick', 'tape', 'colorPaperPack', 'markers'];
const BIN_NAMES = { cut: '자르기·재기', stick: '붙이기', paper: '종이·펜' } as const;
const RESEARCH = ['bulletin', 'board', 'bookshelf'] as const;

type Phase = string;

/** 6-1 반 친구 자리 (플레이어 빼고 7명) */
const CLASSMATES = ['seoa', 'minjae', 'junho', 'harin', 'filler0', 'filler1', 'filler2'];

export class Morning implements StoryHooks {
  period: PeriodId = 'arrival';
  phase: Phase = '';
  t = 0;
  private token = 0;
  private waiters: { cond: () => boolean; res: () => void; token: number }[] = [];
  save!: SaveData;
  private ambientT = 0;
  private props: Record<string, THREE.Object3D> = {};
  private inter: Record<string, Interactable> = {};
  private seatPos = new THREE.Vector3();
  private menuViews = 0;
  private researchDone = new Set<string>();
  private organized = 0;
  private handRaised = false;
  private softFired = false;
  onChapterEnd: (save: SaveData) => void = () => {};

  cutlet: CutletEvent;
  robot: RobotEvent;
  dodge: DodgeEvent;
  hallway: HallwayEvent;
  final: FinalEvent;
  /** 최종 사건 엔딩 (main.ts가 엔딩 화면을 연다) */
  onEnding: (save: SaveData, ending: Ending, epilogue: string[]) => void = () => {};

  /** 지금 교시가 점심 이후 사건이면 그 사건 */
  ev(): StoryEvent | null {
    if (this.period === 'cutlet') return this.cutlet;
    if (this.period === 'robot') return this.robot;
    if (this.period === 'dodgeball') return this.dodge;
    if (this.period === 'hallway') return this.hallway;
    if (this.period === 'final') return this.final;
    return null;
  }

  /** 사건이 끝나면 다음 사건으로, 더 없으면 장 끝 화면 */
  advance() {
    const next = nextPeriod(this.period);
    if (next) this.enterPeriod(next, false);
    else {
      this.set('storyEnd');
      this.g.checkpoint();
      this.onChapterEnd(this.save);
    }
  }

  constructor(public g: Game) {
    this.buildProps();
    this.registerWorld();
    this.cutlet = new CutletEvent(this);
    this.robot = new RobotEvent(this);
    this.dodge = new DodgeEvent(this);
    this.hallway = new HallwayEvent(this);
    this.final = new FinalEvent(this);
  }

  // ───────────────────────── 도우미 ─────────────────────────
  get me() {
    return this.save.avatar.nickname;
  }
  get flags() {
    return this.save.flags;
  }
  f(k: string) {
    return !!this.save.flags[k];
  }
  set(k: string, v = true) {
    this.save.flags[k] = v;
  }
  n(id: MainNpcId): Npc {
    return this.g.npcs[id];
  }
  L(who: MainNpcId | 'me' | 'ai' | 'narr' | 'cook' | `filler${number}`, text: string, act?: () => void): Line {
    const name = who === 'me' ? this.me : who === 'ai' ? 'AI 방송' : who === 'narr' ? '' : who === 'cook' ? '조리사 선생님' : who.startsWith('filler') ? this.g.fillers[Number(who.slice(6))].name : this.n(who as MainNpcId).name;
    return { who: name, text, act };
  }
  /** 교시가 바뀌면 이전 교시의 대기는 영원히 멈춘다(취소). */
  guard<T>(p: Promise<T>): Promise<T> {
    const tk = this.token;
    return p.then((v) => (tk === this.token ? v : never()));
  }
  say(lines: Line[]) {
    return this.guard(this.g.say(lines));
  }
  until(cond: () => boolean): Promise<void> {
    if (cond()) return Promise.resolve();
    return new Promise((res) => this.waiters.push({ cond, res, token: this.token }));
  }
  /** 게임 시간으로 기다리기. 교시가 바뀌면 영원히 깨어나지 않는다(이전 교시 대본이 다시 움직이지 않게). */
  sleep(sec: number): Promise<void> {
    const end = this.t + sec;
    return this.until(() => this.t >= end);
  }
  bark(id: MainNpcId, text: string, ms?: number) {
    this.g.bark(this.n(id), text, ms);
  }
  toast(text: string, kind: 'info' | 'good' | 'warn' = 'info') {
    this.g.hud.toast(text, kind);
  }
  private get seated() {
    return !!this.g.player.seat;
  }
  get students(): Npc[] {
    return [this.n('minjae'), this.n('seoa'), this.n('junho'), this.n('harin')];
  }
  achievement(text: string) {
    this.g.sfx.success();
    this.toast('★ ' + text, 'good');
  }

  // ───────────────────────── 소품 ─────────────────────────
  private buildProps() {
    const m = this.g.map;
    const add = (key: string, obj: THREE.Object3D, x: number, y: number, z: number, ry = 0) => {
      obj.position.set(x, y, z);
      obj.rotation.y = ry;
      obj.visible = false;
      this.g.scene.add(obj);
      this.props[key] = obj;
      return obj;
    };
    const ps = m.seats.player;
    this.seatPos.set(ps.x, 0, ps.z);
    const bag = add('deskBag', makeItemMesh('bag'), ps.deskX - 0.38, 0.25, ps.deskZ, Math.PI / 2);
    bag.scale.setScalar(0.9);
    add('deskBook', makeItemMesh('koreanBook'), ps.deskX - 0.08, 0.67, ps.deskZ + 0.02, 0.1);
    add('deskTablet', makeItemMesh('tablet'), ps.deskX + 0.15, 0.655, ps.deskZ - 0.02, -0.15);
    const ss = m.seats.seoa;
    add('seoaBook', makeItemMesh('koreanBook'), ss.deskX, 0.67, ss.deskZ, -0.1);

    add('posterSheet', new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.01, 0.6), new THREE.MeshLambertMaterial({ color: 0xfff3b0 })), GROUP_TABLE.x, GROUP_TABLE.top + 0.006, GROUP_TABLE.z);
    const paperStack = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 0.25), new THREE.MeshLambertMaterial({ color: 0x58c4f6 }));
    add('colorPaperStack', paperStack, GROUP_TABLE.x - 0.8, GROUP_TABLE.top + 0.031, GROUP_TABLE.z - 0.1);
    const drawStack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.4), new THREE.MeshLambertMaterial({ color: 0xfffaf0 }));
    add('drawingStack', drawStack, GROUP_TABLE.x + 0.8, GROUP_TABLE.top + 0.031, GROUP_TABLE.z - 0.1);
    // 전시된 작품
    add('exhibitPlane', makeItemMesh('paperPlane'), -3.6, 2.0, 6.86, Math.PI).scale.setScalar(1.6);
    const mini = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.6), new THREE.MeshLambertMaterial({ color: 0xffd6a5 }));
    add('exhibitPoster', mini, -3.0, 2.0, 6.88, Math.PI);
    // 반 친구들 작품 (분위기)
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), new THREE.MeshLambertMaterial({ color: [0xcdeac0, 0xffd6e0, 0xcde7f0, 0xfff3b0, 0xe2cfea][i] }));
      add('classArt' + i, p, -4.9 + i * 0.5 + (i > 2 ? 0.9 : 0), 1.75 + (i % 2) * 0.15, 6.89, Math.PI);
    }
    // 수학 시간 친구들 태블릿: 현우가 책상에 놓아 준 것만 보인다 (npcTablet_자리)
    for (const key of CLASSMATES) {
      const seat = m.seats[key];
      add('npcTablet_' + key, makeItemMesh('tablet'), seat.deskX + 0.05, 0.665, seat.deskZ - 0.03, 0.1);
    }
  }

  private show(key: string, v: boolean) {
    if (this.props[key]) this.props[key].visible = v;
  }

  /** 앞선 행동(플래그)을 교실 모습에 반영 */
  private syncProps() {
    const p = this.period;
    const after = (q: PeriodId) => SCHEDULE[p].start >= SCHEDULE[q].start;
    this.show('deskBag', this.bagHung());
    this.g.player.setBackpack(!this.bagHung());
    this.show('deskBook', this.f('bookOnDesk') && p !== 'lunch');
    this.show('seoaBook', p === 'korean');
    this.show('deskTablet', this.f('tabletOnDesk') && (p === 'math' || p === 'group'));
    for (const key of CLASSMATES) this.show('npcTablet_' + key, p === 'math' && this.tabletHanded(key) && !(key === 'seoa' && this.f('helpedDevice_share')));
    this.syncCartSlots();
    this.show('posterSheet', p === 'group' && !this.f('groupDone'));
    this.show('colorPaperStack', false);
    this.show('drawingStack', false);
    this.show('exhibitPlane', this.f('exhibited') && this.f('artPlane'));
    this.show('exhibitPoster', this.f('exhibited') && this.f('artPoster'));
    for (let i = 0; i < 5; i++) this.show('classArt' + i, after('lunch') || (p === 'art' && this.phase === 'cleanup'));
    if (this.f('groupDone') && after('art')) this.applyGroupPoster();
    else this.g.map.objs.groupPoster.visible = false;
    this.g.map.objs.giantCutlet.visible = p === 'lunch' || p === 'cutlet';
    if (p !== 'hallway') this.hallway.leave();
    if (p !== 'final') this.final.leave();
    if (p !== 'dodgeball') {
      this.dodge.leave();
      this.g.map.setGymDoor(0);
    }
    if (p !== 'robot') {
      this.g.robot.root.visible = false;
      this.g.robot.setMode('idle');
      this.g.remote = null;
      this.g.map.setRobotCorner(false);
    }
    if (p !== 'cutlet') {
      this.g.map.setCafeteriaDoor(0);
      this.g.map.cafeteriaDoor.collider.enabled = true;
      this.g.map.setBroadcastDoor(0);
      this.g.map.objs.cutterGantry.visible = false;
      this.g.map.objs.cutterPanel.visible = false;
      this.g.map.objs.cutletStack.visible = false;
      this.g.nav.rebuild(this.g.map.colliders, 0.3);
    }
    this.g.map.objs.lockerDoor.rotation.y = 0;
    this.g.ball.mesh.visible = false;
    if (p === 'break' || p === 'lunch') this.g.ball.place(9, 3);
  }

  private applyGroupPoster() {
    const theme = this.save.schoolPosterTheme ?? 'friends';
    const kinds = STICKERS.filter((s) => s.theme === theme).map((s) => s.kind);
    const stickers = [0, 1, 2, 3].map((i) => ({ kind: kinds[i % kinds.length] ?? 'star', x: 0.2 + i * 0.2, y: 0.55 + (i % 2) * 0.18 }));
    this.g.map.setGroupPoster(theme, THEME_SLOGAN[theme], ['#fff3b0', '#cdeac0', '#cde7f0', '#ffd6e0'][['food', 'rest', 'play', 'friends'].indexOf(theme)], stickers);
  }

  // ───────────────────────── 상호작용 등록 ─────────────────────────
  private registerWorld() {
    const g = this.g;
    const m = g.map;
    const add = (i: Interactable, glow = true) => (this.inter[i.id] = g.addInteractable(i, glow));

    // 내 자리 (앉기 / 가방·책·태블릿 놓기 / 만들기 / 손 들기)
    add({
      id: 'seat',
      obj: m.objs.playerDesk,
      at: this.seatPos,
      radius: 1.3,
      promptY: 0.8,
      bias: 1.4,
      prompt: () => (!this.bagHung() ? '가방 벗어서 책상 옆 고리에 걸기' : this.seated || !this.needsSeat() ? null : '내 자리에 앉기'),
      onInteract: () => (!this.bagHung() ? this.hangBag() : this.sitDown()),
      usePrompt: (item) => this.seatUsePrompt(item),
      onUse: (item) => this.seatUse(item),
    });
    // 책상 옆 고리에 건 가방: 다시 메기 (E)
    add({
      id: 'deskBag',
      obj: this.props.deskBag,
      radius: 1.2,
      promptY: 0.3,
      prompt: () => (this.bagHung() && !this.seated && (this.period === 'arrival' || this.period === 'lunch' || this.period === 'break') ? '가방 메기' : null),
      onInteract: () => this.wearBag(),
    });
    // 책상 위 국어책
    add({
      id: 'deskBook',
      obj: this.props.deskBook,
      radius: 1.3,
      promptY: 0.25,
      prompt: () => {
        if (this.period !== 'korean') return null;
        if (this.phase === 'find' && !this.f('found86')) return '국어책 86쪽 찾기';
        if (this.phase === 'question' && !this.f('foundClue')) return '교과서에서 단서 찾기';
        return null;
      },
      onInteract: () => void this.bookAction(),
    });
    add({
      id: 'seoaBook',
      obj: this.props.seoaBook,
      radius: 1.3,
      promptY: 0.25,
      prompt: () => {
        if (this.period !== 'korean' || this.f('bookOnDesk')) return null;
        if (this.phase === 'find' && !this.f('found86')) return '서아 책으로 같이 86쪽 찾기';
        if (this.phase === 'question' && !this.f('foundClue')) return '서아 책에서 단서 찾기';
        return null;
      },
      onInteract: () => void this.bookAction(),
    });
    add({
      id: 'deskTablet',
      obj: this.props.deskTablet,
      radius: 1.3,
      promptY: 0.25,
      prompt: () => (this.period === 'math' && this.phase === 'tablet' && !this.f('quizDone') ? '태블릿 켜기' : null),
      onInteract: () => void this.startTablet(),
    });
    // 사물함
    add({
      id: 'locker',
      obj: m.objs.locker17,
      radius: 1.6,
      promptY: 0.2,
      prompt: () => (this.period === 'arrival' && !this.f('tookBook') ? '17번 사물함 열기' : this.f('lockerJoke') ? null : '사물함 열어 보기'),
      onInteract: () => this.openLocker(),
    });
    add({
      id: 'lunchMenu',
      obj: m.objs.lunchMenu,
      radius: 2.2,
      promptY: 0,
      prompt: () => '급식표 보기',
      onInteract: () => void this.readMenu(),
    });
    add({
      id: 'board',
      obj: m.objs.board,
      radius: 2.6,
      promptY: 0.6,
      at: new THREE.Vector3(0, 1.2, -5.6),
      prompt: () => (this.period === 'group' && this.save.groupRole === 'researcher' && !this.researchDone.has('board') ? '전자칠판 자료 조사하기' : null),
      onInteract: () => void this.research('board'),
    });
    add({
      id: 'bookshelf',
      obj: m.objs.bookshelf,
      radius: 1.8,
      promptY: 0.5,
      prompt: () => (this.period === 'group' && this.save.groupRole === 'researcher' && !this.researchDone.has('bookshelf') ? '학급 문고 조사하기' : '학급 문고 구경하기'),
      onInteract: () => (this.period === 'group' && this.save.groupRole === 'researcher' ? void this.research('bookshelf') : this.browseBooks()),
    });
    add({
      id: 'bulletin',
      obj: m.objs.bulletin,
      radius: 2.2,
      promptY: 0,
      prompt: () => (this.period === 'group' && this.save.groupRole === 'researcher' && !this.researchDone.has('bulletin') ? '복도 게시판 조사하기' : '게시판 보기'),
      onInteract: () => void this.research('bulletin'),
    });
    add({
      id: 'tabletCart',
      obj: m.objs.tabletCart,
      radius: 1.8,
      promptY: 0.6,
      prompt: () => (this.period === 'math' && this.phase === 'tablet' && !this.f('gotTablet') ? '내 태블릿(17번) 꺼내기' : null),
      onInteract: () => {
        this.set('gotTablet');
        g.give('tablet');
        this.syncCartSlots();
        this.updateMathObjective();
      },
    });
    add({
      id: 'teacherDrawer',
      obj: m.objs.teacherDrawer,
      radius: 1.6,
      promptY: 0.3,
      prompt: () => (this.period === 'math' && this.f('seoaLow') && !this.f('helpedDevice') && !this.f('gotCharger') ? '서랍에서 여분 충전기 꺼내기' : null),
      onInteract: () => {
        this.set('gotCharger');
        g.give('charger');
        this.bark('teacher', '충전기? 필요하면 써도 돼요~');
        this.updateMathObjective();
      },
    });
    // 정리 바구니 3개
    (['binCut', 'binStick', 'binPaper'] as const).forEach((id, i) => {
      const kind = (['cut', 'stick', 'paper'] as const)[i];
      add({
        id,
        obj: m.objs[id],
        radius: 1.5,
        promptY: 0.4,
        prompt: () => (this.period === 'group' && this.save.groupRole === 'organizer' ? `「${BIN_NAMES[kind]}」 바구니` : null),
        onInteract: () => this.toast(`「${BIN_NAMES[kind]}」 바구니예요. 물건을 들고 F로 넣어요.`),
        usePrompt: (item) => (item && itemDef(item).bin && this.period === 'group' && this.save.groupRole === 'organizer' ? `「${BIN_NAMES[kind]}」에 넣기` : null),
        onUse: (item) => item && this.putInBin(item, kind),
      });
    });
    add({
      id: 'trash',
      obj: m.objs.trash,
      radius: 1.5,
      promptY: 0.6,
      prompt: () => null,
      usePrompt: (item) => (item === 'scraps' ? '종이류 분리수거함에 버리기' : null),
      onUse: () => {
        g.take('scraps');
        g.sfx.place();
        this.set('recycled');
        this.bark('seoa', '분리수거 완벽!');
      },
    });
    add({
      id: 'exhibit',
      obj: m.objs.exhibitBoard,
      radius: 2.0,
      promptY: 0,
      at: new THREE.Vector3(-3.6, 1.2, 6.2),
      prompt: () => null,
      usePrompt: (item) => (this.period === 'art' && !this.f('exhibited') && (item === 'paperPlane' || item === 'miniPoster') ? '뒤 게시판에 작품 전시하기' : null),
      onUse: (item) => {
        if (!item) return;
        g.take(item);
        this.set('exhibited');
        g.sfx.success();
        this.syncProps();
        this.bark('harin', item === 'paperPlane' ? '오 비행기 전시! 멋있다' : '포스터 예쁘다! 색 잘 골랐네');
      },
    });
    add({
      id: 'groupTable',
      obj: m.objs.groupTable,
      radius: 2.2,
      bias: 0.5, // 큰 책상이라 중심까지 거리가 멀다
      promptY: 0.8,
      prompt: () => this.groupTablePrompt(),
      onInteract: () => void this.groupTableAction(),
    });
    // 잠긴 문들
    const locked: [string, string][] = [
      ['doorRestroom', '화장실… 지금은 괜찮은 것 같다.'],
      ['doorBroadcast', '방송실 — 「관계자 외 출입 금지」. 안에서 기계 소리가 웅웅 난다.'],
      ['doorScience', '과학실 — 「실험 준비 중」. 비커가 줄 맞춰 서 있다.'],
      ['door1_1', '1학년 교실에서 받아쓰기 소리가 들린다.'],
      ['doorAdmin', '행정실 — 선생님들이 서류를 정리하고 계신다. 조용히 지나가자.'],
      ['doorClass1', '옆 반은 벌써 조용하다… 살금살금 지나가자.'],
      ['doorGym', '체육관: 오늘 체육은 5교시! 지금은 잠겨 있다.'],
      ['cafeteriaDoor', '급식실에서 고소한 냄새가 난다… 아직은 준비 중.'],
    ];
    for (const [id, msg] of locked)
      add({ id, obj: m.objs[id], at: id === 'cafeteriaDoor' ? cafe(CAFE.door.x, CAFE.door.z - 0.4) : undefined, radius: 1.8, promptY: 1.6, prompt: () => ((id === 'cafeteriaDoor' && (this.period === 'lunch' || this.period === 'cutlet')) || (id === 'doorBroadcast' && this.period === 'cutlet') || (id === 'doorGym' && this.period === 'dodgeball') ? null : '문 살펴보기'), onInteract: () => this.toast(msg) }, false);

    // NPC 대화·건네주기
    for (const id of Object.keys(g.npcs) as MainNpcId[]) {
      const npc = g.npcs[id];
      add(
        {
          id: 'npc:' + id,
          obj: npc.char.root,
          radius: 1.9,
          promptY: 1.75,
          noGlow: true,
          prompt: () => (npc.char.root.visible ? `${npc.name}${wa(npc.name)} 이야기하기` : null),
          onInteract: () => void this.talk(id),
          usePrompt: (item) => (item ? this.givePrompt(id, item) : null),
          onUse: (item) => item && this.give(id, item),
        },
        false,
      );
    }
    g.fillers.forEach((npc, i) =>
      add(
        {
          id: 'filler:' + i,
          obj: npc.char.root,
          radius: 1.6,
          promptY: 1.6,
          noGlow: true,
          prompt: () => `${npc.name}에게 말 걸기`,
          onInteract: () => this.fillerTalk(npc, i),
          usePrompt: (item) => this.ev()?.usePromptOn(npc, item) ?? null,
          onUse: () => this.ev()?.useOn(npc),
        },
        false,
      ),
    );
  }

  // ───────────────────────── 진행 ─────────────────────────
  start(save: SaveData) {
    this.save = save;
    this.researchDone.clear();
    this.enterPeriod(save.period, true);
  }

  private enterPeriod(p: PeriodId, fromLoad: boolean) {
    this.token++;
    this.waiters = [];
    this.g.dialogue.skipEverything();
    this.g.cutscene = false;
    this.g.tpc.override = null;
    this.period = p;
    this.save.period = p;
    this.save.scene = p === 'dodgeball' ? 'gym' : p === 'robot' ? 'classroom' : p === 'cutlet' ? 'cafeteria' : p === 'arrival' || p === 'lunch' ? 'hallway' : 'classroom';
    this.phase = '';
    this.t = 0;
    this.softFired = false;
    this.handRaised = false;
    this.g.player.char.setPose('stand');
    this.clearTransientItems();
    this.syncProps();
    this.placeCast(p, fromLoad);
    this.g.checkpoint();
    const info = SCHEDULE[p];
    this.g.map.setBoard(this.boardText(p));
    this.g.hud.setTimer(null);
    this.g.setObjective(p === 'arrival' ? '학교 도착!' : '선생님 말씀 듣기', null);
    this.toast(info.label + (fromLoad && p !== 'arrival' ? ' — 저장된 곳부터 이어서' : ''), 'info');
    void this.runPeriod(p);
  }

  /** 이전 교시에만 쓰던 바닥·책상 위 물건 치우기 (떨어뜨린 물건은 남긴다) */
  private clearTransientItems() {
    for (const key of [...this.g.items.keys()]) {
      if (/^(scraps|stack2?|plane|pencil|role_|org_)/.test(key)) this.g.removeItem(key);
    }
  }

  private boardText(p: PeriodId): string[] {
    switch (p) {
      case 'arrival': return ['6-1', '오늘도 무사히 하교하기!'];
      case 'korean': return ['1교시 국어', '국어책 86쪽 · 인물의 마음 짐작하기'];
      case 'break': return ['쉬는 시간', '복도에서 뛰지 않기!'];
      case 'math': return ['2교시 수학', '태블릿 퀴즈 대결!'];
      case 'group': return ['3교시 모둠 활동', '우리 학교를 더 재미있게 바꾸는 방법'];
      case 'art': return ['4교시 미술', '종이비행기 / 미니 포스터'];
      case 'lunch': return ['점심시간', '맛있게 먹어요 :)'];
      case 'cutlet': return ['점심시간', '…돈가스가 왜 저래?'];
      case 'robot': return ['청소 시간', '각자 자리 주변 정리하기'];
      case 'dodgeball': return ['5교시 체육', '체육관에서 피구!'];
      case 'hallway': return ['쉬는 시간', '??:??'];
      case 'final': return ['방과 후', 'AI: 학교 삭제 준비 중…'];
    }
  }

  private async runPeriod(p: PeriodId) {
    switch (p) {
      case 'arrival': return this.arrival();
      case 'korean': return this.korean();
      case 'break': return this.breakTime();
      case 'math': return this.math();
      case 'group': return this.group();
      case 'art': return this.art();
      case 'lunch': return this.lunch();
      case 'cutlet':
      case 'robot':
      case 'dodgeball':
      case 'hallway':
      case 'final':
        return; // 사건은 placeCast에서 begin()으로 시작
    }
  }

  private async endPeriod() {
    const tk = this.token;
    // 열린 미니게임 창이 닫힐 때까지 기다려 준다 (하던 활동을 안전하게 마무리)
    await this.until(() => !panelsOpen());
    if (tk !== this.token) return never();
    this.g.sfx.bell();
    this.toast('딩동댕동~ 종이 울렸어요', 'info');
    const next = nextPeriod(this.period);
    if (next) this.enterPeriod(next, false);
  }

  update(dt: number) {
    if (!this.save) return;
    this.t += dt;
    const info = SCHEDULE[this.period];
    // 시계
    const min = this.phase === 'lastMinute' ? info.end - 0.2 : clockMinutes(this.period, this.t, this.f('overslept'));
    this.g.hud.setClock(info.label, formatClock(min));
    if (Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2)) this.g.map.setClock(min);
    // 대기 중인 조건
    if (this.waiters.length) {
      const ready = this.waiters.filter((w) => w.token === this.token && w.cond());
      this.waiters = this.waiters.filter((w) => w.token === this.token && !ready.includes(w));
      ready.forEach((w) => w.res());
    }
    // 시간 초과 시 정리 (진행 막힘 방지)
    if (!this.softFired && this.t > info.softLimitSec) {
      this.softFired = true;
      void this.onSoftLimit();
    }
    // 주변 잡담
    this.ambientT -= dt;
    if (this.ambientT <= 0) {
      this.ambientT = 6 + Math.random() * 5;
      this.ambient();
    }
    this.ev()?.hint(this.t);
    this.ev()?.update?.(dt);
    if (this.period === 'break') this.g.hud.setTimer(Math.max(0, SCHEDULE.break.softLimitSec - this.t));
  }

  requiredItems(): ItemId[] {
    const ev = this.ev();
    if (ev) return ev.requiredItems();
    const out: ItemId[] = [];
    if (this.period === 'arrival') {
      if (this.f('tookBook') && !this.f('bookOnDesk')) out.push('koreanBook');
    }
    if (this.period === 'math' && this.f('gotTablet') && !this.f('tabletOnDesk')) out.push('tablet');
    return out;
  }

  helpReturnToSeat() {
    const ev = this.ev();
    if (ev) {
      const [x, z, yaw, y] = ev.returnSpot();
      this.g.player.teleport(x, z, yaw, y ?? 0);
      this.g.tpc.behind(this.g.player.yaw);
      return;
    }
    if (this.period === 'arrival' || this.period === 'lunch') {
      this.g.player.teleport(8.6, -4.6, -Math.PI / 2);
      this.g.tpc.behind(this.g.player.yaw);
    } else this.g.player.sitAt(this.g.map.seats.player);
  }

  canPickup(id: ItemId, key: string): string | null {
    const ev = this.ev();
    if (ev) return ev.canPickup(id, key);
    if (key.startsWith('role') && this.phase !== 'pickRole') return '(모둠 친구들이 다 모이면 고르자)';
    if ((key === 'stack' || key === 'stack2') && this.f('pickedArt')) return '(재료는 하나만!)';
    void id;
    return null;
  }

  onPickup(id: ItemId, key: string) {
    const ev = this.ev();
    if (ev) return ev.onPickup(id, key);
    if (id === 'pencilCase') {
      this.set('foundPencil');
      this.toast('파란 필통을 주웠어요. 이름표에 「준호」라고 써 있다!');
    }
    if (key.startsWith('role')) void this.chooseRole(id);
    if (key === 'stack' || key === 'stack2') this.set('pickedArt');
  }

  onDropped(id: ItemId, key: string) {
    this.ev()?.onDropped(id, key);
  }

  onPlaneLanded(dist: number, hitWall: boolean) {
    const best = this.save.stats.planeBest ?? 0;
    const d = Math.round(dist * 10) / 10;
    if (d > best) this.save.stats.planeBest = d;
    const junho = this.n('junho');
    if (hitWall && d < 3) this.g.bark(junho, '벽이랑 친해졌네ㅋㅋ 다시 해 봐!');
    else if (d > best && best > 0) this.g.bark(junho, `오! ${d}m! 신기록인데?`);
    else this.g.bark(junho, `${d}m! ${d > 8 ? '완전 잘 날았다!' : '괜찮은데? 더 세게 던져 봐!'}`);
    // 쉬는 시간 동안에는 다시 날릴 수 있게 비행기를 주워 오기
    const pos = this.g.plane.mesh.position;
    this.g.spawnItem('plane', 'paperPlane', pos.x, 0, pos.z);
  }

  private async onSoftLimit() {
    const p = this.period;
    const ev = this.ev();
    if (ev) return ev.onSoftLimit();
    if (p === 'arrival') {
      await this.say([this.L('teacher', '자, 종 쳤어요~ 다들 자리에 앉자!')]);
      this.autoArrival();
    } else if (p === 'korean' && this.phase === 'find') {
      this.set('found86');
      await this.say([this.L('seoa', '여기 86쪽! 내 거 같이 보자.')]);
    } else if (p === 'math' && !this.f('quizDone')) {
      await this.say([this.L('teacher', '시간이 다 됐네요. 퀴즈는 다음 시간에 마저 해요!')]);
      this.set('quizDone');
      this.set('quizSkipped');
    } else if (p === 'group' && !this.f('groupDone')) {
      await this.say([this.L('seoa', '시간 거의 다 됐다! 나머지는 우리가 마무리할게.')]);
      this.finishGroup(true);
    } else if (p === 'art' && this.phase === 'craft') {
      await this.say([this.L('teacher', '아직 못 끝낸 친구는 다음 시간에 마저 해요~')]);
      this.phase = 'craftDone';
    }
  }

  // ───────────────────────── 배치 ─────────────────────────
  private placeCast(p: PeriodId, fromLoad: boolean) {
    const g = this.g;
    const seats = g.map.seats;
    const teacher = this.n('teacher');
    const seatOrWalk = (n: Npc, key: string) => (fromLoad || p === 'arrival' ? n.sitAt(seats[key]) : void n.walkToSeat(seats[key]));
    teacher.char.root.visible = true;
    const cook = this.n('cook');
    cook.char.root.visible = p === 'lunch' || p === 'cutlet';
    cook.place(CAFE.cook.x, CAFE.cook.z, CAFE.cook.yaw, CAFE.y);
    const ev = this.ev();
    if (ev) {
      ev.begin(fromLoad);
      return;
    }
    // 플레이어
    if (fromLoad) {
      if (p === 'arrival') {
        g.player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw, SPAWN.y);
      } else if (p === 'group') g.player.teleport(1.6, 3.2, Math.PI);
      else if (p === 'lunch') g.player.teleport(8.6, -3, 0);
      else if (p === 'break') g.player.teleport(-1.2, 1.0, Math.PI);
      else g.player.sitAt(seats.player);
      g.tpc.behind(g.player.yaw);
    }
    const fillers = g.fillers;
    switch (p) {
      case 'arrival':
        this.n('seoa').sitAt(seats.seoa);
        this.n('minjae').place(-1.1, 2.6, Math.PI / 2);
        this.n('junho').place(3.4, -0.5, 0.6);
        this.n('harin').place(-3.3, 5.8, Math.PI);
        teacher.place(9.6, 12, Math.PI);
        teacher.char.root.visible = false;
        fillers.forEach((f, i) => {
          if (i < 6) f.sitAt(seats['filler' + i]);
          else if (i < 8) f.place(2.4 + (i - 6) * 0.7, -4.6, i === 6 ? Math.PI / 2 : -Math.PI / 2);
          else f.place(8.4 + (i - 8) * 0.8, -6.5, i === 8 ? Math.PI / 2 : -Math.PI / 2);
        });
        break;
      case 'korean':
      case 'math':
      case 'art':
        for (const id of ['seoa', 'minjae', 'junho', 'harin'] as const) seatOrWalk(this.n(id), id);
        fillers.forEach((f, i) => seatOrWalk(f, 'filler' + i));
        if (fromLoad) teacher.place(0, -4.9, 0);
        else void teacher.walkTo(0, -4.9, 0);
        break;
      case 'break':
        if (fromLoad) {
          this.n('junho').place(9, -2.5, 0);
          this.n('minjae').place(-1.4, 2.0, Math.PI / 2);
          this.n('harin').place(4.2, -5.2, Math.PI);
          this.n('seoa').place(-6.0, -0.6, -Math.PI / 2);
        } else {
          void this.n('junho').walkTo(9, -2.5, 0);
          void this.n('minjae').walkTo(-1.4, 2.0, Math.PI / 2);
          void this.n('harin').walkTo(4.2, -5.2, Math.PI);
          void this.n('seoa').walkTo(-6.0, -0.6, -Math.PI / 2);
        }
        fillers.forEach((f, i) => {
          const spots: [number, number][] = [[8.3, 2], [9.7, 2.6], [8.6, 8], [9.4, 8.4], [-5.5, 3.2], [-5, 3.8]];
          if (i >= spots.length) return seatOrWalk(f, 'filler' + i);
          const [x, z] = spots[i];
          const [ox, oz] = spots[i ^ 1];
          const yaw = Math.atan2(ox - x, oz - z);
          if (fromLoad) f.place(x, z, yaw);
          else void f.walkTo(x, z, yaw);
        });
        if (fromLoad) teacher.place(-4.6, -5.4, 0);
        else void teacher.walkTo(-4.6, -5.4, 0);
        break;
      case 'group': {
        const spots: Record<string, [number, number, number]> = {
          seoa: [-0.6, 3.75, 0],
          minjae: [0.6, 3.75, 0],
          junho: [1.75, 4.7, -Math.PI / 2],
          harin: [-0.6, 5.65, Math.PI],
        };
        for (const [id, [x, z, yaw]] of Object.entries(spots)) {
          const n = this.n(id as MainNpcId);
          if (fromLoad) n.place(x, z, yaw);
          else void n.walkTo(x, z, yaw);
        }
        fillers.forEach((f, i) => seatOrWalk(f, 'filler' + i));
        // 모둠 시간: 선생님은 교사용 책상 옆에서 지켜본다 (자료 조사 담당이 전자칠판에 다가갈 수 있게)
        if (fromLoad) teacher.place(-3.0, -4.9, 0.3);
        else void teacher.walkTo(-3.0, -4.9, 0.3);
        break;
      }
      case 'lunch': {
        const line = [...this.students, ...fillers];
        // 1층 급식실 문 앞에 두 줄로 (교실에서 계단으로 걸어 내려간다)
        line.forEach((n, i) => {
          const x = i % 2 ? CAFE_FRONT.x + 0.6 : CAFE_FRONT.x - 0.6;
          const z = CAFE_FRONT.z - Math.floor(i / 2) * 0.85;
          if (fromLoad) n.place(x, z, 0, F1);
          else void n.walkTo(x, z, 0, 2.6, F1);
        });
        if (fromLoad) teacher.place(10.3, 12.2, Math.PI, F1);
        else void teacher.walkTo(10.3, 12.2, Math.PI, 2.2, F1);
        break;
      }
    }
  }

  /** 앉기 안내가 필요한 때만 (다른 물건과 프롬프트가 겹치지 않게) */
  private needsSeat(): boolean {
    const p = this.period;
    return p === 'korean' || p === 'math' || (p === 'art' && this.phase === 'craft') || (p === 'arrival' && this.phase === 'teacher');
  }

  /** 가방이 책상 옆 고리에 걸려 있나 (아니면 등에 메고 있다). 예전 저장은 bagOnDesk로 판단 */
  private bagHung(): boolean {
    const v = this.save.flags.bagHung;
    return v === undefined ? !!this.save.flags.bagOnDesk : !!v;
  }
  /** 등에서 벗어 책상 옆 고리에 건다 → 등교 미션(bagOnDesk) 완료 */
  private hangBag(quiet = false) {
    const first = !this.f('bagOnDesk');
    this.save.flags.bagHung = true;
    this.set('bagOnDesk');
    this.syncProps();
    if (quiet) return;
    this.g.sfx.place();
    this.toast('가방을 벗어 책상 옆 고리에 걸었다.', 'good');
    if (first) this.bark('seoa', '안녕! 오늘 일찍 왔네?');
  }
  private wearBag() {
    this.save.flags.bagHung = false;
    this.syncProps();
    this.g.sfx.pickup();
    this.toast('가방을 다시 멨다. (책상에서 E로 다시 걸 수 있어요)');
  }

  private sitDown() {
    this.g.player.sitAt(this.g.map.seats.player);
    this.g.sfx.place();
  }

  // ───────────────────────── 등교 ─────────────────────────
  private async arrival() {
    const g = this.g;
    this.phase = 'bag';
    if (!this.f('pencilReturned') && !this.g.inventory.has('pencilCase')) g.spawnItem('pencil', 'pencilCase', 15.2, FLOOR1_Y, -3.55, 0.4); // 1층 현관 신발장 앞
    if (this.f('overslept')) {
      await this.sleep(0.6);
      this.toast('헉, 8시 52분! 아슬아슬하다…', 'warn');
    }
    const takenOver = () => this.phase === 'teacher';
    if (!this.f('bagOnDesk')) {
      g.setObjective('가방을 메고 2층 6-1 교실로 가서 책상 옆에 걸기 (현관 → 계단 → 내 책상에서 E)', this.inter.seat);
      await this.until(() => this.f('bagOnDesk'));
    }
    if (takenOver()) return;
    this.phase = 'book';
    if (!this.f('tookBook')) {
      g.setObjective('뒤쪽 17번 사물함에서 국어책 꺼내기 (E)', this.inter.locker);
      this.bark('seoa', '오늘 국어책 필요하대!');
      await this.until(() => this.f('tookBook') || takenOver());
    }
    if (!this.f('bookOnDesk') && !takenOver()) {
      g.setObjective('국어책을 내 책상에 올려 두기 (책 들고 F)', this.inter.seat);
      await this.until(() => this.f('bookOnDesk') || takenOver());
    }
    if (takenOver()) return;
    this.phase = 'free';
    g.setObjective('준비 끝! 종 칠 때까지 자유롭게 (급식표 보기·친구와 이야기)', null);
    await this.sleep(Math.max(12, 70 - this.t));
    await this.teacherArrives();
  }

  private autoArrival() {
    // 아직 1층에 있으면 교실 앞으로 데려다준다 (종이 울렸으니)
    if (this.g.map.levelOf(this.g.player.pos.y) === 0) {
      this.g.player.teleport(8.6, -4.6, -Math.PI / 2);
      this.g.tpc.behind(this.g.player.yaw);
      this.toast('선생님: 「얼른 올라와요~」 교실 앞까지 뛰어왔다!');
    }
    if (!this.bagHung()) this.hangBag(true);
    if (!this.f('bookOnDesk')) {
      if (this.g.take('koreanBook')) this.set('bookOnDesk');
      else this.set('sharedBook');
    }
    this.syncProps();
    void this.teacherArrives();
  }

  private async teacherArrives() {
    if (this.phase === 'teacher') return;
    this.phase = 'teacher';
    const t = this.n('teacher');
    t.char.root.visible = true;
    t.place(9.4, -1, Math.PI);
    this.g.setObjective('선생님이 오셨다! 자리에 앉기', this.inter.seat);
    void t.walkTo(0, -4.9, 0);
    await this.say([
      this.L('teacher', '좋은 아침~ 다들 자리에 앉아요!'),
      this.L('teacher', this.f('overslept') ? `${this.me}, 오늘은 아슬아슬 세이프였지?` : '오늘 월요일인데 다들 표정이 밝네요?'),
    ]);
    await this.endPeriod();
  }

  private openLocker() {
    const door = this.g.map.objs.lockerDoor;
    door.rotation.y = 1.6;
    this.g.sfx.place();
    if (this.period === 'arrival' && !this.f('tookBook')) {
      this.set('tookBook');
      this.g.give('koreanBook');
      this.toast('국어책을 챙겼어요. 체육복도 보이는데… 언제 가져왔더라?');
      return;
    }
    this.set('lockerJoke');
    this.toast(['사물함 안: 지난달 받은 가정통신문 3장… 엄마한테 드려야 하는데.', '사물함 안: 리코더, 크레파스, 그리고 이름 모를 젤리 하나.'][Math.floor(Math.random() * 2)]);
  }

  private async readMenu() {
    this.menuViews++;
    this.save.stats.menuViews = (this.save.stats.menuViews ?? 0) + 1;
    await openInfo(this.g.ui, '이번 주 급식표', ['월: 돈가스★, 양배추샐러드, 미역국', '화: 카레라이스, 깍두기', '수: 짜장밥, 탕수육(소)', '목: 비빔밥, 미역국', '금: 스파게티, 마늘빵'], this.menuViews === 1 ? '오늘은 월요일… 돈가스다!' : this.menuViews === 2 ? '(다시 봐도 돈가스다.)' : undefined);
    if (this.save.stats.menuViews >= 3 && !this.f('lunchExpert')) {
      this.set('lunchExpert');
      this.achievement('별명 획득: 급식 전문가');
      this.bark('minjae', '급식 전문가 떴다ㅋㅋ 오늘 돈가스 몇 개 나와?');
    }
  }

  private browseBooks() {
    const titles = ['『수학 귀신』… 제목이 무섭다', '『우리 학교 100년 이야기』', '『공룡 대백과』 (페이지가 다 너덜너덜)', '『마법 천자문 37권』 — 38권은 누가 빌려 갔다'];
    this.toast(titles[Math.floor(Math.random() * titles.length)]);
  }

  // ───────────────────────── 1교시 국어 ─────────────────────────
  private async korean() {
    const g = this.g;
    if (!this.seated) {
      g.setObjective('내 자리에 앉기', this.inter.seat);
      await this.until(() => this.seated || this.t > 25);
      if (!this.seated) {
        await this.say([this.L('teacher', `${this.me}, 자리에 앉자~`)]);
        g.player.sitAt(g.map.seats.player);
      }
    }
    await this.say([this.L('teacher', '자, 국어책 86쪽 펴 볼까요?'), this.L('seoa', '(속닥) 몇 쪽이라고? 68쪽?')]);
    this.phase = 'find';
    const book = this.f('bookOnDesk') ? this.inter.deskBook : this.inter.seoaBook;
    if (!this.f('found86')) {
      g.setObjective(this.f('bookOnDesk') ? '국어책 86쪽 펴기 (책상 위 국어책에 E)' : '국어책을 못 챙겼다! 서아 책으로 같이 찾기 (E)', book);
      await this.until(() => this.f('found86'));
    }
    if (!this.f('helpedPageFriend')) {
      const foundAt = this.t;
      g.setObjective('(선택) 서아에게 몇 쪽인지 알려 주기 (E)', this.n('seoa'));
      await this.until(() => this.f('helpedPageFriend') || this.t > foundAt + 9);
    }
    this.phase = 'reading';
    g.setObjective('선생님 말씀 듣기', null);
    await this.say([
      this.L('teacher', '「운동장에 남은 아이」. 선생님이 읽어 볼게요.'),
      this.L('narr', '(선생님이 이야기를 읽어 주신다. 도윤이는 종이 울려도 운동장에 혼자 남아 있었다…)'),
      this.L('teacher', '그럼 질문! 도윤이는 왜 운동장에 혼자 남아 있었을까요? 마음을 짐작해 봐요.'),
    ]);
    this.phase = 'question';
    const qStart = this.t;
    g.setObjective('발표 준비: 교과서 단서 찾기(E) · 짝과 이야기하기(E) · 준비되면 F로 손 들기', this.seated ? null : this.inter.seat);
    await this.until(() => this.handRaised || this.t - qStart > 50);
    if (this.handRaised) await this.playerPresents();
    else await this.seoaPresents();
    // 종치기 10초 전
    this.phase = 'lastMinute';
    g.setObjective('…', null);
    const clock = new THREE.Vector3(0, 2.75, -5.95);
    [...this.students, ...g.fillers].forEach((n) => n.char.lookAt(clock));
    await this.say([
      this.L('narr', '(9시 39분 50초. 반 전체가 동시에 시계를 본다.)'),
      this.L('teacher', '그런데 한 가지만 더!'),
      this.L('narr', '반 전체: 아~~~'),
      this.L('teacher', '…농담이에요. 쉬는 시간!'),
    ]);
    [...this.students, ...g.fillers].forEach((n) => n.char.lookAt(null));
    await this.endPeriod();
  }

  private async bookAction() {
    if (this.period !== 'korean') return;
    if (!this.seated) this.sitDown();
    if (this.phase === 'find' && !this.f('found86')) {
      const ok = await this.guard(openTextbookFind(this.g.ui, 12 + Math.floor(Math.random() * 30) * 2));
      if (ok) {
        this.set('found86');
        this.achievement('86쪽 찾기 성공!');
      } else this.toast('아직 못 찾았어요. 다시 책에 E!', 'warn');
    } else if (this.phase === 'question' && !this.f('foundClue')) {
      const ok = await this.guard(openTextbookClue(this.g.ui));
      if (ok) {
        this.set('foundClue');
        this.toast('단서 발견! 이제 F로 손을 들어 발표할 수 있어요.', 'good');
      }
    }
  }

  private async raiseHand() {
    if (this.handRaised) return;
    this.handRaised = true;
    this.g.player.char.setPose('raise');
    this.g.sfx.blip();
  }

  private async playerPresents() {
    const clue = this.f('foundClue'), partner = this.f('consultedPartner');
    const answer = clue && partner
      ? '도윤이는 민호에게 「너 때문에 졌잖아」라고 소리친 게 미안해서, 사과하려고 기다린 것 같아요. 서아도 비슷하게 생각했어요.'
      : clue
        ? '교과서에 민호한테 소리친 게 자꾸 생각났다고 나와요. 미안한 마음 때문인 것 같아요.'
        : partner
          ? '서아랑 이야기해 봤는데요, 친구한테 미안해서 그런 것 같아요.'
          : '음… 마음이 복잡했을 것 같아요. 그냥 그런 느낌이 들어요.';
    const reply = clue && partner ? '근거도 찾고 짝 생각까지 들었네요. 훌륭해요!' : clue ? '교과서에서 근거를 찾았구나! 좋아요.' : partner ? '짝이랑 생각을 나눴구나. 좋은 방법이에요!' : '맞아요, 복잡했겠죠. 솔직하게 말해 줘서 고마워요.';
    await this.say([this.L('teacher', `오, ${this.me}가 말해 볼까요?`), this.L('me', answer), this.L('teacher', reply)]);
    this.g.player.char.setPose(this.seated ? 'sit' : 'stand');
    this.set('spokeInClass');
    this.achievement('발표 완료!');
    this.bark('minjae', '오~ 발표 잘한다');
  }

  private async seoaPresents() {
    const s = this.n('seoa');
    s.char.setPose('raise');
    await this.say([
      this.L('teacher', '서아가 한번 말해 볼까?'),
      this.L('seoa', this.f('consultedPartner') ? `${this.me}랑 같이 생각했는데요, 친구한테 미안해서 그런 것 같아요.` : '친구한테 사과하고 싶어서 기다린 것 같아요.'),
      this.L('teacher', '좋아요. 다들 비슷하게 생각했나요?'),
    ]);
    s.char.setPose('sit');
  }

  // ───────────────────────── 쉬는 시간 ─────────────────────────
  private async breakTime() {
    const g = this.g;
    this.phase = 'free';
    g.setObjective('쉬는 시간 60초! 준호와 종이비행기 · 민재와 가위바위보 · 복도에서 공차기', null);
    this.bark('junho', '종이비행기 날리러 갈 사람~! 복도로!');
    await this.sleep(14);
    this.bark('harin', '쉬는 시간 100분이었으면 좋겠다…');
    this.set('heardBreakWish');
    await this.sleep(14);
    this.bark('junho', '오늘 체육 밖에서 해요?! 제발~');
    await this.until(() => this.t >= SCHEDULE.break.softLimitSec);
    this.g.removeItem('plane');
    await this.endPeriod();
  }

  // ───────────────────────── 2교시 수학 ─────────────────────────
  /** 현우가 태블릿을 놓아 준 자리들 (이번 교시) */
  private handed = new Set<string>();
  private tabletHanded(key: string) {
    return this.f('tabletsHandedOut') || this.handed.has(key);
  }
  /** 충전함 칸의 태블릿: 수학 시간에는 꺼낸 만큼 비어 있다 */
  private syncCartSlots() {
    const slots = this.g.map.objs.tabletSlots;
    if (!slots) return;
    const out = this.period === 'math' ? (this.f('tabletsHandedOut') ? CLASSMATES.length : this.handed.size + (this.carrying ? this.carryLeft : 0)) + (this.f('gotTablet') ? 1 : 0) : 0;
    slots.children.forEach((c, i) => (c.visible = i >= out));
  }
  private carrying = false;
  private carryLeft = 0;
  private npcOfSeat(key: string): Npc {
    return key.startsWith('filler') ? this.g.fillers[Number(key.slice(6))] : this.n(key as MainNpcId);
  }

  private async math() {
    const g = this.g;
    await this.say([this.L('teacher', '2교시는 수학! 오늘은 수학 문제를 태블릿 게임으로 풀어 볼 거예요.')]);
    if (!this.f('tabletsHandedOut')) {
      await this.mathReactions();
      await this.say([this.L('teacher', '현우야, 태블릿 충전함에서 꺼내서 친구들한테 나눠 줄래?'), this.L('filler2', '네! 제가 할게요.')]);
      this.phase = 'handout';
      g.setObjective('현우가 태블릿을 나눠 주는 중… 자리에서 기다리기', null);
      await this.handOutTablets();
      this.set('tabletsHandedOut');
      // 내 책상만 비어 있다 → 알아차리면
      const t0 = this.t;
      await this.until(() => this.seated || g.player.pos.distanceTo(this.seatPos) < 1.8 || this.t > t0 + 20);
      await this.say([this.L('me', '어? 내 태블릿은?'), this.L('filler2', '앗! 너 거 깜빡했다. 미안! 충전함에 하나 남아 있어.')]);
    }
    this.phase = 'tablet';
    this.syncProps();
    this.updateMathObjective();
    await this.until(() => this.f('tabletOnDesk') || this.f('quizDone'));
    if (!this.f('quizDone')) {
      await this.sleep(1.2);
      this.set('seoaLow');
      await this.say([this.L('seoa', '헐… 내 태블릿 배터리 3%야.'), this.L('minjae', '3%면 퀴즈 한 문제 풀고 꺼지겠다ㅋㅋ')]);
      this.updateMathObjective();
    }
    await this.until(() => this.f('quizDone'));
    this.phase = 'after';
    g.setObjective('선생님 말씀 듣기', null);
    await this.say([
      this.L('teacher', '다들 잘했어요! 아까 설문은 AI 학교생활 도우미가 참고한대요.'),
      this.L('minjae', '나 「돈가스 왕 크게」라고 썼다ㅋㅋ'),
      this.L('seoa', '그게 진짜 되면 어떡해.'),
      this.L('minjae', '설마~ AI가 그걸 진짜 하겠냐?'),
    ]);
    await this.endPeriod();
  }

  /** 수학 게임 발표: 학생마다 다른 작은 반응을, 조금씩 어긋난 시간에 (모두 같은 동작 금지) */
  private async mathReactions() {
    const g = this.g;
    const cart = new THREE.Vector3(6.3, 1.0, -1.2);
    const seatHead = (k: string) => {
      const s = g.map.seats[k];
      return new THREE.Vector3(s.x, 1.1, s.z);
    };
    const reactions: [string, number, string | null, Gesture, THREE.Vector3 | null][] = [
      ['minjae', 0.0, '오! 오늘 게임해요?', 'fist', null],
      ['junho', 0.45, '이번엔 내가 1등 한다!', 'lean', null],
      ['seoa', 0.9, '배터리 충분하려나?', 'shrug', cart],
      ['filler0', 1.3, '재밌겠다!', 'nod', seatHead('minjae')],
      ['filler2', 1.75, '오늘은 어떤 게임이지?', 'lookUp', null],
      ['filler1', 2.1, null, 'nod', seatHead('harin')], // 수빈: 말없이 미소 지으며 짝꿍을 본다
      ['harin', 2.5, '지난번에는 아깝게 졌는데.', 'wave', null],
    ];
    for (const [key, at, line, gest, look] of reactions)
      void (async () => {
        await this.sleep(at);
        const n = this.npcOfSeat(key);
        n.char.gesture(gest, 1.4 + (at % 0.5));
        if (look) n.char.lookAt(look);
        if (line) g.bark(n, line, 1900);
      })();
    await this.sleep(3.6);
    for (const [key] of reactions) this.npcOfSeat(key).char.lookAt(null);
  }

  /**
   * 현우의 태블릿 배부: 자리에서 일어나 충전함까지 걸어가 태블릿 묶음을 꺼내 들고,
   * 친구들 책상마다 걸어가 하나씩 내려놓는다 (플레이어 자리는 깜빡). 마지막에 자기 것도 놓고 앉는다.
   */
  private async handOutTablets() {
    const g = this.g;
    const tk = this.token;
    const h = g.fillers[2];
    const seats = g.map.seats;
    const order = ['harin', 'filler1', 'seoa', 'minjae', 'filler0', 'junho'];
    // 1. 일어나서 충전함으로
    await h.walkTo(5.55, -1.2, Math.PI / 2, 2.0);
    if (tk !== this.token) return;
    h.char.gesture('place', 0.7);
    await this.sleep(0.7);
    // 태블릿 묶음 (실제 물체를 손에 든다)
    const stack = new THREE.Group();
    const n = order.length + 1;
    for (let i = 0; i < n; i++) {
      const t = makeItemMesh('tablet');
      t.position.y = i * 0.022;
      stack.add(t);
    }
    stack.position.set(0, -0.05, 0.12);
    h.char.hand.add(stack);
    this.carrying = true;
    this.carryLeft = n;
    this.syncCartSlots();
    h.char.gesture('carry', Infinity);
    const reacts: Record<string, [string, Gesture]> = {
      harin: ['고마워 현우야~', 'tablet'],
      filler1: ['땡큐!', 'nod'],
      seoa: ['고마워. …배터리 몇 퍼센트지?', 'tablet'],
      minjae: ['오 내 거 왔다! 빨리 켜 보자', 'fist'],
      filler0: ['고마워!', 'tablet'],
      junho: ['좋았어, 준비 완료!', 'lean'],
    };
    // 2. 책상마다 (책상 앞쪽 통로에 서서 내려놓기)
    for (const key of order) {
      const s = seats[key];
      await h.walkTo(s.deskX, s.deskZ - 0.62, 0, 2.0);
      if (tk !== this.token) return;
      h.char.gesture('place', 0.6);
      await this.sleep(0.45);
      stack.remove(stack.children[stack.children.length - 1]);
      this.carryLeft--;
      this.handed.add(key);
      this.show('npcTablet_' + key, true);
      g.sfx.place();
      const who = this.npcOfSeat(key);
      const [line, gest] = reacts[key];
      who.char.lookAt(new THREE.Vector3(s.deskX, 0.7, s.deskZ));
      who.char.gesture(gest, 1.6);
      g.bark(who, line, 1500);
      await this.sleep(0.3);
      h.char.gesture('carry', Infinity);
      setTimeout(() => who.char.lookAt(null), 2200);
    }
    // 3. 자기 자리로 — 플레이어 것은 빠뜨린 채
    const mine = seats.filler2;
    await h.walkTo(mine.deskX, mine.deskZ - 0.62, 0, 2.0);
    if (tk !== this.token) return;
    h.char.gesture('place', 0.6);
    await this.sleep(0.45);
    h.char.hand.remove(stack);
    this.carrying = false;
    this.carryLeft = 0;
    this.handed.add('filler2');
    this.show('npcTablet_filler2', true);
    await h.walkToSeat(mine);
    h.char.gesture('tablet', 1.5);
    this.syncCartSlots();
  }

  private updateMathObjective() {
    const g = this.g;
    if (this.period !== 'math' || this.phase !== 'tablet') return;
    const extra = this.f('seoaLow') && !this.f('helpedDevice') ? ' · (선택) 서아 태블릿 3%! 충전기 찾아 주기 또는 같이 보기' : '';
    if (!this.f('gotTablet')) g.setObjective('태블릿 충전함에서 내 태블릿 가져오기 (E)' + extra, this.inter.tabletCart);
    else if (!this.f('tabletOnDesk')) g.setObjective('책상에 태블릿 올려 두기 (태블릿 들고 F)' + extra, this.inter.seat);
    else if (this.f('gotCharger') && !this.f('helpedDevice')) g.setObjective('서아에게 충전기 건네기 (충전기 들고 F)', this.n('seoa'));
    else g.setObjective('태블릿 켜고 퀴즈 시작 (E)' + extra, this.inter.deskTablet);
  }

  private async startTablet() {
    if (!this.seated) this.sitDown();
    const share = this.f('helpedDevice_share');
    if (this.f('seoaLow') && !this.f('helpedDevice')) {
      this.bark('minjae', '서아야 내 거 같이 봐!');
      this.set('minjaeShared');
    }
    const res = await this.guard(
      openTablet(this.g.ui, pickQuestions(this.g.settings.grade), {
        sharedWith: share ? '서아' : null,
        react: (i, ok) => {
          const lines: [string, string][] = ok
            ? [['민재', '헐 빠르다! 나 아직 문제 읽는 중'], ['하린', '나도 맞았다! 우리 반 다 천재인가?'], ['준호', '이건 나도 알았는데 손이 느렸어…']]
            : [['서아', '아까워! 나도 처음에 헷갈렸어.'], ['민재', '괜찮아 나도 틀렸어ㅋㅋ 동지!'], ['하린', '다음 문제 가자! 아직 기회 있어']];
          return lines[i % lines.length];
        },
      }),
    );
    this.save.quizScore = res.score;
    this.save.playerWish = res.wish;
    this.set('quizDone');
    this.achievement(`퀴즈 ${res.score}/3 · 소원: ${WISH_LABELS[res.wish]}`);
  }

  // ───────────────────────── 3교시 모둠 ─────────────────────────
  private async group() {
    const g = this.g;
    await this.say([
      this.L('teacher', '모둠별로 「우리 학교를 더 재미있게 바꾸는 방법」을 포스터로 만들어 봐요.'),
      this.L('teacher', '2모둠은 교실 뒤 모둠 책상으로!'),
    ]);
    this.phase = 'gather';
    g.setObjective('교실 뒤 모둠 책상으로 가기', this.inter.groupTable);
    await this.until(() => g.player.pos.distanceTo(new THREE.Vector3(0, 0, 4.7)) < 2.8 || this.f('groupDone'));
    if (!this.f('groupDone')) await this.say([
      this.L('minjae', '나 발표! 나 발표할래!'),
      this.L('junho', '나도 발표하고 싶은데?'),
      this.L('harin', '그럼 만드는 건 누가 해?'),
      this.L('seoa', `역할 카드 있잖아. ${this.me}가 먼저 하나 골라.`),
    ]);
    if (!this.f('groupDone')) {
      this.phase = 'pickRole';
      const xs = [-1.05, -0.35, 0.35, 1.05];
      (['speaker', 'maker', 'researcher', 'organizer'] as GroupRole[]).forEach((r, i) => g.spawnItem('role_' + r, ROLE_ITEMS[r], xs[i], GROUP_TABLE.top + 0.002, GROUP_TABLE.z - 0.45, 0.1 * (i - 1.5)));
      g.setObjective('모둠 책상에서 역할 카드 하나 집기 (발표·제작·자료·정리)', this.inter.groupTable);
      await this.until(() => this.save.groupRole !== null || this.f('groupDone'));
    }
    const role = this.save.groupRole;
    if (!this.f('groupDone') && role) {
      this.phase = 'task';
      if (role === 'speaker') g.setObjective('모둠 책상에서 발표 준비하기 (E)', this.inter.groupTable);
      if (role === 'maker') g.setObjective('모둠 책상에서 포스터 꾸미기 (E)', this.inter.groupTable);
      if (role === 'researcher') this.researchObjective();
      if (role === 'organizer') this.startOrganize();
    }
    await this.until(() => this.f('groupDone'));
    await this.say([this.L('teacher', '2모둠 포스터 멋지다! 뒤 게시판에 붙여 둘게요.')]);
    this.applyGroupPoster();
    g.sfx.success();
    await this.sleep(2);
    await this.endPeriod();
  }

  private async chooseRole(cardId: ItemId) {
    const role = (Object.keys(ROLE_ITEMS) as GroupRole[]).find((r) => ROLE_ITEMS[r] === cardId)!;
    this.g.take(cardId);
    for (const r of Object.keys(ROLE_ITEMS)) this.g.removeItem('role_' + r);
    this.save.groupRole = role;
    this.g.sfx.chime();
    this.toast(`내 역할: ${ROLE_NAMES[role]}`, 'good');
    const rps = (this.save.stats.rpsGames ?? 0) > 0;
    const lines: Line[] =
      role === 'speaker'
        ? [this.L('minjae', '에이~ 그럼 나 제작! 제일 크게 그릴 거야.'), this.L('junho', '난 정리할게. 정리는 빨리 끝내고 쉬는 거야.'), this.L('harin', '자료는 내가 찾을게!')]
        : [
            this.L('minjae', '그럼 발표는… 준호야, 가위바위보!'),
            this.L('junho', rps ? '민재 너 아까 쉬는 시간에 바위만 냈잖아ㅋㅋ' : '좋아, 가위바위보!'),
            this.L('narr', '(민재가 바위를 냈다. 준호가 보를 냈다.)'),
            this.L('junho', '발표는 내가! 민재는 남은 거 하자.'),
          ];
    await this.say(lines);
  }

  private groupTablePrompt(): string | null {
    if (this.period !== 'group' || this.phase !== 'task' || this.f('groupDone')) return null;
    switch (this.save.groupRole) {
      case 'speaker': return '발표 준비하기 (문장 카드)';
      case 'maker': return '모둠 포스터 꾸미기';
      case 'researcher': return this.researchDone.size >= 3 ? '조사한 내용 모둠에 알려 주기' : null;
      default: return null;
    }
  }

  private async groupTableAction() {
    const role = this.save.groupRole;
    if (role === 'speaker') {
      const res = await this.guard(openSpeech(this.g.ui));
      if (!res) return;
      this.set('speechGood', res.good);
      this.g.player.char.setPose('stand');
      await this.say([
        this.L('teacher', '2모둠 발표 들어 볼까요?'),
        ...res.order.map((i) => this.L('me', SPEECH_CARDS[i])),
        this.L(res.good ? 'teacher' : 'minjae', res.good ? '처음-가운데-끝이 딱 맞네요! 박수~' : '순서가 좀 웃긴데 그게 더 재밌다ㅋㅋ'),
      ]);
      this.save.schoolPosterTheme = this.save.playerWish ? WISH_THEME[this.save.playerWish] : 'friends';
      this.finishGroup(false);
    } else if (role === 'maker') {
      const res = await this.guard(openPoster(this.g.ui, '모둠 포스터 — 우리 학교를 더 재미있게!'));
      if (!res) return;
      this.save.schoolPosterTheme = res.theme;
      this.g.map.setGroupPoster(res.theme, res.slogan, res.bg, res.stickers);
      await this.say([this.L('harin', '와 진짜 예쁘다!'), this.L('minjae', '내가 그린 것보다 낫네… 인정.')]);
      this.finishGroup(false, true);
    } else if (role === 'researcher' && this.researchDone.size >= 3) {
      await this.say([
        this.L('me', '게시판엔 「쉬는 시간이 짧아요」 의견이 제일 많았고, 옛날엔 급식 대신 도시락이었대.'),
        this.L('me', '그리고 AI 도우미 안내에 「소원은 문자 그대로 처리됩니다」래.'),
        this.L('seoa', '문자 그대로…? 좀 불안한데.'),
        this.L('harin', '좋아, 포스터에 다 넣자!'),
      ]);
      this.save.schoolPosterTheme = 'rest';
      this.finishGroup(false);
    }
  }

  private researchObjective() {
    const left = RESEARCH.filter((r) => !this.researchDone.has(r));
    const names = { bulletin: '복도 게시판', board: '전자칠판', bookshelf: '학급 문고' };
    if (!left.length) this.g.setObjective('모둠 책상으로 돌아가 조사 내용 알려 주기 (E)', this.inter.groupTable);
    else this.g.setObjective(`자료 조사 ${this.researchDone.size}/3: ${left.map((l) => names[l]).join(', ')} 살펴보기`, this.inter[left[0]]);
  }

  private async research(src: (typeof RESEARCH)[number]) {
    const researcher = this.period === 'group' && this.save.groupRole === 'researcher';
    const info: Record<string, [string, string[], string]> = {
      bulletin: ['복도 게시판', ['학교 소식: 도서관 새 책 30권 도착!', '학생 의견함 1위: 「쉬는 시간이 너무 짧아요」 (32표)', '안내: AI 학교생활 도우미 시범 운영 중'], '쉬는 시간 의견이 제일 많네.'],
      board: ['전자칠판 — AI 도우미 사용 안내', ['AI 학교생활 개선 도우미 (시범 운영)', '1. 학생들의 소원을 모아 학교에 적용합니다.', '2. 입력된 소원은 「문자 그대로」 처리됩니다.', '3. 문제가 생기면 방송실 제어판을 확인하세요.'], '…문자 그대로? 이거 좀 중요한 것 같은데.'],
      bookshelf: ['학급 문고 — 『우리 학교 100년 이야기』', ['옛날에는 급식 대신 도시락을 싸 왔다.', '20년 전 쉬는 시간은 5분이었다. (헉)', '운동회 때 거대 공 굴리기가 제일 인기였다.'], '거대 공 굴리기… 재밌겠다.'],
    };
    if (!researcher && src !== 'bulletin') return;
    const [title, lines, footer] = info[src];
    await this.guard(openInfo(this.g.ui, title, lines, footer));
    if (!researcher) return;
    this.researchDone.add(src);
    if (src === 'board') {
      this.set('foundAIManual');
      this.achievement('단서 발견: AI 도우미 사용 안내');
    }
    this.researchObjective();
  }

  private startOrganize() {
    // 친구들이 서 있는 자리와 겹치지 않게 책상 서쪽 끝과 바닥에 흩어 둔다
    const onTable = GROUP_TABLE.top + 0.002;
    const spots: [number, number, number][] = [[-1.1, onTable, 4.45], [-2.3, 0, 3.4], [-1.1, onTable, 4.95], [2.7, 0, 3.3], [-2.6, 0, 5.7], [3.0, 0, 5.7]];
    ORGANIZE.forEach((id, i) => this.g.spawnItem('org_' + id, id, spots[i][0], spots[i][1], spots[i][2], i));
    this.organized = 0;
    this.g.setObjective('정리 0/6: 흩어진 재료를 왼쪽 뒤 미술 재료함의 바구니에 종류별로 넣기 (들고 F)', this.inter.binCut);
    this.bark('junho', '정리 담당이면 쉬는 거 아니었어? …아 그건 나였지');
  }

  private putInBin(item: ItemId, kind: 'cut' | 'stick' | 'paper') {
    const right = itemDef(item).bin;
    if (right !== kind) {
      this.g.sfx.oops();
      this.toast(`${itemDef(item).name}은(는) 「${BIN_NAMES[right!]}」 바구니야!`, 'warn');
      return;
    }
    this.g.take(item);
    this.g.sfx.place();
    this.organized++;
    if (this.organized >= ORGANIZE.length) {
      this.bark('seoa', '정리왕이다! 책상이 반짝반짝해.');
      this.save.schoolPosterTheme = this.save.playerWish ? WISH_THEME[this.save.playerWish] : 'friends';
      this.finishGroup(false);
    } else this.g.setObjective(`정리 ${this.organized}/6: 흩어진 재료를 바구니에 종류별로 넣기 (들고 F)`, this.inter.binCut);
  }

  private finishGroup(partial: boolean, posterAlreadyDrawn = false) {
    if (this.f('groupDone')) return;
    if (!this.save.schoolPosterTheme) this.save.schoolPosterTheme = this.save.playerWish ? WISH_THEME[this.save.playerWish] : 'friends';
    this.set('groupDone');
    if (partial) this.set('groupPartial');
    if (!posterAlreadyDrawn) this.applyGroupPoster();
    this.show('posterSheet', false);
    for (const id of ORGANIZE) this.g.removeItem('org_' + id);
    for (const r of Object.keys(ROLE_ITEMS)) this.g.removeItem('role_' + r);
    this.g.setObjective('모둠 활동 끝!', null);
  }

  // ───────────────────────── 4교시 미술 ─────────────────────────
  private async art() {
    const g = this.g;
    await this.say([
      this.L('teacher', '4교시는 미술! 종이비행기를 접거나 미니 포스터를 꾸며 봐요.'),
      this.L('teacher', '재료는 뒤 모둠 책상에 있어요. 하나만 골라 가요~'),
    ]);
    this.phase = 'craft';
    g.spawnItem('stack', 'colorPaper', -0.8, 0.71, 4.6);
    g.spawnItem('stack2', 'drawingPaper', 0.8, 0.71, 4.6);
    g.setObjective('모둠 책상에서 색종이(비행기) 또는 미니 도화지(포스터) 가져오기', this.inter.groupTable);
    await this.until(() => this.f('pickedArt') || this.phase !== 'craft');
    if (this.phase === 'craft') g.setObjective('내 책상에서 만들기 (재료 들고 F)', this.inter.seat);
    await this.until(() => this.f('crafted') || this.phase !== 'craft');
    if (this.f('crafted') && !this.f('exhibited')) {
      g.setObjective('뒤 게시판에 작품 전시하기 (작품 들고 F)' + (this.g.inventory.has('glue') ? ' · 하린에게 풀 돌려주기' : ''), this.inter.exhibit);
      await this.until(() => this.f('exhibited') || this.t > SCHEDULE.art.softLimitSec);
    }
    // 정리 시간: 초고속 정리 연출
    this.phase = 'cleanup';
    await this.say([this.L('teacher', '자, 정리하고 급식 먹으러 가요!')]);
    this.syncProps();
    this.g.removeItem('stack');
    this.g.removeItem('stack2');
    await this.speedClean();
    if (this.g.inventory.has('scraps') || this.g.hasWorldItem('scraps')) {
      g.setObjective('종이 조각을 분리수거함(파란 통)에 버리기 (들고 F)', this.inter.trash);
      const start = this.t;
      await this.until(() => (!this.g.inventory.has('scraps') && !this.g.hasWorldItem('scraps')) || this.t > start + 45);
      if (this.g.inventory.has('scraps') || this.g.hasWorldItem('scraps')) {
        // 진행 막힘 방지: 친구가 대신 버려 준다
        await this.say([this.L('harin', '종이 조각 내가 버려 줄게! 급식 늦겠다~')]);
        this.g.take('scraps');
        this.g.removeItem('scraps');
      }
    }
    if (this.g.inventory.has('glue')) {
      await this.say([this.L('harin', '아 내 풀! …괜찮아, 급식 먹고 줘.')]);
    }
    await this.say([this.L('junho', '아까 돈가스 크게 해 달라고 한 사람 누구야?'), this.L('minjae', '나인데, 설마 진짜 되겠냐ㅋㅋ')]);
    await this.endPeriod();
  }

  private async speedClean() {
    const g = this.g;
    g.sfx.whoosh();
    this.bark('minjae', '(초고속 정리 모드 ON)', 2500);
    const all = [...this.students, ...g.fillers];
    await Promise.all(
      all.map(async (n, i) => {
        if (await n.walkTo(-5 + (i % 5) * 2.4, 3 + (i % 2) * 0.8, undefined, 9)) await n.walkTo(6, 3.2 - (i % 3) * 0.6, undefined, 9);
      }),
    ).then(() => undefined);
    await this.guard(Promise.resolve());
    for (const id of ['seoa', 'minjae', 'junho', 'harin'] as const) this.n(id).sitAt(g.map.seats[id]);
    g.fillers.forEach((f, i) => f.sitAt(g.map.seats['filler' + i]));
    this.bark('seoa', '…방금 뭐였지?');
  }

  private async craft(item: ItemId) {
    if (!this.seated) this.sitDown();
    if (item === 'colorPaper') {
      const ok = await this.guard(openFolding(this.g.ui));
      if (!ok) return;
      this.g.take('colorPaper');
      this.g.give('paperPlane');
      this.set('artPlane');
    } else {
      if (!this.g.inventory.has('glue')) {
        this.toast('풀이 없다! 누구한테 빌려 볼까?', 'warn');
        this.bark('harin', '풀 필요해? 나 있어!');
        this.g.setObjective('하린에게 풀 빌리기 (E)', this.n('harin'));
        return;
      }
      const res = await this.guard(openPoster(this.g.ui, '미니 포스터 꾸미기', 2));
      if (!res) return;
      this.g.take('drawingPaper');
      this.g.give('miniPoster');
      this.set('artPoster');
      (this.props.exhibitPoster as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>).material.color.set(res.bg);
    }
    this.set('crafted');
    const d = this.g.map.seats.player;
    this.g.spawnItem('scraps', 'scraps', d.deskX + 0.2, 0.65, d.deskZ + 0.05);
    this.achievement(item === 'colorPaper' ? '종이비행기 완성!' : '미니 포스터 완성!');
  }

  // ───────────────────────── 점심 전환 ─────────────────────────
  private async lunch() {
    const g = this.g;
    g.setObjective('급식실로 이동하기 (계단으로 1층 → 복도 끝)', cafe(CAFE.door.x, CAFE.door.z - 0.9, 1.5));
    this.bark('minjae', '돈가스! 돈가스! 돈가스!');
    await this.until(() => g.player.pos.z > 11.5 && g.player.pos.x > 7 && g.player.pos.y < F1 / 2);
    g.cutscene = true;
    g.setObjective('…?', null);
    g.player.teleport(9, 12.6, 0, F1);
    g.tpc.override = { pos: cafe(10.6, 11.2, 2.4), look: cafe(9, 16.5, 1.2) };
    g.sfx.chime();
    await this.say([this.L('ai', '딩동댕동~ 안녕하세요, AI 학교생활 개선 도우미입니다.'), this.L('ai', '접수된 소원 「돈가스 왕 크게」를 적용했습니다.')]);
    // 문이 열린다
    for (let i = 0; i <= 30; i++) {
      g.map.setCafeteriaDoor(i / 30);
      await this.sleep(0.03);
    }
    g.tpc.override = { pos: cafe(9, 14.4, 1.75), look: cafe(9, 19.6, 1.05) };
    g.sfx.rumble();
    g.tpc.shake(0.1, 2.5);
    await this.say([this.L('ai', '돈가스 크기 1,000% 증가 완료. 맛있게 드세요.')]);
    this.students.forEach((n) => n.char.lookAt(cafe(9, 19.6, 1)));
    await this.say([
      this.L('minjae', '……나 진짜 그렇게 쓰긴 했는데.'),
      this.L('seoa', '식판보다… 아니, 책상보다 크잖아.'),
      this.L('cook', '이걸 어떻게 학생들한테 나눠 주니?!'),
      this.L('teacher', '어… 다들 침착하게! 일단 줄 서요!'),
    ]);
    g.cutscene = false;
    g.tpc.override = null;
    this.enterPeriod('cutlet', false);
  }

  /** 1장 결과 요약 (엔딩 카드용) */
  recap(): string[] {
    const s = this.save;
    const out: string[] = [];
    out.push(this.f('overslept') ? '⏰ 5분 더 자다가 아슬아슬 등교' : '⏰ 알람 듣고 바로 일어남');
    if (this.f('lunchExpert')) out.push('🍱 별명: 급식 전문가 (급식표 3번 확인)');
    if (this.f('pencilReturned')) out.push('✏️ 준호 필통을 찾아 줌');
    if (this.f('helpedPageFriend')) out.push('📖 서아에게 86쪽을 알려 줌');
    out.push(this.f('spokeInClass') ? `🙋 국어 시간 발표${this.f('foundClue') ? ' (교과서 근거 찾기)' : ''}${this.f('consultedPartner') ? ' (짝과 의견 나눔)' : ''}` : '🙋 국어 시간엔 조용히 들었음');
    if (s.stats.planeBest) out.push(`✈️ 종이비행기 최고 기록 ${s.stats.planeBest}m`);
    if (s.stats.rpsGames) out.push(`✊ 민재와 가위바위보 ${s.stats.rpsGames}판 (${s.stats.rpsWins ?? 0}승)`);
    if (this.f('helpedDevice')) out.push(this.f('helpedDevice_share') ? '📱 서아와 태블릿을 같이 봄' : '🔌 서아에게 충전기를 빌려줌');
    out.push(this.f('quizSkipped') ? '🧮 퀴즈는 다음 시간에' : `🧮 퀴즈 ${s.quizScore}/3`);
    if (s.playerWish) out.push(`💬 AI에게 빈 소원: 「${WISH_LABELS[s.playerWish]}」`);
    if (s.groupRole) out.push(`👥 모둠 역할: ${ROLE_NAMES[s.groupRole]}`);
    if (this.f('foundAIManual')) out.push('🔎 단서: 「소원은 문자 그대로 처리됩니다」');
    if (this.f('crafted')) out.push(`🎨 미술: ${this.f('artPlane') ? '종이비행기' : '미니 포스터'}${this.f('exhibited') ? ' (게시판 전시)' : ''}`);
    if (this.f('returnedGlue')) out.push('🤝 빌린 풀을 돌려줌');
    out.push(...this.cutlet.recap(), ...this.robot.recap(), ...this.dodge.recap(), ...this.hallway.recap(), ...this.final.recap());
    return out;
  }

  // ───────────────────────── 자리 F 동작 ─────────────────────────
  private seatUsePrompt(item: ItemId | null): string | null {
    const p = this.period;
    if (this.seated && p === 'korean' && this.phase === 'question' && !this.handRaised && !this.f('spokeInClass')) return '손 들기 (발표하기)';
    if (!item) return null;
    if (item === 'bag' && !this.bagHung()) return '가방 책상 옆에 걸기';
    if (item === 'koreanBook' && !this.f('bookOnDesk')) return '국어책 책상에 올려 두기';
    if (item === 'tablet' && p === 'math' && !this.f('tabletOnDesk')) return '태블릿 책상에 올려 두기';
    if (p === 'art' && this.phase === 'craft' && !this.f('crafted')) {
      if (item === 'colorPaper') return '종이비행기 접기';
      if (item === 'drawingPaper' || (item === 'glue' && this.g.inventory.has('drawingPaper'))) return this.g.inventory.has('glue') ? '미니 포스터 꾸미기' : '미니 포스터 꾸미기 (풀 필요)';
    }
    return null;
  }

  private seatUse(item: ItemId | null) {
    if (this.seated && this.period === 'korean' && this.phase === 'question' && !this.handRaised && !this.f('spokeInClass')) {
      void this.raiseHand();
      return;
    }
    if (!item) return;
    const g = this.g;
    if (item === 'bag') {
      g.take('bag');
      this.hangBag();
    } else if (item === 'koreanBook') {
      g.take('koreanBook');
      this.set('bookOnDesk');
      g.sfx.place();
    } else if (item === 'tablet') {
      g.take('tablet');
      this.set('tabletOnDesk');
      g.sfx.place();
      this.updateMathObjective();
    } else if (item === 'colorPaper' || item === 'drawingPaper' || item === 'glue') {
      void this.craft(item === 'glue' ? 'drawingPaper' : item);
      return;
    }
    this.syncProps();
  }

  // ───────────────────────── NPC 대화 ─────────────────────────
  private givePrompt(id: MainNpcId, item: ItemId): string | null {
    const ev = this.ev();
    if (ev) return ev.usePromptOn(this.n(id), item);
    if (id === 'junho' && item === 'pencilCase') return '필통 돌려주기';
    if (id === 'seoa' && item === 'charger' && this.period === 'math' && !this.f('helpedDevice')) return '충전기 빌려주기';
    if (id === 'harin' && item === 'glue') return '풀 돌려주기';
    if (id === 'seoa' && item === 'paperPlane' && this.period !== 'break') return null;
    return null;
  }

  private give(id: MainNpcId, item: ItemId) {
    const g = this.g;
    const ev = this.ev();
    if (ev) return ev.useOn(this.n(id));
    if (id === 'junho' && item === 'pencilCase') {
      g.take('pencilCase');
      this.set('pencilReturned');
      this.set('helpedFriend');
      void this.say([this.L('junho', '어?! 내 필통! 어디 있었어? 진짜 고마워!'), this.L('junho', '나중에 체육 시간에 내 팀 해 줘.')]);
      this.achievement('친구 도와주기: 필통 찾아 줌');
    } else if (id === 'seoa' && item === 'charger') {
      g.take('charger');
      this.set('helpedDevice');
      this.set('helpedDevice_charger');
      void this.say([this.L('seoa', '살았다! 고마워. 4%… 5%… 오 올라간다!')]);
      this.updateMathObjective();
    } else if (id === 'harin' && item === 'glue') {
      g.take('glue');
      this.set('returnedGlue');
      void this.say([this.L('harin', '오 바로 돌려주네? 다음에도 빌려줄게!')]);
    }
  }

  private async talk(id: MainNpcId) {
    if (this.ev()?.talk(id)) return;
    const n = this.n(id);
    const c = n.talkCount++;
    const p = this.period;
    const pick = (arr: string[]) => arr[c % arr.length];
    const say = (text: string) => this.say([this.L(id, text)]);
    if (n.path.length === 0 && !n.seat) n.faceTo(this.g.player.pos.x, this.g.player.pos.z);

    if (id === 'teacher') {
      if (p === 'math' && this.f('seoaLow') && !this.f('helpedDevice')) return say('충전기요? 선생님 책상 서랍에 여분이 하나 있어요.');
      if (p === 'break') return say(pick(['쉬는 시간엔 복도에서 뛰지 않기~', '…걷는 척하면서 빨리 걷는 것도 다 보여요.']));
      return say(pick(['궁금한 거 있으면 손 들어요~', '오늘도 무사히! 화이팅.', '선생님도 사실 급식이 제일 기다려져요.']));
    }
    if (id === 'junho') {
      if (p === 'arrival' && !this.f('pencilReturned')) {
        if (!this.f('askedPencil')) {
          this.set('askedPencil');
          if (!this.g.inventory.has('pencilCase')) this.g.setObjective(this.g.hud.objectiveText + ' · (선택) 준호 필통 찾아 주기', this.g.items.get('pencil')?.obj.position.clone().setY(0.6) ?? null);
        }
        return say('내 필통 못 봤어? 파란색인데… 1층 현관 신발장에서 신발 갈아 신다가 떨어뜨렸나?');
      }
      if (p === 'break') {
        if (!this.f('gotPlane') && !this.g.inventory.has('paperPlane')) {
          this.set('gotPlane');
          this.g.give('paperPlane');
          return this.say([this.L('junho', '종이비행기 하나 줄게! Space를 꾹 눌렀다 떼면 날아가.'), this.L('junho', '복도가 길어서 기록 내기 좋아. 마우스로 방향 잡고!')]);
        }
        const best = this.save.stats.planeBest;
        return say(best ? `지금 네 기록 ${best}m! 나는 9m 넘겨 봤다?` : '날려 봐 날려 봐! 떨어진 비행기는 E로 주워.');
      }
      return this.chat('junho');
    }
    if (id === 'minjae') {
      if (p === 'break') {
        const r = await this.guard(openRps(this.g.ui, '민재'));
        if (r) {
          this.save.stats.rpsGames = (this.save.stats.rpsGames ?? 0) + 1;
          if (r === 'win') this.save.stats.rpsWins = (this.save.stats.rpsWins ?? 0) + 1;
        }
        return;
      }
      return this.chat('minjae');
    }
    if (id === 'seoa') {
      if (p === 'korean') {
        if (this.phase === 'find' || (this.f('found86') && !this.f('helpedPageFriend') && this.phase !== 'question')) {
          if (this.f('found86')) {
            this.set('helpedPageFriend');
            return this.say([this.L('me', '86쪽! 여기야.'), this.L('seoa', '아 86쪽이었구나! 고마워. 나 68쪽 펴고 있었어ㅋㅋ')]);
          }
          return say('나도 아직 못 찾았어… 86쪽 맞지?');
        }
        if (this.phase === 'question' && !this.f('consultedPartner')) {
          this.set('consultedPartner');
          return this.say([this.L('me', '(속닥) 도윤이 왜 혼자 남았을까?'), this.L('seoa', '나는 친구한테 미안해서 그런 것 같아. 사과하려고 기다린 거 아닐까?'), this.L('seoa', '교과서에 단서 문장도 있을걸?')]);
        }
        return say('쉿, 선생님 말씀하셔.');
      }
      if (p === 'math' && this.f('seoaLow') && !this.f('helpedDevice')) {
        if (!this.f('tabletOnDesk')) return say('3%… 퀴즈 시작 전에 꺼지겠다.');
        this.set('helpedDevice');
        this.set('helpedDevice_share');
        this.syncProps();
        this.updateMathObjective();
        return this.say([this.L('me', '내 태블릿 같이 보자.'), this.L('seoa', '진짜? 고마워! 화면 반씩 나눠 보자.')]);
      }
      if (p === 'group' && this.save.groupRole === 'researcher') return say('AI 도우미 안내는 전자칠판에 떠 있었어. 그것도 봐 봐.');
      return this.chat('seoa');
    }
    if (id === 'harin') {
      if (p === 'art' && !this.g.inventory.has('glue') && !this.f('returnedGlue') && this.g.inventory.has('drawingPaper')) {
        this.g.give('glue');
        this.set('borrowedGlue');
        this.g.setObjective('내 책상에서 미니 포스터 꾸미기 (도화지 들고 F)', this.inter.seat);
        return say('풀 여기! 다 쓰면 돌려줘~');
      }
      if (p === 'break') {
        this.set('heardBreakWish');
        return say('쉬는 시간 100분이었으면 좋겠다… 그럼 다 놀 수 있는데.');
      }
      return this.chat('harin');
    }
  }

  private fillerTalk(npc: Npc, i: number) {
    if (this.ev()?.fillerTalk(i)) return;
    npc.talkCount++;
    if (npc.path.length === 0 && !npc.seat) npc.faceTo(this.g.player.pos.x, this.g.player.pos.z);
    const line = this.chatLine(`filler${i}` as ChatNpc);
    if (line) this.g.bark(npc, line, 2600);
  }

  // ───────── 반 친구 잡담 (src/data/chatter.ts): 교시·활동 단계·앞선 행동에 따라 ─────────
  private chatPicker = new ChatPicker(90, 5);
  private chatStage(): ChatStage {
    const p = this.period, ph = this.phase;
    if (p === 'arrival') return ph === 'bag' || ph === 'book' ? 'before' : ph === 'teacher' ? 'after' : 'during';
    if (p === 'korean') return ph === 'find' ? 'before' : ph === 'question' ? 'during' : 'after';
    if (p === 'math') return this.f('quizDone') ? 'after' : this.f('tabletOnDesk') ? 'during' : 'before';
    if (p === 'group') return this.f('groupDone') ? 'after' : this.save.groupRole ? 'during' : 'before';
    if (p === 'art') return this.f('crafted') ? 'after' : 'during';
    return 'during';
  }
  private chatLine(npc: ChatNpc): string | null {
    const p = this.period;
    const period: ChatPeriod = (['arrival', 'korean', 'break', 'math', 'group', 'art', 'lunch'] as string[]).includes(p) ? (p as ChatPeriod) : 'lunch';
    return this.chatPicker.pick(npc, period, this.chatStage(), {
      flag: (f) => this.f(f),
      role: this.save.groupRole ?? null,
      planeBest: this.save.stats.planeBest ?? 0,
      rpsGames: this.save.stats.rpsGames ?? 0,
    }, performance.now() / 1000);
  }
  private chat(id: MainNpcId) {
    const line = this.chatLine(id as ChatNpc);
    return line ? this.say([this.L(id, line)]) : undefined;
  }

  private ambient() {
    const g = this.g;
    if (g.dialogue.active || g.cutscene) return;
    const near = [...this.students, ...g.fillers].filter((n) => n.pos.distanceTo(g.player.pos) < 7 && n.char.root.visible);
    if (!near.length) return;
    const n = near[Math.floor(Math.random() * near.length)];
    const pools: Partial<Record<PeriodId, string[]>> = {
      arrival: ['오늘 급식 뭐야?', '너 어제 숙제 했어?', '태블릿 충전 안 했는데?', '오늘 체육 있지?', '월요일 싫다…'],
      break: ['가위바위보 할 사람!', '복도 끝까지 날아가라~', '화장실 갔다 올게!', '10분 너무 짧아…'],
      group: ['포스터에 공룡 그리면 안 돼?', '우리 모둠 이름 정하자!', '이거 누가 발표해?'],
      art: ['풀 빌려줄 사람~', '가위 어디 갔지?', '내 비행기 이름은 번개호!'],
    };
    const pool = pools[this.period];
    if (!pool) return;
    g.bark(n, pool[Math.floor(Math.random() * pool.length)], 2800);
  }
}
