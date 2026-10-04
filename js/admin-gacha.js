// 後台：獎品庫存、懲罰管理、抽獎紀錄
import { friendlyError } from './db.js';
import { SEATS, el, toast } from './ui.js';

const $ = (id) => document.getElementById(id);

let db = null;
let prizes = [];
let punishments = [];
let pending = [];        // 待完成的懲罰
let completed = [];      // 最近完成的懲罰
let draws = [];          // 抽獎紀錄
let filter = { kind: 'all', seat: 'all' };

const fail = (what, error) => toast(`${what}失敗：${friendlyError(error)}`, { tone: 'error', seconds: 5 });

const timeFmt = new Intl.DateTimeFormat('zh-TW', {
  month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
});
const when = (iso) => timeFmt.format(new Date(iso));

const pct = (w, total) => total > 0 ? `${(w / total * 100).toFixed(w / total < 0.1 ? 1 : 0)}%` : '0%';

// ---------- 讀取 ----------
export async function load() {
  const [p, q, pend, done, d] = await Promise.all([
    db.from('prizes').select('*').order('id'),
    db.from('punishments').select('*').order('id'),
    db.from('draws').select('*').eq('kind', 'punish').is('completed_at', null).is('undone_at', null)
      .order('created_at'),
    db.from('draws').select('*').eq('kind', 'punish').not('completed_at', 'is', null).is('undone_at', null)
      .order('completed_at', { ascending: false }).limit(30),
    db.from('draws').select('*').order('created_at', { ascending: false }).limit(300),
  ]);
  const err = [p, q, pend, done, d].find((r) => r.error)?.error;
  if (err) return fail('讀取', err);
  prizes = p.data; punishments = q.data; pending = pend.data; completed = done.data; draws = d.data;
  renderPrizes();
  renderPunish();
  renderDraws();
}

export function init(client) {
  db = client;

  $('prize-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const row = {
      name: $('prize-name').value.trim(),
      stock: toInt($('prize-stock').value),
      weight: toNum($('prize-weight').value, 1),
      low_stock_alert: toInt($('prize-alert').value, 2),
    };
    if (!row.name) return;
    const { error } = await db.from('prizes').insert(row);
    if (error) return fail('新增', error);
    e.target.reset();
    toast(`已新增獎品「${row.name}」`);
    load();
  });

  $('punish-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const row = { name: $('punish-name').value.trim(), weight: toNum($('punish-weight').value, 1) };
    if (!row.name) return;
    const { error } = await db.from('punishments').insert(row);
    if (error) return fail('新增', error);
    e.target.reset();
    toast(`已新增懲罰項目「${row.name}」`);
    load();
  });

  $('draw-kind').addEventListener('change', (e) => { filter.kind = e.target.value; renderDraws(); });
  $('draw-seat').replaceChildren(el('option', { value: 'all' }, '全部座號'),
    ...SEATS.map((s) => el('option', { value: s }, `${s} 號`)));
  $('draw-seat').addEventListener('change', (e) => { filter.seat = e.target.value; renderDraws(); });
}

function toInt(v, fallback = 0) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : fallback;
}

