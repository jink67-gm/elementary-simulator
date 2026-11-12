// 사건 1 급식실 창: 안전 절단기, 음식 크기 조절기, 축제 방송 문장 고르기.
// 절단기는 조리사 선생님이 지켜보는 기계 패널이다(날을 직접 다루지 않는다).
import { Panel } from '../ui/Panel';
import { el, button, wait } from '../ui/dom';
import type { UiCtx } from './Textbook';
import {
  CUTLET_COLS, MACHINE_OPS, MACHINE_START, PORTS, WIRES, WIRE_RULE, cutPieces, machineApply, machineCheck, planHint, wiresCorrect,
  type MachineOp, type Port, type Wire,
} from '../story/cutletLogic';

/** 압력 게이지: 바늘이 초록 칸에 있을 때 Space. 결과는 콜백으로 */
class Gauge {
  root = el('div', { class: 'gauge' });
  private needle = el('div', { class: 'gauge-needle' });
  private v = 0;
  private dir = 1;
  private raf = 0;
  private last = 0;
  constructor(private lo = 0.38, private hi = 0.62, private speed = 0.9) {
    const zone = el('div', { class: 'gauge-zone' });
    zone.style.left = `${lo * 100}%`;
    zone.style.width = `${(hi - lo) * 100}%`;
    this.root.append(zone, this.needle);
    const tick = (t: number) => {
      const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 0;
      this.last = t;
      this.v += this.dir * dt * this.speed;
      if (this.v > 1) (this.v = 1), (this.dir = -1);
      if (this.v < 0) (this.v = 0), (this.dir = 1);
      this.needle.style.left = `${this.v * 100}%`;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  hit(): boolean {
    return this.v >= this.lo && this.v <= this.hi;
  }
  stop() {
    cancelAnimationFrame(this.raf);
  }
}

export interface CutResult {
  cuts: number[];
  halved: boolean;
  misses: number;
}

/** 거대 돈가스 자르기. 자르기를 끝내면 결과, 그냥 닫으면 null */
export function openCutter(ctx: UiCtx, lowSpec = false): Promise<CutResult | null> {
  return new Promise((resolve) => {
    let res: CutResult | null = null;
    const gauge = new Gauge(lowSpec ? 0.32 : 0.38, lowSpec ? 0.68 : 0.62, lowSpec ? 0.7 : 0.9);
    const p = new Panel(ctx.layer, {
      title: '안전 절단기 — 조리사 선생님과 함께',
      wide: true,
      onClose: () => {
        gauge.stop();
        resolve(res);
      },
    });
    const cuts: number[] = [];
    let halved = false;
    let guide = 6;
    let guideH = false; // 가로(반 가르기) 선을 고르는 중
    let misses = 0;
    let busy = false;

    const board = el('div', { class: 'cutlet-board' });
    const hint = el('div', { class: 'partner-line' });
    const info = el('div', { class: 'keys-hint' }, '마우스로 자를 곳을 고르거나 A/D(←/→)로 옮기고, 초록 칸에서 Space! · H: 가운데 가로선 · Enter: 자르기 끝');
    const cook = el('div', { class: 'cook-line' }, '조리사 선생님: 손은 손잡이에만! 버튼은 내가 같이 눌러 줄게.');

    const render = () => {
      board.innerHTML = '';
      const pieces = cutPieces(cuts, halved);
      // 조각 미리보기
      for (const pc of pieces) {
        const d = el('div', { class: 'cut-piece' + (pc.area > 5 ? ' big' : pc.area >= 3 ? ' good' : ' small') }, String(pc.area));
        d.style.left = `${(pc.c0 / CUTLET_COLS) * 100}%`;
        d.style.width = `${((pc.c1 - pc.c0) / CUTLET_COLS) * 100}%`;
        d.style.top = halved ? (pc.row ? '50%' : '0') : '0';
        d.style.height = halved ? '50%' : '100%';
        board.append(d);
      }
      for (const c of cuts) {
        const l = el('div', { class: 'cut-line done' });
        l.style.left = `${(c / CUTLET_COLS) * 100}%`;
        board.append(l);
      }
      if (halved) board.append(el('div', { class: 'cut-line-h done' }));
      const g = el('div', { class: guideH ? 'cut-line-h guide' : 'cut-line guide' });
      if (!guideH) g.style.left = `${(guide / CUTLET_COLS) * 100}%`;
      board.append(g);
      // 마우스로 고르기
      for (let i = 1; i < CUTLET_COLS; i++) {
        const hit = el('div', { class: 'cut-hit' });
        hit.style.left = `${((i - 0.5) / CUTLET_COLS) * 100}%`;
        hit.style.width = `${(1 / CUTLET_COLS) * 100}%`;
        hit.addEventListener('mouseenter', () => {
          guideH = false;
          guide = i;
          render();
        });
        hit.addEventListener('click', () => void doCut());
        board.append(hit);
      }
      hint.textContent = planHint(pieces);
    };

    const doCut = async () => {
      if (busy) return;
      if (guideH ? halved : cuts.includes(guide)) {
        cook.textContent = '조리사 선생님: 거긴 벌써 잘랐어~ 다른 곳!';
        ctx.sfx.oops();
        return;
      }
      busy = true;
      if (gauge.hit()) {
        ctx.sfx.kick();
        if (guideH) {
          halved = true;
          guideH = false;
        } else cuts.push(guide);
        cook.textContent = ['조리사 선생님: 오, 깔끔하다!', '조리사 선생님: 좋아, 바삭 소리 났지?', '조리사 선생님: 그렇지! 천천히~'][(cuts.length + (halved ? 1 : 0)) % 3];
        render();
      } else {
        misses++;
        ctx.sfx.oops();
        cook.textContent = ['삐빅! 압력이 안 맞아요 — 초록 칸에서 다시!', '부스러기가 조금 튀었다. 괜찮아, 다시 해 보자.', '조리사 선생님: 서두르지 마~ 바늘 잘 보고!'][misses % 3];
      }
      await wait(250);
      busy = false;
    };

    const finish = () => {
      if (!cuts.length && !halved) {
        cook.textContent = '조리사 선생님: 하나도 안 잘랐는데? 식판보다 훨씬 크단다!';
        ctx.sfx.oops();
        return;
      }
      res = { cuts: [...cuts].sort((a, b) => a - b), halved, misses };
      ctx.sfx.success();
      p.close();
    };

    p.body.append(
      cook,
      board,
      el('div', { class: 'gauge-label' }, '압력 게이지'),
      gauge.root,
      hint,
      el('div', { class: 'row center' },
        button('◀', () => ((guideH = false), (guide = Math.max(1, guide - 1)), render()), 'btn'),
        button('가로로 반 가르기 선 (H)', () => ((guideH = !guideH), render()), 'btn'),
        button('▶', () => ((guideH = false), (guide = Math.min(CUTLET_COLS - 1, guide + 1)), render()), 'btn'),
        button('자르기! (Space)', () => void doCut(), 'btn primary'),
        button('자르기 끝 (Enter)', finish, 'btn'),
      ),
      info,
    );
    p.onKey((e) => {
      if (e.repeat) return;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') (guideH = false), (guide = Math.max(1, guide - 1)), render();
      else if (e.code === 'KeyD' || e.code === 'ArrowRight') (guideH = false), (guide = Math.min(CUTLET_COLS - 1, guide + 1)), render();
      else if (e.code === 'KeyH' || e.code === 'ArrowUp' || e.code === 'ArrowDown') (guideH = !guideH), render();
      else if (e.code === 'Space') {
        e.preventDefault();
        void doCut();
      } else if (e.code === 'Enter') finish();
    });
    render();
  });
}

/** 큰 조각 하나를 반으로 (게이지 한 번) */
export function openSplit(ctx: UiCtx, area: number, lowSpec = false): Promise<boolean> {
  return new Promise((resolve) => {
    let ok = false;
    const gauge = new Gauge(lowSpec ? 0.3 : 0.36, lowSpec ? 0.7 : 0.64, 0.8);
    const p = new Panel(ctx.layer, { title: '안전 절단기 — 반으로 나누기', onClose: () => (gauge.stop(), resolve(ok)) });
    const msg = el('div', { class: 'partner-line' }, `크기 ${area} 조각을 반으로! 초록 칸에서 Space`);
    const go = async () => {
      if (ok) return;
      if (gauge.hit()) {
        ok = true;
        ctx.sfx.kick();
        msg.textContent = '반으로 쏙! 이제 식판에 들어가겠다.';
        await wait(900);
        p.close();
      } else {
        ctx.sfx.oops();
        msg.textContent = '삐빅! 다시 한 번~';
      }
    };
    p.body.append(el('div', { class: 'cutlet-mini' }, el('div', { class: 'cut-line-v-mid' })), gauge.root, msg, el('div', { class: 'row center' }, button('자르기! (Space)', () => void go(), 'btn primary')));
    p.onKey((e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        void go();
      }
    });
  });
}

const WIRE_NAMES: Record<Wire, string> = { red: '빨강', blue: '파랑', yellow: '노랑' };
const PORT_NAMES: Record<Port, string> = { power: '전원', size: '크기', ground: '접지' };

/** 음식 크기 조절기. 100%로 맞추면 true */
export function openMachine(ctx: UiCtx, onTooSmall: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    let ok = false;
    const p = new Panel(ctx.layer, { title: '음식 크기 조절기 (시범 운영 중)', wide: true, onClose: () => resolve(ok) });
    const conn: Partial<Record<Wire, Port>> = {};
    let heldWire: Wire | null = null;
    let value = MACHINE_START;
    const history: string[] = [];
    const sticker = el('div', { class: 'machine-sticker' },
      el('b', {}, '사용 설명 스티커'),
      el('div', {}, '① 빨강 선 → 전원'),
      el('div', {}, '② 파랑 선 → 크기'),
      el('div', {}, '③ 노랑 선 → 접지'),
      el('div', {}, '※ 원래 크기 = 100%'),
    );
    const area = el('div', { class: 'machine-area' });
    const msg = el('div', { class: 'partner-line' }, '전선이 다 빠져 있다. 스티커를 보고 꽂아 보자.');
    const keys = el('div', { class: 'keys-hint' });

    const renderWires = () => {
      area.innerHTML = '';
      const left = el('div', { class: 'wire-col' });
      WIRES.forEach((w, i) => {
        const b = button(`${i + 1}. ${WIRE_NAMES[w]} 선${conn[w] ? ` → ${PORT_NAMES[conn[w]!]}` : ''}`, () => ((heldWire = w), renderWires()), `btn wire ${w}` + (heldWire === w ? ' held' : ''));
        left.append(b);
      });
      const right = el('div', { class: 'wire-col' });
      // 꽂는 곳 순서는 일부러 섞어 둔다
      (['size', 'ground', 'power'] as Port[]).forEach((pt, i) => {
        const owner = WIRES.find((w) => conn[w] === pt);
        right.append(button(`${'ABC'[i]}. ${PORT_NAMES[pt]}${owner ? ` (${WIRE_NAMES[owner]})` : ''}`, () => plug(pt), 'btn port'));
      });
      area.append(left, el('div', { class: 'wire-arrow' }, '→'), right);
      keys.textContent = '선(1~3)을 고르고 꽂을 곳(A~C)을 고르세요. 마우스로 눌러도 돼요.';
    };
    const plug = (pt: Port) => {
      if (!heldWire) {
        msg.textContent = '먼저 전선을 골라요.';
        return;
      }
      for (const w of WIRES) if (conn[w] === pt) delete conn[w];
      conn[heldWire] = pt;
      heldWire = null;
      ctx.sfx.place();
      renderWires();
      if (WIRES.every((w) => conn[w])) {
        if (wiresCorrect(conn)) {
          ctx.sfx.chime();
          msg.textContent = '띠링! 화면이 켜졌다: 「돈가스 크기 1000%」';
          setTimeout(renderDial, 700);
        } else {
          ctx.sfx.oops();
          const wrong = WIRES.filter((w) => conn[w] !== WIRE_RULE[w]).length;
          msg.textContent = `치직… 안 켜진다. ${wrong}개가 잘못 꽂힌 것 같다. 스티커를 다시 보자.`;
        }
      }
    };

    const renderDial = () => {
      area.innerHTML = '';
      const screen = el('div', { class: 'machine-screen' }, el('div', { class: 'machine-value' }, `${value}%`), el('div', { class: 'machine-hist' }, history.join(' → ') || '목표: 100%'));
      const ops = el('div', { class: 'row center' });
      (Object.keys(MACHINE_OPS) as MachineOp[]).forEach((op, i) => ops.append(button(`${i + 1}. ${MACHINE_OPS[op].label}`, () => void apply(op), 'btn big')));
      ops.append(button('R. 처음으로', reset, 'btn'));
      area.append(screen, ops);
      keys.textContent = '1~4: 버튼 · R: 처음으로 (1000%)';
    };
    const reset = () => {
      value = MACHINE_START;
      history.length = 0;
      msg.textContent = '다시 1000%. 천천히 계산해 보자.';
      ctx.sfx.blip();
      renderDial();
    };
    const apply = async (op: MachineOp) => {
      if (ok || !WIRES.every((w) => conn[w] === WIRE_RULE[w])) return;
      value = machineApply(value, op);
      history.push(MACHINE_OPS[op].label);
      ctx.sfx.blip();
      renderDial();
      const r = machineCheck(value);
      if (r === 'exact') {
        ok = true;
        ctx.sfx.success();
        msg.textContent = '「100% — 원래 크기로 복원합니다」 위이잉~';
        await wait(1500);
        p.close();
      } else if (r === 'tooSmall') {
        msg.textContent = value === 0 ? '돈가스가… 사라졌다?! (R로 되돌리자)' : '너무 작아졌다! R로 되돌리자.';
        onTooSmall();
      } else if (value > 5000) {
        msg.textContent = '으악, 점점 커진다! R로 되돌리자.';
      } else msg.textContent = `${value}%… 아직 크다.`;
    };

    p.body.append(el('div', { class: 'machine-wrap' }, sticker, area), msg, keys);
    p.onKey((e) => {
      if (e.repeat) return;
      const onDial = WIRES.every((w) => conn[w] === WIRE_RULE[w]);
      const n = Number(e.key);
      if (!onDial) {
        if (n >= 1 && n <= 3) (heldWire = WIRES[n - 1]), renderWires();
        const pi = 'abc'.indexOf(e.key.toLowerCase());
        if (pi >= 0) plug((['size', 'ground', 'power'] as Port[])[pi]);
      } else {
        if (n >= 1 && n <= 4) void apply((Object.keys(MACHINE_OPS) as MachineOp[])[n - 1]);
        if (e.code === 'KeyR') reset();
      }
    });
    renderWires();
    void PORTS;
  });
}

