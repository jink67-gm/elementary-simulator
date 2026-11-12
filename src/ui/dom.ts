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

export function button(label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = el('button', { class: cls, type: 'button' }, label);
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
