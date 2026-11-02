// 後台：考試設定（存在 settings 表的 exam_config，考試頁會自動更新）
import { friendlyError } from './db.js?v=202611021519';
import { el, toast } from './ui.js?v=202611021519';
import { EXAM_KEY, ORDERS, parseConfig, autoLayout, isoDate, toMinutes, fromMinutes } from './exam-core.js?v=202611021519';

const $ = (id) => document.getElementById(id);
const DEFAULT_MINUTES = 40;
const BREAK_MINUTES = 10;

let db = null;
let cfg = parseConfig(null);
let picked = null;   // 座位表：第一個點到的格子

export function init(client) {
  db = client;
  $('ex-order').replaceChildren(...Object.entries(ORDERS).map(([v, label]) => el('option', { value: v }, label)));
  $('ex-add-day').addEventListener('click', addDay);
  $('ex-save').addEventListener('click', save);
  $('ex-flip').addEventListener('click', flip);
  for (const id of ['ex-size', 'ex-cols', 'ex-rows', 'ex-order']) {
    $(id).addEventListener('change', rearrange);
  }
}

export async function load() {
  const { data, error } = await db.from('settings').select('value').eq('key', EXAM_KEY).maybeSingle();
  if (error) return;
  cfg = parseConfig(data?.value ?? null);
  picked = null;
  $('ex-title').value = cfg.title;
  $('ex-note').value = cfg.note;
  $('ex-size').value = cfg.classSize;
  $('ex-cols').value = cfg.cols;
  $('ex-rows').value = cfg.rows;
  $('ex-order').value = cfg.order;
  renderDays();
  renderSeats();
}

// ---------- 考程 ----------
function addDay() {
  const last = cfg.days[cfg.days.length - 1];
  let date = isoDate();
  if (last?.date) {
    const [y, m, d] = last.date.split('-').map(Number);
    date = isoDate(new Date(y, m - 1, d + 1));
  }
  cfg.days.push({ date, slots: [{ subject: '', start: '08:40', end: '09:20' }] });
  renderDays();
}

function addSlot(day) {
  const last = day.slots[day.slots.length - 1];
  const start = last?.end ? toMinutes(last.end) + BREAK_MINUTES : toMinutes('08:40');
  day.slots.push({ subject: '', start: fromMinutes(start), end: fromMinutes(start + DEFAULT_MINUTES) });
  renderDays();
}

function renderDays() {
  $('ex-days').replaceChildren(...(cfg.days.length ? cfg.days.map((day) => {
    const date = el('input', { type: 'date', value: day.date, 'aria-label': '考試日期' });
    date.addEventListener('change', () => { day.date = date.value; });
    return el('div', { class: 'ex-day' },
      el('div', { class: 'ex-day-head' }, date,
        el('button', { class: 'btn small', type: 'button', onclick: () => addSlot(day) }, '＋ 加一節'),
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => {
          cfg.days = cfg.days.filter((d) => d !== day);
          renderDays();
        } }, '刪除這天')),
      ...day.slots.map((s) => slotRow(day, s)));
  }) : [el('p', { class: 'muted' }, '還沒有考試日，按下面的「新增考試日」開始')]));
}

function slotRow(day, slot) {
  const bind = (input, field) => {
    input.addEventListener('input', () => { slot[field] = input.value; });
    return input;
  };
  return el('div', { class: 'ex-slot' },
    bind(el('input', { type: 'text', value: slot.subject, maxlength: 12, list: 'ex-subjects', placeholder: '科目', 'aria-label': '科目' }), 'subject'),
    bind(el('input', { type: 'time', value: slot.start, 'aria-label': '開始時間' }), 'start'),
    el('span', {}, '到'),
    bind(el('input', { type: 'time', value: slot.end, 'aria-label': '結束時間' }), 'end'),
    el('button', { class: 'btn small ghost', type: 'button', onclick: () => {
      day.slots = day.slots.filter((x) => x !== slot);
      renderDays();
    } }, '刪除'));
}

// ---------- 座位 ----------
function readSize() {
  const num = (id, fallback) => Math.round(Number($(id).value)) || fallback;
  cfg.classSize = Math.min(60, Math.max(1, num('ex-size', cfg.classSize)));
  cfg.cols = Math.min(12, Math.max(1, num('ex-cols', cfg.cols)));
  cfg.rows = Math.min(12, Math.max(1, num('ex-rows', cfg.rows)));
  cfg.order = $('ex-order').value;
}

function rearrange() {
  readSize();
  cfg.layout = autoLayout(cfg.classSize, cfg.cols, cfg.rows, cfg.order);
  picked = null;
  renderSeats();
}

function flip() {
  const out = [];
  for (let r = 0; r < cfg.rows; r += 1) {
    out.push(...cfg.layout.slice(r * cfg.cols, (r + 1) * cfg.cols).reverse());
  }
  cfg.layout = out;
  picked = null;
  renderSeats();
}

function tapCell(i) {
  if (picked === null) {
    picked = i;
  } else {
    if (picked !== i) [cfg.layout[picked], cfg.layout[i]] = [cfg.layout[i], cfg.layout[picked]];
    picked = null;
  }
  renderSeats();
}

function renderSeats() {
  const grid = $('ex-grid');
  grid.style.setProperty('--cols', cfg.cols);
  grid.replaceChildren(...cfg.layout.map((n, i) => el('button', {
    class: `ex-cell${n ? '' : ' blank'}${picked === i ? ' picked' : ''}`,
    type: 'button',
    'aria-label': n ? `${n} 號` : '空位',
    onclick: () => tapCell(i),
  }, n || '空')));
  const seats = cfg.cols * cfg.rows;
  $('ex-seat-msg').textContent = seats < cfg.classSize
    ? `⚠️ ${cfg.cols} × ${cfg.rows} 只有 ${seats} 個位子，坐不下 ${cfg.classSize} 人`
    : '';
}

// ---------- 儲存 ----------
async function save() {
  readSize();
  if (cfg.cols * cfg.rows < cfg.classSize) return toast('座位不夠，請調整欄數或排數', { tone: 'error', seconds: 4 });
  const dates = cfg.days.map((d) => d.date);
  if (dates.some((d) => !d)) return toast('有考試日還沒選日期', { tone: 'error', seconds: 4 });
  if (new Set(dates).size !== dates.length) return toast('有兩天的日期一樣，請改一下', { tone: 'error', seconds: 4 });
  for (const day of cfg.days) {
    for (const s of day.slots) {
      if (!s.subject.trim()) return toast(`${day.date} 有一節沒填科目`, { tone: 'error', seconds: 4 });
      if (!s.start || !s.end || s.start >= s.end) return toast(`${s.subject}的結束時間要晚於開始時間`, { tone: 'error', seconds: 4 });
    }
  }
  cfg.title = $('ex-title').value.trim() || '期中考';
  cfg.note = $('ex-note').value.trim();
  const { error } = await db.from('settings').upsert([
    { key: EXAM_KEY, value: JSON.stringify(cfg), updated_at: new Date().toISOString() },
  ]);
  if (error) return toast(`儲存失敗：${friendlyError(error)}`, { tone: 'error', seconds: 5 });
  toast('考試設定已儲存，考試頁會自動更新');
  load();
}
