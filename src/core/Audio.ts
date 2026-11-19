// 게임 소리 관리자 (하나만 쓴다): 배경음악(BGM 8곡)·효과음(30종)·환경음을 한곳에서 섞는다.
// - 소리 파일: public/audio/bgm/*.ogg, public/audio/sfx/*.ogg (sfx_manifest.json 번호와 같은 이름)
// - 파일을 못 받거나 이 브라우저가 OGG를 못 열면: 효과음은 예전처럼 WebAudio로 직접 만든 소리로, 음악·환경음은 조용히 넘어간다.
// - 브라우저 자동 재생 정책: 첫 클릭·터치·키 입력 뒤 unlock()에서 소리를 켠다.
// 구조: 소리들 → [BGM 버스(대사 중 낮춤) · 효과음 버스 · 환경음 버스] → 전체 음량 → 리미터(여러 소리가 겹쳐도 찢어지지 않게) → 스피커

type Tone = { f: number; t: number; d: number; type?: OscillatorType; g?: number };

export type BgmId = 'explore' | 'class' | 'break' | 'group' | 'cutlet' | 'robot' | 'hallway' | 'ending';
export type AmbId = 'classroom' | 'corridor';
export type SfxId =
  | 'bell' | 'stepTile' | 'stepWood' | 'slideDoor' | 'glassDoor'
  | 'bag' | 'chair' | 'bookOpen' | 'page' | 'pencil' | 'paper'
  | 'questStart' | 'questDone' | 'pickup' | 'correct' | 'wrong' | 'menu'
  | 'tray' | 'cutletCut' | 'cutletReveal' | 'robot' | 'ballFly' | 'ballHit'
  | 'aiWake' | 'wish' | 'aiError' | 'teleport' | 'restored';

const BASE = `${import.meta.env.BASE_URL}audio/`;

/** BGM: 파일 · 반복 여부 (8번 엔딩만 한 번) */
const BGM: Record<BgmId, { file: string; loop: boolean }> = {
  explore: { file: 'bgm01_school_exploration.ogg', loop: true },
  class: { file: 'bgm02_class_time.ogg', loop: true },
  break: { file: 'bgm03_break_time.ogg', loop: true },
  group: { file: 'bgm04_group_activity.ogg', loop: true },
  cutlet: { file: 'bgm05_giant_cutlet.ogg', loop: true },
  robot: { file: 'bgm06_robot_chase.ogg', loop: true },
  hallway: { file: 'bgm07_endless_hallway.ogg', loop: true },
  ending: { file: 'bgm08_ending.ogg', loop: false },
};

const AMB: Record<AmbId, string> = {
  classroom: '06_classroom_ambience_loop.ogg',
  corridor: '07_corridor_ambience_loop.ogg',
};

/**
 * 효과음 표 (sfx_manifest.json 번호 → 이름).
 * gain: 파일마다 크기 맞춤 · cd: 같은 소리 다시 낼 때까지 최소 간격(초) · max: 같은 소리 동시 재생 수 · duck: 울리는 동안 BGM을 잠깐 낮춤
 */
