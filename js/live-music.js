// ============================================================
// 全班對戰：白板背景音樂（Web Audio 即時合成的原創小曲，不用音樂檔、沒有版權問題）
//  - think：答題時間，緊張的小調（最後幾秒會自動加快）
//  - race ：玻璃球賽跑，快樂的大調賽馬曲
// 想換成自己的 mp3：把檔案放進 music 資料夾，填在下面的 FILES（例如 'music/think.mp3'），
// 留空白就用合成的音樂。
// ============================================================
import { sound } from './live-common.js?v=202610202028';

export const FILES = {
  think: '',   // 例如 'music/think.mp3'
  race: 'music/race.mp3'   // 「Cutscene Crush」Blue Deer Studio（老師提供，剪掉前奏和結尾的安靜段落）
};
const VOLUME = 0.55;   // 音樂音量（0～1）

const midi = m => 440 * Math.pow(2, (m - 69) / 12);

/* ── 曲子：每小節 16 格（16 分音符），null 代表休息 ── */
const SONGS = {
  think: {
    bpm: 120,
    // Am - F - G - E：心跳一樣的低音＋滴答聲，聽起來有點緊張
    bass: [45, 41, 43, 40],
    chord: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]],
    melody: [
      [69, null, null, 72, null, null, 76, null, 72, null, null, 69, null, null, 71, null],
      [65, null, null, 69, null, null, 72, null, 69, null, null, 65, null, null, 67, null],
      [67, null, null, 71, null, null, 74, null, 71, null, null, 67, null, null, 69, null],
      [68, null, 71, null, 74, null, 76, null, 74, null, 71, null, 68, null, 64, null]
    ],
    bassSteps: [0, 3, 6, 8, 11, 14],
    hat: 'all', kick: [0, 8], clap: [4, 12], melodyWave: 'triangle', melodyVol: 0.07
  },
  race: {
    bpm: 168,
    // C - G - Am - F：咚恰咚恰的賽馬節奏
    bass: [48, 43, 45, 41],
    chord: [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]],
    melody: [
      [72, null, 76, null, 79, null, 76, null, 84, null, 79, null, 76, null, 79, null],
      [71, null, 74, null, 79, null, 74, null, 83, null, 79, null, 74, null, 79, null],
      [69, null, 72, null, 76, null, 72, null, 81, null, 76, null, 72, null, 76, null],
      [77, null, 81, null, 84, null, 81, null, 79, null, 77, null, 76, null, 74, null]
    ],
    bassSteps: [0, 8], stab: [4, 12],
    hat: 'off', kick: [0, 8], clap: [4, 12], melodyWave: 'square', melodyVol: 0.05
  }
};

let cur = null;        // 正在播的：{ name, timer, step, next, rate, gain } 或 { audio }
export const music = {
  on: true,
  play(name) {
    this.stop();
    if (!this.on || !sound.on) return;
    if (FILES[name]) { playFile(name); return; }
    const c = sound.ctx(); if (!c || !SONGS[name]) return;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(VOLUME, c.currentTime + 0.4);
    gain.connect(c.destination);
    cur = { name, step: 0, next: c.currentTime + 0.08, rate: 1, gain, c };
    cur.timer = setInterval(schedule, 25);
    schedule();
  },
  /* 最後幾秒加快（1 = 原速） */
  speed(rate) { if (cur && !cur.audio) cur.rate = rate; else if (cur && cur.audio) cur.audio.playbackRate = rate; },
  stop() {
    if (!cur) return;
    const old = cur; cur = null;
    if (old.audio) {          // 音樂檔：0.3 秒淡出再停
      const a = old.audio, v0 = a.volume;
      let k = 0;
      const id = setInterval(() => { k++; a.volume = Math.max(0, v0 * (1 - k / 6)); if (k >= 6) { clearInterval(id); a.pause(); a.volume = VOLUME; } }, 50);
      return;
    }
    clearInterval(old.timer);
    try {
      old.gain.gain.cancelScheduledValues(old.c.currentTime);
      old.gain.gain.setValueAtTime(old.gain.gain.value || VOLUME, old.c.currentTime);
      old.gain.gain.exponentialRampToValueAtTime(0.0001, old.c.currentTime + 0.25);
      setTimeout(() => old.gain.disconnect(), 400);
    } catch (e) { /* 沒關係 */ }
  }
};

/* 音樂檔先載好，喊 GO! 的瞬間才能馬上響 */
const audios = {};
function audioFor(name) {
  if (!audios[name]) { const a = new Audio(FILES[name]); a.preload = 'auto'; a.loop = true; audios[name] = a; }
  return audios[name];
}
Object.keys(FILES).forEach(n => { if (FILES[n]) audioFor(n); });
function playFile(name) {
  const a = audioFor(name);
  a.volume = VOLUME; a.playbackRate = 1;
  try { a.currentTime = 0; } catch (e) { /* 還沒載好 */ }
  a.play().catch(() => {});
  cur = { name, audio: a };
}

/* ── 小樂器 ── */
function note(c, out, freq, t, dur, type, vol) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
}
let noiseBuf = null;
function noise(c, out, t, dur, vol, hp) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.02);
}
function kick(c, out, t) {
  const o = c.createOscillator(), g = c.createGain();
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2);
}

/* ── 排程：往前多排 0.12 秒，聲音才不會卡 ── */
function schedule() {
  if (!cur || cur.audio) return;
  const { c, gain: out } = cur, S = SONGS[cur.name];
  while (cur.next < c.currentTime + 0.12) {
    const t = cur.next, bar = Math.floor(cur.step / 16) % 4, k = cur.step % 16;
    const sixteenth = 60 / (S.bpm * cur.rate) / 4;
    if (S.bassSteps.includes(k)) note(c, out, midi(S.bass[bar] + (k % 8 === 0 ? 0 : 12)), t, sixteenth * 1.8, 'triangle', 0.16);
    if (S.stab && S.stab.includes(k)) S.chord[bar].forEach(m => note(c, out, midi(m), t, sixteenth * 1.2, 'square', 0.025));
    if (!S.stab && k === 0) S.chord[bar].forEach(m => note(c, out, midi(m), t, sixteenth * 14, 'sine', 0.025));
    const m = S.melody[bar][k];
    if (m) note(c, out, midi(m), t, sixteenth * 1.6, S.melodyWave, S.melodyVol);
    if (S.hat === 'all' || (S.hat === 'off' && k % 4 === 2)) noise(c, out, t, 0.03, k % 2 ? 0.025 : 0.045, 7000);
    if (S.kick.includes(k)) kick(c, out, t);
    if (S.clap.includes(k)) noise(c, out, t, 0.09, 0.09, 1500);
    cur.next += sixteenth;
    cur.step++;
  }
}
