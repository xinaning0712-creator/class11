// 考試頁：投影到白板。考程、座位在後台設定；缺考只記在這台裝置，過了今天自動清空
import { CLASS_NAME } from './config.js?v=202611021519';
import { configured, classroomDb, friendlyError } from './db.js?v=202611021519';
import { el, toast } from './ui.js?v=202611021519';
import { EXAM_KEY, parseConfig, isoDate, dayLabel, pickDay, slotStatus } from './exam-core.js?v=202611021519';

const $ = (id) => document.getElementById(id);
const CACHE = 'shiny11-exam-config';      // 最後一次讀到的設定：考試時網路斷了也能用
const ABSENT = 'shiny11-exam-absent';
const FACE = 'shiny11-exam-clock';
const LAST_MINUTES = 5;                   // 最後幾分鐘提醒

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 存不了也能用 */ } },
};

let cfg = parseConfig(null);
let hasConfig = false;
let chosenDate = null;     // 老師點選的日期；null 表示自動
let absent = new Set();
let lastKey = '';

document.title = `考試｜${CLASS_NAME}`;

// ---------- 缺考 ----------
function loadAbsent() {
  try {
    const saved = JSON.parse(store.get(ABSENT));
    absent = new Set(saved?.date === isoDate() && Array.isArray(saved.seats) ? saved.seats : []);
  } catch { absent = new Set(); }
}
function saveAbsent() {
  store.set(ABSENT, JSON.stringify({ date: isoDate(), seats: [...absent] }));
}
function toggleAbsent(n) {
  if (absent.has(n)) absent.delete(n); else absent.add(n);
  saveAbsent();
  renderRoom();
}

// ---------- 人數與座位 ----------
function renderRoom() {
  const missing = [...absent].filter((n) => n <= cfg.classSize).sort((a, b) => a - b);
  $('stat-class').textContent = cfg.classSize;
  $('stat-exam').textContent = cfg.classSize - missing.length;
  $('stat-absent').textContent = missing.length;
  $('stat-absent-list').textContent = missing.length ? `${missing.join('、')} 號` : '';

  const seats = $('exam-seats');
  seats.style.setProperty('--cols', cfg.cols);
  seats.style.setProperty('--rows', cfg.rows);
  seats.replaceChildren(...cfg.layout.map((n) => {
    if (!n) return el('span', { class: 'exam-cell', 'aria-hidden': 'true' });
    const out = missing.includes(n);
    return el('span', { class: 'exam-cell' }, el('button', {
      class: `seat exam-seat${out ? ' absent' : ''}`,
      type: 'button',
      'aria-pressed': out ? 'true' : 'false',
      'aria-label': `${n} 號${out ? '，缺考' : ''}`,
      onclick: () => toggleAbsent(n),
    }, n));
  }));
}

// ---------- 考程 ----------
function currentDay() {
  return cfg.days.find((d) => d.date === chosenDate) ?? pickDay(cfg.days, isoDate());
}

