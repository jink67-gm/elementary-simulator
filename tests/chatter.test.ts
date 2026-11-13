import { describe, expect, it } from 'vitest';
import { CHATTER, ChatPicker, type ChatCtx, type ChatNpc, type ChatPeriod } from '../src/data/chatter';

const ctx: ChatCtx = { flag: () => false, role: null, planeBest: 0, rpsGames: 0 };
const NPCS = Object.keys(CHATTER) as ChatNpc[];
const PERIODS: ChatPeriod[] = ['arrival', 'korean', 'break', 'math', 'group', 'art', 'lunch'];

describe('반 친구 잡담', () => {
  it('친구마다 교시별로 4개 이상', () => {
    for (const n of NPCS) for (const p of PERIODS) expect(CHATTER[n].lines[p].any.length).toBeGreaterThanOrEqual(4);
  });
  it('같은 친구에게 다시 말을 걸어도 최근에 한 말은 바로 반복하지 않는다', () => {
    const pk = new ChatPicker(90, 5);
    const said: string[] = [];
    for (const t of [0, 41, 82]) said.push(pk.pick('minjae', 'arrival', 'during', ctx, t)!); // 41초 간격 = 연달아(40초) 아님, 최근 대사 제외(90초) 안
    expect(new Set(said).size).toBe(3);
  });
  it('같은 친구에게 3번째부터는 「왜? 무슨 할 말 있어?」 같은 반응 (친구마다 다름)', () => {
    const pk = new ChatPicker();
    pk.pick('minjae', 'break', 'during', ctx, 0);
    pk.pick('minjae', 'break', 'during', ctx, 1);
    const third = pk.pick('minjae', 'break', 'during', ctx, 2)!;
    expect(['왜? 무슨 할 말 있어?', '응? 왜 자꾸 불러ㅋㅋ']).toContain(third);
    const pk2 = new ChatPicker();
    for (let i = 0; i < 2; i++) pk2.pick('filler1', 'break', 'during', ctx, i);
    expect(pk2.pick('filler1', 'break', 'during', ctx, 2)).not.toBe(third);
    // 다른 친구에게 말을 걸면 처음부터
    pk.pick('seoa', 'break', 'during', ctx, 3);
    const back = pk.pick('minjae', 'break', 'during', ctx, 4)!;
    expect(CHATTER.minjae.lines.break.any.concat(CHATTER.minjae.extras.map((e) => e.line))).toContain(back);
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
    for (let i = 0; i < 8; i++) lines.add(pk.pick('junho', 'art', 'during', c, i * 100)!); // 100초 간격 = 연달아가 아님
    expect([...lines].some((l) => l.includes('필통'))).toBe(true);
  });
});
