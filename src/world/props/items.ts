// 퀘스트·상호작용 소품의 실제 모델. 모두 원점 = 물건 가운데, 바닥 = -size[1]/2 (data/items.ts의 크기와 맞춘다).
// 같은 물건은 모양·재질·그림을 캐시로 나눠 쓴다. 상태가 있는 물건은 userData의 함수로 바꾼다:
//   태블릿 userData.setScreen('off'|'lock'|'quiz'), 책 userData.setOpen(bool), 카드 userData.anim(t) (선택 가능 표시)
import * as THREE from 'three';
import { add, box, canvasTex, compact, cyl, fabric, flatPlane, font, geo, liveTex, mat, rbox, rnd, roundRect, roundSlab, std, tube } from './kit';
import { drawKidPoster, type PosterArt } from './posterArt';

// ───────────────────────── 태블릿 ─────────────────────────
export type ScreenMode = 'off' | 'lock' | 'quiz';

function screenMat(mode: ScreenMode, num: number): THREE.Material {
  if (mode === 'off') return std(0x0a0e15, 0.06, 0.3, { key: 'glass' });
  return mat(`screen|${mode}|${num}`, () => {
    const t = canvasTex(`screen|${mode}|${num}`, 384, 256, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, h);
      if (mode === 'lock') {
        gr.addColorStop(0, '#3a7bd5');
        gr.addColorStop(1, '#6fd3c2');
        c.fillStyle = gr;
        c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(255,255,255,0.18)';
        for (let i = 0; i < 6; i++) {
          c.beginPath();
          c.arc(40 + i * 70, 200 - (i % 2) * 40, 34 + (i % 3) * 10, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = '#fff';
        c.textAlign = 'center';
        c.font = font(64, 300);
        c.fillText('9:12', w / 2, 112);
        c.font = font(20, 600);
        c.fillText('11월 13일 월요일', w / 2, 144);
        c.font = font(18, 700);
        c.fillText(`우리초 학습용 태블릿 ${num}번`, w / 2, 226);
      } else {
        gr.addColorStop(0, '#fff3d6');
        gr.addColorStop(1, '#ffe1e8');
        c.fillStyle = gr;
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#ff7a4d';
        c.fillRect(0, 0, w, 40);
        c.fillStyle = '#fff';
        c.font = font(20, 800);
        c.textAlign = 'left';
        c.fillText('수학 퀴즈 · 2교시', 14, 27);
        c.textAlign = 'center';
        c.fillStyle = '#2b2d42';
        c.font = font(40, 800);
        c.fillText('3/4 + 1/8 = ?', w / 2, 112);
        const btn = (x: number, label: string, col: string) => {
          c.fillStyle = col;
          roundRect(c, x, 150, 100, 64, 14);
          c.fill();
          c.fillStyle = '#fff';
          c.font = font(30, 800);
          c.fillText(label, x + 50, 194);
        };
        btn(26, '7/8', '#3a86ff');
        btn(142, '4/12', '#06d6a0');
        btn(258, '1', '#ffbe0b');
      }
      // 상태 막대
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.font = font(13, 700);
      c.textAlign = 'right';
      c.fillText('82% ▮', w - 10, mode === 'quiz' ? 58 : 18);
    });
    return new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  });
}

export function buildTablet(mode: ScreenMode = 'off', num = 17, caseColor = 0x24406b): THREE.Group {
  const g = new THREE.Group();
  const caseM = std(caseColor, 0.85);
  // 보호 케이스 (뒤판 + 모서리 범퍼) + 본체 + 화면
  add(g, rbox(0.27, 0.014, 0.19, 0.012, 3), caseM, 0, -0.003, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, rbox(0.045, 0.02, 0.045, 0.01, 2), caseM, sx * 0.1125, 0, sz * 0.0725);
  add(g, rbox(0.252, 0.008, 0.172, 0.008, 2), std(0x15181d, 0.35, 0.4), 0, 0.006, 0);
  const scr = add(g, flatPlane(0.226, 0.148), screenMat(mode, num), 0, 0.0102, 0, 0, 0, 0, false);
  scr.userData.keep = true;
  add(g, cyl(0.0028, 0.0028, 0.0006, 10), std(0x30343c, 0.2, 0.6), 0.1185, 0.0102, 0); // 카메라
  add(g, box(0.014, 0.003, 0.004), std(0x5b6370, 0.3, 0.7), 0.06, 0.006, 0.0875); // 전원 버튼
  add(g, box(0.02, 0.003, 0.004), std(0x5b6370, 0.3, 0.7), 0.09, 0.006, 0.0875); // 음량
  // 뒤판 번호 스티커
  const tag = mat(`tabletTag|${num}`, () => new THREE.MeshStandardMaterial({ roughness: 0.6, map: canvasTex(`tabletTag|${num}`, 128, 64, (c, w, h) => {
    c.fillStyle = '#ffffff';
    roundRect(c, 2, 2, w - 4, h - 4, 10);
    c.fill();
    c.fillStyle = '#24406b';
    c.font = font(40, 800);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(`${num}`, w / 2, h / 2 + 2);
  }) }));
  add(g, flatPlane(0.05, 0.025), tag, 0, -0.0103, 0.05, Math.PI, 0, 0, false);
  g.userData.setScreen = (m: ScreenMode) => {
    scr.material = screenMat(m, num);
  };
  return compact(g);
}

// ───────────────────────── 교과서 ─────────────────────────
type BookKind = 'korean' | 'math' | 'activity';
const BOOK: Record<BookKind, { title: string; sub: string; col: string; dark: number; light: number }> = {
  korean: { title: '국어', sub: '6-2 ㉯', col: '#f08c3a', dark: 0xd8722c, light: 0xfbe2c8 },
  math: { title: '수학', sub: '6-2', col: '#3a86ff', dark: 0x2a6ad8, light: 0xd8e7ff },
  activity: { title: '국어 활동', sub: '6-2', col: '#2a9d8f', dark: 0x1f7f73, light: 0xd2efe9 },
};

