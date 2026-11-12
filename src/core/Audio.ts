// 외부 소리 파일 없이 WebAudio로 만든 효과음. (에셋 라이선스 걱정 없음, 저사양에서도 가벼움)

type Tone = { f: number; t: number; d: number; type?: OscillatorType; g?: number };

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  volume = 0.7;

  /** 브라우저 자동재생 정책: 첫 클릭/키 입력 뒤에 호출 */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private tones(list: Tone[]) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.volume <= 0) return;
    const now = ctx.currentTime;
    for (const n of list) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = n.type ?? 'sine';
      o.frequency.value = n.f;
      const peak = n.g ?? 0.25;
      g.gain.setValueAtTime(0, now + n.t);
      g.gain.linearRampToValueAtTime(peak, now + n.t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
      o.connect(g).connect(this.master);
      o.start(now + n.t);
      o.stop(now + n.t + n.d + 0.05);
    }
  }

  private noise(dur: number, freq: number, gain = 0.15) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.volume <= 0) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  /** 학교 종소리 (딩-동-댕-동) */
  bell() {
    const s = [659, 523, 587, 392, 392, 587, 659, 523];
    this.tones(s.map((f, i) => ({ f, t: i * 0.42, d: 0.9, type: 'triangle', g: 0.22 })));
  }
  chime() {
    this.tones([
      { f: 784, t: 0, d: 0.5, type: 'triangle' },
      { f: 988, t: 0.18, d: 0.5, type: 'triangle' },
      { f: 1175, t: 0.36, d: 0.8, type: 'triangle' },
    ]);
  }
  pickup() {
    this.tones([{ f: 660, t: 0, d: 0.08, type: 'square', g: 0.08 }, { f: 990, t: 0.06, d: 0.1, type: 'square', g: 0.08 }]);
  }
  place() {
    this.tones([{ f: 220, t: 0, d: 0.12, type: 'triangle', g: 0.25 }]);
  }
  success() {
    this.tones([523, 659, 784, 1047].map((f, i) => ({ f, t: i * 0.09, d: 0.25, type: 'triangle' as OscillatorType, g: 0.2 })));
  }
  oops() {
    this.tones([{ f: 330, t: 0, d: 0.15, type: 'sawtooth', g: 0.08 }, { f: 262, t: 0.12, d: 0.25, type: 'sawtooth', g: 0.08 }]);
  }
  blip() {
    this.tones([{ f: 880, t: 0, d: 0.04, type: 'square', g: 0.04 }]);
  }
  talk() {
    this.tones([{ f: 500 + Math.random() * 200, t: 0, d: 0.05, type: 'square', g: 0.03 }]);
  }
  page() {
    this.noise(0.18, 2500, 0.2);
  }
  whoosh() {
    this.noise(0.5, 900, 0.25);
  }
  kick() {
    this.tones([{ f: 120, t: 0, d: 0.12, type: 'sine', g: 0.5 }]);
    this.noise(0.06, 1200, 0.15);
  }
  cheer() {
    this.noise(1.2, 1500, 0.12);
  }
  rumble() {
    this.tones([{ f: 55, t: 0, d: 1.6, type: 'sawtooth', g: 0.15 }, { f: 41, t: 0.2, d: 1.6, type: 'sine', g: 0.3 }]);
  }
}
