// 倒數日：從雲端讀出最近的 3 個，顯示在聯絡簿頁右欄或主畫面上方
import { classroomDb } from './db.js?v=202610182224';
import { el } from './ui.js?v=202610182224';

export const SHOW_MAX = 3;
const TONES = ['red', 'blue', 'purple'];   // 最近 → 第二近 → 第三近

// 今天的日期（台灣時間），格式 2026-10-11
export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 還有幾天（以日曆天計算，今天 = 0）
export function daysUntil(iso, now = new Date()) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

const dateFmt = new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' });
export function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return dateFmt.format(new Date(y, m - 1, d));
}

// 自動更新：資料一改就重畫，過了午夜也會自己換天
export function watchCountdowns(render) {
  let items = [];
  let day = todayISO();

  async function load() {
    day = todayISO();
    const { data, error } = await classroomDb()
      .from('countdowns').select('id, title, date')
      .gte('date', day).order('date').order('id').limit(SHOW_MAX);
    if (error) return;   // 資料表還沒建立或網路斷了：就先不顯示
    items = data;
    render(items);
  }

  load();
  classroomDb().channel(`countdowns-${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'countdowns' }, load)
    .subscribe();
  setInterval(() => { if (todayISO() !== day) load(); }, 30_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
}

function label(days) {
  if (days === 0) return [el('b', { class: 'cd-today' }, '就是今天！')];
  if (days === 1) return [el('b', { class: 'cd-today' }, '明天！')];
  return ['還有 ', el('b', { class: 'cd-num' }, days), ' 天'];
}

// 聯絡簿頁右欄：大卡片
export function renderPanel(box, items) {
  box.hidden = !items.length;
  box.replaceChildren(
    el('p', { class: 'cd-heading' }, '⏳ 倒數'),
    ...items.map((c, i) => el('article', { class: `cd-card ${TONES[i]}` },
      el('p', { class: 'cd-title' }, c.title),
      el('p', { class: 'cd-days' }, label(daysUntil(c.date))),
      el('p', { class: 'cd-date' }, shortDate(c.date)))),
  );
}

// 主畫面上方：小標籤
export function renderStrip(box, items) {
  box.hidden = !items.length;
  box.replaceChildren(...items.map((c, i) => el('span', { class: `cd-chip ${TONES[i]}` },
    el('span', { class: 'cd-chip-title' }, c.title),
    el('span', { class: 'cd-chip-days' }, label(daysUntil(c.date))))));
}
