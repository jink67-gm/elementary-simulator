import * as THREE from 'three';
import { formatObjective } from './objectiveFormat';
import { el } from './dom';
import { itemDef, type ItemId } from '../data/items';
import { SLOT_COUNT } from '../player/Inventory';

interface Bubble {
  node: HTMLElement;
  anchor: () => THREE.Vector3;
  /** 말하는 사람 이름 (같은 사람 말풍선은 하나만) */
  name: string;
  until: number;
}

export class Hud {
  root = el('div', { class: 'hud hidden' });
  private objective = el('div', { class: 'objective' });
  private objText = el('div', { class: 'obj-text' });
  private objDetail = el('div', { class: 'obj-detail' });
  private objRaw = '';
  private clock = el('div', { class: 'clock' });
  private clockPeriod = el('div', { class: 'clock-period' });
  private clockTime = el('div', { class: 'clock-time' });
  private clockTimer = el('div', { class: 'clock-timer hidden' });
  private prompt = el('div', { class: 'prompt hidden' });
  private inv = el('div', { class: 'inventory' });
  private invDesc = el('div', { class: 'inv-desc hidden' });
  private toastBox = el('div', { class: 'toasts' });
  private bubbleLayer = el('div', { class: 'bubbles' });
  private help = el('div', { class: 'help' });
  private lockHint = el('div', { class: 'lock-hint hidden' }, '화면을 클릭하면 마우스·터치패드로 둘러볼 수 있어요 (방향키도 돼요)');
  private bubbles: Bubble[] = [];
  invOpen = false;
  /** 터치: 소지품 칸을 톡 */
  onSlotTap: (i: number) => void = () => {};

  constructor(parent: HTMLElement) {
    this.objective.append(el('div', { class: 'obj-label' }, '지금 할 일'), this.objText, this.objDetail);
    this.clock.append(this.clockPeriod, this.clockTime, this.clockTimer);
    this.help.innerHTML =
      '<span class="help-kb"><b>WASD</b> 이동 · <b>Shift</b> 달리기 · <b>마우스</b> 둘러보기 · <b>E</b> 조사·줍기·대화 · <b>F</b> 사용·놓기 · <b>1~4</b> 소지품 · <b>Tab</b> 설명 · <b>Esc</b> 메뉴</span>' +
      '<span class="help-touch">왼쪽 끌기 <b>이동</b> · 오른쪽 끌기 <b>둘러보기</b> · 두 손가락 <b>확대</b> · 소지품 톡 <b>고르기</b></span>';
    this.root.append(this.bubbleLayer, this.objective, this.clock, this.prompt, this.inv, this.invDesc, this.toastBox, this.help, this.lockHint);
    parent.append(this.root);
  }

  show(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }

  setObjective(text: string) {
    if (this.objRaw === text) return;
    this.objRaw = text;
    // 긴 문장은 본문 + 길 순서(칩) + 할 일 목록 + 메모로 나눠 보여 준다
    const p = formatObjective(text);
    this.objText.textContent = p.main;
    this.objDetail.innerHTML = '';
    if (p.route.length) {
      const r = el('div', { class: 'obj-route' });
      p.route.forEach((step, i) => {
        if (i) r.append(el('span', { class: 'obj-arrow' }, '›'));
        r.append(el('span', { class: 'obj-step' + (i === p.route.length - 1 ? ' last' : '') }, step));
      });
      this.objDetail.append(r);
    }
    if (p.list.length) this.objDetail.append(el('ul', { class: 'obj-list' }, ...p.list.map((x) => el('li', {}, x))));
    if (p.note) this.objDetail.append(el('div', { class: 'obj-note' }, p.note));
    this.objective.classList.remove('flash');
    void this.objective.offsetWidth;
    this.objective.classList.add('flash');
  }

  get objectiveText() {
    return this.objRaw;
  }

  setClock(period: string, time: string) {
    this.clockPeriod.textContent = period;
    this.clockTime.textContent = time;
  }

  setTimer(sec: number | null) {
    this.clockTimer.classList.toggle('hidden', sec === null);
    if (sec !== null) this.clockTimer.textContent = `종 치기까지 ${Math.ceil(sec)}초`;
  }

  setPrompt(e: string | null, f: string | null, screen: { x: number; y: number } | null) {
    if ((!e && !f) || !screen) {
      this.prompt.classList.add('hidden');
      return;
    }
    this.prompt.classList.remove('hidden');
    this.prompt.innerHTML = '';
    if (e) this.prompt.append(el('div', { class: 'p-row' }, el('span', { class: 'key' }, 'E'), e));
    if (f) this.prompt.append(el('div', { class: 'p-row' }, el('span', { class: 'key key-f' }, 'F'), f));
    this.prompt.style.transform = `translate(${Math.round(screen.x)}px, ${Math.round(screen.y)}px) translate(-50%, -100%)`;
  }

