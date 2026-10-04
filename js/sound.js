// 扭蛋音效：用瀏覽器內建的聲音合成，不需要額外的音檔
const KEY = 'shiny11-sound';
let ctx = null;

export function soundOn() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setSound(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 無法記住也沒關係 */ }
}

function audio() {
  if (!soundOn()) return null;
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, { type = 'sine', gain = 0.2, to = null } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// 轉動把手：喀啦喀啦
export function crank(seconds) {
  const n = Math.round(seconds * 9);
  for (let i = 0; i < n; i++) tone(1100 + (i % 2) * 250, i / 9, 0.04, { type: 'square', gain: 0.06 });
}
// 搖晃：膠囊互撞的喀啦喀啦
export function rattle(seconds) {
  const n = Math.round(seconds * 30);
  for (let i = 0; i < n; i++) {
    tone(1600 + Math.random() * 1800, Math.random() * seconds, 0.03,
      { type: Math.random() < 0.5 ? 'square' : 'triangle', gain: 0.03 + Math.random() * 0.04 });
  }
}
// 點名號碼跳動：嗒
export function tick() { tone(880, 0, 0.05, { type: 'triangle', gain: 0.08 }); }
// 點到了：叮～
export function ding() {
  tone(1047, 0, 0.6, { type: 'sine', gain: 0.22 });
  tone(1568, 0.08, 0.7, { type: 'sine', gain: 0.12 });
}
// 膠囊掉下來：咚
export function drop() { tone(220, 0, 0.25, { to: 70, gain: 0.35 }); }
// 膠囊打開：啵
export function pop() { tone(500, 0, 0.12, { to: 1400, type: 'triangle', gain: 0.2 }); }
// 抽到獎品：叮叮叮叮～
export function fanfare() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.35, { type: 'triangle', gain: 0.18 }));
  tone(1568, 0.48, 0.5, { type: 'sine', gain: 0.1 });
}
// 抽到懲罰：哇哇～（俏皮不嚇人）
export function wahwah() {
  tone(392, 0, 0.3, { type: 'triangle', gain: 0.18, to: 370 });
  tone(330, 0.32, 0.5, { type: 'triangle', gain: 0.18, to: 294 });
}
