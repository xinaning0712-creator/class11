// 考試頁：投影到白板。考程、座位在後台設定；缺考只記在這台裝置，過了今天自動清空
import { CLASS_NAME } from './config.js?v=202611030847';
import { configured, classroomDb, friendlyError } from './db.js?v=202611030847';
import { el, toast } from './ui.js?v=202611030847';
import { localDb, localAudioUrl, SOLO_PREFIX } from './exam-local.js?v=202611030847';
import { EXAM_KEY, AUDIO_KEY, parseAudio, parseConfig, isoDate, dayLabel, pickDay, slotStatus, toMinutes } from './exam-core.js?v=202611030847';

const $ = (id) => document.getElementById(id);
// 同事版（exam.html?solo）：不連班網資料庫，資料只存在這台電腦
const SOLO = new URLSearchParams(location.search).has('solo');
const KEY_HEAD = SOLO ? 'solo-exam' : 'shiny11-exam';
const CACHE = `${KEY_HEAD}-config`;       // 最後一次讀到的設定：考試時網路斷了也能用
const CACHE_AUDIO = `${KEY_HEAD}-audio`;
const ABSENT = `${KEY_HEAD}-absent`;
const FACE = 'shiny11-exam-clock';
const LAST_MINUTES = 5;                   // 最後幾分鐘提醒

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 存不了也能用 */ } },
};

let cfg = parseConfig(null);
let audioInfo = null;
let hasConfig = false;
let chosenDate = null;     // 老師點選的日期；null 表示自動
let absent = new Set();
let lastKey = '';

document.title = SOLO ? '考試' : `考試｜${CLASS_NAME}`;
if (SOLO) {
  const corner = document.querySelector('.exam-home');
  corner.href = 'exam-setup.html';
  corner.textContent = '⚙︎';
  corner.setAttribute('aria-label', '考試設定');
}

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

// 考試進度條：這一節過了多少，時間到就滿
function setProgress(ratio, hurry = false) {
  const on = ratio != null;
  $('exam-progress').hidden = !on;
  if (!on) return;
  $('exam-progress').classList.toggle('hurry', hurry);
  $('exam-bar').style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
}

