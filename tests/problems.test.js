import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARITH_COUNT, KUKU_COUNT, MINI_COUNT, ANKI_MAX_DIGITS,
  generateArith, generateKuku, generateMini, makeAnki, problemKey,
} from '../js/problems.js';

const RUNS = 1000;

// 再現できるように固定シードの乱数を使う（mulberry32）
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const digits = (n) => String(n).length;

function eachRound(op, level, check) {
  for (let seed = 1; seed <= RUNS; seed++) {
    const list = generateArith(op, level, ARITH_COUNT, seeded(seed));
    assert.equal(list.length, ARITH_COUNT);
    assert.equal(new Set(list.map(problemKey)).size, ARITH_COUNT, '1 回の中で重複がない');
    for (const p of list) check(p);
  }
}

test('たし算 Lv1：1ケタどうし', () => {
  eachRound('add', 1, ({ a, b, answer }) => {
    assert.ok(a >= 1 && a <= 9 && b >= 1 && b <= 9);
    assert.equal(answer, String(a + b));
  });
});

test('たし算 Lv2：1ケタと2ケタ（左右どちらもある）', () => {
  let oneFirst = 0;
  eachRound('add', 2, ({ a, b, answer }) => {
    assert.deepEqual([digits(a), digits(b)].sort(), [1, 2]);
    assert.ok(Math.min(a, b) >= 1);
    if (digits(a) === 1) oneFirst++;
    assert.equal(answer, String(a + b));
  });
  const ratio = oneFirst / (RUNS * ARITH_COUNT);
  assert.ok(ratio > 0.4 && ratio < 0.6, `1ケタが左の割合 ${ratio}`);
});

test('たし算 Lv3：2ケタどうし', () => {
  eachRound('add', 3, ({ a, b, answer }) => {
    assert.ok(digits(a) === 2 && digits(b) === 2);
    assert.equal(answer, String(a + b));
  });
});

test('ひき算 Lv1：1ケタどうし、答え 0 以上', () => {
  eachRound('sub', 1, ({ a, b, answer }) => {
    assert.ok(a >= 1 && a <= 9 && b >= 1 && b <= 9);
    assert.ok(a - b >= 0);
    assert.equal(answer, String(a - b));
  });
});

test('ひき算 Lv2：2ケタ − 1ケタ', () => {
  eachRound('sub', 2, ({ a, b, answer }) => {
    assert.ok(digits(a) === 2 && b >= 1 && b <= 9);
    assert.equal(answer, String(a - b));
  });
});

test('ひき算 Lv3：2ケタどうし、答え 0 以上', () => {
  eachRound('sub', 3, ({ a, b, answer }) => {
    assert.ok(digits(a) === 2 && digits(b) === 2);
    assert.ok(a - b >= 0);
    assert.equal(answer, String(a - b));
  });
});

test('わり算 Lv1：九九の範囲で割り切れる', () => {
  eachRound('div', 1, ({ a, b, answer }) => {
    const q = Number(answer);
    assert.ok(b >= 1 && b <= 9 && q >= 1 && q <= 9);
    assert.equal(a, b * q);
  });
});

test('わり算 Lv2：2ケタ ÷ 1ケタ、商は 2ケタ、除数が偏らない', () => {
  const count = new Map();
  eachRound('div', 2, ({ a, b, answer }) => {
    const q = Number(answer);
    assert.equal(digits(a), 2);
    assert.ok(b >= 2 && b <= 9);
    assert.ok(q >= 10);
    assert.equal(a, b * q);
    count.set(b, (count.get(b) ?? 0) + 1);
  });
  const total = RUNS * ARITH_COUNT;
  for (let b = 2; b <= 9; b++) {
    const ratio = (count.get(b) ?? 0) / total;
    assert.ok(ratio > 0.05, `÷${b} の割合 ${ratio}`);
  }
  assert.ok(count.get(2) / total < 0.25, `÷2 の割合 ${count.get(2) / total}`);
});

test('九九：じゅんばん・さかさま・ばらばら', () => {
  for (let dan = 1; dan <= 9; dan++) {
    const order = generateKuku(dan, 'order');
    assert.equal(order.length, KUKU_COUNT);
    assert.deepEqual(order.map((p) => p.b), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    order.forEach((p) => {
      assert.equal(p.a, dan);
      assert.equal(p.answer, String(dan * p.b));
    });
    assert.deepEqual(generateKuku(dan, 'reverse').map((p) => p.b), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
  }
  let shuffled = 0;
  for (let seed = 1; seed <= RUNS; seed++) {
    const ms = generateKuku(7, 'random', seeded(seed)).map((p) => p.b);
    assert.deepEqual(ms.slice().sort(), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    if (ms.join() !== '1,2,3,4,5,6,7,8,9') shuffled++;
  }
  assert.ok(shuffled > RUNS * 0.99);
});

test('あんき：桁数どおりで、答えは表示した数字そのもの', () => {
  for (let seed = 1; seed <= RUNS; seed++) {
    const rng = seeded(seed);
    for (let d = 3; d <= ANKI_MAX_DIGITS; d++) {
      const p = makeAnki(d, rng);
      assert.equal(p.memo.length, d);
      assert.match(p.memo, /^\d+$/);
      assert.equal(p.answer, p.memo);
      assert.doesNotMatch(p.memo, /^(\d)\1+$/);
    }
  }
});

test('きそくさがし：規則どおりの次の数、0 以上 999 以下', () => {
  const rules = new Set();
  for (let seed = 1; seed <= RUNS; seed++) {
    const list = generateMini('kisoku', MINI_COUNT, seeded(seed));
    assert.equal(list.length, MINI_COUNT);
    assert.equal(new Set(list.map(problemKey)).size, MINI_COUNT);
    for (const p of list) {
      const [x, y, z] = p.seq;
      const ans = Number(p.answer);
      if (p.rule === 'x2') {
        assert.ok(y === x * 2 && z === y * 2 && ans === z * 2);
        rules.add('x2');
      } else {
        const d = y - x;
        assert.ok(d !== 0 && z - y === d && ans - z === d);
        rules.add(d > 0 ? 'up' : 'down');
      }
      assert.ok(ans >= 0 && ans <= 999 && x >= 0 && y >= 0 && z >= 0);
    }
  }
  assert.deepEqual([...rules].sort(), ['down', 'up', 'x2']);
});

test('あわせて100：表示した数 + 答え = 100', () => {
  for (let seed = 1; seed <= RUNS; seed++) {
    const list = generateMini('awase', MINI_COUNT, seeded(seed));
    assert.equal(new Set(list.map(problemKey)).size, MINI_COUNT);
    for (const p of list) {
      assert.ok(p.n >= 1 && p.n <= 99);
      assert.equal(p.n + Number(p.answer), 100);
    }
  }
});
