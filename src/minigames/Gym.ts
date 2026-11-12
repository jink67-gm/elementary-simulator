// 사건 3 체육관 창: 발사대 각도·힘 맞추기, 새 경기 규칙 카드
import { Panel } from '../ui/Panel';
import { el, button } from '../ui/dom';
import type { UiCtx } from './Textbook';
import { BALL_R, BALL_START, GYM, OBSTACLES, RULE_CARDS, STORAGE_OPEN, launchVelocity, rulesOk, simulateLaunch } from '../story/dodgeLogic';

/** 발사 설정. showPath면 예상 경로를 점선으로 보여 준다(여러 번 실패했을 때 힌트) */
export function openLauncher(ctx: UiCtx, start: { angle: number; power: number }, showPath: boolean): Promise<{ angle: number; power: number } | null> {
  return new Promise((resolve) => {
    let res: { angle: number; power: number } | null = null;
    let angle = start.angle;
    let power = start.power;
    const p = new Panel(ctx.layer, { title: '거대 피구공 발사대 — 공 창고로 굴려 보내기', wide: true, onClose: () => resolve(res) });
    const W = 480, H = 420;
    const cv = el('canvas', { class: 'gym-map', width: String(W), height: String(H) });
    const info = el('div', { class: 'partner-line' });
    const sx = (x: number) => ((x - (GYM.minX - 2.6)) / (GYM.maxX - GYM.minX + 2.8)) * W;
    const sz = (z: number) => ((z - GYM.minZ) / (GYM.maxZ - GYM.minZ)) * H;
    const draw = () => {
      const c = cv.getContext('2d');
      if (!c) return;
      c.fillStyle = '#e9c48f';
      c.fillRect(0, 0, W, H);
      // 창고
      c.fillStyle = '#9c8466';
      c.fillRect(sx(GYM.minX - 2.6), sz(STORAGE_OPEN.minZ), sx(GYM.minX) - sx(GYM.minX - 2.6), sz(STORAGE_OPEN.maxZ) - sz(STORAGE_OPEN.minZ));
      c.fillStyle = '#3a86ff';
      c.fillRect(sx(GYM.minX) - 4, sz(STORAGE_OPEN.minZ), 8, sz(STORAGE_OPEN.maxZ) - sz(STORAGE_OPEN.minZ));
      c.fillStyle = '#fff';
      c.font = 'bold 15px sans-serif';
      c.fillText('공 창고', 6, sz((STORAGE_OPEN.minZ + STORAGE_OPEN.maxZ) / 2) + 5);
      // 벽
      c.strokeStyle = '#243447';
      c.lineWidth = 4;
      c.strokeRect(sx(GYM.minX), sz(GYM.minZ), sx(GYM.maxX) - sx(GYM.minX), sz(GYM.maxZ) - sz(GYM.minZ));
      // 뜀틀
      c.fillStyle = '#b5835a';
      for (const o of OBSTACLES) c.fillRect(sx(o.minX), sz(o.minZ), sx(o.maxX) - sx(o.minX), sz(o.maxZ) - sz(o.minZ));
      c.fillStyle = '#243447';
      c.fillText('뜀틀', sx(OBSTACLES[0].minX) - 4, sz(OBSTACLES[0].maxZ) + 16);
      // 공
      c.fillStyle = 'rgba(230,57,70,0.85)';
      c.beginPath();
      c.arc(sx(BALL_START.x), sz(BALL_START.z), (BALL_R / (GYM.maxX - GYM.minX + 2.8)) * W, 0, Math.PI * 2);
      c.fill();
      // 예상 경로(힌트)
      if (showPath) {
        const r = simulateLaunch(angle, power);
        c.strokeStyle = 'rgba(36,52,71,0.55)';
        c.setLineDash([6, 6]);
        c.lineWidth = 2;
        c.beginPath();
        r.path.forEach((q, i) => (i ? c.lineTo(sx(q.x), sz(q.z)) : c.moveTo(sx(q.x), sz(q.z))));
        c.stroke();
        c.setLineDash([]);
      }
      // 방향 화살표 (길이 = 힘)
      const v = launchVelocity(angle, power);
      const len = 0.5 + power * 0.28;
      const ex = BALL_START.x + (v.vx / Math.hypot(v.vx, v.vz)) * len, ez = BALL_START.z + (v.vz / Math.hypot(v.vx, v.vz)) * len;
      c.strokeStyle = '#ff006e';
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(sx(BALL_START.x), sz(BALL_START.z));
      c.lineTo(sx(ex), sz(ez));
      c.stroke();
      info.textContent = `각도 ${angle > 0 ? '북쪽으로 ' : angle < 0 ? '남쪽으로 ' : ''}${Math.abs(angle)}° · 힘 ${power}/10`;
    };
    const set = (da: number, dp: number) => {
      angle = Math.max(-45, Math.min(60, angle + da));
      power = Math.max(1, Math.min(10, power + dp));
      ctx.sfx.blip();
      draw();
    };
    const go = () => {
      res = { angle, power };
      ctx.sfx.whoosh();
      p.close();
    };
    p.body.append(
      el('div', { class: 'gym-wrap' }, cv),
      info,
      el('div', { class: 'row center' },
        button('A 북쪽으로', () => set(5, 0), 'btn'),
        button('D 남쪽으로', () => set(-5, 0), 'btn'),
        button('W 힘 +', () => set(0, 1), 'btn'),
        button('S 힘 −', () => set(0, -1), 'btn'),
        button('발사! (Space)', go, 'btn primary big'),
      ),
      el('div', { class: 'keys-hint' }, showPath ? '점선: 친구들이 같이 계산해 준 예상 경로' : '분홍 화살표 방향으로 밀어요. 뜀틀을 피해서 파란 입구로!'),
    );
    p.onKey((e) => {
      if (e.repeat && e.code === 'Space') return;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') set(5, 0);
      else if (e.code === 'KeyD' || e.code === 'ArrowRight') set(-5, 0);
      else if (e.code === 'KeyW' || e.code === 'ArrowUp') set(0, 1);
      else if (e.code === 'KeyS' || e.code === 'ArrowDown') set(0, -1);
      else if (e.code === 'Space') {
        e.preventDefault();
        go();
      }
    });
    draw();
  });
}

