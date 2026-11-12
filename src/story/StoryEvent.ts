// 점심 이후 사건(돈가스·청소 로봇·피구공·복도)이 공통으로 갖는 진입점. Morning이 교시에 맞는 사건으로 넘겨준다.
import type { MainNpcId } from '../core/Game';
import type { ItemId } from '../data/items';
import type { Npc } from '../npc/Npc';

export interface StoryEvent {
  begin(fromLoad: boolean): void;
  /** 주요 인물 대화. 처리했으면 true */
  talk(id: MainNpcId): boolean;
  fillerTalk(i: number): boolean;
  /** 들고 있는 물건으로 인물에게 F */
  usePromptOn(npc: Npc, item: ItemId | null): string | null;
  useOn(npc: Npc): void;
  canPickup(id: ItemId, key: string): string | null;
  onPickup(id: ItemId, key: string): void;
  onDropped(id: ItemId, key: string): void;
  requiredItems(): ItemId[];
  onSoftLimit(): Promise<void>;
  hint(t: number): void;
  /** 매 프레임 (실제 흐른 초) */
  update?(dt: number): void;
  recap(): string[];
  /** 막혔을 때 「자리로 돌아가기」 */
  returnSpot(): [number, number, number];
}