function clockText(sec) {
  const m = Math.floor(sec / 60);
  return `${String(m).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
const inMinutes = (sec) => `${Math.ceil(sec / 60)} 分鐘`;

function daysAway(iso) {
  const parts = (s) => s.split('-').map(Number);
  const [y, m, d] = parts(iso), [ty, tm, td] = parts(isoDate());
  return Math.round((new Date(y, m - 1, d) - new Date(ty, tm - 1, td)) / 86400000);
}

function setStatus(text, tone = '') {
  const box = $('exam-status');
  box.className = `exam-status ${tone}`;
  box.textContent = text;
}

function renderSchedule(now) {
  const day = currentDay();
  const today = isoDate(now);
  $('exam-days').replaceChildren(...cfg.days.map((d) => el('button', {
    class: `exam-day${d === day ? ' active' : ''}`,
    type: 'button',
    onclick: () => { chosenDate = d.date; lastKey = ''; tick(); },
  }, dayLabel(d.date))));
  $('exam-days').hidden = cfg.days.length < 2;

  if (!day) {
    lastKey = '';
    $('exam-slots').replaceChildren();
    return setStatus(hasConfig ? '後台還沒有排考試科目和時間' : '老師還沒有設定考試：到後台「📝 考試」設定');
  }

  const isToday = day.date === today;
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const st = isToday ? slotStatus(day.slots, nowSec) : null;

  const key = `${day.date}|${st?.kind}|${st?.index}`;
  if (key !== lastKey) {
    lastKey = key;
    $('exam-slots').replaceChildren(...day.slots.map((s, i) => {
      const state = !st ? '' : i < st.index ? 'done' : i !== st.index ? '' : st.kind === 'exam' ? 'now' : 'next';
      return el('li', { class: `exam-slot ${state}` },
        el('span', { class: 'exam-slot-time' }, `${s.start}–${s.end}`),
        el('span', { class: 'exam-slot-subject' }, s.subject || '（未填科目）'),
        el('span', { class: 'exam-slot-state' }, { done: '已結束', now: '考試中', next: '下一節' }[state] ?? ''));
    }));
  }

  if (!day.slots.length) return setStatus(`${dayLabel(day.date)} 還沒有排科目`);
  if (!isToday) {
    const away = daysAway(day.date);
    return setStatus(away > 0 ? `${dayLabel(day.date)} 考試，還有 ${away} 天` : `${dayLabel(day.date)} 的考試已結束`);
  }
  const slot = day.slots[st.index];
  if (st.kind === 'exam') {
    const hurry = st.secLeft <= LAST_MINUTES * 60;
    setStatus(`${slot.subject} 考試中　還剩 ${clockText(st.secLeft)}`, hurry ? 'hurry' : 'live');
  } else if (st.kind === 'done') {
    setStatus('今天考完了，大家辛苦了！');
  } else {
    setStatus(`下一節 ${slot.subject}　${slot.start} 開始，還有 ${inMinutes(st.secLeft)}`);
  }
}

// ---------- 大時鐘 ----------
function drawDial() {
  const nums = Array.from({ length: 12 }, (_, i) => {
    const a = ((i + 1) * 30 - 90) * Math.PI / 180;
    return `<text x="${(100 + 74 * Math.cos(a)).toFixed(1)}" y="${(100 + 74 * Math.sin(a)).toFixed(1)}">${i + 1}</text>`;
  }).join('');
  const ticks = Array.from({ length: 60 }, (_, i) => `<line class="${i % 5 ? 'tick' : 'tick big'}" x1="100" y1="6" x2="100" y2="${i % 5 ? 11 : 14}" transform="rotate(${i * 6} 100 100)"/>`).join('');
  $('analog').innerHTML = `<circle class="face" cx="100" cy="100" r="97"/>${ticks}${nums}
    <line id="hand-h" class="hand h" x1="100" y1="108" x2="100" y2="56"/>
    <line id="hand-m" class="hand m" x1="100" y1="112" x2="100" y2="34"/>
    <line id="hand-s" class="hand s" x1="100" y1="118" x2="100" y2="26"/>
    <circle class="pin" cx="100" cy="100" r="5"/>`;
}

const dateFmt = new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' });
function tick() {
  const now = new Date();
  const two = (n) => String(n).padStart(2, '0');
  $('digital').textContent = `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`;
  $('exam-date').textContent = dateFmt.format(now);
  const s = now.getSeconds(), m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60;
  $('hand-h').setAttribute('transform', `rotate(${h * 30} 100 100)`);
  $('hand-m').setAttribute('transform', `rotate(${m * 6} 100 100)`);
  $('hand-s').setAttribute('transform', `rotate(${s * 6} 100 100)`);
  renderSchedule(now);
}

function setFace(face) {
  $('exam-clock').classList.toggle('analog', face === 'analog');
  $('analog').toggleAttribute('hidden', face !== 'analog');   // svg 沒有 .hidden 屬性，要改標籤
  store.set(FACE, face);
}
$('exam-clock').addEventListener('click', () => {
  setFace($('exam-clock').classList.contains('analog') ? 'digital' : 'analog');
});

// ---------- 全螢幕＋螢幕不要自動關 ----------
let wake = null;
async function keepAwake() {
  try {
    if (navigator.wakeLock && !wake && !document.hidden) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    }
  } catch { /* 不支援就算了 */ }
}
$('exam-fs').addEventListener('click', () => {
  keepAwake();
  const root = document.documentElement;
  try {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
  } catch { /* 不支援全螢幕 */ }
});

// ---------- 讀設定 ----------
function apply(text) {
  hasConfig = !!text;
  cfg = parseConfig(text);
  document.title = `${cfg.title}｜${CLASS_NAME}`;
  $('exam-title').textContent = cfg.title;
  $('exam-note').textContent = cfg.note;
  $('exam-note').hidden = !cfg.note;
  lastKey = '';
  renderRoom();
  tick();
}

async function load() {
  const { data, error } = await classroomDb().from('settings').select('value').eq('key', EXAM_KEY).maybeSingle();
  if (error) {
    if (!hasConfig) toast(`讀取失敗：${friendlyError(error)}`, { tone: 'error', seconds: 5 });
    return;
  }
  const text = data?.value ?? '';
  store.set(CACHE, text);
  apply(text);
}

async function start() {
  drawDial();
  setFace(store.get(FACE) === 'analog' ? 'analog' : 'digital');
  loadAbsent();
  apply(store.get(CACHE) || '');
  setInterval(tick, 1000);
  keepAwake();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    keepAwake();
    loadAbsent();
    renderRoom();
    if (configured) load();
  });
  if (!configured) return;
  await load();
  classroomDb().channel('exam')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, load)
    .subscribe();
}
start();
