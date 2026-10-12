// 効果音（Web Audio で合成。音声ファイルは使わない）
// iOS はユーザー操作（touchend / click）の中でしか音を出せないため、タップのたびに unlock() を呼ぶ。

let ctx = null;
let enabled = true;
let primed = false;

export function setEnabled(on) {
  enabled = on;
}

export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state !== 'running') ctx.resume();
    if (!primed) {
      // 無音を一度鳴らして、iOS の音声出力を有効にする
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
      primed = true;
    }
  } catch {
    // 音が出せない環境では無視する
  }
}

// notes: [周波数, 開始秒, 長さ秒, 波形, 音量]
function play(notes) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime + 0.01;
  for (const [freq, start, dur, type = 'square', vol = 0.08] of notes) {
    const t0 = now + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.setValueAtTime(vol, t0 + Math.max(0.01, dur - 0.04));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}

export const sfx = {
  key: () => play([[1800, 0, 0.035, 'square', 0.035]]),
  select: () => play([[1320, 0, 0.06, 'square', 0.05]]),
  start: () => play([[784, 0, 0.09], [1047, 0.1, 0.14]]),
  correct: () => play([[1319, 0, 0.13, 'square', 0.07], [1047, 0.14, 0.32, 'square', 0.07]]),
  wrong: () => play([[155, 0, 0.2, 'sawtooth', 0.12], [155, 0.24, 0.34, 'sawtooth', 0.12]]),
  tick: () => play([[988, 0, 0.06, 'square', 0.05]]),
  finish: () => play([[784, 0, 0.1], [659, 0.12, 0.1], [523, 0.24, 0.24]]),
  fanfare: () => play([
    [523, 0, 0.11], [659, 0.12, 0.11], [784, 0.24, 0.11],
    [1047, 0.36, 0.22], [784, 0.6, 0.11], [1047, 0.72, 0.45],
  ]),
};
