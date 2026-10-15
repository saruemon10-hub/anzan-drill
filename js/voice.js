// 声の案内（端末の読み上げ機能 speechSynthesis を使う。iPhone では端末内の日本語音声なのでオフラインでも話せる）
// iOS は最初の読み上げをユーザー操作の中で始める必要があるため、unlockVoice() をタップのたびに呼ぶ。

const synth = window.speechSynthesis;
let enabled = true;
let unlocked = false;
let voice = null;
let timer = null;
let pending = null;

function pickVoice() {
  const voices = synth.getVoices().filter((v) => /^ja([-_]|$)/i.test(v.lang));
  voice = voices.find((v) => v.localService) || voices[0] || null;
}

if (synth) {
  pickVoice();
  synth.addEventListener?.('voiceschanged', pickVoice);
}

function utter(text, volume = 1) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  if (voice) u.voice = voice;
  u.rate = 1.05;
  u.pitch = 1.15;
  u.volume = volume;
  return u;
}

function speakNow(text) {
  if (synth.speaking || synth.pending) synth.cancel();
  synth.speak(utter(text));
}

export function setVoiceEnabled(on) {
  enabled = on;
  if (!on) stopVoice();
}

// ユーザー操作の中で呼ぶ。まだ話せない状態で頼まれていた案内があれば、ここで話す。
export function unlockVoice() {
  if (!synth || unlocked) return;
  unlocked = true;
  if (pending && enabled && performance.now() - pending.at < 1500) {
    const { text } = pending;
    pending = null;
    clearTimeout(timer);
    speakNow(text);
  } else {
    synth.speak(utter(' ', 0));
  }
}

// 案内を話す。前の案内が残っていたら止めて、新しいほうを話す。
export function say(text, delay = 0) {
  if (!synth) return;
  clearTimeout(timer);
  pending = null;
  if (!enabled || !text) return;
  if (!unlocked) {
    pending = { text, at: performance.now() };
    return;
  }
  timer = setTimeout(() => speakNow(text), delay);
}

export function stopVoice() {
  clearTimeout(timer);
  pending = null;
  if (synth && (synth.speaking || synth.pending)) synth.cancel();
}

// 問題の読み上げ文（短くして、制限時間を食わないようにする）
const OP_WORD = { add: 'たす', sub: 'ひく', mul: 'かける', div: 'わる' };

export function problemSpeech(p) {
  if (p.kind === 'arith') return `${p.a} ${OP_WORD[p.op]} ${p.b}`;
  if (p.kind === 'kisoku') return `${p.seq.join('、')}、つぎは？`;
  if (p.kind === 'awase') return `${p.a} と ${p.b}、あと いくつで 100？`;
  return '';
}
