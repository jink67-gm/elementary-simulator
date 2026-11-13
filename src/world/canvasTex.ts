import * as THREE from 'three';

export const FONT = `"Pretendard","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif`;

/** 글자를 그려 넣는 캔버스 텍스처 */
export class CanvasTex {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;

  constructor(w: number, h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
  }

  draw(fn: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
    this.ctx.save();
    fn(this.ctx, this.canvas.width, this.canvas.height);
    this.ctx.restore();
    this.tex.needsUpdate = true;
  }

  material(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
  }
}

export function font(px: number, bold = false) {
  return `${bold ? 'bold ' : ''}${px}px ${FONT}`;
}

export function wrapText(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): number {
  let line = '';
  for (const ch of text) {
    if (ch === '\n') {
      c.fillText(line, x, y);
      y += lineH;
      line = '';
      continue;
    }
    const test = line + ch;
    if (c.measureText(test).width > maxW && line) {
      c.fillText(line, x, y);
      y += lineH;
      line = ch;
    } else line = test;
  }
  if (line) c.fillText(line, x, y);
  return y + lineH;
}