/** 새 경기 규칙 카드 고르기 (세 장). 고른 id 목록 또는 null */
export function openRules(ctx: UiCtx, onUnsafe: () => void): Promise<string[] | null> {
  return new Promise((resolve) => {
    let res: string[] | null = null;
    const picked: string[] = [];
    const p = new Panel(ctx.layer, { title: '새 경기 규칙 만들기 — 카드 세 장', wide: true, onClose: () => resolve(res) });
    const list = el('div', { class: 'cards' });
    const msg = el('div', { class: 'partner-line' }, '1~5로 카드 고르기(다시 누르면 빼기) · Enter: 이 규칙으로 하자!');
    const render = () => {
      list.innerHTML = '';
      RULE_CARDS.forEach((c, i) => list.append(button(`${i + 1}. ${c.text}`, () => toggle(c.id), 'card' + (picked.includes(c.id) ? ' held' : ''))));
    };
    const toggle = (id: string) => {
      const i = picked.indexOf(id);
      if (i >= 0) picked.splice(i, 1);
      else if (picked.length < 3) picked.push(id);
      ctx.sfx.blip();
      render();
    };
    const confirm = () => {
      const r = rulesOk(picked);
      if (r === 'ok') {
        res = [...picked];
        ctx.sfx.success();
        p.close();
        return;
      }
      ctx.sfx.oops();
      if (r === 'unsafe') {
        msg.textContent = '선생님: 「친구 맞히기」는 안 돼요! 저 공에 맞으면 진짜 날아가요. 다른 카드로!';
        onUnsafe();
      } else if (r === 'needGoals') msg.textContent = '어디에 넣어야 이기는 거야? 골대 카드가 있어야 해!';
      else msg.textContent = '카드를 세 장 골라 주세요.';
    };
    p.body.append(list, msg, el('div', { class: 'row center' }, button('이 규칙으로 하자! (Enter)', confirm, 'btn primary')));
    p.onKey((e) => {
      if (e.repeat) return;
      const n = Number(e.key);
      if (n >= 1 && n <= RULE_CARDS.length) toggle(RULE_CARDS[n - 1].id);
      else if (e.key === 'Enter') confirm();
    });
    render();
  });
}
