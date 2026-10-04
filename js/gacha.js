// 扭蛋頁
import { CLASS_NAME } from './config.js';
import { configured, classroomDb, findOperator, friendlyError } from './db.js';
import { SEATS, el, toast } from './ui.js';
import * as sound from './sound.js';
import { createMachine } from './machine.js';

const $ = (id) => document.getElementById(id);
const MAX_COUNT = 100;
const SPIN_SECONDS = 3;     // 轉把手的時間
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 150) : ms));

const MACHINES = {
  reward: { title: '😇 天堂扭蛋', empty: '獎品補貨中' },
  punish: { title: '😈 地獄扭蛋', empty: '還沒有懲罰項目' },
};

let operator = null;
let status = { reward: false, punish: false };
let kind = null;
let seat = null;
let busy = false;
let machine = null;      // 抽獎視窗裡的那台
let shaking = false;
let drawToken = 0;       // 每次重設就換號碼，舊的抽獎結果不會跑到新的畫面

document.title = `扭蛋機｜${CLASS_NAME}`;
$('class-name').textContent = CLASS_NAME;

// ---------- 扭蛋機 ----------
document.querySelectorAll('.machine-card').forEach((card) => {
  createMachine(card.querySelector('.machine-art'), card.dataset.kind);
  card.addEventListener('click', () => openDraw(card.dataset.kind));
});

function newStageMachine() {
  machine = createMachine($('stage').querySelector('.stage-machine'), kind);
}

// ---------- 音效開關 ----------
function renderSoundBtn() {
  $('sound-btn').textContent = sound.soundOn() ? '🔊 音效開' : '🔇 音效關';
}
$('sound-btn').addEventListener('click', () => {
  sound.setSound(!sound.soundOn());
  renderSoundBtn();
});
renderSoundBtn();

// ---------- 狀態 ----------
async function refreshStatus() {
  const { data, error } = await classroomDb().rpc('gacha_status');
  if (error) return toast(`讀取失敗：${friendlyError(error)}`, { tone: 'error', seconds: 5 });
  status = data;
  for (const k of ['reward', 'punish']) {
    const card = $(`${k}-card`);
    const badge = card.querySelector('.machine-status');
    const ok = status[k] && operator;
    card.classList.toggle('disabled', !ok);
    badge.hidden = status[k];
    badge.textContent = MACHINES[k].empty;
  }
}

// ---------- 抽獎視窗 ----------
function openDraw(k) {
  if (!operator) {
    toast('這台裝置不能抽扭蛋：請先在主畫面右下角 ⚙︎ 開啟教室模式', { seconds: 5 });
    return;
  }
  if (!status[k]) {
    toast(MACHINES[k].empty, { seconds: 3 });
    return;
  }
  kind = k;
  $('draw').className = `draw-dialog ${k}`;
  $('draw-title').textContent = MACHINES[k].title;
  newStageMachine();
  resetDraw();
  $('draw').showModal();
}

function resetDraw() {
  drawToken += 1;
  busy = false;
  seat = null;
  $('count').value = 1;
  $('result').hidden = true;
  $('result').replaceChildren();
  $('after').hidden = true;
  $('go').hidden = false;
  $('shake').hidden = false;
  $('cancel-draw').hidden = false;
  $('controls').classList.remove('locked');
  renderSeats();
  renderGo();
}

function renderSeats() {
  $('seat-picker').replaceChildren(...SEATS.map((s) => el('button', {
    type: 'button',
    class: `pick${s === seat ? ' active' : ''}`,
    'aria-pressed': s === seat,
    onclick: () => { if (!busy) { seat = s; renderSeats(); renderGo(); } },
  }, s)));
}

function renderGo() {
  $('go').disabled = !seat;
  $('go').textContent = seat ? `${seat} 號，開始抽！` : '請先選座號';
}

function count() {
  const n = Math.round(Number($('count').value));
  return Number.isFinite(n) ? Math.min(MAX_COUNT, Math.max(1, n)) : 1;
}
$('minus').addEventListener('click', () => { $('count').value = Math.max(1, count() - 1); });
$('plus').addEventListener('click', () => { $('count').value = Math.min(MAX_COUNT, count() + 1); });
$('count').addEventListener('change', () => { $('count').value = count(); });

// ---------- 搖一搖（不會抽，只是好玩） ----------
async function shake() {
  if (busy || shaking || !$('result').hidden) return;
  shaking = true;
  $('go').disabled = true;
  sound.rattle(1.2);
  await machine.shake(1.2);
  shaking = false;
  renderGo();
}
$('shake').addEventListener('click', shake);
$('stage').addEventListener('click', (e) => { if (e.target.closest('.machine')) shake(); });

