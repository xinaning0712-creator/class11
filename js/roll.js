// 抽籤：樂透機（只在這台裝置上記錄，不用登入、不存雲端）
import { CLASS_NAME } from './config.js';
import { SEATS, el, startClock } from './ui.js';
import * as sound from './sound.js';
import { confetti } from './celebrate.js';
import { createLottery, ballColor } from './lottery.js';

const $ = (id) => document.getElementById(id);
const STORE = 'shiny11-lottery';
const SHAKE_SECONDS = 3;

let state = { putBack: false, out: [] };   // out：已抽出、還沒放回的號碼
let busy = false;

document.title = `抽籤｜${CLASS_NAME}`;
$('class-name').textContent = CLASS_NAME;
startClock($('clock'), $('date'));

try {
  const saved = JSON.parse(localStorage.getItem(STORE));
  if (saved && Array.isArray(saved.out)) {
    state = { putBack: !!saved.putBack, out: saved.out.filter((n) => SEATS.includes(n)) };
  }
} catch { /* 沒有存過也沒關係 */ }

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* 存不了也能用 */ }
}

const lottery = createLottery($('lottery'), SEATS.filter((n) => !state.out.includes(n)));

// ---------- 畫面 ----------
function render() {
  const left = lottery.count();
  $('put-back').checked = state.putBack;
  $('draw-btn').disabled = busy || left === 0;
  $('draw-btn').textContent = left === 0 ? '球都抽完了！請按重置' : '🎲 搖一搖，抽一顆！';
  $('reset-btn').disabled = busy;
  $('tray-title').textContent = `已抽出的球（${state.out.length}）・大球裡還有 ${left} 顆`;
  $('tray').replaceChildren(...(state.out.length
    ? state.out.map((n) => el('button', {
        class: 'marble small',
        type: 'button',
        style: `--glass:${ballColor(n)}`,
        'aria-label': `${n} 號，點一下放回去`,
        title: '點一下放回去',
        onclick: () => putBack(n),
      }, el('span', {}, n)))
    : [el('p', { class: 'muted' }, state.putBack ? '球抽完會自動放回去' : '還沒有抽出的球')]));
  $('sound-btn').textContent = sound.soundOn() ? '🔊 音效開' : '🔇 音效關';
}

function showResult(n) {
  const big = $('big-ball');
  big.classList.remove('empty');
  big.style.setProperty('--glass', ballColor(n));
  $('big-num').textContent = n;
  big.animate([
    { transform: 'scale(.3) rotate(-120deg)', opacity: 0 },
    { transform: 'scale(1.12) rotate(8deg)', opacity: 1, offset: 0.7 },
    { transform: 'scale(1) rotate(0)' },
  ], { duration: 650, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  $('caption').textContent = `請 ${n} 號！`;
}

// ---------- 抽 ----------
async function draw() {
  if (busy || lottery.count() === 0) return;
  busy = true;
  render();
  $('caption').textContent = '搖搖搖～～～';
  sound.rattle(SHAKE_SECONDS);
  await lottery.shake(SHAKE_SECONDS);

  const inside = lottery.inside();
  const pick = inside[Math.floor(Math.random() * inside.length)];
  $('caption').textContent = '掉出來了…';
  await lottery.release(pick);
  sound.drop();

  showResult(pick);
  sound.ding();
  confetti({ count: 80, duration: 2600 });

  if (state.putBack) {
    setTimeout(() => { lottery.putBack(pick); render(); }, 1500);
  } else {
    state.out.push(pick);
  }
  save();
  busy = false;
  render();
}

function putBack(n) {
  if (busy) return;
  state.out = state.out.filter((x) => x !== n);
  lottery.putBack(n);
  save();
  render();
}

$('draw-btn').addEventListener('click', draw);
$('lottery').addEventListener('click', draw);

$('put-back').addEventListener('change', (e) => {
  state.putBack = e.target.checked;
  save();
  render();
});

$('reset-btn').addEventListener('click', () => {
  if (busy) return;
  if (state.out.length && !confirm('要把所有抽出的球都放回去嗎？')) return;
  lottery.putBack(state.out);
  state.out = [];
  $('big-ball').classList.add('empty');
  $('big-ball').style.removeProperty('--glass');
  $('big-num').textContent = '?';
  $('caption').textContent = '球都放回去了，重新開始！';
  save();
  render();
});

$('sound-btn').addEventListener('click', () => {
  sound.setSound(!sound.soundOn());
  render();
});

render();
