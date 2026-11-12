import type { NpcDef } from '../npc/Npc';
import type { Look } from '../world/Character';

export const CAST: Record<'teacher' | 'minjae' | 'seoa' | 'junho' | 'harin', NpcDef> = {
  teacher: {
    id: 'teacher',
    name: '담임 선생님',
    look: { skin: 0xf1c9a5, hair: 0x2a1a12, shirt: 0x9bc4a8, pants: 0x3d405b, hairStyle: 'bob', height: 1.28, glasses: true },
  },
  minjae: {
    id: 'minjae',
    name: '민재',
    look: { skin: 0xf3c89f, hair: 0x1c1c1c, shirt: 0xff595e, pants: 0x1d3557, hairStyle: 'short', height: 1.02 },
  },
  seoa: {
    id: 'seoa',
    name: '서아',
    look: { skin: 0xf6d2b0, hair: 0x3b2417, shirt: 0xffffff, pants: 0x6a4c93, hairStyle: 'long', height: 0.98, glasses: true },
  },
  junho: {
    id: 'junho',
    name: '준호',
    look: { skin: 0xe2ad83, hair: 0x22160f, shirt: 0x1982c4, pants: 0x2b2d42, hairStyle: 'buzz', height: 1.06 },
  },
  harin: {
    id: 'harin',
    name: '하린',
    look: { skin: 0xf7d4b8, hair: 0x5a3825, shirt: 0xffca3a, pants: 0x386641, hairStyle: 'pony', height: 0.99 },
  },
};

const SHIRTS = [0x8ac926, 0xf15bb5, 0x00bbf9, 0xfee440, 0x9b5de5, 0xff924c, 0x52b788, 0xe76f51, 0x4cc9f0, 0xb5838d];
const HAIRS: Look['hairStyle'][] = ['short', 'bob', 'buzz', 'long', 'pony'];

/** 반 친구들 (배경 인물) */
export function fillerLook(i: number): Look {
  return {
    skin: [0xf5cfa8, 0xeac09a, 0xf7d6b5, 0xe2b48c][i % 4],
    hair: [0x1c1c1c, 0x2b1d14, 0x3a2618][i % 3],
    shirt: SHIRTS[i % SHIRTS.length],
    pants: [0x2d3142, 0x34495e, 0x4a4e69][i % 3],
    hairStyle: HAIRS[i % HAIRS.length],
    height: 0.95 + ((i * 37) % 10) / 100,
  };
}

export const FILLER_NAMES = ['지우', '도현', '예린', '시우', '유나', '건우', '수아', '태윤', '나은', '우진'];
