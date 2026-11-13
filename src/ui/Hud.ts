import * as THREE from 'three';
import { el } from './dom';
import { itemDef, type ItemId } from '../data/items';
import { SLOT_COUNT } from '../player/Inventory';

interface Bubble {
  node: HTMLElement;
  anchor: () => THREE.Vector3;
  until: number;
}

export class Hud {
  root = el('div', { class: 'hud hidden' });
  private objective = el('div', { class: 'objective' });
  private objText = el('div', { class: 'obj-text' });
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
    this.objective.append(el('div', { class: 'obj-label' }, '지금 할 일'), this.objText);
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
    if (this.objText.textContent === text) return;
    this.objText.textContent = text;
    this.objective.classList.remove('flash');
    void this.objective.offsetWidth;
    this.objective.classList.add('flash');
  }

  get objectiveText() {
    return this.objText.textContent ?? '';
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
    const old = this.bubbles.find((b) => b.anchor === anchor);
    if (old) {
      old.node.remove();
      this.bubbles.splice(this.bubbles.indexOf(old), 1);
    }
    const node = el('div', { class: 'bubble' }, el('b', {}, name + ':'), ' ', text);
    this.bubbleLayer.append(node);
    this.bubbles.push({ node, anchor, until: performance.now() + ms });
  }

  showLockHint(v: boolean) {
    this.lockHint.classList.toggle('hidden', !v);
  }

  updateBubbles(cam: THREE.Camera, w: number, h: number) {
    const now = performance.now();
    this.bubbles = this.bubbles.filter((b) => {
      if (now > b.until) {
        b.node.remove();
        return false;
      }
      const p = b.anchor().clone().project(cam);
      const vis = p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
      b.node.style.display = vis ? '' : 'none';
      if (vis) b.node.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) translate(-50%, -100%)`;
      return true;
    });
  }
}