const SFX: Record<SfxId, { file: string; gain: number; cd: number; max: number; duck?: number }> = {
  bell: { file: '01_school_bell.ogg', gain: 1.0, cd: 4, max: 1, duck: 5 },
  stepTile: { file: '02_footsteps_corridor_tile.ogg', gain: 0.5, cd: 0.12, max: 2 },
  stepWood: { file: '03_footsteps_classroom_wood.ogg', gain: 0.5, cd: 0.12, max: 2 },
  slideDoor: { file: '04_classroom_sliding_door.ogg', gain: 0.75, cd: 0.6, max: 2 },
  glassDoor: { file: '05_entrance_glass_door.ogg', gain: 0.75, cd: 1.0, max: 1 },
  bag: { file: '08_bag_on_hook.ogg', gain: 0.9, cd: 0.5, max: 1 },
  chair: { file: '09_chair_drag.ogg', gain: 0.6, cd: 0.9, max: 1 },
  bookOpen: { file: '10_book_open.ogg', gain: 0.9, cd: 0.6, max: 1 },
  page: { file: '11_page_turn.ogg', gain: 0.85, cd: 0.15, max: 2 },
  pencil: { file: '12_pencil_write.ogg', gain: 0.7, cd: 0.6, max: 1 },
  paper: { file: '13_paper_place.ogg', gain: 0.85, cd: 0.4, max: 1 },
  questStart: { file: '14_quest_start.ogg', gain: 0.65, cd: 2.0, max: 1 },
  questDone: { file: '15_quest_complete.ogg', gain: 1.0, cd: 2.0, max: 1, duck: 1.8 },
  pickup: { file: '16_item_pickup.ogg', gain: 0.8, cd: 0.15, max: 2 },
  correct: { file: '17_answer_correct.ogg', gain: 0.9, cd: 0.3, max: 1 },
  wrong: { file: '18_answer_wrong.ogg', gain: 0.8, cd: 0.3, max: 1 },
  menu: { file: '19_menu_select.ogg', gain: 0.55, cd: 0.08, max: 2 },
  tray: { file: '20_cafeteria_tray_clinks.ogg', gain: 0.8, cd: 0.4, max: 2 },
  cutletCut: { file: '21_cutlet_cutting.ogg', gain: 0.9, cd: 0.5, max: 1 },
  cutletReveal: { file: '22_giant_cutlet_reveal.ogg', gain: 1.0, cd: 3, max: 1, duck: 2.5 },
  robot: { file: '23_cleaning_robot_motor_warning.ogg', gain: 0.8, cd: 6, max: 1 },
  ballFly: { file: '24_dodgeball_flyby.ogg', gain: 0.9, cd: 0.5, max: 1 },
  ballHit: { file: '25_dodgeball_bounce_hit.ogg', gain: 0.8, cd: 0.35, max: 2 },
  aiWake: { file: '26_ai_wakeup.ogg', gain: 0.9, cd: 5, max: 1 },
  wish: { file: '27_wish_granted.ogg', gain: 0.95, cd: 3, max: 1, duck: 2 },
  aiError: { file: '28_system_error.ogg', gain: 0.9, cd: 2.5, max: 1 },
  teleport: { file: '29_teleport.ogg', gain: 0.85, cd: 2.5, max: 1 },
  restored: { file: '30_system_restored.ogg', gain: 0.95, cd: 6, max: 1, duck: 2 },
};

/** 한 번에 하나만 울리는 결과음 묶음 */
const RESULT: SfxId[] = ['correct', 'wrong', 'questDone'];

/** 발걸음 파일(5.1초, 9걸음) 안에서 한 걸음씩 시작하는 자리(초): 한 번에 한 걸음만 잘라 쓴다 */
const STEP_ONSETS = [0.23, 0.75, 1.27, 1.79, 2.3, 2.83, 3.35, 3.88, 4.39];
const STEP_LEN = 0.42;
/** 장면 전환 크로스페이드(초) */
const XFADE = 1.2;
/** 한 번에 울리는 효과음 수 한도 (저사양·모바일 보호) */
const MAX_VOICES = 14;

interface Track {
  el: HTMLAudioElement;
  gain: GainNode;
  failed: boolean;
  stopTimer: number;
}

export interface AudioLevels {
  master: number;
  bgm: number;
  sfx: number;
  amb: number;
  muted: boolean;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null; // 전체 음량
  private bgmBus: GainNode | null = null;
  private duckNode: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private levels: AudioLevels = { master: 1, bgm: 0.35, sfx: 0.7, amb: 0.18, muted: false };

  private buffers = new Map<string, AudioBuffer | null>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private lastPlay = new Map<SfxId, number>();
  private active = new Map<SfxId, Set<AudioBufferSourceNode>>();
  private voices = 0;
  private warned = new Set<string>();