function coverTex(kind: BookKind) {
  const b = BOOK[kind];
  return canvasTex(`cover|${kind}`, 380, 520, (c, w, h) => {
    c.fillStyle = '#fffaf2';
    c.fillRect(0, 0, w, h);
    c.fillStyle = b.col;
    c.fillRect(0, 0, w, 150);
    // 그림: 언덕 + 나무 + 책 읽는 아이들
    const gr = c.createLinearGradient(0, 150, 0, 430);
    gr.addColorStop(0, '#cfe9ff');
    gr.addColorStop(1, '#fdfcf5');
    c.fillStyle = gr;
    c.fillRect(0, 150, w, 280);
    c.fillStyle = '#9ed36a';
    c.beginPath();
    c.ellipse(w * 0.35, 470, 260, 110, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#7bbf4e';
    c.beginPath();
    c.ellipse(w * 0.85, 480, 200, 100, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#8b5a3c';
    c.fillRect(w * 0.7, 270, 18, 110);
    c.fillStyle = '#4caf50';
    c.beginPath();
    c.arc(w * 0.7 + 9, 255, 58, 0, Math.PI * 2);
    c.fill();
    for (const [x, col] of [[0.25, '#ff6b6b'], [0.42, '#ffd166']] as [number, string][]) {
      c.fillStyle = '#f2c79a';
      c.beginPath();
      c.arc(w * x, 318, 20, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = col;
      roundRect(c, w * x - 22, 338, 44, 52, 12);
      c.fill();
      c.fillStyle = '#fff';
      c.fillRect(w * x - 18, 352, 36, 22);
    }
    c.fillStyle = '#fff';
    c.textAlign = 'left';
    c.font = font(86, 400, true);
    c.fillText(b.title, 26, 100);
    c.font = font(34, 800);
    c.fillText(b.sub, 30, 136);
    c.fillStyle = '#5b5b5b';
    c.font = font(20, 700);
    c.textAlign = 'center';
    c.fillText('교육부', w / 2, h - 22);
  });
}

function pageTex(side: 'left' | 'right') {
  return canvasTex(`page|${side}`, 256, 350, (c, w, h) => {
    c.fillStyle = '#fbf8f0';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8590c';
    c.font = font(16, 800);
    c.textAlign = 'left';
    if (side === 'left') {
      c.fillText('2. 이야기 속 인물의 마음', 18, 30);
      c.fillStyle = '#555';
      for (let i = 0; i < 13; i++) c.fillRect(18, 52 + i * 20, 180 + ((i * 37) % 40), 5);
      c.fillStyle = '#ffd6a5';
      c.fillRect(150, 260, 90, 64);
      c.fillStyle = '#333';
      c.font = font(14, 700);
      c.fillText('86', 18, h - 12);
    } else {
      c.fillStyle = '#cfe9ff';
      c.fillRect(18, 18, 220, 120);
      c.fillStyle = '#4caf50';
      c.beginPath();
      c.arc(80, 120, 40, Math.PI, 0);
      c.fill();
      c.fillStyle = '#555';
      for (let i = 0; i < 9; i++) c.fillRect(18, 158 + i * 20, 170 + ((i * 53) % 50), 5);
      c.fillStyle = '#333';
      c.font = font(14, 700);
      c.textAlign = 'right';
      c.fillText('87', w - 18, h - 12);
    }
  });
}

function pageEdges() {
  return std(0xf5f0e2, 0.85, 0, {
    key: 'pageEdge',
    map: canvasTex('pageEdge', 32, 64, (c, w, h) => {
      c.fillStyle = '#f7f2e6';
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        c.fillStyle = y % 4 ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.03)';
        c.fillRect(0, y, w, 1);
      }
    }),
  });
}

const BW = 0.19, BT = 0.014, BL = 0.26;

function closedBook(kind: BookKind) {
  const b = BOOK[kind];
  const g = new THREE.Group();
  const coverM = std(b.dark, 0.55);
  add(g, box(BW, 0.0016, BL), coverM, 0, BT / 2 - 0.0008, 0);
  add(g, box(BW, 0.0016, BL), coverM, 0, -BT / 2 + 0.0008, 0);
  add(g, box(BW - 0.006, BT - 0.003, BL - 0.006), pageEdges(), 0.0025, 0, 0);
  const spine = geo('bookSpine', () => new THREE.CylinderGeometry(BT / 2, BT / 2, BL, 10, 1, false, Math.PI, Math.PI).rotateX(Math.PI / 2));
  add(g, spine, coverM, -BW / 2, 0, 0);
  add(g, flatPlane(BW - 0.002, BL - 0.002), std(0xffffff, 0.5, 0, { map: coverTex(kind), key: `cover${kind}` }), 0.0005, BT / 2 + 0.0002, 0, 0, 0, 0, false);
  add(g, flatPlane(BW - 0.01, BL - 0.01), std(b.light, 0.6), 0, -BT / 2 - 0.0002, 0, Math.PI, 0, 0, false);
  return g;
}

/** 펼친 페이지: 책등 쪽으로 살짝 솟은 곡면 */
function pageSurface(side: 'left' | 'right') {
  return geo(`pageSurf|${side}`, () => {
    const g = new THREE.PlaneGeometry(BW - 0.006, BL - 0.006, 10, 1).rotateX(-Math.PI / 2);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const u = side === 'left' ? (x + (BW - 0.006) / 2) / (BW - 0.006) : 1 - (x + (BW - 0.006) / 2) / (BW - 0.006); // 0 = 바깥 끝, 1 = 책등
      p.setY(i, Math.pow(u, 3) * 0.012);
    }
    g.computeVertexNormals();
    return g;
  });
}

function openBook(kind: BookKind) {
  const b = BOOK[kind];
  const g = new THREE.Group();
  const coverM = std(b.dark, 0.55);
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'left' : 'right';
    add(g, box(BW + 0.004, 0.0016, BL + 0.006), coverM, (s * BW) / 2, -BT / 2 + 0.0008, 0);
    add(g, box(BW - 0.006, 0.005, BL - 0.006), pageEdges(), (s * (BW + 0.004)) / 2, -BT / 2 + 0.004, 0);
    add(g, pageSurface(side), std(0xffffff, 0.75, 0, { map: pageTex(side), key: `page${side}` }), (s * (BW + 0.004)) / 2, -BT / 2 + 0.0066, 0, 0, 0, 0, false);
  }
  add(g, box(0.006, 0.006, BL), coverM, 0, -BT / 2 + 0.003, 0);
  return g;
}

export function buildBook(kind: BookKind = 'korean', open = false): THREE.Group {
  const g = new THREE.Group();
  const c = compact(closedBook(kind)), o = compact(openBook(kind));
  g.add(c, o);
  const set = (v: boolean) => {
    c.visible = !v;
    o.visible = v;
  };
  set(open);
  g.userData.setOpen = set;
  return g;
}

// ───────────────────────── 필통 ─────────────────────────
export type PencilCaseLook = 'blueStars' | 'pinkHearts' | 'mintCheck';
const PCASE: Record<PencilCaseLook, { base: string; dot: string; name: string }> = {
  blueStars: { base: '#2f7fd8', dot: '#ffffff', name: '준호' },
  pinkHearts: { base: '#f28bb0', dot: '#fff0f6', name: '하린' },
  mintCheck: { base: '#57c4a5', dot: '#e7fff8', name: '서아' },
};

