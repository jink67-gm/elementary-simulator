// 학생이 직접 만든 포스터 그림: 종이 결, 크레파스 테두리, 손글씨 제목, 손으로 그린 스티커 그림(밥·공·시계·하트·별).
// 모둠 포스터(게시판), 미니 포스터(손에 든 것·전시), 모둠 책상 위 만드는 중인 포스터가 같은 그림을 쓴다.
import type { PosterTheme } from '../../core/SaveData';
import { font, rnd } from './kit';

export interface PosterArt {
  theme: PosterTheme;
  slogan: string;
  bg: string;
  stickers: { kind: string; x: number; y: number }[];
  footer?: string;
}

/** 0 = 빈 종이(연필 밑그림 선), 1 = 만드는 중(제목 밑그림 + 그림 두세 개), 2 = 완성 */
export type PosterStage = 0 | 1 | 2;

function paper(c: CanvasRenderingContext2D, w: number, h: number, bg: string) {
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);
  rnd(31);
  for (let i = 0; i < (w * h) / 90; i++) {
    c.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + rnd() * 0.04})`;
    c.fillRect(rnd() * w, rnd() * h, 2, 2);
  }
}

/** 크레파스 선 (살짝 떨리는 굵은 선) */
function crayon(c: CanvasRenderingContext2D, pts: [number, number][], color: string, width: number) {
  c.strokeStyle = color;
  c.lineCap = c.lineJoin = 'round';
  for (let pass = 0; pass < 3; pass++) {
    c.globalAlpha = 0.55;
    c.lineWidth = width * (0.7 + pass * 0.2);
    c.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = (rnd() - 0.5) * width * 0.5, jy = (rnd() - 0.5) * width * 0.5;
      if (i === 0) c.moveTo(x + jx, y + jy);
      else c.lineTo(x + jx, y + jy);
    });
    c.stroke();
  }
  c.globalAlpha = 1;
}

/** 손으로 그린 스티커 그림 */
export function drawDoodle(c: CanvasRenderingContext2D, kind: string, x: number, y: number, s: number) {
  c.save();
  c.translate(x, y);
  c.lineWidth = s * 0.08;
  c.lineJoin = c.lineCap = 'round';
  switch (kind) {
    case 'food': {
      // 밥그릇 + 김 + 숟가락
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(0, -s * 0.05, s * 0.42, Math.PI, 0);
      c.fill();
      c.fillStyle = '#e07a1f';
      c.beginPath();
      c.moveTo(-s * 0.5, -s * 0.05);
      c.quadraticCurveTo(0, s * 0.62, s * 0.5, -s * 0.05);
      c.fill();
      c.strokeStyle = '#9a4d0c';
      c.stroke();
      c.strokeStyle = 'rgba(120,120,120,0.7)';
      for (const dx of [-0.18, 0, 0.18]) {
        c.beginPath();
        c.moveTo(dx * s, -s * 0.55);
        c.quadraticCurveTo(dx * s + s * 0.1, -s * 0.7, dx * s, -s * 0.85);
        c.stroke();
      }
      break;
    }
    case 'ball': {
      c.fillStyle = '#3a86ff';
      c.beginPath();
      c.arc(0, 0, s * 0.45, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#fff';
      c.beginPath();
      c.arc(0, 0, s * 0.45, -0.3, Math.PI + 0.3);
      c.moveTo(-s * 0.45, 0);
      c.lineTo(s * 0.45, 0);
      c.stroke();
      c.strokeStyle = '#1c4fa8';
      c.beginPath();
      c.arc(0, 0, s * 0.45, 0, Math.PI * 2);
      c.stroke();
      break;
    }
    case 'clock': {
      c.fillStyle = '#fff';
      c.strokeStyle = '#8338ec';
      c.beginPath();
      c.arc(0, 0, s * 0.45, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, -s * 0.3);
      c.moveTo(0, 0);
      c.lineTo(s * 0.22, s * 0.08);
      c.stroke();
      break;
    }
    case 'heart': {
      c.fillStyle = '#ff4d8d';
      c.beginPath();
      c.moveTo(0, s * 0.4);
      c.bezierCurveTo(-s * 0.6, 0, -s * 0.35, -s * 0.5, 0, -s * 0.18);
      c.bezierCurveTo(s * 0.35, -s * 0.5, s * 0.6, 0, 0, s * 0.4);
      c.fill();
      c.strokeStyle = '#c2185b';
      c.stroke();
      break;
    }
    default: {
      // 별
      c.fillStyle = '#ffc93c';
      c.strokeStyle = '#e09b00';
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.2 : s * 0.46, a = (i * Math.PI) / 5 - Math.PI / 2;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
      c.stroke();
    }
  }
  c.restore();
}

const THEME_NAME: Record<PosterTheme, string> = { food: '맛있는 학교', rest: '쉬는 학교', play: '신나는 학교', friends: '함께하는 학교' };

/** 학생 포스터 한 장 그리기 */
export function drawKidPoster(c: CanvasRenderingContext2D, w: number, h: number, art: PosterArt, stage: PosterStage = 2) {
  paper(c, w, h, stage === 0 ? '#fbf8f0' : art.bg);
  const u = w / 400;
  if (stage === 0) {
    // 연필로 그은 칸 나누기 선만
    c.strokeStyle = 'rgba(90,90,90,0.35)';
    c.lineWidth = 2 * u;
    c.strokeRect(24 * u, 20 * u, w - 48 * u, 70 * u);
    c.beginPath();
    c.arc(w * 0.3, h * 0.55, 46 * u, 0, Math.PI * 2);
    c.arc(w * 0.72, h * 0.6, 40 * u, 0, Math.PI * 2);
    c.stroke();
    return;
  }
  rnd(art.slogan.length * 7 + 3);
  // 크레파스 테두리
  const m = 12 * u;
  crayon(c, [[m, m], [w - m, m], [w - m, h - m], [m, h - m], [m, m]], stage === 2 ? '#f08c00' : 'rgba(120,120,120,0.6)', 9 * u);
  // 제목 (손글씨)
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = font(Math.round(40 * u), 400, true);
  if (stage === 1) {
    c.strokeStyle = 'rgba(80,80,80,0.55)';
    c.lineWidth = 1.5 * u;
    c.strokeText(art.slogan, w / 2, 62 * u);
  } else {
    c.lineWidth = 8 * u;
    c.strokeStyle = '#ffffff';
    c.strokeText(art.slogan, w / 2, 62 * u);
    c.fillStyle = '#2b2d42';
    c.fillText(art.slogan, w / 2, 62 * u);
  }
  // 그림 (만드는 중이면 두 개만)
  const list = stage === 2 ? art.stickers : art.stickers.slice(0, 2);
  for (const s of list) drawDoodle(c, s.kind, s.x * w, s.y * h, 90 * u);
  if (stage === 2) {
    // 작은 장식: 반짝이 점, 밑줄
    for (let i = 0; i < 10; i++) {
      c.fillStyle = ['#ffbe0b', '#ff006e', '#3a86ff', '#06d6a0'][i % 4];
      c.beginPath();
      c.arc((0.08 + rnd() * 0.84) * w, (0.25 + rnd() * 0.6) * h, (3 + rnd() * 4) * u, 0, Math.PI * 2);
      c.fill();
    }
    crayon(c, [[w * 0.25, 88 * u], [w * 0.75, 90 * u]], '#ff006e', 5 * u);
    c.fillStyle = '#555';
    c.font = font(Math.round(18 * u), 600);
    c.fillText(art.footer ?? `6-1 · ${THEME_NAME[art.theme]}`, w / 2, h - 30 * u);
  } else {
    // 연필 밑그림 원 (아직 안 그린 자리)
    c.strokeStyle = 'rgba(90,90,90,0.35)';
    c.lineWidth = 2 * u;
    for (const s of art.stickers.slice(2)) {
      c.beginPath();
      c.arc(s.x * w, s.y * h, 40 * u, 0, Math.PI * 2);
      c.stroke();
    }
  }
}

/** 반 친구들 그림 (교실 뒤 게시판 분위기) */
export function drawClassArt(c: CanvasRenderingContext2D, w: number, h: number, i: number) {
  paper(c, w, h, ['#fffdf5', '#fdf6e3', '#f7fbff', '#fffaf0', '#fbf7ff'][i % 5]);
  rnd(100 + i * 17);
  const u = w / 200;
  // 하늘·땅
  crayon(c, [[0, h * 0.82], [w * 0.3, h * 0.78], [w * 0.6, h * 0.84], [w, h * 0.8]], '#6cbf4c', 14 * u);
  switch (i % 5) {
    case 0: // 집과 해
      c.fillStyle = '#ef476f';
      c.fillRect(w * 0.25, h * 0.5, w * 0.35, h * 0.28);
      c.fillStyle = '#118ab2';
      c.beginPath();
      c.moveTo(w * 0.2, h * 0.52);
      c.lineTo(w * 0.425, h * 0.32);
      c.lineTo(w * 0.65, h * 0.52);
      c.fill();
      drawDoodle(c, 'star', w * 0.8, h * 0.18, 40 * u);
      break;
    case 1: // 꽃
      for (const fx of [0.3, 0.55, 0.78]) {
        crayon(c, [[w * fx, h * 0.8], [w * fx, h * 0.5]], '#2a9d8f', 5 * u);
        c.fillStyle = ['#ff8fab', '#ffd166', '#b197fc'][Math.floor(fx * 3) % 3];
        for (let k = 0; k < 5; k++) {
          c.beginPath();
          c.arc(w * fx + Math.cos(k * 1.26) * 12 * u, h * 0.45 + Math.sin(k * 1.26) * 12 * u, 9 * u, 0, Math.PI * 2);
          c.fill();
        }
      }
      break;
    case 2: // 무지개
      ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5'].forEach((col, k) => {
        c.strokeStyle = col;
        c.lineWidth = 9 * u;
        c.beginPath();
        c.arc(w / 2, h * 0.75, (70 - k * 10) * u, Math.PI, 0);
        c.stroke();
      });
      break;
    case 3: // 고양이
      c.fillStyle = '#f4a261';
      c.beginPath();
      c.arc(w / 2, h * 0.5, 34 * u, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(w / 2 - 30 * u, h * 0.42);
      c.lineTo(w / 2 - 20 * u, h * 0.28);
      c.lineTo(w / 2 - 6 * u, h * 0.4);
      c.moveTo(w / 2 + 30 * u, h * 0.42);
      c.lineTo(w / 2 + 20 * u, h * 0.28);
      c.lineTo(w / 2 + 6 * u, h * 0.4);
      c.fill();
      c.fillStyle = '#222';
      c.fillRect(w / 2 - 14 * u, h * 0.48, 5 * u, 6 * u);
      c.fillRect(w / 2 + 9 * u, h * 0.48, 5 * u, 6 * u);
      break;
    default: // 로켓
      c.fillStyle = '#e9ecef';
      c.beginPath();
      c.ellipse(w / 2, h * 0.45, 18 * u, 46 * u, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#e63946';
      c.beginPath();
      c.moveTo(w / 2 - 18 * u, h * 0.32);
      c.lineTo(w / 2, h * 0.16);
      c.lineTo(w / 2 + 18 * u, h * 0.32);
      c.fill();
      c.fillStyle = '#ffb703';
      c.beginPath();
      c.moveTo(w / 2 - 10 * u, h * 0.66);
      c.lineTo(w / 2, h * 0.78);
      c.lineTo(w / 2 + 10 * u, h * 0.66);
      c.fill();
  }
  c.fillStyle = '#666';
  c.font = font(Math.round(13 * u), 600);
  c.textAlign = 'right';
  c.fillText(['김○○', '이○○', '박○○', '최○○', '정○○'][i % 5], w - 12 * u, h - 10 * u);
}
