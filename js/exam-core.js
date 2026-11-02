// 考試頁和後台共用：考試設定存在 settings 表的 exam_config（一段 JSON），不用另外開資料表
import { SEAT_COUNT } from './config.js?v=202611021519';

export const EXAM_KEY = 'exam_config';
export const SUBJECTS = ['國語', '數學', '英語', '社會', '自然'];
export const ORDERS = {
  col: '一欄一欄，都從前往後',
  snake: 'S 形（一欄往後、下一欄往前）',
  row: '一排一排，從左到右',
};

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// 依人數排出座位：回傳長度 rows × cols 的陣列，由左前方開始，0 代表空位
export function autoLayout(classSize, cols, rows, order) {
  const cells = Array(cols * rows).fill(0);
  for (let i = 0; i < Math.min(classSize, cells.length); i += 1) {
    let r, c;
    if (order === 'row') {
      r = Math.floor(i / cols); c = i % cols;
    } else {
      c = Math.floor(i / rows); r = i % rows;
      if (order === 'snake' && c % 2 === 1) r = rows - 1 - r;
    }
    cells[r * cols + c] = i + 1;
  }
  return cells;
}

export function defaultConfig() {
  const cols = 6, rows = 4, order = 'col';
  return {
    title: '期中考', classSize: SEAT_COUNT, cols, rows, order,
    layout: autoLayout(SEAT_COUNT, cols, rows, order), note: '', days: [],
  };
}

// 把存起來的文字整理成安全的設定（缺的補預設，壞掉的資料不會讓頁面當掉）
export function parseConfig(text) {
  const base = defaultConfig();
  let raw = null;
  try { raw = JSON.parse(text); } catch { /* 沒設定過 */ }
  if (!raw || typeof raw !== 'object') return base;

  const classSize = clampInt(raw.classSize, 1, 60, base.classSize);
  const cols = clampInt(raw.cols, 1, 12, base.cols);
  const rows = clampInt(raw.rows, 1, 12, base.rows);
  const order = ORDERS[raw.order] ? raw.order : base.order;
  const sameSize = Array.isArray(raw.layout) && raw.layout.length === cols * rows;
  const layout = sameSize
    ? raw.layout.map((n) => (Number.isInteger(n) && n >= 1 && n <= classSize ? n : 0))
    : autoLayout(classSize, cols, rows, order);

  const days = (Array.isArray(raw.days) ? raw.days : [])
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d?.date))
    .map((d) => ({
      date: d.date,
      slots: (Array.isArray(d.slots) ? d.slots : [])
        .filter((s) => s && /^\d{2}:\d{2}$/.test(s.start) && /^\d{2}:\d{2}$/.test(s.end))
        .map((s) => ({ subject: String(s.subject ?? '').trim(), start: s.start, end: s.end }))
        .sort((a, b) => a.start.localeCompare(b.start)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    title: String(raw.title ?? '').trim() || base.title,
    classSize, cols, rows, order, layout,
    note: String(raw.note ?? '').trim(),
    days,
  };
}

// 這台裝置的「今天」（用當地時間，不用 UTC）
export function isoDate(d = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

// 2026-11-12 → 11/12（四）
export function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}（${'日一二三四五六'[new Date(y, m - 1, d).getDay()]}）`;
}

export const toMinutes = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

export function fromMinutes(min) {
  const t = Math.max(0, Math.min(23 * 60 + 59, min));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// 畫面預設要看哪一天：今天有考就今天，否則下一個考試日，都過了就最後一天
export function pickDay(days, today) {
  return days.find((d) => d.date === today)
    ?? days.find((d) => d.date > today)
    ?? days[days.length - 1]
    ?? null;
}

// 今天現在進行到哪裡。nowSec：今天 0 點起算的秒數
// 回傳 { kind: 'before' | 'exam' | 'break' | 'done', index, secLeft }
export function slotStatus(slots, nowSec) {
  for (let i = 0; i < slots.length; i += 1) {
    const start = toMinutes(slots[i].start) * 60;
    const end = toMinutes(slots[i].end) * 60;
    if (nowSec < start) return { kind: i === 0 ? 'before' : 'break', index: i, secLeft: start - nowSec };
    if (nowSec < end) return { kind: 'exam', index: i, secLeft: end - nowSec };
  }
  return { kind: 'done', index: slots.length, secLeft: 0 };
}
