import { describe, expect, it } from 'vitest';
import { CHATTER, ChatPicker, type ChatCtx, type ChatNpc, type ChatPeriod } from '../src/data/chatter';

const ctx: ChatCtx = { flag: () => false, role: null, planeBest: 0, rpsGames: 0 };
const NPCS = Object.keys(CHATTER) as ChatNpc[];
const PERIODS: ChatPeriod[] = ['arrival', 'korean', 'break', 'math', 'group', 'art', 'lunch'];

describe('반 친구 잡담', () => {
  it('친구마다 교시별로 4개 이상', () => {
    for (const n of NPCS) for (const p of PERIODS) expect(CHATTER[n].lines[p].any.length).toBeGreaterThanOrEqual(4);
  });
  it('같은 친구에게 연달아 말을 걸어도 바로 같은 말을 반복하지 않는다', () => {
    const pk = new ChatPicker(90, 5);
    const said: string[] = [];
    for (let i = 0; i < 4; i++) said.push(pk.pick('minjae', 'arrival', 'during', ctx, i)!);
    expect(new Set(said).size).toBe(4);
  });
  it('교시가 바뀌면 그 교시 대사로 바뀐다', () => {
    const pk = new ChatPicker();
    const a = pk.pick('seoa', 'math', 'before', ctx, 0)!;
    const mathPool = [...CHATTER.seoa.lines.math.any, ...(CHATTER.seoa.lines.math.before ?? [])];
    expect(mathPool).toContain(a);
  });
  it('앞선 행동이 있으면 그에 맞는 말도 나온다', () => {
    const pk = new ChatPicker();
    const c: ChatCtx = { ...ctx, flag: (f) => f === 'pencilReturned' };
    const lines = new Set<string>();
    for (let i = 0; i < 8; i++) lines.add(pk.pick('junho', 'art', 'during', c, i * 100)!);
    expect([...lines].some((l) => l.includes('필통'))).toBe(true);
  });
});