export const ANNOUNCE_CARDS = [
  '딩동댕동~ 지금 급식실에서 「거대 돈가스 축제」를 엽니다!',
  '한 줄로 서서 차례대로 한 조각씩 받아 가세요.',
  '천천히 꼭꼭 씹어 먹기! 다 같이 맛있게 먹어요!',
];

/** 축제 안내 방송. 세 문장을 순서대로 고르면 결과 */
export function openAnnounce(ctx: UiCtx, me: string): Promise<{ good: boolean } | null> {
  return new Promise((resolve) => {
    let res: { good: boolean } | null = null;
    const p = new Panel(ctx.layer, { title: '방송실 마이크 — 축제 안내 방송', wide: true, onClose: () => resolve(res) });
    const order: number[] = [];
    const shuffled = [1, 2, 0];
    const list = el('div', { class: 'cards' });
    const said = el('div', { class: 'info-lines' });
    const msg = el('div', { class: 'keys-hint' }, '방송할 문장을 차례대로 골라요 (1~3, 또는 클릭). Backspace: 다시');
    const render = () => {
      list.innerHTML = '';
      shuffled.forEach((ci, i) => {
        if (order.includes(ci)) return;
        list.append(button(`${i + 1}. ${ANNOUNCE_CARDS[ci]}`, () => void pick(ci), 'card'));
      });
      said.innerHTML = '';
      order.forEach((ci, k) => said.append(el('div', { class: 'info-line' }, `${k + 1}) ${ANNOUNCE_CARDS[ci]}`)));
    };
    const pick = async (ci: number) => {
      if (order.includes(ci) || res) return;
      order.push(ci);
      ctx.sfx.blip();
      render();
      if (order.length === 3) {
        res = { good: order.join() === '0,1,2' };
        msg.textContent = res.good ? `${me}의 목소리가 학교에 울려 퍼진다!` : '순서가 좀 뒤죽박죽이지만… 다들 알아들은 것 같다!';
        ctx.sfx.chime();
        await wait(1600);
        p.close();
      }
    };
    p.body.append(said, list, msg);
    p.onKey((e) => {
      if (e.repeat) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 3) void pick(shuffled[n - 1]);
      if (e.key === 'Backspace' && !res) (order.length = 0), render();
    });
    render();
  });
}