function pcaseMat(look: PencilCaseLook) {
  const p = PCASE[look];
  return std(0xffffff, 0.9, 0, {
    key: `pcase${look}`,
    map: canvasTex(`pcase|${look}`, 128, 128, (c, w, h) => {
      c.fillStyle = p.base;
      c.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        c.fillStyle = 'rgba(0,0,0,0.05)';
        c.fillRect(0, y, w, 1);
      }
      c.fillStyle = p.dot;
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 6; j++) {
          const x = i * 22 + (j % 2) * 11 + 6, y = j * 22 + 8;
          if (look === 'mintCheck') {
            c.globalAlpha = 0.35;
            c.fillRect(i * 22, 0, 8, h);
            c.fillRect(0, j * 22, w, 8);
            c.globalAlpha = 1;
          } else if (look === 'pinkHearts') {
            c.beginPath();
            c.arc(x - 2, y, 3, 0, Math.PI * 2);
            c.arc(x + 2, y, 3, 0, Math.PI * 2);
            c.moveTo(x - 5, y + 1);
            c.lineTo(x, y + 7);
            c.lineTo(x + 5, y + 1);
            c.fill();
          } else {
            c.beginPath();
            for (let k = 0; k < 10; k++) {
              const r = k % 2 ? 2 : 5, a = (k * Math.PI) / 5 - Math.PI / 2;
              c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            }
            c.fill();
          }
        }
    }),
  });
}

export function buildPencilCase(look: PencilCaseLook = 'blueStars', open = true): THREE.Group {
  const g = new THREE.Group();
  const W = 0.21, H = 0.055, D = 0.075;
  add(g, rbox(W, H, D, 0.024, 3), pcaseMat(look), 0, -0.0025, 0);
  const top = H / 2 - 0.0025;
  add(g, box(W - 0.03, 0.003, 0.014), std(0x2b2d42, 0.8), 0, top - 0.0005, 0); // 지퍼 천
  add(g, box(W - 0.03, 0.003, 0.004), std(0xd0d4d8, 0.35, 0.8), 0, top + 0.001, 0); // 지퍼 이빨
  if (open) {
    add(g, box(0.085, 0.002, 0.016), std(0x111111, 0.9), 0.045, top + 0.0012, 0); // 벌어진 틈
    // 삐져나온 연필 두 자루
    for (const [x, rz, col] of [[0.06, -0.55, 0xffd43b], [0.035, -0.75, 0x51cf66]] as [number, number, number][]) {
      const p = new THREE.Group();
      p.position.set(x, top, 0.002);
      p.rotation.z = rz;
      g.add(p);
      add(p, cyl(0.0042, 0.0042, 0.06, 6), std(col, 0.6), 0, 0.022, 0);
      add(p, cyl(0.0042, 0.0007, 0.012, 6), std(0xe8c99b, 0.8), 0, 0.058, 0);
    }
  }
  // 지퍼 고리
  const pull = new THREE.Group();
  pull.position.set(open ? 0.0 : 0.09, top + 0.003, 0);
  g.add(pull);
  add(pull, box(0.012, 0.004, 0.008), std(0xb8bec4, 0.3, 0.85));
  add(pull, rbox(0.024, 0.004, 0.012, 0.0018), std(0xffc845, 0.6), 0.016, 0, 0);
  // 이름표
  const p = PCASE[look];
  const tag = std(0xffffff, 0.5, 0, {
    key: `pcaseTag${look}`,
    map: canvasTex(`pcaseTag|${look}`, 128, 48, (c, w, h) => {
      c.fillStyle = '#fff';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = p.base;
      c.lineWidth = 4;
      c.strokeRect(2, 2, w - 4, h - 4);
      c.fillStyle = '#222';
      c.font = font(28, 800);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(p.name, w / 2, h / 2 + 2);
    }),
  });
  add(g, geo('pcaseTagPlane', () => new THREE.PlaneGeometry(0.05, 0.019)), tag, -0.06, -0.006, D / 2 + 0.0006, 0, 0, 0, false);
  return g;
}

// ───────────────────────── 역할 카드 ─────────────────────────
export type RoleKind = 'speaker' | 'maker' | 'researcher' | 'organizer';
const ROLE: Record<RoleKind, { name: string; col: string; hex: number; lines: string[] }> = {
  speaker: { name: '발표', col: '#f26b6b', hex: 0xf26b6b, lines: ['모둠의 목소리!', '크고 또박또박'] },
  maker: { name: '제작', col: '#f2b531', hex: 0xf2c94c, lines: ['포스터를 꾸며요', '그림·글씨 담당'] },
  researcher: { name: '자료', col: '#3fb27a', hex: 0x56c288, lines: ['정보를 모아요', '찾고 정리하기'] },
  organizer: { name: '정리', col: '#5b7ff0', hex: 0x6c8cf5, lines: ['재료를 제자리에!', '시간도 챙겨요'] },
};

function roleIcon(c: CanvasRenderingContext2D, kind: RoleKind, x: number, y: number, s: number) {
  c.save();
  c.translate(x, y);
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  c.lineWidth = s * 0.1;
  c.lineCap = 'round';
  if (kind === 'speaker') {
    roundRect(c, -s * 0.18, -s * 0.5, s * 0.36, s * 0.6, s * 0.18);
    c.fill();
    c.beginPath();
    c.arc(0, -s * 0.05, s * 0.32, 0.2, Math.PI - 0.2);
    c.moveTo(0, s * 0.27);
    c.lineTo(0, s * 0.45);
    c.stroke();
  } else if (kind === 'maker') {
    c.rotate(-0.6);
    c.fillRect(-s * 0.1, -s * 0.5, s * 0.2, s * 0.75);
    c.beginPath();
    c.moveTo(-s * 0.1, s * 0.25);
    c.lineTo(0, s * 0.45);
    c.lineTo(s * 0.1, s * 0.25);
    c.fill();
  } else if (kind === 'researcher') {
    c.beginPath();
    c.arc(-s * 0.08, -s * 0.08, s * 0.28, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(s * 0.14, s * 0.14);
    c.lineTo(s * 0.42, s * 0.42);
    c.stroke();
  } else {
    c.fillRect(-s * 0.4, -s * 0.1, s * 0.8, s * 0.5);
    c.fillRect(-s * 0.46, -s * 0.22, s * 0.92, s * 0.12);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(-s * 0.12, s * 0.02, s * 0.24, s * 0.08);
  }
  c.restore();
}

function cardFace(kind: RoleKind, done: boolean) {
  const r = ROLE[kind];
  return mat(`cardFace|${kind}|${done}`, () => {
    const t = canvasTex(`cardFace|${kind}|${done}`, 260, 360, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      roundRect(c, 0, 0, w, h, 22);
      c.save();
      c.clip();
      c.fillStyle = '#fffdf8';
      c.fillRect(0, 0, w, h);
      c.fillStyle = r.col;
      c.fillRect(0, 0, w, 150);
      c.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 6; i++) c.fillRect(i * 52 - 20, 0, 18, 150);
      roleIcon(c, kind, w / 2, 78, 96);
      c.fillStyle = '#2b2d42';
      c.textAlign = 'center';
      c.font = font(64, 400, true);
      c.fillText(r.name, w / 2, 222);
      c.fillStyle = '#555';
      c.font = font(20, 700);
      r.lines.forEach((l, i) => c.fillText(l, w / 2, 262 + i * 28));
      c.fillStyle = r.col;
      c.font = font(15, 800);
      c.fillText('6-1 모둠 역할 카드', w / 2, h - 18);
      c.strokeStyle = r.col;
      c.lineWidth = 8;
      roundRect(c, 4, 4, w - 8, h - 8, 18);
      c.stroke();
      if (done) {
        c.translate(w - 62, 196);
        c.rotate(-0.25);
        c.strokeStyle = '#e63946';
        c.fillStyle = 'rgba(230,57,70,0.12)';
        c.lineWidth = 6;
        c.beginPath();
        c.arc(0, 0, 44, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.fillStyle = '#e63946';
        c.font = font(22, 900);
        c.fillText('내 역할', 0, 8);
      }
      c.restore();
    });
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, transparent: true, alphaTest: 0.5 });
  });
}

