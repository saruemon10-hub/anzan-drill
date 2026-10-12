// 問題生成（純関数）。rng は [0, 1) を返す関数。
// 問題は { kind, before, after, answer } の形。画面には before + 入力 + after を表示する。
// answer は文字列で、採点は入力文字列との一致で行う。

export const ARITH_COUNT = 20;
export const KUKU_COUNT = 9;
export const MINI_COUNT = 20;

export const LEVELS = { add: 3, sub: 3, div: 2 };
export const KUKU_MENUS = ['order', 'reverse', 'random'];
export const MINI_GAMES = ['anki', 'kisoku', 'awase'];

export const ANKI_MIN_DIGITS = 3;
export const ANKI_MAX_DIGITS = 8;

const OP_SIGN = { add: '+', sub: '−', mul: '×', div: '÷' };

export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function problemKey(p) {
  return `${p.kind}|${p.before}|${p.after}|${p.memo ?? ''}`;
}

function arith(op, a, b, answer) {
  return { kind: 'arith', op, a, b, before: `${a} ${OP_SIGN[op]} ${b} = `, after: '', answer: String(answer) };
}

// 重複のない問題を count 個作る。組み合わせが足りないときは重複を許して埋める。
function uniqueList(count, make, maxTries = 5000) {
  const seen = new Set();
  const list = [];
  for (let tries = 0; list.length < count && tries < maxTries; tries++) {
    const p = make();
    const key = problemKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(p);
  }
  while (list.length < count) list.push(make());
  return list;
}

export function makeArith(op, level, rng = Math.random) {
  if (op === 'add') {
    if (level === 1) return addOf(randInt(rng, 1, 9), randInt(rng, 1, 9));
    if (level === 2) {
      const one = randInt(rng, 1, 9);
      const two = randInt(rng, 10, 99);
      return rng() < 0.5 ? addOf(one, two) : addOf(two, one);
    }
    return addOf(randInt(rng, 10, 99), randInt(rng, 10, 99));
  }
  if (op === 'sub') {
    if (level === 1) {
      const a = randInt(rng, 1, 9);
      return subOf(a, randInt(rng, 1, a));
    }
    if (level === 2) return subOf(randInt(rng, 10, 99), randInt(rng, 1, 9));
    const a = randInt(rng, 10, 99);
    return subOf(a, randInt(rng, 10, a));
  }
  if (op === 'div') {
    if (level === 1) return divOf(randInt(rng, 1, 9), randInt(rng, 1, 9));
    // 除数を先に一様に選ぶ（組み合わせから一様に選ぶと ÷2 ばかりになるため）
    const b = randInt(rng, 2, 9);
    return divOf(b, randInt(rng, 10, Math.floor(99 / b)));
  }
  throw new Error(`unknown op: ${op}`);
}

function addOf(a, b) { return arith('add', a, b, a + b); }
function subOf(a, b) { return arith('sub', a, b, a - b); }
function divOf(b, q) { return arith('div', b * q, b, q); }

export function generateArith(op, level, count = ARITH_COUNT, rng = Math.random) {
  return uniqueList(count, () => makeArith(op, level, rng));
}

export function generateKuku(dan, menu, rng = Math.random) {
  let ms = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  if (menu === 'reverse') ms.reverse();
  else if (menu === 'random') ms = shuffle(ms, rng);
  return ms.map((m) => arith('mul', dan, m, dan * m));
}

// あんき：digits 桁の数字（先頭の 0 も可）。同じ数字だけの並びは避ける。
export function makeAnki(digits, rng = Math.random) {
  let s;
  do {
    s = '';
    for (let i = 0; i < digits; i++) s += String(randInt(rng, 0, 9));
  } while (/^(\d)\1+$/.test(s));
  return { kind: 'anki', memo: s, before: '', after: '', answer: s };
}

// きそくさがし：3 つの数の次の数を答える。等差（増える・減る）と、ときどき 2 倍。
export function makeKisoku(rng = Math.random) {
  const r = rng();
  let seq;
  let rule;
  if (r < 0.15) {
    const s = randInt(rng, 1, 12);
    seq = [s, s * 2, s * 4, s * 8];
    rule = 'x2';
  } else if (r < 0.6) {
    const d = randInt(rng, 1, 10);
    const s = randInt(rng, 0, 60);
    seq = [s, s + d, s + 2 * d, s + 3 * d];
    rule = `+${d}`;
  } else {
    const d = randInt(rng, 1, 10);
    const last = randInt(rng, 0, 50);
    seq = [last + 3 * d, last + 2 * d, last + d, last];
    rule = `-${d}`;
  }
  return { kind: 'kisoku', seq: seq.slice(0, 3), rule, before: `${seq[0]}  ${seq[1]}  ${seq[2]}  `, after: '', answer: String(seq[3]) };
}

// あわせて100：画面に出る 2 つの数に、あといくつ足せば 100 になるか（例：35 と 15 → 50）。
export function makeAwase(rng = Math.random) {
  const total = randInt(rng, 10, 99);
  const a = randInt(rng, 1, total - 1);
  const b = total - a;
  return { kind: 'awase', a, b, before: `${a}  ${b}  `, after: '', answer: String(100 - total) };
}

export function generateMini(game, count = MINI_COUNT, rng = Math.random) {
  if (game === 'kisoku') return uniqueList(count, () => makeKisoku(rng));
  if (game === 'awase') return uniqueList(count, () => makeAwase(rng));
  throw new Error(`generateMini does not handle: ${game}`);
}
