export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

/** 버튼 글자 속 키 안내('[E] 일어나기', '자르기! (Space)', 'A 북쪽으로')를 따로 감싼다. 터치 화면에서는 숨긴다 */
const KEY_RE = /(Esc|Space|Enter|Tab|Shift|Backspace|[A-Z]|[0-9](?:~[0-9])?|[←→↑↓])/;
export function keyHintNodes(label: string): (Node | string)[] {
  let m = label.match(new RegExp(`^\\[${KEY_RE.source}\\]\\s*`));
  if (m) return [el('span', { class: 'kb' }, m[0]), label.slice(m[0].length)];
  m = label.match(new RegExp(`\\s*\\(${KEY_RE.source}\\)$`));
  if (m) return [label.slice(0, m.index), el('span', { class: 'kb' }, m[0])];
  m = label.match(/^[A-Z]\s(?=[가-힣])/);
  if (m) return [el('span', { class: 'kb' }, m[0]), label.slice(m[0].length)];
  return [label];
}

export function button(label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = el('button', { class: cls, type: 'button' }, ...keyHintNodes(label));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 받침 있는 말 뒤에는 '과', 없으면 '와' */
export function wa(word: string): string {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return '와';
  return (c - 0xac00) % 28 ? '과' : '와';
}