function renderSchedule(now) {
  const day = currentDay();
  setProgress(null);
  showAudio(day);
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
    return setStatus(SOLO ? '請按右下角 ⚙︎ 設定考試' : hasConfig ? '後台還沒有排考試科目和時間' : '老師還沒有設定考試：到後台「📝 考試」設定');
  }

  const isToday = day.date === today;
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const st = isToday ? slotStatus(day.slots, nowSec) : null;

  const key = `${day.date}|${st?.kind}|${st?.index}`;
  if (key !== lastKey) {
    lastKey = key;
    // 一排最多 4 張卡片，超過就排兩排
    const count = Math.max(1, day.slots.length);
    const perRow = count <= 4 ? count : Math.ceil(count / 2);
    $('exam-slots').style.setProperty('--c', perRow);
    $('exam-slots').style.setProperty('--r', Math.ceil(count / perRow));
    $('exam-slots').classList.toggle('two-rows', count > 4);
    $('exam-slots').replaceChildren(...day.slots.map((s, i) => {
      const state = !st ? '' : i < st.index ? 'done' : i !== st.index ? '' : st.kind === 'exam' ? 'now' : 'next';
      return el('li', { class: `exam-slot ${state}` },
        el('span', { class: 'exam-slot-no' }, `第 ${'一二三四五六七八九十'[i] ?? i + 1} 節`),
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
    const total = (toMinutes(slot.end) - toMinutes(slot.start)) * 60;
    setProgress(1 - st.secLeft / total, hurry);
  } else if (st.kind === 'done') {
    setStatus('今天考完了，大家辛苦了！');
  } else {
    setStatus(`下一節 ${slot.subject}　${slot.start} 開始，還有 ${inMinutes(st.secLeft)}`);
  }
}

// ---------- 🎧 英聽（老師按播放才開始，不會自動播；畫面不顯示檔名） ----------
const audio = $('audio');
function showAudio(day) {
  const show = !!audioInfo && audioInfo.date === day?.date;
  $('exam-audio').hidden = !show;
  if (!show && !audio.paused) audio.pause();
}
let audioRaw = '';
async function setAudio(info) {
  audioInfo = info;
  const raw = info?.url ?? '';
  if (raw === audioRaw) return;   // 同一個檔案不要打斷播放
  audioRaw = raw;
  audio.pause();
  const url = raw.startsWith(SOLO_PREFIX) ? await localAudioUrl(raw).catch(() => '') : raw;
  if (raw !== audioRaw) return;
  if (url) { audio.src = url; audio.load(); } else audio.removeAttribute('src');
  drawAudio();
}
let seeking = false;   // 手指還按著進度條時，不要被播放進度拉回去
function drawAudio() {
  const total = Number.isFinite(audio.duration) ? audio.duration : 0;
  const fmt = (s) => clockText(Math.floor(s));
  $('au-play').textContent = audio.paused ? '▶ 播放英聽' : '⏸ 暫停';
  $('au-time').textContent = total ? `${fmt(audio.currentTime)} / ${fmt(total)}` : '00:00';
  $('au-seek').disabled = !total;
  if (!seeking) $('au-seek').value = total ? Math.round((audio.currentTime / total) * 1000) : 0;
}
$('au-play').addEventListener('click', () => {
  if (!audio.paused) return audio.pause();
  audio.play().catch(() => toast('英聽播放失敗，請檢查網路', { tone: 'error', seconds: 5 }));
});
$('au-back').addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
$('au-start').addEventListener('click', () => { audio.currentTime = 0; });
// 拖進度條：放開才真的跳過去，拖的途中只更新時間顯示
$('au-seek').addEventListener('input', () => {
  seeking = true;
  if (Number.isFinite(audio.duration)) {
    $('au-time').textContent = `${clockText(Math.floor(($('au-seek').value / 1000) * audio.duration))} / ${clockText(Math.floor(audio.duration))}`;
  }
});
$('au-seek').addEventListener('change', () => {
  seeking = false;
  if (Number.isFinite(audio.duration)) audio.currentTime = ($('au-seek').value / 1000) * audio.duration;
});
for (const ev of ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'seeked']) audio.addEventListener(ev, drawAudio);
audio.addEventListener('error', () => {
  if (audio.hasAttribute('src')) toast('英聽載入失敗，請檢查網路', { tone: 'error', seconds: 5 });
});

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

// ---------- 🎨 風格（只有色塊，不放文字，避免出現考試生字；記在這台電腦） ----------
const THEME = 'shiny11-exam-theme';
const THEMES = [
  { id: 'rose', label: '玫瑰奶茶', a: '#c25d7c', b: '#f8e3ea' },
  { id: 'matcha', label: '抹茶拿鐵', a: '#6f8f4e', b: '#e6ecce' },
  { id: 'bear', label: '奶茶熊', a: '#9c6f45', b: '#f0e3d0' },
  { id: 'sky', label: '晴空藍', a: '#4f86b5', b: '#dcebf5' },
  { id: 'night', label: '星空夜晚', a: '#1d2040', b: '#ffd86b' },
  { id: 'lux', label: '黑金典雅', a: '#121214', b: '#c9a25b' },
  { id: 'gallery', label: '極簡美術館', a: '#141414', b: '#ffffff' },
];
function setTheme(id) {
  const theme = THEMES.some((t) => t.id === id) ? id : 'rose';
  document.body.dataset.examTheme = theme;
  store.set(THEME, theme);
  document.querySelectorAll('.exam-theme').forEach((b) => b.classList.toggle('on', b.dataset.id === theme));
}
function showThemes(open) {
  $('exam-themes').hidden = !open;
  $('exam-theme-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
}
$('exam-themes').replaceChildren(...THEMES.map((t) => el('button', {
  class: 'exam-theme', type: 'button', 'data-id': t.id, 'aria-label': t.label,
  style: `--a:${t.a};--b:${t.b}`,
  onclick: () => { setTheme(t.id); showThemes(false); },
})));
$('exam-theme-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  showThemes($('exam-themes').hidden);
});
document.addEventListener('click', (e) => {
  if (!$('exam-themes').hidden && !e.target.closest('#exam-themes')) showThemes(false);
});
setTheme(store.get(THEME));

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
  document.title = SOLO ? cfg.title : `${cfg.title}｜${CLASS_NAME}`;
  $('exam-title').textContent = cfg.title;
  $('exam-note').textContent = cfg.note;
  $('exam-note').hidden = !cfg.note;
  lastKey = '';
  renderRoom();
  tick();
}

async function load() {
  const { data, error } = await (SOLO ? localDb : classroomDb()).from('settings').select('key, value').in('key', [EXAM_KEY, AUDIO_KEY]);
  if (error) {
    if (!hasConfig) toast(`讀取失敗：${friendlyError(error)}`, { tone: 'error', seconds: 5 });
    return;
  }
  const setting = Object.fromEntries(data.map((r) => [r.key, r.value]));
  const text = setting[EXAM_KEY] ?? '';
  store.set(CACHE, text);
  store.set(CACHE_AUDIO, setting[AUDIO_KEY] ?? '');
  setAudio(parseAudio(setting[AUDIO_KEY]));
  apply(text);
}

async function start() {
  drawDial();
  setFace(store.get(FACE) === 'analog' ? 'analog' : 'digital');
  loadAbsent();
  setAudio(parseAudio(store.get(CACHE_AUDIO)));
  apply(store.get(CACHE) || '');
  setInterval(tick, 1000);
  keepAwake();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    keepAwake();
    loadAbsent();
    renderRoom();
    if (SOLO || configured) load();
  });
  if (SOLO) { await load(); return; }
  if (!configured) return;
  await load();
  classroomDb().channel('exam')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, load)
    .subscribe();
}
start();