// 數字欄位：改完（離開欄位或按 Enter）就自動存檔
function numField(label, value, onSave, { step = 1 } = {}) {
  const input = el('input', { type: 'number', min: 0, step, value, inputmode: 'decimal' });
  input.addEventListener('change', () => onSave(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  return el('label', { class: 'field' }, el('span', {}, label), input);
}

async function update(table, id, patch, what = '儲存') {
  const { error } = await db.from(table).update(patch).eq('id', id);
  if (error) fail(what, error);
  load();
}

async function rename(table, item) {
  const name = prompt('新的名稱：', item.name)?.trim();
  if (!name || name === item.name) return;
  update(table, item.id, { name }, '改名');
}

// ---------- 🎁 獎品 ----------
function renderPrizes() {
  const active = prizes.filter((p) => p.active);
  const removed = prizes.filter((p) => !p.active);
  const eligible = active.filter((p) => p.stock > 0 && p.weight > 0);
  const total = eligible.reduce((s, p) => s + Number(p.weight), 0);
  const low = active.filter((p) => p.stock <= p.low_stock_alert);

  $('low-stock').hidden = !low.length;
  $('low-stock').textContent = low.length
    ? `⚠️ 庫存不足：${low.map((p) => `${p.name}（剩 ${p.stock}）`).join('、')}`
    : '';
  setTabBadge('prizes', low.length);

  $('prize-list').replaceChildren(...(active.length ? active.map((p) => {
    const inPool = p.stock > 0 && p.weight > 0;
    return el('article', { class: `item-card${p.stock <= p.low_stock_alert ? ' low' : ''}` },
      el('header', { class: 'item-head' },
        el('h3', {}, p.name),
        el('span', { class: `chance${inPool ? '' : ' off'}` },
          inPool ? `抽中機率 ${pct(Number(p.weight), total)}` : (p.stock ? '比重為 0，不參加' : '沒庫存，暫不參加'))),
      el('div', { class: 'item-fields' },
        el('div', { class: 'stock-field' },
          numField('庫存', p.stock, (v) => update('prizes', p.id, { stock: toInt(v, p.stock) })),
          el('button', { class: 'btn small', type: 'button', onclick: () => restock(p) }, '補貨')),
        numField('比重', p.weight, (v) => update('prizes', p.id, { weight: toNum(v, Number(p.weight)) }), { step: 'any' }),
        numField('剩幾個時提醒', p.low_stock_alert,
          (v) => update('prizes', p.id, { low_stock_alert: toInt(v, p.low_stock_alert) }))),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => rename('prizes', p) }, '改名'),
        el('button', {
          class: 'btn small ghost', type: 'button',
          onclick: () => confirm(`確定要移除「${p.name}」嗎？之後可以在「已移除的獎品」還原。`)
            && update('prizes', p.id, { active: false }, '移除'),
        }, '移除')));
  }) : [el('p', { class: 'empty small' }, '還沒有獎品，從上面新增一個吧。')]));

  $('prize-removed').replaceChildren(...(removed.length
    ? removed.map((p) => el('div', { class: 'archived-row' },
        el('span', {}, p.name),
        el('button', { class: 'btn small', type: 'button', onclick: () => update('prizes', p.id, { active: true }, '還原') }, '還原')))
    : [el('p', { class: 'muted' }, '沒有已移除的獎品')]));
}

async function restock(p) {
  const v = prompt(`「${p.name}」要補幾個？`, '5');
  if (v == null) return;
  const n = toInt(v, 0);
  if (!n) return;
  // 以資料庫最新數字為準，避免剛好有人在抽
  const { data, error } = await db.from('prizes').select('stock').eq('id', p.id).single();
  if (error) return fail('補貨', error);
  await update('prizes', p.id, { stock: data.stock + n }, '補貨');
  toast(`「${p.name}」補了 ${n} 個`);
}

