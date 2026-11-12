import type { ItemId } from '../data/items';

export const SLOT_COUNT = 4;

/** 소지품 4칸. 선택된 칸의 물건을 손에 든다. 순수 로직. */
export class Inventory {
  slots: (ItemId | null)[] = new Array(SLOT_COUNT).fill(null);
  selected = 0;
  onChange: () => void = () => {};

  load(items: ItemId[]) {
    this.slots = new Array(SLOT_COUNT).fill(null);
    items.slice(0, SLOT_COUNT).forEach((it, i) => (this.slots[i] = it));
    this.selected = 0;
    this.onChange();
  }

  list(): ItemId[] {
    return this.slots.filter((s): s is ItemId => s !== null);
  }

  get held(): ItemId | null {
    return this.slots[this.selected];
  }

  has(id: ItemId): boolean {
    return this.slots.includes(id);
  }

  isFull(): boolean {
    return !this.slots.includes(null);
  }

  /** 빈칸에 넣고 그 칸을 선택한다. 꽉 차면 false. */
  add(id: ItemId): boolean {
    const i = this.held === null ? this.selected : this.slots.indexOf(null);
    if (i < 0) return false;
    this.slots[i] = id;
    this.selected = i;
    this.onChange();
    return true;
  }

  /** 해당 물건 하나를 뺀다(선택된 칸 우선). */
  remove(id: ItemId): boolean {
    let i = this.held === id ? this.selected : this.slots.indexOf(id);
    if (i < 0) return false;
    this.slots[i] = null;
    this.onChange();
    return true;
  }

  select(i: number) {
    if (i < 0 || i >= SLOT_COUNT) return;
    this.selected = i;
    this.onChange();
  }

  cycle(dir: 1 | -1) {
    this.select((this.selected + dir + SLOT_COUNT) % SLOT_COUNT);
  }
}