$('cancel-draw').addEventListener('click', () => $('draw').close());
$('close-draw').addEventListener('click', () => $('draw').close());
$('again').addEventListener('click', async () => {
  await refreshStatus();
  if (!status[kind]) {
    $('draw').close();
    toast(MACHINES[kind].empty, { seconds: 3 });
    return;
  }
  newStageMachine();
  resetDraw();
});
$('draw').addEventListener('cancel', (e) => { if (busy) e.preventDefault(); });
$('draw').addEventListener('close', refreshStatus);

// ---------- 抽！ ----------
$('go').addEventListener('click', async () => {
  if (!seat || busy || shaking) return;
  busy = true;
  const token = drawToken;
  const pickedSeat = seat;
  const n = count();
  $('count').value = n;
  $('controls').classList.add('locked');
  $('go').disabled = true;
  $('cancel-draw').hidden = true;

  // 動畫和資料庫同時進行
  const request = operator.rpc('draw_gacha', { p_kind: kind, p_seat: pickedSeat, p_count: n });
  $('shake').hidden = true;
  sound.crank(SPIN_SECONDS);
  await Promise.all([machine.stir(SPIN_SECONDS), sleep(SPIN_SECONDS * 1000)]);

  const { data, error } = await request;
  if (token !== drawToken) return;
  if (error) {
    busy = false;
    toast(`沒有抽成功：${friendlyError(error)}`, { tone: 'error', seconds: 6 });
    resetDraw();
    return;
  }

  if (data.length) await dropCapsule(machine.take());
  if (token !== drawToken) return;
  showResult(data, n, pickedSeat);
  busy = false;
  $('go').hidden = true;
  $('after').hidden = false;
});

async function dropCapsule(color) {
  const cap = el('div', { class: 'drop-capsule' },
    el('span', { class: 'cap-top', style: `background:${color}` }),
    el('span', { class: 'cap-bottom' }));
  $('stage').append(cap);
  const fast = reduceMotion ? 0.1 : 1;

  sound.drop();
  await cap.animate([
    { transform: 'translate(-50%, -60%) scale(.5)', opacity: 0 },
    { transform: 'translate(-50%, 0) scale(.5)', opacity: 1, offset: 0.5 },
    { transform: 'translate(-50%, -25%) scale(.5)', offset: 0.75 },
    { transform: 'translate(-50%, 0) scale(.5)' },
  ], { duration: 650 * fast, easing: 'ease-in', fill: 'forwards' }).finished;

  await cap.animate([
    { top: '88%', transform: 'translate(-50%, 0) scale(.5)' },
    { top: '42%', transform: 'translate(-50%, -50%) scale(1.6)' },
  ], { duration: 600 * fast, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'forwards' }).finished;

  sound.pop();
  cap.querySelector('.cap-top').animate([
    { transform: 'translateY(0) rotate(0)' },
    { transform: 'translateY(-120%) rotate(-35deg)', opacity: 0 },
  ], { duration: 450 * fast, easing: 'ease-out', fill: 'forwards' });
  await cap.querySelector('.cap-bottom').animate([
    { transform: 'translateY(0)' },
    { transform: 'translateY(80%)', opacity: 0 },
  ], { duration: 450 * fast, easing: 'ease-out', fill: 'forwards' }).finished;
  cap.remove();
}

function showResult(rows, asked, who) {
  const box = $('result');
  const lines = [];
  if (!rows.length) {
    lines.push(el('p', { class: 'result-name' }, MACHINES[kind].empty));
  } else {
    lines.push(el('p', { class: 'result-seat' }, `${who} 號抽到`));
    if (rows.length === 1) {
      lines.push(el('p', { class: 'result-name' }, rows[0].r_item));
    } else {
      const tally = new Map();
      for (const r of rows) tally.set(r.r_item, (tally.get(r.r_item) ?? 0) + 1);
      lines.push(el('ul', { class: 'result-list' },
        [...tally].map(([name, n]) => el('li', {}, name, n > 1 ? el('b', {}, ` ×${n}`) : null))));
    }
    if (rows.length < asked) {
      lines.push(el('p', { class: 'result-note' },
        `獎品抽完了！還有 ${asked - rows.length} 次，等補貨後再抽`));
    }
  }
  box.replaceChildren(el('div', { class: `result-card ${kind}` }, lines));
  box.hidden = false;
  if (rows.length) (kind === 'reward' ? sound.fanfare : sound.wahwah)();
}

// ---------- 啟動 ----------
async function start() {
  if (!configured) {
    $('gacha-hint').textContent = '還沒連上資料庫：請在 js/config.js 填入 Supabase 網址與公開鑰匙。';
    $('gacha-hint').hidden = false;
    return;
  }
  ({ db: operator } = await findOperator());
  if (!operator) {
    $('gacha-hint').textContent = '這台裝置只能查看。要抽扭蛋，請先在主畫面右下角 ⚙︎ 開啟教室模式。';
    $('gacha-hint').hidden = false;
  }
  await refreshStatus();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy) refreshStatus(); });
}
start();