function glowTex() {
  return canvasTex('cardGlow', 128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
}

/** state: 'pick' = 책상 위 고를 수 있는 카드(빛·떠오름), 'held' = 고른 카드(「내 역할」 도장), 'plain' */
export function buildRoleCard(kind: RoleKind, state: 'pick' | 'held' | 'plain' = 'plain'): THREE.Group {
  const r = ROLE[kind];
  const g = new THREE.Group();
  const card = new THREE.Group();
  g.add(card);
  const T = 0.004, W = 0.13, L = 0.18;
  add(card, roundSlab(W, L, T, 0.012), std(new THREE.Color(r.hex).lerp(new THREE.Color(0xffffff), 0.55).getHex(), 0.7), 0, -0.003, 0);
  add(card, flatPlane(W, L), cardFace(kind, state === 'held'), 0, -0.003 + T + 0.0004, 0, 0, 0, 0, false);
  const back = std(r.hex, 0.6, 0, {
    key: `cardBack${kind}`,
    map: canvasTex(`cardBack|${kind}`, 130, 180, (c, w, h) => {
      c.fillStyle = r.col;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 8;
      for (let i = -h; i < w + h; i += 20) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i + h, h);
        c.stroke();
      }
      c.fillStyle = '#fff';
      c.font = font(30, 400, true);
      c.textAlign = 'center';
      c.fillText('6-1', w / 2, h / 2 + 10);
    }),
  });
  add(card, flatPlane(W - 0.01, L - 0.01), back, 0, -0.0034, 0, Math.PI, 0, 0, false);
  if (state === 'pick') {
    const ring = add(g, flatPlane(0.24, 0.3), new THREE.MeshBasicMaterial({ map: glowTex(), color: r.hex, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }), 0, -0.0028, 0, 0, 0, 0, false);
    ring.renderOrder = -1;
    const phase = Object.keys(ROLE).indexOf(kind) * 0.9;
    g.userData.anim = (t: number) => {
      card.position.y = 0.006 + Math.sin(t * 2.4 + phase) * 0.004;
      card.rotation.z = Math.sin(t * 1.7 + phase) * 0.03;
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(t * 3 + phase) * 0.2;
    };
  }
  return g;
}

// ───────────────────────── 종이·포스터 ─────────────────────────
/** 살짝 휜 종이 (모서리가 들린다) — 위를 보는 면, 두께 없이 양면 */
function paperGeo(w: number, l: number, lift: number) {
  return geo(`paper|${w}|${l}|${lift}`, () => {
    const g = new THREE.PlaneGeometry(w, l, 8, 8).rotateX(-Math.PI / 2);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const u = Math.abs(p.getX(i)) / (w / 2), v = Math.abs(p.getZ(i)) / (l / 2);
      p.setY(i, Math.pow(Math.max(0, Math.max(u, v) - 0.55) / 0.45, 2) * lift + Math.pow(u, 2) * lift * 0.3);
    }
    g.computeVertexNormals();
    return g;
  });
}

function paperMat(key: string, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 360) {
  return std(0xffffff, 0.85, 0, { key: `paper${key}`, side: THREE.DoubleSide, map: canvasTex(`paper|${key}`, w, h, draw) });
}

function sheet(g: THREE.Object3D, w: number, l: number, m: THREE.Material, lift = 0.006, y = -0.002) {
  return add(g, paperGeo(w, l, lift), m, 0, y, 0, 0, 0, 0, true);
}

let miniArt: PosterArt | null = null;
/** 미술 시간에 만든 미니 포스터 그림 (손에 들 때·전시할 때 같은 그림) */
export function setMiniPosterArt(a: PosterArt) {
  miniArt = a;
}

export function buildPoster(art: PosterArt | null, w: number, l: number, stage: 0 | 1 | 2 = 2): THREE.Group {
  const g = new THREE.Group();
  const lt = liveTex(300, Math.round((300 * l) / w));
  lt.redraw((c, cw, ch) => drawKidPoster(c, cw, ch, art ?? { theme: 'friends', slogan: '함께하는 우리 반', bg: '#fff3b0', stickers: [{ kind: 'star', x: 0.3, y: 0.55 }, { kind: 'heart', x: 0.7, y: 0.6 }, { kind: 'ball', x: 0.5, y: 0.78 }] }, stage));
  const m = new THREE.MeshStandardMaterial({ map: lt.tex, roughness: 0.85, side: THREE.DoubleSide });
  sheet(g, w, l, m);
  g.userData.redraw = (a: PosterArt, s: 0 | 1 | 2) => lt.redraw((c, cw, ch) => drawKidPoster(c, cw, ch, a, s));
  return g;
}

function festPosterTex() {
  return canvasTex('festPoster', 300, 400, (c, w, h) => {
    c.fillStyle = '#fff1c1';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff7a4d';
    c.fillRect(0, 0, w, 90);
    c.fillStyle = '#fff';
    c.font = font(46, 400, true);
    c.textAlign = 'center';
    c.fillText('돈가스 축제!', w / 2, 62);
    c.fillStyle = '#c8803a';
    roundRect(c, 60, 130, 180, 120, 40);
    c.fill();
    c.fillStyle = 'rgba(255,220,150,0.6)';
    rnd(5);
    for (let i = 0; i < 80; i++) c.fillRect(70 + rnd() * 160, 140 + rnd() * 100, 4, 3);
    c.fillStyle = '#2b2d42';
    c.font = font(24, 800);
    c.fillText('오늘 점심 · 1층 복도', w / 2, 300);
    c.font = font(20, 700);
    c.fillText('다 같이 나눠 먹어요 ♥', w / 2, 336);
    c.fillStyle = '#888';
    c.font = font(15, 600);
    c.fillText('6-1 준비 위원회', w / 2, h - 20);
  });
}

