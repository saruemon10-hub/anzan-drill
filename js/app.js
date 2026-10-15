import {
  ARITH_COUNT, MINI_COUNT, LEVELS, KUKU_MENUS, MINI_GAMES, ANKI_MIN_DIGITS, ANKI_MAX_DIGITS,
  generateArith, generateKuku, generateMini, makeAnki,
} from './problems.js';
import { sfx, unlock, setEnabled } from './sound.js';
import { say, stopVoice, unlockVoice, setVoiceEnabled, problemSpeech } from './voice.js';

const $ = (id) => document.getElementById(id);
const el = {
  mode: $('lcd-mode'),
  prog: $('lcd-prog'),
  time: $('lcd-time'),
  main: $('lcd-main'),
  sub: $('lcd-sub'),
  hint: $('lcd-hint'),
  bar: $('lcd-bar'),
  light: $('score-light'),
  power: $('power'),
  timeBtn: document.querySelector('[data-key="time"]'),
};
const keyEls = [...document.querySelectorAll('[data-key]')];

const MODE_KEYS = ['add', 'sub', 'mul', 'div', 'mini'];
const POWER_KEYS = { 'pow-on': 'on', 'pow-mute': 'mute', 'pow-off': 'off' };
const MODE_NAME = { add: 'たしざん', sub: 'ひきざん', mul: 'かけざん', div: 'わりざん', mini: 'ミニゲーム' };
const OP_CHAR = { add: '＋', sub: '－', div: '÷' };
const LEVEL_DESC = {
  add: ['1けた どうし', '1けたと 2けた', '2けた どうし'],
  sub: ['1けた どうし', '1けたと 2けた', '2けた どうし'],
  div: ['くくを つかう', '2けたを わる'],
};
const KUKU_NAME = { order: 'じゅんばん', reverse: 'さかさま', random: 'ばらばら' };
const KUKU_DESC = { order: '×1から じゅんに', reverse: '×9から ぎゃくに', random: 'ばらばらの じゅん' };
const MINI_NAME = { anki: 'あんき', kisoku: 'きそくさがし', awase: 'あわせて100' };
const MINI_DESC = { anki: 'きえる すうじを おぼえよう', kisoku: 'きそくを みつけて つぎの かず', awase: 'あと いくつで 100 になる？' };
const MINI_QHINT = { kisoku: 'つぎに くる かずは？', awase: 'あわせて 100 に しよう' };

const TIME_STEPS = [0, 10, 5];
const OK_MS = 550;
const NG_MS = 1300;
// 声で答えを言うときは、言い終わるまで次の問題に進まない
const NG_VOICE_MS = 2100;
const TIMEOUT_VOICE_MS = 2600;
const MAX_INPUT = 3;
const STORE_KEY = 'anzan-drill-settings';
// 版数（sw.js の CACHE とそろえて上げる）。画面の右下に表示する
const VERSION = '4';

const S = {
  phase: 'idle', // off | idle | select | memorize | question | feedback | result
  mode: null,
  level: 1,
  kukuMenu: 'order',
  dan: null,
  mini: 'anki',
  timeLimit: 0,
  power: 'on', // 電源スイッチ：on（音あり）| mute（音なし）| off
  problems: [],
  idx: 0,
  input: '',
  wrong: [],
  correct: 0,
  retry: false,
  ankiDigits: ANKI_MIN_DIGITS,
  last: null,
  remainSec: 0,
  notice: '',
};

// ---- 設定の保存 ----
function save() {
  try {
    const { mode, level, kukuMenu, mini, timeLimit } = S;
    const sound = S.power !== 'mute';
    localStorage.setItem(STORE_KEY, JSON.stringify({ mode, level, kukuMenu, mini, timeLimit, sound }));
  } catch {
    // 保存できない環境では無視する
  }
}

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!v) return;
    if (MODE_KEYS.includes(v.mode)) S.mode = v.mode;
    if (S.mode && LEVELS[S.mode] && v.level >= 1 && v.level <= LEVELS[S.mode]) S.level = v.level;
    if (KUKU_MENUS.includes(v.kukuMenu)) S.kukuMenu = v.kukuMenu;
    if (MINI_GAMES.includes(v.mini)) S.mini = v.mini;
    if (TIME_STEPS.includes(v.timeLimit)) S.timeLimit = v.timeLimit;
    if (v.sound === false) S.power = 'mute';
    if (S.mode) S.phase = 'select';
  } catch {
    // 壊れた値は無視する
  }
}

