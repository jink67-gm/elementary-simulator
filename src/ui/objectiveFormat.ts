// 「지금 할 일」 긴 문장을 나눠 보여 주기 위한 순수 함수.
// 예) "가방 메고 … 걸기 (횡단보도 → 교문 → 현관)" → 본문 + 길 순서(칩)
//     "발표 준비: 단서 찾기(E) · 짝과 이야기(E) · F로 손 들기" → 본문 + 할 일 목록
//     "조각 담기(F) — 3/5" → 본문 + 진행 메모

export interface ObjectiveParts {
  main: string;
  /** 길 순서 (A → B → C) */
  route: string[];
  /** 고를 수 있는 일·여러 할 일 (한 줄에 하나) */
  list: string[];
  /** 덧붙임 (진행 수, 위치 설명 등) */
  note: string;
}

/** 괄호 밖(깊이 0)의 sep에서만 자른다 */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '「') depth++;
    else if ((ch === ')' || ch === '」') && depth > 0) depth--;
    if (depth === 0 && s.startsWith(sep, i)) {
      out.push(cur);
      cur = '';
      i += sep.length - 1;
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** 끝에 붙은 긴 괄호 (짧은 "(E)"·"(F)"는 본문에 둔다) */
function trailingParen(s: string): [string, string] | null {
  const t = s.trimEnd();
  if (!t.endsWith(')')) return null;
  let depth = 0;
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] === ')') depth++;
    else if (t[i] === '(') {
      depth--;
      if (depth === 0) {
        const inner = t.slice(i + 1, -1).trim();
        const head = t.slice(0, i).trim();
        if (inner.length <= 6 || !head) return null;
        return [head, inner];
      }
    }
  }
  return null;
}

export function formatObjective(text: string): ObjectiveParts {
  const parts: ObjectiveParts = { main: text.trim(), route: [], list: [], note: '' };
  if (parts.main.length <= 26) return parts;
  // 1) "— 메모"
  const dash = splitTop(parts.main, ' — ');
  let body = dash[0];
  const notes: string[] = dash.slice(1);
  // 2) 괄호 밖 " · " → 여러 할 일
  const segs = splitTop(body, ' · ');
  body = segs[0];
  const extra = segs.slice(1);
  // 3) 끝 괄호: 화살표면 길 순서, " · "면 목록, 아니면 메모
  const tp = trailingParen(body);
  if (tp) {
    const [head, inner] = tp;
    body = head;
    if (inner.includes('→')) parts.route = inner.split('→').map((x) => x.trim()).filter(Boolean);
    else if (inner.includes(' · ')) parts.list.push(...splitTop(inner, ' · '));
    else notes.unshift(inner);
  }
  // 4) 여러 할 일이 있으면 "제목: 첫 일" / "제목! 첫 일"을 나눈다
  if (extra.length) {
    const m = body.match(/^(.{2,24}?[:!])\s+(.+)$/);
    if (m) {
      body = m[1].replace(/:$/, '');
      parts.list.unshift(m[2]);
    } else if (!parts.list.length && !parts.route.length && body.length > 18) {
      parts.list.unshift(body);
      body = '';
    }
    parts.list.push(...extra);
  }
  parts.main = body || parts.list.shift() || text;
  parts.note = notes.join(' · ');
  return parts;
}