// ───────────────────────── 미술 준비물 ─────────────────────────
function buildScissors(): THREE.Group {
  const g = new THREE.Group();
  const steel = std(0xd9dde2, 0.25, 0.9);
  const plastic = std(0xff6b8b, 0.45);
  const blade = geo('scissorBlade', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.006, 0);
    s.lineTo(0.006, 0);
    s.quadraticCurveTo(0.004, 0.06, 0.0015, 0.085);
    s.absarc(0, 0.085, 0.0025, 0, Math.PI, false);
    s.quadraticCurveTo(-0.004, 0.05, -0.006, 0);
    const e = new THREE.ExtrudeGeometry(s, { depth: 0.002, bevelEnabled: false, curveSegments: 4 });
    e.rotateX(-Math.PI / 2);
    return e;
  });
  for (const s of [-1, 1]) {
    add(g, blade, steel, 0, -0.004 + (s > 0 ? 0.002 : 0), 0.005, 0, s * 0.07, 0);
    const loop = add(g, geo('scissorLoop', () => new THREE.TorusGeometry(0.019, 0.0055, 6, 16)), plastic, s * 0.02, -0.002, -0.045 - (s > 0 ? 0.004 : 0), Math.PI / 2, 0, 0);
    loop.scale.set(1, 1.35, 1);
    add(g, box(0.008, 0.006, 0.03), plastic, s * 0.008, -0.002, -0.015, 0, -s * 0.35, 0);
  }
  add(g, cyl(0.0045, 0.0045, 0.008, 10), std(0x9aa1a8, 0.3, 0.8), 0, -0.001, 0.005);
  return g;
}

function buildRuler(): THREE.Group {
  const g = new THREE.Group();
  add(g, box(0.035, 0.003, 0.3), std(0x9ad0ec, 0.15, 0, { transparent: true, opacity: 0.72, key: 'ruler' }), 0, -0.0005, 0);
  const t = canvasTex('rulerTicks', 64, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#1d3557';
    for (let i = 0; i <= 300; i += 5) {
      const y = 6 + (i / 300) * (h - 12);
      const len = i % 50 === 0 ? 22 : i % 10 === 0 ? 15 : 8;
      c.fillRect(0, y, len, 1.5);
      if (i % 50 === 0) {
        c.font = font(12, 700);
        c.fillText(`${i / 10}`, 26, y + 5);
      }
    }
  });
  add(g, flatPlane(0.034, 0.298), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }), 0, 0.0012, 0, 0, Math.PI, 0, false);
  return g;
}

function stickLabel(key: string, name: string, col: string) {
  return std(0xffffff, 0.45, 0, {
    key: `glue${key}`,
    map: canvasTex(`glueLabel|${key}`, 128, 128, (c, w, h) => {
      c.fillStyle = col;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.fillRect(0, h * 0.3, w, h * 0.4);
      c.fillStyle = '#e8590c';
      c.font = font(30, 900);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(name, w / 4, h / 2);
      c.fillText(name, (w * 3) / 4, h / 2);
    }),
  });
}

function buildGlueStick(withCap: boolean, name: string): THREE.Group {
  const g = new THREE.Group();
  add(g, cyl(0.0145, 0.0145, 0.012, 16), std(0xf1f3f5, 0.5), 0, -0.039, 0); // 돌리는 바닥
  add(g, cyl(0.014, 0.014, 0.066, 16), stickLabel(name, name, '#ffd43b'), 0, -0.0, 0);
  if (withCap) add(g, cyl(0.0152, 0.0152, 0.026, 16), std(0xff922b, 0.45), 0, 0.032, 0);
  else add(g, cyl(0.0105, 0.011, 0.01, 14), std(0xf8f9fa, 0.9), 0, 0.038, 0); // 뚜껑 없이 드러난 풀
  return g;
}

function buildTape(): THREE.Group {
  const g = new THREE.Group();
  const ring = geo('tapeRing', () => new THREE.LatheGeometry([new THREE.Vector2(0.02, -0.0095), new THREE.Vector2(0.033, -0.0095), new THREE.Vector2(0.033, 0.0095), new THREE.Vector2(0.02, 0.0095), new THREE.Vector2(0.02, -0.0095)], 24));
  add(g, ring, std(0xd8eef7, 0.12, 0, { transparent: true, opacity: 0.8, key: 'tape' }), 0, 0, 0);
  add(g, cyl(0.0198, 0.0198, 0.0192, 20, true), std(0xc9a46b, 0.85, 0, { side: THREE.DoubleSide, key: 'core' }), 0, 0, 0);
  add(g, box(0.012, 0.016, 0.0006), std(0xd8eef7, 0.12, 0, { transparent: true, opacity: 0.8, key: 'tape' }), 0.024, 0, 0.0332, 0, 0, 0.1);
  return g;
}

function buildColorPaper(color: number, lift = 0.004): THREE.Group {
  const g = new THREE.Group();
  sheet(g, 0.15, 0.15, std(color, 0.8, 0, { side: THREE.DoubleSide, key: 'cp' }), lift);
  return g;
}

function buildColorPaperPack(): THREE.Group {
  const g = new THREE.Group();
  const cols = [0xff6b6b, 0xffa94d, 0xffd43b, 0x69db7c, 0x38d9a9, 0x4dabf7, 0x748ffc, 0xda77f2, 0xf783ac, 0xffffff];
  cols.forEach((c, i) => add(g, box(0.15, 0.0022, 0.15), std(c, 0.85), 0, -0.012 + i * 0.0024, 0, 0, (i - 5) * 0.025, 0));
  add(g, box(0.04, 0.026, 0.152), std(0xffffff, 0.4, 0, { transparent: true, opacity: 0.6, key: 'cpband' }), -0.03, -0.0015, 0);
  const lbl = canvasTex('cpLabel', 128, 48, (c, w, h) => {
    c.fillStyle = '#ff6b6b';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
    c.font = font(24, 900);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('색종이 20색', w / 2, h / 2 + 2);
  });
  add(g, flatPlane(0.06, 0.022), std(0xffffff, 0.5, 0, { map: lbl, key: 'cplabel' }), 0.03, 0.012, 0.05, 0, 0, 0, false);
  return g;
}

function buildMarkers(): THREE.Group {
  const g = new THREE.Group();
  add(g, rbox(0.18, 0.016, 0.09, 0.006), std(0x3b5bdb, 0.5), 0, -0.0045, 0);
  const cols = [0x111111, 0xe03131, 0xf76707, 0xfcc419, 0x37b24d, 0x1c7ed6, 0x7048e8, 0xd6336c];
  cols.forEach((c, i) => {
    const z = -0.035 + i * 0.01;
    add(g, cyl(0.0045, 0.0045, 0.12, 8), std(0xf8f9fa, 0.5), -0.01, 0.0055, z, 0, 0, Math.PI / 2);
    add(g, cyl(0.005, 0.005, 0.035, 8), std(c, 0.45), 0.065, 0.0055, z, 0, 0, Math.PI / 2);
    add(g, cyl(0.0048, 0.0048, 0.01, 8), std(c, 0.45), -0.072, 0.0055, z, 0, 0, Math.PI / 2);
  });
  add(g, rbox(0.182, 0.004, 0.092, 0.0018), std(0xffffff, 0.08, 0, { transparent: true, opacity: 0.35, key: 'lid' }), 0, 0.0115, 0);
  return g;
}