  private tracks = new Map<BgmId, Track>();
  private bgmWant: BgmId | null = null;
  private bgmNow: BgmId | null = null;
  private amb: { id: AmbId; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private ambWant: AmbId | null = null;
  private ambToken = 0;

  private talkDuck = false;
  private pausedDuck = false;
  private duckUntil = 0;
  private stepIdx = -1;
  private steps = new Set<{ src: AudioBufferSourceNode; g: GainNode }>();
  private hidden = false;
  /** 최근 효과음 기록 (자동 테스트·디버그용, 최대 60개) */
  readonly log: { id: string; t: number }[] = [];

  constructor() {
    // 탭을 옮기거나 화면을 끄면 소리를 멈췄다가, 돌아오면 이어서
    document.addEventListener('visibilitychange', () => this.onVisibility());
  }

  /** 브라우저 자동재생 정책: 첫 클릭/키 입력 뒤에 호출 */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.hidden) void this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      this.ctx = ctx;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      limiter.connect(ctx.destination);
      this.out = ctx.createGain();
      this.out.connect(limiter);
      this.bgmBus = ctx.createGain();
      this.duckNode = ctx.createGain();
      this.duckNode.connect(this.bgmBus).connect(this.out);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.out);
      this.ambBus = ctx.createGain();
      this.ambBus.connect(this.out);
      this.applyLevels();
    } catch {
      this.ctx = null;
      return;
    }
    // 짧고 자주 쓰는 효과음은 미리 받아 둔다 (환경음은 필요할 때)
    for (const d of Object.values(SFX)) void this.load(d.file);
    if (this.bgmWant) this.startBgm(this.bgmWant);
    if (this.ambWant) void this.startAmb(this.ambWant);
  }

  get unlocked() {
    return !!this.ctx;
  }

  // ───────── 음량 ─────────

  setLevels(l: AudioLevels) {
    this.levels = { ...l };
    this.applyLevels();
  }

  /** 예전 코드 호환: 전체 음량만 바꾸기 */
  setVolume(v: number) {
    this.setLevels({ ...this.levels, master: v });
  }

  private applyLevels() {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const l = this.levels;
    const t = ctx.currentTime;
    this.out.gain.setTargetAtTime(l.muted ? 0 : l.master, t, 0.03);
    this.bgmBus!.gain.setTargetAtTime(l.bgm, t, 0.03);
    this.sfxBus!.gain.setTargetAtTime(l.sfx, t, 0.03);
    this.ambBus!.gain.setTargetAtTime(l.amb, t, 0.03);
  }

  private get silent() {
    return !this.ctx || this.levels.muted || this.levels.master <= 0;
  }

  // ───────── 파일 받기 ─────────

  private load(file: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    const have = this.loading.get(file);
    if (have) return have;
    const p = fetch(BASE + 'sfx/' + file)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      })
      .then(
        (ab) =>
          new Promise<AudioBuffer>((res, rej) => {
            // 옛 사파리는 콜백 방식만 된다
            const ret = ctx.decodeAudioData(ab, res, rej);
            if (ret && typeof (ret as Promise<AudioBuffer>).catch === 'function') (ret as Promise<AudioBuffer>).catch(rej);
          }),
      )
      .then((b) => {
        this.buffers.set(file, b);
        return b;
      })
      .catch(() => {
        this.buffers.set(file, null);
        this.warnOnce('sfx', '[audio] 효과음 파일을 열지 못해 기본 소리로 대신해요: ' + file);
        return null;
      });
    this.loading.set(file, p);
    return p;
  }

  private warnOnce(key: string, msg: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(msg);
  }

  // ───────── 효과음 ─────────

  /**
   * 효과음 한 번. 아직 못 받았거나 열 수 없으면 fallback(직접 만든 소리)을 낸다.
   * 같은 소리는 쿨다운·동시 재생 수 한도를 넘으면 건너뛴다 (반복·겹침 방지). 실제로 소리를 냈으면 true
   */
  play(id: SfxId, opt: { vol?: number; rate?: number; offset?: number; dur?: number } = {}, fallback?: () => void): boolean {
    const ctx = this.ctx;
    if (!ctx || this.silent || this.hidden) return false;
    const def = SFX[id];
    const now = ctx.currentTime;
    const last = this.lastPlay.get(id);
    if (last !== undefined && now - last < def.cd) return false;
    // 정답·오답·완료음은 한 번에 하나만: 완료음이 오면 방금 울린 정답음을 줄이고 완료음만
    if (RESULT.includes(id)) {
      const recent = RESULT.filter((o) => o !== id && now - (this.lastPlay.get(o) ?? -9) < 0.6);
      if (recent.length) {
        if (id !== 'questDone') return false;
        for (const o of recent) this.fadeOut(o);
      }
    }
    // 완료 직후 다음 할 일이 바로 뜨면 「시작」 소리는 생략 (겹치지 않게)
    if (id === 'questStart' && now - (this.lastPlay.get('questDone') ?? -9) < 1.6) return false;
    const set = this.active.get(id) ?? new Set();
    this.active.set(id, set);
    if (set.size >= def.max || this.voices >= MAX_VOICES) return false;
    const buf = this.buffers.get(def.file);
    if (!buf) {
      // 아직 받는 중이거나 실패: 직접 만든 소리로 대신
      if (buf === undefined) void this.load(def.file);
      if (fallback) {
        this.lastPlay.set(id, now);
        this.note(id + '(대신)');
        fallback();
        return true;
      }
      return false;
    }
    this.lastPlay.set(id, now);
    this.note(id);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opt.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = def.gain * (opt.vol ?? 1);
    src.connect(g).connect(this.sfxBus!);
    set.add(src);
    this.voices++;
    src.onended = () => {
      set.delete(src);
      this.voices--;
      src.disconnect();
      g.disconnect();
    };
    if (opt.dur !== undefined) {
      // 잘라 쓰는 소리: 끝을 살짝 줄여 딸깍 소리 없이
      const end = now + opt.dur / (opt.rate ?? 1);
      g.gain.setValueAtTime(def.gain * (opt.vol ?? 1), end - 0.06);
      g.gain.linearRampToValueAtTime(0.0001, end);
      src.start(now, opt.offset ?? 0, opt.dur + 0.02);
    } else src.start(now, opt.offset ?? 0);
    if (def.duck) this.duckFor(def.duck);
    return true;
  }

  private note(id: string) {
    this.log.push({ id, t: Math.round(performance.now()) });
    if (this.log.length > 60) this.log.shift();
  }

  /** 지금 소리 상태 (자동 테스트·디버그용) */
  debug() {
    const tracks: Record<string, { playing: boolean; gain: number; time: number; failed: boolean }> = {};
    for (const [k, t] of this.tracks) tracks[k] = { playing: !t.el.paused && !t.el.ended, gain: +t.gain.gain.value.toFixed(2), time: +t.el.currentTime.toFixed(1), failed: t.failed };
    return {
      state: this.ctx?.state ?? 'none',
      bgm: this.bgmWant,
      bgmNow: this.bgmNow,
      tracks,
      amb: this.amb?.id ?? null,
      duck: this.duckNode ? +this.duckNode.gain.value.toFixed(2) : null,
      loaded: [...this.buffers.values()].filter(Boolean).length,
      voices: this.voices,
      log: this.log.slice(),
    };
  }

  private fadeOut(id: SfxId) {
    const ctx = this.ctx;
    const set = this.active.get(id);
    if (!ctx || !set) return;
    for (const src of set) {
      try {
        src.stop(ctx.currentTime + 0.05);
      } catch {
        /* 이미 멈춤 */
      }
    }
  }

  /** 발걸음 한 걸음 (wood = 교실·체육관 마루, 아니면 복도 타일). 크기·높이를 조금씩 바꿔 기계적으로 들리지 않게 */
  step(wood: boolean, run: boolean, outdoor = false) {
    const ctx = this.ctx;
    if (!ctx || this.silent || this.hidden) return;
    const id: SfxId = wood ? 'stepWood' : 'stepTile';
    const buf = this.buffers.get(SFX[id].file);
    if (!buf) {
      if (buf === undefined) void this.load(SFX[id].file);
      return;
    }
    let i = Math.floor(Math.random() * STEP_ONSETS.length);
    if (i === this.stepIdx) i = (i + 1) % STEP_ONSETS.length;
    this.stepIdx = i;
    const rate = 0.93 + Math.random() * 0.14;
    const vol = (run ? 1.0 : 0.8) * (outdoor ? 0.6 : 1) * (0.8 + Math.random() * 0.3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    const peak = SFX[id].gain * vol;
    const now = ctx.currentTime;
    const end = now + STEP_LEN / rate;
    g.gain.setValueAtTime(peak, now);
    g.gain.setValueAtTime(peak, end - 0.08);
    g.gain.linearRampToValueAtTime(0.0001, end);
    src.connect(g).connect(this.sfxBus!);
    const rec = { src, g };
    this.steps.add(rec);
    src.onended = () => {
      this.steps.delete(rec);
      src.disconnect();
      g.disconnect();
    };
    src.start(now, Math.max(0, STEP_ONSETS[i] - 0.02), STEP_LEN + 0.02);
    this.note(id);
  }

  /** 멈추면 발소리도 바로 끊는다 */
  stopSteps() {
    const ctx = this.ctx;
    if (!ctx || !this.steps.size) return;
    const now = ctx.currentTime;
    for (const { src, g } of this.steps) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0.0001, now + 0.05);
      try {
        src.stop(now + 0.06);
      } catch {
        /* 이미 멈춤 */
      }
    }
    this.steps.clear();
  }

  /** AI 방송 대사가 화면에 뜰 때: 내용에 맞는 AI 효과음 (호출·소원 실행·오류·복구) */
  aiLine(text: string) {
    if (/복원|취소합니다|다시 흐릅|초기화 완료|재분석 완료|비상정지|잠금을 해제/.test(text)) this.play('restored');
    else if (/오류|불일치|삭제|경고|강도를 높|확장합니다|되감/.test(text)) this.play('aiError');
    else if (/접수된 소원|적용|증가 완료|확대했습니다|시작합니다/.test(text)) this.play('wish');
    else this.play('aiWake');
  }

  // ───────── 배경음악 ─────────

  /** 이 BGM으로 (같은 곡이면 그대로 이어서). null = 음악 끄기 */
  setBgm(id: BgmId | null) {
    if (id === this.bgmWant) return;
    this.bgmWant = id;
    if (!this.ctx) return; // 첫 입력 뒤 unlock()에서 시작
    this.startBgm(id);
  }

  get bgm() {
    return this.bgmWant;
  }

  private track(id: BgmId): Track | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    let t = this.tracks.get(id);
    if (t) return t;
    // 긴 곡은 통째로 풀지 않고 흘려 듣는다 (메모리 절약): <audio> → WebAudio
    const el = new Audio();
    el.preload = 'auto';
    el.loop = BGM[id].loop;
    el.src = BASE + 'bgm/' + BGM[id].file;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    t = { el, gain, failed: false, stopTimer: 0 };
    const tr = t;
    try {
      ctx.createMediaElementSource(el).connect(gain).connect(this.duckNode!);
    } catch {
      tr.failed = true;
    }
    el.addEventListener('error', () => {
      tr.failed = true;
      this.warnOnce('bgm', '[audio] 배경음악 파일을 열지 못했어요 (음악 없이 계속): ' + BGM[id].file);
    });
    this.tracks.set(id, t);
    return t;
  }

  private startBgm(id: BgmId | null) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    // 이전 곡은 서서히 줄이고 멈춘다
    if (this.bgmNow && this.bgmNow !== id) {
      const old = this.tracks.get(this.bgmNow);
      if (old) {
        old.gain.gain.cancelScheduledValues(now);
        old.gain.gain.setValueAtTime(old.gain.gain.value, now);
        old.gain.gain.linearRampToValueAtTime(0, now + XFADE);
        clearTimeout(old.stopTimer);
        old.stopTimer = window.setTimeout(() => {
          if (this.bgmNow !== this.keyOf(old)) old.el.pause();
        }, XFADE * 1000 + 120);
      }
    }
    this.bgmNow = id;
    if (!id) return;
    const t = this.track(id);
    if (!t || t.failed) return;
    clearTimeout(t.stopTimer);
    const wasPlaying = !t.el.paused && !t.el.ended;
    if (!wasPlaying) {
      try {
        t.el.currentTime = 0;
      } catch {
        /* 아직 못 받음 */
      }
      if (!this.hidden) t.el.play().catch(() => this.warnOnce('bgmPlay', '[audio] 배경음악을 재생하지 못했어요.'));
    }
    t.gain.gain.cancelScheduledValues(now);
    t.gain.gain.setValueAtTime(wasPlaying ? t.gain.gain.value : 0, now);
    t.gain.gain.linearRampToValueAtTime(1, now + XFADE);
  }

  private keyOf(t: Track): BgmId | null {
    for (const [k, v] of this.tracks) if (v === t) return k;
    return null;
  }

  // ───────── 환경음 ─────────

  /** 장소 환경음 (교실 웅성거림 / 복도). 같은 것이면 그대로, 바뀌면 천천히 넘어간다. null = 없음 */
  setAmbience(id: AmbId | null) {
    if (id === this.ambWant) return;
    this.ambWant = id;
    if (this.ctx) void this.startAmb(id);
  }

  private async startAmb(id: AmbId | null) {
    const ctx = this.ctx;
    if (!ctx) return;
    const token = ++this.ambToken;
    const now = ctx.currentTime;
    if (this.amb && this.amb.id !== id) {
      const { src, gain } = this.amb;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + XFADE);
      try {
        src.stop(now + XFADE + 0.05);
      } catch {
        /* 이미 멈춤 */
      }
      src.onended = () => {
        src.disconnect();
        gain.disconnect();
      };
      this.amb = null;
    }
    if (!id || this.amb) return;
    const buf = await this.load(AMB[id]);
    if (!buf || token !== this.ambToken || !this.ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + XFADE);
    src.connect(gain).connect(this.ambBus!);
    // 매번 같은 자리에서 시작하지 않게
    src.start(t, Math.random() * buf.duration);
    this.amb = { id, src, gain };
  }

  // ───────── BGM 자동으로 낮추기 ─────────

  /** 대사창이 떠 있으면 BGM을 낮춘다 */
  setTalking(on: boolean) {
    if (on === this.talkDuck) return;
    this.talkDuck = on;
    this.applyDuck();
  }

  /** 일시정지 중에는 BGM을 낮추고 발소리를 끊는다 */
  setPaused(on: boolean) {
    if (on === this.pausedDuck) return;
    this.pausedDuck = on;
    if (on) this.stopSteps();
    this.applyDuck();
  }

  /** 종소리·완료음처럼 중요한 소리가 잘 들리게 잠깐 BGM을 낮춘다 */
  private duckFor(sec: number) {
    if (!this.ctx) return;
    this.duckUntil = Math.max(this.duckUntil, this.ctx.currentTime + sec);
    this.applyDuck();
    window.setTimeout(() => this.applyDuck(), sec * 1000 + 50);
  }

  private applyDuck() {
    const ctx = this.ctx;
    if (!ctx || !this.duckNode) return;
    let k = 1;
    if (this.talkDuck) k = Math.min(k, 0.45);
    if (this.pausedDuck) k = Math.min(k, 0.4);
    if (ctx.currentTime < this.duckUntil - 0.02) k = Math.min(k, 0.4);
    this.duckNode.gain.setTargetAtTime(k, ctx.currentTime, 0.12);
  }

  private onVisibility() {
    this.hidden = document.hidden;
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.hidden) {
      this.stopSteps();
      for (const t of this.tracks.values()) if (!t.el.paused) t.el.pause();
      void ctx.suspend().catch(() => {});
    } else {
      void ctx.resume().catch(() => {});
      const t = this.bgmNow ? this.tracks.get(this.bgmNow) : null;
      // 끝난 엔딩곡은 다시 틀지 않는다
      if (t && !t.failed && t.el.paused && !t.el.ended) t.el.play().catch(() => {});
    }
  }

  // ───────── 직접 만든 소리 (파일이 없을 때 대신 / 짧은 UI 소리) ─────────

  private tones(list: Tone[]) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.silent || this.hidden) return;
    const now = ctx.currentTime;
    for (const n of list) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = n.type ?? 'sine';
      o.frequency.value = n.f;
      const peak = n.g ?? 0.25;
      g.gain.setValueAtTime(0, now + n.t);
      g.gain.linearRampToValueAtTime(peak, now + n.t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
      o.connect(g).connect(this.sfxBus);
      o.start(now + n.t);
      o.stop(now + n.t + n.d + 0.05);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
    }
  }

  private noise(dur: number, freq: number, gain = 0.15) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.silent || this.hidden) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.sfxBus);
    src.onended = () => {
      src.disconnect();
      f.disconnect();
      g.disconnect();
    };
    src.start();
  }

  // ───────── 이야기·미니게임에서 쓰는 이름들 ─────────

  /** 학교 종소리 (수업 시작·끝) */
  bell() {
    this.play('bell', {}, () => {
      const s = [659, 523, 587, 392, 392, 587, 659, 523];
      this.tones(s.map((f, i) => ({ f, t: i * 0.42, d: 0.9, type: 'triangle', g: 0.22 })));
    });
  }
  /** 알림 (역할 정하기 등) */
  chime() {
    this.tones([
      { f: 784, t: 0, d: 0.5, type: 'triangle' },
      { f: 988, t: 0.18, d: 0.5, type: 'triangle' },
      { f: 1175, t: 0.36, d: 0.8, type: 'triangle' },
    ]);
  }
  /** 아이템 획득 */
  pickup() {
    this.play('pickup', {}, () => this.tones([{ f: 660, t: 0, d: 0.08, type: 'square', g: 0.08 }, { f: 990, t: 0.06, d: 0.1, type: 'square', g: 0.08 }]));
  }
  /** 물건 내려놓기 (일반) */
  place() {
    this.tones([{ f: 220, t: 0, d: 0.12, type: 'triangle', g: 0.25 }]);
  }
  /** 정답·성공 */
  success() {
    this.play('correct', {}, () => this.tones([523, 659, 784, 1047].map((f, i) => ({ f, t: i * 0.09, d: 0.25, type: 'triangle' as OscillatorType, g: 0.2 }))));
  }
  /** 오답·실패 */
  oops() {
    this.play('wrong', {}, () => this.tones([{ f: 330, t: 0, d: 0.15, type: 'sawtooth', g: 0.08 }, { f: 262, t: 0.12, d: 0.25, type: 'sawtooth', g: 0.08 }]));
  }
  /** 버튼·메뉴 선택 */
  blip() {
    this.play('menu', {}, () => this.tones([{ f: 880, t: 0, d: 0.04, type: 'square', g: 0.04 }]));
  }
  /** 대사 글자 소리 */
  talk() {
    this.tones([{ f: 500 + Math.random() * 200, t: 0, d: 0.05, type: 'square', g: 0.03 }]);
  }
  /** 책장 넘기기 */
  page() {
    this.play('page', {}, () => this.noise(0.18, 2500, 0.2));
  }
  whoosh() {
    this.noise(0.5, 900, 0.25);
  }
  kick() {
    this.tones([{ f: 120, t: 0, d: 0.12, type: 'sine', g: 0.5 }]);
    this.noise(0.06, 1200, 0.15);
  }
  cheer() {
    this.noise(1.2, 1500, 0.12);
  }
  rumble() {
    this.tones([{ f: 55, t: 0, d: 1.6, type: 'sawtooth', g: 0.15 }, { f: 41, t: 0.2, d: 1.6, type: 'sine', g: 0.3 }]);
  }
  /** 새 할 일 */
  questStart() {
    this.play('questStart', {}, () => this.tones([{ f: 660, t: 0, d: 0.18, type: 'triangle', g: 0.12 }, { f: 880, t: 0.1, d: 0.25, type: 'triangle', g: 0.12 }]));
  }
  /** 임무 완료 */
  questDone() {
    this.play('questDone', {}, () => this.success());
  }
}
