// 메는 책가방: 실제 모델은 props/backpack.ts ('worn' 상태 — 끈이 어깨를 감는다)
import type * as THREE from 'three';
import { buildBackpack } from './props/backpack';

export function makeBackpack(color = 0x3f6fd8): THREE.Group {
  return buildBackpack('worn', color);
}
