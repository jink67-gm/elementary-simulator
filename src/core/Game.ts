// 게임 본체: 렌더러·루프·플레이어·NPC·상호작용·저장을 묶는다. 이야기 진행은 story/Morning.ts.
import * as THREE from 'three';
import { Input } from './Input';
import { Sfx } from './Audio';
import { SaveManager } from './SaveManager';
import { cloneSave, type SaveData } from './SaveData';
import { loadSettings, storeSettings, type Settings } from './Settings';
import { SchoolMap } from '../world/SchoolMap';
import { NavGrid } from '../world/NavGrid';
import { Player } from '../player/Player';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera';
import { Inventory } from '../player/Inventory';
import { InteractionSystem, ownMaterials, type Interactable } from '../interact/Interaction';
import { Npc } from '../npc/Npc';
import { CAST, FILLER_NAMES, fillerLook } from '../data/cast';
import { PLAYER_LOOKS } from '../world/Character';
import { Hud } from '../ui/Hud';
import { Dialogue, type Line } from '../ui/Dialogue';
import { panelsOpen } from '../ui/Panel';
import { itemDef, type ItemId } from '../data/items';
import { itemHalfHeight, makeItemMesh } from '../world/itemMesh';
import { Ball, PaperPlaneFlight } from '../world/Toys';
import { Robot } from '../world/Robot';
import type { UiCtx } from '../minigames/Textbook';
import type { Circle } from '../world/Collision';

export interface StoryHooks {
  start(save: SaveData): void;
  update(dt: number): void;
  onPickup(id: ItemId, key: string): void;
  canPickup(id: ItemId, key: string): string | null;
  onPlaneLanded(dist: number, hitWall: boolean): void;
  requiredItems(): ItemId[];
  helpReturnToSeat(): void;
  /** 들고 있던 물건을 바닥에 내려놓았을 때 (key = 새 월드 아이템 키) */
  onDropped?(id: ItemId, key: string): void;
}

interface WorldItem {
  key: string;
  id: ItemId;
  obj: THREE.Object3D;
}

export type MainNpcId = keyof typeof CAST;