// ---------- ⚠️ 懲罰 ----------
function renderPunish() {
  setTabBadge('punish', pending.length);

  $('pending-list').replaceChildren(...(pending.length ? pending.map((d) =>
    el('div', { class: 'pending-row' },
      el('span', { class: 'pending-seat' }, `${d.seat} 號`),
      el('span', { class: 'pending-name' }, d.item_name),
      el('span', { class: 'muted pending-time' }, when(d.created_at)),
      el('button', {
        class: 'btn small primary', type: 'button',
        onclick: () => setDone(d, true),
      }, '完成 ✓')))
    : [el('p', { class: 'muted' }, '目前沒有待完成的懲罰 👍')]));

  $('completed-list').replaceChildren(...(completed.length ? completed.map((d) =>
    el('div', { class: 'archived-row' },
      el('span', {}, `${d.seat} 號・${d.item_name}`),
      el('span', { class: 'muted' }, `${when(d.completed_at)} 完成`),
      el('button', { class: 'btn small ghost', type: 'button', onclick: () => setDone(d, false) }, '改回未完成')))
    : [el('p', { class: 'muted' }, '還沒有完成的紀錄')]));

  const active = punishments.filter((p) => p.active);
  const removed = punishments.filter((p) => !p.active);
  const total = active.filter((p) => p.weight > 0).reduce((s, p) => s + Number(p.weight), 0);

  $('punish-list').replaceChildren(...(active.length ? active.map((p) =>
    el('article', { class: 'item-card' },
      el('header', { class: 'item-head' },
        el('h3', {}, p.name),
        el('span', { class: `chance${p.weight > 0 ? '' : ' off'}` },
          p.weight > 0 ? `抽中機率 ${pct(Number(p.weight), total)}` : '比重為 0，不參加')),
      el('div', { class: 'item-fields' },
        numField('比重', p.weight, (v) => update('punishments', p.id, { weight: toNum(v, Number(p.weight)) }), { step: 'any' })),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn small ghost', type: 'button', onclick: () => rename('punishments', p) }, '改名'),
        el('button', {
          class: 'btn small ghost', type: 'button',
          onclick: () => confirm(`確定要移除「${p.name}」嗎？`) && update('punishments', p.id, { active: false }, '移除'),
        }, '移除'))))
    : [el('p', { class: 'empty small' }, '還沒有懲罰項目，從上面新增一個吧。')]));

  $('punish-removed').replaceChildren(...(removed.length
    ? removed.map((p) => el('div', { class: 'archived-row' },
        el('span', {}, p.name),
        el('button', { class: 'btn small', type: 'button', onclick: () => update('punishments', p.id, { active: true }, '還原') }, '還原')))
    : [el('p', { class: 'muted' }, '沒有已移除的項目')]));
}

async function setDone(d, done) {
  const { error } = await db.rpc('set_punishment_done', { p_draw: d.id, p_done: done });
  if (error) return fail('更新', error);
  toast(done ? `${d.seat} 號「${d.item_name}」已完成` : '已改回未完成');
  load();
}

// ---------- 🧾 抽獎紀錄 ----------
function renderDraws() {
  const rows = draws.filter((d) =>
    (filter.kind === 'all' || d.kind === filter.kind) &&
    (filter.seat === 'all' || d.seat === Number(filter.seat)));

  $('draw-list').replaceChildren(...(rows.length ? rows.map((d) => {
    const state = d.undone_at ? '已撤銷'
      : d.kind === 'punish' ? (d.completed_at ? '已完成' : '待完成') : '';
    return el('div', { class: `log-row${d.undone_at ? ' undone' : ''}` },
      el('span', { class: 'muted log-time' }, when(d.created_at)),
      el('span', { class: 'log-seat' }, `${d.seat} 號`),
      el('span', { class: 'log-item' }, d.kind === 'reward' ? '😇 ' : '😈 ', d.item_name),
      el('span', { class: 'log-state' }, state),
      d.undone_at ? el('span') : el('button', {
        class: 'btn small ghost', type: 'button', onclick: () => undoDraw(d),
      }, '撤銷'));
  }) : [el('p', { class: 'muted' }, '沒有符合的紀錄')]));
}

async function undoDraw(d) {
  const extra = d.kind === 'reward' ? '\n獎品「' + d.item_name + '」的庫存會自動加回 1 個。' : '';
  if (!confirm(`確定要撤銷這筆嗎？\n${d.seat} 號抽到「${d.item_name}」${extra}`)) return;
  const { error } = await db.rpc('undo_draw', { p_draw: d.id });
  if (error) return fail('撤銷', error);
  toast('已撤銷');
  load();
}

function setTabBadge(tab, n) {
  const b = document.querySelector(`.tab[data-tab="${tab}"] .tab-badge`);
  if (!b) return;
  b.hidden = !n;
  b.textContent = n;
}
