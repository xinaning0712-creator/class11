// 隨機點名（只在這台裝置上記錄，不用登入、不存雲端）
import { CLASS_NAME } from './config.js';
import { SEATS, el, startClock } from './ui.js';
import * as sound from './sound.js';
import { confetti } from './celebrate.js';

const $ = (id) => document.getElementById(id);
const STORE = 'shiny11-roll';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let state = { noRepeat: false, drawn: [] };
let rolling = false;
let lastPick = null;

document.title = `隨機點名｜${CLASS_NAME}`;
$('class-name').textContent = CLASS_NAME;
startClock($('clock'), $('date'));

try {
  const saved = JSON.parse(localStorage.getItem(STORE));
  if (saved && Array.isArray(saved.drawn)) state = { noRepeat: !!saved.noRepeat, drawn: saved.drawn };
} catch { /* 沒有存過也沒關係 */ }

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* 存不了也能用 */ }
}

const remaining = () => SEATS.filter((s) => !state.drawn.includes(s));

// ---------- 畫面 ----------
function render() {
  $('no-repeat').checked = state.noRepeat;
  $('round-box').hidden = !state.noRepeat;
  const left = remaining();
  const roundDone = state.noRepeat && left.length === 0;

  $('roll-go').textContent = roundDone ? '這一輪抽完了！再來一輪' : '🎲 抽一位';
  $('roll-go').disabled = rolling;
  $('round-status').textContent = roundDone
    ? '全班都抽過了 ✨'
    : `這一輪已抽 ${state.drawn.length} 人，還剩 ${left.length} 人`;

  $('roll-seats').replaceChildren(...SEATS.map((s) => el('span', {
    class: `seat mini ${state.drawn.includes(s) ? 'drawn' : 'waiting'}${s === lastPick ? ' last' : ''}`,
    'aria-label': `${s} 號${state.drawn.includes(s) ? '，已抽過' : ''}`,
  }, s)));

  $('sound-btn').textContent = sound.soundOn() ? '🔊 音效開' : '🔇 音效關';
}

function showNumber(n, { final = false } = {}) {
  $('ball-num').textContent = n;
  const ball = $('ball');
  ball.classList.toggle('picked', final);
  if (!reduceMotion) {
    ball.animate(final
      ? [{ transform: 'scale(.85)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }]
      : [{ transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }],
    { duration: final ? 550 : 90, easing: 'ease-out' });
  }
}

// ---------- 抽 ----------
async function roll() {
  if (rolling) return;
  if (state.noRepeat && remaining().length === 0) {
    state.drawn = [];
    lastPick = null;
    save();
    $('ball-num').textContent = '?';
    $('ball').classList.remove('picked');
    $('ball-caption').textContent = '新的一輪開始囉！';
    render();
    return;
  }

  rolling = true;
  render();
  const pool = state.noRepeat ? remaining() : SEATS;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  $('ball-caption').textContent = '抽抽抽…';

  // 號碼快速跳動，越來越慢
  if (!reduceMotion && pool.length > 1) {
    let delay = 45, shown = null;
    while (delay < 420) {
      let n;
      do { n = pool[Math.floor(Math.random() * pool.length)]; } while (n === shown);
      shown = n;
      showNumber(n);
      sound.tick();
      await new Promise((r) => setTimeout(r, delay));
      delay *= 1.13;
    }
  }

  showNumber(pick, { final: true });
  $('ball-caption').textContent = `請 ${pick} 號！`;
  sound.ding();
  confetti({ count: 70, duration: 2600 });

  lastPick = pick;
  if (state.noRepeat) state.drawn.push(pick);
  save();
  rolling = false;
  render();
}

$('roll-go').addEventListener('click', roll);
$('ball').addEventListener('click', roll);

$('no-repeat').addEventListener('change', (e) => {
  state.noRepeat = e.target.checked;
  if (state.noRepeat) state.drawn = [];
  save();
  render();
});

$('round-reset').addEventListener('click', () => {
  if (state.drawn.length && !confirm('確定要重新開始這一輪嗎？')) return;
  state.drawn = [];
  lastPick = null;
  save();
  render();
});

$('sound-btn').addEventListener('click', () => {
  sound.setSound(!sound.soundOn());
  render();
});

render();