  setInventory(slots: (ItemId | null)[], selected: number) {
    this.inv.innerHTML = '';
    for (let i = 0; i < SLOT_COUNT; i++) {
      const id = slots[i];
      const slot = el('div', { class: 'slot' + (i === selected ? ' sel' : '') + (id ? '' : ' empty') });
      slot.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.onSlotTap(i);
      });
      slot.append(el('span', { class: 'slot-key' }, String(i + 1)));
      if (id) {
        const d = itemDef(id);
        const sw = el('span', { class: 'swatch' });
        sw.style.background = '#' + d.color.toString(16).padStart(6, '0');
        slot.append(sw, el('span', { class: 'slot-name' }, d.name));
      }
      this.inv.append(slot);
    }
    const held = slots[selected];
    this.invDesc.textContent = held ? `${itemDef(held).name} — ${itemDef(held).desc}` : '손이 비어 있어요.';
  }

  toggleInventoryDesc(force?: boolean) {
    this.invOpen = force ?? !this.invOpen;
    this.invDesc.classList.toggle('hidden', !this.invOpen);
  }

  toast(text: string, kind: 'info' | 'good' | 'warn' = 'info', ms = 2600) {
    const t = el('div', { class: `toast ${kind}` }, text);
    this.toastBox.append(t);
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
    while (this.toastBox.children.length > 3) this.toastBox.firstElementChild?.remove();
  }

  /** NPC 머리 위 말풍선 (짧은 혼잣말) */
  bubble(name: string, text: string, anchor: () => THREE.Vector3, ms = 3200) {
    // 같은 사람의 앞 말풍선은 지운다 (anchor 함수는 부를 때마다 새로 만들어지므로 이름으로 찾는다)
    for (const old of this.bubbles.filter((b) => b.anchor === anchor || b.name === name)) {
      old.node.remove();
      this.bubbles.splice(this.bubbles.indexOf(old), 1);
    }
    const node = el('div', { class: 'bubble' }, el('b', {}, name + ':'), ' ', text);
    this.bubbleLayer.append(node);
    this.bubbles.push({ node, anchor, name, until: performance.now() + ms });
  }

  showLockHint(v: boolean) {
    this.lockHint.classList.toggle('hidden', !v);
  }

  /**
   * 말풍선 자리: 머리 위에 붙이되 ① 서로 겹치면 위로 밀고 ② 대화창(이름표 포함)과 겹치면 대화창 위로 올린다.
   * 대화창에서 지금 말하는 사람의 말풍선은 숨긴다 (같은 말이 두 군데 보이지 않게)
   */
  updateBubbles(cam: THREE.Camera, w: number, h: number, avoid: DOMRect | null = null, speaking = '') {
    const now = performance.now();
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    const host = this.bubbleLayer.getBoundingClientRect();
    const box = avoid ? { l: avoid.left - host.left - 8, r: avoid.right - host.left + 8, t: avoid.top - host.top - 30, b: avoid.bottom - host.top } : null;
    // 물건·사람 앞 「E …」 안내도 가리지 않게 (먼저 자리를 차지)
    if (!this.prompt.classList.contains('hidden')) {
      const pr = this.prompt.getBoundingClientRect();
      if (pr.width > 0) placed.push({ l: pr.left - host.left - 4, r: pr.right - host.left + 4, t: pr.top - host.top - 4, b: pr.bottom - host.top + 4 });
    }
    const items: { b: Bubble; x: number; y: number; z: number }[] = [];
    this.bubbles = this.bubbles.filter((b) => {
      if (now > b.until) {
        b.node.remove();
        return false;
      }
      const p = b.anchor().clone().project(cam);
      const vis = p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 && !(speaking && b.name === speaking);
      b.node.style.display = vis ? '' : 'none';
      if (vis) items.push({ b, x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h, z: p.z });
      return true;
    });
    // 가까운(화면 앞) 말풍선부터 자리를 잡는다
    items.sort((a, c) => a.z - c.z);
    const hit = (r: { l: number; r: number; t: number; b: number }, o: { l: number; r: number; t: number; b: number }) => r.l < o.r && r.r > o.l && r.t < o.b && r.b > o.t;
    for (const it of items) {
      const bw = it.b.node.offsetWidth || 160, bh = (it.b.node.offsetHeight || 34) + 8;
      let y = it.y;
      for (let k = 0; k < 12; k++) {
        const r = { l: it.x - bw / 2, r: it.x + bw / 2, t: y - bh, b: y };
        const other = placed.find((o) => hit(r, o)) ?? (box && hit(r, box) ? box : null);
        if (!other) break;
        y = other.t - 2; // 겹친 것 위로
      }
      if (y - bh < 0) {
        it.b.node.style.display = 'none'; // 화면 위로 밀려나면 숨김
        continue;
      }
      placed.push({ l: it.x - bw / 2, r: it.x + bw / 2, t: y - bh, b: y });
      it.b.node.style.transform = `translate(${it.x}px, ${y}px) translate(-50%, -100%)`;
    }
  }

}
