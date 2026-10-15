// 効果音（Web Audio で合成。音声ファイルは使わない）
// iOS で音を出すための対策：
// - 音を有効にできるのはユーザー操作（touchend / pointerup / click / keydown）の中だけ。そこで unlock() を呼ぶ
// - 有効になる前に鳴らそうとした音は、有効になった直後に鳴らす（最初のタップの音が消えないように）
// - マナーモード（消音スイッチ）中でも鳴るように、音声の種類を「再生」にする

let ctx = null;
let enabled = true;
let pending = null;
let keepAlive = null;

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// iOS 16.4 以降：Audio Session API で消音スイッチの影響を受けない「再生」にする。
// 音なしのときは、ほかのアプリの音楽を止めないよう「環境音」に戻す。
function applySession() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = enabled ? 'playback' : 'ambient';
  } catch {
    // 対応していない環境では何もしない
  }
}

// 古い iOS（Audio Session API がない）向け：無音の <audio> をくり返し流して「再生」扱いにする
function silentWavUrl() {
  const n = 4000;
  const buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer);
  const ascii = (offset, s) => { for (let i = 0; i < s.length; i++) buf[offset + i] = s.charCodeAt(i); };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + n, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  ascii(36, 'data');
  dv.setUint32(40, n, true);
  buf.fill(128, 44);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function updateKeepAlive() {
  if (!isIOS || navigator.audioSession) return;
  try {
    if (enabled && !document.hidden) {
      if (!keepAlive) {
        keepAlive = new Audio(silentWavUrl());
        keepAlive.loop = true;
      }
      if (keepAlive.paused) keepAlive.play().catch(() => {});
    } else if (keepAlive && !keepAlive.paused) {
      keepAlive.pause();
    }
  } catch {
    // 無視する
  }
}

document.addEventListener('visibilitychange', updateKeepAlive);

export function setEnabled(on) {
  enabled = on;
  if (!on) pending = null;
  applySession();
  updateKeepAlive();
}

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    applySession();
    ctx = new AC();
  }
  return ctx;
}

// ユーザー操作の中で呼ぶ。止まっている（suspended / interrupted）ときは再開する。
export function unlock() {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state !== 'running') {
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
      c.resume().then(flush, () => {});
    }
    updateKeepAlive();
  } catch {
    // 音が出せない環境では無視する
  }
}

function flush() {
  if (!pending) return;
  const { notes, at } = pending;
  pending = null;
  // 少し前に押したキーの音だけを鳴らす（古い音がまとめて鳴らないように）
  if (enabled && performance.now() - at < 600) schedule(notes);
}

// notes: [周波数, 開始秒, 長さ秒, 波形, 音量]
function play(notes) {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  if (c.state !== 'running') {
    pending = { notes, at: performance.now() };
    return;
  }
  schedule(notes);
}

function schedule(notes) {
  const now = ctx.currentTime + 0.01;
  for (const [freq, start, dur, type = 'square', vol = 0.1] of notes) {
    const t0 = now + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    gain.gain.setValueAtTime(vol, t0 + Math.max(0.012, dur - 0.03));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}

export const sfx = {
  key: () => play([[2093, 0, 0.07, 'square', 0.12]]),
  select: () => play([[1568, 0, 0.08, 'square', 0.12]]),
  start: () => play([[784, 0, 0.09], [1047, 0.1, 0.14]]),
  correct: () => play([[1319, 0, 0.13, 'square', 0.1], [1047, 0.14, 0.32, 'square', 0.1]]),
  wrong: () => play([[155, 0, 0.2, 'sawtooth', 0.16], [155, 0.24, 0.34, 'sawtooth', 0.16]]),
  tick: () => play([[988, 0, 0.07, 'square', 0.1]]),
  finish: () => play([[784, 0, 0.1], [659, 0.12, 0.1], [523, 0.24, 0.24]]),
  fanfare: () => play([
    [523, 0, 0.11], [659, 0.12, 0.11], [784, 0.24, 0.11],
    [1047, 0.36, 0.22], [784, 0.6, 0.11], [1047, 0.72, 0.45],
  ]),
};