// ───────────────────────── 급식: 식판·국자 ─────────────────────────
export function buildTray(): THREE.Group {
  const g = new THREE.Group();
  const steel = std(0xd7dbe0, 0.28, 0.85);
  const W = 0.4, L = 0.3;
  add(g, roundSlab(W, L, 0.004, 0.035), steel, 0, 0, 0);
  const rim = geo('trayRim', () => {
    const rr = (s: THREE.Shape | THREE.Path, w: number, l: number, r: number) => {
      s.moveTo(-w / 2 + r, -l / 2);
      s.lineTo(w / 2 - r, -l / 2);
      s.quadraticCurveTo(w / 2, -l / 2, w / 2, -l / 2 + r);
      s.lineTo(w / 2, l / 2 - r);
      s.quadraticCurveTo(w / 2, l / 2, w / 2 - r, l / 2);
      s.lineTo(-w / 2 + r, l / 2);
      s.quadraticCurveTo(-w / 2, l / 2, -w / 2, l / 2 - r);
      s.lineTo(-w / 2, -l / 2 + r);
      s.quadraticCurveTo(-w / 2, -l / 2, -w / 2 + r, -l / 2);
    };
    const s = new THREE.Shape();
    rr(s, W, L, 0.035);
    const hole = new THREE.Path();
    rr(hole, W - 0.016, L - 0.016, 0.028);
    s.holes.push(hole);
    const e = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false, curveSegments: 5 });
    e.rotateX(-Math.PI / 2);
    return e;
  });
  add(g, rim, steel, 0, 0.002, 0);
  // 칸막이: 위 반찬 세 칸 / 아래 밥·국
  const dz = 0.025;
  add(g, box(W - 0.016, 0.016, 0.004), steel, 0, 0.002, dz);
  for (const x of [-0.065, 0.065]) add(g, box(0.004, 0.016, L / 2 - 0.008 + dz), steel, x, 0.002, (-L / 2 + 0.008 + dz) / 2);
  add(g, box(0.004, 0.016, L / 2 - dz - 0.008), steel, 0.02, 0.002, (dz + L / 2 - 0.008) / 2);
  return compact(g);
}

/** 숟가락·젓가락 한 벌 (식판 위에 놓는 것) */
export function buildCutlery(): THREE.Group {
  const g = new THREE.Group();
  const steel = std(0xd7dbe0, 0.25, 0.9);
  add(g, geo('spoonBowl', () => new THREE.SphereGeometry(0.018, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.35, 1.4)), std(0xd7dbe0, 0.25, 0.9, { side: THREE.DoubleSide, key: 'spoon' }), 0, 0.007, 0.075);
  add(g, box(0.008, 0.003, 0.13), steel, 0, 0.003, -0.02);
  for (const x of [0.022, 0.03]) add(g, cyl(0.0025, 0.0018, 0.2, 6), steel, x, 0.003, 0.0, Math.PI / 2, 0, 0);
  return g;
}

/** 수저통: 칸 나뉜 스테인리스 통에 숟가락·젓가락이 꽂혀 있다 */
export function buildCutleryBin(): THREE.Group {
  const g = new THREE.Group();
  const steel = std(0xd7dbe0, 0.25, 0.9);
  add(g, cyl(0.07, 0.065, 0.14, 18, true), std(0xd7dbe0, 0.25, 0.9, { side: THREE.DoubleSide, key: 'binSteel' }), 0, 0.07, 0);
  add(g, cyl(0.065, 0.065, 0.004, 18), steel, 0, 0.002, 0);
  add(g, box(0.13, 0.12, 0.003), steel, 0, 0.06, 0);
  rnd(8);
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * 0.04;
    const spoon = i % 2 === 0;
    add(g, cyl(0.003, 0.0025, spoon ? 0.2 : 0.21, 5), steel, Math.cos(a) * r, 0.11, Math.sin(a) * r, (rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3);
    if (spoon) add(g, geo('spoonTop', () => new THREE.SphereGeometry(0.015, 8, 5).scale(1, 1.4, 0.35)), steel, Math.cos(a) * r, 0.215, Math.sin(a) * r);
  }
  return g;
}

function buildTrayStack(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const t = buildTray();
    t.position.y = -0.05 + i * 0.013;
    t.rotation.y = (i % 2 ? 0.02 : -0.015);
    g.add(t);
  }
  return g;
}

function buildLadle(): THREE.Group {
  const g = new THREE.Group();
  const steel = std(0xcfd4d9, 0.22, 0.9);
  add(g, geo('ladleBowl', () => new THREE.SphereGeometry(0.04, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), std(0xcfd4d9, 0.22, 0.9, { side: THREE.DoubleSide, key: 'ladle' }), 0, 0.01, 0.13);
  add(g, tube('ladleHandle', [[0, 0.01, 0.092], [0, 0.03, 0.04], [0, 0.026, -0.08], [0, 0.02, -0.17], [0, 0.03, -0.2]], 0.005, 24, 6), steel);
  return g;
}

// ───────────────────────── 그 밖의 소품 ─────────────────────────
function buildCharger(): THREE.Group {
  const g = new THREE.Group();
  const white = std(0xf4f4f2, 0.4);
  add(g, rbox(0.05, 0.026, 0.05, 0.008), white, -0.02, -0.012, 0);
  for (const x of [-0.03, -0.01]) add(g, cyl(0.0025, 0.0025, 0.02, 6), std(0xc0c4c8, 0.3, 0.8), x, -0.012, -0.034, Math.PI / 2, 0, 0);
  add(g, geo('chgCoil', () => new THREE.TorusGeometry(0.028, 0.0028, 6, 24)), white, 0.022, -0.022, 0.01, Math.PI / 2, 0, 0);
  add(g, geo('chgCoil2', () => new THREE.TorusGeometry(0.024, 0.0028, 6, 24)), white, 0.024, -0.017, 0.012, Math.PI / 2, 0, 0);
  add(g, rbox(0.012, 0.006, 0.022, 0.002), white, 0.05, -0.02, 0.03);
  return g;
}

function buildCutterUnit(): THREE.Group {
  const g = new THREE.Group();
  const yellow = std(0xffc300, 0.45, 0.1), steel = std(0xc9ced3, 0.3, 0.85), dark = std(0x2b2d33, 0.6);
  add(g, rbox(0.4, 0.03, 0.25, 0.01), dark, 0, -0.075, 0);
  for (const z of [-0.09, 0.09]) add(g, cyl(0.009, 0.009, 0.38, 10), steel, 0, -0.05, z, 0, 0, Math.PI / 2);
  add(g, rbox(0.13, 0.11, 0.22, 0.02), yellow, 0, -0.01, 0);
  const stripe = canvasTex('hazard', 128, 32, (c, w, h) => {
    c.fillStyle = '#ffc300';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#222';
    for (let x = -h; x < w; x += 24) {
      c.beginPath();
      c.moveTo(x, h);
      c.lineTo(x + 12, h);
      c.lineTo(x + 12 + h, 0);
      c.lineTo(x + h, 0);
      c.fill();
    }
  });
  add(g, geo('hazardPlane', () => new THREE.PlaneGeometry(0.13, 0.03)), std(0xffffff, 0.5, 0, { map: stripe, key: 'hazard' }), 0, -0.04, 0.1105, 0, 0, 0, false);
  add(g, cyl(0.022, 0.024, 0.02, 16), dark, 0.03, 0.055, -0.05);
  add(g, geo('btnCap', () => new THREE.SphereGeometry(0.022, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2)), std(0xe03131, 0.35), 0.03, 0.065, -0.05);
  add(g, cyl(0.008, 0.008, 0.006, 10), std(0x51cf66, 0.3), -0.035, 0.047, -0.05);
  add(g, tube('cutHandle', [[-0.05, 0.045, 0.06], [-0.05, 0.08, 0.06], [0.05, 0.08, 0.06], [0.05, 0.045, 0.06]], 0.007, 16, 6), dark);
  return g;
}

function crumbMat() {
  return std(0xffffff, 0.9, 0, {
    key: 'crumb',
    map: canvasTex('crumb', 128, 128, (c, w, h) => {
      c.fillStyle = '#c8803a';
      c.fillRect(0, 0, w, h);
      rnd(77);
      for (let i = 0; i < 900; i++) {
        c.fillStyle = ['#e0a256', '#a8652a', '#f0c27a', '#8a4f1f'][Math.floor(rnd() * 4)];
        c.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 2);
      }
    }, true),
  });
}

