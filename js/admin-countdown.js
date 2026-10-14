// 後台：倒數日（可以預排很多個，畫面上只顯示最近的 3 個）
import { friendlyError } from './db.js?v=202610142003';
import { el, toast } from './ui.js?v=202610142003';
import { todayISO, daysUntil, shortDate, SHOW_MAX } from './countdown.js?v=202610142003';

const $ = (id) => document.getElementById(id);
let db = null;
let items = [];

const fail = (what, error) => toast(`${what}失敗：${friendlyError(error)}`, { tone: 'error', seconds: 5 });

export function init(client) {
  db = client;
  $('cd-date').min = todayISO();
  $('cd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const row = { title: $('cd-title').value.trim(), date: $('cd-date').value };
    if (!row.title || !row.date) return;
    const { error } = await db.from('countdowns').insert(row);
    if (error) return fail('新增', error);
    e.target.reset();
    toast(`已新增「${row.title}」`);
    load();
  });
}

export async function load() {
  const { data, error } = await db.from('countdowns').select('id, title, date').order('date').order('id');
  if (error) return;
  items = data;
  render();
}

function render() {
  const today = todayISO();
  const upcoming = items.filter((c) => c.date >= today);
  const past = items.filter((c) => c.date < today).reverse();

  $('cd-list').replaceChildren(...(upcoming.length ? upcoming.map((c, i) => {
    const days = daysUntil(c.date);
    const dateInput = el('input', { type: 'date', value: c.date, 'aria-label': '日期' });
    dateInput.addEventListener('change', () => dateInput.value && update(c, { date: dateInput.value }));
    return el('div', { class: `cd-row${i < SHOW_MAX ? ' showing' : ''}` },
      el('span', { class: 'cd-row-title' }, c.title),
      dateInput,
      el('span', { class: 'cd-row-days' }, days === 0 ? '今天' : `還有 ${days} 天`),
      el('span', { class: 'cd-row-state' }, i < SHOW_MAX ? '顯示中' : '排隊中'),
      el('span', { class: 'row-actions' },
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => rename(c) }, '改名'),
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => remove(c) }, '刪除')));
  }) : [el('p', { class: 'muted' }, '還沒有排定的倒數日，從上面新增吧！')]));

  $('cd-past').replaceChildren(...(past.length ? past.map((c) => el('div', { class: 'archived-row' },
    el('span', {}, `${shortDate(c.date)}　${c.title}`),
    el('button', { class: 'btn small ghost', type: 'button', onclick: () => remove(c) }, '刪除')))
    : [el('p', { class: 'muted' }, '沒有已經過去的倒數日')]));
}

async function update(c, patch) {
  const { error } = await db.from('countdowns').update(patch).eq('id', c.id);
  if (error) fail('儲存', error);
  load();
}

function rename(c) {
  const title = prompt('新的名稱：', c.title)?.trim();
  if (title && title !== c.title) update(c, { title });
}

async function remove(c) {
  if (!confirm(`確定要刪除「${c.title}」嗎？`)) return;
  const { error } = await db.from('countdowns').delete().eq('id', c.id);
  if (error) return fail('刪除', error);
  load();
}
