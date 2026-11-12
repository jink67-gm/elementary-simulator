// 2교시 수학 퀴즈 — 학년(4~6)에 맞춘 3문제. 순수 로직.

export interface QuizQuestion {
  text: string;
  answer: string; // 정답 표기 (숫자·분수·소수)
  hint: string;
}

export type Grade = 4 | 5 | 6;

const POOLS: Record<Grade, QuizQuestion[][]> = {
  4: [
    [
      { text: '48 ÷ 6 = ?', answer: '8', hint: '6단을 떠올려 봐요. 6 × 8 = 48' },
      { text: '125 + 278 = ?', answer: '403', hint: '일의 자리부터 받아올림!' },
    ],
    [
      { text: '0.3 + 0.45 = ?', answer: '0.75', hint: '소수점끼리 줄을 맞춰요.' },
      { text: '2/7 + 3/7 = ? (분수로)', answer: '5/7', hint: '분모가 같으면 분자끼리 더해요.' },
    ],
    [
      { text: '24 × 15 = ?', answer: '360', hint: '24 × 10 + 24 × 5' },
      { text: '직사각형 가로 8cm, 세로 5cm. 둘레는? (cm)', answer: '26', hint: '(8 + 5) × 2' },
    ],
  ],
  5: [
    [
      { text: '48 ÷ 6 = ?', answer: '8', hint: '6 × 8 = 48' },
      { text: '12와 18의 최대공약수는?', answer: '6', hint: '둘 다 나누어떨어지는 가장 큰 수' },
    ],
    [
      { text: '3/4 을 소수로 나타내면?', answer: '0.75', hint: '3 ÷ 4' },
      { text: '1/2 + 1/3 = ? (분수로)', answer: '5/6', hint: '통분하면 3/6 + 2/6' },
    ],
    [
      { text: '2.5 × 4 = ?', answer: '10', hint: '2.5를 네 번 더해요.' },
      { text: '삼각형 밑변 6cm, 높이 4cm. 넓이는? (cm²)', answer: '12', hint: '밑변 × 높이 ÷ 2' },
    ],
  ],
  6: [
    [
      { text: '3/4 ÷ 3 = ? (분수로)', answer: '1/4', hint: '3/4을 똑같이 셋으로 나눠요.' },
      { text: '48 ÷ 6 = ?', answer: '8', hint: '6 × 8 = 48' },
    ],
    [
      { text: '3/4 을 소수로 나타내면?', answer: '0.75', hint: '3 ÷ 4' },
      { text: '7.2 ÷ 0.9 = ?', answer: '8', hint: '72 ÷ 9 와 같아요.' },
    ],
    [
      { text: '2.5 × 4 = ?', answer: '10', hint: '2.5를 네 번 더해요.' },
      { text: '2 : 5 = 6 : □ 에서 □는?', answer: '15', hint: '앞의 수가 3배가 되었어요.' },
    ],
  ],
};

/** 각 단계에서 하나씩 뽑아 3문제. rng는 0~1을 돌려주는 함수. */
export function pickQuestions(grade: Grade, rng: () => number = Math.random): QuizQuestion[] {
  return POOLS[grade].map((tier) => tier[Math.floor(rng() * tier.length) % tier.length]);
}

function toNumber(s: string): number | null {
  const t = s.replace(/\s+/g, '');
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  const m = /^(-?\d+)\/(\d+)$/.exec(t);
  if (m && Number(m[2]) !== 0) return Number(m[1]) / Number(m[2]);
  return null;
}

/** 0.75와 3/4, 8과 8.0처럼 값이 같으면 정답. 분수 문제는 약분 전 값도 인정. */
export function checkAnswer(input: string, answer: string): boolean {
  const a = toNumber(input);
  const b = toNumber(answer);
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 1e-9;
}