function buildCutletPiece(): THREE.Group {
  const g = new THREE.Group();
  const p = add(g, rbox(0.3, 0.04, 0.3, 0.018, 3), crumbMat(), 0, -0.01, 0);
  p.scale.set(1, 1, 0.94);
  return g;
}

function buildFoldTable(): THREE.Group {
  const g = new THREE.Group();
  add(g, rbox(0.5, 0.022, 0.3, 0.008), std(0xece6d6, 0.55), 0, -0.018, 0);
  add(g, box(0.5, 0.012, 0.304), std(0x8f959b, 0.35, 0.7), 0, -0.004, 0);
  for (const z of [-0.08, 0.08]) add(g, cyl(0.008, 0.008, 0.44, 8), std(0xb4bac0, 0.3, 0.8), 0, 0.018, z, 0, 0, Math.PI / 2);
  add(g, tube('foldHandle', [[-0.04, 0.0, 0.15], [-0.03, 0.0, 0.18], [0.03, 0.0, 0.18], [0.04, 0.0, 0.15]], 0.006, 12, 6), std(0x2b2d33, 0.6));
  return g;
}

function buildGymClothes(): THREE.Group {
  const g = new THREE.Group();
  const navy = fabric(0x2b4cc4, 4);
  add(g, rbox(0.28, 0.026, 0.22, 0.012), navy, 0, -0.016, 0);
  add(g, rbox(0.26, 0.026, 0.2, 0.012), navy, 0, 0.01, 0);
  for (const x of [-0.11, 0.11]) add(g, box(0.012, 0.002, 0.2), std(0xffffff, 0.6), x, 0.0235, 0);
  add(g, geo('collar', () => new THREE.TorusGeometry(0.035, 0.006, 6, 14, Math.PI)), fabric(0x1d3a9a, 4), 0, 0.023, -0.06, -Math.PI / 2, 0, Math.PI);
  add(g, box(0.035, 0.002, 0.03), std(0xffd43b, 0.5), 0.06, 0.0235, -0.03);
  return g;
}

function buildCone(): THREE.Group {
  const g = new THREE.Group();
  add(g, rbox(0.15, 0.02, 0.15, 0.006), std(0x222326, 0.8), 0, -0.11, 0);
  add(g, cyl(0.013, 0.065, 0.22, 18), std(0xff6b35, 0.55), 0, 0.0, 0);
  add(g, cyl(0.036, 0.047, 0.05, 18), std(0xf5f5f5, 0.35, 0.2), 0, 0.0, 0);
  add(g, cyl(0.016, 0.02, 0.02, 14), std(0xf5f5f5, 0.35, 0.2), 0, 0.085, 0);
  return g;
}

function buildStandPart(): THREE.Group {
  const g = new THREE.Group();
  const metal = std(0x6c757d, 0.45, 0.6);
  add(g, rbox(0.3, 0.025, 0.3, 0.01), metal, 0, -0.0875, 0);
  add(g, cyl(0.025, 0.03, 0.15, 12), metal, 0, -0.005, 0);
  add(g, rbox(0.2, 0.025, 0.12, 0.008), std(0x495057, 0.4, 0.6), 0, 0.085, 0, 0.2, 0, 0);
  for (const s of [-1, 1]) add(g, box(0.012, 0.12, 0.012), metal, s * 0.1, -0.03, 0.1, 0.5, 0, 0);
  return g;
}

function buildRampPart(): THREE.Group {
  const g = new THREE.Group();
  const grip = canvasTex('grip', 64, 64, (c, w, h) => {
    c.fillStyle = '#ffbe0b';
    c.fillRect(0, 0, w, h);
    rnd(3);
    for (let i = 0; i < 300; i++) {
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
    }
  }, true);
  add(g, rbox(0.5, 0.025, 0.25, 0.008), std(0xffffff, 0.8, 0, { map: grip, key: 'grip' }), 0, -0.0075, 0);
  for (const z of [-0.12, 0.12]) add(g, box(0.5, 0.03, 0.012), std(0x495057, 0.4, 0.6), 0, -0.005, z);
  add(g, cyl(0.008, 0.008, 0.25, 8), std(0xadb5bd, 0.3, 0.8), -0.24, -0.005, 0, Math.PI / 2, 0, 0);
  return g;
}

function buildPadPart(): THREE.Group {
  const g = new THREE.Group();
  add(g, rbox(0.15, 0.02, 0.25, 0.006), std(0x495057, 0.5, 0.5), 0, -0.115, 0);
  const coil = tube('spring', Array.from({ length: 33 }, (_, i) => [Math.cos(i * 0.8) * 0.03, -0.1 + i * 0.004, Math.sin(i * 0.8) * 0.03] as [number, number, number]), 0.004, 96, 5);
  add(g, coil, std(0xc9ced3, 0.3, 0.85));
  add(g, rbox(0.14, 0.09, 0.24, 0.03, 3), std(0xe63946, 0.55), 0, 0.075, 0);
  return g;
}