/** 원격 조종 중일 때: 플레이어 대신 조종 대상이 움직이고 카메라가 따라간다 */
export interface RemoteControl {
  target(): THREE.Vector3;
  /** Space 또는 화면 클릭: 집게 */
  onAction(): void;
  /** E 또는 Esc: 조종 끝내기 */
  onExit(): void;
}

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.05, 120);
  tpc = new ThirdPersonCamera(this.camera);
  map = new SchoolMap();
  nav = new NavGrid(-7.5, -30.5, 17.5, 27.5, 0.3);
  input: Input;
  sfx = new Sfx();
  saves = new SaveManager();
  settings: Settings = loadSettings();
  hud: Hud;
  dialogue: Dialogue;
  /** 미니게임·메뉴 창이 붙는 곳 */
  layer: HTMLElement;
  player!: Player;
  inventory = new Inventory();
  interactions = new InteractionSystem();
  npcs = {} as Record<MainNpcId, Npc>;
  fillers: Npc[] = [];
  items = new Map<string, WorldItem>();
  plane: PaperPlaneFlight;
  ball: Ball;
  robot: Robot;
  remote: RemoteControl | null = null;
  /** 사건이 잠깐 추가하는 충돌 원 (거대 피구공 등) */
  extraCircles: Circle[] = [];
  save!: SaveData;
  story!: StoryHooks;
  running = false;
  paused = false;
  cutscene = false;
  private marker: THREE.Mesh;
  private markerTarget: (() => THREE.Vector3) | null = null;
  private clock = new THREE.Clock();
  private sun: THREE.DirectionalLight;
  private planeCharge = -1;
  private chargeBar: HTMLElement;
  private dropCount = 0;
  private lastPlayerPos = new THREE.Vector3();
  private playerVel = new THREE.Vector3();
  onPauseRequest: () => void = () => {};
  private unlockIntended = false;
  fps = 0;
  private slowSeconds = 0;
  private slowHinted = false;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: this.settings.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);
    this.input.blockKeys = () => panelsOpen() || this.paused;
    this.layer = document.createElement('div');
    this.layer.className = 'ui-layer';
    container.append(this.layer);
    this.hud = new Hud(this.layer);
    this.dialogue = new Dialogue(this.layer);
    this.dialogue.onType = () => this.sfx.talk();
    this.chargeBar = document.createElement('div');
    this.chargeBar.className = 'charge hidden';
    this.chargeBar.innerHTML = '<div class="charge-fill"></div><span>Space를 떼면 날아가요!</span>';
    this.layer.append(this.chargeBar);

    // 하늘·빛
    this.scene.background = new THREE.Color(0xbfe3ff);
    this.scene.fog = new THREE.Fog(0xbfe3ff, 30, 70);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c7a8, 1.6));
    this.sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    this.sun.position.set(-14, 18, 6);
    this.sun.target.position.set(2, 0, 3);
    this.sun.shadow.camera.left = -18;
    this.sun.shadow.camera.right = 18;
    this.sun.shadow.camera.top = 22;
    this.sun.shadow.camera.bottom = -22;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.map.root);
    this.nav.rebuild(this.map.colliders, 0.3);

    // 목표 표시 화살표
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), new THREE.MeshBasicMaterial({ color: 0xffc300 }));
    this.marker.rotation.x = Math.PI;
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.robot = new Robot(this.nav);
    this.scene.add(this.robot.root);

    // 인물
    for (const id of Object.keys(CAST) as MainNpcId[]) {
      const n = new Npc(CAST[id], this.nav);
      this.npcs[id] = n;
      this.scene.add(n.char.root);
    }
    for (let i = 0; i < 10; i++) {
      const n = new Npc({ id: 'filler' + i, name: FILLER_NAMES[i], look: fillerLook(i) }, this.nav);
      this.fillers.push(n);
      this.scene.add(n.char.root);
    }

    this.plane = new PaperPlaneFlight(this.scene);
    this.plane.onLand = (d, w) => this.story.onPlaneLanded(d, w);
    this.ball = new Ball(this.scene);
    this.ball.onKick = () => this.sfx.kick();

    this.inventory.onChange = () => {
      this.hud.setInventory(this.inventory.slots, this.inventory.selected);
      this.player?.setHeld(this.inventory.held);
    };

    this.applySettings();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.domElement.addEventListener('click', () => {
      this.sfx.unlock();
      if (this.running && !this.paused && !panelsOpen()) this.input.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.running && !this.paused && !panelsOpen() && !this.unlockIntended) this.onPauseRequest();
      this.unlockIntended = false;
    });
    window.addEventListener('keydown', () => this.sfx.unlock(), { once: true });
  }

  get ui(): UiCtx {
    return { layer: this.layer, sfx: this.sfx };
  }

  applySettings() {
    const s = this.settings;
    this.tpc.sensitivity = s.sensitivity;
    this.tpc.shakeEnabled = s.shake;
    this.sfx.setVolume(s.volume);
    this.dialogue.speed = s.textSpeed === 'slow' ? 0.7 : s.textSpeed === 'fast' ? 1.6 : 1;
    const pr = s.quality === 'low' ? 0.75 : s.quality === 'mid' ? Math.min(1, window.devicePixelRatio) : Math.min(2, window.devicePixelRatio);
    this.renderer.setPixelRatio(pr);
    const shadows = s.quality !== 'low';
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.setScalar(s.quality === 'high' ? 2048 : 1024);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      (this.sun.shadow as unknown as { map: null }).map = null;
    }
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    storeSettings(s);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 저장 데이터로 게임을 시작(또는 이어서)한다 */
  begin(save: SaveData, story: StoryHooks) {
    this.save = save;
    this.story = story;
    if (this.player) this.scene.remove(this.player.object);
    this.player = new Player(PLAYER_LOOKS[save.avatar.look % PLAYER_LOOKS.length]);
    this.scene.add(this.player.object);
    this.player.groundAt = (x, z, y) => this.map.groundY(x, z, y);
    for (const k of [...this.items.keys()]) this.removeItem(k);
    this.inventory.load(save.inventory);
    this.running = true;
    this.paused = false;
    this.hud.show(true);
    this.story.start(save);
    this.inventory.onChange();
    this.tpc.behind(this.player.yaw);
    this.clock.getDelta();
    if (!this.looping) this.loop();
  }

  private looping = false;
  private loop = () => {
    this.looping = true;
    requestAnimationFrame(this.loop);
    // 물리는 프레임당 최대 50ms로 자르고, 이야기·대사 시계는 실제 흐른 시간(최대 250ms)을 쓴다 (느린 컴퓨터에서도 진행 속도 유지)
    const real = Math.min(0.25, this.clock.getDelta());
    const dt = Math.min(0.05, real);
    this.fpsAcc += real;
    this.fpsFrames++;
    if (this.fpsAcc > 1) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      // 느린 컴퓨터: 한 번만 '낮음' 품질을 권한다
      if (this.running && !this.paused) {
        this.slowSeconds = this.fps < 24 ? this.slowSeconds + 1 : 0;
        if (this.slowSeconds === 6 && this.settings.quality !== 'low' && !this.slowHinted) {
          this.slowHinted = true;
          this.hud.toast('화면이 느리면 Esc → 설정 → 그래픽 품질 「낮음」을 골라 보세요.', 'warn', 6000);
        }
      }
    }
    if (this.running && !this.paused) this.tick(dt, real);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  };

  private tick(dt: number, real: number) {
    const input = this.input;
    input.captured = panelsOpen();
    if (input.captured && input.pointerLocked) {
      this.unlockIntended = true;
      input.releaseLock();
    }
    this.save.playedSeconds += real;

    // 대화 넘기기 (E·Enter·클릭)
    this.dialogue.update(real);
    // 대화창이 떠 있으면 E(또는 Enter·클릭)는 언제나 「다음 대사」. 마지막 줄에서 누르면 닫힌다.
    // 그 E가 바로 앞 친구에게 다시 말 거는 데 쓰이지 않도록 이번 프레임의 E는 대화가 가져간다.
    const talking = this.dialogue.active;
    if (talking && (input.pressed('Enter') || input.pressed('E'))) this.dialogue.advance();
    const consumedE = talking && input.pressed('E');
    if (input.pressed('Q')) this.dialogue.skipEverything();

    if (input.pressed('Escape') && !input.captured) {
      if (this.remote) this.remote.onExit();
      else this.onPauseRequest();
    }

    // 소지품
    for (let i = 1; i <= 4; i++) if (input.pressed(String(i))) this.inventory.select(i - 1);
    if (input.pressed('Tab')) this.hud.toggleInventoryDesc();

    this.player.frozen = this.cutscene || !!this.remote;
    this.hud.root.classList.toggle('cine', this.cutscene);
    const npcCircles: Circle[] = [...Object.values(this.npcs), ...this.fillers]
      .filter((n) => n.char.root.visible)
      .map((n) => ({ x: n.pos.x, z: n.pos.z, r: n.radius }));
    npcCircles.push(...this.extraCircles);
    if (this.robot.root.visible) npcCircles.push({ x: this.robot.pos.x, z: this.robot.pos.z, r: this.robot.radius });
    this.lastPlayerPos.copy(this.player.pos);

    // 종이비행기: Space 꾹 → 놓으면 날리기
    const holdingPlane = this.inventory.held === 'paperPlane' && !this.cutscene;
    this.player.spaceBusy = holdingPlane;
    if (holdingPlane && !this.plane.active && !this.player.seat) {
      if (input.pressed('Space')) this.planeCharge = 0;
      if (this.planeCharge >= 0 && input.down('Space')) {
        this.planeCharge = Math.min(1, this.planeCharge + dt * 0.8);
        this.chargeBar.classList.remove('hidden');
        (this.chargeBar.firstElementChild as HTMLElement).style.width = `${this.planeCharge * 100}%`;
      }
      if (this.planeCharge >= 0 && input.released('Space')) {
        const dir = new THREE.Vector3(-Math.sin(this.tpc.yaw), 0, -Math.cos(this.tpc.yaw));
        this.player.yaw = Math.atan2(dir.x, dir.z);
        const from = this.player.pos.clone().add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(dir, 0.4);
        this.plane.launch(from, dir, this.planeCharge);
        this.inventory.remove('paperPlane');
        this.sfx.whoosh();
        this.planeCharge = -1;
        this.chargeBar.classList.add('hidden');
      }
    } else {
      this.planeCharge = -1;
      this.chargeBar.classList.add('hidden');
    }

    // 2층 인물·공은 1층에 있을 때 부딪히지 않는다
    const level = this.map.levelOf(this.player.pos.y);
    this.player.update(dt, input, this.tpc.yaw, this.map.collidersFor(level), level === 1 ? npcCircles : []);
    this.playerVel.copy(this.player.pos).sub(this.lastPlayerPos).divideScalar(dt || 1);

    for (const n of Object.values(this.npcs)) n.update(dt);
    for (const n of this.fillers) n.update(dt);
    this.plane.update(dt, this.map.collidersFor(1));
    this.ball.update(dt, this.map.collidersFor(1), this.player.pos, this.playerVel);
    if (this.robot.root.visible) this.robot.update(dt, this.map.collidersFor(1), this.remote && !this.cutscene && !input.captured ? input : undefined, this.tpc.yaw);
    if (this.remote && !this.cutscene && !input.captured) {
      if (input.pressed('Space') || input.pressed('MouseLeft')) this.remote.onAction();
      else if (input.pressed('E')) this.remote.onExit();
    }

    this.story.update(real);

    // 상호작용
    const facing = this.player.seat ? new THREE.Vector3(-Math.sin(this.tpc.yaw), 0, -Math.cos(this.tpc.yaw)) : this.player.forward();
    if (this.cutscene || input.captured || this.remote) {
      this.interactions.focus = null;
      this.hud.setPrompt(null, null, null);
    } else {
      this.interactions.update(this.player.pos, facing, this.inventory.held, !!this.player.seat);
      const f = this.interactions.focus;
      if (f) {
        const p = this.interactions.position(f.target).clone();
        p.y += f.target.promptY ?? 0.9;
        const sp = p.project(this.camera);
        const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
        this.hud.setPrompt(f.eLabel, f.fLabel, sp.z < 1 ? { x: ((sp.x + 1) / 2) * w, y: ((1 - sp.y) / 2) * h } : { x: w / 2, y: h * 0.62 });
        if (!consumedE && input.pressed('E') && f.e) f.e.onInteract?.();
        else if (input.pressed('F') && f.f) f.f.onUse?.(this.inventory.held);
        else if (input.pressed('F') && this.inventory.held && !this.player.seat) this.dropHeld();
      } else {
        this.hud.setPrompt(null, null, null);
        if (input.pressed('F') && this.inventory.held && !this.player.seat && this.inventory.held !== 'paperPlane') this.dropHeld();
      }
    }

    // 카메라
    this.tpc.update(dt, input, this.remote ? this.remote.target() : this.player.pos, !!this.player.seat && !this.remote, this.map.cameraBlockers);
    // 카메라가 친구 머리 속에 들어가면 그 친구를 잠깐 숨긴다 (앉아 있을 때 뒷자리 친구 등)
    for (const n of [...Object.values(this.npcs), ...this.fillers]) n.char.setHidden(n.headPos().distanceTo(this.camera.position) < 0.75);
    // 좁은 방에서 카메라가 내 머리에 붙으면 내 캐릭터도 잠깐 숨긴다 (원격 조종 중 제외)
    if (!this.remote) {
      const head = this.player.pos.clone();
      head.y += 1.2 * this.player.char.scale;
      this.player.char.setHidden(head.distanceTo(this.camera.position) < 0.9);
    } else this.player.char.setHidden(false);
    this.hud.showLockHint(!input.pointerLocked && !input.captured && !this.cutscene);
    this.hud.updateBubbles(this.camera, this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);

    // 목표 화살표
    if (this.markerTarget && !this.cutscene) {
      let t = this.markerTarget();
      // 다른 층에 있는 목표면 먼저 계단을 가리킨다
      if (Math.abs(t.y - this.player.pos.y) > 2.4) t = this.map.stairHint(this.map.levelOf(this.player.pos.y));
      const d = Math.hypot(t.x - this.player.pos.x, t.z - this.player.pos.z);
      this.marker.visible = d > 1.1;
      this.marker.position.set(t.x, t.y + 0.35 + Math.sin(performance.now() / 250) * 0.08, t.z);
      this.marker.rotation.y += dt * 2;
    } else this.marker.visible = false;
  }

  // ───────── 이야기에서 쓰는 도구들 ─────────

  setObjective(text: string, target: THREE.Vector3 | Interactable | Npc | (() => THREE.Vector3) | null = null) {
    this.hud.setObjective(text);
    if (!target) this.markerTarget = null;
    else if (target instanceof THREE.Vector3) this.markerTarget = () => target;
    else if (target instanceof Npc) this.markerTarget = () => target.headPos().add(new THREE.Vector3(0, 0.25, 0));
    else if (typeof target === 'function') this.markerTarget = target;
    else {
      const it = target;
      this.markerTarget = () => this.interactions.position(it).clone().add(new THREE.Vector3(0, (it.promptY ?? 0.9) + 0.3, 0));
    }
  }

  say(lines: Line[]): Promise<void> {
    return this.dialogue.say(lines);
  }

  bark(n: Npc, text: string, ms = 3400) {
    this.hud.bubble(n.name, text, () => n.headPos().add(new THREE.Vector3(0, 0.35, 0)), ms);
  }

  addInteractable(i: Interactable, glow = true): Interactable {
    if (glow && !i.noGlow) ownMaterials(i.obj);
    return this.interactions.add(i);
  }

  /** 바닥이나 책상에 줍는 물건을 놓는다 */
  spawnItem(key: string, id: ItemId, x: number, y: number, z: number, rotY = 0): THREE.Object3D {
    this.removeItem(key);
    const obj = makeItemMesh(id);
    obj.position.set(x, y + itemHalfHeight(id), z);
    obj.rotation.y = rotY;
    this.scene.add(obj);
    this.items.set(key, { key, id, obj });
    this.addInteractable({
      id: 'item:' + key,
      obj,
      radius: 1.6,
      promptY: 0.4,
      prompt: () => this.story.canPickup(id, key) ?? `${itemDef(id).name} 줍기`,
      onInteract: () => this.pickup(key),
    });
    return obj;
  }

  pickup(key: string) {
    const it = this.items.get(key);
    if (!it) return;
    const block = this.story.canPickup(it.id, key);
    if (block) {
      this.hud.toast(block, 'warn');
      return;
    }
    if (!this.inventory.add(it.id)) {
      this.hud.toast('소지품 칸이 꽉 찼어요! F로 하나 내려놓아요.', 'warn');
      return;
    }
    this.sfx.pickup();
    this.removeItem(key);
    this.story.onPickup(it.id, key);
  }

  removeItem(key: string) {
    const it = this.items.get(key);
    if (!it) return;
    this.scene.remove(it.obj);
    this.items.delete(key);
    this.interactions.remove('item:' + key);
  }

  hasWorldItem(key: string) {
    return this.items.has(key);
  }

  give(id: ItemId) {
    if (!this.inventory.add(id)) {
      // 꽉 차면 발밑에 놓는다
      const f = this.player.forward();
      this.spawnItem(`drop${this.dropCount++}`, id, this.player.pos.x + f.x * 0.6, 0, this.player.pos.z + f.z * 0.6);
      this.hud.toast(`손이 꽉 차서 ${itemDef(id).name}을(를) 발밑에 놓았어요.`, 'warn');
      return;
    }
    this.sfx.pickup();
  }

  take(id: ItemId): boolean {
    return this.inventory.remove(id);
  }

  dropHeld() {
    const id = this.inventory.held;
    if (!id) return;
    const f = this.player.forward();
    this.inventory.remove(id);
    const key = `drop${this.dropCount++}`;
    this.spawnItem(key, id, this.player.pos.x + f.x * 0.6, 0, this.player.pos.z + f.z * 0.6, this.player.yaw);
    this.story.onDropped?.(id, key);
    this.sfx.place();
  }

  /** 떨어뜨렸거나 잃어버린 필수 물건을 다시 손에 */
  recoverItems() {
    const need = this.story.requiredItems();
    let n = 0;
    for (const id of need) {
      if (this.inventory.has(id)) continue;
      for (const [k, it] of this.items) if (it.id === id && k.startsWith('drop')) this.removeItem(k);
      this.give(id);
      n++;
    }
    this.hud.toast(n ? '필요한 물건을 다시 챙겼어요.' : '지금 꼭 필요한 물건은 다 있어요!', 'good');
  }

  /** 교시 시작 체크포인트 저장 */
  checkpoint() {
    this.save.inventory = this.inventory.list();
    this.save.lastCheckpoint = this.save.period;
    const ok = this.saves.write(cloneSave(this.save));
    if (!ok && this.saves.lastError) this.hud.toast(this.saves.lastError, 'warn', 5000);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) {
      this.unlockIntended = true;
      this.input.releaseLock();
    }
    this.clock.getDelta();
  }

  lockPointer() {
    this.input.requestLock();
  }
}