// ---- タイマー ----
let pending = null;
let raf = null;

function later(ms, fn) {
  clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    fn();
  }, ms);
}

function cancelTimers() {
  clearTimeout(pending);
  pending = null;
  cancelAnimationFrame(raf);
  raf = null;
}

function setBar(fraction) {
  const wrap = el.bar.parentElement;
  if (fraction === null) {
    wrap.classList.remove('show');
    return;
  }
  wrap.classList.add('show');
  el.bar.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
}

// ms のカウントダウン。バーを縮め、秒が変わるたびに onSecond を呼ぶ。
function countdown(ms, { onSecond, onEnd }) {
  cancelAnimationFrame(raf);
  const end = performance.now() + ms;
  let lastSec = null;
  const step = () => {
    const remain = end - performance.now();
    if (remain <= 0) {
      raf = null;
      setBar(0);
      onEnd();
      return;
    }
    setBar(remain / ms);
    const sec = Math.ceil(remain / 1000);
    if (sec !== lastSec) {
      lastSec = sec;
      onSecond?.(sec);
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

// ---- 採点ライト ----
function lightsOff() {
  el.light.classList.remove('ok', 'ng', 'blink');
}

function light(kind) {
  lightsOff();
  el.light.classList.add(kind);
}

function next(list, cur) {
  return list[(list.indexOf(cur) + 1) % list.length];
}

const cur = () => S.problems[S.idx];
const isSelecting = () => S.phase === 'select' || S.phase === 'idle';

// ---- キー操作 ----
function press(key) {
  S.notice = '';
  if (key in POWER_KEYS) return setPower(POWER_KEYS[key]);
  if (S.phase === 'off') return;
  if (MODE_KEYS.includes(key)) return onMode(key);
  if (key === 'time') return onTime();
  if (/^\d$/.test(key)) return onDigit(key);
  if (key === 'clear') return onClear();
  if (key === 'ok') return onOk();
}

// 電源スイッチ：音あり／音なし／OFF
function setPower(pos) {
  if (pos === S.power) return;
  const wasOff = S.power === 'off';
  S.power = pos;
  setEnabled(pos === 'on');
  setVoiceEnabled(pos === 'on');
  if (pos === 'off') {
    cancelTimers();
    lightsOff();
    setBar(null);
    S.phase = 'off';
  } else {
    if (wasOff) {
      // 電源を入れたら、前回えらんだモードの選択画面から
      S.phase = S.mode ? 'select' : 'idle';
      S.problems = [];
      S.retry = false;
      sfx.start();
      say(selectSpeech(), 300);
    } else {
      sfx.select();
    }
    save();
  }
  render();
}

function onMode(m) {
  cancelTimers();
  lightsOff();
  setBar(null);
  if (isSelecting() && S.mode === m) {
    // 同じボタンをもう一度押すと、レベル・メニューが切り替わる
    if (m === 'mul') S.kukuMenu = next(KUKU_MENUS, S.kukuMenu);
    else if (m === 'mini') S.mini = next(MINI_GAMES, S.mini);
    else S.level = (S.level % LEVELS[m]) + 1;
  } else if (S.mode !== m) {
    // 別のモードに切り替えたときは、最初のレベル・メニューから
    S.mode = m;
    S.level = 1;
    S.kukuMenu = KUKU_MENUS[0];
    S.dan = null;
    S.mini = MINI_GAMES[0];
  }
  // 出題中・結果画面で同じモードを押したときは、設定はそのままで選択画面へ戻る
  S.phase = 'select';
  sfx.select();
  say(selectSpeech());
  save();
  render();
}

function onTime() {
  if (!isSelecting()) return;
  S.timeLimit = next(TIME_STEPS, S.timeLimit);
  S.notice = S.timeLimit ? `じかんせいげん：1もん ${S.timeLimit}びょう` : 'じかんせいげん：なし';
  sfx.select();
  say(S.timeLimit ? `じかんせいげん、${S.timeLimit}びょう` : 'じかんせいげん、なし');
  save();
  render();
}

function onDigit(d) {
  if (S.phase === 'select' && S.mode === 'mul') {
    if (d === '0') return;
    S.dan = Number(d);
    sfx.key();
    say(`${d}のだん`);
    render();
    return;
  }
  if (S.phase !== 'question') return;
  const p = cur();
  const max = p.kind === 'anki' ? p.answer.length : MAX_INPUT;
  // 計算問題では先頭の 0 を置きかえる（電卓と同じ）。あんきは 0 から始まる数字もある。
  if (p.kind !== 'anki' && S.input === '0') S.input = '';
  if (S.input.length >= max) return;
  S.input += d;
  sfx.key();
  render();
}

function onClear() {
  if (S.phase === 'question') {
    S.input = '';
  } else if (S.phase === 'select' && S.mode === 'mul') {
    S.dan = null;
  } else {
    return;
  }
  sfx.key();
  render();
}

function onOk() {
  if (S.phase === 'select') return startGame();
  if (S.phase === 'question') {
    if (S.input === '') return;
    return grade(false);
  }
  if (S.phase === 'result') {
    if (S.wrong.length) {
      sfx.start();
      startRound(S.wrong, true);
    } else {
      lightsOff();
      S.phase = 'select';
      sfx.select();
      say(selectSpeech());
      render();
    }
    return;
  }
  if (S.phase === 'idle') {
    S.notice = 'さきに モードを えらんでね';
    say(S.notice);
    render();
  }
}

// ---- 出題の流れ ----
function startGame() {
  let problems;
  if (S.mode === 'mul') {
    if (!S.dan) {
      S.notice = 'すうじで だんを えらんでね';
      sfx.wrong();
      say(S.notice, 400);
      render();
      return;
    }
    problems = generateKuku(S.dan, S.kukuMenu);
  } else if (S.mode === 'mini') {
    if (S.mini === 'anki') {
      // あんきは正解するたびに桁が増えるので、1 問ずつその場で作る
      S.ankiDigits = ANKI_MIN_DIGITS;
      problems = new Array(MINI_COUNT).fill(null);
    } else {
      problems = generateMini(S.mini, MINI_COUNT);
    }
  } else {
    problems = generateArith(S.mode, S.level, ARITH_COUNT);
  }
  sfx.start();
  startRound(problems, false);
}

function startRound(problems, retry) {
  S.problems = problems.slice();
  S.idx = 0;
  S.wrong = [];
  S.correct = 0;
  S.retry = retry;
  nextQuestion();
}

function nextQuestion() {
  lightsOff();
  S.input = '';
  S.last = null;
  if (!S.problems[S.idx]) S.problems[S.idx] = makeAnki(S.ankiDigits);
  if (cur().kind === 'anki') beginMemorize();
  else beginQuestion();
}

function beginMemorize() {
  S.phase = 'memorize';
  say('おぼえてね');
  render();
  const ms = 1000 + 450 * cur().memo.length;
  countdown(ms, { onEnd: beginQuestion });
}

function beginQuestion() {
  S.phase = 'question';
  const p = cur();
  say(p.kind === 'anki' ? 'すうじを いれてね' : problemSpeech(p));
  render();
  startLimit();
}

function startLimit() {
  if (!S.timeLimit) {
    setBar(null);
    return;
  }
  countdown(S.timeLimit * 1000, {
    onSecond: (sec) => {
      S.remainSec = sec;
      renderStatus();
      if (sec <= 3) sfx.tick();
    },
    onEnd: () => grade(true),
  });
}

function grade(timeout) {
  cancelTimers();
  const p = cur();
  const ok = !timeout && S.input === p.answer;
  S.last = { ok, timeout };
  stopVoice();
  let wait = OK_MS;
  if (ok) {
    S.correct++;
    light('ok');
    sfx.correct();
    if (p.kind === 'anki' && !S.retry) S.ankiDigits = Math.min(ANKI_MAX_DIGITS, S.ankiDigits + 1);
  } else {
    S.wrong.push(p);
    light('ng');
    sfx.wrong();
    // ブブーのあとに正しい答えを言う（あんきは 1 けたずつ）
    const answer = p.kind === 'anki' ? p.answer.split('').join('、') : p.answer;
    say(`${timeout ? 'じかんぎれ。' : ''}こたえは ${answer}`, 450);
    wait = S.power !== 'on' ? NG_MS : timeout || p.kind === 'anki' ? TIMEOUT_VOICE_MS : NG_VOICE_MS;
  }
  S.phase = 'feedback';
  render();
  later(wait, () => {
    S.idx++;
    if (S.idx < S.problems.length) nextQuestion();
    else showResult();
  });
}

function showResult() {
  lightsOff();
  setBar(null);
  S.phase = 'result';
  const score = Math.round((100 * S.correct) / S.problems.length);
  if (S.wrong.length === 0) {
    el.light.classList.add('blink');
    sfx.fanfare();
    say(S.retry ? 'ぜんぶ できたね！' : `ぜんもん せいかい！ ${score}てん！`, 1300);
  } else {
    sfx.finish();
    say(`${score}てん。まちがえた もんだいを もういちど やってみよう`, 700);
  }
  render();
}

// 選択画面で話す案内
function selectSpeech() {
  if (!S.mode) return 'モードを えらんでね';
  if (S.mode === 'mul') return `かけざん、${KUKU_NAME[S.kukuMenu]}`;
  if (S.mode === 'mini') return MINI_NAME[S.mini];
  return `${MODE_NAME[S.mode]}、レベル${S.level}`;
}

// ---- 表示 ----
function modeLabel() {
  if (!S.mode) return '';
  if (S.mode === 'mul') return `${S.dan}のだん`;
  if (S.mode === 'mini') return MINI_NAME[S.mini];
  return `${MODE_NAME[S.mode]}${S.level}`;
}

// 液晶の上の段：左にモード、まん中に問題番号、右に制限時間（実機と同じ並び）
function renderStatus() {
  const playing = ['memorize', 'question', 'feedback'].includes(S.phase);
  let left = '';
  let prog = '';
  let time = '';
  if (isSelecting()) {
    left = S.mode ? MODE_NAME[S.mode] : '';
    time = S.timeLimit ? `⏱${S.timeLimit}` : '';
  } else if (S.phase !== 'off') {
    left = S.retry && playing ? 'もういちど' : modeLabel();
    if (playing) prog = `${S.idx + 1}/${S.problems.length}`;
    if (S.timeLimit && playing) time = `⏱${S.phase === 'question' ? S.remainSec : S.timeLimit}`;
  }
  el.mode.textContent = left;
  el.prog.textContent = prog;
  el.time.textContent = time;
}

function setMain(className, text) {
  el.main.className = `lcd-main${className ? ` ${className}` : ''}`;
  el.main.textContent = text;
}

// before + 入力欄 + after を表示する
function renderProblem(p, input, ansClass) {
  setMain('', '');
  const ans = document.createElement('span');
  ans.className = `ans ${ansClass}`;
  ans.textContent = input;
  el.main.append(p.before, ans, p.after);
}

function render() {
  document.body.dataset.phase = S.phase;
  // 新しい版が届いていたら、問題を解いていないときに読み込み直す
  if (updateReady && (isSelecting() || S.phase === 'off')) {
    location.reload();
    return;
  }
  el.power.dataset.pos = S.power;
  el.timeBtn.classList.toggle('active', S.timeLimit > 0 && S.phase !== 'off');
  renderStatus();

  const p = cur();
  switch (S.phase) {
    case 'off':
      setMain('', '');
      el.sub.textContent = '';
      el.hint.textContent = '';
      break;

    case 'idle':
      setMain('text', 'モードを えらんでね');
      el.sub.textContent = '＋ － × ÷ か ✦（ミニゲーム）';
      el.hint.textContent = S.notice || 'ひだり よこの ⏱ボタンで じかんせいげん';
      break;

    case 'select':
      if (S.mode === 'mul') {
        setMain('text', S.dan ? `${S.dan} の だん` : '？ の だん');
        el.sub.textContent = `${KUKU_NAME[S.kukuMenu]}：${KUKU_DESC[S.kukuMenu]}`;
        el.hint.textContent = S.notice || (S.dan ? 'OKで スタート ・ ×で メニュー' : 'すうじで だんを えらんでね ・ ×で メニュー');
      } else if (S.mode === 'mini') {
        setMain('text', MINI_NAME[S.mini]);
        el.sub.textContent = MINI_DESC[S.mini];
        el.hint.textContent = S.notice || '✦で かえる ・ OKで スタート';
      } else {
        setMain('text', `レベル ${S.level}`);
        el.sub.textContent = LEVEL_DESC[S.mode][S.level - 1];
        el.hint.textContent = S.notice || `${OP_CHAR[S.mode]}で レベル ・ OKで スタート`;
      }
      break;

    case 'memorize':
      setMain('memo', p.memo);
      el.sub.textContent = 'おぼえてね！';
      el.hint.textContent = '';
      break;

    case 'question':
      renderProblem(p, S.input, 'typing');
      el.sub.textContent = p.kind === 'anki' ? `${p.answer.length}けたの すうじは？` : (MINI_QHINT[p.kind] ?? '');
      el.hint.textContent = '';
      break;

    case 'feedback':
      if (S.last.ok) {
        renderProblem(p, S.input, '');
        el.sub.textContent = '◯ せいかい！';
        el.hint.textContent = '';
      } else {
        renderProblem(p, S.last.timeout ? '' : S.input, 'wrong');
        el.sub.textContent = `${S.last.timeout ? '× じかんぎれ！' : '× ざんねん'}  こたえは ${p.answer}`;
        el.hint.textContent = '';
      }
      break;

    case 'result': {
      const n = S.problems.length;
      const perfect = S.wrong.length === 0;
      setMain('text', `${Math.round((100 * S.correct) / n)} てん`);
      el.sub.textContent = `${n}もんの うち ${S.correct}もん せいかい${perfect ? '！' : ''}`;
      if (perfect) el.hint.textContent = S.retry ? 'ぜんぶ できたね！ OKで もどる' : 'ぜんもん せいかい！ OKで もどる';
      else el.hint.textContent = 'OK：もういちど ／ ＋－×÷✦：やめる';
      break;
    }
  }
}

// ---- 入力イベント ----
for (const btn of keyEls) {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unlock();
    btn.classList.add('pressed');
    press(btn.dataset.key);
  });
  const release = () => btn.classList.remove('pressed');
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

// iOS は touchend / click の中でしか音と声を有効にできないため、ここで unlock する
for (const type of ['touchend', 'pointerup', 'click']) {
  document.addEventListener(type, () => {
    unlock();
    unlockVoice();
  }, { passive: true });
}
// ピンチ拡大・ダブルタップ拡大・スクロールのはね返りを防ぐ
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// PC で確かめるためのキーボード操作
const KEYMAP = {
  Enter: 'ok', ' ': 'ok', Backspace: 'clear', Delete: 'clear', Escape: 'clear',
  '+': 'add', '-': 'sub', '*': 'mul', x: 'mul', '/': 'div', g: 'mini', t: 'time',
};
document.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  let key = /^\d$/.test(e.key) ? e.key : KEYMAP[e.key];
  if (e.key === 's' && S.power !== 'off') key = S.power === 'mute' ? 'pow-on' : 'pow-mute';
  if (!key) return;
  e.preventDefault();
  unlock();
  press(key);
  unlockVoice();
});

// アプリが裏に回ったら制限時間を止め、戻ったらその問題の時間を最初から数え直す
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (S.phase === 'question' || S.phase === 'memorize') {
      cancelAnimationFrame(raf);
      raf = null;
    }
  } else if (S.phase === 'question') {
    startLimit();
  } else if (S.phase === 'memorize') {
    beginMemorize();
  }
});

// ---- 更新とオフライン対応（Service Worker） ----
let updateReady = false;
const swAllowed = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && swAllowed) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    // iPhone のホーム画面アプリは、戻ってきても読み込み直さないので、戻るたびに新しい版がないか確かめる
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => {});
    });
  }).catch(() => {});
  // 新しい版に切り替わったら読み込み直す（出題中なら、選択画面に戻ったときに）
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || updateReady) return;
    updateReady = true;
    render();
  });
}

$('ver').textContent = `ver.${VERSION}`;

load();
setEnabled(S.power === 'on');
setVoiceEnabled(S.power === 'on');
render();