function buildRemote(): THREE.Group {
  const g = new THREE.Group();
  add(g, rbox(0.075, 0.025, 0.16, 0.012, 3), std(0x2b2d42, 0.45), 0, -0.0075, 0);
  const scr = canvasTex('remoteScr', 96, 48, (c, w, h) => {
    c.fillStyle = '#10261c';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#7cfc8a';
    c.font = font(26, 800);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('100%', w / 2, h / 2 + 2);
  });
  add(g, flatPlane(0.05, 0.026), new THREE.MeshBasicMaterial({ map: scr, toneMapped: false }), 0, 0.0055, -0.045, 0, 0, 0, false);
  for (const [x, z, col] of [[-0.018, 0.01, 0x4dabf7], [0.018, 0.01, 0xff6b6b], [0, 0.05, 0xffd43b]] as [number, number, number][]) add(g, cyl(0.009, 0.009, 0.006, 14), std(col, 0.4), x, 0.007, z);
  add(g, cyl(0.004, 0.003, 0.05, 8), std(0x868e96, 0.4, 0.6), 0.025, 0.01, -0.09, Math.PI / 2 - 0.4, 0, 0);
  return g;
}

function buildDodgeball(): THREE.Group {
  const g = new THREE.Group();
  const t = canvasTex('ballSkin', 256, 128, (c, w, h) => {
    c.fillStyle = '#e63946';
    c.fillRect(0, 0, w, h);
    rnd(11);
    for (let i = 0; i < 1600; i++) {
      c.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`;
      c.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
    }
    c.strokeStyle = '#7a1018';
    c.lineWidth = 3;
    for (const x of [w * 0.25, w * 0.75]) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(0, h / 2);
    c.lineTo(w, h / 2);
    c.stroke();
  });
  add(g, geo('ball', () => new THREE.SphereGeometry(0.11, 24, 14)), std(0xffffff, 0.6, 0, { map: t, key: 'ball' }));
  return g;
}

function buildScraps(): THREE.Group {
  const g = new THREE.Group();
  rnd(42);
  const cols = [0xffffff, 0x58c4f6, 0xff8fb1, 0xffe066, 0xffffff];
  for (let i = 0; i < 6; i++) {
    const m = add(g, geo(`scrap${i % 3}`, () => {
      const ge = new THREE.IcosahedronGeometry(0.022, 0);
      const p = ge.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.7 + rnd() * 0.6), p.getY(k) * (0.6 + rnd() * 0.5), p.getZ(k) * (0.7 + rnd() * 0.6));
      ge.computeVertexNormals();
      return ge;
    }), std(cols[i % cols.length], 0.95, 0, { key: 'scrap' }), (rnd() - 0.5) * 0.09, -0.012, (rnd() - 0.5) * 0.09, rnd() * 3, rnd() * 3, 0);
    m.scale.setScalar(0.8 + rnd() * 0.5);
  }
  return g;
}

// ───────────────────────── 모음 ─────────────────────────
export type ModelState = 'world' | 'held' | 'pick';

const RAW_BUILDERS: Record<string, (state: ModelState) => THREE.Object3D> = {
  koreanBook: () => buildBook('korean'),
  tablet: () => buildTablet('lock'),
  charger: () => buildCharger(),
  pencilCase: () => buildPencilCase('blueStars', true),
  roleSpeaker: (s) => buildRoleCard('speaker', s === 'held' ? 'held' : s === 'pick' ? 'pick' : 'plain'),
  roleMaker: (s) => buildRoleCard('maker', s === 'held' ? 'held' : s === 'pick' ? 'pick' : 'plain'),
  roleResearcher: (s) => buildRoleCard('researcher', s === 'held' ? 'held' : s === 'pick' ? 'pick' : 'plain'),
  roleOrganizer: (s) => buildRoleCard('organizer', s === 'held' ? 'held' : s === 'pick' ? 'pick' : 'plain'),
  scissors: () => buildScissors(),
  ruler: () => buildRuler(),
  glueStick: () => buildGlueStick(false, '딱풀'),
  glue: () => buildGlueStick(true, '하린'),
  tape: () => buildTape(),
  colorPaperPack: () => buildColorPaperPack(),
  markers: () => buildMarkers(),
  colorPaper: (s) => {
    if (s === 'held') return buildColorPaper(0x58c4f6);
    // 책상 위에는 몇 장 겹친 더미
    const g = new THREE.Group();
    [0xffd43b, 0xff8fb1, 0x58c4f6].forEach((c, i) => {
      const p = buildColorPaper(c, 0.002);
      p.position.y = i * 0.0012;
      p.rotation.y = (i - 1) * 0.12;
      g.add(p);
    });
    return g;
  },
  drawingPaper: (s) => {
    const g = new THREE.Group();
    if (s !== 'held') for (let i = 1; i <= 3; i++) add(g, box(0.2, 0.001, 0.28), std(0xfdf8ec, 0.9), (i % 2) * 0.004, -0.002 - i * 0.0012, (i % 2) * -0.003, 0, i * 0.03, 0);
    sheet(g, 0.2, 0.28, paperMat('drawing', (c, w, h) => {
      c.fillStyle = '#fffdf6';
      c.fillRect(0, 0, w, h);
      rnd(4);
      for (let i = 0; i < 1500; i++) {
        c.fillStyle = `rgba(0,0,0,${rnd() * 0.035})`;
        c.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
    }));
    return g;
  },
  miniPoster: () => buildPoster(miniArt, 0.2, 0.28, 2),
  festPoster: () => {
    const g = new THREE.Group();
    sheet(g, 0.3, 0.4, std(0xffffff, 0.85, 0, { side: THREE.DoubleSide, map: festPosterTex(), key: 'fest' }), 0.012);
    return g;
  },
  cutterUnit: () => buildCutterUnit(),
  ladle: () => buildLadle(),
  trayStack: () => buildTrayStack(),
  cutletPiece: () => buildCutletPiece(),
  foldTable: () => buildFoldTable(),
  gymClothes: () => buildGymClothes(),
  zoneCone: () => buildCone(),
  standPart: () => buildStandPart(),
  rampPart: () => buildRampPart(),
  padPart: () => buildPadPart(),
  sizeRemote: () => buildRemote(),
  dodgeball: () => buildDodgeball(),
  scraps: () => buildScraps(),
};

/** 카드(움직임 있음)·태블릿·책(상태 전환)은 안에서 따로 합치고, 나머지는 통째로 재질별로 합친다 */
const NO_COMPACT = new Set(['roleSpeaker', 'roleMaker', 'roleResearcher', 'roleOrganizer', 'tablet', 'koreanBook', 'miniPoster']);
export const ITEM_BUILDERS: Record<string, (state: ModelState) => THREE.Object3D> = Object.fromEntries(
  Object.entries(RAW_BUILDERS).map(([id, fn]) => [id, (s: ModelState) => (NO_COMPACT.has(id) ? fn(s) : compact(fn(s)))]),
);
